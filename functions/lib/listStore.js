/**
 * Server-side read/write for department lists in either storage format
 * (see src/lib/tenantListStore.js and listItemsPlan.js):
 *  - array: departments/<id>/lists/<key> { items: [...] }
 *  - items: that record is a header { storage: "items" }; each item is
 *           departments/<id>/lists/<key>/items/<docId> with an _order field.
 */
const { FieldValue } = require("firebase-admin/firestore");
const {
  ITEMS_SUBCOLLECTION,
  ORDER_FIELD,
  ensureItemIds,
  entriesFromRecords,
  isItemsStorage,
  itemsFromRecords,
  planListWrites,
} = require("./listItemsPlan");

const BATCH_LIMIT = 450;

function listRef(db, departmentId, listKey) {
  return db.doc(`departments/${departmentId}/lists/${listKey}`);
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined).filter((v) => v !== undefined);
  if (value && typeof value === "object" && !(value instanceof Date) && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripUndefined(v)]));
  }
  return value;
}

/** @returns {Promise<{exists:boolean, storage:"array"|"items", header:object|null, items:object[], entries:Map|null}>} */
async function readList(db, departmentId, listKey) {
  const headerSnap = await listRef(db, departmentId, listKey).get();
  const header = headerSnap.exists ? headerSnap.data() || {} : null;
  if (isItemsStorage(header)) {
    const snap = await listRef(db, departmentId, listKey).collection(ITEMS_SUBCOLLECTION).orderBy(ORDER_FIELD).get();
    const records = snap.docs.map((d) => ({ docId: d.id, data: d.data() }));
    return { exists: true, storage: "items", header, items: itemsFromRecords(records), entries: entriesFromRecords(records) };
  }
  return {
    exists: headerSnap.exists,
    storage: "array",
    header,
    items: Array.isArray(header?.items) ? header.items : [],
    entries: null,
  };
}

async function readListItems(db, departmentId, listKey) {
  return (await readList(db, departmentId, listKey)).items;
}

async function commitPlan(db, departmentId, listKey, plan) {
  const col = listRef(db, departmentId, listKey).collection(ITEMS_SUBCOLLECTION);
  const ops = [
    ...plan.upserts.map((u) => (batch) => batch.set(col.doc(u.docId), u.data)),
    ...plan.deletes.map((docId) => (batch) => batch.delete(col.doc(docId))),
  ];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
    await batch.commit();
  }
  return ops.length;
}

/**
 * Replace a whole list. Per-item lists (and lists that don't exist yet) write
 * only what changed; array lists are rewritten as before.
 * @param {object} [headerFields] extra fields for the list header record
 */
async function replaceListItems(db, departmentId, listKey, items, { updatedBy = "system", headerFields = {} } = {}) {
  const now = new Date().toISOString();
  const current = await readList(db, departmentId, listKey);
  const meta = { departmentId, updatedAt: now, updated_at: now, updatedBy, ...headerFields };
  if (current.storage === "items" || !current.exists) {
    const { items: withIds } = ensureItemIds(stripUndefined(items));
    const plan = planListWrites(current.entries || new Map(), withIds);
    await commitPlan(db, departmentId, listKey, plan);
    await listRef(db, departmentId, listKey).set(
      { ...meta, storage: "items", items: FieldValue.delete(), itemCount: withIds.length },
      { merge: true },
    );
    return { storage: "items", writes: plan.upserts.length + plan.deletes.length };
  }
  await listRef(db, departmentId, listKey).set({ ...meta, items: stripUndefined(items) }, { merge: true });
  return { storage: "array", writes: 1 };
}

/** Number of items in a list without loading them all. */
async function countListItems(db, departmentId, listKey) {
  const header = await listRef(db, departmentId, listKey).get();
  if (!header.exists) return 0;
  if (isItemsStorage(header.data())) {
    const agg = await listRef(db, departmentId, listKey).collection(ITEMS_SUBCOLLECTION).count().get();
    return agg.data().count;
  }
  const items = header.data()?.items;
  return Array.isArray(items) ? items.length : 0;
}

module.exports = {
  readList,
  readListItems,
  replaceListItems,
  countListItems,
};
