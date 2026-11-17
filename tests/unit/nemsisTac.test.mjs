// NEMSIS v3.5.1 compliance pre-testing package (2026): the checks NEMSIS TAC runs on "Collect Data" software.
//   - every reference file imports into Forge's document model and exports back unchanged (Comparison Report)
//   - reference files pass Forge's browser validator, the official XSD, the national Schematron and the
//     runtime-loaded pre-testing Schematron
//   - the "fail" files are rejected for the reasons NEMSIS expects (messages from each file's header)
//   - runtime-loaded rules: errors block, warnings do not
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { parseXmlTree, canonical, firstDifference } from "./helpers/xmlTree.mjs";
import { importNemsisTree, splitEmsDataSet } from "../../src/lib/nemsis/xmlImport.js";
import { toNemsisXml, buildEmsDataSetXml } from "../../src/lib/nemsis/xmlExport.js";
import { validateNemsis, summarizeNemsisIssues } from "../../src/lib/nemsis/validation.js";

const require = createRequire(import.meta.url);
const { runNemsisSchematron, compileSchematron } = require("../../functions/lib/nemsis/schematron.js");

const schema = loadNemsisSchema("3.5.1");
const TAC = path.join(ROOT, "tests", "fixtures", "nemsis", "tac-2026-pretesting");
const XSD_DIR = path.join(ROOT, "functions", "nemsis", "3.5.1", "xsd");
const listXml = (dir) => fs.readdirSync(path.join(TAC, "xml", dir)).filter((f) => f.endsWith(".xml")).map((f) => path.join(TAC, "xml", dir, f));
const read = (file) => fs.readFileSync(file, "utf8");
const isDataSet = (file) => !path.basename(file).includes("STATE");

const REFERENCE = [...listXml("full"), ...listXml("national")].filter(isDataSet);
const FAIL = listXml("fail");
const PRETESTING_RULES = ["EMSDataSet", "DEMDataSet"].map((ds) => ({
  id: "compliance-pretesting-2026",
  text: read(path.join(TAC, "schematron", `${ds}.sch`)),
}));

const importFile = (file) => importNemsisTree(schema, parseXmlTree(read(file)));
const validateWhole = (dataset, doc) => validateNemsis(schema, dataset, doc, { rootName: dataset });
/** "Expected Message:" lines from a fail file's header comment. */
const expectedMessages = (file) => [...read(file).matchAll(/Expected Message:\s*(.+)/g)].map((m) => m[1].trim());
const label = (file) => `${path.basename(path.dirname(file))}/${path.basename(file)}`;

test("pre-testing package has the DEM, STATE and five EMS test cases", () => {
  const names = listXml("full").map((f) => path.basename(f));
  assert.equal(names.filter((n) => n.includes("-EMS-")).length, 5);
  assert.ok(names.some((n) => n.includes("-DEM-")));
  assert.ok(names.some((n) => n.includes("-STATE-")));
  assert.equal(FAIL.length, 4);
});

// --- Comparison Report: import → export reproduces each reference file ------------------------

for (const file of REFERENCE) {
  test(`round trip, no browser-validator errors: ${label(file)}`, () => {
    const tree = parseXmlTree(read(file));
    const { dataset, doc, problems } = importNemsisTree(schema, tree);
    assert.deepEqual(problems, []);
    const diff = firstDifference(canonical(tree), canonical(parseXmlTree(toNemsisXml(schema, dataset, doc))));
    assert.equal(diff, null, `export differs from the reference: ${diff}`);
    const errors = validateWhole(dataset, doc).filter((i) => i.severity === "error");
    assert.deepEqual(errors.map((e) => `${e.path}: ${e.message}`), []);
  });
}

test("imported EMSDataSet splits into agency, custom configuration and PCRs, and rebuilds identically", () => {
  const file = REFERENCE.find((f) => f.includes("full") && f.includes("EMS-1"));
  const tree = parseXmlTree(read(file));
  const { doc } = importNemsisTree(schema, tree);
  const [header] = splitEmsDataSet(doc);
  assert.equal(header.agency["dAgency.02"], "351-11261");
  assert.ok(header.customConfiguration["eCustomConfiguration.CustomGroup"].length > 0);
  assert.equal(header.reports.length, 1);
  assert.match(header.reports[0].uuid, /^[0-9a-f-]{36}$/);
  const rebuilt = buildEmsDataSetXml(schema, header);
  assert.equal(firstDifference(canonical(tree), canonical(parseXmlTree(rebuilt))), null);
});

// --- Fail files: blocked for the reason NEMSIS states -----------------------------------------

test("XSD-fail files are blocked by the browser validator on the element NEMSIS names", () => {
  for (const file of FAIL.filter((f) => f.includes("FailXsd"))) {
    const { dataset, doc } = importFile(file);
    const errors = validateWhole(dataset, doc).filter((i) => i.blocking);
    const [expected] = expectedMessages(file);
    const element = /element '([^']+)'/i.exec(expected)?.[1];
    assert.ok(element, `could not read the element from: ${expected}`);
    assert.ok(errors.some((e) => e.element === element), `${label(file)}: expected an error on ${element}, got ${JSON.stringify(errors)}`);
  }
});

test("Schematron-fail files raise exactly the messages NEMSIS expects (national + runtime-loaded rules)", async () => {
  for (const file of FAIL.filter((f) => f.includes("FailSchematron"))) {
    const result = await runNemsisSchematron(read(file), { extraSchematron: PRETESTING_RULES });
    assert.equal(result.ok, false);
    const messages = result.findings.filter((f) => f.severity === "error").map((f) => f.message);
    for (const expected of expectedMessages(file)) {
      assert.ok(messages.includes(expected), `${label(file)}: missing "${expected}"; got ${JSON.stringify(messages)}`);
    }
    assert.ok(result.findings.some((f) => f.source === "national"));
    assert.ok(result.findings.some((f) => f.source === "compliance-pretesting-2026"));
  }
});

test("browser validator also blocks the Schematron-fail files on their national errors", () => {
  for (const file of FAIL.filter((f) => f.includes("FailSchematron"))) {
    const { dataset, doc } = importFile(file);
    const issues = validateWhole(dataset, doc);
    assert.equal(summarizeNemsisIssues(issues).blocking, true, label(file));
  }
});

// --- Schematron on the reference files ---------------------------------------------------------

test("reference files pass the national and pre-testing Schematron with no errors", async () => {
  for (const file of REFERENCE) {
    const result = await runNemsisSchematron(read(file), { extraSchematron: PRETESTING_RULES });
    const errors = result.findings.filter((f) => f.severity === "error");
    assert.deepEqual(errors.map((e) => `${e.source} ${e.id}: ${e.message}`), [], label(file));
    assert.deepEqual(result.sources.map((s) => s.id), ["national", "compliance-pretesting-2026"]);
  }
});

test("runtime-loaded rules: a warning is reported but does not block (EMS and DEM)", async () => {
  // EMS: nursing home location (Y92.12x) without Advance Directives → compliance_directives warning.
  const emsFile = REFERENCE.find((f) => f.includes("full") && f.includes("EMS-1"));
  const ems = importFile(emsFile).doc;
  const pcr = ems.Header[0].PatientCareReport[0];
  pcr.eScene["eScene.09"] = "Y92.122";
  if (pcr.eHistory) delete pcr.eHistory["eHistory.05"];
  const emsResult = await runNemsisSchematron(toNemsisXml(schema, "EMSDataSet", ems), { extraSchematron: PRETESTING_RULES });
  const emsWarning = emsResult.findings.find((f) => f.source === "compliance-pretesting-2026");
  assert.ok(emsWarning, "expected the pre-testing EMS warning");
  assert.equal(emsWarning.severity, "warning");
  assert.equal(emsResult.ok, true);

  // DEM: dVehicle.09 outside 100000–300000 for a vehicle of type 1404001 → warning.
  const demFile = REFERENCE.find((f) => f.includes("full") && f.includes("DEM-1"));
  const dem = importFile(demFile).doc;
  const vehicle = dem.DemographicReport[0].dVehicle["dVehicle.VehicleGroup"].find((v) => v["dVehicle.04"] === "1404001");
  assert.ok(vehicle, "test case has a vehicle of type 1404001");
  vehicle["dVehicle.09"] = "50000";
  const demResult = await runNemsisSchematron(toNemsisXml(schema, "DEMDataSet", dem), { extraSchematron: PRETESTING_RULES });
  const demWarning = demResult.findings.find((f) => f.source === "compliance-pretesting-2026");
  assert.ok(demWarning, "expected the pre-testing DEM warning");
  assert.equal(demWarning.severity, "warning");
  assert.equal(demResult.ok, true);
});

test("runtime Schematron compile is cached and reports bad rule files clearly", () => {
  const a = compileSchematron(PRETESTING_RULES[0].text);
  const b = compileSchematron(PRETESTING_RULES[0].text);
  assert.equal(a, b);
  assert.equal(a.dataset, "EMSDataSet");
  assert.equal(a.schemaVersion, "3.5.1.251001CP2_compliance_pretesting_2026");
  assert.throws(() => compileSchematron("<sch:schema xmlns:sch='http://purl.oclc.org/dsdl/schematron'><broken"), (err) => {
    assert.equal(err.code, "schematron-compile-failed");
    return true;
  });
});

// --- Official XSD (needs a JDK; skipped otherwise) ---------------------------------------------

const javaAvailable = spawnSync("java", ["-version"], { encoding: "utf8" }).status === 0;

function xsdErrors(xsdName, files) {
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

test("official XSD: reference and Forge-exported files pass, XSD-fail files fail", { skip: !javaAvailable && "java not installed" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nemsis-tac-"));
  try {
    const groups = { EMSDataSet: [], DEMDataSet: [] };
    const mustFail = new Set();
    for (const file of [...REFERENCE, ...FAIL.filter((f) => f.includes("FailXsd"))]) {
      const dataset = path.basename(file).includes("DEM") ? "DEMDataSet" : "EMSDataSet";
      groups[dataset].push(file);
      if (file.includes("FailXsd")) mustFail.add(file);
      if (!file.includes("FailXsd")) {
        const { doc } = importFile(file);
        const out = path.join(dir, `forge-${path.basename(path.dirname(file))}-${path.basename(file)}`);
        fs.writeFileSync(out, toNemsisXml(schema, dataset, doc));
        groups[dataset].push(out);
      }
    }
    for (const [dataset, files] of Object.entries(groups)) {
      for (const [file, errors] of xsdErrors(`${dataset}_v3.xsd`, files)) {
        assert.equal(errors.length > 0, mustFail.has(file), `${path.basename(file)}: ${JSON.stringify(errors)}`);
      }
    }
    const state = listXml("full").find((f) => f.includes("STATE"));
    assert.deepEqual(xsdErrors("StateDataSet_v3.xsd", [state]).get(state), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Review fixes (PR 74) ------------------------------------------------------------------------

test("pertinent negative without a value is blocked on non-nillable elements (eHistory.10, exam findings)", () => {
  const { doc } = importFile(REFERENCE.find((f) => f.includes("full") && f.includes("EMS-1")));
  const pcr = doc.Header[0].PatientCareReport[0];
  pcr.eHistory = { ...(pcr.eHistory ?? {}), "eHistory.ImmunizationsGroup": [{ "eHistory.10": { PN: "8801025" } }] };
  pcr.eExam = { ...(pcr.eExam ?? {}), "eExam.AssessmentGroup": [{ "eExam.07": [{ PN: "8801005" }] }] };
  const blocked = (issues) => issues.filter((i) => i.blocking && i.code === "pnNeedsValue").map((i) => i.element).sort();
  assert.deepEqual(blocked(validateWhole("EMSDataSet", doc)), ["eExam.07", "eHistory.10"]);

  // With a value the same pertinent negatives are fine (the national rules exempt these elements).
  pcr.eHistory["eHistory.ImmunizationsGroup"][0]["eHistory.10"] = { value: "9910001", PN: "8801025" };
  pcr.eExam["eExam.AssessmentGroup"][0]["eExam.07"] = [{ value: "3507001", PN: "8801005" }];
  assert.deepEqual(blocked(validateWhole("EMSDataSet", doc)), []);
});

test("import recognizes xsi:nil under any prefix bound to the XML Schema instance namespace", () => {
  const xml = read(REFERENCE.find((f) => f.includes("full") && f.includes("EMS-1")))
    .replace(/xmlns:xsi=/, "xmlns:i=")
    .replace(/\bxsi:/g, "i:");
  assert.match(xml, /i:nil="true"/);
  const tree = parseXmlTree(xml);
  const { dataset, doc, problems } = importNemsisTree(schema, tree);
  assert.deepEqual(problems, []);
  const out = toNemsisXml(schema, dataset, doc);
  assert.doesNotMatch(out, /\bi:nil/);
  assert.equal(firstDifference(canonical(parseXmlTree(read(REFERENCE.find((f) => f.includes("full") && f.includes("EMS-1"))))), canonical(parseXmlTree(out))), null);

  // Resolution is by namespace URI: "xsi" rebound to another namespace is not the nil marker.
  const rebound = importNemsisTree(schema, {
    name: "EMSDataSet",
    attrs: { xmlns: "http://www.nemsis.org", "xmlns:xsi": "urn:example:other" },
    children: [{ name: "Header", attrs: {}, text: "", children: [{ name: "DemographicGroup", attrs: {}, text: "", children: [
      { name: "dAgency.01", attrs: { "xsi:nil": "true" }, children: [], text: "351-T0495" },
    ] }] }],
    text: "",
  });
  assert.deepEqual(rebound.doc.Header[0].DemographicGroup["dAgency.01"], { value: "351-T0495", attrs: { "xsi:nil": "true" } });
});

test("DEM UUIDs must be unique within a DemographicReport, not across reports", () => {
  const { doc } = importFile(REFERENCE.find((f) => f.includes("full") && f.includes("DEM-1")));
  doc.DemographicReport.push(structuredClone(doc.DemographicReport[0]));
  const dupes = (d) => validateWhole("DEMDataSet", d).filter((i) => i.ruleId === "nemSch_d005");
  assert.deepEqual(dupes(doc), []);

  const people = doc.DemographicReport[1].dPersonnel?.["dPersonnel.PersonnelGroup"] ?? [];
  assert.ok(people.length >= 1 && people[0].attrs?.UUID, "DEM test case has personnel with UUIDs");
  people.push(structuredClone(people[0]));
  const found = dupes(doc);
  assert.ok(found.length > 0);
  assert.ok(found.every((i) => i.path.startsWith("DEMDataSet.DemographicReport[1].")), JSON.stringify(found.map((i) => i.path)));
});
