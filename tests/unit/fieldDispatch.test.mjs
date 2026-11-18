// Starting a patient care report from an Active911 dispatch (src/field/fieldDispatch.js).
import test from "node:test";
import assert from "node:assert/strict";
import { loadNemsisSchema } from "./helpers/nemsisSchema.mjs";
import { ANSI_STATE_CODES, ansiStateCode, dispatchPrefill, gpsLocation, recentDispatches } from "../../src/field/fieldDispatch.js";
import { newPcrRecordData } from "../../src/field/fieldPcr.js";
import { getValue, postCheck } from "../../src/lib/nemsis/pcrModel.js";

const schema = loadNemsisSchema("3.5.1");
const now = new Date("2026-11-17T18:00:00Z");
const alert = (id, sentAt, extra = {}) => ({ id, sentAt, description: "Chest pain", address: "100 Main St", city: "Riverside", state: "NC", units: "M1", latitude: 35.7796, longitude: -78.6382, ...extra });

test("recent dispatches: newest first, within the window, real alerts only", () => {
  const list = recentDispatches([
    alert("old", "2026-11-17T01:00:00Z"),
    alert("a", "2026-11-17T17:30:00Z"),
    alert("b", "2026-11-17 17:50:00Z"),
    { description: "no id", sentAt: "2026-11-17T17:55:00Z" },
    alert("bad-time", "not a time"),
    alert("future", "2026-11-18T18:00:00Z"),
  ], { now, hours: 12 });
  assert.deepEqual(list.map((d) => d.id), ["b", "a"]);
  assert.equal(list[0].sentAt, "2026-11-17T17:50:00.000Z");
  assert.deepEqual(recentDispatches(list, { now, hours: 12 }).map((d) => d.id), ["b", "a"], "already-downloaded items filter again");
});

test("state codes and GPS follow the NEMSIS formats", () => {
  assert.equal(Object.keys(ANSI_STATE_CODES).length, 56);
  assert.equal(ansiStateCode("nc"), "37");
  assert.equal(ansiStateCode("37"), "37");
  assert.equal(ansiStateCode("XX"), "");
  assert.equal(ansiStateCode("03"), "", "03 isn't a state code");
  assert.equal(gpsLocation(35.77961234, -78.638), "35.779612,-78.638");
  assert.equal(gpsLocation(null, -78), "");
  assert.equal(gpsLocation(0, 0), "", "0,0 means no fix");
  assert.equal(gpsLocation(95, 10), "");
});

test("a report started from a dispatch has the notified time, scene address, GPS and state, and they validate", () => {
  const [dispatch] = recentDispatches([alert("a", "2026-11-17T17:30:00Z", { address: "100 Main St Apt 4" })], { now });
  const cad = dispatchPrefill(dispatch);
  assert.equal(Date.parse(cad.notified), Date.parse("2026-11-17T17:30:00Z"));
  assert.match(cad.notified, /[+-]\d{2}:\d{2}$/, "with the device offset, as NEMSIS requires");
  const data = newPcrRecordData(schema, { uuid: "0b6f6d1e-1c1a-4d55-9a57-3f1f3b7f0c11", number: "P-1", softwareVersion: "1.0.0", uid: "u1", agency: { number: "T001" }, cad });
  const pcr = data.nemsis;
  assert.equal(getValue(schema, pcr, "eTimes.03"), cad.notified);
  assert.equal(getValue(schema, pcr, "eScene.15"), "100 Main St Apt 4");
  assert.equal(getValue(schema, pcr, "eScene.11"), "35.7796,-78.6382");
  assert.equal(getValue(schema, pcr, "eScene.18"), "37");
  const prefilled = new Set(["eTimes.03", "eScene.11", "eScene.15", "eScene.18"]);
  assert.deepEqual(postCheck(schema, pcr).issues.filter((i) => prefilled.has(i.element) && i.code === "invalidValue"), []);
  assert.deepEqual(dispatchPrefill(null), {});
});
