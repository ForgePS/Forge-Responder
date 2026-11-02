import test from "node:test";
import assert from "node:assert/strict";
import { parseCadPayload } from "../../src/lib/neris/cadImport.js";

test("pasted CAD text: call number, explicit date, bare times joined to the date", () => {
  const { ok, payload } = parseCadPayload(
    "Call #: 2026-1187\nAddress: 220 Riverside Rd\nDate: 2026-11-01\nType: Structure fire\nDispatch time: 14:02\nArrival time: 14:08\nUnits: E1, L1",
  );
  assert.equal(ok, true);
  assert.equal(payload.incidentDate, "2026-11-01");
  assert.equal(payload.incidentAddress, "220 Riverside Rd");
  assert.equal(payload.incidentTypeSummary, "Structure fire");
  assert.equal(payload.cad.incidentNumber, "2026-1187");
  assert.equal(payload.cad.dispatchTime, "2026-11-01T14:02");
  assert.equal(payload.cad.arrivalTime, "2026-11-01T14:08");
  assert.deepEqual(payload.units.map((u) => u.unitId), ["E1", "L1"]);
});

test("a bare time is never used as the incident date", () => {
  const { payload } = parseCadPayload("Call #: 55\nDispatch time: 14:02");
  assert.equal(payload.incidentDate, undefined);
  assert.equal(payload.cad.dispatchTime, "14:02");
});

test("JSON with a full dispatch date-time supplies the date", () => {
  const { payload } = parseCadPayload('{"incident_number":"X1","dispatch_time":"2026-10-30T09:15:00","address":"1 Main"}');
  assert.equal(payload.incidentDate, "2026-10-30");
  assert.equal(payload.cad.incidentNumber, "X1");
});
