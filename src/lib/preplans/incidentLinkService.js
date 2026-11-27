/**
 * Incident ↔ preplan links (`preplanIncidentLinks`): which approved preplan
 * version a crew opened for a call. Created once and never edited, so the
 * record keeps pointing at the version that was approved then, after the
 * preplan is revised. firestore.rules checks that the version is the one
 * published when the link is made.
 */
import { collection, getDocs, limit as limitDocs, orderBy, query, where } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { createRecord, getRecord } from "../firestoreService.js";
import { writeInspectionAuditLog } from "../inspections/inspectionAudit.js";
import { PREPLAN_INCIDENT_LINKS_COLLECTION } from "../inspections/paths.js";
import { getPreplan, getPreplanRevision } from "../inspections/preplanService.js";
import { buildIncidentLink, incidentFrom, incidentLinkId, isApprovedPreplan } from "./incidentMatch.js";

const METHOD_LABELS = {
  suite: "address and suite",
  address: "address",
  confirmed: "confirmed by the user",
  manual: "chosen by the user",
};

export function matchMethodLabel(method) {
  return METHOD_LABELS[method] || method || "";
}

/**
 * Record that `preplanId`'s approved version was used for `incident`.
 * Returns the existing link when this incident and preplan were linked before.
 * @param {string} departmentId
 * `revisionId` is the version the crew had (an offline copy may be an earlier approved
 * version); it defaults to the one approved now.
 * @param {{ incident: object, preplanId: string, revisionId?: string, method: "suite"|"address"|"confirmed"|"manual", actor: object, note?: string }} input
 */
export async function linkIncidentToPreplan(departmentId, { incident, preplanId, revisionId = "", method, actor = {}, note = "" }) {
  const parsedIncident = incident?.parsed ? incident : incidentFrom(incident);
  const preplan = await getPreplan(departmentId, preplanId);
  if (!preplan) throw new Error("That preplan no longer exists.");
  if (!revisionId && !isApprovedPreplan(preplan)) throw new Error("That preplan has no approved version to use.");
  const revision = await getPreplanRevision(departmentId, revisionId || preplan.publishedRevisionId);
  if (!revision) throw new Error("That version of the preplan can't be found.");
  const link = buildIncidentLink({ incident: parsedIncident, preplan, revision, method, actor, note });
  const id = incidentLinkId(link);
  if (parsedIncident.id || parsedIncident.incidentNumber) {
    const existing = await getRecord(departmentId, PREPLAN_INCIDENT_LINKS_COLLECTION, id).catch(() => null);
    if (existing) return { ...existing, id, existing: true };
  }
  const saved = await createRecord(departmentId, PREPLAN_INCIDENT_LINKS_COLLECTION, id, { id, ...link });
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanIncidentLink",
    action: "create",
    recordId: id,
    summary: `${link.preplanName} (version ${link.revisionNumber ?? "?"}) used for ${link.incidentNumber || link.incidentDescription || "an incident"} at ${link.incidentAddress || "an unknown address"} (${matchMethodLabel(method)})`,
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  }).catch(() => undefined);
  return saved;
}

async function runQuery(departmentId, constraints) {
  const db = getFirestoreDb();
  const snapshot = await getDocs(query(collection(db, "departments", departmentId, PREPLAN_INCIDENT_LINKS_COLLECTION), ...constraints));
  return snapshot.docs.map((row) => ({ id: row.id, ...row.data() }));
}

const newestFirst = (rows) => rows.sort((a, b) => String(b.linkedAt).localeCompare(String(a.linkedAt)));

/** Incidents a preplan was used on, newest first. */
export async function listIncidentLinksForPreplan(departmentId, preplanId) {
  return newestFirst(await runQuery(departmentId, [where("preplanId", "==", preplanId)]));
}

/** Preplans used for one incident. */
export async function listIncidentLinksForIncident(departmentId, key) {
  if (!key) return [];
  return newestFirst(await runQuery(departmentId, [where("incidentKey", "==", key)]));
}

/** The department's most recent links. */
export async function listRecentIncidentLinks(departmentId, count = 50) {
  return runQuery(departmentId, [orderBy("linkedAt", "desc"), limitDocs(count)]);
}
