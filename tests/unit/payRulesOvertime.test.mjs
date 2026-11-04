import test from "node:test";
import assert from "node:assert/strict";
import { normalizePayRules } from "../../src/lib/payRules.js";

test("the overtime threshold a department saves is the one used", () => {
  assert.equal(normalizePayRules({ overtimeThresholdHours: 96 }).overtimeThresholdHours, 96);
  assert.equal(normalizePayRules({ overtimeThresholdHours: 212 }).overtimeThresholdHours, 212);
  assert.equal(normalizePayRules({}).overtimeThresholdHours, 106);
});
