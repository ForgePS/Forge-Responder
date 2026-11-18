import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRmsGateway } from "../../src/lib/gatewayDisplay.js";

const ROOT = "forgeresponder.com";

test("a wildcard gateway reads as the department subdomain", () => {
  assert.deepEqual(describeRmsGateway("*.forgeresponder.com", ROOT), {
    label: "{departmentId}.forgeresponder.com",
    href: "https://app.forgeresponder.com",
  });
  assert.equal(describeRmsGateway("https://*.forgeresponder.com/", ROOT).label, "{departmentId}.forgeresponder.com");
});

test("an address on the root domain reads as the department subdomain", () => {
  assert.equal(describeRmsGateway("https://app.forgeresponder.com", ROOT).label, "{departmentId}.forgeresponder.com");
  assert.equal(describeRmsGateway("forgeresponder.com", ROOT).label, "{departmentId}.forgeresponder.com");
});

test("any other host uses a department path", () => {
  assert.deepEqual(describeRmsGateway("https://rms.example.com/", ROOT), {
    label: "rms.example.com/{departmentId}",
    href: "https://rms.example.com",
  });
});

test("an empty gateway shows nothing", () => {
  assert.equal(describeRmsGateway("", ROOT), null);
  assert.equal(describeRmsGateway("   ", ROOT), null);
});
