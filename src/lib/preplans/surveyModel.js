/**
 * Preplan field surveys (pure, no Firestore).
 *
 * A survey is an assignment to go and check a preplan on site. It is kept apart
 * from the preplan revision: the surveyor records a checklist, observations,
 * photos, proposed corrections and inspection referrals on the survey, and a
 * preplan supervisor accepts it into a new draft revision (or records it as a
 * verification when nothing changed). The approved plan never changes from the field.
 *
 * Stored at departments/{id}/preplanSurveys/{surveyId}.
 */
import { localDateKey } from "./localDate.js";

export const SURVEY_STATUSES = Object.freeze(["assigned", "in_progress", "submitted", "returned", "accepted", "cancelled"]);
export const SURVEY_STATUS_LABELS = Object.freeze({
  assigned: "Assigned",
  in_progress: "In progress",
  submitted: "Waiting for review",
  returned: "Returned to surveyor",
  accepted: "Accepted",
  cancelled: "Cancelled",
});
/** Statuses the surveyor still works in. */
export const OPEN_SURVEY_STATUSES = Object.freeze(["assigned", "in_progress", "returned"]);

export const CHECK_RESULTS = Object.freeze([
  { id: "", label: "Not answered" },
  { id: "confirmed", label: "Matches the plan" },
  { id: "changed", label: "Changed" },
  { id: "not_checked", label: "Couldn't check" },
  { id: "na", label: "Doesn't apply" },
]);

export const OBSERVATION_CATEGORIES = Object.freeze([
  { id: "general", label: "General" },
  { id: "access", label: "Access / Knox / gates" },
  { id: "water", label: "Water supply / FDC" },
  { id: "systems", label: "Fire protection systems" },
  { id: "hazard", label: "Hazard" },
  { id: "utilities", label: "Utilities" },
  { id: "layout", label: "Layout / floor plan" },
]);

/**
 * Standard checklist when the department hasn't set one. Groups follow the spec:
 * building information, floor plan and equipment verification, plus access and water.
 */
export const DEFAULT_SURVEY_CHECKLIST = Object.freeze([
  { id: "bldg-address", group: "Building information", label: "Address, name and business match" },
  { id: "bldg-construction", group: "Building information", label: "Construction type, stories and roof" },
  { id: "bldg-occupancy", group: "Building information", label: "Occupancy use and occupant load" },
  { id: "bldg-contacts", group: "Building information", label: "Emergency and after-hours contacts" },
  { id: "plan-layout", group: "Floor plan", label: "Walls, rooms and room names match" },
  { id: "plan-exits", group: "Floor plan", label: "Exits, stairs and elevators" },
  { id: "plan-symbols", group: "Floor plan", label: "Symbols are where the equipment is" },
  { id: "equip-sprinkler", group: "Equipment", label: "Sprinkler / standpipe risers and FDC" },
  { id: "equip-alarm", group: "Equipment", label: "Fire alarm panel and annunciator" },
  { id: "equip-knox", group: "Equipment", label: "Knox box and keys" },
  { id: "equip-utilities", group: "Equipment", label: "Utility shutoffs (gas, electric, water)" },
  { id: "equip-hazmat", group: "Equipment", label: "Hazardous materials storage" },
  { id: "site-access", group: "Access and water", label: "Apparatus access and staging" },
  { id: "site-hydrants", group: "Access and water", label: "Nearest hydrants and water supply" },
]);

export const MAX_OBSERVATIONS = 100;
export const MAX_PHOTOS = 40;
export const MAX_REFERRALS = 20;

function text(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, max);
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function newSurveyItemId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A checklist as typed in Config Studio: one item per line, "Group: item". */
export function parseChecklistText(value) {
  const out = [];
  const seen = new Set();
  let group = "General";
  for (const raw of String(value || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // A line ending in ":" starts a group.
    if (line.endsWith(":")) { group = text(line.slice(0, -1), 60) || "General"; continue; }
    const split = line.indexOf(":");
    const itemGroup = split > 0 ? text(line.slice(0, split), 60) : group;
    const label = text(split > 0 ? line.slice(split + 1) : line, 160);
    if (!label) continue;
    let id = `${slug(itemGroup)}-${slug(label)}`;
    while (seen.has(id)) id = `${id}-x`;
    seen.add(id);
    out.push({ id, group: itemGroup || "General", label });
  }
  return out.slice(0, 80);
}

export function checklistToText(items = []) {
  const lines = [];
  let group = null;
  for (const item of items) {
    if (item.group !== group) { group = item.group; lines.push(`${group}:`); }
    lines.push(`  ${item.label}`);
  }
  return lines.join("\n");
}

function cleanChecklist(items) {
  if (!Array.isArray(items)) return null;
  const out = items
    .map((row) => ({ id: text(row?.id, 80), group: text(row?.group, 60) || "General", label: text(row?.label, 160) }))
    .filter((row) => row.id && row.label);
  return out.length ? out : null;
}

/** Department survey checklists: a standard one plus one per preplan template. */
export function normalizeSurveySettings(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const byTemplate = {};
  for (const [templateId, items] of Object.entries(data.byTemplate || {})) {
    const clean = cleanChecklist(items);
    if (clean) byTemplate[text(templateId, 120)] = clean;
  }
  return {
    standard: cleanChecklist(data.standard) || DEFAULT_SURVEY_CHECKLIST.map((row) => ({ ...row })),
    byTemplate,
    defaultDueDays: Math.max(1, Math.min(Number(data.defaultDueDays) || 30, 365)),
  };
}

/** The checklist a new survey of this preplan uses (copied onto the survey). */
export function checklistForPreplan(settings, preplan = {}) {
  const clean = normalizeSurveySettings(settings);
  return (clean.byTemplate[preplan.templateId] || clean.standard).map((row) => ({ ...row }));
}

function cleanPoint(raw) {
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (!lat && !lng)) return null;
  const accuracy = Number(raw?.accuracyMeters);
  return {
    lat: Math.round(lat * 1e7) / 1e7,
    lng: Math.round(lng * 1e7) / 1e7,
    accuracyMeters: Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null,
    capturedAt: text(raw?.capturedAt, 40),
  };
}

function cleanList(raw, max, map) {
  return (Array.isArray(raw) ? raw : []).map(map).filter(Boolean).slice(0, max);
}

export function normalizeSurvey(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const checklist = cleanChecklist(data.checklist) || DEFAULT_SURVEY_CHECKLIST.map((row) => ({ ...row }));
  const results = {};
  for (const item of checklist) {
    const row = data.results?.[item.id] || {};
    const result = CHECK_RESULTS.some((r) => r.id === row.result) ? row.result : "";
    results[item.id] = { result, note: text(row.note, 1000) };
  }
  const proposedAnswers = {};
  for (const [key, value] of Object.entries(data.proposedAnswers || {})) {
    const cleanKey = text(key, 80);
    if (cleanKey && !/[./]/.test(cleanKey)) proposedAnswers[cleanKey] = text(value, 4000);
  }
  return {
    id: text(data.id, 120),
    preplanId: text(data.preplanId, 120),
    preplanNumber: text(data.preplanNumber, 60),
    facilityName: text(data.facilityName, 200),
    address: text(data.address, 300),
    occupancyId: text(data.occupancyId, 120),
    templateId: text(data.templateId, 120),
    baseRevisionId: text(data.baseRevisionId, 120),
    status: SURVEY_STATUSES.includes(data.status) ? data.status : "assigned",
    assignedStation: text(data.assignedStation, 80),
    assignedShift: text(data.assignedShift, 80),
    assignedUserIds: cleanList(data.assignedUserIds, 20, (v) => text(v, 128) || null),
    assignedUserNames: cleanList(data.assignedUserNames, 20, (v) => text(v, 120) || null),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(data.dueDate || "")) ? data.dueDate : "",
    instructions: text(data.instructions, 2000),
    checklist,
    results,
    proposedAnswers,
    observations: cleanList(data.observations, MAX_OBSERVATIONS, (row) => {
      const note = text(row?.note, 2000);
      if (!note) return null;
      return {
        id: text(row.id, 80) || newSurveyItemId("obs"),
        category: OBSERVATION_CATEGORIES.some((c) => c.id === row.category) ? row.category : "general",
        note,
        location: cleanPoint(row.location),
        photoIds: cleanList(row.photoIds, 10, (v) => text(v, 80) || null),
        createdBy: text(row.createdBy, 128),
        createdByName: text(row.createdByName, 120),
        createdAt: text(row.createdAt, 40),
      };
    }),
    photos: cleanList(data.photos, MAX_PHOTOS, (row) => {
      const storagePath = text(row?.storagePath, 500);
      if (!storagePath) return null;
      return {
        id: text(row.id, 80) || newSurveyItemId("pho"),
        storagePath,
        downloadUrl: text(row.downloadUrl, 2000),
        fileName: text(row.fileName, 200),
        contentType: text(row.contentType, 80),
        size: Number(row.size) || 0,
        caption: text(row.caption, 300),
        location: cleanPoint(row.location),
        uploadedBy: text(row.uploadedBy, 128),
        uploadedAt: text(row.uploadedAt, 40),
      };
    }),
    referrals: cleanList(data.referrals, MAX_REFERRALS, (row) => {
      const reason = text(row?.reason, 2000);
      if (!reason) return null;
      return {
        id: text(row.id, 80) || newSurveyItemId("ref"),
        reason,
        urgency: ["routine", "soon", "urgent"].includes(row.urgency) ? row.urgency : "routine",
        createdBy: text(row.createdBy, 128),
        createdByName: text(row.createdByName, 120),
        createdAt: text(row.createdAt, 40),
      };
    }),
    notes: text(data.notes, 4000),
    startedAt: text(data.startedAt, 40),
    startedBy: text(data.startedBy, 128),
    submittedAt: text(data.submittedAt, 40),
    submittedBy: text(data.submittedBy, 128),
    submittedByName: text(data.submittedByName, 120),
    reviewNotes: text(data.reviewNotes, 2000),
    reviewedAt: text(data.reviewedAt, 40),
    reviewedBy: text(data.reviewedBy, 128),
    reviewedByName: text(data.reviewedByName, 120),
    resultRevisionId: text(data.resultRevisionId, 120),
    outcome: ["revision", "verification", ""].includes(data.outcome) ? data.outcome : "",
    assignedBy: text(data.assignedBy, 128),
    assignedByName: text(data.assignedByName, 120),
    createdAt: text(data.createdAt, 40),
    updatedAt: text(data.updatedAt, 40),
    version: Number(data.version) || 0,
  };
}

/** Is this survey for this person: named on it, or for their station and shift? */
export function surveyIsFor(survey, me = {}) {
  if (!survey || !me.uid) return false;
  if (survey.assignedUserIds.includes(me.uid)) return true;
  if (!survey.assignedStation || survey.assignedStation !== me.station) return false;
  return !survey.assignedShift || survey.assignedShift === me.shift;
}

/** Surveyor may record results while it is open and theirs. */
export function canWorkOnSurvey(survey, me = {}) {
  return Boolean(me.canConduct) && OPEN_SURVEY_STATUSES.includes(survey?.status) && surveyIsFor(survey, me);
}

export function dueState(survey, now = new Date()) {
  if (!survey?.dueDate || !OPEN_SURVEY_STATUSES.includes(survey.status)) return "";
  const today = localDateKey(now);
  if (survey.dueDate < today) return "overdue";
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 7);
  return survey.dueDate <= localDateKey(soon) ? "due_soon" : "";
}

/** What still stops the surveyor from submitting. */
export function submissionProblems(survey) {
  const problems = [];
  const unanswered = survey.checklist.filter((item) => !survey.results[item.id]?.result);
  if (unanswered.length) problems.push(`${unanswered.length} checklist item${unanswered.length === 1 ? " has" : "s have"} no answer.`);
  const unexplained = survey.checklist.filter((item) => {
    const row = survey.results[item.id];
    return ["changed", "not_checked"].includes(row?.result) && !row.note;
  });
  if (unexplained.length) problems.push(`Say what changed, or why it couldn't be checked, for ${unexplained.length} item${unexplained.length === 1 ? "" : "s"}.`);
  return problems;
}

/** Counts for the review screen and the list. */
export function surveyCounts(survey) {
  const counts = { confirmed: 0, changed: 0, not_checked: 0, na: 0, unanswered: 0 };
  for (const item of survey.checklist) {
    const result = survey.results[item.id]?.result;
    if (result) counts[result] += 1; else counts.unanswered += 1;
  }
  return {
    ...counts,
    proposed: Object.keys(survey.proposedAnswers).length,
    observations: survey.observations.length,
    photos: survey.photos.length,
    referrals: survey.referrals.length,
  };
}

/**
 * Nothing changed: every item matches or doesn't apply, nothing proposed. Such
 * a survey can be accepted as a field verification instead of a new revision.
 */
export function surveyFoundNoChanges(survey) {
  const c = surveyCounts(survey);
  return c.unanswered === 0 && c.changed === 0 && c.not_checked === 0 && c.proposed === 0;
}

/** Proposed corrections next to what the plan says now (only real changes). */
export function proposedChanges(survey, currentAnswers = {}, fields = []) {
  const labelOf = new Map(fields.map((field) => [field.key, field.label]));
  return Object.entries(survey.proposedAnswers)
    .map(([key, proposed]) => ({ key, label: labelOf.get(key) || key, current: text(currentAnswers[key], 4000), proposed }))
    .filter((row) => row.proposed !== row.current);
}

/** Fields the surveyor may propose corrections to (no restricted ones). */
export function proposableFields(sections = [], isSensitive = () => false) {
  return sections.flatMap((section) => (section.fields || [])
    .filter((field) => field.key && !isSensitive(field, section) && ["text", "long_text", "number", "select", "dropdown", "date"].includes(field.type || "text"))
    .map((field) => ({ key: field.key, label: field.label || field.key, section: section.title || "", type: field.type || "text", options: field.options || [] })));
}

/** The order lists show surveys in: overdue first, then by due date. */
export function sortSurveys(rows = [], now = new Date()) {
  const rank = { overdue: 0, due_soon: 1, "": 2 };
  const statusRank = { returned: 0, in_progress: 1, assigned: 2, submitted: 3, accepted: 4, cancelled: 5 };
  return [...rows].sort((a, b) => (statusRank[a.status] - statusRank[b.status])
    || (rank[dueState(a, now)] - rank[dueState(b, now)])
    || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))
    || String(a.facilityName).localeCompare(String(b.facilityName)));
}

/** Fields the surveyor may write (also enforced in firestore.rules). */
export const SURVEYOR_FIELDS = Object.freeze([
  "status", "results", "proposedAnswers", "observations", "photos", "referrals", "notes",
  "startedAt", "startedBy", "submittedAt", "submittedBy", "submittedByName", "assignedUserIds", "assignedUserNames",
  "updatedAt", "version",
]);
