/**
 * RMS reads and actions on patient care reports (departments/{id}/pcrs) and EMS agency settings.
 *
 * PHI: reports hold patient data. Nothing here logs report contents; audit entries name the report number only.
 * Access is enforced by firestore.rules (crew on the report, or viewAllPcrs / unlockPcrs / exportPcrs / reviewPcrs) and, for
 * the NEMSIS check, by the checkPcr callable.
 */
import { addDoc, collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions, getFirestoreDb } from "./firebaseClient.js";
import { getRecord, listRecentRecords, updateRecord } from "./firestoreService.js";
import { writeAuditLog } from "./auditService.js";
import { EMS_SETTINGS_DOC, normalizeEmsSettings } from "./nemsis/emsSettings.js";
import { EMS_FORM_DOC, normalizePcrForm } from "./pcr/pcrForm.js";
import { getPath, setPath, threeWayMerge } from "../field/fieldMerge.js";
import { stripUndefined } from "../field/fieldPcr.js";
import { readTenantList } from "./tenantListStore.js";
import { LIST_KEYS } from "./tenantListKeys.js";
import { syncActive911Alerts } from "./active911Service.js";
import { DEMO_DEPARTMENT_ID } from "./tenantPaths.js";

export const PCR_COLLECTION = "pcrs";
const AUDIT_MODULE = "EMS";

export async function loadEmsSettings(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return normalizeEmsSettings(null);
  const snap = await getDoc(doc(db, "departments", departmentId, "settings", EMS_SETTINGS_DOC));
  return normalizeEmsSettings(snap.exists() ? snap.data() : null);
}

export async function saveEmsSettings(departmentId, settings, actor = {}) {
  const db = getFirestoreDb();
  const payload = {
    ...normalizeEmsSettings(settings),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.actorName || actor.actorUid || "",
  };
  await setDoc(doc(db, "departments", departmentId, "settings", EMS_SETTINGS_DOC), payload);
  await writeAuditLog(departmentId, { ...actor, action: "ems.settings", module: AUDIT_MODULE, summary: "Updated EMS agency settings" });
  return payload;
}

/**
 * Newest reports this person may read: every report with a read-all permission, otherwise the ones they crewed
 * (the rules reject a query that could return reports they can't read).
 */
export async function listPcrs(departmentId, { uid, readAll }) {
  const filters = readAll ? [] : [["crewUids", "array-contains", uid]];
  return listRecentRecords(departmentId, PCR_COLLECTION, "updatedAt", 300, filters);
}

export async function getPcr(departmentId, pcrId, actor = {}) {
  const pcr = await getRecord(departmentId, PCR_COLLECTION, pcrId);
  if (pcr) {
    await writeAuditLog(departmentId, { ...actor, action: "pcr.view", module: AUDIT_MODULE, recordId: pcrId, summary: `Viewed patient care report ${pcr.number || pcrId}` });
  }
  return pcr;
}

/**
 * Re-open a posted report for an amendment (unlockPcrs). The posted version is kept first as an immutable revision
 * (pcrs/{id}/revisions/posted-{n}); when the report is posted again the server records what changed against it.
 */
export async function unlockPcr(departmentId, pcr, actor = {}, reason = "") {
  const db = getFirestoreDb();
  const ref = doc(db, "departments", departmentId, PCR_COLLECTION, pcr.id);
  const now = new Date().toISOString();
  const by = actor.actorName || actor.actorUid || "";
  const updated = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? snap.data() : null;
    if (!current || current.status !== "posted") {
      throw Object.assign(new Error("This report isn't posted, so there's nothing to unlock."), { code: "failed-precondition" });
    }
    const version = Number(current.versions || 0) + 1;
    const revisionId = `posted-${version}`;
    tx.set(doc(ref, "revisions", revisionId), stripUndefined({
      kind: "posted-version",
      version,
      number: current.number || "",
      nemsis: current.nemsis || {},
      postedAt: current.postedAt || "",
      postedByName: current.postedByName || "",
      postedHash: current.postedHash || "",
      unlockReason: reason,
      createdAt: now,
      createdByUid: actor.actorUid || "",
      createdByName: actor.actorName || "",
    }));
    const patch = {
      id: pcr.id,
      status: "draft",
      versions: version,
      unlockedAt: now,
      unlockedBy: by,
      unlockReason: reason,
      amendment: { open: true, reason, revisionId, openedAt: now, openedByName: by },
      updatedAt: now,
    };
    tx.update(ref, patch);
    return { ...current, ...patch };
  });
  await writeAuditLog(departmentId, {
    ...actor,
    action: "pcr.unlock",
    module: AUDIT_MODULE,
    recordId: pcr.id,
    summary: `Unlocked patient care report ${pcr.number || pcr.id} for amendment${reason ? `: ${reason}` : ""}`,
  });
  return updated;
}

/** Saved versions and amendments of a report, oldest first. */
export async function listPcrRevisions(departmentId, pcrId) {
  const db = getFirestoreDb();
  const snap = await getDocs(collection(db, "departments", departmentId, PCR_COLLECTION, pcrId, "revisions"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// ---------------------------------------------------------------------------
// QA review (reviewPcrs). Reviewers comment, return a report to the crew, or mark it reviewed. They never change
// the chart: the rules let them write only report.qa and the append-only pcrs/{id}/qaReviews history.
// ---------------------------------------------------------------------------

export async function listQaReviews(departmentId, pcrId) {
  const db = getFirestoreDb();
  const snap = await getDocs(collection(db, "departments", departmentId, PCR_COLLECTION, pcrId, "qaReviews"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/**
 * @param {"comment"|"returned"|"reviewed"|"reply"} action reply = the crew answering a reviewer
 */
export async function addQaReview(departmentId, pcr, { action, note = "", checklist = null }, actor = {}) {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  const entry = stripUndefined({
    action,
    note: String(note || "").slice(0, 4000),
    checklist: checklist || undefined,
    createdAt: now,
    createdByUid: actor.actorUid || "",
    createdByName: actor.actorName || "",
  });
  await addDoc(collection(db, "departments", departmentId, PCR_COLLECTION, pcr.id, "qaReviews"), entry);
  let qa = pcr.qa || null;
  if (action === "returned" || action === "reviewed") {
    qa = { status: action, note: entry.note, at: now, byName: entry.createdByName, byUid: entry.createdByUid };
    await updateDoc(doc(db, "departments", departmentId, PCR_COLLECTION, pcr.id), { qa, updatedAt: now });
  }
  await writeAuditLog(departmentId, {
    ...actor,
    action: `pcr.qa-${action}`,
    module: AUDIT_MODULE,
    recordId: pcr.id,
    summary: `QA ${action === "reply" ? "reply on" : action} patient care report ${pcr.number || pcr.id}`,
  });
  return { entry, qa };
}

export async function recordPcrExport(departmentId, pcr, actor = {}) {
  await writeAuditLog(departmentId, { ...actor, action: "pcr.export", module: AUDIT_MODULE, recordId: pcr.id, summary: `Exported NEMSIS XML for patient care report ${pcr.number || pcr.id}` });
}

export async function recordPcrPrint(departmentId, pcr, actor = {}) {
  await writeAuditLog(departmentId, { ...actor, action: "pcr.print", module: AUDIT_MODULE, recordId: pcr.id, summary: `Printed patient care report ${pcr.number || pcr.id}` });
}

/** Server-side NEMSIS check (XSD-level checks + national and state Schematron). */
export async function checkPcrOnServer(departmentId, pcrId) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, "checkPcr", { timeout: 130000 })({ departmentId, pcrId });
  return result.data || {};
}

// ---------------------------------------------------------------------------
// Department form settings (settings/emsForm, src/lib/pcr/pcrForm.js)
// ---------------------------------------------------------------------------

export async function loadPcrForm(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return normalizePcrForm(null);
  const snap = await getDoc(doc(db, "departments", departmentId, "settings", EMS_FORM_DOC));
  return normalizePcrForm(snap.exists() ? snap.data() : null);
}

export async function savePcrForm(departmentId, form, actor = {}) {
  const db = getFirestoreDb();
  const payload = { ...normalizePcrForm(form), updatedAt: new Date().toISOString(), updatedBy: actor.actorName || actor.actorUid || "" };
  await setDoc(doc(db, "departments", departmentId, "settings", EMS_FORM_DOC), payload);
  await writeAuditLog(departmentId, { ...actor, action: "ems.form-settings", module: AUDIT_MODULE, summary: "Updated the patient care report form" });
  return normalizePcrForm(payload);
}

// ---------------------------------------------------------------------------
// Charting in the RMS
// ---------------------------------------------------------------------------

/** A report started in the RMS: never clashes with a device number. */
export function rmsPcrNumber(now = new Date(), random = Math.random) {
  const stamp = now.getTime().toString(36).toUpperCase();
  return `PCR-${now.getFullYear()}-R${stamp.slice(-6)}${Math.floor(random() * 1296).toString(36).toUpperCase().padStart(2, "0")}`;
}

export async function createPcr(departmentId, data, actor = {}) {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  const record = stripUndefined({
    ...data,
    createdAt: now,
    createdByUid: actor.actorUid || "",
    createdByName: actor.actorName || "",
    updatedAt: now,
    updatedByUid: actor.actorUid || "",
    updatedByName: actor.actorName || "",
    source: "rms",
  });
  await setDoc(doc(db, "departments", departmentId, PCR_COLLECTION, data.id), record);
  await writeAuditLog(departmentId, { ...actor, action: "pcr.create", module: AUDIT_MODULE, recordId: data.id, summary: `Started patient care report ${data.number}` });
  return record;
}

/**
 * Save an edited report. Someone else (a crew device, another screen) may have saved it since it was opened, so the
 * save merges section by section against the copy it started from (`base`): sections only this person changed are
 * written. Sections changed on both sides are conflicts: nothing is written and they are returned with the other
 * copy, unless `keepMine` (then this person's version of those sections wins).
 * @param {{ base: object, mine: object, mergePaths: string[], actor: object, post?: boolean, keepMine?: boolean }} input
 * @returns {Promise<{ saved: object|null, server: object|null, conflicts: string[] }>}
 */
export async function savePcr(departmentId, { base, mine, mergePaths, actor = {}, post = false, keepMine = false }) {
  const db = getFirestoreDb();
  const ref = doc(db, "departments", departmentId, PCR_COLLECTION, mine.id);
  const now = new Date().toISOString();
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const server = snap.exists() ? snap.data() : null;
    if (server?.status === "posted") {
      throw Object.assign(new Error("This report was posted and is locked. Unlock it to make changes."), { code: "failed-precondition" });
    }
    let { merged, conflicts } = threeWayMerge(base, mine, server, mergePaths);
    if (conflicts.length && !keepMine) return { saved: null, server, conflicts: conflicts.map((c) => c.path) };
    for (const conflict of conflicts) merged = setPath(merged, conflict.path, getPath(mine, conflict.path));
    const saved = stripUndefined({
      ...(server || {}),
      ...merged,
      id: mine.id,
      updatedAt: now,
      updatedByUid: actor.actorUid || "",
      updatedByName: actor.actorName || "",
      ...(post ? { status: "posted", postedAt: now, postedByUid: actor.actorUid || "", postedByName: actor.actorName || "" } : {}),
    });
    tx.set(ref, saved);
    return { saved, server, conflicts: [] };
  });
  if (post && result.saved) {
    await writeAuditLog(departmentId, { ...actor, action: "pcr.post", module: AUDIT_MODULE, recordId: mine.id, summary: `Posted patient care report ${mine.number || mine.id}` });
  }
  return result;
}

/** The AI narrative writer (draftPcrNarrative callable). The server reads the saved report itself. */
export async function requestPcrNarrative({ departmentId, pcrId, notes = "", style = "chronological", existingNarrative = "" }) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("AI drafting needs a connection to FORGE.");
  try {
    const result = await httpsCallable(functions, "draftPcrNarrative", { timeout: 130000 })({ departmentId, pcrId, notes, style, existingNarrative });
    return result.data;
  } catch (error) {
    const message = String(error?.message || "");
    if (/offline|network|unavailable/i.test(error?.code || message)) {
      throw new Error("You're offline. Write the narrative yourself or use a quick draft.");
    }
    throw new Error(message.replace(/^.*?: /, "") || "Couldn't draft the narrative. Try again.");
  }
}

// ---------------------------------------------------------------------------
// CAD records (src/lib/pcr/pcrCad.js)
// ---------------------------------------------------------------------------

/**
 * Every CAD record a report can be filled from: the department's Active911 alerts and, for the demo department,
 * the sample CAD runs. `sync` asks Active911 for the newest alerts first (needs the integration; failures are
 * ignored and the stored alerts are used).
 */
export async function loadCadRecords(departmentId, { sync = false, stage = "latest" } = {}) {
  const pcrCad = await import("./pcr/pcrCad.js");
  if (sync && departmentId !== DEMO_DEPARTMENT_ID) {
    await syncActive911Alerts(departmentId, { alertDays: 3 }).catch(() => undefined);
  }
  const list = await readTenantList(getFirestoreDb(), departmentId, LIST_KEYS.active911Alerts).catch(() => ({ items: [] }));
  const records = (list.items || []).map(pcrCad.cadRecordFromAlert).filter((r) => r.id);
  if (departmentId === DEMO_DEPARTMENT_ID) {
    const [{ buildDemoCadRuns }, { parseCadPayload }] = await Promise.all([import("../data/demoCadRuns.js"), import("./neris/cadImport.js")]);
    for (const run of buildDemoCadRuns({ stage })) {
      const parsed = parseCadPayload(JSON.stringify(run));
      if (parsed.ok && parsed.payload) records.push(pcrCad.cadRecordFromPayload(parsed.payload, { source: "demo-cad" }));
    }
  }
  return records;
}
