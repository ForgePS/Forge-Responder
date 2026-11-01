// FORGE Field: conflict rules, validation, sync error handling, paths.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSameOrNewerDate, resolveConflicts, sameValue, setPath, threeWayMerge } from "../../src/field/fieldMerge.js";
import {
  calculateFlowGpm,
  localDate,
  validateDailyLog,
  validateDamageForm,
  validateFlowTest,
  validateHoseTest,
  validateIncident,
  validateTruckCheck,
} from "../../src/field/fieldValidation.js";
import {
  FieldConflictError,
  FieldRejectedError,
  backoffMs,
  classifySyncError,
  isNetworkError,
} from "../../src/field/fieldErrors.js";
import { isFieldAppPath, rmsPathFromFieldPath } from "../../src/field/fieldPaths.js";

describe("threeWayMerge", () => {
  const paths = ["crew", "notes"];

  it("takes the device change when the server didn't change the field", () => {
    const base = { crew: ["A"], notes: "start" };
    const mine = { crew: ["A"], notes: "start + field" };
    const server = { crew: ["A", "B"], notes: "start", other: 1 };
    const { merged, conflicts } = threeWayMerge(base, mine, server, paths);
    assert.deepEqual(conflicts, []);
    assert.equal(merged.notes, "start + field");
    assert.deepEqual(merged.crew, ["A", "B"], "server-only change kept");
    assert.equal(merged.other, 1, "fields the field app doesn't edit are kept");
  });

  it("flags a conflict when both sides changed the same field differently", () => {
    const base = { notes: "start" };
    const { conflicts } = threeWayMerge(base, { notes: "field" }, { notes: "desk" }, ["notes"]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].mine, "field");
    assert.equal(conflicts[0].server, "desk");
  });

  it("is not a conflict when both sides made the same change", () => {
    const { conflicts } = threeWayMerge({ notes: "a" }, { notes: "b" }, { notes: "b" }, ["notes"]);
    assert.deepEqual(conflicts, []);
  });

  it("new record on a device: fills blanks on an existing server copy, flags real differences", () => {
    const fill = threeWayMerge(null, { notes: "field" }, { notes: "" }, ["notes"]);
    assert.equal(fill.merged.notes, "field");
    assert.deepEqual(fill.conflicts, []);
    const clash = threeWayMerge(null, { notes: "field" }, { notes: "desk" }, ["notes"]);
    assert.equal(clash.conflicts.length, 1);
  });

  it("works on nested paths", () => {
    const base = { workspace: { cad: { arrivalTime: "" } } };
    const mine = { workspace: { cad: { arrivalTime: "2026-10-23T10:05" } } };
    const server = { workspace: { cad: { arrivalTime: "", dispatchTime: "2026-10-23T10:00" } } };
    const { merged, conflicts } = threeWayMerge(base, mine, server, ["workspace.cad.arrivalTime"]);
    assert.deepEqual(conflicts, []);
    assert.equal(merged.workspace.cad.arrivalTime, "2026-10-23T10:05");
    assert.equal(merged.workspace.cad.dispatchTime, "2026-10-23T10:00");
  });

  it("no server copy: the device copy is written as is", () => {
    const { merged, conflicts } = threeWayMerge(null, { notes: "x" }, null, ["notes"]);
    assert.equal(merged.notes, "x");
    assert.deepEqual(conflicts, []);
  });
});

describe("resolveConflicts and helpers", () => {
  it("keeps mine, theirs, or both", () => {
    const conflicts = [
      { path: "notes", mine: "field", server: "desk" },
      { path: "crew", mine: ["A"], server: ["B"] },
    ];
    assert.equal(resolveConflicts({}, conflicts, { notes: "server" }).notes, "desk");
    const both = resolveConflicts({}, conflicts, { notes: "both", crew: "both" });
    assert.equal(both.notes, "desk\n\nfield");
    assert.deepEqual(both.crew, ["B", "A"]);
  });

  it("treats empty values as equal and compares objects by content", () => {
    assert.ok(sameValue("", undefined));
    assert.ok(sameValue([], null));
    assert.ok(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 }));
    assert.ok(!sameValue("a", "b"));
  });

  it("setPath doesn't mutate the original", () => {
    const original = { a: { b: 1 } };
    const next = setPath(original, "a.c", 2);
    assert.deepEqual(original, { a: { b: 1 } });
    assert.deepEqual(next, { a: { b: 1, c: 2 } });
  });

  it("only applies a hydrant summary when it isn't older than the server's", () => {
    assert.ok(isSameOrNewerDate("2026-10-23", ""));
    assert.ok(isSameOrNewerDate("2026-10-23", "2026-10-22"));
    assert.ok(isSameOrNewerDate("2026-10-23", "2026-10-23"));
    assert.ok(!isSameOrNewerDate("2026-10-20", "2026-10-23"));
  });
});

describe("field validation", () => {
  const template = {
    sections: [{
      id: "s1",
      fields: [
        { key: "heading", type: "heading", label: "Cab" },
        { key: "lights", type: "pass_fail", label: "Lights", required: true, noteRequiredOnFail: true },
        { key: "brakes", type: "pass_fail", label: "Brakes", required: true, failAction: "oos" },
        { key: "horn", type: "pass_fail", label: "Horn", required: false },
        { key: "fuel", type: "fuel_level", label: "Fuel", required: true },
      ],
    }],
  };

  it("truck check: required items, fail notes and number ranges", () => {
    const empty = validateTruckCheck({ template, answers: {} });
    assert.ok(empty.lights && empty.brakes && empty.fuel);
    assert.ok(!empty.horn, "optional items aren't forced");
    assert.ok(!empty.heading, "headings aren't questions");
    const failed = validateTruckCheck({ template, answers: { lights: "Fail", brakes: "Fail", fuel: "120" }, failNotes: {} });
    assert.ok(failed["lights:note"], "note required on fail");
    assert.ok(failed["brakes:note"], "out-of-service fails need a reason");
    assert.ok(failed.fuel, "fuel is 0-100%");
    const ok = validateTruckCheck({ template, answers: { lights: "Pass", brakes: "Pass", fuel: "75" } });
    assert.deepEqual(ok, {});
  });

  it("flow test: pressures must be plausible", () => {
    const base = { hydrant: {}, date: "2026-10-23", shift: "A", testedBy: "X" };
    assert.deepEqual(validateFlowTest({ ...base, staticPsi: "72", residualPsi: "58", pitotPsi: "38" }), {});
    assert.ok(validateFlowTest({ ...base, staticPsi: "50", residualPsi: "60", pitotPsi: "38" }).residualPsi);
    assert.ok(validateFlowTest({ ...base, staticPsi: "7200", residualPsi: "58", pitotPsi: "38" }).staticPsi);
    assert.equal(calculateFlowGpm("2.5", "38"), 1034);
    assert.equal(calculateFlowGpm("2.5", ""), "");
  });

  it("other forms", () => {
    assert.ok(validateHoseTest({ testDate: "x", shift: "A", hoseIds: [], result: "Passed", testedBy: "x" }).hoseIds);
    assert.ok(validateHoseTest({ testDate: "x", shift: "A", hoseIds: ["1"], result: "Failed", testedBy: "x" }).notes);
    assert.ok(validateDamageForm({ date: "x", location: "", description: "" }).location);
    assert.ok(validateDailyLog({ date: "x", shift: "A", apparatus: "E1", crew: [], notes: "" }).notes);
    const incident = validateIncident({ incidentDate: "x", incidentAddress: "y", incidentTypeSummary: "z", workspace: { cad: { dispatchTime: "2026-10-23T10:00", arrivalTime: "2026-10-23T09:00" } } });
    assert.ok(incident.arrivalTime);
  });

  it("localDate uses the local calendar day", () => {
    assert.equal(localDate(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  });
});

describe("sync error handling", () => {
  it("refused writes need the crew; connection problems retry", () => {
    assert.equal(classifySyncError({ code: "permission-denied" }), "rejected");
    assert.equal(classifySyncError({ code: "storage/unauthorized" }), "rejected");
    assert.equal(classifySyncError(new FieldRejectedError("locked")), "rejected");
    assert.equal(classifySyncError(new FieldConflictError("both changed")), "conflict");
    assert.equal(classifySyncError({ code: "unavailable" }), "retry");
    assert.equal(classifySyncError(Object.assign(new Error("Timed out"), { name: "TimeoutError" })), "retry");
    assert.equal(classifySyncError(new Error("anything else")), "retry");
  });

  it("recognises network errors and backs off up to 10 minutes", () => {
    assert.ok(isNetworkError({ code: "unavailable" }));
    assert.ok(isNetworkError(new TypeError("Failed to fetch")));
    assert.ok(!isNetworkError({ code: "permission-denied" }));
    assert.equal(backoffMs(1), 15_000);
    assert.equal(backoffMs(2), 30_000);
    assert.equal(backoffMs(20), 600_000);
  });
});

describe("field app paths", () => {
  it("matches /field and /<department>/field only", () => {
    assert.ok(isFieldAppPath("/field"));
    assert.ok(isFieldAppPath("/field/"));
    assert.ok(isFieldAppPath("/camden/field"));
    assert.ok(!isFieldAppPath("/"));
    assert.ok(!isFieldAppPath("/camden"));
    assert.ok(!isFieldAppPath("/fieldwork"));
    assert.ok(!isFieldAppPath("/a/b/field"));
  });

  it("links back to the department's RMS", () => {
    assert.equal(rmsPathFromFieldPath("/camden/field"), "/camden");
    assert.equal(rmsPathFromFieldPath("/field"), "/");
  });
});
