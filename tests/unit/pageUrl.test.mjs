// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPageIndex,
  depthFromHistoryState,
  pageFromLocation,
  pageHistoryState,
  pageSlug,
  slugFromHistoryState,
  urlWithPage,
} from "../../src/lib/pageUrl.js";

describe("page addresses", () => {
  it("makes readable slugs from menu names", () => {
    assert.equal(pageSlug("Fleet Work Orders"), "fleet-work-orders");
    assert.equal(pageSlug("Fuel & Energy"), "fuel-and-energy");
    assert.equal(pageSlug("SOGs / Policies"), "sogs-policies");
    assert.equal(pageSlug("NERIS Fire Reports"), "neris-fire-reports");
    assert.equal(pageSlug("  Dashboard "), "dashboard");
  });

  it("finds the page named in the URL, ignoring unknown pages", () => {
    const index = buildPageIndex(["Dashboard", "Fleet Work Orders", "Fuel & Energy"]);
    assert.equal(pageFromLocation(index, { search: "?page=fleet-work-orders" }), "Fleet Work Orders");
    assert.equal(pageFromLocation(index, { search: "?page=FUEL-AND-ENERGY" }), "Fuel & Energy");
    assert.equal(pageFromLocation(index, { search: "?page=nope" }), null);
    assert.equal(pageFromLocation(index, { search: "" }), null);
  });

  it("sets or clears ?page while keeping the path, other settings and hash", () => {
    assert.equal(urlWithPage("https://camden.forgeresponder.com/?x=1#top", "personnel"), "/?x=1&page=personnel#top");
    assert.equal(urlWithPage("https://rms.web.app/camden?page=personnel", "fleet-tests"), "/camden?page=fleet-tests");
    assert.equal(urlWithPage("https://rms.web.app/camden?page=personnel&x=1", ""), "/camden?x=1");
  });

  it("tracks how many in-app pages deep an entry is", () => {
    assert.equal(depthFromHistoryState(pageHistoryState("personnel", 3)), 3);
    assert.equal(depthFromHistoryState(pageHistoryState("personnel")), 0);
    assert.equal(depthFromHistoryState({}), 0);
    assert.equal(depthFromHistoryState(null), 0);
  });

  it("recognises only history entries the app created", () => {
    assert.equal(slugFromHistoryState(pageHistoryState("personnel")), "personnel");
    assert.equal(slugFromHistoryState(pageHistoryState("")), "");
    assert.equal(slugFromHistoryState({}), null);
    assert.equal(slugFromHistoryState(null), null);
  });
});
