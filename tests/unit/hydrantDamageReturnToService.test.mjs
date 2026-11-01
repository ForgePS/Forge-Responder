import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hydrantMatchesDamageReport,
  shouldOfferReturnToService,
} from "../../src/lib/hydrantDamage/returnToService.js";

const hydrantOos = { location_id: "LOC-1", hydrant_id: "H-101", status: "Out of Service" };
const before = { id: "R1", hydrantId: "LOC-1", status: "ready_for_verification", operationalStatus: "out_of_service" };
const after = { ...before, status: "closed", operationalStatus: "in_service" };

test("offers return to service when this report had the hydrant out of service", () => {
  assert.equal(shouldOfferReturnToService({ reportBefore: before, reportAfter: after, hydrant: hydrantOos, allReports: [before] }), true);
});

test("no offer when the report did not close", () => {
  assert.equal(shouldOfferReturnToService({ reportBefore: before, reportAfter: { ...after, status: "verified" }, hydrant: hydrantOos }), false);
});

test("no offer when the report never had the hydrant out of service", () => {
  assert.equal(shouldOfferReturnToService({ reportBefore: { ...before, operationalStatus: "in_service_limited" }, reportAfter: after, hydrant: hydrantOos }), false);
});

test("no offer when the hydrant is already in service", () => {
  assert.equal(shouldOfferReturnToService({ reportBefore: before, reportAfter: after, hydrant: { ...hydrantOos, status: "In Service" } }), false);
});

test("no offer when another open report keeps the hydrant out of service", () => {
  const other = { id: "R2", hydrantId: "LOC-1", status: "awaiting_acknowledgment", operationalStatus: "out_of_service" };
  assert.equal(shouldOfferReturnToService({ reportBefore: before, reportAfter: after, hydrant: hydrantOos, allReports: [before, other] }), false);
  const closedOther = { ...other, status: "closed" };
  assert.equal(shouldOfferReturnToService({ reportBefore: before, reportAfter: after, hydrant: hydrantOos, allReports: [before, closedOther] }), true);
});

test("no offer when the hydrant is unknown or does not match", () => {
  assert.equal(shouldOfferReturnToService({ reportBefore: before, reportAfter: after, hydrant: null }), false);
  assert.equal(shouldOfferReturnToService({ reportBefore: before, reportAfter: after, hydrant: { ...hydrantOos, location_id: "LOC-9", hydrant_id: "H-9" } }), false);
});

test("hydrantMatchesDamageReport matches location_id or hydrant_id", () => {
  assert.equal(hydrantMatchesDamageReport({ location_id: "X", hydrant_id: "H-1" }, { hydrantId: "H-1" }), true);
  assert.equal(hydrantMatchesDamageReport({ location_id: "X" }, { hydrantId: "" }), false);
});
