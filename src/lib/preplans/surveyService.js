/**
 * Firestore access for preplan field surveys (`preplanSurveys/{id}`), with a copy
 * of the surveyor's unsent work kept on the device so a survey can be filled in
 * without a connection and sent later.
 *
 * Accepting a survey only ever starts a NEW draft revision (or records a
 * verification); the published revision is never edited from here.
 */
import { collection, doc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { createRecord, getRecord, listRecords, updateRecord } from "../firestoreService.js";
import { writeInspectionAuditLog } from "../inspections/inspectionAudit.js";
import {
  getPreplan,
  getPreplanRevision,
  recordPreplanVerification,
  registerPreplanFile,
  startPreplanRevision,
  updatePreplanRevision,
} from "../inspections/preplanService.js";
import { PREPLAN_SURVEYS_COLLECTION } from "../inspections/paths.js";
import { addDaysKey } from "./localDate.js";
import { checklistForPreplan, normalizeSurvey, normalizeSurveySettings, SURVEYOR_FIELDS } from "./surveyModel.js";

export const PREPLAN_SETTINGS_COLLECTION = "preplanSettings";
const SETTINGS_ID = "surveys";
/** Revision statuses a survey's corrections may be written into (not one under review). */
const DRAFT_REVISION_STATUSES = ["draft", "returned"];

export class SurveyConflictError extends Error {
  constructor(current) {
    super("Someone else saved this survey since you opened it.");
    this.code = "survey-conflict";
    this.current = current;
  }
}

function newSurveyId() {
  return `PPS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function audit(departmentId, actor, action, survey, summary) {
  return writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanSurvey",
    action,
    recordId: survey.id,
    summary,
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  }).catch(() => null);
}

// ---- Settings (Config Studio) ----

export async function getSurveySettings(departmentId) {
  const stored = await getRecord(departmentId, PREPLAN_SETTINGS_COLLECTION, SETTINGS_ID).catch(() => null);
  return { settings: normalizeSurveySettings(stored), saved: Boolean(stored), updatedAt: stored?.updatedAt || "", updatedByName: stored?.updatedByName || "" };
}

export async function saveSurveySettings(departmentId, settings, actor = {}) {
  const next = normalizeSurveySettings(settings);
  await updateRecord(departmentId, PREPLAN_SETTINGS_COLLECTION, SETTINGS_ID, {
    ...next,
    updatedBy: actor.actorUid || "",
    updatedByName: actor.actorName || "",
  });
  await audit(departmentId, actor, "update", { id: SETTINGS_ID }, "Field survey checklists updated");
  return next;
}

// ---- Reading ----

export async function listSurveys(departmentId) {
  const rows = await listRecords(departmentId, PREPLAN_SURVEYS_COLLECTION);
  return rows.map(normalizeSurvey);
}

export async function listSurveysForPreplan(departmentId, preplanId) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !preplanId) return [];
  const snap = await getDocs(query(collection(db, "departments", departmentId, PREPLAN_SURVEYS_COLLECTION), where("preplanId", "==", preplanId)));
  return snap.docs.map((row) => normalizeSurvey({ id: row.id, ...row.data() }));
}

export async function getSurvey(departmentId, surveyId) {
  const raw = await getRecord(departmentId, PREPLAN_SURVEYS_COLLECTION, surveyId);
  return raw ? normalizeSurvey({ id: surveyId, ...raw }) : null;
}

// ---- Assigning (preplan staff) ----

export async function assignSurvey(departmentId, preplan, assignment = {}, actor = {}) {
  if (!preplan?.id) throw new Error("Choose a preplan.");
  const users = Array.isArray(assignment.users) ? assignment.users.filter((row) => row?.uid) : [];
  if (!users.length && !assignment.station) throw new Error("Assign the survey to a station or to at least one person.");
  const { settings } = await getSurveySettings(departmentId);
  const stamp = new Date().toISOString();
  const survey = normalizeSurvey({
    id: newSurveyId(),
    preplanId: preplan.id,
    preplanNumber: preplan.preplanNumber,
    facilityName: preplan.facilityName || preplan.occupancyName,
    address: preplan.address,
    occupancyId: preplan.occupancyId,
    templateId: preplan.templateId,
    baseRevisionId: preplan.publishedRevisionId || preplan.currentRevisionId || "",
    status: "assigned",
    assignedStation: assignment.station || "",
    assignedShift: assignment.station ? assignment.shift || "" : "",
    assignedUserIds: users.map((row) => row.uid),
    assignedUserNames: users.map((row) => row.name || ""),
    dueDate: assignment.dueDate || addDaysKey(settings.defaultDueDays),
    instructions: assignment.instructions || "",
    checklist: checklistForPreplan(settings, preplan),
    assignedBy: actor.actorUid || "",
    assignedByName: actor.actorName || "",
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
  });
  await createRecord(departmentId, PREPLAN_SURVEYS_COLLECTION, survey.id, survey);
  const who = [survey.assignedStation && `${survey.assignedStation}${survey.assignedShift ? ` ${survey.assignedShift}` : ""}`, ...survey.assignedUserNames].filter(Boolean).join(", ");
  await audit(departmentId, actor, "create", survey, `Field survey of ${survey.preplanNumber} assigned to ${who}, due ${survey.dueDate}`);
  return survey;
}

export async function cancelSurvey(departmentId, survey, reason, actor = {}) {
  await updateRecord(departmentId, PREPLAN_SURVEYS_COLLECTION, survey.id, {
    status: "cancelled",
    reviewNotes: String(reason || "").slice(0, 2000),
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor.actorUid || "",
    reviewedByName: actor.actorName || "",
    version: survey.version + 1,
  });
  await audit(departmentId, actor, "cancel", survey, `Field survey of ${survey.preplanNumber} cancelled`);
}

// ---- Surveyor ----

function surveyorPatch(survey) {
  return Object.fromEntries(SURVEYOR_FIELDS.filter((key) => key in survey).map((key) => [key, survey[key]]));
}

/**
 * Save the surveyor's work. Fails with SurveyConflictError when someone else
 * saved first; the caller keeps the device copy so nothing is lost.
 */
export async function saveSurveyWork(departmentId, survey, { expectedVersion }) {
  const db = getFirestoreDb();
  if (!db) throw new Error("Saving needs a connection to Forge.");
  const ref = doc(db, "departments", departmentId, PREPLAN_SURVEYS_COLLECTION, survey.id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This survey was removed.");
    const current = normalizeSurvey({ id: snap.id, ...snap.data() });
    if (current.version !== expectedVersion) throw new SurveyConflictError(current);
    if (["submitted", "accepted", "cancelled"].includes(current.status)) {
      throw new Error(current.status === "submitted" ? "This survey was already sent for review." : "This survey is closed.");
    }
    const next = normalizeSurvey({ ...current, ...surveyorPatch(survey), version: current.version + 1, updatedAt: new Date().toISOString() });
    tx.set(ref, surveyorPatch(next), { merge: true });
    return next;
  });
}

/** Take a station survey (adds you by name, so it shows as yours). */
export function claimSurvey(survey, me) {
  if (survey.assignedUserIds.includes(me.uid)) return survey;
  return {
    ...survey,
    assignedUserIds: [...survey.assignedUserIds, me.uid].slice(0, 20),
    assignedUserNames: [...survey.assignedUserNames, me.name || ""].slice(0, 20),
  };
}

export function startedSurvey(survey, me) {
  if (survey.status !== "assigned") return survey;
  return { ...claimSurvey(survey, me), status: "in_progress", startedAt: new Date().toISOString(), startedBy: me.uid };
}

export function submittedSurvey(survey, me) {
  return { ...survey, status: "submitted", submittedAt: new Date().toISOString(), submittedBy: me.uid, submittedByName: me.name || "" };
}

// ---- Device copy (offline) ----

function draftKey(departmentId, surveyId) {
  return `forge-preplan-survey:${departmentId}:${surveyId}`;
}

/** Keep the surveyor's work on this device until the server has it. */
export function keepOnDevice(departmentId, survey, baseVersion) {
  try {
    window.localStorage.setItem(draftKey(departmentId, survey.id), JSON.stringify({ survey: surveyorPatch(survey), baseVersion, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function readDeviceCopy(departmentId, surveyId) {
  try {
    const raw = window.localStorage.getItem(draftKey(departmentId, surveyId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDeviceCopy(departmentId, surveyId) {
  try { window.localStorage.removeItem(draftKey(departmentId, surveyId)); } catch { /* storage unavailable */ }
}

/** Surveys with work saved on this device but not yet sent. */
export function surveysWithDeviceCopies(departmentId) {
  const prefix = `forge-preplan-survey:${departmentId}:`;
  try {
    return Object.keys(window.localStorage).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  } catch {
    return [];
  }
}

// ---- Review (preplan staff) ----

export async function returnSurvey(departmentId, survey, notes, actor = {}) {
  if (!String(notes || "").trim()) throw new Error("Say what the surveyor should look at again.");
  await updateRecord(departmentId, PREPLAN_SURVEYS_COLLECTION, survey.id, {
    status: "returned",
    reviewNotes: String(notes).slice(0, 2000),
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor.actorUid || "",
    reviewedByName: actor.actorName || "",
    version: survey.version + 1,
  });
  await audit(departmentId, actor, "return", survey, `Field survey of ${survey.preplanNumber} returned to the surveyor`);
}

async function registerPhotos(departmentId, survey, actor) {
  for (const photo of survey.photos) {
    await registerPreplanFile(departmentId, {
      preplanId: survey.preplanId,
      category: "photo",
      fileName: photo.fileName,
      mimeType: photo.contentType,
      fileSize: photo.size,
      storagePath: photo.storagePath,
      downloadUrl: photo.downloadUrl,
      description: [photo.caption, `Field survey ${survey.id}`].filter(Boolean).join(" · "),
    }, actor);
  }
}

/**
 * Accept the survey into a draft revision: the preplan's draft in progress, or a
 * new one started from the published plan. Applies the accepted corrections and
 * files the photos with the preplan. The published revision isn't touched.
 */
export async function acceptSurveyAsRevision(departmentId, survey, acceptedKeys = [], notes = "", actor = {}) {
  const preplan = await getPreplan(departmentId, survey.preplanId);
  if (!preplan) throw new Error("This survey's preplan wasn't found.");
  const unpublished = preplan.currentRevisionId && preplan.currentRevisionId !== preplan.publishedRevisionId
    ? await getPreplanRevision(departmentId, preplan.currentRevisionId).catch(() => null)
    : null;
  if (unpublished && !DRAFT_REVISION_STATUSES.includes(unpublished.status)) {
    throw new Error("This preplan's newest revision is in review or approved. Finish or return it before accepting a survey.");
  }
  const revision = unpublished || (await startPreplanRevision(departmentId, preplan.id, actor)).revision;
  const keys = new Set(acceptedKeys);
  const sectionAnswers = Object.fromEntries(Object.entries(survey.proposedAnswers).filter(([key]) => keys.has(key)));
  const fieldNotes = [
    `Field survey ${survey.id} (${survey.submittedByName || "surveyor"}, ${String(survey.submittedAt).slice(0, 10)}).`,
    ...survey.checklist
      .filter((item) => ["changed", "not_checked"].includes(survey.results[item.id]?.result))
      .map((item) => `- ${item.label}: ${survey.results[item.id].result === "changed" ? "changed" : "couldn't check"}. ${survey.results[item.id].note}`),
    ...survey.observations.map((row) => `- Observation (${row.category}): ${row.note}${row.location ? ` [${row.location.lat}, ${row.location.lng}]` : ""}`),
    survey.notes ? `- Surveyor notes: ${survey.notes}` : "",
  ].filter(Boolean).join("\n");
  await updatePreplanRevision(departmentId, revision.id, {
    sectionAnswers,
    notes: [revision.notes, fieldNotes].filter(Boolean).join("\n\n").slice(0, 20000),
  }, actor);
  await registerPhotos(departmentId, survey, actor);
  await updateRecord(departmentId, PREPLAN_SURVEYS_COLLECTION, survey.id, {
    status: "accepted",
    outcome: "revision",
    resultRevisionId: revision.id,
    reviewNotes: String(notes || "").slice(0, 2000),
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor.actorUid || "",
    reviewedByName: actor.actorName || "",
    version: survey.version + 1,
  });
  await audit(departmentId, actor, "accept", survey, `Field survey of ${survey.preplanNumber} accepted into revision ${revision.revisionNumber || revision.id} (${keys.size} correction(s))`);
  return revision;
}

/** Nothing changed on site: record it as the preplan's field verification. */
export async function acceptSurveyAsVerification(departmentId, survey, notes = "", actor = {}) {
  const { verification } = await recordPreplanVerification(departmentId, survey.preplanId, {
    notes: [`Field survey ${survey.id} by ${survey.submittedByName || "surveyor"}.`, notes].filter(Boolean).join(" "),
    checklist: survey.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      checked: survey.results[item.id]?.result === "confirmed" || survey.results[item.id]?.result === "na",
      notes: survey.results[item.id]?.note || "",
    })),
  }, actor);
  await registerPhotos(departmentId, survey, actor);
  await updateRecord(departmentId, PREPLAN_SURVEYS_COLLECTION, survey.id, {
    status: "accepted",
    outcome: "verification",
    reviewNotes: String(notes || "").slice(0, 2000),
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor.actorUid || "",
    reviewedByName: actor.actorName || "",
    version: survey.version + 1,
  });
  await audit(departmentId, actor, "accept", survey, `Field survey of ${survey.preplanNumber} recorded as a field verification`);
  return verification;
}
