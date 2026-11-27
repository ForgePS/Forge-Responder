/**
 * Firestore access for preplan floors and floor plans.
 *
 *  - preplanFloors/{floorId}: a floor of a preplan building (not versioned; names and order).
 *  - preplanFloorPlans/{revisionId}__{floorId}: the structured geometry for that floor in one
 *    revision. Writable only while the revision is a draft (enforced in firestore.rules), so a
 *    published plan can't change underneath responders.
 */
import { collection, doc, getDoc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { createRecord, getRecord, listRecords, updateRecord } from "../firestoreService.js";
import { writeInspectionAuditLog } from "../inspections/inspectionAudit.js";
import {
  PREPLAN_FLOORS_COLLECTION,
  PREPLAN_FLOOR_PLANS_COLLECTION,
  PREPLAN_REVISIONS_COLLECTION,
  PREPLAN_SYMBOL_LIBRARIES_COLLECTION,
} from "../inspections/paths.js";
import { mergeSymbolCatalog } from "./symbolCatalog.js";
import {
  FLOOR_KINDS,
  floorPlanDocId,
  floorPlanToStorage,
  normalizeFloorPlan,
  validateForPublication,
  withoutRejected,
} from "./floorPlanModel.js";

/** Revision statuses whose geometry may still change (matches firestore.rules). */
export const EDITABLE_REVISION_STATUSES = Object.freeze(["draft", "in_review", "returned"]);

export class FloorPlanConflictError extends Error {
  constructor(serverPlan) {
    super("Someone else saved this floor plan since you opened it. Reload to see their changes; your edits are kept until you do.");
    this.name = "FloorPlanConflictError";
    this.code = "floor-plan-conflict";
    this.serverPlan = serverPlan;
  }
}

function newFloorId() {
  return `PPFL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function normalizeFloor(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const kind = FLOOR_KINDS.some((row) => row.id === data.kind) ? data.kind : "ground";
  return {
    id: String(data.id || ""),
    preplanId: String(data.preplanId || ""),
    buildingId: String(data.buildingId || ""),
    name: String(data.name || "Floor").slice(0, 60),
    kind,
    level: Number.isFinite(Number(data.level)) ? Number(data.level) : 0,
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    archived: Boolean(data.archived),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** Floors ordered bottom to top (basement first, roof last). */
export function sortFloors(floors = []) {
  return [...floors].sort((a, b) => (a.level - b.level) || (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

export async function listPreplanFloors(departmentId, preplanId, buildingId = "") {
  if (!departmentId || !preplanId) return [];
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await getDocs(query(
    collection(db, "departments", departmentId, PREPLAN_FLOORS_COLLECTION),
    where("preplanId", "==", preplanId),
  ));
  return sortFloors(snap.docs
    .map((item) => normalizeFloor({ id: item.id, ...item.data() }))
    .filter((row) => !row.archived && (!buildingId || row.buildingId === buildingId)));
}

export async function savePreplanFloor(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  if (!payload.preplanId || !payload.buildingId) throw new Error("Pick a building for this floor.");
  const id = payload.id || newFloorId();
  const existing = payload.id ? await getRecord(departmentId, PREPLAN_FLOORS_COLLECTION, id) : null;
  if (existing && existing.preplanId !== payload.preplanId) throw new Error("That floor belongs to a different preplan.");
  const record = normalizeFloor({ ...(existing || {}), ...payload, id });
  if (existing) await updateRecord(departmentId, PREPLAN_FLOORS_COLLECTION, id, record);
  else await createRecord(departmentId, PREPLAN_FLOORS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanFloor",
    action: existing ? (payload.archived ? "archive" : "update") : "create",
    recordId: id,
    summary: `Preplan floor ${record.name}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

/** Copy a floor (name + geometry) as a new floor in the same building. */
export async function duplicatePreplanFloor(departmentId, floor, revisionId, audit = {}) {
  const copy = await savePreplanFloor(departmentId, {
    preplanId: floor.preplanId,
    buildingId: floor.buildingId,
    name: `${floor.name} (copy)`,
    kind: floor.kind,
    level: floor.level + 1,
    sortOrder: floor.sortOrder + 1,
  }, audit);
  if (revisionId) {
    const source = await getFloorPlan(departmentId, revisionId, floor.id);
    if (source.objects.length) {
      await saveFloorPlan(departmentId, { ...source, floorId: copy.id, id: "", version: 0 }, { expectedVersion: 0, actorUid: audit.actorUid });
    }
  }
  return copy;
}

/**
 * The floor plan for (revision, floor). An empty plan when none is saved yet.
 * @returns {Promise<ReturnType<typeof normalizeFloorPlan>>}
 */
export async function getFloorPlan(departmentId, revisionId, floorId) {
  const id = floorPlanDocId(revisionId, floorId);
  const row = await getRecord(departmentId, PREPLAN_FLOOR_PLANS_COLLECTION, id);
  return normalizeFloorPlan({ revisionId, floorId, ...(row || {}), id });
}

export async function listFloorPlansForRevision(departmentId, revisionId) {
  if (!departmentId || !revisionId) return [];
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await getDocs(query(
    collection(db, "departments", departmentId, PREPLAN_FLOOR_PLANS_COLLECTION),
    where("revisionId", "==", revisionId),
  ));
  return snap.docs.map((item) => normalizeFloorPlan({ id: item.id, ...item.data() }));
}

/**
 * Save a floor plan with optimistic concurrency: the save only goes through if
 * the stored version still equals `expectedVersion`.
 * @param {object} plan normalized floor plan (must carry preplanId, revisionId, floorId)
 * @param {{expectedVersion:number, actorUid?:string}} options
 */
export async function saveFloorPlan(departmentId, plan, options = {}) {
  const db = getFirestoreDb();
  if (!db) throw new Error("Saving needs a connection to Forge.");
  if (!plan.preplanId || !plan.revisionId || !plan.floorId) throw new Error("Floor plan is missing its preplan, revision or floor.");
  const id = floorPlanDocId(plan.revisionId, plan.floorId);
  const ref = doc(db, "departments", departmentId, PREPLAN_FLOOR_PLANS_COLLECTION, id);
  const revisionRef = doc(db, "departments", departmentId, PREPLAN_REVISIONS_COLLECTION, plan.revisionId);
  const expected = Number(options.expectedVersion) || 0;
  return runTransaction(db, async (tx) => {
    const [snap, revisionSnap] = await Promise.all([tx.get(ref), tx.get(revisionRef)]);
    const revision = revisionSnap.exists() ? revisionSnap.data() : null;
    if (!revision || revision.preplanId !== plan.preplanId) throw new Error("This floor plan's revision wasn't found.");
    if (!EDITABLE_REVISION_STATUSES.includes(revision.status)) {
      throw new Error("This revision is approved or published, so its floor plans are locked. Start a new revision to make changes.");
    }
    const current = snap.exists() ? normalizeFloorPlan({ id, ...snap.data() }) : null;
    const currentVersion = current?.version || 0;
    if (currentVersion !== expected) throw new FloorPlanConflictError(current);
    const next = normalizeFloorPlan({
      ...plan,
      id,
      version: currentVersion + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: options.actorUid || "",
    });
    tx.set(ref, floorPlanToStorage(next));
    return next;
  });
}

/**
 * Carry every floor plan of one revision into a new draft revision (used when a
 * new revision starts). Rejected proposals are dropped; the old plans are untouched.
 */
export async function copyFloorPlansToRevision(departmentId, { preplanId, fromRevisionId, toRevisionId, actorUid = "" }) {
  if (!fromRevisionId || !toRevisionId) return 0;
  const plans = await listFloorPlansForRevision(departmentId, fromRevisionId);
  let copied = 0;
  for (const plan of plans) {
    const next = normalizeFloorPlan({
      ...withoutRejected(plan),
      preplanId,
      revisionId: toRevisionId,
      id: floorPlanDocId(toRevisionId, plan.floorId),
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actorUid,
    });
    await createRecord(departmentId, PREPLAN_FLOOR_PLANS_COLLECTION, next.id, floorPlanToStorage(next));
    copied += 1;
  }
  return copied;
}

/**
 * Everything that blocks publishing a revision's floor plans, across all floors.
 * @returns {Promise<{ok:boolean, problems:string[]}>}
 */
export async function checkRevisionFloorPlans(departmentId, revisionId, floors = [], catalog) {
  const plans = await listFloorPlansForRevision(departmentId, revisionId);
  const names = new Map(floors.map((row) => [row.id, row.name]));
  const problems = [];
  for (const plan of plans) {
    const result = validateForPublication(plan, catalog);
    for (const problem of result.problems) problems.push(`${names.get(plan.floorId) || "A floor"}: ${problem}`);
  }
  return { ok: problems.length === 0, problems };
}

/** Floors of a preplan with their plan for a revision (for the response view and editor). */
export async function loadBuildingsWithFloors(departmentId, preplanId, revisionId, buildings = []) {
  const floors = await listPreplanFloors(departmentId, preplanId);
  const plans = revisionId ? await listFloorPlansForRevision(departmentId, revisionId) : [];
  const planByFloor = new Map(plans.map((row) => [row.floorId, row]));
  return buildings.map((building) => ({
    ...building,
    floors: floors
      .filter((floor) => floor.buildingId === building.id)
      .map((floor) => ({ ...floor, plan: planByFloor.get(floor.id) || null })),
  }));
}

/** Read one revision's status (used by the editor to decide if it can edit). */
export async function getRevisionStatus(departmentId, revisionId) {
  const db = getFirestoreDb();
  if (!db || !revisionId) return "";
  const snap = await getDoc(doc(db, "departments", departmentId, PREPLAN_REVISIONS_COLLECTION, revisionId));
  return snap.exists() ? String(snap.data().status || "") : "";
}

/** Starter symbols plus the department's active custom symbol libraries. */
export async function loadSymbolCatalog(departmentId) {
  if (!departmentId) return mergeSymbolCatalog([]);
  try {
    const libraries = await listRecords(departmentId, PREPLAN_SYMBOL_LIBRARIES_COLLECTION);
    return mergeSymbolCatalog(libraries.filter((row) => row.active !== false).flatMap((row) => (Array.isArray(row.symbols) ? row.symbols : [])));
  } catch {
    return mergeSymbolCatalog([]);
  }
}
