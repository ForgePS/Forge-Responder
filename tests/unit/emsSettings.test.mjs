// EMS agency settings (settings/ems) and the read-only report view used by the RMS Patient Care Reports page.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { emsSettingsAgency, emsSettingsErrors, missingEmsSettings, normalizeEmsSettings } from "../../src/lib/nemsis/emsSettings.js";
import { PCR_SECTIONS, fieldInput, leafText, sectionReadout } from "../../src/lib/nemsis/pcrModel.js";
import { NV, PN } from "../../src/lib/nemsis/schema.js";

const require = createRequire(import.meta.url);
const { agencyFromSettings } = require("../../functions/lib/nemsis/pcrCheck.js");
const schema = loadNemsisSchema("3.5.1");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));

test("EMS settings are trimmed and the browser and server build the same export header", () => {
  const raw = { stateAgencyId: " 351-T0001 ", agencyNumber: "T0001", agencyName: "Test EMS", state: "37", extra: "dropped" };
  const settings = normalizeEmsSettings(raw);
  assert.deepEqual(settings, { stateAgencyId: "351-T0001", agencyNumber: "T0001", agencyName: "Test EMS", state: "37" });
  assert.deepEqual(emsSettingsAgency(raw), agencyFromSettings(raw));
  assert.deepEqual(missingEmsSettings(raw), []);
  assert.deepEqual(missingEmsSettings(null), ["EMS agency unique state ID", "EMS agency number", "EMS agency state"]);
});

test("EMS settings follow the NEMSIS type limits", () => {
  assert.deepEqual(emsSettingsErrors({ state: "37", agencyNumber: "T0001" }), {});
  assert.ok(emsSettingsErrors({ state: "NC" }).state);
  assert.ok(emsSettingsErrors({ agencyNumber: "X".repeat(16) }).agencyNumber);
  assert.ok(emsSettingsErrors({ stateAgencyId: "X".repeat(51) }).stateAgencyId);
});

test("leafText shows code labels, not-values and pertinent negatives in plain words", () => {
  const units = fieldInput(schema, "ePatient.16");
  const years = units.options.find((o) => o.label === "Years");
  assert.deepEqual(leafText(units, years.code), ["Years"]);
  assert.deepEqual(leafText(units, { NV: NV.NotRecorded }), ["Not Recorded"]);
  const meds = fieldInput(schema, "eHistory.12");
  assert.deepEqual(leafText(meds, [{ PN: PN.NoneReported }]), ["None Reported"]);
  assert.deepEqual(leafText(units, undefined), []);
});

test("sectionReadout lists what was charted, including every row of repeating groups", () => {
  const vitals = sectionReadout(schema, fixture.data, "vitals");
  const group = vitals.find((item) => item.name === "eVitals.VitalGroup");
  assert.ok(group, "vital sign rows are listed");
  const rowCount = [].concat(fixture.data.eVitals["eVitals.VitalGroup"]).length;
  assert.equal(group.rows.length, rowCount);
  const taken = group.rows[0].find((item) => item.el === "eVitals.01");
  assert.equal(taken.kind, "datetime");
  // Sections with nothing charted are empty, and every section can be read without throwing.
  for (const section of PCR_SECTIONS) assert.ok(Array.isArray(sectionReadout(schema, fixture.data, section.id)));
  assert.deepEqual(sectionReadout(schema, {}, "patient"), []);
});
