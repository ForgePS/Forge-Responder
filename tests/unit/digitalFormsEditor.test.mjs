// Digital Forms review editor helpers and nav access. Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIGITAL_FORM_FIELD_TYPES, LINK_TYPE_OPTIONS, NEGATIVE_ANSWERS, detailsToSubmit, draftEdits, missingRemarks, parseOptions, reviewProblems,
} from "../../src/lib/digitalForms/formDraft.js";
import { canAccessNavItem } from "../../src/lib/permissions.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const schema = require("../../functions/lib/digitalForms/schema.js");

const draft = () => ({
  name: "Form",
  description: "",
  sections: [
    { id: "s1", title: "One", fields: [{ id: "a", key: "a", type: "short_text", label: "A", required: true, options: [] }, { id: "b", key: "b", type: "dropdown", label: "B", options: ["x", "y"] }] },
    { id: "s2", title: "Two", fields: [{ id: "c", key: "c", type: "date", label: "C", options: [] }] },
  ],
});

describe("digital forms review editor", () => {
  it("offers exactly the field types the server accepts", () => {
    assert.deepEqual(DIGITAL_FORM_FIELD_TYPES.map((t) => t.id).sort(), [...schema.FIELD_TYPES].sort());
  });

  it("edits without mutating the original", () => {
    const original = draft();
    const next = draftEdits.setField(original, 0, 0, { label: "Changed" });
    assert.equal(original.sections[0].fields[0].label, "A");
    assert.equal(next.sections[0].fields[0].label, "Changed");
  });

  it("clears choices and required when the type no longer uses them", () => {
    const next = draftEdits.setField(draft(), 0, 1, { type: "short_text" });
    assert.deepEqual(next.sections[0].fields[1].options, []);
    const heading = draftEdits.setField(draft(), 0, 0, { type: "heading" });
    assert.equal(heading.sections[0].fields[0].required, false);
  });

  it("moves fields within and across sections", () => {
    const within = draftEdits.moveField(draft(), 0, 0, 1);
    assert.deepEqual(within.sections[0].fields.map((f) => f.id), ["b", "a"]);
    const across = draftEdits.moveField(draft(), 0, 1, 1);
    assert.deepEqual(across.sections[1].fields.map((f) => f.id), ["b", "c"]);
    const back = draftEdits.moveField(draft(), 1, 0, -1);
    assert.deepEqual(back.sections[0].fields.map((f) => f.id), ["a", "b", "c"]);
    const edge = draft();
    assert.equal(draftEdits.moveField(edge, 0, 0, -1), edge);
  });

  it("adds and removes sections and fields", () => {
    let d = draftEdits.addSection(draft());
    assert.equal(d.sections.length, 3);
    d = draftEdits.addField(d, 2, "number");
    assert.equal(d.sections[2].fields.at(-1).type, "number");
    d = draftEdits.removeSection(d, 0);
    assert.equal(d.sections[0].id, "s2");
  });

  it("parses one choice per line, dropping blanks and repeats", () => {
    assert.deepEqual(parseOptions("Engine 1\n\n engine 1 \nLadder 1\r\nMedic 1"), ["Engine 1", "Ladder 1", "Medic 1"]);
  });

  it("flags the same publish problems as the server", () => {
    assert.deepEqual(reviewProblems(draft()), []);
    const d = draftEdits.setField(draft(), 0, 1, { options: ["only"] });
    assert.match(reviewProblems(d).join(" "), /two choices/);
    assert.match(schema.validateDefinition(schema.normalizeDefinition(d)).join(" "), /two choices/);
  });
});

describe("digital forms nav access", () => {
  it("fillers, managers and reviewers can open Digital Forms; others can't", () => {
    assert.ok(canAccessNavItem("Digital Forms", { fillDigitalForms: true }));
    assert.ok(canAccessNavItem("Digital Forms", { manageDigitalForms: true }));
    assert.ok(canAccessNavItem("Digital Forms", { viewDigitalFormSubmissions: true }));
    assert.ok(!canAccessNavItem("Digital Forms", { viewDocuments: true }));
  });
});

describe("digital forms remarks and links (browser side)", () => {
  const def = {
    sections: [{ fields: [
      { key: "lights", type: "yes_no", label: "Lights" },
      { key: "pump", type: "pass_fail", label: "Pump" },
      { key: "notes", type: "long_text", label: "Notes" },
    ] }],
  };

  it("uses the same link types and No/Fail answers as the server", () => {
    assert.deepEqual(LINK_TYPE_OPTIONS.map((o) => o.id).filter(Boolean), schema.LINK_TYPES);
    assert.deepEqual(NEGATIVE_ANSWERS, schema.NEGATIVE_ANSWERS);
  });

  it("asks for remarks only on No/Fail answers without them", () => {
    const answers = { lights: "No", pump: "Pass", notes: "No" };
    assert.deepEqual(missingRemarks(def, answers, {}).map((m) => m.key), ["lights"]);
    assert.deepEqual(missingRemarks(def, answers, { lights: { remarks: "Out" } }), []);
  });

  it("sends remarks and photo paths only for fields still answered No/Fail", () => {
    const answers = { lights: "Yes", pump: "Fail" };
    const details = {
      lights: { remarks: "stale" },
      pump: { remarks: "Low", photos: [{ path: "formSubmissionPhotos/d/u/aaaaaaaa.jpg", url: "https://x" }] },
    };
    assert.deepEqual(detailsToSubmit(def, answers, details), {
      pump: { remarks: "Low", photos: ["formSubmissionPhotos/d/u/aaaaaaaa.jpg"] },
    });
  });
});
