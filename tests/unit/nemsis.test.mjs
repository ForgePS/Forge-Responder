import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { NV, PN } from "../../src/lib/nemsis/schema.js";
import { validateNemsis, summarizeNemsisIssues, checkSimpleValue } from "../../src/lib/nemsis/validation.js";
import { buildEmsDataSetXml, buildDemDataSetXml, escapeXml } from "../../src/lib/nemsis/xmlExport.js";

const schema = loadNemsisSchema("3.5.1");
const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", name), "utf8"));
const pcrFixture = readFixture("pcr-chest-pain.json");
const demFixture = readFixture("dem-test-agency.json");
const clone = (v) => structuredClone(v);
const pcrDoc = (data = pcrFixture.data) => ({ ...data, attrs: { UUID: pcrFixture.uuid } });
const errorsOf = (issues) => issues.filter((i) => i.severity === "error");
const XSD_DIR = path.join(ROOT, "functions", "nemsis", "3.5.1", "xsd");

// --- schema bundle -----------------------------------------------------------

test("bundle is NEMSIS 3.5.1 with both datasets", () => {
  assert.equal(schema.version, "3.5.1");
  assert.equal(schema.namespace, "http://www.nemsis.org");
  assert.ok(schema.leafNames("EMSDataSet").length > 400);
  assert.ok(schema.leafNames("DEMDataSet").length > 100);
});

test("every leaf has a resolved type and a dictionary entry", () => {
  for (const ds of ["EMSDataSet", "DEMDataSet"]) {
    for (const name of schema.leafNames(ds)) {
      const node = schema.node(ds, name);
      assert.ok(schema.type(node.t), `${ds} ${name}: type ${node.t} missing`);
      if (/^[ed][A-Za-z]+\.\d+$/.test(name)) assert.ok(schema.element(name, ds), `${ds} ${name}: no dictionary entry`);
    }
  }
});

test("element names are unique within each dataset (names are safe keys)", () => {
  for (const ds of ["EMSDataSet", "DEMDataSet"]) {
    const seen = new Map();
    const walk = (n) => {
      seen.set(n.n, (seen.get(n.n) ?? 0) + 1);
      n.ch?.forEach(walk);
    };
    walk(schema.node(ds));
    const dupes = [...seen].filter(([, c]) => c > 1).map(([n]) => n);
    assert.deepEqual(dupes, [], `${ds} duplicate names`);
  }
});

test("every XSD pattern compiles as a JS regex", () => {
  const bad = Object.entries(schema.types).flatMap(([name, t]) =>
    (t.patterns ?? []).filter((p) => {
      try {
        new RegExp(`^(?:${p})$`, "u");
        return false;
      } catch {
        return true;
      }
    }).map((p) => `${name}: ${p}`),
  );
  assert.deepEqual(bad, []);
});

test("schema exposes dictionary metadata and code labels", () => {
  assert.equal(schema.element("eVitals.06").name, "SBP (Systolic Blood Pressure)");
  assert.equal(schema.element("eRecord.01").usage, "Mandatory");
  assert.equal(schema.codeLabel("eDispatch.01", "2301021"), "Chest Pain (Non-Traumatic)");
  assert.equal(schema.codeLabel("eVitals.06", NV.NotRecorded), "NV.NotRecorded");
  assert.deepEqual(schema.pathOf("EMSDataSet", "eVitals.06"), [
    "EMSDataSet", "Header", "PatientCareReport", "eVitals", "eVitals.VitalGroup", "eVitals.BloodPressureGroup", "eVitals.06",
  ]);
});

// --- value checks ------------------------------------------------------------

test("checkSimpleValue enforces XSD facets", () => {
  const t = (name) => schema.type(name);
  assert.equal(checkSimpleValue(t("SBP"), 120), null);
  assert.match(checkSimpleValue(t("SBP"), 501), /at most 500/);
  assert.match(checkSimpleValue(t("SBP"), "12a"), /whole number/);
  assert.equal(checkSimpleValue(t("DateTimeType"), "2026-11-15T14:02:11-06:00"), null);
  assert.match(checkSimpleValue(t("DateTimeType"), "2026-11-15T14:02:11"), /format|offset/);
  assert.match(checkSimpleValue(t("DateTimeType"), "2026-02-30T10:00:00-06:00"), /date and time/);
  assert.equal(checkSimpleValue(t("ProvidersImpression"), "I21.4"), null);
  assert.match(checkSimpleValue(t("ProvidersImpression"), "chest pain"), /format/);
  assert.equal(checkSimpleValue(t("MedicationDosage"), 0.4), null);
  assert.match(checkSimpleValue(t("MedicationDosage"), "0.12345"), /decimal places/);
  assert.match(checkSimpleValue(t("EMSServiceCat"), "9999999"), /not an allowed code/);
  assert.equal(checkSimpleValue(t("UUID"), pcrFixture.uuid), null);
});

// --- validation --------------------------------------------------------------

test("chest-pain fixture has no errors", () => {
  const issues = validateNemsis(schema, "EMSDataSet", pcrDoc());
  assert.deepEqual(errorsOf(issues), []);
  assert.equal(summarizeNemsisIssues(issues).blocking, false);
});

test("DEM fixture has no errors", () => {
  const issues = validateNemsis(schema, "DEMDataSet", { ...demFixture.report, attrs: { timeStamp: demFixture.timeStamp } });
  assert.deepEqual(errorsOf(issues), []);
});

test("empty PCR blocks on exactly the Mandatory EMS elements", () => {
  const issues = validateNemsis(schema, "EMSDataSet", {});
  const missing = errorsOf(issues).filter((i) => i.code === "required").map((i) => i.element).sort();
  const mandatory = schema.leafNames("EMSDataSet")
    .filter((n) => schema.element(n)?.usage === "Mandatory" && !n.startsWith("dAgency"))
    .filter((n) => {
      // only those reachable through required containers from PatientCareReport
      const p = schema.pathOf("EMSDataSet", n).slice(3);
      return p.every((name) => schema.node("EMSDataSet", name).min > 0);
    })
    .sort();
  assert.deepEqual(missing, mandatory);
  assert.ok(issues.some((i) => i.code === "missingAttribute" && i.element === "PatientCareReport"));
  assert.ok(issues.some((i) => i.code === "notRecorded" && i.element === "eVitals.06"));
});

test("validation catches bad codes, NV/PN misuse, shape and unknown elements", () => {
  const data = clone(pcrFixture.data);
  data.eDispatch["eDispatch.01"] = "1234567";
  data.eVitals["eVitals.VitalGroup"][0]["eVitals.BloodPressureGroup"]["eVitals.06"] = { value: 120, NV: NV.NotRecorded };
  data.eVitals["eVitals.VitalGroup"][1]["eVitals.BloodPressureGroup"]["eVitals.06"] = { PN: PN.Approximate };
  data.ePatient["ePatient.AgeGroup"]["ePatient.15"] = { PN: PN.Approximate };
  data.eResponse["eResponse.24"] = "2224009";
  data.eTimes.bogus = "x";
  const codes = new Set(errorsOf(validateNemsis(schema, "EMSDataSet", pcrDoc(data))).map((i) => i.code));
  for (const c of ["invalidValue", "nvWithValue", "pnNotAllowed", "pnNeedsValue", "shape", "unknownElement"]) {
    assert.ok(codes.has(c), `expected ${c}`);
  }
});

test("allowed NV and PN usage is accepted", () => {
  const data = clone(pcrFixture.data);
  data.eVitals["eVitals.VitalGroup"][1]["eVitals.BloodPressureGroup"]["eVitals.06"] = { PN: PN.Refused };
  data.ePatient["ePatient.AgeGroup"]["ePatient.15"] = { value: 58, PN: PN.Approximate };
  data.eSituation["eSituation.11"] = { NV: NV.NotApplicable };
  assert.deepEqual(errorsOf(validateNemsis(schema, "EMSDataSet", pcrDoc(data))), []);
});

// --- export ------------------------------------------------------------------

test("export writes XSD order regardless of key order, and fills Not Recorded", () => {
  const xml = buildEmsDataSetXml(schema, { agency: pcrFixture.agency, reports: [{ uuid: pcrFixture.uuid, data: pcrFixture.data }] });
  const reversed = Object.fromEntries(Object.entries(pcrFixture.data).reverse());
  const xml2 = buildEmsDataSetXml(schema, { agency: pcrFixture.agency, reports: [{ uuid: pcrFixture.uuid, data: reversed }] });
  assert.equal(xml, xml2);
  assert.ok(xml.indexOf("<eRecord>") < xml.indexOf("<eResponse>"));
  assert.match(xml, /<PatientCareReport UUID="6f1c2a4e-8b7d-4c3a-9e2f-1a2b3c4d5e6f">/);
  assert.match(xml, /<eResponse\.08 xsi:nil="true" NV="7701003"\/>/);
  const noFill = buildEmsDataSetXml(schema, { agency: pcrFixture.agency, reports: [{ uuid: pcrFixture.uuid, data: pcrFixture.data }] }, { fillNotRecorded: false });
  assert.doesNotMatch(noFill, /eResponse\.08/);
});

test("export escapes XML and drops control characters", () => {
  assert.equal(escapeXml(`a<b>&"c"\u0001`), "a&lt;b&gt;&amp;&quot;c&quot;");
  const data = clone(pcrFixture.data);
  data.eNarrative["eNarrative.01"] = "BP <90 & HR >120";
  const xml = buildEmsDataSetXml(schema, { agency: pcrFixture.agency, reports: [{ uuid: pcrFixture.uuid, data }] });
  assert.match(xml, /BP &lt;90 &amp; HR &gt;120/);
});

// --- agreement with the official XSD (needs a JDK; skipped otherwise) ---------

const javaAvailable = spawnSync("java", ["-version"], { encoding: "utf8" }).status === 0;

function xsdCheck(xsdName, files) {
  const res = spawnSync("java", [path.join(ROOT, "tests", "nemsis", "XsdValidate.java"), path.join(XSD_DIR, xsdName), ...files], {
    encoding: "utf8",
  });
  const byFile = new Map(files.map((f) => [f, []]));
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = /^INVALID (.+?): (.*)$/.exec(line);
    if (m) byFile.get(m[1])?.push(m[2]);
  }
  return byFile;
}

test("validator verdict matches the official 3.5.1 XSD", { skip: !javaAvailable && "java not installed" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nemsis-"));
  try {
    const cases = [];
    const addEms = (name, data) => {
      const file = path.join(dir, `${name}.xml`);
      fs.writeFileSync(file, buildEmsDataSetXml(schema, { agency: pcrFixture.agency, reports: [{ uuid: pcrFixture.uuid, data }] }));
      cases.push({ name, file, blocking: summarizeNemsisIssues(validateNemsis(schema, "EMSDataSet", pcrDoc(data))).blocking });
    };

    addEms("fixture", pcrFixture.data);
    addEms("empty", {});
    const mutate = (fn) => {
      const d = clone(pcrFixture.data);
      fn(d);
      return d;
    };
    addEms("badCode", mutate((d) => (d.eDispatch["eDispatch.01"] = "1234567")));
    addEms("sbpOutOfRange", mutate((d) => (d.eVitals["eVitals.VitalGroup"][0]["eVitals.BloodPressureGroup"]["eVitals.06"] = 900)));
    addEms("noOffsetTime", mutate((d) => (d.eTimes["eTimes.03"] = "2026-11-15T14:03:05")));
    addEms("missingMandatory", mutate((d) => delete d.eResponse["eResponse.13"]));
    addEms("pnRefusedSbp", mutate((d) => (d.eVitals["eVitals.VitalGroup"][1]["eVitals.BloodPressureGroup"]["eVitals.06"] = { PN: PN.Refused })));
    addEms("nvImpression", mutate((d) => (d.eSituation["eSituation.11"] = { NV: NV.NotApplicable })));
    addEms("noVitals", mutate((d) => delete d.eVitals));

    const results = xsdCheck("EMSDataSet_v3.xsd", cases.map((c) => c.file));
    for (const c of cases) {
      const xsdErrors = results.get(c.file);
      assert.equal(xsdErrors.length > 0, c.blocking, `${c.name}: validator blocking=${c.blocking}, XSD errors=${JSON.stringify(xsdErrors)}`);
    }
    assert.equal(cases.find((c) => c.name === "fixture").blocking, false);

    const demFile = path.join(dir, "dem.xml");
    fs.writeFileSync(demFile, buildDemDataSetXml(schema, demFixture));
    assert.deepEqual(xsdCheck("DEMDataSet_v3.xsd", [demFile]).get(demFile), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
