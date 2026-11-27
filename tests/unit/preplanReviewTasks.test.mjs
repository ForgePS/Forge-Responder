import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DEFAULT_REVIEW_RULES as CLIENT_DEFAULTS, normalizeReviewRules, parseRuleList } from "../../src/lib/preplans/reviewRulesModel.js";

const require = createRequire(import.meta.url);
const {
  DEFAULT_REVIEW_RULES: SERVER_DEFAULTS,
  normalizeRules,
  occupancyChanges,
  taskId,
  violationReviewReason,
} = require("../../functions/lib/preplanReviewTasks.js");

const occupancy = {
  name: "Main Street Diner", address: "214 Main St", city: "Riverside", latitude: 39.1234567, longitude: -94.7654321,
  occupancyType: "Assembly", hazard: "Moderate", sprinkler: "Yes", alarm: "Yes", knoxBox: "Front door",
  contacts: [{ name: "Pat Owner", role: "Owner", phone: "555-0100" }],
  timeline: [], notes: "", lastInspectionAt: "2026-10-01", inspector: "Marshal G. Inspector", updatedAt: "2026-11-01",
};

describe("occupancy changes that need a preplan review", () => {
  it("ignores bookkeeping: timeline, notes, inspection dates, inspector, updatedAt", () => {
    const after = { ...occupancy, timeline: [{ id: "t1" }], notes: "Called owner", lastInspectionAt: "2026-11-25", inspector: "Someone", updatedAt: "2026-11-25" };
    assert.deepEqual(occupancyChanges(occupancy, after), []);
  });

  it("reports the fields a preplan depends on", () => {
    const after = { ...occupancy, address: "216 Main St", sprinkler: "No", occupancyType: "Mercantile" };
    assert.deepEqual(occupancyChanges(occupancy, after), ["Address", "Occupancy classification", "Sprinkler system"]);
  });

  it("treats a re-saved geocode as no move, but a real move as one", () => {
    assert.deepEqual(occupancyChanges(occupancy, { ...occupancy, latitude: 39.12345671 }), []);
    assert.deepEqual(occupancyChanges(occupancy, { ...occupancy, latitude: 39.1244 }), ["Map location"]);
    // The occupancy form saves blank coordinates as 0; 0,0 is "no location", not a move.
    const unplaced = { ...occupancy, latitude: undefined, longitude: null };
    assert.deepEqual(occupancyChanges(unplaced, { ...unplaced, latitude: 0, longitude: 0 }), []);
    assert.deepEqual(occupancyChanges(unplaced, { ...unplaced, latitude: "", longitude: "" }), []);
  });

  it("notices contact changes regardless of order, and ignores case and spacing", () => {
    const reordered = { ...occupancy, contacts: [{ phone: "555-0100", role: "Owner", name: "Pat Owner" }] };
    assert.deepEqual(occupancyChanges(occupancy, reordered), []);
    assert.deepEqual(occupancyChanges(occupancy, { ...occupancy, name: " main street diner " }), []);
    assert.deepEqual(occupancyChanges(occupancy, { ...occupancy, contacts: [{ name: "Pat Owner", phone: "555-0199" }] }), ["Emergency contacts"]);
  });
});

describe("inspection findings that need a preplan review", () => {
  const rules = normalizeRules(null);

  it("matches fire protection, egress, access and hazmat chapters", () => {
    assert.match(violationReviewReason({ codeCitation: "IFC 904.12.5.2" }, rules), /chapter 9/);
    assert.match(violationReviewReason({ codeCitation: "IFC 1013.3" }, rules), /chapter 10/);
    assert.match(violationReviewReason({ codeCitation: "506.1" }, rules), /chapter 5/);
    assert.match(violationReviewReason({ codeCitation: "IFC 5003.1" }, rules), /chapter 50/);
  });

  it("doesn't match on partial chapters or routine findings", () => {
    // 104 is chapter 1 (administration), not chapter 10.
    assert.equal(violationReviewReason({ codeCitation: "IFC 104.1", name: "Permit not posted" }, rules), "");
    assert.equal(violationReviewReason({ codeCitation: "IFC 315.3", name: "Storage too close to ceiling" }, rules), "");
  });

  it("matches on words when the citation doesn't", () => {
    assert.match(violationReviewReason({ codeCitation: "LOCAL 12", name: "Knox box key missing" }, rules), /knox/);
  });

  it("applies the department's minimum severity and its own lists", () => {
    const strict = normalizeRules({ minSeverity: "major" });
    assert.equal(violationReviewReason({ codeCitation: "906.1", severity: "moderate" }, strict), "");
    assert.match(violationReviewReason({ codeCitation: "906.1", severity: "high" }, strict), /chapter 9/);
    const custom = normalizeRules({ citationPrefixes: [], keywords: ["generator"] });
    assert.equal(violationReviewReason({ codeCitation: "906.1" }, custom), "");
    assert.match(violationReviewReason({ name: "Generator room blocked" }, custom), /generator/);
  });
});

describe("rules and ids", () => {
  it("browser and server agree on the standard rules", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(CLIENT_DEFAULTS)), JSON.parse(JSON.stringify(SERVER_DEFAULTS)));
    assert.deepEqual(normalizeReviewRules(null), normalizeRules(null));
  });

  it("parses typed lists and keeps settings switched off", () => {
    assert.deepEqual(parseRuleList("9, 10\n Sprinkler ,9,,"), ["9", "10", "sprinkler"]);
    assert.equal(normalizeRules({ occupancyChanges: false }).occupancyChanges, false);
    assert.equal(normalizeReviewRules({ violationFindings: false }).violationFindings, false);
  });

  it("task ids are deterministic and safe as Firestore ids", () => {
    const id = taskId("occupancy", "OCC/102", "PP-DEMO-6", "abc123");
    assert.equal(id, taskId("occupancy", "OCC/102", "PP-DEMO-6", "abc123"));
    assert.equal(id.includes("/"), false);
  });
});
