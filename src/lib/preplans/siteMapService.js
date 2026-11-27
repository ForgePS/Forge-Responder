/**
 * Firestore access for preplan site maps (`preplanSiteMaps/{revisionId}`).
 * Same lock as floor plans: writable only while the revision is a draft,
 * in review or returned (firestore.rules), with optimistic concurrency.
 */
import { doc, getDoc, runTransaction } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { PREPLAN_REVISIONS_COLLECTION, PREPLAN_SITE_MAPS_COLLECTION } from "../inspections/paths.js";
import { EDITABLE_REVISION_STATUSES, FloorPlanConflictError } from "./floorPlanService.js";
import { normalizeSiteMap, siteMapToStorage } from "./siteMapModel.js";

export async function getSiteMap(departmentId, revisionId) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !revisionId) return null;
  const snap = await getDoc(doc(db, "departments", departmentId, PREPLAN_SITE_MAPS_COLLECTION, revisionId));
  return snap.exists() ? normalizeSiteMap({ id: snap.id, ...snap.data() }) : null;
}

/**
 * Save a site map. Fails with FloorPlanConflictError (code "floor-plan-conflict")
 * if someone else saved since `expectedVersion`.
 */
export async function saveSiteMap(departmentId, map, { expectedVersion = 0, actorUid = "" } = {}) {
  const db = getFirestoreDb();
  if (!db) throw new Error("Saving needs a connection to Forge.");
  if (!map.preplanId || !map.revisionId) throw new Error("Site map is missing its preplan or revision.");
  const ref = doc(db, "departments", departmentId, PREPLAN_SITE_MAPS_COLLECTION, map.revisionId);
  const revisionRef = doc(db, "departments", departmentId, PREPLAN_REVISIONS_COLLECTION, map.revisionId);
  return runTransaction(db, async (tx) => {
    const [snap, revisionSnap] = await Promise.all([tx.get(ref), tx.get(revisionRef)]);
    const revision = revisionSnap.exists() ? revisionSnap.data() : null;
    if (!revision || revision.preplanId !== map.preplanId) throw new Error("This site map's revision wasn't found.");
    if (!EDITABLE_REVISION_STATUSES.includes(revision.status)) {
      throw new Error("This revision is approved or published, so its site map is locked. Start a new revision to make changes.");
    }
    const current = snap.exists() ? normalizeSiteMap({ id: snap.id, ...snap.data() }) : null;
    const currentVersion = current?.version || 0;
    if (currentVersion !== (Number(expectedVersion) || 0)) throw new FloorPlanConflictError(current);
    const next = normalizeSiteMap({
      ...map,
      id: map.revisionId,
      version: currentVersion + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actorUid,
    });
    tx.set(ref, siteMapToStorage(next));
    return next;
  });
}

/** Carry a site map into a new draft revision (the old one is untouched). */
export async function copySiteMapToRevision(departmentId, { preplanId, fromRevisionId, toRevisionId, actorUid = "" }) {
  if (!fromRevisionId || !toRevisionId) return false;
  const source = await getSiteMap(departmentId, fromRevisionId);
  if (!source) return false;
  await saveSiteMap(departmentId, { ...source, preplanId, revisionId: toRevisionId }, { expectedVersion: 0, actorUid });
  return true;
}
