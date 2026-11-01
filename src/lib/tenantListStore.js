/**
 * Read and write a department list in either storage format:
 *  - array: departments/<id>/lists/<key> { items: [...] }  (older, one record)
 *  - items: same record is a header { storage: "items" }, each item is
 *           departments/<id>/lists/<key>/items/<docId>       (see listItemsPlan.js)
 * Everything that reads or writes a list outside the list hook goes through here.
 */
import { collection, deleteField, doc, getDoc, getDocs, orderBy, query, setDoc, writeBatch } from "firebase/firestore";
import { departmentListSegments } from "./tenantPaths.js";
import { sanitizeItemsForFirestore } from "./firestoreSanitize.js";
import { withTenantListPayload } from "./tenantRecord.js";
import {
  ITEMS_SUBCOLLECTION,
  ORDER_FIELD,
  ensureItemIds,
  entriesFromRecords,
  isItemsStorage,
  itemsFromRecords,
  planListWrites,
} from "./listItemsPlan.js";
import { listHasPrivateFields, splitPersonnelList, stripBlankPrivateKeys } from "./personnelPrivateFields.js";
import { savePersonnelPrivateMany } from "./personnelPrivateService.js";

const BATCH_LIMIT = 450;

export function listHeaderRef(db, departmentId, listKey) {
  return doc(db, ...departmentListSegments(departmentId, listKey));
}

export function listItemsQuery(db, departmentId, listKey) {
  return query(collection(db, ...departmentListSegments(departmentId, listKey), ITEMS_SUBCOLLECTION), orderBy(ORDER_FIELD));
}

export function recordsFromSnapshot(querySnap) {
  return querySnap.docs.map((d) => ({ docId: d.id, data: d.data() }));
}

/**
 * @returns {Promise<{ exists: boolean, storage: "array"|"items", items: object[], entries: Map|null }>}
 * Items are raw (as stored); callers restore/normalize them as before.
 */
export async function readTenantList(db, departmentId, listKey) {
  const headerSnap = await getDoc(listHeaderRef(db, departmentId, listKey));
  const header = headerSnap.exists() ? headerSnap.data() : null;
  if (isItemsStorage(header)) {
    const records = recordsFromSnapshot(await getDocs(listItemsQuery(db, departmentId, listKey)));
    return { exists: true, storage: "items", items: itemsFromRecords(records), entries: entriesFromRecords(records) };
  }
  return {
    exists: headerSnap.exists(),
    storage: "array",
    items: Array.isArray(header?.items) ? header.items : [],
    entries: null,
  };
}

/**
 * Every write of a list goes through here first. The personnel list never
 * stores private details (SSN, birth date, demographics, license number):
 * any values found are saved to personnelPrivate/{id} and removed from the
 * items. If that save is refused (someone without access, or before the rules
 * allow it), real values stay on the item so nothing is lost; blank private
 * keys are always dropped.
 * @returns {Promise<{ items: object[], movedIds: string[], moveError: unknown }>}
 */
export async function prepareListItemsForWrite(db, departmentId, listKey, items = [], userId = "") {
  if (!listHasPrivateFields(listKey)) return { items, movedIds: [], moveError: null };
  const split = splitPersonnelList(items);
  const ids = Object.keys(split.privateById);
  if (!ids.length) return { items: split.items, movedIds: [], moveError: null };
  try {
    await savePersonnelPrivateMany(db, departmentId, split.privateById, userId);
    return { items: split.items, movedIds: ids, moveError: null };
  } catch (error) {
    console.warn(`Couldn't move private details for ${ids.length} personnel record(s); leaving them where they are`, error?.code || error);
    return { items: stripBlankPrivateKeys(items), movedIds: [], moveError: error };
  }
}

/** Commit planned per-item writes in batches. */
export async function commitListPlan(db, departmentId, listKey, plan) {
  const base = departmentListSegments(departmentId, listKey);
  const ops = [
    ...plan.upserts.map((u) => (batch) => batch.set(doc(db, ...base, ITEMS_SUBCOLLECTION, u.docId), u.data)),
    ...plan.deletes.map((docId) => (batch) => batch.delete(doc(db, ...base, ITEMS_SUBCOLLECTION, docId))),
  ];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
    await batch.commit();
  }
  return ops.length;
}

/**
 * Save a whole list (replacing what's there) in whichever format it uses.
 * Per-item lists write only the items that changed.
 */
export async function replaceTenantList(db, departmentId, listKey, items, { userId = "system", headerFields = {} } = {}) {
  const current = await readTenantList(db, departmentId, listKey);
  if (listHasPrivateFields(listKey)) {
    ({ items } = await prepareListItemsForWrite(db, departmentId, listKey, ensureItemIds(items).items, userId));
  }
  // New lists start per item; existing array lists stay arrays until migrated.
  if (current.storage === "items" || !current.exists) {
    const { items: withIds } = ensureItemIds(sanitizeItemsForFirestore(items));
    const plan = planListWrites(current.entries || new Map(), withIds);
    await commitListPlan(db, departmentId, listKey, plan);
    if (!current.exists) {
      await setDoc(
        listHeaderRef(db, departmentId, listKey),
        { ...itemsHeaderPayload({ departmentId, userId, itemCount: withIds.length }), ...headerFields },
        { merge: true },
      );
    }
    return { storage: "items", writes: plan.upserts.length + plan.deletes.length };
  }
  const payload = { ...withTenantListPayload(sanitizeItemsForFirestore(items), { departmentId, userId }), ...headerFields };
  await setDoc(listHeaderRef(db, departmentId, listKey), payload, { merge: true });
  return { storage: "array", writes: 1 };
}

/** Header fields for a list that has moved to per-item records. */
export function itemsHeaderPayload({ departmentId, userId = "system", itemCount = 0 } = {}) {
  const now = new Date().toISOString();
  return {
    storage: "items",
    items: deleteField(),
    itemCount,
    departmentId,
    migratedAt: now,
    updatedAt: now,
    updated_at: now,
    updatedBy: userId,
  };
}
