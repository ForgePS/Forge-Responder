// Digital Forms → inspection templates, and remarks/photos on No/Fail in inspections.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { TEMPLATE_FIELD_TYPES } from "../../src/lib/inspections/configDefaults.js";

import { findMissingRequiredFields } from "../../src/lib/inspections/checklistFields.js";
import { failDetailFields, findMissingFailRemarks, isFailAnswer } from "../../src/lib/inspections/inspectionFailDetails.js";
import { templateFromDefinition } from "../../src/lib/digitalForms/inspectionTemplateMapping.js";
import { validateInspectionForm } from "../../src/field/inspectionValidation.js";

const require = createRequire(import.meta.url);
const schema = require("../../functions/lib/digitalForms/schema.js");

const definition = schema.normalizeDefinition({
  name: "Fire Inspection Report",
  description: "Annual business inspection.",
  linkType: "occupancy",
  sections: [
    { title: "Access", fields: [
      { label: "Fire lanes clear", type: "yes_no", required: true },
      { label: "Address visible", type: "pass_fail_na" },
    ] },
    { title: "Sign-off", fields: [
      { label: "Inspector", type: "signature", required: true },
      { label: "Notes", type: "long_text" },
    ] },
  ],
});
const keyOf = (label) => definition.sections.flatMap((s) => s.fields).find((f) => f.label === label).key;

describe("digital form → inspection template", () => {
  const template = templateFromDefinition(definition, { formId: "form-1", inspectionTypeId: "type-1" });

  it("keeps the form's sections, keys, types and required flags", () => {
    assert.equal(template.name, "Fire Inspection Report");
    assert.equal(template.inspectionTypeId, "type-1");
    assert.equal(template.sourceDigitalFormId, "form-1");
    assert.equal(template.remarksOnFail, true);
    assert.deepEqual(template.sections.map((s) => s.title), ["Access", "Sign-off"]);
    const fields = template.sections.flatMap((s) => s.fields);
    assert.deepEqual(fields.map((f) => f.key), definition.sections.flatMap((s) => s.fields).map((f) => f.key));
    assert.deepEqual(fields.map((f) => f.type), ["yes_no", "pass_fail_na", "signature", "long_text"]);
    assert.deepEqual(fields.map((f) => f.required), [true, false, true, false]);
  });

  it("uses only field types inspections understand", () => {
    const known = new Set(TEMPLATE_FIELD_TYPES.map((t) => t.id || t));
    for (const field of template.sections.flatMap((s) => s.fields)) assert.ok(known.has(field.type), field.type);
  });

  it("required fields are checked the same way inspections check them", () => {
    const missing = findMissingRequiredFields(template, {});
    assert.deepEqual(missing.map((m) => m.label), ["Fire lanes clear", "Inspector"]);
  });
});

describe("remarks and photos on No/Fail in an inspection", () => {
  const snapshot = { ...templateFromDefinition(definition), remarksOnFail: true };
  const lanes = keyOf("Fire lanes clear");
  const address = keyOf("Address visible");

  it("spots No/Fail answers only on Yes/No and Pass/Fail items", () => {
    assert.ok(isFailAnswer({ type: "yes_no" }, "No"));
    assert.ok(isFailAnswer({ type: "pass_fail_na" }, "Fail"));
    assert.ok(!isFailAnswer({ type: "pass_fail_na" }, "N/A"));
    assert.ok(!isFailAnswer({ type: "short_text" }, "No"));
  });

  it("requires remarks for each No/Fail item, under its companion key", () => {
    const answers = { [lanes]: "No", [address]: "Fail", [`${address}__remarks`]: "Numbers faded" };
    assert.deepEqual(findMissingFailRemarks(snapshot, answers).map((m) => m.key), [`${lanes}__remarks`]);
    assert.deepEqual(findMissingFailRemarks(snapshot, { ...answers, [`${lanes}__remarks`]: "Blocked by dumpster" }), []);
    assert.deepEqual(findMissingFailRemarks(snapshot, { [lanes]: "Yes" }), []);
  });

  it("applies to every inspection template, not only ones made from a digital form", () => {
    const builtIn = { sections: [{ fields: [
      { key: "extinguishers", label: "Extinguishers serviced", type: "pass_fail" },
      { key: "egress", label: "Egress", type: "compliant" },
    ] }] };
    assert.deepEqual(
      findMissingFailRemarks(builtIn, { extinguishers: "Fail", egress: "Noncompliant" }).map((m) => m.key),
      ["extinguishers__remarks", "egress__remarks"],
    );
    assert.deepEqual(findMissingFailRemarks({ ...snapshot, remarksOnFail: false }, { [lanes]: "No" }).length, 1);
    assert.deepEqual(findMissingFailRemarks(null, { [lanes]: "No" }), []);
  });

  it("FORGE FIELD blocks Complete until a No/Fail item has remarks", () => {
    const data = {
      finish: true,
      result: "Failed",
      inspection: { templateSnapshot: snapshot },
      answers: { [lanes]: "No" },
    };
    const rules = { required: () => false };
    assert.ok(validateInspectionForm(data, rules)[`a:${lanes}__remarks`]);
    const fixed = { ...data, answers: { ...data.answers, [`${lanes}__remarks`]: "Blocked" } };
    assert.equal(validateInspectionForm(fixed, rules)[`a:${lanes}__remarks`], undefined);
  });

  it("a dropdown answered No/Fail opens remarks too (forms often make Yes/No a dropdown)", () => {
    const dropdown = { key: "access", label: "Fire Department access is unobstructed", type: "dropdown", options: ["Yes", "No", "N/A"] };
    assert.ok(isFailAnswer(dropdown, "No"));
    assert.ok(isFailAnswer({ ...dropdown, options: ["Satisfactory", "Unsatisfactory"] }, "Unsatisfactory"));
    assert.ok(isFailAnswer({ ...dropdown, type: "single_select" }, "Non-Compliant"));
    assert.ok(!isFailAnswer(dropdown, "Yes"));
    assert.ok(!isFailAnswer(dropdown, "N/A"));
    assert.ok(!isFailAnswer(dropdown, ""));
    const tmpl = { sections: [{ fields: [dropdown] }] };
    assert.deepEqual(findMissingFailRemarks(tmpl, { access: "No" }).map((m) => m.key), ["access__remarks"]);
    assert.equal(failDetailFields(dropdown, "No").remarks.label, "Remarks for No");
    assert.equal(failDetailFields({ ...dropdown, options: ["Pass", "Fail"] }, "Fail").remarks.label, "Remarks for Fail");
  });

  it("digital form submissions require remarks for a dropdown answered No", () => {
    const form = schema.normalizeDefinition({ name: "Walkthrough", sections: [{ title: "A", fields: [
      { label: "Exits clear", type: "dropdown", options: ["Yes", "No"] },
    ] }] });
    const field = form.sections[0].fields[0];
    assert.ok(schema.isNegativeAnswer(field, "No"));
    assert.ok(!schema.isNegativeAnswer(field, "Yes"));
  });

  it("the extra inputs are a required remarks box and an optional photo field", () => {
    const extra = failDetailFields({ id: "f1", key: lanes, type: "yes_no", label: "Fire lanes clear" });
    assert.equal(extra.remarks.key, `${lanes}__remarks`);
    assert.equal(extra.remarks.type, "long_text");
    assert.equal(extra.remarks.required, true);
    assert.equal(extra.remarks.label, "Remarks for No");
    assert.equal(extra.photos.key, `${lanes}__photos`);
    assert.equal(extra.photos.type, "photo");
    assert.ok(TEMPLATE_FIELD_TYPES.some((t) => (t.id || t) === "photo"));
  });
});
