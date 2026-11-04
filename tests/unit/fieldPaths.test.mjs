import test from "node:test";
import assert from "node:assert/strict";
import { isFieldAppPath, isFieldHost, rmsPathFromFieldPath } from "../../src/field/fieldPaths.js";

test("field.forgeresponder.com is the field app on every page", () => {
  assert.equal(isFieldHost("field.forgeresponder.com"), true);
  assert.equal(isFieldAppPath("/", "field.forgeresponder.com"), true);
  assert.equal(isFieldAppPath("/anything", "field.forgeresponder.com"), true);
  assert.equal(rmsPathFromFieldPath("/", "field.forgeresponder.com"), "https://app.forgeresponder.com/");
});

test("other addresses keep /field and /<department>/field", () => {
  assert.equal(isFieldHost("app.forgeresponder.com"), false);
  assert.equal(isFieldHost("fieldville.forgeresponder.com"), false);
  assert.equal(isFieldAppPath("/field", "app.forgeresponder.com"), true);
  assert.equal(isFieldAppPath("/camden/field", "app.forgeresponder.com"), true);
  assert.equal(isFieldAppPath("/", "app.forgeresponder.com"), false);
  assert.equal(rmsPathFromFieldPath("/camden/field", "app.forgeresponder.com"), "/camden");
  assert.equal(rmsPathFromFieldPath("/field", "app.forgeresponder.com"), "/");
});
