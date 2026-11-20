// FORGE FIELD: inspectors starting an inspection themselves (not assigned in the RMS).
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNewInspectionDraft,
  fieldCreateInput,
  isFieldInspectionId,
  localInspectionKey,
  localOnlyInspections,
  newFieldInspectionId,
  selfAssignee,
  startableInspectionTypes,
  startableOccupancies,
} from "../../src/field/inspectionStart.js";
import { canStartInspections } from "../../src/lib/inspections/inspectionPermissions.js";
import { validateInspectionForm } from "../../src/field/inspectionValidation.js";

const occupancy = {
  id: "OCC-1",
  name: "Main St Diner",
  address: "100 Main St",
  city: "Horn Lake",
  primaryContactEmail: "Owner@Diner.com",
  status: "Active",
};
const template = {
  sections: [{
    id: "s1",
    title: "General",
    fields: [
      { key: "business_name", label: "Business name", type: "short_text" },
      { key: "exits", label: "Exits clear", type: "pass_fail", required: true, autoCreateViolation: true },
    ],
  }],
};
const type = { id: "TYPE-ANNUAL", name: "Annual", category: "fire", templateId: "TPL-1", templateVersionId: "TV-1", templateSnapshot: template };
const inspector = { uid: "uid-insp", personnelId: "P-INSP", displayName: "Ivy Inspector" };

describe("field-started inspection ids", () => {
  it("are unique INS-F ids the sync can recognise", () => {
    const a = newFieldInspectionId();
    const b = newFieldInspectionId();
    assert.notEqual(a, b);
    assert.ok(isFieldInspectionId(a), a);
    assert.equal(isFieldInspectionId("INS-ABC-123"), false);
    assert.equal(isFieldInspectionId("../INS-F1-2"), false);
    assert.equal(isFieldInspectionId(""), false);
  });
});

describe("self assignment", () => {
  it("uses the linked personnel record, else the uid (like the RMS's Assign to me)", () => {
    assert.deepEqual(selfAssignee(inspector), { ids: ["P-INSP"], names: ["Ivy Inspector"] });
    assert.deepEqual(selfAssignee({ uid: "uid-only" }), { ids: ["uid-only"], names: [] });
    assert.deepEqual(selfAssignee({}), { ids: [], names: [] });
  });
});

describe("buildNewInspectionDraft", () => {
  it("builds an offline draft assigned to the inspector, prefilled from the occupancy", () => {
    const draft = buildNewInspectionDraft({ occupancy, type, snapshot: inspector, id: "INS-FABC-123456" });
    assert.equal(draft.inspectionId, "");
    assert.equal(draft.newInspection.id, "INS-FABC-123456");
    assert.equal(draft.newInspection.occupancyId, "OCC-1");
    assert.equal(draft.newInspection.inspectionTypeId, "TYPE-ANNUAL");
    assert.deepEqual(draft.newInspection.assignedInspectorIds, ["P-INSP"]);
    assert.equal(draft.inspection.occupancyName, "Main St Diner");
    assert.equal(draft.inspection.typeName, "Annual");
    assert.equal(draft.inspection.isNew, true);
    assert.deepEqual(draft.inspection.templateSnapshot, template);
    assert.equal(draft.answers.business_name, "Main St Diner");
    assert.equal(draft.emailReport.to, "owner@diner.com");
    assert.equal(draft.finish, false);
  });

  it("validates like an assigned inspection", () => {
    const draft = buildNewInspectionDraft({ occupancy, type, snapshot: inspector });
    const rules = { required: () => false };
    const errors = validateInspectionForm({ ...draft, finish: true }, rules);
    assert.ok(errors["a:exits"], "required checklist item");
    assert.ok(errors.result, "result needed to complete");
    assert.deepEqual(validateInspectionForm({ ...draft, finish: false }, rules), {});
  });

  it("needs an occupancy and a type", () => {
    assert.throws(() => buildNewInspectionDraft({ occupancy: null, type, snapshot: inspector }), /occupancy/);
    assert.throws(() => buildNewInspectionDraft({ occupancy, type: null, snapshot: inspector }), /type/);
  });

  it("works for a type with no checklist yet", () => {
    const draft = buildNewInspectionDraft({ occupancy, type: { id: "T2", name: "Complaint" }, snapshot: inspector });
    assert.deepEqual(draft.inspection.templateSnapshot, { sections: [] });
  });
});

describe("fieldCreateInput (what createInspection gets on first sync)", () => {
  const draft = buildNewInspectionDraft({ occupancy, type, snapshot: inspector, id: "INS-FABC-123456" });

  it("creates under the draft's id with the checklist answered on the device", () => {
    const input = fieldCreateInput(draft, inspector);
    assert.equal(input.id, "INS-FABC-123456");
    assert.equal(input.occupancyId, "OCC-1");
    assert.equal(input.inspectionTypeId, "TYPE-ANNUAL");
    assert.equal(input.templateId, "TPL-1");
    assert.deepEqual(input.templateSnapshot, template);
    assert.equal(input.source, "field-app");
  });

  it("assigns whoever is signed in at sync time, never what the saved draft says", () => {
    const tampered = { ...draft, newInspection: { ...draft.newInspection, assignedInspectorIds: ["P-SOMEONE-ELSE"] } };
    assert.deepEqual(fieldCreateInput(tampered, inspector).assignedInspectorIds, ["P-INSP"]);
  });

  it("refuses a draft without a field inspection id", () => {
    assert.throws(() => fieldCreateInput({ ...draft, newInspection: { ...draft.newInspection, id: "INS-EXISTING-1" } }, inspector), /valid id/);
    assert.throws(() => fieldCreateInput({}, inspector), /valid id/);
  });
});

describe("the Inspections list on the device", () => {
  const started = { localId: "in-1", kind: "inspection", status: "queued", data: { inspectionId: "", newInspection: { id: "INS-FA-1" } } };
  const synced = { localId: "in-2", kind: "inspection", status: "synced", data: { inspectionId: "INS-FB-2", newInspection: { id: "INS-FB-2" } } };
  const assignedDraft = { localId: "in-3", kind: "inspection", status: "draft", data: { inspectionId: "INS-X" } };
  const downloaded = { localId: "in-4", kind: "inspection", status: "draft", data: { inspectionId: "INS-FC-3", newInspection: { id: "INS-FC-3" } } };

  it("shows started inspections until they come down with the assigned list", () => {
    const rows = localOnlyInspections([started, synced, assignedDraft, downloaded], [{ id: "INS-X" }, { id: "INS-FC-3" }]);
    assert.deepEqual(rows.map((row) => row.localId), ["in-1"]);
  });

  it("keys local records by their RMS id", () => {
    assert.equal(localInspectionKey(started), "INS-FA-1");
    assert.equal(localInspectionKey(assignedDraft), "INS-X");
  });
});

describe("reference data for starting offline", () => {
  it("keeps active occupancies, sorted, as slim snapshots", () => {
    const rows = startableOccupancies([
      { id: "B", name: "Zeta Hall", address: "2 B St", status: "Active", inspections: ["heavy"] },
      { id: "A", name: "Alpha Mart", address: "1 A St" },
      { id: "C", name: "Old Mill", status: "Inactive" },
      { id: "D", name: "Gone", status: "archived" },
      { name: "No id" },
    ]);
    assert.deepEqual(rows.map((row) => row.id), ["A", "B"]);
    assert.equal(rows[1].inspections, undefined);
  });

  it("keeps live inspection types with their resolved checklist", () => {
    const rows = startableInspectionTypes([
      { id: "T1", name: "Annual" },
      { id: "T2", name: "Old", lifecycleStatus: "archived" },
      { id: "T3", name: "Complaint", active: false },
    ], (row) => (row.id === "T1" ? { templateId: "TPL-1", templateVersionId: "TV-1", templateSnapshot: template } : null));
    assert.deepEqual(rows.map((row) => row.id), ["T1"]);
    assert.equal(rows[0].templateId, "TPL-1");
    assert.deepEqual(rows[0].templateSnapshot, template);
  });
});

describe("canStartInspections", () => {
  it("is open to members who conduct, edit or assign inspections", () => {
    assert.equal(canStartInspections({ conductInspections: true }), true);
    assert.equal(canStartInspections({ editInspections: true }), true);
    assert.equal(canStartInspections({ assignInspections: true }), true);
    assert.equal(canStartInspections({}, true), true);
  });

  it("is closed to view-only members", () => {
    assert.equal(canStartInspections({ viewInspections: true, viewInspectionDashboard: true }), false);
    assert.equal(canStartInspections({}), false);
  });
});
