/**
 * Change-driven preplan review tasks.
 *
 * Occupancy and inspection records stay authoritative; a preplan is never
 * edited from here. When something operationally significant changes, preplan
 * staff get a review task (departments/<id>/preplanReviewTasks) and decide
 * whether the preplan needs a new revision.
 *
 *   occupancy updated   tracked fields changed (address, classification, owner,
 *                       contacts, construction, fire protection, access, size,
 *                       closure) -> one task per live preplan for the occupancy
 *   occupancy deleted   -> one task per live preplan
 *   violation created   only when it matches the department's review rules
 *                       (citation prefixes / keywords / minimum severity)
 *   violation corrected only when a preplan alert or finding link refers to it
 *   task created        (any source, people's requests too) -> an in-app
 *                       notification for the preplan's planner and reviewer,
 *                       or the department's preplan approvers when neither is set
 *
 * Idempotent: task ids are deterministic (source, source id, preplan, a hash of
 * the change) and written with create(), so a retried or duplicate delivery is
 * a no-op. No loops: these handlers only write preplanReviewTasks, which no
 * trigger watches.
 */
const crypto = require("node:crypto");

const TASKS = "preplanReviewTasks";
const RETIRED_PREPLAN_STATUSES = new Set(["archived", "cancelled"]);
const CLOSED_VIOLATION_STATUSES = new Set(["closed", "corrected", "resolved", "abated", "complied"]);

/**
 * Occupancy fields a preplan depends on. Bookkeeping (timeline, notes, last /
 * next inspection dates, assigned inspector, updatedAt) is left out on purpose:
 * routine inspection activity must not raise review tasks.
 */
const OCCUPANCY_FIELDS = [
  { label: "Address", keys: ["address", "city", "state", "zip"] },
  { label: "Map location", keys: ["latitude", "longitude"], kind: "coordinate" },
  { label: "Name / business", keys: ["name", "businessName"] },
  { label: "Occupancy classification", keys: ["occupancyType", "type"] },
  { label: "Hazard level", keys: ["hazard", "riskLevel"] },
  { label: "Construction", keys: ["constructionType", "stories", "squareFeet"] },
  { label: "Occupant load", keys: ["occupancyLoad"] },
  { label: "Sprinkler system", keys: ["sprinkler"] },
  { label: "Fire alarm", keys: ["alarm"] },
  { label: "Knox box / access", keys: ["knoxBox", "accessNotes", "gateCode"] },
  { label: "Emergency contacts", keys: ["contacts", "primaryContactName", "primaryContactPhone"], kind: "contacts" },
  { label: "Status", keys: ["status"] },
];

/** Defaults when a department hasn't saved its own rules (preplanSettings/reviewRules). */
const DEFAULT_REVIEW_RULES = Object.freeze({
  occupancyChanges: true,
  violationFindings: true,
  // IFC chapters: 5 fire service features (access, Knox, hydrants), 6 building
  // services (hoods, electrical rooms), 9 fire protection systems, 10 means of
  // egress, 50+ hazardous materials. Matched against the start of the citation
  // number, ignoring a code prefix such as "IFC ".
  citationPrefixes: ["5", "6", "9", "10", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67"],
  keywords: ["sprinkler", "standpipe", "alarm", "suppression", "hood", "riser", "fire pump", "fire department connection", "fdc",
    "knox", "fire lane", "access", "egress", "exit", "hazardous", "hazmat", "flammable", "combustible", "utility", "shutoff",
    "renovat", "remodel", "addition", "change of use", "change in use", "occupancy change"],
  minSeverity: "",
  correctedFindings: true,
  notifyOnNewTasks: true,
});

/** Permissions that make a member preplan staff (firestore.rules preplanWorkKeys). */
const PREPLAN_WORK_KEYS = ["editPreplans", "createPreplans", "approvePreplans", "managePreplanConfig", "editInspections"];
const LEAD_KEYS = ["approvePreplans", "managePreplanConfig"];
const MAX_RECIPIENTS = 25;

const SEVERITY_RANK = { minor: 1, low: 1, moderate: 2, medium: 2, major: 3, high: 3, serious: 3, critical: 4, severe: 4, imminent: 4 };

function text(value) {
  return value == null ? "" : String(value).trim();
}

function comparable(field, data = {}) {
  if (field.kind === "coordinate") {
    const values = field.keys.map((key) => (data[key] === "" || data[key] == null ? NaN : Number(data[key])));
    // No location: missing, not a number, or 0,0 (the occupancy form saves blank
    // coordinates as 0, and 0,0 is never a real address).
    if (values.some((value) => !Number.isFinite(value)) || values.every((value) => value === 0)) return field.keys.map(() => "");
    // ~1 m: re-saving a geocode must not count as a move.
    return values.map((value) => value.toFixed(5));
  }
  if (field.kind === "contacts") {
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];
    return [
      contacts.filter(Boolean).map((c) => [text(c.name), text(c.role), text(c.phone), text(c.email)].join("|")).sort(),
      text(data.primaryContactName),
      text(data.primaryContactPhone),
    ];
  }
  return field.keys.map((key) => text(data[key]).toLowerCase());
}

/** Labels of the tracked occupancy fields that differ. Empty when nothing relevant changed. */
function occupancyChanges(before = {}, after = {}) {
  return OCCUPANCY_FIELDS
    .filter((field) => JSON.stringify(comparable(field, before)) !== JSON.stringify(comparable(field, after)))
    .map((field) => field.label);
}

function normalizeRules(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const list = (value, fallback) => (Array.isArray(value)
    ? value.map((item) => text(item).toLowerCase()).filter(Boolean).slice(0, 100)
    : fallback);
  return {
    occupancyChanges: data.occupancyChanges !== false,
    violationFindings: data.violationFindings !== false,
    citationPrefixes: list(data.citationPrefixes, DEFAULT_REVIEW_RULES.citationPrefixes),
    keywords: list(data.keywords, DEFAULT_REVIEW_RULES.keywords),
    minSeverity: text(data.minSeverity).toLowerCase(),
    correctedFindings: data.correctedFindings !== false,
    notifyOnNewTasks: data.notifyOnNewTasks !== false,
  };
}

function citationNumber(value) {
  // "IFC 904.12.5.2" -> "904.12.5.2"; "609" -> "609"
  const match = text(value).match(/(\d[\d.]*)/);
  return match ? match[1] : "";
}

/**
 * Why a violation should prompt a preplan review, or "" when it shouldn't.
 * Citation prefixes are matched on whole chapter digits: prefix "9" matches
 * 903 and 906.1, prefix "10" matches 1013.3 but not 104.
 */
function violationReviewReason(violation = {}, rules = DEFAULT_REVIEW_RULES) {
  const rank = SEVERITY_RANK[text(violation.severity).toLowerCase()] || 0;
  const needed = SEVERITY_RANK[rules.minSeverity] || 0;
  if (needed && rank < needed) return "";

  const section = citationNumber(violation.sectionNumber || violation.codeCitation);
  const chapter = section.split(".")[0];
  const prefix = rules.citationPrefixes.find((item) => {
    if (!chapter || !item) return false;
    // A prefix names a chapter: the section's chapter digits are the prefix plus
    // two more (IFC section numbering: chapter 9 -> 9xx, chapter 10 -> 10xx).
    return chapter.startsWith(item) && chapter.length === item.length + 2;
  });
  if (prefix) return `Code section ${section} (chapter ${prefix})`;

  const haystack = [violation.name, violation.title, violation.description, violation.codeCitation, violation.category, violation.location]
    .map((value) => text(value).toLowerCase()).join(" ");
  const keyword = rules.keywords.find((item) => item && haystack.includes(item));
  return keyword ? `Mentions "${keyword}"` : "";
}

function shortHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function safeId(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
}

function taskId(source, sourceId, preplanId, fingerprint) {
  return `${source}-${safeId(sourceId)}-${safeId(preplanId)}-${safeId(fingerprint)}`.slice(0, 200);
}

async function livePreplansFor(db, departmentId, occupancyId) {
  if (!occupancyId) return [];
  const snap = await db.collection(`departments/${departmentId}/preplans`).where("occupancyId", "==", occupancyId).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => !RETIRED_PREPLAN_STATUSES.has(text(row.status)));
}

async function loadRules(db, departmentId) {
  const snap = await db.doc(`departments/${departmentId}/preplanSettings/reviewRules`).get().catch(() => null);
  return normalizeRules(snap?.exists ? snap.data() : null);
}

/** Create a task unless it already exists. Returns true when created. */
async function createTask(db, departmentId, id, record) {
  const now = new Date().toISOString();
  try {
    await db.doc(`departments/${departmentId}/${TASKS}/${id}`).create({
      id,
      status: "open",
      requestedBy: "system",
      requestedByName: "Automatic",
      automatic: true,
      createdAt: now,
      updatedAt: now,
      ...record,
    });
    return true;
  } catch (error) {
    // 6 = ALREADY_EXISTS: this change was already turned into a task.
    if (error?.code === 6 || /already exists/i.test(String(error?.message))) return false;
    throw error;
  }
}

async function tasksForPreplans(db, departmentId, preplans, build) {
  let created = 0;
  for (const preplan of preplans) {
    const { id, record } = build(preplan);
    if (await createTask(db, departmentId, id, { preplanId: preplan.id, ...record })) created += 1;
  }
  return created;
}

/** departments/{departmentId}/occupancies/{occupancyId} written. */
async function handleOccupancyWritten(db, event) {
  const { departmentId, occupancyId } = event.params;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!before) return { created: 0, reason: "new occupancy" }; // nothing to review yet

  const rules = await loadRules(db, departmentId);
  if (!rules.occupancyChanges) return { created: 0, reason: "disabled" };

  const preplans = await livePreplansFor(db, departmentId, occupancyId);
  if (!preplans.length) return { created: 0, reason: "no preplan" };

  if (!after) {
    const created = await tasksForPreplans(db, departmentId, preplans, (preplan) => ({
      id: taskId("occupancy", occupancyId, preplan.id, "deleted"),
      record: {
        source: "occupancy",
        sourceId: occupancyId,
        occupancyId,
        reason: `The occupancy record "${text(before.name) || occupancyId}" was deleted. Check whether this preplan should be archived or moved to another occupancy.`,
        changedFields: ["Occupancy deleted"],
      },
    }));
    return { created };
  }

  const changed = occupancyChanges(before, after);
  if (!changed.length) return { created: 0, reason: "no tracked change" };
  const fingerprint = shortHash(OCCUPANCY_FIELDS
    .filter((field) => changed.includes(field.label))
    .map((field) => [field.label, comparable(field, before), comparable(field, after)]));
  const name = text(after.name) || occupancyId;
  const created = await tasksForPreplans(db, departmentId, preplans, (preplan) => ({
    id: taskId("occupancy", occupancyId, preplan.id, fingerprint),
    record: {
      source: "occupancy",
      sourceId: occupancyId,
      occupancyId,
      reason: `${name}: ${changed.join(", ")} changed on the occupancy record. Check whether the preplan still matches.`,
      changedFields: changed,
    },
  }));
  return { created };
}

/** departments/{departmentId}/violations/{violationId} written. */
async function handleViolationWritten(db, event) {
  const { departmentId, violationId } = event.params;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return { created: 0, reason: "deleted" };

  const rules = await loadRules(db, departmentId);
  const label = [text(after.codeCitation || after.sectionNumber), text(after.name || after.title || after.description)]
    .filter(Boolean).join(" · ").slice(0, 160) || violationId;

  // inspection.finding.created
  if (!before) {
    if (!rules.violationFindings) return { created: 0, reason: "disabled" };
    const why = violationReviewReason(after, rules);
    if (!why) return { created: 0, reason: "not significant" };
    const preplans = await livePreplansFor(db, departmentId, text(after.occupancyId));
    const created = await tasksForPreplans(db, departmentId, preplans, (preplan) => ({
      id: taskId("violation", violationId, preplan.id, "created"),
      record: {
        source: "violation",
        sourceId: violationId,
        occupancyId: text(after.occupancyId),
        inspectionId: text(after.inspectionId),
        violationId,
        reason: `Inspection finding ${label}. ${why}. Check whether the preplan or an operational alert needs updating.`,
        changedFields: [why],
      },
    }));
    return { created };
  }

  // inspection.finding.resolved: only when preplan records point at this finding.
  const wasClosed = CLOSED_VIOLATION_STATUSES.has(text(before.status).toLowerCase());
  const isClosed = CLOSED_VIOLATION_STATUSES.has(text(after.status).toLowerCase());
  if (wasClosed || !isClosed || !rules.correctedFindings) return { created: 0, reason: "no resolution" };

  const [alerts, links] = await Promise.all([
    db.collection(`departments/${departmentId}/preplanAlerts`).where("violationId", "==", violationId).get(),
    db.collection(`departments/${departmentId}/preplanFindingLinks`).where("violationId", "==", violationId).get(),
  ]);
  const activeAlerts = alerts.docs.map((doc) => doc.data()).filter((row) => text(row.resolutionStatus || "active") === "active");
  const preplanIds = new Set([
    ...activeAlerts.map((row) => text(row.preplanId)),
    ...links.docs.map((doc) => text(doc.data().preplanId)),
  ].filter(Boolean));
  if (!preplanIds.size) return { created: 0, reason: "not referenced" };

  let created = 0;
  for (const preplanId of preplanIds) {
    const alertCount = activeAlerts.filter((row) => text(row.preplanId) === preplanId).length;
    if (await createTask(db, departmentId, taskId("violation", violationId, preplanId, "corrected"), {
      source: "violation",
      sourceId: violationId,
      preplanId,
      occupancyId: text(after.occupancyId),
      inspectionId: text(after.inspectionId),
      violationId,
      reason: `Inspection finding ${label} was marked ${text(after.status).toLowerCase()}.`
        + (alertCount ? ` ${alertCount} current alert${alertCount === 1 ? " refers" : "s refer"} to it; resolve ${alertCount === 1 ? "it" : "them"} if the condition is gone.` : " It is linked to this preplan."),
      changedFields: ["Finding corrected"],
    })) created += 1;
  }
  return { created };
}

/**
 * Who hears about a new review task: the preplan's assigned planner and reviewer
 * while they still hold a preplan work permission; otherwise the department's
 * preplan approvers / configurers. Never the person who asked for the review.
 */
async function taskRecipients(db, departmentId, preplan, task) {
  const grants = db.collection(`departments/${departmentId}/memberGrants`);
  const holds = (data, keys) => keys.some((key) => data?.permissions?.[key] === true);
  const assigned = [...new Set([text(preplan.assignedPlannerId), text(preplan.reviewerId)].filter(Boolean))];
  const checked = await Promise.all(assigned.map(async (uid) => {
    const snap = await grants.doc(uid).get();
    return snap.exists && holds(snap.data(), PREPLAN_WORK_KEYS) ? uid : "";
  }));
  const notRequester = (uid) => uid !== text(task.requestedBy);
  // If the planner asked for the review themselves, the approvers hear about it instead.
  let uids = checked.filter(Boolean).filter(notRequester);
  if (!uids.length) {
    const leads = await Promise.all(LEAD_KEYS.map((key) => grants.where(`permissions.${key}`, "==", true).get()));
    uids = [...new Set(leads.flatMap((snap) => snap.docs.map((doc) => doc.id)))].sort().filter(notRequester);
  }
  return uids.slice(0, MAX_RECIPIENTS);
}

const TASK_SOURCE_TITLES = {
  occupancy: "occupancy record changed",
  violation: "inspection finding",
  inspection: "requested from an inspection",
  manual: "review requested",
};

/** departments/{departmentId}/preplanReviewTasks/{taskId} created. */
async function handleReviewTaskCreated(db, event) {
  const { departmentId, taskId } = event.params;
  const task = event.data?.exists === false ? null : event.data?.data?.();
  if (!task || text(task.status) !== "open" || !text(task.preplanId)) return { notified: 0, reason: "nothing to notify" };

  const rules = await loadRules(db, departmentId);
  if (!rules.notifyOnNewTasks) return { notified: 0, reason: "disabled" };

  const preplanSnap = await db.doc(`departments/${departmentId}/preplans/${task.preplanId}`).get();
  if (!preplanSnap.exists) return { notified: 0, reason: "no preplan" };
  const preplan = preplanSnap.data();
  if (RETIRED_PREPLAN_STATUSES.has(text(preplan.status))) return { notified: 0, reason: "retired preplan" };

  const recipients = await taskRecipients(db, departmentId, preplan, task);
  const reason = text(task.reason).slice(0, 240);
  const name = text(preplan.facilityName || preplan.occupancyName);
  // Automatic reasons already start with the occupancy name; don't say it twice.
  const showName = name && !reason.toLowerCase().startsWith(name.toLowerCase());
  const label = [text(preplan.preplanNumber), showName ? name : ""].filter(Boolean).join(" · ") || task.preplanId;
  const now = new Date().toISOString();
  let notified = 0;
  for (const uid of recipients) {
    // Deterministic id: a redelivered event can't notify anyone twice.
    const id = `NTF-PRT-${shortHash([taskId, uid])}`;
    try {
      await db.doc(`departments/${departmentId}/notifications/${id}`).create({
        id,
        userId: uid,
        title: `Preplan review: ${TASK_SOURCE_TITLES[text(task.source)] || "review requested"}`,
        message: `${label}. ${reason}`,
        module: "Preplans",
        recordId: text(task.preplanId),
        reviewTaskId: taskId,
        openPage: "All Preplans",
        openTab: "alerts",
        status: "unread",
        created_at: now,
      });
      notified += 1;
    } catch (error) {
      if (!(error?.code === 6 || /already exists/i.test(String(error?.message)))) throw error;
    }
  }
  return { notified };
}

module.exports = {
  DEFAULT_REVIEW_RULES,
  handleReviewTaskCreated,
  taskRecipients,
  OCCUPANCY_FIELDS,
  handleOccupancyWritten,
  handleViolationWritten,
  normalizeRules,
  occupancyChanges,
  taskId,
  violationReviewReason,
};
