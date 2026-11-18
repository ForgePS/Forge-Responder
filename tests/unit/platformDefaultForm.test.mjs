// The platform default inspection form: used by starter templates until a department changes them.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStarterTemplateDraft } from "../../src/lib/inspections/configDefaults.js";
import {
  defaultFormSnapshotFor,
  isUntouchedStarterTemplate,
  normalizePlatformDefaultForm,
  platformDefaultFormRecord,
  starterTemplateFromDefault,
  starterTemplateNeedsDefault,
} from "../../src/lib/inspections/platformDefaultForm.js";

const definition = {
  name: "Fire Inspection Checklist",
  description: "Uploaded paper form",
  sections: [
    { id: "s1", title: "Access and Premises ", fields: [
      { id: "f1", key: "access", label: "Fire Department access is unobstructed ", type: "dropdown", options: ["Yes", "No"], required: true },
      { id: "f2", key: "numbers", label: "Address numbers visible", type: "yes_no" },
    ] },
    { id: "s2", title: "Empty", fields: [] },
  ],
};
const record = platformDefaultFormRecord(
  { departmentId: "forge-demo", form: { id: "form-1", name: "Fire Inspection Checklist", currentVersion: 2 }, definition },
  { actorName: "Owner", now: "2026-11-18T12:00:00.000Z" },
);
const defaultForm = normalizePlatformDefaultForm(record);

// A starter template as ensureInspectionConfigSeeded stores it (after normalizing).
const seeded = (typeId, name, extra = {}) => ({
  ...buildStarterTemplateDraft(typeId, name),
  id: `tpl-${typeId}`,
  inspectionTypeId: typeId,
  currentVersion: 0,
  publishedVersionId: "",
  sourceDigitalFormId: "",
  ...extra,
});

describe("platform default inspection form", () => {
  it("is stored from a published digital form", () => {
    assert.equal(record.version, "forge-demo:form-1:v2:2026-11-18T12:00:00.000Z");
    assert.equal(record.sourceDepartmentId, "forge-demo");
    assert.equal(record.sourceFormVersion, 2);
    assert.equal(record.sections[0].fields[0].type, "dropdown");
    assert.deepEqual(record.sections[0].fields[0].options, ["Yes", "No"]);
    assert.equal(defaultForm.sections.length, 1, "sections without questions are dropped");
    assert.equal(normalizePlatformDefaultForm(null), null);
    assert.equal(normalizePlatformDefaultForm({ version: "x", sections: [] }), null);
  });

  it("replaces the built-in checklist on starter templates nobody has changed", () => {
    const template = seeded("annual-fire", "Annual fire inspection");
    assert.equal(isUntouchedStarterTemplate(template), true);
    assert.equal(starterTemplateNeedsDefault(template, defaultForm), true);
    const snapshot = defaultFormSnapshotFor(template, defaultForm);
    assert.equal(snapshot.remarksOnFail, true);
    assert.equal(snapshot.sections[0].fields[0].key, "access");
    assert.equal(snapshot.name, "Annual fire inspection form");
  });

  it("follows a newer default, but not once the department edits it", () => {
    const refreshed = { ...seeded("complaint", "Complaint inspection"), ...starterTemplateFromDefault(defaultForm, "complaint") };
    assert.equal(isUntouchedStarterTemplate(refreshed), true);
    assert.equal(starterTemplateNeedsDefault(refreshed, defaultForm), false, "already on this version");
    const newer = { ...defaultForm, version: "v3" };
    assert.equal(starterTemplateNeedsDefault(refreshed, newer), true);

    // Labels trimmed by normalizing still count as unchanged.
    const trimmed = structuredClone(refreshed);
    trimmed.sections[0].title = "Access and Premises";
    trimmed.sections[0].fields[0].label = "Fire Department access is unobstructed";
    assert.equal(isUntouchedStarterTemplate(trimmed), true);

    const edited = structuredClone(refreshed);
    edited.sections[0].fields.push({ key: "extra", type: "yes_no", label: "Added by the department" });
    assert.equal(isUntouchedStarterTemplate(edited), false);
    assert.equal(defaultFormSnapshotFor(edited, newer), null);
  });

  it("leaves templates the department changed alone", () => {
    const base = seeded("annual-fire", "Annual fire inspection");
    assert.equal(isUntouchedStarterTemplate({ ...base, publishedVersionId: "tpl-annual-fire-v1", currentVersion: 1 }), false, "published");
    assert.equal(isUntouchedStarterTemplate({ ...base, name: "Our annual form" }), false, "renamed");
    assert.equal(isUntouchedStarterTemplate({ ...base, sourceDigitalFormId: "form-9" }), false, "from its own form");
    const edited = structuredClone(base);
    edited.sections[0].fields[1].required = false;
    assert.equal(isUntouchedStarterTemplate(edited), false, "a question changed");
    assert.equal(isUntouchedStarterTemplate({ ...base, id: "tpl-custom", inspectionTypeId: "custom" }), false, "not a starter type");
    assert.equal(defaultFormSnapshotFor(base, null), null, "no default set");
  });
});
