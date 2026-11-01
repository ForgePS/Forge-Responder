import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findMissingRequiredFields,
  formatMissingFieldsMessage,
  getChecklistFieldOptions,
  getChecklistInputKind,
  isChecklistAnswerFilled,
} from "../../src/lib/inspections/checklistFields.js";
import {
  describeNumberingFormat,
  nextInspectionNumber,
  parseInspectionSequence,
  resolveNumberingFormat,
} from "../../src/lib/inspections/inspectionNumbering.js";
import {
  formatCitationLabel,
  normalizePendingCitation,
} from "../../src/lib/codeLibrary/pendingCitation.js";

test("every template field type gets its own input kind", () => {
  assert.equal(getChecklistInputKind("photo"), "photo");
  assert.equal(getChecklistInputKind("date"), "date");
  assert.equal(getChecklistInputKind("number"), "number");
  assert.equal(getChecklistInputKind("signature"), "signature");
  assert.equal(getChecklistInputKind("code_citation"), "code_citation");
  assert.equal(getChecklistInputKind("single_select"), "select");
  assert.equal(getChecklistInputKind("dropdown"), "select");
  assert.equal(getChecklistInputKind("multi_select"), "multi_select");
  assert.equal(getChecklistInputKind("pass_fail_na"), "choice");
  assert.equal(getChecklistInputKind("heading"), "display");
  assert.equal(getChecklistInputKind(undefined), "text");
});

test("select options come from the field; fixed choices for pass/fail", () => {
  assert.deepEqual(getChecklistFieldOptions({ type: "pass_fail" }), ["Pass", "Fail"]);
  assert.deepEqual(getChecklistFieldOptions({ type: "dropdown", options: ["A", " ", { label: "B" }] }), ["A", "B"]);
  assert.deepEqual(getChecklistFieldOptions({ type: "single_select" }), []);
});

test("answers count as filled only when real", () => {
  assert.equal(isChecklistAnswerFilled({ type: "pass_fail" }, ""), false);
  assert.equal(isChecklistAnswerFilled({ type: "pass_fail" }, "Pass"), true);
  assert.equal(isChecklistAnswerFilled({ type: "photo" }, []), false);
  assert.equal(isChecklistAnswerFilled({ type: "photo" }, [{ id: "a" }]), true);
  assert.equal(isChecklistAnswerFilled({ type: "number" }, "0"), true);
  assert.equal(isChecklistAnswerFilled({ type: "number" }, "abc"), false);
  assert.equal(isChecklistAnswerFilled({ type: "checkbox" }, false), false);
  assert.equal(isChecklistAnswerFilled({ type: "signature" }, { name: "Pat" }), false);
  assert.equal(isChecklistAnswerFilled({ type: "signature" }, { name: "Pat", signedAt: "2026-11-01T00:00:00Z" }), true);
});

test("missing required fields are listed in order with section names", () => {
  const snapshot = {
    sections: [
      { title: "General", fields: [
        { key: "intro", type: "heading", label: "Intro", required: true },
        { key: "overall", type: "pass_fail", label: "Overall result", required: true },
        { key: "notes", type: "long_text", label: "Notes", required: false },
      ] },
      { title: "Evidence", fields: [{ key: "photos", type: "photo", label: "Photos", required: true }] },
    ],
  };
  const missing = findMissingRequiredFields(snapshot, { overall: "", photos: [] });
  assert.deepEqual(missing.map((m) => m.key), ["overall", "photos"]);
  assert.match(formatMissingFieldsMessage(missing), /Overall result \(General\), Photos \(Evidence\)/);
  assert.deepEqual(findMissingRequiredFields(snapshot, { overall: "Pass", photos: [{ id: "x" }] }), []);
  assert.equal(formatMissingFieldsMessage([]), "");
});

test("inspection numbers use the highest sequence, not the record count", () => {
  const format = { prefix: "INS", separator: "-", padding: 4, year: 2026 };
  assert.equal(nextInspectionNumber(format, []), "INS-2026-0001");
  // Records 0002 and 0003 deleted: count+1 would give 0002 again; we give 0005.
  assert.equal(nextInspectionNumber(format, ["INS-2026-0001", "INS-2026-0004", "INS-2025-0099"]), "INS-2026-0005");
  assert.equal(parseInspectionSequence("INS-2026-0042", format), 42);
  assert.equal(parseInspectionSequence("FIRE-2026-0042", format), 0);
  // A just-taken candidate is skipped.
  assert.equal(nextInspectionNumber(format, ["INS-2026-0001", "INS-2026-0002"]), "INS-2026-0003");
});

test("numbering format respects department settings", () => {
  const settings = { numbering: { prefix: "FP", separator: "/", sequencePadding: 5 } };
  const format = resolveNumberingFormat(settings, new Date(2026, 5, 1));
  assert.equal(nextInspectionNumber(format, ["FP/2026/00009"]), "FP/2026/00010");
  assert.equal(describeNumberingFormat(settings, new Date(2026, 0, 1)), "FP/2026/00001");
});

test("pending code citation is normalized and labelled", () => {
  assert.equal(normalizePendingCitation({ sectionTitle: "No number" }), null);
  const citation = normalizePendingCitation({ sectionNumber: "1010.1", sectionTitle: "Doors", citedText: "x".repeat(5000) });
  assert.equal(citation.citedText.length, 4000);
  assert.equal(formatCitationLabel(citation), "1010.1 Doors");
});
