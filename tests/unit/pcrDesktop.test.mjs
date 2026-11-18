// RMS patient care reports: CAD mapping and refresh, department form settings, AI narrative facts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { fromLocalInput, getValue, newPcr, setLeaf, postCheck } from "../../src/lib/nemsis/pcrModel.js";
import { parseCadPayload } from "../../src/lib/neris/cadImport.js";
import {
  applyCadChanges, cadChanges, cadLink, cadRecordFromAlert, cadRecordFromPayload, cadRefresh, cadTime, cadValues, findCadRecord,
  recentCadRecords, sameUnit,
} from "../../src/lib/pcr/pcrCad.js";
import {
  applyFormDefaults, customizeLayout, departmentIssues, formFieldIndex, normalizePcrForm, sectionCanHide, setFieldSetting,
  visibleSections, withDepartmentIssues,
} from "../../src/lib/pcr/pcrForm.js";
import { sectionLayout } from "../../src/lib/nemsis/pcrModel.js";
import { clockTime, pcrNarrativeFacts, quickPcrNarrative } from "../../src/lib/nemsis/pcrNarrativeFacts.js";

const require = createRequire(import.meta.url);
const schema = loadNemsisSchema("3.5.1");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));

const CAD_RUN = {
  incident_number: "2026-04179",
  incident_type: "Cardiac arrest",
  address: "88 Willow Ln",
  state: "NC",
  received_time: "2026-11-16T16:38",
  dispatch_time: "2026-11-16T16:39",
  clear_time: "2026-11-16T17:39",
  latitude: "35.7801",
  longitude: "-78.6412",
  comments: "Wife doing CPR.",
  units: [
    { unit_id: "Engine 1", dispatch_time: "2026-11-16T16:39", enroute_time: "2026-11-16T16:40", arrival_time: "2026-11-16T16:44", clear_time: "2026-11-16T17:16" },
    { unit_id: "Medic 1", dispatch_time: "2026-11-16T16:39", enroute_time: "2026-11-16T16:40", arrival_time: "2026-11-16T16:45", clear_time: "2026-11-16T17:39" },
  ],
};
const record = () => cadRecordFromPayload(parseCadPayload(JSON.stringify(CAD_RUN)).payload, { source: "demo-cad" });

test("units match by name or abbreviation, never two different full names", () => {
  assert.ok(sameUnit("Medic 1", "MEDIC-1"));
  assert.ok(sameUnit("Medic 1", "M1"));
  assert.ok(sameUnit("M1", "Medic 1"));
  assert.ok(!sameUnit("Medic 1", "Mutual 1"));
  assert.ok(!sameUnit("Medic 1", "Medic 12"));
  assert.ok(!sameUnit("", "Medic 1"));
});

test("CAD times become NEMSIS date/times; local times stay local", () => {
  assert.equal(cadTime("2026-11-16T16:38"), fromLocalInput("2026-11-16T16:38"));
  assert.match(cadTime("2026-11-16T22:38:00Z"), /^2026-11-1\dT\d{2}:38:00[+-]\d{2}:\d{2}$/);
  assert.equal(cadTime(""), "");
  assert.equal(cadTime("not a time"), "");
});

test("a CAD export fills the report for the chosen unit, with that unit's own times", () => {
  const values = cadValues(record(), "Medic 1");
  assert.equal(values["eResponse.03"], "2026-04179");
  assert.equal(values["eTimes.01"], cadTime("2026-11-16T16:38"));
  assert.equal(values["eTimes.03"], cadTime("2026-11-16T16:39"));
  assert.equal(values["eTimes.06"], cadTime("2026-11-16T16:45"), "Medic 1 arrived at 16:45, not Engine 1's 16:44");
  assert.equal(values["eTimes.13"], cadTime("2026-11-16T17:39"));
  assert.equal(values["eScene.15"], "88 Willow Ln");
  assert.equal(values["eScene.18"], "37");
  assert.equal(values["eScene.11"], "35.7801,-78.6412");
  const engine = cadValues(record(), "E1");
  assert.equal(engine["eTimes.06"], cadTime("2026-11-16T16:44"));
});

test("an Active911 alert gives the unit notified time, address, location and state", () => {
  const rec = cadRecordFromAlert({ id: "a1", description: "Breathing problems", address: "415 Oak Ave", state: "NC", units: "M1, E1", sentAt: "2026-11-17T17:55:00Z", latitude: 35.78, longitude: -78.64 });
  assert.deepEqual(rec.units.map((u) => u.id), ["M1", "E1"]);
  const values = cadValues(rec, "Medic 1");
  assert.equal(values["eTimes.03"], cadTime("2026-11-17T17:55:00Z"));
  assert.equal(values["eScene.15"], "415 Oak Ave");
  assert.equal(values["eTimes.06"], undefined);
});

test("refresh fills blanks and CAD changes, but keeps what a person typed", () => {
  const first = { ...record(), call: { ...record().call, backInService: "" }, units: record().units.map((u) => ({ ...u, backInService: "" })) };
  const firstValues = cadValues(first, "Medic 1");
  let nemsis = newPcr(schema, { uuid: "u1", number: "P-1", softwareVersion: "t", agency: { number: "A1" } });
  nemsis = applyCadChanges(schema, nemsis, cadChanges(schema, nemsis, firstValues, null, { overwrite: true }));
  // The crew corrects the arrival time by hand.
  nemsis = setLeaf(schema, nemsis, "eTimes.06", fromLocalInput("2026-11-16T16:46"));
  const report = { unit: "Medic 1", incidentNumber: "2026-04179", nemsis, cad: cadLink(first, firstValues) };

  // CAD later: Medic 1 cleared, and CAD changed its arrival time too.
  const later = record();
  later.units = later.units.map((u) => (u.id === "Medic 1" ? { ...u, onScene: cadTime("2026-11-16T16:47") } : u));
  const refresh = cadRefresh(schema, report, [later]);
  assert.deepEqual(refresh.changes.map((c) => c.el), ["eTimes.13"], "back in service is new; the hand-typed arrival is kept");
  const next = applyCadChanges(schema, report.nemsis, refresh.changes);
  assert.equal(getValue(schema, next, "eTimes.13"), cadTime("2026-11-16T17:39"));
  assert.equal(getValue(schema, next, "eTimes.06"), fromLocalInput("2026-11-16T16:46"));
});

test("refresh takes a CAD change when nobody edited the field; without a record of CAD only blanks are filled", () => {
  const rec = record();
  const values = cadValues(rec, "Medic 1");
  const nemsis = applyCadChanges(schema, {}, cadChanges(schema, {}, values, null, { overwrite: true }));
  const changed = { ...rec, units: rec.units.map((u) => (u.id === "Medic 1" ? { ...u, onScene: cadTime("2026-11-16T16:48") } : u)) };
  const withLink = cadRefresh(schema, { unit: "Medic 1", nemsis, cad: cadLink(rec, values) }, [changed]);
  assert.deepEqual(withLink.changes.map((c) => c.el), ["eTimes.06"]);
  const noLink = cadRefresh(schema, { unit: "Medic 1", incidentNumber: "2026-04179", nemsis }, [changed]);
  assert.deepEqual(noLink.changes, []);
});

test("the CAD record is found by its link first, then by incident number", () => {
  const a = { ...record(), source: "active911", id: "x1", incidentNumber: "" };
  const b = record();
  assert.equal(findCadRecord({ cad: { source: "active911", id: "x1" } }, [b, a]), a);
  assert.equal(findCadRecord({ incidentNumber: "2026-04179" }, [a, b]), b);
  assert.equal(findCadRecord({ incidentNumber: "nope" }, [a, b]), null);
});

test("recent CAD records are newest first and skip old ones", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const r = (id, at) => ({ id, source: "cad", sentAt: at });
  const list = recentCadRecords([r("old", "2026-11-01T00:00:00Z"), r("a", "2026-11-17T10:00:00Z"), r("b", "2026-11-17T11:00:00Z")], { now, hours: 24 });
  assert.deepEqual(list.map((x) => x.id), ["b", "a"]);
});

test("form settings are cleaned when saved", () => {
  const form = normalizePcrForm({
    sections: { payment: { hidden: true }, bogus: { hidden: true } },
    fields: {
      "eDisposition.01": { label: "  Destination  ", choices: ["A", "", "A", "B"] },
      "not an element": { hidden: true },
      "eSituation.11": { pinned: ["x"], options: [] },
    },
    aiNarrative: "yes",
  });
  assert.deepEqual(form.sections, { payment: { hidden: true } });
  assert.deepEqual(form.fields["eDisposition.01"], { label: "Destination", choices: ["A", "B"] });
  assert.deepEqual(Object.keys(form.fields), ["eDisposition.01", "eSituation.11"]);
  assert.equal(form.aiNarrative, false);
});

test("editing keeps text as typed; empty settings are removed", () => {
  let form = normalizePcrForm(null);
  form = setFieldSetting(form, "eDisposition.01", { label: "Dest ", choices: ["A", ""] });
  assert.deepEqual(form.fields["eDisposition.01"], { label: "Dest ", choices: ["A", ""] });
  form = setFieldSetting(form, "eDisposition.01", { label: "", choices: [] });
  assert.equal(form.fields["eDisposition.01"], undefined);
});

test("NEMSIS required fields and sections can't be hidden", () => {
  const index = formFieldIndex(schema);
  assert.ok(index.size > 300);
  assert.equal(sectionCanHide(schema, "times"), false);
  assert.equal(sectionCanHide(schema, "labs"), true);
  const form = normalizePcrForm({ sections: { times: { hidden: true }, labs: { hidden: true } }, fields: { "eTimes.03": { hidden: true }, "eDispatch.03": { hidden: true } } });
  const ids = visibleSections(schema, form).map((s) => s.id);
  assert.ok(ids.includes("times"));
  assert.ok(!ids.includes("labs"));
  const flat = (items) => items.flatMap((i) => (i.type === "field" ? [i.field.el] : flat(i.children)));
  assert.ok(flat(customizeLayout(sectionLayout(schema, "times"), form)).includes("eTimes.03"));
  assert.ok(!flat(customizeLayout(sectionLayout(schema, "dispatch"), form)).includes("eDispatch.03"));
});

test("labels, chosen and pinned choices and department-required fields reach the form", () => {
  const field = schema.codes("eDispatch.01", "EMSDataSet");
  const codes = Object.keys(field);
  const form = normalizePcrForm({ fields: { "eDispatch.01": { label: "Nature", options: [codes[3], codes[1], codes[2]], pinned: [codes[2]], required: true } } });
  const item = customizeLayout(sectionLayout(schema, "dispatch"), form).find((i) => i.type === "field" && i.field.el === "eDispatch.01");
  assert.equal(item.field.label, "Nature");
  assert.equal(item.field.nemsisLabel, "Dispatch Reason");
  assert.deepEqual(item.field.options.map((o) => o.code), [codes[2], codes[3], codes[1]]);
  assert.equal(item.field.options[0].pinned, true);
  assert.equal(item.field.departmentRequired, true);
});

test("department-required fields block posting until filled", () => {
  const form = normalizePcrForm({ fields: { "eDisposition.01": { required: true, label: "Destination" } } });
  const base = { ok: true, blocking: [], issues: [] };
  const empty = setLeaf(schema, fixture.data, "eDisposition.01", "");
  const blank = withDepartmentIssues(base, schema, empty, form);
  assert.equal(blank.ok, false);
  assert.equal(blank.blocking.length, 1);
  assert.equal(blank.blocking[0].code, "department-required");
  assert.match(blank.blocking[0].message, /Destination is required by your department/);
  const filled = setLeaf(schema, empty, "eDisposition.01", "Riverside Regional");
  assert.deepEqual(departmentIssues(schema, filled, form), []);
  assert.equal(withDepartmentIssues(base, schema, filled, form), base);
  // A department-required field in a hidden section doesn't block.
  const hidden = normalizePcrForm({ sections: { labs: { hidden: true } }, fields: { "eLabs.01": { required: true } } });
  assert.deepEqual(departmentIssues(schema, fixture.data, hidden), []);
});

test("defaults fill new reports, only with valid codes", () => {
  const codes = Object.keys(schema.codes("eResponse.05", "EMSDataSet"));
  const form = normalizePcrForm({ fields: { "eResponse.05": { defaultValue: codes[0] }, "eResponse.23": { defaultValue: "bogus" }, "eDisposition.01": { defaultValue: "Riverside Regional" } } });
  const pcr = applyFormDefaults(schema, {}, form);
  assert.equal(getValue(schema, pcr, "eResponse.05"), codes[0]);
  assert.equal(getValue(schema, pcr, "eResponse.23"), undefined);
  assert.equal(getValue(schema, pcr, "eDisposition.01"), "Riverside Regional");
  const kept = applyFormDefaults(schema, setLeaf(schema, {}, "eDisposition.01", "Other"), form);
  assert.equal(getValue(schema, kept, "eDisposition.01"), "Other", "never overwrites");
});

test("AI facts are clinical only: no names, dates, addresses or numbers that identify", () => {
  let pcr = setLeaf(schema, fixture.data, "eScene.15", "123 Secret St");
  pcr = setLeaf(schema, pcr, "ePatient.17", "1968-03-04");
  const facts = pcrNarrativeFacts(schema, pcr);
  const text = JSON.stringify(facts);
  for (const forbidden of ["Testpatient", "Alex", "123 Secret St", "1968", "2026-11-15", "eRecord", fixture.data.eRecord?.["eRecord.01"] || "#none#"]) {
    assert.ok(!text.includes(forbidden), `facts leak ${forbidden}`);
  }
  assert.equal(facts.patient.age, "58 years");
  assert.ok(facts.sections.some((s) => s.section === "Vitals" && s.lines.some((l) => /Heart Rate: 96/.test(l))));
  assert.ok(facts.sections.some((s) => s.section === "Medications" && s.lines.some((l) => /aspirin \(code 1191\)/.test(l))));
  assert.ok(facts.sections.find((s) => s.section === "Times").lines.every((l) => /: \d{2}:\d{2}$/.test(l)), "times are clock times only");
});

test("ages of 90 and over are grouped", () => {
  const pcr = setLeaf(schema, fixture.data, "ePatient.15", 94);
  assert.equal(pcrNarrativeFacts(schema, pcr).patient.age, "90 or older");
  assert.equal(clockTime("2026-11-15T14:03:05-06:00"), "14:03");
});

test("the quick draft reads as a narrative from the charted facts", () => {
  const draft = quickPcrNarrative(pcrNarrativeFacts(schema, fixture.data));
  assert.match(draft, /^Unit notified at 14:03 for chest pain/);
  assert.match(draft, /58-year-old/);
  assert.match(draft, /At 14:16: Medication Administered aspirin/);
  assert.match(draft, /Left the scene at 14:31/);
});

test("the server prompt carries the facts, and notes are scrubbed before they are sent", async () => {
  const { buildPcrUserMessage, draftPcrNarrative, factsText } = require("../../functions/lib/pcrNarrative.js");
  const facts = pcrNarrativeFacts(schema, fixture.data);
  assert.match(factsText(facts), /\[Vitals\]/);
  assert.match(buildPcrUserMessage(facts, "", "chart", ""), /CHART/);
  let sent = null;
  const client = { beta: { messages: { create: async (req) => {
    sent = req;
    return { stop_reason: "end_turn", model: "test", content: [{ type: "text", text: JSON.stringify({ narrative: "Draft.", missing: [] }) }] };
  } } } };
  const out = await draftPcrNarrative(client, { facts, notes: "Patient John Smith, call 555-123-4567, DOB 03/04/1968", style: "soap" });
  assert.equal(out.narrative, "Draft.");
  const user = sent.messages[0].content;
  assert.match(user, /\[name removed\]/);
  assert.doesNotMatch(user, /John Smith|555-123-4567|1968/);
  assert.match(user, /\[Medications\]/);
});
