// Cloud Functions run the app's own NEMSIS code from a generated bundle; checks it is current and agrees with src.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { nemsisBundleSourceHash, OUT_FILE } from "../../scripts/nemsis/nemsisBundleSources.mjs";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { pcrXml } from "../../src/lib/nemsis/pcrModel.js";

const require = createRequire(import.meta.url);
const core = require("../../functions/lib/nemsis/generated/nemsisCore.cjs");
const { runPcrCheck, canReadPcr, agencyFromSettings } = require("../../functions/lib/nemsis/pcrCheck.js");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));
const settings = { stateAgencyId: fixture.agency["dAgency.01"], agencyNumber: fixture.agency["dAgency.02"], state: fixture.agency["dAgency.04"] };
const serverPcr = { uuid: fixture.uuid, crewUids: ["crew-1"], nemsis: { ...fixture.data, attrs: { UUID: fixture.uuid } } };

test("functions NEMSIS bundle is up to date with src (run npm run bundle:nemsis-functions)", async () => {
  const header = fs.readFileSync(OUT_FILE, "utf8").split("\n", 3).join("\n");
  const stored = /source-hash: ([0-9a-f]{64})/.exec(header)?.[1];
  assert.equal(stored, await nemsisBundleSourceHash());
});

test("the bundle builds the same XML as the app", () => {
  const schema = loadNemsisSchema("3.5.1");
  assert.equal(core.nemsisSchema.version, "3.5.1");
  const fromApp = pcrXml(schema, { agency: fixture.agency, uuid: fixture.uuid, pcr: fixture.data });
  const fromBundle = core.pcrXml(core.nemsisSchema, { agency: fixture.agency, uuid: fixture.uuid, pcr: fixture.data });
  assert.equal(fromBundle, fromApp);
});

test("server check: a complete report with the agency set up passes XSD-level checks and the national Schematron", async () => {
  assert.deepEqual(agencyFromSettings(settings), fixture.agency);
  const result = await runPcrCheck({ pcr: serverPcr, settings });
  assert.deepEqual(result.missingAgency, []);
  assert.deepEqual(result.blocking, []);
  assert.equal(result.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(result.ok, true);
  assert.match(result.schemaVersion, /^3\.5\.1/);
});

test("server check: missing agency setup and charting gaps are reported, not hidden", async () => {
  const noAgency = await runPcrCheck({ pcr: serverPcr, settings: {} });
  assert.equal(noAgency.ok, false);
  assert.deepEqual(noAgency.missingAgency, ["EMS agency unique state ID", "EMS agency number", "EMS agency state"]);

  const { eTimes: _t, ...withoutTimes } = serverPcr.nemsis;
  const gaps = await runPcrCheck({ pcr: { ...serverPcr, nemsis: withoutTimes }, settings });
  assert.equal(gaps.ok, false);
  assert.ok(gaps.blocking.some((i) => i.element === "eTimes.03"));
  assert.ok(gaps.errorCount >= gaps.blocking.length);
});

test("server access to a report matches the Firestore rules", () => {
  const pcr = { crewUids: ["crew-1"] };
  assert.equal(canReadPcr(pcr, { uid: "crew-1" }), true);
  assert.equal(canReadPcr(pcr, { uid: "other" }), false);
  assert.equal(canReadPcr(pcr, { uid: "other", permissions: { editPcrs: true } }), false, "charting alone doesn't read others' reports");
  for (const key of ["viewAllPcrs", "unlockPcrs", "exportPcrs"]) {
    assert.equal(canReadPcr(pcr, { uid: "other", permissions: { [key]: true } }), true, key);
  }
  assert.equal(canReadPcr(pcr, { uid: "other", isAdmin: true }), true);
  assert.equal(canReadPcr(pcr, { uid: "other", isCreator: true }), true);
});
