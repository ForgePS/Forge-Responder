/**
 * Merge saved hydrant records into a base list (no Firebase here, so it can be
 * tested on its own). A saved record updates every hydrant sharing its location
 * id, hydrant id, official id or document id; one that matches nothing is added
 * at the front. Blank ids never count as a match.
 *
 * Gives the same result as checking each saved record against the whole list in
 * turn, but indexed, so thousands of hydrants merge in milliseconds.
 *
 * @param {object[]} baseList
 * @param {object[]} savedList
 * @param {{ finalize: (base: object, saved: object) => object, docId: (locationId: string, hydrantId: string) => string }} helpers
 */
export function applyHydrantUpdates(baseList = [], savedList = [], { finalize, docId }) {
  const matchKeys = (hydrant = {}) => {
    const keys = [];
    if (hydrant.location_id || hydrant.hydrant_id) keys.push(`doc:${docId(hydrant.location_id, hydrant.hydrant_id)}`);
    if (hydrant.location_id) keys.push(`loc:${hydrant.location_id}`);
    if (hydrant.hydrant_id) keys.push(`hyd:${hydrant.hydrant_id}`);
    if (hydrant.official_hydrant_id) keys.push(`off:${hydrant.official_hydrant_id}`);
    return keys;
  };

  const items = [...baseList];
  const prepended = [];
  const index = new Map();
  const read = (ref) => (ref.list === "base" ? items[ref.i] : prepended[ref.i]);
  const write = (ref, value) => {
    if (ref.list === "base") items[ref.i] = value;
    else prepended[ref.i] = value;
  };
  const add = (ref, hydrant) => {
    for (const key of matchKeys(hydrant)) {
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(ref);
    }
  };
  const remove = (ref, hydrant) => {
    for (const key of matchKeys(hydrant)) index.get(key)?.delete(ref);
  };

  items.forEach((hydrant, i) => add({ list: "base", i }, hydrant));

  for (const saved of savedList) {
    if (!saved) continue;
    const matches = new Set();
    for (const key of matchKeys(saved)) {
      for (const ref of index.get(key) || []) matches.add(ref);
    }
    if (!matches.size) {
      const ref = { list: "pre", i: prepended.length };
      prepended.push(saved);
      add(ref, saved);
      continue;
    }
    for (const ref of matches) {
      const before = read(ref);
      const after = finalize(before, saved);
      remove(ref, before);
      write(ref, after);
      add(ref, after);
    }
  }
  return [...prepended.reverse(), ...items];
}
