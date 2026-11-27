// Pertinent negatives are offered only in the History and Assessment sections (pcrModel pertinentNegativeChoices).
import test from "node:test";
import assert from "node:assert/strict";
import { loadNemsisSchema } from "./helpers/nemsisSchema.mjs";
import { fieldInput, pertinentNegativeChoices } from "../../src/lib/nemsis/pcrModel.js";

const schema = loadNemsisSchema("3.5.1");

test("History and Assessment fields keep every pertinent negative", () => {
  for (const el of ["eHistory.06", "eExam.01"]) {
    const field = fieldInput(schema, el);
    assert.ok(field.pn.length, `${el} has pertinent negatives in NEMSIS`);
    assert.deepEqual(pertinentNegativeChoices(field), field.pn);
  }
});

test("other sections offer none", () => {
  for (const el of ["eMedications.03", "eProcedures.03", "eVitals.06", "ePatient.15", "eSituation.01", "eAirway.08"]) {
    const field = fieldInput(schema, el);
    assert.ok(field.pn.length, `${el} has pertinent negatives in NEMSIS`);
    assert.deepEqual(pertinentNegativeChoices(field), [], el);
    assert.ok(field.pn.length, "fieldInput keeps the full list for labelling saved values");
  }
});

test("a pertinent negative already saved elsewhere still shows so it can be cleared", () => {
  const field = fieldInput(schema, "eMedications.03");
  const saved = field.pn[0].code;
  assert.deepEqual(pertinentNegativeChoices(field, saved), [field.pn[0]]);
});

// The whole "Not documented…" picker (not-values too) is only offered in History and Assessment.
test("not-values (Not Applicable, Not Recorded) only in History and Assessment", async () => {
  const { notValueChoices } = await import("../../src/lib/nemsis/pcrModel.js");
  for (const el of ["eHistory.01", "eExam.01"]) {
    const field = fieldInput(schema, el);
    assert.ok(field.nv.length, `${el} allows not-values in NEMSIS`);
    assert.deepEqual(notValueChoices(field), field.nv);
  }
  for (const el of ["eResponse.04", "eResponse.08", "eMedications.03", "eVitals.06"]) {
    const field = fieldInput(schema, el);
    assert.ok(field.nv.length, `${el} allows not-values in NEMSIS`);
    assert.deepEqual(notValueChoices(field), [], el);
    const saved = field.nv[0].code;
    assert.deepEqual(notValueChoices(field, saved), [field.nv[0]], "a saved not-value still shows so it can be cleared");
  }
});
