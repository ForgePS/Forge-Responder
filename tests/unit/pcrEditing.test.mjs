// Desktop patient care report editing: hidden fields, edits typed during a save, the post gate on the merged chart.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { getValue, sectionLayout, setLeaf } from "../../src/lib/nemsis/pcrModel.js";
import { pcrMergePaths } from "../../src/field/fieldPcr.js";
import { countHidden, postIssues, rebaseEdits } from "../../src/lib/pcr/pcrEditing.js";
import { normalizePcrForm } from "../../src/lib/pcr/pcrForm.js";

const schema = loadNemsisSchema("3.5.1");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));
const VITALS = "eVitals.VitalGroup";

test("More fields counts optional fields inside essential groups", () => {
  const layout = sectionLayout(schema, "vitals");
  assert.equal(layout.filter((item) => !item.essential).length, 0, "the vitals section has only essential groups on top");
  assert.ok(countHidden(layout) > 0, "but diastolic BP, GCS total, temperature etc. sit inside them");
});

test("edits typed during a save stay, and other devices' sections aren't written back", () => {
  const paths = pcrMergePaths(schema);
  const sent = { id: "p1", nemsis: fixture.data };
  // While the save ran: this screen typed a narrative; the stored copy has a crew's new vital value.
  const current = { ...sent, nemsis: setLeaf(schema, fixture.data, "eNarrative.01", "Typed during save.") };
  const saved = { ...sent, updatedAt: "t2", nemsis: setLeaf(schema, fixture.data, "eVitals.10", 120, { [VITALS]: 0 }) };
  const next = rebaseEdits(sent, current, saved, paths);
  assert.equal(getValue(schema, next.nemsis, "eNarrative.01"), "Typed during save.");
  assert.equal(getValue(schema, next.nemsis, "eVitals.10", { [VITALS]: 0 }), 120, "the crew's vital is kept");
  assert.equal(next.updatedAt, "t2");
});

test("the post gate checks the merged chart, including an unconfirmed AI narrative", () => {
  const form = normalizePcrForm({});
  const before = postIssues(schema, form, fixture.data).blocking;
  const cleared = setLeaf(schema, fixture.data, "eTimes.03", "");
  const after = postIssues(schema, form, cleared).blocking;
  assert.ok(after.length > before.length, "another device cleared a required field");
  assert.ok(!before.some((i) => i.code === "ai-review"));
  const ai = postIssues(schema, form, fixture.data, { generated: true, reviewedAt: "" });
  assert.ok(ai.blocking.some((i) => i.code === "ai-review"));
});
