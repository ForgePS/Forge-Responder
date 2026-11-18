/**
 * Firestore access for the Training module.
 *
 * Everything lives under departments/{departmentId}/… (tenant isolation is the
 * same as every other module; firestore.rules enforces it). State changes that
 * must be consistent — workflow transitions, amendments, course publication, CE
 * awards — run in transactions or batches, and every one writes an audit entry.
 *
 * The older event list (lists/hlfd-rms-training, written by the Academy sync)
 * is left untouched; Academy completions are read from it as evidence.
 */
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { writeAuditLog } from "../auditService.js";
import { createPersonnelNotification } from "../notificationService.js";
import { uniqueRecordId } from "../recordIds.js";
import { recordTotals } from "./trainingHours.js";
import { canAmend, canTransition, diffForAmendment, isEditable, submissionProblems, TRANSITIONS } from "./trainingWorkflow.js";
import { ceSourceKey } from "./trainingCe.js";

export const TRAINING_COLLECTIONS = {
  records: "trainingRecords",
  templates: "trainingTemplates",
  courses: "trainingCourses",
  sessions: "trainingSessions",
  skills: "trainingSkills",
  evaluations: "trainingEvaluations",
  taskBooks: "trainingTaskBooks",
  taskBookAssignments: "trainingTaskBookAssignments",
  requirements: "trainingRequirements",
  exemptions: "trainingExemptions",
  snapshots: "trainingComplianceSnapshots",
  ceRuleSets: "trainingCeRuleSets",
  ceAwards: "trainingCeAwards",
  ceCycles: "trainingCeCycles",
  requests: "trainingRequests",
  resources: "trainingResources",
  reservations: "trainingReservations",
  standards: "trainingStandards",
  settings: "trainingSettings",
};

const C = TRAINING_COLLECTIONS;
const AUDIT_MODULE = "Training";

function db() {
  const d = getFirestoreDb();
  if (!d) throw new Error("The database isn't available. Check your connection and try again.");
  return d;
}

function deptCol(departmentId, name) {
  return collection(db(), "departments", departmentId, name);
}

function deptDoc(departmentId, name, id) {
  return doc(db(), "departments", departmentId, name, id);
}

const nowIso = () => new Date().toISOString();

/** Firestore rejects undefined; drop it (deeply) so a stray field never fails a save. */
export function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object" && !(value instanceof Date) && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]));
  }
  return value;
}

function audit(departmentId, actor, action, recordId, summary, before = null, after = null) {
  return writeAuditLog(departmentId, {
    action, module: AUDIT_MODULE, recordId, summary, actorUid: actor?.uid || "system", actorName: actor?.name || "System", before, after,
  }).catch((error) => console.warn("Training audit write failed", error));
}

// ---------------------------------------------------------------- generic

export function subscribeTraining(departmentId, name, onData, onError) {
  if (!departmentId) { onData([]); return () => {}; }
  return onSnapshot(deptCol(departmentId, name), (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function listTraining(departmentId, name) {
  const snap = await getDocs(deptCol(departmentId, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Save a simple configuration-style document (courses drafts, skills, resources…). */
export async function saveTrainingDoc(departmentId, name, data, actor, prefix = "TRN", { create } = {}) {
  const id = data.id || uniqueRecordId(prefix);
  const isNew = create ?? !data.id;
  const payload = clean({ ...data, id, updatedAt: nowIso(), updatedBy: actor?.uid || "", ...(isNew ? { createdAt: nowIso(), createdBy: actor?.uid || "", createdByName: actor?.name || "" } : {}) });
  await setDoc(deptDoc(departmentId, name, id), payload, { merge: true });
  audit(departmentId, actor, isNew ? "create" : "update", id, `${isNew ? "Created" : "Updated"} ${name.replace(/^training/, "").toLowerCase()} ${data.title || data.name || id}`);
  return { ...payload };
}

/** Remove a configuration document (templates, standards). Records are never deleted this way. */
export async function deleteTrainingDoc(departmentId, name, id, actor, label = "") {
  if (name === C.records || name === C.ceAwards || name === C.snapshots) throw new Error("Records can't be deleted.");
  await deleteDoc(deptDoc(departmentId, name, id));
  audit(departmentId, actor, "delete", id, `Deleted ${name.replace(/^training/, "").toLowerCase()} ${label || id}`);
}

// ---------------------------------------------------------------- training records

/** Save a draft (or a returned record being corrected). Approved records go through amendRecord. */
export async function saveRecordDraft(departmentId, record, actor) {
  const id = record.id || uniqueRecordId("TR");
  const ref = deptDoc(departmentId, C.records, id);
  return runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists() ? snap.data() : null;
    if (existing && !isEditable(existing)) throw new Error("This record has been submitted or approved and can't be edited here.");
    const payload = clean({
      ...record,
      id,
      status: existing?.status || "draft",
      ...recordTotals(record),
      updatedAt: nowIso(),
      updatedBy: actor.uid,
      createdAt: existing?.createdAt || nowIso(),
      createdBy: existing?.createdBy || actor.uid,
      createdByName: existing?.createdByName || actor.name || "",
      participantIds: (record.participants || []).map((p) => String(p.personId)),
      history: existing?.history || [{ action: "created", by: actor.uid, byName: actor.name || "", at: nowIso() }],
    });
    tx.set(ref, payload);
    return payload;
  }).then((saved) => {
    audit(departmentId, actor, record.id ? "update" : "create", id, `${record.id ? "Updated" : "Created"} training record ${saved.title || id}`);
    return saved;
  });
}

/**
 * Run a workflow action (submit, approve, return, lock, reopen) in a transaction.
 * The status is re-read inside the transaction so two approvers can't both act.
 */
export async function transitionRecord(departmentId, recordId, action, actor, { reason = "", requireEvidence = false } = {}) {
  const ref = deptDoc(departmentId, C.records, recordId);
  const t = TRANSITIONS[action];
  if (t?.reasonRequired && !String(reason).trim()) throw new Error("Enter a reason so the author knows what to fix.");
  const result = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("That training record no longer exists.");
    const record = snap.data();
    const check = canTransition(record, action, actor);
    if (!check.ok) throw new Error(check.reason);
    if (action === "submit") {
      const problems = submissionProblems(record, { requireEvidence });
      if (problems.length) throw new Error(problems.join(" "));
    }
    const at = nowIso();
    const entry = clean({ action, by: actor.uid, byName: actor.name || "", at, reason: reason || undefined, fromStatus: record.status || "draft" });
    const patch = {
      status: t.to,
      updatedAt: at,
      updatedBy: actor.uid,
      history: [...(record.history || []), entry],
    };
    if (action === "submit") Object.assign(patch, { submittedBy: actor.uid, submittedByName: actor.name || "", submittedAt: at, returnReason: "" });
    if (action === "approve") Object.assign(patch, { approvedBy: actor.uid, approvedByName: actor.name || "", approvedAt: at });
    if (action === "return" || action === "reopen") Object.assign(patch, { returnReason: reason, returnedBy: actor.uid, returnedAt: at });
    if (action === "lock") Object.assign(patch, { lockedBy: actor.uid, lockedAt: at });
    tx.update(ref, patch);
    return { ...record, ...patch };
  });
  audit(departmentId, actor, `training.${action}`, recordId, `${action[0].toUpperCase()}${action.slice(1)} training record ${result.title || recordId}${reason ? `: ${reason}` : ""}`);
  if ((action === "return" || action === "reopen") && result.createdBy) {
    createNotificationForUid(departmentId, result.createdBy, {
      title: "Training record returned",
      message: `${result.title || "A training record"} was returned for correction: ${reason}`,
      recordId,
    });
  }
  return result;
}

async function createNotificationForUid(departmentId, uid, { title, message, recordId }) {
  try {
    const id = uniqueRecordId("NTF");
    await setDoc(deptDoc(departmentId, "notifications", id), { id, userId: uid, title, message, module: AUDIT_MODULE, recordId, read: false, createdAt: nowIso() });
  } catch (error) {
    console.warn("Training notification failed", error);
  }
}

/** Notify members (by personnel id) — used for assignments and reminders. */
export async function notifyPersonnel(departmentId, personnelIds = [], { title, message, recordId = "" }) {
  await Promise.all(personnelIds.map((pid) => createPersonnelNotification(departmentId, pid, { title, message, module: AUDIT_MODULE, recordId, personnelId: pid }).catch(() => null)));
}

/**
 * Amend an approved record. The record and an append-only amendment document
 * (old values, new values, reason, who, when) are written in one batch; the rules
 * require the amendment to exist for the record update to be accepted.
 */
export async function amendRecord(departmentId, recordId, changes, reason, actor) {
  if (!String(reason || "").trim()) throw new Error("Enter the reason for the amendment.");
  const ref = deptDoc(departmentId, C.records, recordId);
  const result = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("That training record no longer exists.");
    const before = snap.data();
    const check = canAmend(before, actor);
    if (!check.ok) throw new Error(check.reason);
    const after = { ...before, ...changes };
    const diff = diffForAmendment(before, after);
    if (!diff.length) throw new Error("Nothing changed.");
    const amendmentId = uniqueRecordId("AMD");
    const at = nowIso();
    tx.set(doc(ref, "amendments", amendmentId), clean({ id: amendmentId, recordId, changes: diff, reason, by: actor.uid, byName: actor.name || "", at }));
    const patch = clean({
      ...Object.fromEntries(diff.map((d) => [d.field, d.to])),
      ...recordTotals(after),
      participantIds: (after.participants || []).map((p) => String(p.personId)),
      lastAmendmentId: amendmentId,
      amendmentCount: (before.amendmentCount || 0) + 1,
      updatedAt: at,
      updatedBy: actor.uid,
      history: [...(before.history || []), { action: "amend", by: actor.uid, byName: actor.name || "", at, reason, amendmentId }],
    });
    tx.update(ref, patch);
    return { record: { ...before, ...patch }, diff };
  });
  audit(departmentId, actor, "training.amend", recordId, `Amended training record ${result.record.title || recordId}: ${reason}`, null, { changes: result.diff });
  return result.record;
}

export async function listAmendments(departmentId, recordId) {
  const snap = await getDocs(query(collection(deptDoc(departmentId, C.records, recordId), "amendments"), orderBy("at", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Drafts may be deleted by their author; anything submitted stays (it can be returned instead). */
export async function deleteDraftRecord(departmentId, recordId, actor) {
  const ref = deptDoc(departmentId, C.records, recordId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    if (snap.data().status !== "draft") throw new Error("Only drafts can be deleted.");
    tx.delete(ref);
  });
  audit(departmentId, actor, "delete", recordId, `Deleted draft training record ${recordId}`);
}

// ---------------------------------------------------------------- courses & versions

/**
 * Publish the course's current draft content as a new immutable version.
 * Training records and sessions reference { courseId, courseVersion }.
 */
export async function publishCourseVersion(departmentId, course, actor, changeNote = "") {
  const ref = deptDoc(departmentId, C.courses, course.id);
  const result = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? snap.data() : {};
    const version = (Number(current.publishedVersion) || 0) + 1;
    const content = clean({ ...course, history: undefined, publishedVersion: undefined, status: undefined });
    tx.set(doc(ref, "versions", String(version)), clean({ courseId: course.id, version, content, changeNote, publishedBy: actor.uid, publishedByName: actor.name || "", publishedAt: nowIso() }));
    tx.set(ref, clean({ ...course, publishedVersion: version, status: "published", updatedAt: nowIso(), updatedBy: actor.uid }), { merge: true });
    return version;
  });
  audit(departmentId, actor, "training.publishCourse", course.id, `Published ${course.title || course.id} version ${result}${changeNote ? `: ${changeNote}` : ""}`);
  return result;
}

export async function listCourseVersions(departmentId, courseId) {
  const snap = await getDocs(collection(deptDoc(departmentId, C.courses, courseId), "versions"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.version - a.version);
}

export async function getCourseVersion(departmentId, courseId, version) {
  const snap = await getDoc(doc(deptDoc(departmentId, C.courses, courseId), "versions", String(version)));
  return snap.exists() ? snap.data() : null;
}

// ---------------------------------------------------------------- sessions & enrollment

export function subscribeEnrollments(departmentId, sessionId, onData, onError) {
  return onSnapshot(collection(deptDoc(departmentId, C.sessions, sessionId), "enrollments"), (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function listEnrollments(departmentId, sessionId) {
  const snap = await getDocs(collection(deptDoc(departmentId, C.sessions, sessionId), "enrollments"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Enroll a member (self or by a scheduler). The doc id is the personnel id, so enrolling twice is a no-op. */
export async function enroll(departmentId, sessionId, person, actor, { assigned = false } = {}) {
  const ref = doc(deptDoc(departmentId, C.sessions, sessionId), "enrollments", String(person.id));
  await setDoc(ref, clean({ personId: String(person.id), name: person.name || "", uid: assigned ? "" : actor.uid, status: "active", assigned, enrolledAt: nowIso(), enrolledBy: actor.uid }));
  audit(departmentId, actor, "training.enroll", sessionId, `${assigned ? "Assigned" : "Enrolled"} ${person.name || person.id} in session ${sessionId}`);
}

export async function cancelEnrollment(departmentId, sessionId, personId, actor) {
  const ref = doc(deptDoc(departmentId, C.sessions, sessionId), "enrollments", String(personId));
  await setDoc(ref, { status: "cancelled", cancelledAt: nowIso(), cancelledBy: actor.uid }, { merge: true });
  audit(departmentId, actor, "training.unenroll", sessionId, `Cancelled enrollment of ${personId} in session ${sessionId}`);
}

/** Create a series of sessions (recurrence) in one batch. */
export async function createSessions(departmentId, sessions, actor) {
  const batch = writeBatch(db());
  const seriesId = sessions.length > 1 ? uniqueRecordId("SER") : "";
  const saved = sessions.map((s) => {
    const id = uniqueRecordId("SES");
    const payload = clean({ ...s, id, seriesId: seriesId || undefined, status: "scheduled", createdAt: nowIso(), createdBy: actor.uid, createdByName: actor.name || "", updatedAt: nowIso() });
    batch.set(deptDoc(departmentId, C.sessions, id), payload);
    return payload;
  });
  await batch.commit();
  audit(departmentId, actor, "create", saved[0]?.id || "", `Scheduled ${saved.length} training session${saved.length === 1 ? "" : "s"}: ${sessions[0]?.title || ""}`);
  return saved;
}

// ---------------------------------------------------------------- skills evaluations

export async function saveEvaluation(departmentId, evaluation, actor) {
  const id = evaluation.id || uniqueRecordId("EVAL");
  const payload = clean({ ...evaluation, id, evaluatorUid: actor.uid, evaluatorName: actor.name || "", createdAt: evaluation.createdAt || nowIso(), updatedAt: nowIso(), status: evaluation.status || "submitted" });
  await setDoc(deptDoc(departmentId, C.evaluations, id), payload);
  audit(departmentId, actor, "training.evaluate", id, `Skills evaluation ${evaluation.skillTitle || ""} for ${evaluation.personName || evaluation.personId}: ${evaluation.result}`);
  return payload;
}

export async function approveEvaluation(departmentId, evaluationId, actor) {
  const ref = deptDoc(departmentId, C.evaluations, evaluationId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("That evaluation no longer exists.");
    const ev = snap.data();
    if (ev.status !== "submitted") throw new Error("Only submitted evaluations can be approved.");
    if (ev.evaluatorUid === actor.uid) throw new Error("Someone other than the evaluator must approve the result.");
    tx.update(ref, { status: "approved", approvedBy: actor.uid, approvedByName: actor.name || "", approvedAt: nowIso() });
  });
  audit(departmentId, actor, "training.approveEvaluation", evaluationId, `Approved skills evaluation ${evaluationId}`);
}

// ---------------------------------------------------------------- CE credit

/**
 * Award CE credit. The document id is derived from (person, learning source), so
 * the same source can never be awarded twice to the same person: the create
 * fails if it already exists (the rules forbid overwriting an award).
 */
export function ceAwardId(personId, award) {
  const key = `${personId}|${ceSourceKey(award)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `CE-${String(personId).replace(/[^A-Za-z0-9_-]/g, "")}-${h.toString(36)}`;
}

export async function awardCeCredit(departmentId, award, actor) {
  const id = ceAwardId(award.personId, award);
  const ref = deptDoc(departmentId, C.ceAwards, id);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error(snap.data().status === "voided" ? "This learning activity was credited before and voided. A CE approver must review it; it can't be re-entered." : "This learning activity is already credited to this member for CE. Duplicate credit isn't allowed.");
    tx.set(ref, clean({ ...award, id, status: award.status || "pending", createdAt: nowIso(), createdBy: actor.uid, createdByName: actor.name || "" }));
  });
  audit(departmentId, actor, "training.ceAward", id, `CE credit ${award.creditHours} h (${award.component}) for ${award.personName || award.personId}`);
  return id;
}

export async function setCeAwardStatus(departmentId, awardId, status, actor, note = "") {
  const ref = deptDoc(departmentId, C.ceAwards, awardId);
  await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("That CE award no longer exists.");
    if (status === "approved" && snap.data().createdBy === actor.uid) throw new Error("Someone other than the person who entered the credit must approve it.");
    tx.update(ref, clean({ status, reviewedBy: actor.uid, reviewedByName: actor.name || "", reviewedAt: nowIso(), reviewNote: note || undefined }));
  });
  audit(departmentId, actor, `training.ce.${status}`, awardId, `CE award ${awardId} ${status}${note ? `: ${note}` : ""}`);
}

// ---------------------------------------------------------------- requirements & compliance

/** Save a requirement rule. Editing creates a new version; the previous one is kept in versions/. */
export async function saveRequirement(departmentId, rule, actor) {
  const id = rule.id || uniqueRecordId("REQ");
  const ref = deptDoc(departmentId, C.requirements, id);
  const saved = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    const version = prev ? (Number(prev.version) || 1) + 1 : 1;
    if (prev) tx.set(doc(ref, "versions", String(prev.version || 1)), clean({ ...prev, archivedAt: nowIso() }));
    const payload = clean({ ...rule, id, version, updatedAt: nowIso(), updatedBy: actor.uid, createdAt: prev?.createdAt || nowIso() });
    tx.set(ref, payload);
    return payload;
  });
  audit(departmentId, actor, rule.id ? "update" : "create", id, `Requirement ${saved.name} saved as version ${saved.version}`);
  return saved;
}

export async function saveComplianceSnapshot(departmentId, { asOf, results, label = "" }, actor) {
  const id = uniqueRecordId("CMP");
  const compact = results.filter((r) => r.status !== "not_applicable").map((r) => clean({
    personId: r.personId, ruleId: r.ruleId, ruleVersion: r.ruleVersion, status: r.status, required: r.required, earned: r.earned, explanation: r.explanation,
  }));
  await setDoc(deptDoc(departmentId, C.snapshots, id), { id, asOf, label, results: compact, createdAt: nowIso(), createdBy: actor.uid, createdByName: actor.name || "", serverTime: serverTimestamp() });
  audit(departmentId, actor, "training.snapshot", id, `Saved compliance snapshot as of ${asOf} (${compact.length} results)`);
  return id;
}

// ---------------------------------------------------------------- requests

export async function decideRequest(departmentId, requestId, decision, actor, note = "") {
  const ref = deptDoc(departmentId, C.requests, requestId);
  const result = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("That request no longer exists.");
    const req = snap.data();
    if (req.requesterUid === actor.uid && decision !== "cancelled") throw new Error("You can't decide your own request.");
    const allowed = { approved: ["submitted"], denied: ["submitted"], completed: ["approved"], cancelled: ["submitted", "approved"] };
    if (!allowed[decision]?.includes(req.status)) throw new Error(`A ${req.status} request can't be marked ${decision}.`);
    const patch = clean({ status: decision, decisions: [...(req.decisions || []), { decision, by: actor.uid, byName: actor.name || "", at: nowIso(), note: note || undefined }], updatedAt: nowIso() });
    tx.update(ref, patch);
    return { ...req, ...patch };
  });
  audit(departmentId, actor, `training.request.${decision}`, requestId, `Training request ${result.title} ${decision}${note ? `: ${note}` : ""}`);
  if (result.requesterUid && result.requesterUid !== actor.uid) {
    createNotificationForUid(departmentId, result.requesterUid, { title: `Training request ${decision}`, message: `${result.title}${note ? `: ${note}` : ""}`, recordId: requestId });
  }
  return result;
}
