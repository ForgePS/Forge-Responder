// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  floorsInRevision,
  addObject,
  alignObjects,
  calibrateScale,
  createHistory,
  deleteObjects,
  describeMeasurement,
  duplicateObjects,
  expandSelectionToGroups,
  floorPlanToStorage,
  geometryError,
  groupObjects,
  moveObjects,
  normalizeFloorObject,
  normalizeFloorPlan,
  pushHistory,
  redo,
  retypeObjects,
  rotateObjects,
  setLayer,
  snapToObjects,
  typesLike,
  undo,
  updateObjects,
  validateForPublication,
  verifyObjects,
  withoutRejected,
} from "../../src/lib/preplans/floorPlanModel.js";
import { findSymbol, mergeSymbolCatalog, searchSymbols, STARTER_SYMBOLS } from "../../src/lib/preplans/symbolCatalog.js";

const room = { type: "room", name: "Lobby", geometry: { points: [[0, 0], [100, 0], [100, 50], [0, 50]] } };
const wall = { type: "exterior_wall", geometry: { points: [[0, 0], [200, 0]] } };
const fdc = { type: "symbol", symbolId: "fdc", geometry: { points: [[10, 10]] } };

describe("floor plan geometry", () => {
  it("rejects invalid geometry", () => {
    assert.match(geometryError("polygon", [[0, 0], [1, 1]]), /three points/);
    assert.match(geometryError("polygon", [[0, 0], [1, 1], [2, 2]]), /zero size/);
    assert.match(geometryError("line", [[1, 1], [1, 1]]), /different/);
    assert.match(geometryError("point", [[0, Number.NaN]]), /invalid coordinate/);
    assert.equal(geometryError("polygon", room.geometry.points), "");
  });

  it("drops unknown types and bad geometry instead of storing them", () => {
    assert.equal(normalizeFloorObject({ type: "teleporter", geometry: { points: [[0, 0]] } }), null);
    assert.equal(normalizeFloorObject({ type: "room", geometry: { points: [[0, 0]] } }), null);
    const plan = normalizeFloorPlan({ objects: [room, { type: "nope" }, wall] });
    assert.equal(plan.objects.length, 2);
  });

  it("keeps ids and cleans properties", () => {
    const object = normalizeFloorObject({ ...room, id: "o-1", properties: { occupantLoad: 40, "bad key": "x", nested: { a: 1 } } });
    assert.equal(object.id, "o-1");
    assert.deepEqual(object.properties, { occupantLoad: 40 });
    assert.equal(object.source.confidence, "unknown");
  });

  it("only keeps verifier fields on verified objects", () => {
    const object = normalizeFloorObject({ ...fdc, verificationStatus: "pending", verifiedBy: "u1" });
    assert.equal(object.verifiedBy, "");
  });
});

describe("storage form", () => {
  it("has no nested arrays (Firestore rejects them) and reads back unchanged", () => {
    const plan = addObject(addObject(normalizeFloorPlan({}), { ...room, id: "r1" }), { ...fdc, id: "s1" });
    const stored = floorPlanToStorage(plan);
    const hasNested = (value) => Array.isArray(value)
      ? value.some((item) => Array.isArray(item) || hasNested(item))
      : value && typeof value === "object" ? Object.values(value).some(hasNested) : false;
    assert.equal(hasNested(stored), false);
    assert.deepEqual(stored.objects[0].geometry.points[1], { x: 100, y: 0 });
    assert.deepEqual(normalizeFloorPlan(JSON.parse(JSON.stringify(stored))).objects, plan.objects);
  });
});

describe("floor plan editing", () => {
  it("adds, moves, rotates and deletes", () => {
    let plan = normalizeFloorPlan({});
    plan = addObject(plan, { ...room, id: "r1" });
    plan = moveObjects(plan, ["r1"], 10, 5);
    assert.deepEqual(plan.objects[0].geometry.points[0], [10, 5]);
    plan = rotateObjects(plan, ["r1"], 90);
    const box = plan.objects[0].geometry.points;
    assert.equal(box.length, 4);
    plan = deleteObjects(plan, ["r1"]);
    assert.equal(plan.objects.length, 0);
  });

  it("refuses to add an invalid shape with a readable error", () => {
    assert.throws(() => addObject(normalizeFloorPlan({}), { type: "room", geometry: { points: [[0, 0], [1, 1]] } }), /three points/);
  });

  it("does not edit locked objects or locked layers, but can unlock", () => {
    let plan = addObject(normalizeFloorPlan({}), { ...wall, id: "w1", locked: true });
    assert.equal(moveObjects(plan, ["w1"], 5, 5), plan);
    assert.equal(deleteObjects(plan, ["w1"]), plan);
    plan = updateObjects(plan, ["w1"], { locked: false });
    assert.equal(plan.objects[0].locked, false);
    plan = setLayer(plan, "structure", { locked: true });
    assert.equal(moveObjects(plan, ["w1"], 5, 5), plan);
  });

  it("duplicates with new ids and resets verification", () => {
    let plan = addObject(normalizeFloorPlan({}), { ...fdc, id: "s1", verificationStatus: "verified", verifiedBy: "u" });
    const result = duplicateObjects(plan, ["s1"]);
    plan = result.plan;
    assert.equal(plan.objects.length, 2);
    assert.notEqual(result.ids[0], "s1");
    assert.equal(plan.objects[1].verificationStatus, "unverified");
  });

  it("groups expand selection and align moves boxes", () => {
    let plan = addObject(addObject(normalizeFloorPlan({}), { ...room, id: "a" }), {
      type: "room", id: "b", geometry: { points: [[300, 100], [350, 100], [350, 150]] },
    });
    const grouped = groupObjects(plan, ["a", "b"]);
    assert.deepEqual(expandSelectionToGroups(grouped.plan, ["a"]).sort(), ["a", "b"]);
    plan = alignObjects(plan, ["a", "b"], "left");
    assert.equal(Math.min(...plan.objects[1].geometry.points.map((p) => p[0])), 0);
  });

  it("snaps to a nearby vertex before the grid", () => {
    const plan = addObject(normalizeFloorPlan({}), { ...wall });
    assert.deepEqual(snapToObjects([197, 3], plan.objects, 8, 20), [200, 0]);
    assert.deepEqual(snapToObjects([57, 33], plan.objects, 8, 20), [60, 40]);
  });

  it("undo and redo step through snapshots", () => {
    const empty = normalizeFloorPlan({});
    let history = createHistory(empty);
    history = pushHistory(history, addObject(empty, room));
    assert.equal(history.present.objects.length, 1);
    history = undo(history);
    assert.equal(history.present.objects.length, 0);
    history = redo(history);
    assert.equal(history.present.objects.length, 1);
    assert.equal(undo(createHistory(empty)).present, empty);
  });
});

describe("changing an object's type", () => {
  it("only to a type of the same shape, moving it to that type's layer, and never when locked", () => {
    assert.deepEqual(typesLike("line"), ["exterior_wall", "interior_wall", "line"]);
    assert.deepEqual(typesLike("text"), []);
    let plan = normalizeFloorPlan({});
    plan = addObject(plan, { id: "l1", type: "line", geometry: { points: [[0, 0], [100, 0]] }, verificationStatus: "pending", source: { kind: "smartplan_lines" } });
    plan = addObject(plan, { id: "l2", type: "line", locked: true, geometry: { points: [[0, 10], [100, 10]] } });
    plan = addObject(plan, { id: "a1", type: "area", geometry: { points: [[0, 0], [10, 0], [10, 10]] } });
    const next = retypeObjects(plan, ["l1", "l2", "a1"], "exterior_wall", "u1");
    const byId = Object.fromEntries(next.objects.map((row) => [row.id, row]));
    assert.equal(byId.l1.type, "exterior_wall");
    assert.equal(byId.l1.layer, "structure");
    assert.equal(byId.l1.verificationStatus, "pending", "still a proposal to review");
    assert.equal(byId.l1.source.kind, "smartplan_lines");
    assert.equal(byId.l2.type, "line", "locked");
    assert.equal(byId.a1.type, "area", "different shape");
    assert.equal(retypeObjects(plan, ["a1"], "door"), plan);
  });
});

describe("scale and measurement", () => {
  it("calibrates and reports real units", () => {
    const scale = calibrateScale([0, 0], [100, 0], 25, "ft");
    assert.equal(scale.pxPerUnit, 4);
    const plan = normalizeFloorPlan({ scale });
    const lobby = normalizeFloorObject(room);
    assert.equal(describeMeasurement(plan, lobby), "313 sq ft");
    assert.equal(describeMeasurement(normalizeFloorPlan({}), normalizeFloorObject(wall)), "200 px");
  });

  it("refuses a zero calibration", () => {
    assert.throws(() => calibrateScale([1, 1], [1, 1], 10), /two different points/);
    assert.throws(() => calibrateScale([0, 0], [1, 1], 0), /real distance/);
  });
});

describe("publication checks", () => {
  it("blocks pending proposals and unverified critical symbols", () => {
    let plan = addObject(normalizeFloorPlan({}), { ...fdc, id: "s1" });
    plan = addObject(plan, { ...room, id: "r1", verificationStatus: "pending" });
    const result = validateForPublication(plan);
    assert.equal(result.ok, false);
    assert.equal(result.problems.length, 2);
    plan = verifyObjects(plan, ["s1"], "u1");
    plan = updateObjects(plan, ["r1"], { verificationStatus: "rejected" });
    assert.equal(validateForPublication(withoutRejected(plan)).ok, true);
    assert.equal(withoutRejected(plan).objects.length, 1);
  });

  it("non-critical symbols don't need verification", () => {
    const plan = addObject(normalizeFloorPlan({}), { type: "symbol", symbolId: "staging", geometry: { points: [[1, 1]] } });
    assert.equal(validateForPublication(plan).ok, true);
  });
});

describe("symbol catalog", () => {
  it("covers every spec category and keeps old checklist ids", () => {
    for (const id of ["hydrant", "fdc", "standpipe", "knox", "primary_entry", "alarm_panel", "sprinkler_riser", "gas_shutoff", "hazmat", "staging", "command"]) {
      assert.notEqual(findSymbol(id).id, "unknown", id);
    }
    assert.equal(new Set(STARTER_SYMBOLS.map((row) => row.id)).size, STARTER_SYMBOLS.length);
    assert.ok(STARTER_SYMBOLS.every((row) => row.glyph && row.shape), "meaning is not color-only");
  });

  it("merges custom symbols without overriding starters", () => {
    const merged = mergeSymbolCatalog([{ id: "fdc", label: "Hijack" }, { id: "Pool Chem!", label: "Pool chemicals", color: "red", critical: true }]);
    assert.equal(findSymbol("fdc", merged).label, "Fire department connection");
    const custom = findSymbol("pool_chem_", merged);
    assert.equal(custom.label, "Pool chemicals");
    assert.equal(custom.color, "#616161");
    assert.equal(findSymbol("missing", merged).id, "unknown");
  });

  it("searches by label, glyph and category", () => {
    assert.deepEqual(searchSymbols("shutoff").map((row) => row.id), ["gas_shutoff", "water_shutoff"]);
    assert.equal(searchSymbols("FDC")[0].id, "fdc");
    assert.ok(searchSymbols("utilities").some((row) => row.id === "generator"));
  });
});

describe("floors in a revision", () => {
  const floors = [
    { id: "F1", archived: false },
    { id: "F2", archived: true, archivedFromRevisionId: "R2" },
    { id: "F3", archived: true, archivedFromRevisionId: "" },
  ];
  it("a published revision keeps a floor removed later in a draft", () => {
    const published = [{ floorId: "F1" }, { floorId: "F2" }, { floorId: "F3" }];
    assert.deepEqual(floorsInRevision(floors, published, "R1").map((row) => row.id), ["F1", "F2", "F3"]);
  });
  it("the draft it was removed in, and later revisions without its plan, don't", () => {
    assert.deepEqual(floorsInRevision(floors, [{ floorId: "F1" }, { floorId: "F2" }], "R2").map((row) => row.id), ["F1"]);
    assert.deepEqual(floorsInRevision(floors, [{ floorId: "F1" }], "R3").map((row) => row.id), ["F1"]);
  });
});
