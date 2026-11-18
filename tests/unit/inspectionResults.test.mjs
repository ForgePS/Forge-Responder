// Each department's inspection Result choices.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INSPECTION_RESULTS, MAX_INSPECTION_RESULTS, cleanInspectionResults, inspectionResultOptions, inspectionResultTone, resultNeedsReinspection,
} from "../../src/lib/inspections/inspectionResults.js";

describe("inspection result choices", () => {
  it("use the defaults until a department sets its own", () => {
    assert.deepEqual(inspectionResultOptions(null), DEFAULT_INSPECTION_RESULTS);
    assert.deepEqual(inspectionResultOptions({ inspectionResults: [] }), DEFAULT_INSPECTION_RESULTS);
    assert.deepEqual(inspectionResultOptions({ inspectionResults: ["  ", ""] }), DEFAULT_INSPECTION_RESULTS);
  });

  it("use the department's own list, cleaned up", () => {
    assert.deepEqual(
      inspectionResultOptions({ inspectionResults: [" Approved ", "Correction notice", "approved", "", "Not   ready"] }),
      ["Approved", "Correction notice", "Not ready"],
    );
    const many = Array.from({ length: 50 }, (_, i) => `Result ${i}`);
    assert.equal(cleanInspectionResults(many).length, MAX_INSPECTION_RESULTS);
  });

  it("colour and reinspection hints work for custom names", () => {
    assert.equal(inspectionResultTone("Passed"), "ok");
    assert.equal(inspectionResultTone("Approved"), "ok");
    assert.equal(inspectionResultTone("Failed - life safety"), "bad");
    assert.equal(inspectionResultTone("Passed with conditions"), "warn");
    assert.ok(resultNeedsReinspection("Reinspect in 30 days"));
    assert.ok(resultNeedsReinspection("Failed"));
    assert.ok(!resultNeedsReinspection("Passed"));
  });
});
