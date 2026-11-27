import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildIncidentLink,
  compareAddresses,
  incidentFrom,
  incidentKey,
  incidentLinkId,
  matchIncidentToPreplans,
  parseAddress,
} from "../../src/lib/preplans/incidentMatch.js";

const plan = (id, address, extra = {}) => ({ id, address, facilityName: id, publishedRevisionId: `R-${id}`, status: "operational", ...extra });

describe("addresses", () => {
  it("standardizes suffixes and directions and finds the suite", () => {
    assert.deepEqual(
      (({ number, street, suite }) => ({ number, street, suite }))(parseAddress("4710 Riverside Road, Suite 200, Springfield IL")),
      { number: "4710", street: "riverside rd", suite: "200" },
    );
    assert.equal(parseAddress("214 N. Main Street Apt 3B").suite, "3b");
    assert.equal(parseAddress("214 N Main St").key, "214 n main st");
    assert.equal(parseAddress("214 Main St 200").suite, "200", "Active911 joins the unit with a space");
    assert.equal(parseAddress("214 Main St #12").suite, "12");
    assert.equal(parseAddress("100 Oak St N").street, "oak st n");
    assert.equal(parseAddress("Hwy 51 & Main St").intersection, true);
    assert.equal(parseAddress("Hwy 51 & Main St").number, "");
  });

  it("compares whole house numbers, not substrings", () => {
    assert.equal(compareAddresses("214 Main St", "214 MAIN STREET"), "exact");
    assert.equal(compareAddresses("1214 Main St", "214 Main St"), "street");
    assert.equal(compareAddresses("214 Main", "214 Main St"), "partial");
    assert.equal(compareAddresses("214 Main St", "214 Oak St"), "");
  });
});

describe("matching", () => {
  const plans = [
    plan("diner", "214 Main St", { latitude: 38.0001, longitude: -90.0001 }),
    plan("school", "4710 Riverside Rd", { latitude: 38.01, longitude: -90.01 }),
    plan("mallA", "500 Commerce Dr", { suite: "100" }),
    plan("mallB", "500 Commerce Dr", { suite: "200" }),
    plan("draft", "77 Elm St", { publishedRevisionId: "" }),
    plan("gone", "4710 Riverside Rd", { status: "archived" }),
  ];

  it("an exact address is the match", () => {
    const result = matchIncidentToPreplans({ address: "214 Main Street", latitude: 38.0002, longitude: -90.0002 }, plans);
    assert.equal(result.status, "matched");
    assert.equal(result.match.preplan.id, "diner");
    assert.equal(matchIncidentToPreplans({ address: "4710 Riverside Road" }, plans).match.preplan.id, "school", "the archived one is ignored");
  });

  it("never presents a different number as the property", () => {
    const result = matchIncidentToPreplans({ address: "1214 Main St" }, plans);
    assert.equal(result.status, "none");
    assert.equal(result.candidates.length, 0);
  });

  it("nearby properties need confirmation and say they're different", () => {
    const result = matchIncidentToPreplans({ address: "220 Main St", latitude: 38.0003, longitude: -90.0003 }, plans);
    assert.equal(result.status, "confirm");
    assert.equal(result.candidates[0].method, "nearby");
    assert.equal(result.candidates[0].sameAddress, false);
    assert.match(result.message, /not the dispatched location/);
  });

  it("a shared address needs the suite or a choice", () => {
    assert.equal(matchIncidentToPreplans({ address: "500 Commerce Dr" }, plans).status, "confirm");
    const suite = matchIncidentToPreplans({ address: "500 Commerce Dr Ste 200" }, plans);
    assert.equal(suite.status, "matched");
    assert.equal(suite.match.preplan.id, "mallB");
    const other = matchIncidentToPreplans({ address: "500 Commerce Dr Suite 300" }, plans);
    assert.equal(other.status, "confirm", "suite 300 has no preplan of its own");
    assert.ok(other.candidates.every((row) => row.method === "other_suite"));
  });

  it("uses the occupancy's suite when the preplan has none", () => {
    const occupancies = [{ id: "o1", address: "9 Park Pl", unitId: "4" }, { id: "o2", address: "9 Park Pl", unitId: "5" }];
    const two = [plan("p4", "9 Park Pl", { occupancyId: "o1" }), plan("p5", "9 Park Pl", { occupancyId: "o2" })];
    assert.equal(matchIncidentToPreplans({ address: "9 Park Place Unit 5" }, two, { occupancies }).match.preplan.id, "p5");
  });

  it("an address far from the CAD location needs confirmation", () => {
    const result = matchIncidentToPreplans({ address: "214 Main St", latitude: 39.5, longitude: -91 }, plans);
    assert.equal(result.status, "confirm");
    assert.ok(result.candidates[0].farFromCad);
  });

  it("says when only an unapproved preplan exists, and doesn't offer it", () => {
    const result = matchIncidentToPreplans({ address: "77 Elm Street" }, plans);
    assert.equal(result.status, "none");
    assert.equal(result.unapproved[0].id, "draft");
    assert.equal(result.candidates.length, 0);
    assert.match(result.message, /isn't approved/);
  });

  it("a similar street name is a candidate, not a match", () => {
    const result = matchIncidentToPreplans({ address: "214 Main" }, plans);
    assert.equal(result.status, "confirm");
    assert.equal(result.candidates[0].method, "partial");
  });

  it("intersections and empty dispatches say why there's no match", () => {
    assert.match(matchIncidentToPreplans({ address: "Hwy 51 & Main St" }, plans).message, /intersection/i);
    assert.match(matchIncidentToPreplans({}, plans).message, /no address/);
  });
});

describe("links", () => {
  const incident = incidentFrom({ source: "active911", id: "A1", address: "214 Main St", description: "Gas leak", sentAt: "2026-11-26T12:00:00Z" });
  const preplan = plan("diner", "214 Main St", { preplanNumber: "PP-1" });

  it("record the approved version used", () => {
    const link = buildIncidentLink({ incident, preplan, revision: { id: "R-diner", revisionNumber: 3 }, method: "address", actor: { actorUid: "u1", actorName: "A" }, now: "2026-11-26T12:01:00Z" });
    assert.equal(link.incidentKey, "active911:A1");
    assert.equal(link.revisionId, "R-diner");
    assert.equal(link.revisionNumber, 3);
    assert.equal(link.preplanName, "diner");
    assert.equal(incidentLinkId(link), "PIL-active911_A1__diner");
    assert.equal(incidentKey({ source: "cad", incidentNumber: "26-4187" }), "cad:26-4187");
  });

  it("refuse a draft or another preplan's version; accept an earlier approved one", () => {
    assert.throws(() => buildIncidentLink({ incident, preplan, revision: { id: "R-new", status: "draft" }, method: "address" }), /approved version/);
    assert.throws(() => buildIncidentLink({ incident, preplan, revision: { id: "R-x", status: "published", preplanId: "other" }, method: "address" }), /approved version/);
    const earlier = buildIncidentLink({ incident, preplan, revision: { id: "R-old", status: "superseded", preplanId: "diner", revisionNumber: 2 }, method: "address" });
    assert.equal(earlier.revisionId, "R-old");
  });
});
