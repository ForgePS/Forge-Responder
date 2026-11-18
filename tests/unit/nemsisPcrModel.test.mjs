// ePCR charting model (src/lib/nemsis/pcrModel.js): sections cover all of NEMSIS, field addressing reaches every
// nested group, and a report charted field by field exports exactly like the reference files.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { parseXmlTree, canonical, firstDifference } from "./helpers/xmlTree.mjs";
import { importNemsisTree, splitEmsDataSet } from "../../src/lib/nemsis/xmlImport.js";
import { instancesOf, NV } from "../../src/lib/nemsis/schema.js";
import {
  PCR_SECTIONS,
  sectionLayout,
  sectionFields,
  sectionForPath,
  sectionForElement,
  fieldInput,
  fieldPath,
  composeLeaf,
  getLeaf,
  getValue,
  setLeaf,
  setNotValue,
  groupRows,
  addGroupRow,
  removeGroupRow,
  newPcr,
  postCheck,
  pcrXml,
  pcrSummary,
  sectionProgress,
  nemsisDateTime,
  toLocalInput,
  fromLocalInput,
} from "../../src/lib/nemsis/pcrModel.js";

const require = createRequire(import.meta.url);
const { runNemsisSchematron } = require("../../functions/lib/nemsis/schematron.js");

const schema = loadNemsisSchema("3.5.1");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));
const TAC_FULL = path.join(ROOT, "tests", "fixtures", "nemsis", "tac-2026-pretesting", "xml", "full");
const TAC_EMS = fs.readdirSync(TAC_FULL).filter((f) => f.includes("-EMS-")).map((f) => path.join(TAC_FULL, f));

const pcrNode = schema.node("EMSDataSet", "PatientCareReport");
const pcrLeaves = () => {
  const out = [];
  const walk = (n) => (n.k === "l" ? out.push(n.n) : n.ch.forEach(walk));
  pcrNode.ch.forEach(walk);
  return out;
};

/** Re-chart a PCR from scratch with setLeaf only, visiting every stored leaf with its group row indexes. */
function rechart(source) {
  let pcr = {};
  const visit = (node, obj, at) => {
    for (const child of node.ch) {
      if (child.k === "l") {
        if (obj[child.n] !== undefined) pcr = setLeaf(schema, pcr, child.n, obj[child.n], at);
        continue;
      }
      const rows = instancesOf(obj, child.n);
      const repeating = child.max === null || child.max > 1;
      rows.forEach((row, index) => {
        const here = repeating ? { ...at, [child.n]: index } : at;
        if (row.attrs) {
          // Group attributes (e.g. CorrelationID) are set by writing the row object; keep them.
          pcr = setAttrs(pcr, child.n, row.attrs, here);
        }
        visit(child, row, here);
      });
    }
  };
  visit(pcrNode, source, {});
  return { ...pcr, ...(source.attrs ? { attrs: source.attrs } : {}) };
}

function setAttrs(pcr, group, attrs, at) {
  // Find the group's parent through a leaf-free walk using groupRows/addGroupRow semantics.
  const rows = groupRows(schema, pcr, group, at);
  const index = at[group] ?? 0;
  if (rows[index]) {
    rows[index].attrs = attrs;
    return pcr;
  }
  let next = pcr;
  let added = rows.length - 1;
  while (added < index) ({ pcr: next, index: added } = addGroupRow(schema, next, group, {}, at));
  groupRows(schema, next, group, at)[index].attrs = attrs;
  return next;
}

test("charting sections cover every NEMSIS PatientCareReport section exactly once", () => {
  const covered = PCR_SECTIONS.flatMap((s) => s.containers).sort();
  assert.deepEqual(covered, pcrNode.ch.map((c) => c.n).sort());
  const fields = PCR_SECTIONS.flatMap((s) => sectionFields(schema, s.id).map((f) => f.el));
  assert.deepEqual(fields.sort(), pcrLeaves().sort());
});

test("field descriptors carry labels, input kinds, codes and NV/PN options", () => {
  const sbp = fieldInput(schema, "eVitals.06");
  assert.equal(sbp.label, "SBP (Systolic Blood Pressure)");
  assert.equal(sbp.kind, "number");
  assert.equal(sbp.max, "500");
  assert.ok(sbp.nv.some((o) => o.code === NV.NotRecorded));

  const race = fieldInput(schema, "ePatient.14");
  assert.equal(race.kind, "multiselect");
  assert.ok(race.options.length >= 7 && race.options.every((o) => o.label && o.label !== o.code));

  assert.equal(fieldInput(schema, "eTimes.03").kind, "datetime");
  assert.equal(fieldInput(schema, "eTimes.03").usage, "Mandatory");
  assert.equal(fieldInput(schema, "eNarrative.01").kind, "textarea");
  assert.throws(() => fieldInput(schema, "eVitals.VitalGroup"));
});

test("section layout nests groups and marks essential fields", () => {
  const vitals = sectionLayout(schema, "vitals");
  const group = vitals.find((n) => n.type === "group" && n.name === "eVitals.VitalGroup");
  assert.ok(group.repeating && group.required && group.essential);
  const bp = group.children.find((n) => n.name === "eVitals.BloodPressureGroup");
  assert.equal(bp.label, "Blood pressure");
  assert.ok(bp.children.some((n) => n.type === "field" && n.field.el === "eVitals.06" && n.essential));
  assert.equal(sectionForElement(schema, "eVitals.06"), "vitals");
  assert.equal(sectionForPath("PatientCareReport.eVitals.eVitals.VitalGroup[2].eVitals.06"), "vitals");
  assert.equal(sectionForPath("PatientCareReport.eRecord.eRecord.01"), "record");
});

test("setLeaf / getLeaf address nested repeating groups without changing the input", () => {
  const empty = Object.freeze({});
  let pcr = setLeaf(schema, empty, "eVitals.06", 142, { "eVitals.VitalGroup": 1 });
  assert.deepEqual(Object.keys(empty), []);
  assert.equal(groupRows(schema, pcr, "eVitals.VitalGroup").length, 2);
  assert.equal(getValue(schema, pcr, "eVitals.06", { "eVitals.VitalGroup": 1 }), 142);
  assert.equal(getValue(schema, pcr, "eVitals.06"), undefined);

  const before = pcr;
  pcr = setLeaf(schema, pcr, "eVitals.07", 88, { "eVitals.VitalGroup": 1 });
  assert.equal(getValue(schema, before, "eVitals.07", { "eVitals.VitalGroup": 1 }), undefined, "previous version unchanged");

  // Two levels of repeating groups: medication row 0, dose... (eMedications has none) → labs result rows.
  pcr = setLeaf(schema, pcr, "eLabs.04", "3304007", { "eLabs.LabGroup": 0, "eLabs.LabResultGroup": 2 });
  assert.equal(groupRows(schema, pcr, "eLabs.LabResultGroup", { "eLabs.LabGroup": 0 }).length, 3);

  pcr = setNotValue(schema, pcr, "eVitals.06", NV.NotApplicable);
  assert.deepEqual(getLeaf(schema, pcr, "eVitals.06"), { NV: NV.NotApplicable });
  pcr = setLeaf(schema, pcr, "eVitals.06", "");
  assert.equal(getLeaf(schema, pcr, "eVitals.06"), undefined);

  pcr = setLeaf(schema, pcr, "ePatient.14", ["2514011", "", "2514007"]);
  assert.deepEqual(getLeaf(schema, pcr, "ePatient.14"), ["2514011", "2514007"]);

  const added = addGroupRow(schema, pcr, "eMedications.MedicationGroup", { "eMedications.03": "7052" });
  assert.equal(added.index, 0);
  const removed = removeGroupRow(schema, added.pcr, "eMedications.MedicationGroup", 0);
  assert.deepEqual(groupRows(schema, removed, "eMedications.MedicationGroup"), []);
});

test("re-charting every reference PCR field by field exports identical XML", () => {
  const cases = [
    { label: "pcr-chest-pain.json", agency: fixture.agency, reports: [{ uuid: fixture.uuid, data: fixture.data }] },
    ...TAC_EMS.map((file) => {
      const { doc } = importNemsisTree(schema, parseXmlTree(fs.readFileSync(file, "utf8")));
      const [header] = splitEmsDataSet(doc);
      return { label: path.basename(file), agency: header.agency, reports: header.reports };
    }),
  ];
  assert.ok(cases.length >= 6);
  for (const { label, agency, reports } of cases) {
    for (const { uuid, data } of reports) {
      const original = pcrXml(schema, { agency, uuid, pcr: data });
      const charted = pcrXml(schema, { agency, uuid, pcr: rechart(data) });
      assert.equal(firstDifference(canonical(parseXmlTree(original)), canonical(parseXmlTree(charted))), null, label);
    }
  }
});

test("newPcr prefills record, agency, unit, crew and CAD times; posting is blocked until charted", () => {
  const notified = "2026-11-17T14:03:00-06:00";
  const pcr = newPcr(schema, {
    uuid: "0b6f6d1e-1c1a-4d55-9a57-3f1f3b7f0c11",
    number: "FORGE-2026-F001",
    softwareVersion: "1.0.0",
    agency: { number: "TEST001", name: "Test Fire" },
    unit: { vehicleNumber: "M1", callSign: "Medic 1" },
    incidentNumber: "26-001234",
    responseNumber: "26-001234-M1",
    crew: [{ id: "P123", level: "9925007", roles: ["2402003"] }, { id: "E456", level: "9925005" }],
    cad: { id: "CAD-99", notified },
  });
  assert.equal(getValue(schema, pcr, "eRecord.03"), "Forge Responder ePCR");
  assert.equal(getValue(schema, pcr, "eTimes.03"), notified);
  assert.equal(getValue(schema, pcr, "eCrew.01", { "eCrew.CrewGroup": 1 }), "E456");
  assert.equal(getValue(schema, pcr, "eDispatch.01"), undefined, "unknown values are left empty");

  const check = postCheck(schema, pcr);
  assert.equal(check.ok, false);
  assert.ok(check.blocking.some((i) => i.element === "eResponse.05"), "type of service requested is Mandatory");
  assert.ok(check.bySection.response?.some((i) => i.blocking));
  assert.ok(check.warnings.some((i) => i.element === "eTimes.07" && i.code === "notRecorded"), "Required fields warn");
  assert.equal(pcr.attrs.UUID, "0b6f6d1e-1c1a-4d55-9a57-3f1f3b7f0c11");

  const summary = pcrSummary(schema, pcr);
  assert.equal(summary.unit, "Medic 1");
  assert.equal(summary.patient, "Unknown patient");
  const progress = sectionProgress(schema, pcr);
  assert.ok(progress.record.filled > 0 && progress.patient.filled === 0 && progress.patient.total > 0);
  assert.equal(progress.crew.total, 0, "crew fields are all Recommended, so none are essential");
});

test("a fully charted report passes postCheck and the national Schematron", async () => {
  const check = postCheck(schema, { ...fixture.data, attrs: { UUID: fixture.uuid } }, { now: Date.parse("2026-11-17T00:00:00Z") });
  assert.deepEqual(check.blocking, []);
  const result = await runNemsisSchematron(pcrXml(schema, { agency: fixture.agency, uuid: fixture.uuid, pcr: fixture.data }));
  assert.equal(result.errorCount, 0);
});

test("NEMSIS date/times carry the device offset and round-trip through datetime-local inputs", () => {
  const value = nemsisDateTime(new Date(2026, 10, 17, 9, 5, 7));
  assert.match(value, /^2026-11-17T09:05:07[+-]\d{2}:\d{2}$/);
  assert.equal(toLocalInput(value), "2026-11-17T09:05:07");
  assert.equal(fromLocalInput("2026-11-17T09:05"), nemsisDateTime(new Date(2026, 10, 17, 9, 5, 0)));
  assert.equal(fromLocalInput(""), "");
  assert.equal(toLocalInput("not a date"), "");
});

test("fieldPath matches the paths validateNemsis reports", () => {
  const at = { "eVitals.VitalGroup": 1 };
  let pcr = setLeaf(schema, {}, "eVitals.06", 999, at); // out of range
  const issue = postCheck(schema, pcr).issues.find((i) => i.element === "eVitals.06" && i.code === "invalidValue");
  assert.ok(issue);
  assert.equal(issue.path, fieldPath(schema, "eVitals.06", at));
  pcr = setLeaf(schema, {}, "ePatient.14", ["bad"]);
  const race = postCheck(schema, pcr).issues.find((i) => i.element === "ePatient.14" && i.code === "invalidValue");
  assert.ok(race.path.startsWith(fieldPath(schema, "ePatient.14")));
});

test("composeLeaf keeps the simplest stored form", () => {
  assert.equal(composeLeaf(undefined, { value: "120" }), "120");
  assert.deepEqual(composeLeaf("120", { NV: NV.NotRecorded, value: undefined }), { NV: NV.NotRecorded });
  assert.equal(composeLeaf({ NV: NV.NotRecorded }, { NV: undefined, value: "" }), undefined);
  assert.deepEqual(composeLeaf("7052", { attrs: { CodeType: "9924003" } }), { value: "7052", attrs: { CodeType: "9924003" } });
  assert.equal(composeLeaf({ value: "7052", attrs: { CodeType: "9924003" } }, { attrs: { CodeType: "" } }), "7052");
});

test("signatures are stored as NEMSIS asks, validate, export, and only safe images are shown", async () => {
  const model = await import("../../src/lib/nemsis/pcrModel.js");
  const { SIGNATURE_GROUP, setSignature, clearSignature, signatureImage, graphicDataUrl, sectionReadout, MAX_SIGNATURE_BASE64 } = model;
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const at = { [SIGNATURE_GROUP]: 0 };
  let pcr = setLeaf(schema, {}, "eOther.12", "4512015", at); // patient
  pcr = setSignature(schema, pcr, at, { dataUrl: `data:image/png;base64,${PNG}`, signedAt: "2026-11-17T10:00:00-06:00" });
  assert.equal(getValue(schema, pcr, "eOther.16", at), "signature-1.png");
  assert.equal(getValue(schema, pcr, "eOther.17", at), "image/png");
  assert.equal(getValue(schema, pcr, "eOther.18", at), PNG);
  assert.equal(getValue(schema, pcr, "eOther.19", at), "2026-11-17T10:00:00-06:00");
  assert.equal(getValue(schema, pcr, "eOther.15", at), "4515031", "patient signed → Signed");
  assert.equal(signatureImage(schema, pcr, at), `data:image/png;base64,${PNG}`);

  // A representative signing → Signed-Not Patient; a status the crew already chose is kept.
  const rep = { [SIGNATURE_GROUP]: 1 };
  let two = setLeaf(schema, pcr, "eOther.12", "4512017", rep);
  two = setSignature(schema, two, rep, { dataUrl: `data:image/png;base64,${PNG}` });
  assert.equal(getValue(schema, two, "eOther.15", rep), "4515033");
  assert.equal(getValue(schema, two, "eOther.16", rep), "signature-2.png");
  const kept = setSignature(schema, setLeaf(schema, {}, "eOther.15", "4515027", at), at, { dataUrl: `data:image/png;base64,${PNG}` });
  assert.equal(getValue(schema, kept, "eOther.15", at), "4515027");

  // No validation issues on the signature fields, and the XML carries the image.
  const issues = postCheck(schema, two).issues.filter((i) => i.element?.startsWith("eOther."));
  assert.deepEqual(issues, []);
  const xml = pcrXml(schema, { agency: { "dAgency.01": "1", "dAgency.02": "1", "dAgency.04": "37" }, uuid: "0b6f6d1e-1c1a-4d55-9a57-3f1f3b7f0c11", pcr: two });
  assert.match(xml, new RegExp(`<eOther\.18>${PNG.replace(/[+/=]/g, "\$&")}</eOther\.18>`));

  // The RMS readout carries the image; clearing keeps who signed and drops the automatic Signed status.
  const readout = JSON.stringify(sectionReadout(schema, two, "other"));
  assert.ok(readout.includes(`"image":"data:image/png;base64,${PNG}"`));
  const cleared = clearSignature(schema, two, at);
  assert.equal(getValue(schema, cleared, "eOther.18", at), undefined);
  assert.equal(getValue(schema, cleared, "eOther.19", at), undefined);
  assert.equal(getValue(schema, cleared, "eOther.12", at), "4512015");
  assert.equal(getValue(schema, cleared, "eOther.15", at), undefined, "no longer signed");
  const paper = clearSignature(schema, kept, at);
  assert.equal(getValue(schema, paper, "eOther.15", at), "4515027", "a status the crew chose stays");

  // Only PNG data URLs are accepted, within the size limit; only safe raster types are shown inline.
  assert.throws(() => setSignature(schema, {}, at, { dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }));
  assert.throws(() => setSignature(schema, {}, at, { dataUrl: `data:image/png;base64,${"A".repeat(MAX_SIGNATURE_BASE64 + 4)}` }));
  assert.equal(graphicDataUrl("image/svg+xml", "PHN2Zz4="), null);
  assert.equal(graphicDataUrl("image/png", 'abc" onerror="x'), null);
  assert.equal(graphicDataUrl("IMAGE/PNG", PNG), `data:image/png;base64,${PNG}`);
});
