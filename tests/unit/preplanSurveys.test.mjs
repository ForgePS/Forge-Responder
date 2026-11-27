import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SURVEY_CHECKLIST,
  SURVEYOR_FIELDS,
  canWorkOnSurvey,
  checklistForPreplan,
  checklistToText,
  dueState,
  normalizeSurvey,
  normalizeSurveySettings,
  parseChecklistText,
  proposableFields,
  proposedChanges,
  sortSurveys,
  submissionProblems,
  surveyFoundNoChanges,
  surveyIsFor,
} from "../../src/lib/preplans/surveyModel.js";

const checklist = [
  { id: "a", group: "Building information", label: "Address" },
  { id: "b", group: "Equipment", label: "Knox box" },
];
const base = { id: "S1", preplanId: "P1", status: "assigned", checklist, assignedStation: "Station 1", assignedShift: "A Shift", version: 1 };

describe("checklists", () => {
  it("parse typed lists with groups and round-trip", () => {
    const items = parseChecklistText("Building:\n  Address matches\n  Contacts\nEquipment: Knox box\n\n");
    assert.deepEqual(items.map((row) => [row.group, row.label]), [["Building", "Address matches"], ["Building", "Contacts"], ["Equipment", "Knox box"]]);
    assert.deepEqual(parseChecklistText(checklistToText(items)), items);
  });

  it("use the template's own checklist, else the department's standard, else Forge's", () => {
    assert.equal(checklistForPreplan(null, {}).length, DEFAULT_SURVEY_CHECKLIST.length);
    const settings = { standard: [{ id: "x", group: "G", label: "Std" }], byTemplate: { T1: [{ id: "y", group: "G", label: "High-rise" }] } };
    assert.equal(checklistForPreplan(settings, { templateId: "T1" })[0].label, "High-rise");
    assert.equal(checklistForPreplan(settings, { templateId: "T2" })[0].label, "Std");
    assert.equal(normalizeSurveySettings({ defaultDueDays: 9999 }).defaultDueDays, 365);
  });
});

describe("who a survey is for", () => {
  const survey = normalizeSurvey(base);
  it("named people, or members of its station and shift", () => {
    assert.equal(surveyIsFor(survey, { uid: "u1", station: "Station 1", shift: "A Shift" }), true);
    assert.equal(surveyIsFor(survey, { uid: "u1", station: "Station 1", shift: "B Shift" }), false);
    assert.equal(surveyIsFor(survey, { uid: "u1", station: "Station 2", shift: "A Shift" }), false);
    assert.equal(surveyIsFor(normalizeSurvey({ ...base, assignedStation: "", assignedUserIds: ["u2"] }), { uid: "u2" }), true);
    // Any shift when none is set.
    assert.equal(surveyIsFor(normalizeSurvey({ ...base, assignedShift: "" }), { uid: "u1", station: "Station 1", shift: "C Shift" }), true);
  });

  it("can be worked on only while open and only with the survey permission", () => {
    const me = { uid: "u1", station: "Station 1", shift: "A Shift", canConduct: true };
    assert.equal(canWorkOnSurvey(survey, me), true);
    assert.equal(canWorkOnSurvey(survey, { ...me, canConduct: false }), false);
    assert.equal(canWorkOnSurvey(normalizeSurvey({ ...base, status: "submitted" }), me), false);
    assert.equal(canWorkOnSurvey(normalizeSurvey({ ...base, status: "returned" }), me), true);
  });
});

describe("submitting", () => {
  it("needs every item answered, and a note for changed or unchecked items", () => {
    const empty = normalizeSurvey(base);
    assert.match(submissionProblems(empty)[0], /2 checklist items have no answer/);
    const noNote = normalizeSurvey({ ...base, results: { a: { result: "confirmed" }, b: { result: "changed" } } });
    assert.match(submissionProblems(noNote)[0], /Say what changed/);
    const ready = normalizeSurvey({ ...base, results: { a: { result: "confirmed" }, b: { result: "changed", note: "Moved to the east door" } } });
    assert.deepEqual(submissionProblems(ready), []);
  });

  it("knows when nothing changed (can count as a field verification)", () => {
    assert.equal(surveyFoundNoChanges(normalizeSurvey({ ...base, results: { a: { result: "confirmed" }, b: { result: "na" } } })), true);
    assert.equal(surveyFoundNoChanges(normalizeSurvey({ ...base, results: { a: { result: "confirmed" }, b: { result: "not_checked", note: "Locked" } } })), false);
    assert.equal(surveyFoundNoChanges(normalizeSurvey({ ...base, results: { a: { result: "confirmed" }, b: { result: "na" } }, proposedAnswers: { knox: "East door" } })), false);
  });
});

describe("corrections", () => {
  const sections = [{ title: "Access", fields: [
    { key: "primaryAccess", label: "Primary access", type: "text" },
    { key: "knoxLocation", label: "Knox location", type: "text", sensitive: true },
    { key: "photo", label: "Photo", type: "file" },
  ] }];

  it("never offer restricted fields to the surveyor", () => {
    const fields = proposableFields(sections, (field) => Boolean(field.sensitive));
    assert.deepEqual(fields.map((row) => row.key), ["primaryAccess"]);
  });

  it("show only real changes, with labels", () => {
    const survey = normalizeSurvey({ ...base, proposedAnswers: { primaryAccess: "Gate on Oak St", other: "same" } });
    const rows = proposedChanges(survey, { primaryAccess: "Main St", other: "same" }, proposableFields(sections));
    assert.deepEqual(rows, [{ key: "primaryAccess", label: "Primary access", current: "Main St", proposed: "Gate on Oak St" }]);
  });

  it("drop unsafe keys and bad locations", () => {
    const survey = normalizeSurvey({
      ...base,
      proposedAnswers: { "a.b": "x", "c/d": "y", ok: "z" },
      observations: [{ note: "Gate chained", location: { lat: 0, lng: 0 } }, { note: "" }, { note: "Ladder", location: { lat: 32.3, lng: -90.18, accuracyMeters: 7.4 } }],
    });
    assert.deepEqual(Object.keys(survey.proposedAnswers), ["ok"]);
    assert.equal(survey.observations.length, 2);
    assert.equal(survey.observations[0].location, null);
    assert.equal(survey.observations[1].location.accuracyMeters, 7);
  });
});

describe("lists", () => {
  it("put returned and overdue surveys first", () => {
    const now = new Date(2026, 10, 26, 12);
    const rows = [
      normalizeSurvey({ ...base, id: "late", dueDate: "2026-11-01" }),
      normalizeSurvey({ ...base, id: "later", dueDate: "2027-01-01" }),
      normalizeSurvey({ ...base, id: "back", status: "returned", dueDate: "2027-02-01" }),
      normalizeSurvey({ ...base, id: "done", status: "accepted", dueDate: "2026-01-01" }),
    ];
    assert.deepEqual(sortSurveys(rows, now).map((row) => row.id), ["back", "late", "later", "done"]);
    assert.equal(dueState(rows[0], now), "overdue");
    assert.equal(dueState(rows[3], now), "");
  });

  it("surveyor fields match the security rules' list", () => {
    assert.deepEqual([...SURVEYOR_FIELDS].sort(), [
      "assignedUserIds", "assignedUserNames", "notes", "observations", "photos", "proposedAnswers", "referrals", "results",
      "startedAt", "startedBy", "status", "submittedAt", "submittedBy", "submittedByName", "updatedAt", "version",
    ]);
  });
});
