// National Schematron (3.5.1 CP2) run through SaxonJS, and agreement with the browser validator.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { NV, PN } from "../../src/lib/nemsis/schema.js";
import { validateNemsis, summarizeNemsisIssues } from "../../src/lib/nemsis/validation.js";
import { buildEmsDataSetXml, buildDemDataSetXml } from "../../src/lib/nemsis/xmlExport.js";

const require = createRequire(import.meta.url);
const { runNemsisSchematron, simplifyLocation } = require("../../functions/lib/nemsis/schematron.js");

const schema = loadNemsisSchema("3.5.1");
const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", name), "utf8"));
const pcr = readFixture("pcr-chest-pain.json");
const dem = readFixture("dem-test-agency.json");

const emsXml = (data) => buildEmsDataSetXml(schema, { agency: pcr.agency, reports: [{ uuid: pcr.uuid, data }] });
const jsBlocking = (data) => summarizeNemsisIssues(validateNemsis(schema, "EMSDataSet", { ...data, attrs: { UUID: pcr.uuid } })).blocking;
const mutate = (fn) => {
  const d = structuredClone(pcr.data);
  fn(d);
  return d;
};
const firstVitals = (d) => d.eVitals["eVitals.VitalGroup"][0];
const firstMed = (d) => d.eMedications["eMedications.MedicationGroup"][0];

test("compiled Schematron is the 3.5.1 national CP2 release", async () => {
  const result = await runNemsisSchematron(emsXml(pcr.data));
  assert.equal(result.dataset, "EMSDataSet");
  assert.equal(result.schemaVersion, "3.5.1.251001CP2");
});

test("chest-pain PCR passes national rules; warnings carry NEMSIS diagnostics", async () => {
  const result = await runNemsisSchematron(emsXml(pcr.data));
  assert.equal(result.ok, true);
  assert.equal(result.errorCount, 0);
  assert.ok(result.warningCount > 0, "the fixture leaves optional demographics Not Recorded, which NEMSIS warns about");
  const county = result.findings.find((f) => f.id === "nemSch_e057");
  assert.ok(county, "expected the Home County warning");
  assert.equal(county.severity, "warning");
  assert.equal(county.kind, "assert");
  assert.match(county.message, /Home County/);
  assert.equal(county.location, "/EMSDataSet[1]/Header[1]/PatientCareReport[1]/ePatient[1]/ePatient.07[1]");
  assert.deepEqual(county.record, { uuid: pcr.uuid, pcrNumber: pcr.data.eRecord["eRecord.01"] });
  assert.deepEqual(county.elements[0], { location: county.location, value: "", nv: NV.NotRecorded, pn: null });
});

test("DEM test agency passes national rules", async () => {
  const result = await runNemsisSchematron(buildDemDataSetXml(schema, dem));
  assert.equal(result.dataset, "DEMDataSet");
  assert.equal(result.errorCount, 0);
});

// Each case is XSD-valid, so the only thing that can block is a national rule.
const CASES = [
  { name: "fixture", data: pcr.data, rules: [] },
  {
    name: "PN Refused with a value (SBP)",
    data: mutate((d) => (firstVitals(d)["eVitals.BloodPressureGroup"]["eVitals.06"] = { value: 120, PN: PN.Refused })),
    rules: ["nemSch_e008"],
  },
  {
    name: "PN Refused alone (SBP)",
    data: mutate((d) => (firstVitals(d)["eVitals.BloodPressureGroup"]["eVitals.06"] = { PN: PN.Refused })),
    rules: [],
  },
  {
    name: "Approximate age without a value",
    data: mutate((d) => (d.ePatient["ePatient.AgeGroup"]["ePatient.15"] = { PN: PN.Approximate })),
    rules: ["nemSch_e190"],
  },
  {
    name: "Approximate age with a value",
    data: mutate((d) => (d.ePatient["ePatient.AgeGroup"]["ePatient.15"] = { value: 58, PN: PN.Approximate })),
    rules: [],
  },
  {
    name: "Unable to Complete onset time with a value",
    data: mutate((d) => (d.eSituation["eSituation.01"] = { value: "2026-11-15T13:00:00-06:00", PN: PN.UnableToComplete })),
    rules: ["nemSch_e003"],
  },
  {
    name: "medication refused, with the medication code",
    data: mutate((d) => (firstMed(d)["eMedications.03"] = { value: "1191", PN: PN.Refused })),
    rules: [],
  },
  {
    name: "medication code of 8 digits",
    data: mutate((d) => (firstMed(d)["eMedications.03"] = "12345678")),
    rules: ["nemSch_e145"],
  },
  {
    name: "RxNorm digits marked as SNOMED",
    data: mutate((d) => (firstMed(d)["eMedications.03"] = { value: "1191", attrs: { CodeType: "9924005" } })),
    rules: ["nemSch_e144"],
  },
  {
    name: "allowed SNOMED medication (oxygen) marked as SNOMED",
    data: mutate((d) => (firstMed(d)["eMedications.03"] = { value: "116762002", attrs: { CodeType: "9924005" } })),
    rules: [],
  },
];

for (const c of CASES) {
  test(`national rules and browser validator agree: ${c.name}`, async () => {
    const result = await runNemsisSchematron(emsXml(c.data));
    const errorIds = result.findings.filter((f) => f.severity === "error").map((f) => f.id);
    for (const id of c.rules) assert.ok(errorIds.includes(id), `expected ${id}, got ${JSON.stringify(errorIds)}`);
    if (c.rules.length === 0) assert.deepEqual(errorIds, []);
    assert.equal(jsBlocking(c.data), errorIds.length > 0, `browser validator blocking should match national errors ${JSON.stringify(errorIds)}`);
  });
}

test("malformed XML is reported without echoing content", async () => {
  await assert.rejects(runNemsisSchematron("<EMSDataSet><eRecord>Jane Doe"), (err) => {
    assert.equal(err.code, "malformed-xml");
    assert.doesNotMatch(err.message, /Jane/);
    return true;
  });
  await assert.rejects(runNemsisSchematron("<Other/>"), /not an EMSDataSet or DEMDataSet/);
});

test("simplifyLocation strips namespace predicates", () => {
  assert.equal(
    simplifyLocation("/*:EMSDataSet[namespace-uri()='http://www.nemsis.org'][1]/*:Header[namespace-uri()='http://www.nemsis.org'][1]"),
    "/EMSDataSet[1]/Header[1]",
  );
});
