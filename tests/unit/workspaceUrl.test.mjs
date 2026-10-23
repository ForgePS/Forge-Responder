// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workspaceUrl } from "../../src/lib/workspaceUrl.js";
import { PLATFORM_SCOPE_ID } from "../../src/lib/tenantPaths.js";

const at = (href) => {
  const url = new URL(href);
  return { origin: url.origin, hostname: url.hostname, search: url.search };
};

describe("workspace switcher addresses", () => {
  it("switches by path on the platform address, keeping the open page", () => {
    assert.equal(workspaceUrl("camden", at("https://app.forgeresponder.com/horn-lake-fd?page=personnel")), "https://app.forgeresponder.com/camden?page=personnel");
    assert.equal(workspaceUrl(PLATFORM_SCOPE_ID, at("https://app.forgeresponder.com/camden?page=personnel")), "https://app.forgeresponder.com/creator-console?scope=platform");
  });

  it("switches by path on web.app and preview addresses", () => {
    assert.equal(workspaceUrl("01002", at("https://rms-dashboard-7562e.web.app/horn-lake-fd")), "https://rms-dashboard-7562e.web.app/01002");
  });

  it("leaves a department's own subdomain for the platform address", () => {
    assert.equal(workspaceUrl("camden", at("https://horn-lake-fd.forgeresponder.com/?page=fleet-dashboard")), "https://app.forgeresponder.com/camden?page=fleet-dashboard");
    assert.equal(workspaceUrl(PLATFORM_SCOPE_ID, at("https://horn-lake-fd.forgeresponder.com/")), "https://app.forgeresponder.com/creator-console?scope=platform");
  });
});
