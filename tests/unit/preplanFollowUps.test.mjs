// Preplan follow-up questions (Knox box location / access instructions).
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPreplanFieldShown, withPreplanFollowUps } from "../../src/lib/inspections/preplanFollowUps.js";

const sections = [
  { id: "access", title: "Access", fields: [{ key: "primaryAccess" }, { key: "knoxBox" }, { key: "gatesCodes" }] },
  { id: "water", title: "Water", fields: [{ key: "nearestHydrants" }] },
];

describe("withPreplanFollowUps", () => {
  it("adds the Knox questions right after the Knox field", () => {
    const keys = withPreplanFollowUps(sections)[0].fields.map((field) => field.key);
    assert.deepEqual(keys, ["primaryAccess", "knoxBox", "knoxBoxLocation", "knoxBoxAccessNotes", "gatesCodes"]);
  });
  it("leaves other sections alone and doesn't duplicate fields the template already has", () => {
    const out = withPreplanFollowUps(sections);
    assert.equal(out[1], sections[1]);
    const custom = [{ id: "a", fields: [{ key: "knoxBox" }, { key: "knoxBoxLocation", label: "Where" }] }];
    assert.deepEqual(withPreplanFollowUps(custom)[0].fields.map((f) => f.key), ["knoxBox", "knoxBoxAccessNotes", "knoxBoxLocation"]);
  });
});

describe("isPreplanFieldShown", () => {
  const followUp = withPreplanFollowUps(sections)[0].fields[2];
  it("shows the Knox questions only when a box is on site", () => {
    assert.equal(isPreplanFieldShown(followUp, { knoxBox: "Present" }), true);
    assert.equal(isPreplanFieldShown(followUp, { knoxBox: "present " }), true);
    assert.equal(isPreplanFieldShown(followUp, { knoxBox: "Electronic Access" }), true);
    assert.equal(isPreplanFieldShown(followUp, { knoxBox: "Not Present" }), false);
    assert.equal(isPreplanFieldShown(followUp, {}), false);
  });
  it("keeps the older equals rule working", () => {
    assert.equal(isPreplanFieldShown({ showIf: { key: "a", equals: "Yes" } }, { a: "Yes" }), true);
    assert.equal(isPreplanFieldShown({ showIf: { key: "a", equals: "Yes" } }, { a: "No" }), false);
    assert.equal(isPreplanFieldShown({ key: "plain" }, {}), true);
  });
});
