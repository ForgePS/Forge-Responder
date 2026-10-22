/**
 * Per-item list storage: planning only (no Firebase), shared by the app, the
 * server functions (functions/lib/listItemsPlan.js is a line-for-line CommonJS
 * copy, kept in step by tests/unit/listItemsPlan.test.mjs) and scripts.
 *
 * A department list used to be one record, departments/<id>/lists/<key>, with
 * every item in an `items` array (1 MB limit, and every save rewrote the lot).
 * Once migrated, that record is only a header ({ storage: "items" }) and each
 * item is its own record at departments/<id>/lists/<key>/items/<docId>, with an
 * `_order` number that keeps the list's order. Saves write only what changed.
 */

export const ITEMS_STORAGE = "items";
export const ITEMS_SUBCOLLECTION = "items";
export const ORDER_FIELD = "_order";
const STEP = 1024;
const MIN_GAP = 1e-6;

/** True when a list header says its items live in per-item records. */
export function isItemsStorage(header) {
  return Boolean(header && header.storage === ITEMS_STORAGE);
}

/** Firestore-safe record id for an item id ("/" and reserved names encoded). */
export function itemDocId(id) {
  const text = String(id ?? "").trim();
  if (!text) throw new Error("List item has no id");
  const encoded = encodeURIComponent(text).replace(/\./g, "%2E");
  return /^__.*__$/.test(encoded) ? `%5F${encoded.slice(1)}` : encoded;
}

export function itemIdFromDocId(docId) {
  try {
    return decodeURIComponent(docId);
  } catch {
    return docId;
  }
}

function newItemId() {
  const random = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `itm-${Date.now().toString(36)}-${random}`;
}

/**
 * Every item needs a unique id to become its own record. Returns the items
 * with ids filled in (missing ones generated, repeated ones suffixed) and
 * whether anything changed.
 */
export function ensureItemIds(items = []) {
  const seen = new Set();
  let changed = false;
  const next = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    let id = String(item.id ?? "").trim();
    if (!id) {
      id = newItemId();
    } else if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    seen.add(id);
    if (id === item.id) return item;
    changed = true;
    return { ...item, id };
  });
  return { items: next, changed };
}

/** Ids that appear more than once (a list with these can't migrate as-is). */
export function duplicateItemIds(items = []) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of items) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/** Indices of the longest strictly increasing run of known orders (kept as-is). */
function longestIncreasing(orders) {
  const tails = [];
  const tailIdx = [];
  const prev = new Array(orders.length).fill(-1);
  orders.forEach((value, i) => {
    if (value == null) return;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = value;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  });
  const keep = new Set();
  let i = tailIdx[tails.length - 1];
  while (i !== undefined && i !== -1) {
    keep.add(i);
    i = prev[i];
  }
  return keep;
}

/**
 * Orders for a list in its new sequence, reusing existing orders where they
 * still fit so moving or adding one item rewrites only that item.
 * @param {Array<number|null|undefined>} existing order per position (null = new item)
 * @returns {number[]}
 */
export function planOrders(existing) {
  const n = existing.length;
  const keep = longestIncreasing(existing);
  const orders = new Array(n);
  let i = 0;
  while (i < n) {
    if (keep.has(i)) {
      orders[i] = existing[i];
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && !keep.has(j)) j += 1;
    const lo = i > 0 ? orders[i - 1] : null;
    const hi = j < n ? existing[j] : null;
    const count = j - i;
    for (let t = 0; t < count; t += 1) {
      if (lo == null && hi == null) orders[i + t] = (t + 1) * STEP;
      else if (lo == null) orders[i + t] = hi - (count - t) * STEP;
      else if (hi == null) orders[i + t] = lo + (t + 1) * STEP;
      else {
        const step = (hi - lo) / (count + 1);
        if (!(step > MIN_GAP)) return existing.map((_, k) => (k + 1) * STEP);
        orders[i + t] = lo + (t + 1) * step;
      }
    }
    i = j;
  }
  return orders;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** What the server already holds for one item, as remembered between saves. */
export function itemEntry(item, order) {
  const { [ORDER_FIELD]: _ignored, ...rest } = item || {};
  return { order, json: stableJson(rest) };
}

/**
 * Writes needed to turn the stored list into `nextItems`.
 * @param {Map<string, {order:number, json:string}>} stored id -> entry
 * @param {object[]} nextItems Firestore-ready items, each with a unique id
 * @returns {{ upserts: {id:string, docId:string, data:object}[], deletes: string[], entries: Map }}
 */
export function planListWrites(stored, nextItems) {
  const ids = nextItems.map((item) => String(item.id));
  const orders = planOrders(ids.map((id) => (stored.has(id) ? stored.get(id).order : null)));
  const upserts = [];
  const entries = new Map();
  nextItems.forEach((item, index) => {
    const id = ids[index];
    const { [ORDER_FIELD]: _ignored, ...data } = item;
    const entry = { order: orders[index], json: stableJson(data) };
    entries.set(id, entry);
    const before = stored.get(id);
    if (!before || before.order !== entry.order || before.json !== entry.json) {
      upserts.push({ id, docId: itemDocId(id), data: { ...data, [ORDER_FIELD]: entry.order } });
    }
  });
  const deletes = [...stored.keys()].filter((id) => !entries.has(id)).map(itemDocId);
  return { upserts, deletes, entries };
}

/** Items from per-item records, in list order, without the order field. */
export function itemsFromRecords(records = []) {
  return [...records]
    .sort((a, b) => (a.data?.[ORDER_FIELD] ?? 0) - (b.data?.[ORDER_FIELD] ?? 0))
    .map(({ docId, data }) => {
      const { [ORDER_FIELD]: _ignored, ...rest } = data || {};
      return { ...rest, id: rest.id ?? itemIdFromDocId(docId) };
    });
}

/** id -> entry map for records just read from the server. */
export function entriesFromRecords(records = []) {
  const map = new Map();
  for (const { docId, data } of records) {
    const id = String(data?.id ?? itemIdFromDocId(docId));
    map.set(id, itemEntry(data, data?.[ORDER_FIELD]));
  }
  return map;
}
