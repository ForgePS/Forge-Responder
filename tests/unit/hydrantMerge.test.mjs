import test from "node:test";
import assert from "node:assert/strict";
import { applyHydrantUpdates } from "../../src/lib/hydrantMerge.js";

const docId = (...parts) => parts.filter((p) => p !== undefined && p !== null && String(p).trim()).join("-");
const finalize = (base, saved) => ({ ...base, ...saved });
const helpers = { finalize, docId };

// The previous algorithm (updateHydrantList applied once per saved record), with
// blank ids not counting as a match.
function slowMerge(base, savedList) {
  const same = (a, b) => Boolean(a) && a === b;
  return savedList.reduce((list, saved) => {
    let found = false;
    const updated = list.map((hydrant) => {
      const match = ((saved.location_id || saved.hydrant_id) && docId(hydrant.location_id, hydrant.hydrant_id) === docId(saved.location_id, saved.hydrant_id))
        || same(hydrant.location_id, saved.location_id)
        || same(hydrant.hydrant_id, saved.hydrant_id)
        || same(hydrant.official_hydrant_id, saved.official_hydrant_id);
      if (match) found = true;
      return match ? finalize(hydrant, saved) : hydrant;
    });
    return found ? updated : [saved, ...updated];
  }, base);
}

const hydrant = (n, extra = {}) => ({ location_id: `LOC-${n}`, hydrant_id: `RV ${n}`, official_hydrant_id: `OFF-${n}`, status: "In Service", ...extra });

test("the indexed merge gives the same hydrants as merging one at a time", () => {
  const base = Array.from({ length: 200 }, (_, n) => hydrant(n));
  const saved = [
    hydrant(5, { status: "Out of Service" }),
    { location_id: "LOC-9", hydrant_id: "RV 9", status: "Out of Service", notes: "cap missing" },
    { hydrant_id: "RV 12", notes: "matched by hydrant id only" },
    { official_hydrant_id: "OFF-20", notes: "matched by official id only" },
    hydrant(500, { notes: "new hydrant" }),
    hydrant(501, { notes: "another new hydrant" }),
    hydrant(500, { status: "Out of Service" }),
  ];
  assert.deepEqual(applyHydrantUpdates(base, saved, helpers), slowMerge(base, saved));
});

test("a saved record with blank ids doesn't overwrite hydrants that also lack them", () => {
  const base = [{ location_id: "LOC-1", hydrant_id: "RV 1" }, { location_id: "LOC-2", hydrant_id: "RV 2" }];
  const merged = applyHydrantUpdates(base, [{ location_id: "LOC-3", hydrant_id: "RV 3", notes: "new" }], helpers);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].notes, undefined);
});

test("5,000 hydrants with 5,000 saved records merge quickly", () => {
  const base = Array.from({ length: 5000 }, (_, n) => hydrant(n));
  const saved = Array.from({ length: 5000 }, (_, n) => hydrant(n, { status: "Out of Service" }));
  const started = Date.now();
  const merged = applyHydrantUpdates(base, saved, helpers);
  const ms = Date.now() - started;
  assert.equal(merged.length, 5000);
  assert.ok(merged.every((h) => h.status === "Out of Service"));
  assert.ok(ms < 1000, `took ${ms} ms`);
});
