// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPlatformDomainHost,
  isTenantDomainHost,
  parseTenantSubdomain,
  platformOrigin,
  tenantOrigin,
  useTenantSubdomains,
} from "../../src/lib/tenantDomains.js";

describe("department subdomains", () => {
  it("reads the department from <department>.forgeresponder.com", () => {
    assert.equal(parseTenantSubdomain("camden.forgeresponder.com"), "camden");
    assert.equal(parseTenantSubdomain("Horn-Lake-FD.ForgeResponder.com"), "horn-lake-fd");
    assert.equal(parseTenantSubdomain("01002.forgeresponder.com"), "01002");
  });

  it("ignores the platform host, reserved names, the root and deeper subdomains", () => {
    assert.equal(parseTenantSubdomain("app.forgeresponder.com"), null);
    assert.equal(parseTenantSubdomain("www.forgeresponder.com"), null);
    assert.equal(parseTenantSubdomain("admin.forgeresponder.com"), null);
    assert.equal(parseTenantSubdomain("forgeresponder.com"), null);
    assert.equal(parseTenantSubdomain("a.b.forgeresponder.com"), null);
  });

  it("ignores other hosts, including look-alikes", () => {
    assert.equal(parseTenantSubdomain("rms-dashboard-7562e.web.app"), null);
    assert.equal(parseTenantSubdomain("localhost"), null);
    assert.equal(parseTenantSubdomain("camden.forgeresponder.com.evil.com"), null);
    assert.equal(parseTenantSubdomain("camdenforgeresponder.com"), null);
    assert.equal(isTenantDomainHost("evilforgeresponder.com"), false);
  });

  it("knows the platform host", () => {
    assert.equal(isPlatformDomainHost("app.forgeresponder.com"), true);
    assert.equal(isPlatformDomainHost("forgeresponder.com"), true);
    assert.equal(isPlatformDomainHost("camden.forgeresponder.com"), false);
  });

  it("builds subdomain links only on forgeresponder.com hosts (until forced on)", () => {
    assert.equal(useTenantSubdomains("camden.forgeresponder.com"), true);
    assert.equal(useTenantSubdomains("app.forgeresponder.com"), true);
    assert.equal(useTenantSubdomains("rms-dashboard-7562e.web.app"), false);
    assert.equal(tenantOrigin("Camden"), "https://camden.forgeresponder.com");
    assert.equal(platformOrigin(), "https://app.forgeresponder.com");
  });
});
