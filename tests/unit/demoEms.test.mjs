// Demo EMS data shared by the online and offline demos (src/data/demoEms.js).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { DEMO_PCR_IDS, DEMO_PCR_ROLE_GRANTS, buildDemoPcrs } from "../../src/data/demoEms.js";
import { getValue } from "../../src/lib/nemsis/pcrModel.js";
import { defaultRoles } from "../../src/data/defaultRoles.js";

const schema = loadNemsisSchema("3.5.1");
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "demoPcrSample.json"), "utf8"));

test("demo sample reports: two posted (one missing a time), one draft, all charted by the demo crew", () => {
  const now = new Date("2026-11-18T15:00:00Z");
  const reports = buildDemoPcrs(schema, { sample, crewUid: "demo-uid", crewName: "Chief A. Sample", source: "demo-bootstrap", now });
  assert.deepEqual(reports.map((r) => r.id), DEMO_PCR_IDS);
  assert.deepEqual(reports.map((r) => r.status), ["posted", "posted", "draft"]);
  for (const report of reports) {
    assert.deepEqual(report.crewUids, ["demo-uid"], "the rules only let the crew create a report");
    assert.equal(report.source, "demo-bootstrap");
    assert.equal(report.uuid, report.id);
  }
  assert.ok(getValue(schema, reports[0].nemsis, "eTimes.03"));
  assert.equal(getValue(schema, reports[1].nemsis, "eTimes.03") ?? "", "", "the second sample is left with an error to review");
  assert.equal(getValue(schema, reports[0].nemsis, "eRecord.01"), "DEMO-PCR-0001");
  // Times move to recent days: the first sample is yesterday relative to `now`.
  const notified = Date.parse(getValue(schema, reports[0].nemsis, "eTimes.03"));
  const ageDays = (now.getTime() - notified) / 86_400_000;
  assert.ok(ageDays > 0 && ageDays < 3, `sample call is recent (${ageDays.toFixed(1)} days old)`);
  assert.ok(reports[0].postedAt && !reports[2].postedAt);
});

test("demo report permissions only go to roles that exist", () => {
  const ids = new Set(defaultRoles.map((role) => role.id));
  for (const roleId of Object.keys(DEMO_PCR_ROLE_GRANTS)) assert.ok(ids.has(roleId), roleId);
});

test("the demo sample matches the test fixture's synthetic call", () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));
  assert.deepEqual(sample.data, fixture.data);
});
