/**
 * Upsert Forge Academy enrollments / completions into the department training list
 * so they appear in Employee Portal → My Training.
 */

const { readListItems, replaceListItems } = require("../listStore");

const TRAINING_LIST_KEY = "hlfd-rms-training";
const PERSONNEL_LIST_KEYS = ["hlfd-rms-personnel", "personnel"];

function normalize(value) {
  return String(value ?? "").trim();
}

function formatTrainingDate(value) {
  const raw = normalize(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return raw;
}

function enrollmentStatusLabel(status) {
  const value = normalize(status).toLowerCase();
  if (value === "cancelled" || value === "denied") return "Cancelled";
  if (value === "waitlisted") return "Waitlisted";
  if (value === "enrolled") return "In Progress";
  if (value.startsWith("pending")) return "Pending";
  return "Scheduled";
}

async function loadListItems(db, departmentId, listKey) {
  return readListItems(db, departmentId, listKey);
}

async function saveListItems(db, departmentId, listKey, items, updatedBy = "academy-sync") {
  await replaceListItems(db, departmentId, listKey, items, { updatedBy });
}

async function loadPersonnelItems(db, departmentId) {
  for (const listKey of PERSONNEL_LIST_KEYS) {
    const items = await loadListItems(db, departmentId, listKey);
    if (items.length) return items;
  }
  return [];
}

function matchPersonnel(items, { forgePersonId, rmsPersonId, studentName }) {
  const forgeId = normalize(forgePersonId);
  const localId = normalize(rmsPersonId);
  const name = normalize(studentName).toLowerCase();

  if (forgeId) {
    const byForge = items.find((p) => normalize(p.forgePersonId) === forgeId || normalize(p.id) === forgeId);
    if (byForge) return byForge;
  }
  if (localId) {
    const byLocal = items.find((p) => normalize(p.id) === localId || normalize(p.rmsPersonId) === localId);
    if (byLocal) return byLocal;
  }
  if (name) {
    const byName = items.find((p) => normalize(p.name).toLowerCase() === name);
    if (byName) return byName;
  }
  return null;
}

/**
 * Resolve RMS department(s) + local personnel for an Academy enrollment payload.
 */
async function resolveEnrollmentTargets(db, payload = {}) {
  const forgePersonId = normalize(payload.forgePersonId);
  const rmsPersonId = normalize(payload.rmsPersonId);
  const explicitDept = normalize(payload.departmentId || payload.forgeDepartmentId || payload.tenantId);
  const targets = [];

  async function pushDept(departmentId) {
    if (!departmentId || departmentId === "forge-platform") return;
    const personnel = await loadPersonnelItems(db, departmentId);
    const person = matchPersonnel(personnel, {
      forgePersonId,
      rmsPersonId,
      studentName: payload.studentName,
    });
    targets.push({
      departmentId,
      forgePersonId: forgePersonId || person?.forgePersonId || null,
      personnelId: person?.id || rmsPersonId || null,
      personName: person?.name || normalize(payload.studentName) || "",
    });
  }

  if (explicitDept && explicitDept !== "forge-platform") {
    await pushDept(explicitDept);
  }

  if (forgePersonId && !targets.length) {
    const linkSnap = await db
      .collectionGroup("academyLinks")
      .where("personId", "==", forgePersonId)
      .limit(10)
      .get();
    for (const docSnap of linkSnap.docs) {
      const data = docSnap.data() || {};
      if (data.status && data.status !== "linked") continue;
      const departmentId = normalize(data.departmentId);
      if (departmentId && !targets.some((t) => t.departmentId === departmentId)) {
        await pushDept(departmentId);
      }
    }
  }

  if (!targets.length && rmsPersonId) {
    // Fallback: scan is too expensive; require departmentId or academy link.
    return [];
  }

  return targets;
}

function buildEnrollmentTrainingRecord(payload, target) {
  const registrationId = normalize(payload.registrationId || payload.id);
  const status = enrollmentStatusLabel(payload.enrollmentStatus || payload.status);
  const isCancelled = status === "Cancelled";

  return {
    id: registrationId ? `ACA-${registrationId}` : `ACA-${Date.now()}`,
    course: normalize(payload.courseName) || "Academy course",
    category: "Academy",
    date: formatTrainingDate(payload.classStartDate || payload.startDate),
    endDate: formatTrainingDate(payload.classEndDate || payload.endDate),
    instructor: "Forge Academy",
    hours: payload.hours || "",
    attendees: 1,
    capacity: 1,
    completion: isCancelled ? 0 : Number(payload.completion || 0),
    expirationDate: "",
    status,
    members: target.personName || normalize(payload.studentName) || "",
    personnelId: target.personnelId || "",
    forgePersonId: target.forgePersonId || normalize(payload.forgePersonId) || "",
    source: "forge_academy",
    registrationId: registrationId || "",
    classId: normalize(payload.classId),
    courseNumber: normalize(payload.courseNumber),
    enrollmentStatus: normalize(payload.enrollmentStatus || payload.status),
    notes: isCancelled
      ? "Cancelled Academy registration."
      : "Registered via Forge Academy.",
    updatedAt: new Date().toISOString(),
  };
}

function buildCompletionTrainingRecord(payload, target) {
  const certificateId = normalize(payload.certificateId || payload.certificateSerial);
  const registrationId = normalize(payload.registrationId);
  const id = registrationId
    ? `ACA-${registrationId}`
    : certificateId
      ? `ACA-CERT-${certificateId}`
      : `ACA-DONE-${Date.now()}`;

  return {
    id,
    course: normalize(payload.courseName) || "Academy course",
    category: "Academy",
    date: formatTrainingDate(payload.completedDate || payload.classStartDate),
    endDate: formatTrainingDate(payload.completedDate || payload.classEndDate),
    instructor: "Forge Academy",
    hours: payload.hours || "",
    attendees: 1,
    capacity: 1,
    completion: 100,
    expirationDate: "",
    status: "Complete",
    members: target.personName || normalize(payload.studentName) || "",
    personnelId: target.personnelId || "",
    forgePersonId: target.forgePersonId || normalize(payload.forgePersonId) || "",
    source: "forge_academy",
    registrationId: registrationId || "",
    certificateSerial: normalize(payload.certificateSerial),
    courseNumber: normalize(payload.courseNumber),
    notes: "Completed via Forge Academy.",
    updatedAt: new Date().toISOString(),
  };
}

async function upsertTrainingRecord(db, departmentId, record) {
  const items = await loadListItems(db, departmentId, TRAINING_LIST_KEY);
  const idx = items.findIndex((item) => {
    if (normalize(item.id) === normalize(record.id)) return true;
    if (record.registrationId && normalize(item.registrationId) === normalize(record.registrationId)) {
      return true;
    }
    return false;
  });

  if (record.status === "Cancelled") {
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...record };
      await saveListItems(db, departmentId, TRAINING_LIST_KEY, items);
      return { action: "updated", record: items[idx] };
    }
    return { action: "skipped", reason: "cancelled_not_present" };
  }

  if (idx >= 0) {
    items[idx] = { ...items[idx], ...record };
  } else {
    items.unshift(record);
  }
  await saveListItems(db, departmentId, TRAINING_LIST_KEY, items);
  return { action: idx >= 0 ? "updated" : "created", record: idx >= 0 ? items[idx] : record };
}

/**
 * Ingest Academy registration webhook / Hub course.enrolled event.
 */
async function upsertAcademyEnrollment(db, payload = {}) {
  const targets = await resolveEnrollmentTargets(db, payload);
  if (!targets.length) {
    return {
      ok: false,
      message: "Could not resolve an RMS department/person for this Academy enrollment.",
      forgePersonId: normalize(payload.forgePersonId) || null,
    };
  }

  const results = [];
  for (const target of targets) {
    const record = buildEnrollmentTrainingRecord(payload, target);
    const saved = await upsertTrainingRecord(db, target.departmentId, record);
    results.push({ departmentId: target.departmentId, ...saved });
  }

  return { ok: true, results };
}

/**
 * Ingest Academy certificate / course.completed webhook.
 */
async function upsertAcademyCompletion(db, payload = {}) {
  const targets = await resolveEnrollmentTargets(db, payload);
  if (!targets.length) {
    return {
      ok: false,
      message: "Could not resolve an RMS department/person for this Academy completion.",
      forgePersonId: normalize(payload.forgePersonId) || null,
    };
  }

  const results = [];
  for (const target of targets) {
    const record = buildCompletionTrainingRecord(payload, target);
    const saved = await upsertTrainingRecord(db, target.departmentId, record);
    results.push({ departmentId: target.departmentId, ...saved });
  }

  return { ok: true, results };
}

/**
 * Upsert a batch of enrollments for one known department/person (pull sync).
 */
async function upsertEnrollmentsForPerson(db, departmentId, person, enrollments = []) {
  const target = {
    departmentId,
    forgePersonId: normalize(person.forgePersonId) || null,
    personnelId: normalize(person.id || person.personnelId) || null,
    personName: normalize(person.name) || "",
  };

  const results = [];
  for (const enrollment of enrollments) {
    const record = buildEnrollmentTrainingRecord(
      {
        ...enrollment,
        forgePersonId: enrollment.forgePersonId || target.forgePersonId,
        studentName: enrollment.studentName || target.personName,
      },
      target
    );
    results.push(await upsertTrainingRecord(db, departmentId, record));
  }
  return results;
}

function mapEnrollmentToPortalRow(enrollment, person = {}) {
  const registrationId = normalize(enrollment.registrationId || enrollment.id);
  return {
    id: registrationId ? `ACA-${registrationId}` : `ACA-${Date.now()}`,
    course: normalize(enrollment.courseName) || "Academy course",
    category: "Academy",
    date: formatTrainingDate(enrollment.classStartDate || enrollment.startDate),
    endDate: formatTrainingDate(enrollment.classEndDate || enrollment.endDate),
    instructor: "Forge Academy",
    hours: enrollment.hours || "",
    attendees: 1,
    capacity: 1,
    completion: Number(enrollment.completion || 0),
    status: enrollmentStatusLabel(enrollment.status || enrollment.enrollmentStatus),
    members: normalize(person.name) || normalize(enrollment.studentName) || "",
    personnelId: normalize(person.id || person.personnelId) || "",
    forgePersonId: normalize(person.forgePersonId || enrollment.forgePersonId) || "",
    source: "forge_academy",
    registrationId,
    courseNumber: normalize(enrollment.courseNumber),
    notes: "Registered via Forge Academy.",
  };
}

module.exports = {
  TRAINING_LIST_KEY,
  upsertAcademyEnrollment,
  upsertAcademyCompletion,
  upsertEnrollmentsForPerson,
  resolveEnrollmentTargets,
  mapEnrollmentToPortalRow,
  formatTrainingDate,
  enrollmentStatusLabel,
};
