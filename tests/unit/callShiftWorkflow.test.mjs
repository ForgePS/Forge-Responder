import { test } from "node:test";
import assert from "node:assert/strict";
import { callShiftAssignments, isAssignedToCallShift, isCallShiftOpenFor, withCallShiftAssigned } from "../../src/lib/callShiftWorkflow.js";

const base = { id: "CS-1", status: "active", positionsNeeded: 2, previewSnapshot: { eligible: [{ personnelId: "A" }, { personnelId: "B" }, { personnelId: "C" }] } };

test("a broadcast is only shown to the members it was sent to", () => {
  assert.ok(isCallShiftOpenFor(base, "A"));
  assert.ok(!isCallShiftOpenFor(base, "Z"));
  assert.ok(!isCallShiftOpenFor({ ...base, previewSnapshot: { eligible: [] } }, "A"), "empty list is open to no one");
  assert.ok(!isCallShiftOpenFor({ id: "x", status: "active" }, "A"), "missing list is open to no one");
});

test("multi-seat broadcasts stay open until every seat is filled", () => {
  const one = withCallShiftAssigned(base, { personnelId: "A", name: "Alice" });
  assert.equal(one.status, "active");
  assert.ok(isCallShiftOpenFor(one, "B"));
  assert.ok(isAssignedToCallShift(one, "A"));
  const two = withCallShiftAssigned(one, { personnelId: "B", name: "Bob" });
  assert.equal(two.status, "filled");
  assert.deepEqual(callShiftAssignments(two).map((a) => a.personnelId), ["A", "B"]);
  const again = withCallShiftAssigned(one, { personnelId: "A", name: "Alice" });
  assert.equal(callShiftAssignments(again).length, 1, "assigning the same person twice doesn't take two seats");
});
