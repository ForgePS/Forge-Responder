/**
 * Read and write a department list in either storage format:
 *  - array: departments/<id>/lists/<key> { items: [...] }  (older, one record)
 *  - items: same record is a header { storage: "items" }, each item is
 *           departments/<id>/lists/<key>/items/<docId>       (see listItemsPlan.js)
 * Everything that reads or writes a list outside the list hook goes through here.
 */
import { collection, deleteField, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, setDoc, writeBatch } from "firebase/firestore";
import { departmentListSegments } from "./tenantPaths.js";
import { sanitizeForFirestore, sanitizeItemsForFirestore } from "./firestoreSanitize.js";
import { withTenantListPayload } from "./tenantRecord.js";
import {
  ITEMS_SUBCOLLECTION,
  ORDER_FIELD,
  ensureItemIds,
  entriesFromRecords,
  isItemsStorage,
  itemDocId,
  itemsFromRecords,
  planListWrites,
} from "./listItemsPlan.js";

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

/**
 * Read one item of a list by id (either storage format).
 * @returns {Promise<object|null>}
 */
export async function readTenantListItem(db, departmentId, listKey, itemId) {
  const headerSnap = await getDoc(listHeaderRef(db, departmentId, listKey));
  const header = headerSnap.exists() ? headerSnap.data() : null;
  if (isItemsStorage(header)) {
    const snap = await getDoc(doc(db, ...departmentListSegments(departmentId, listKey), ITEMS_SUBCOLLECTION, itemDocId(itemId)));
    if (!snap.exists()) return null;
    const { [ORDER_FIELD]: _ignored, ...rest } = snap.data();
    return { ...rest, id: rest.id ?? itemId };
  }
  const items = Array.isArray(header?.items) ? header.items : [];
  return items.find((item) => String(item?.id) === String(itemId)) || null;
}

/**
 * Add or replace one item without rewriting the rest of the list (used by
 * the field app when a saved record syncs). New items go to the top of the
 * list, like records added on the desktop pages.
 */
export async function upsertTenantListItem(db, departmentId, listKey, item, { userId = "system" } = {}) {
  if (!item?.id) throw new Error("List item has no id");
  const clean = sanitizeForFirestore(item);
  const headerRef = listHeaderRef(db, departmentId, listKey);
  const headerSnap = await getDoc(headerRef);
  const header = headerSnap.exists() ? headerSnap.data() : null;
  const base = departmentListSegments(departmentId, listKey);

  if (!headerSnap.exists() || isItemsStorage(header)) {
    const itemRef = doc(db, ...base, ITEMS_SUBCOLLECTION, itemDocId(item.id));
    const existing = await getDoc(itemRef);
    let order = existing.exists() ? existing.data()?.[ORDER_FIELD] : undefined;
    if (order === undefined || order === null) {
      const first = await getDocs(query(collection(db, ...base, ITEMS_SUBCOLLECTION), orderBy(ORDER_FIELD), limit(1)));
      const lowest = first.empty ? null : first.docs[0].data()?.[ORDER_FIELD];
      order = typeof lowest === "number" ? lowest - 1024 : 1024;
    }
    await setDoc(itemRef, { ...clean, [ORDER_FIELD]: order });
    if (!headerSnap.exists()) {
      await setDoc(headerRef, itemsHeaderPayload({ departmentId, userId, itemCount: 1 }), { merge: true });
    }
    return { storage: "items" };
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(headerRef);
    const items = Array.isArray(snap.data()?.items) ? [...snap.data().items] : [];
    const index = items.findIndex((row) => String(row?.id) === String(item.id));
    if (index >= 0) items[index] = clean;
    else items.unshift(clean);
    const now = new Date().toISOString();
    tx.set(headerRef, { items, updatedAt: now, updated_at: now, updatedBy: userId }, { merge: true });
  });
  return { storage: "array" };
}
