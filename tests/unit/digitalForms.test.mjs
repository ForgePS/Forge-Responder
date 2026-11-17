// Digital Forms: definition cleaning, publish checks, answer validation and the
// Claude request (with a test double: nothing is sent to Anthropic).
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { TEMPLATE_FIELD_TYPES } from "../../src/lib/inspections/configDefaults.js";
import { findMissingRequiredFields, getChecklistInputKind } from "../../src/lib/inspections/checklistFields.js";

const require = createRequire(import.meta.url);
const schema = require("../../functions/lib/digitalForms/schema.js");
const extract = require("../../functions/lib/digitalForms/extract.js");
const { matchesSignature } = require("../../functions/lib/digitalForms/service.js");

const sample = {
  name: "  Equipment   Damage Report ",
  sections: [
    { title: "Report", fields: [
      { label: "Date of damage:", type: "date", required: true },
      { label: "Unit", type: "dropdown", required: true, options: ["E1", "E2", "E1", " ", { label: "L1" }] },
      { label: "Unit", type: "text" }, // duplicate label -> unique key
      { label: "Crew size", type: "integer" },
      { label: "", type: "short_text" }, // no label -> dropped
      { label: "Read the policy first", type: "instruction", required: true },
    ] },
    { title: "", fields: [
      { label: "Out of service", type: "yes_no", required: true },
      { label: "Damaged items", type: "checkboxes", options: ["Hose", "Ladder"] },
      { label: "Officer signature", type: "signature", required: true },
      { label: "Notes", type: "paragraph" },
      { label: "Tick if photos taken", type: "boolean" },
    ] },
  ],
};

describe("digital forms: definition", () => {
  const def = schema.normalizeDefinition(sample);
  const fields = def.sections.flatMap((s) => s.fields);
  const byLabel = (label) => fields.find((f) => f.label === label);

  it("only uses field types the existing checklist renderer knows", () => {
    const known = new Set(TEMPLATE_FIELD_TYPES.map((t) => t.id));
    for (const type of schema.FIELD_TYPES) assert.ok(known.has(type), `${type} is not an inspection template type`);
    for (const type of schema.FIELD_TYPES) assert.notEqual(getChecklistInputKind(type), "photo");
  });

  it("cleans names, types, options and keys", () => {
    assert.equal(def.name, "Equipment Damage Report");
    assert.equal(byLabel("Date of damage:").type, "date");
    assert.equal(byLabel("Crew size").type, "number");
    assert.equal(byLabel("Damaged items").type, "multi_select");
    assert.equal(byLabel("Notes").type, "long_text");
    assert.equal(byLabel("Tick if photos taken").type, "checkbox");
    assert.deepEqual(fields.find((f) => f.type === "dropdown").options, ["E1", "E2", "L1"]);
    assert.equal(def.sections[1].title, "Section 2");
    const keys = fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, "keys are unique");
    assert.ok(keys.includes("unit") && keys.includes("unit_2"));
    for (const key of keys) assert.match(key, /^[A-Za-z][A-Za-z0-9_]*$/);
  });

  it("drops unlabeled fields and never requires display text", () => {
    assert.equal(fields.length, 10);
    assert.equal(byLabel("Read the policy first").required, false);
  });

  it("keeps edited keys stable across saves", () => {
    const again = schema.normalizeDefinition(def);
    assert.deepEqual(again, def);
  });

  it("caps sizes", () => {
    const huge = schema.normalizeDefinition({ name: "x".repeat(500), sections: Array.from({ length: 60 }, () => ({ fields: Array.from({ length: 200 }, (_, i) => ({ label: `F${i}` })) })) });
    assert.equal(huge.name.length, schema.LIMITS.nameChars);
    assert.ok(huge.sections.length <= schema.LIMITS.sections);
    assert.ok(huge.sections.flatMap((s) => s.fields).length <= schema.LIMITS.fields);
  });

  it("blocks publishing without a name, fields, or choices", () => {
    assert.deepEqual(schema.validateDefinition(def), []);
    assert.ok(schema.validateDefinition(schema.normalizeDefinition({})).length >= 2);
    const noChoices = schema.normalizeDefinition({ name: "X", sections: [{ fields: [{ label: "Pick", type: "dropdown", options: ["Only"] }] }] });
    assert.match(schema.validateDefinition(noChoices).join(" "), /two choices/);
  });

  it("matches the shape the app's required-field check reads", () => {
    const missing = findMissingRequiredFields(def, {});
    assert.deepEqual(missing.map((m) => m.label), ["Date of damage:", "Unit", "Out of service", "Officer signature"]);
  });
});

describe("digital forms: answers", () => {
  const def = schema.normalizeDefinition(sample);
  const key = (label) => def.sections.flatMap((s) => s.fields).find((f) => f.label === label).key;
  const good = {
    [key("Date of damage:")]: "2026-11-02",
    [key("Unit")]: "E2",
    [key("Crew size")]: "4",
    [key("Out of service")]: "No",
    [key("Damaged items")]: ["Hose"],
    [key("Officer signature")]: { name: "Capt. Example", signedAt: "1999-01-01T00:00:00Z" },
    [key("Tick if photos taken")]: true,
    stray: "dropped",
  };

  it("accepts valid answers, drops unknown keys and stamps signatures on the server", () => {
    const { answers, problems } = schema.cleanAnswers(def, good, { now: "2026-11-17T12:00:00.000Z" });
    assert.deepEqual(problems, []);
    assert.equal(answers.stray, undefined);
    assert.deepEqual(answers[key("Officer signature")], { name: "Capt. Example", signedAt: "2026-11-17T12:00:00.000Z" });
  });

  it("reports missing required fields", () => {
    const { problems } = schema.cleanAnswers(def, {});
    assert.equal(problems.length, 4);
  });

  it("rejects answers that don't fit the field", () => {
    const bad = (k, v) => schema.cleanAnswers(def, { ...good, [key(k)]: v }).problems;
    assert.equal(bad("Unit", "Not a unit").length, 1);
    assert.equal(bad("Date of damage:", "11/02/2026").length, 1);
    assert.equal(bad("Crew size", "four").length, 1);
    assert.equal(bad("Damaged items", ["Hose", "Axe"]).length, 1);
    assert.equal(bad("Tick if photos taken", "yes").length, 1);
    assert.equal(bad("Out of service", "Maybe").length, 1);
  });
});

describe("digital forms: file checks", () => {
  it("checks the file's first bytes against its type", () => {
    assert.ok(matchesSignature(Buffer.from("%PDF-1.7\n"), "application/pdf"));
    assert.ok(matchesSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "image/png"));
    assert.ok(matchesSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"));
    assert.ok(!matchesSignature(Buffer.from("<html>"), "application/pdf"));
    assert.ok(!matchesSignature(Buffer.from("%PDF-1.7"), "image/png"));
  });
});

describe("digital forms: Claude request", () => {
  function fakeClient(output, extra = {}) {
    const calls = [];
    return {
      calls,
      beta: { messages: { async create(params) {
        calls.push(params);
        return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(output) }], usage: { input_tokens: 10, output_tokens: 5 }, ...extra };
      } } },
    };
  }
  const output = { isForm: true, name: "Hose Test", description: "", sections: [{ title: "Test", fields: [{ label: "Hose ID", type: "short_text", required: true, options: [], helpText: "" }] }], warnings: ["Row 2 unreadable"] };

  it("sends a PDF as a document block with a JSON schema and returns a cleaned draft", async () => {
    const client = fakeClient(output);
    const result = await extract.extractForm(client, { buffer: Buffer.from("%PDF-1.7"), contentType: "application/pdf", fileName: "hose.pdf" });
    const params = client.calls[0];
    assert.equal(params.model, extract.MODEL);
    assert.equal(params.output_config.format.type, "json_schema");
    assert.equal(params.messages[0].content[0].type, "document");
    assert.equal(params.messages[0].content[0].source.media_type, "application/pdf");
    assert.equal(params.thinking, undefined, "no explicit thinking config on this model");
    assert.equal(result.definition.sections[0].fields[0].key, "hose_id");
    assert.deepEqual(result.warnings, ["Row 2 unreadable"]);
    assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5 });
  });

  it("sends a photo as an image block", async () => {
    const client = fakeClient(output);
    await extract.extractForm(client, { buffer: Buffer.from([0xff, 0xd8, 0xff]), contentType: "image/jpeg" });
    assert.equal(client.calls[0].messages[0].content[0].type, "image");
  });

  it("turns refusals, truncation and non-forms into clear errors", async () => {
    const file = { buffer: Buffer.from("%PDF-"), contentType: "application/pdf" };
    await assert.rejects(extract.extractForm(fakeClient(output, { stop_reason: "refusal" }), file), (e) => e.reason === "refusal");
    await assert.rejects(extract.extractForm(fakeClient(output, { stop_reason: "max_tokens" }), file), (e) => e.reason === "too-long");
    await assert.rejects(extract.extractForm(fakeClient({ ...output, isForm: false, sections: [] }), file), (e) => e.reason === "not-a-form");
    await assert.rejects(extract.extractForm(fakeClient({ ...output, sections: [] }), file), (e) => e.reason === "no-fields");
    await assert.rejects(extract.extractForm(fakeClient(output), { buffer: Buffer.from("x"), contentType: "image/gif" }), (e) => e.reason === "unsupported-type");
  });

  it("the emulator sample needs no API key and passes the publish checks", async () => {
    const result = await extract.extractForm(extract.sampleClient, { buffer: Buffer.from("%PDF-"), contentType: "application/pdf" });
    assert.deepEqual(schema.validateDefinition(result.definition), []);
  });
});
