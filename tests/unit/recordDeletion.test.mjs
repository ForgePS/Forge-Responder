// Deleting inspections and preplans: the reason list and its checks.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DELETE_REASONS, OTHER_DELETE_REASON, deleteReasonProblem } from "../../src/lib/recordDeletionReasons.js";

const require = createRequire(import.meta.url);
const server = require("../../functions/lib/recordDeletion.js");

describe("delete reasons", () => {
  it("the RMS dropdown and the server accept the same reasons", () => {
    assert.deepEqual([...DELETE_REASONS], [...server.DELETE_REASONS]);
    assert.equal(OTHER_DELETE_REASON, server.OTHER_REASON);
  });

  it("a reason from the list is required; Other needs notes", () => {
    assert.equal(deleteReasonProblem("Duplicate record"), "");
    assert.match(deleteReasonProblem(""), /Choose why/);
    assert.match(deleteReasonProblem("Because I said so"), /Choose why/);
    assert.match(deleteReasonProblem(OTHER_DELETE_REASON, " "), /Explain why/);
    assert.equal(deleteReasonProblem(OTHER_DELETE_REASON, "Owner asked us to"), "");
  });

  it("the server checks the same way", () => {
    assert.deepEqual(server.cleanReason({ reason: "Duplicate record", notes: "  same as INS-2 " }), { reason: "Duplicate record", notes: "same as INS-2" });
    assert.throws(() => server.cleanReason({ reason: "made up" }), { code: "invalid-argument" });
    assert.throws(() => server.cleanReason({ reason: OTHER_DELETE_REASON, notes: "" }), { code: "invalid-argument" });
  });
});
