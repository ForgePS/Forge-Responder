// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREPLAN_SENSITIVE_KEYS,
  buildPreplanNarrative,
  buildPreplanRestrictedRecord,
  changedAnswersForSave,
  hasRestrictedValues,
  isPreplanFieldSensitive,
  mergePreplanAnswers,
  mergeRestrictedIntoRevision,
  preplanSensitiveKeys,
  presentPreplanRevision,
  splitPreplanAnswers,
  syncPreplanNarrative,
  textContainsRestricted,
} from "../../src/lib/inspections/preplanRestricted.js";
import { STARTER_PREPLAN_TEMPLATE_SECTIONS } from "../../src/lib/inspections/preplanDefaults.js";

const starter = { sections: STARTER_PREPLAN_TEMPLATE_SECTIONS };

const answers = {
  primaryAccess: "Main lot off Elm",
  gatesCodes: "#4411",
  gas: "Meter east wall",
  electric: "Panel room B",
  water: "Riser room",
  hvac: "Roof",
  hazmat: "Chlorine 500 gal",
  occupancyNotes: "Day care",
  dispatchSummary: "Two-story school",
};

describe("preplan restricted keys", () => {
  it("default list covers every field the starter template marks sensitive", () => {
    const flagged = STARTER_PREPLAN_TEMPLATE_SECTIONS.flatMap((s) => s.fields).filter((f) => f.sensitive).map((f) => f.key);
    assert.deepEqual([...flagged].sort(), [...DEFAULT_PREPLAN_SENSITIVE_KEYS].sort());
  });

  it("adds custom template fields marked sensitive", () => {
    const custom = { sections: [{ fields: [{ key: "alarmCode", sensitive: true }, { key: "notes" }] }] };
    const keys = preplanSensitiveKeys(custom);
    assert.ok(keys.has("alarmCode"));
    assert.ok(keys.has("gatesCodes"));
    assert.ok(!keys.has("notes"));
  });

  it("default keys stay restricted even if a template doesn't flag them", () => {
    assert.equal(isPreplanFieldSensitive({ key: "gas" }), true);
    assert.equal(isPreplanFieldSensitive({ key: "other", sensitive: true }), true);
    assert.equal(isPreplanFieldSensitive({ key: "water" }), false);
  });
});

describe("split / merge", () => {
  it("splits restricted answers out and merges them back", () => {
    const keys = preplanSensitiveKeys(starter);
    const { publicAnswers, restrictedAnswers } = splitPreplanAnswers(answers, keys);
    assert.deepEqual(Object.keys(restrictedAnswers).sort(), ["electric", "gas", "gatesCodes", "hazmat"]);
    for (const key of DEFAULT_PREPLAN_SENSITIVE_KEYS) assert.equal(key in publicAnswers, false);
    assert.deepEqual(mergePreplanAnswers(publicAnswers, restrictedAnswers), answers);
  });

  it("hasRestrictedValues ignores blanks", () => {
    assert.equal(hasRestrictedValues({ gas: "", hazmat: "  " }), false);
    assert.equal(hasRestrictedValues({ gas: "x" }), true);
  });
});

describe("narratives", () => {
  it("built narrative leaves restricted answers out", () => {
    const narrative = buildPreplanNarrative(answers, preplanSensitiveKeys());
    assert.equal(narrative.utilities, "Riser room\nRoof");
    assert.equal(narrative.hazards, "Day care");
    assert.equal(narrative.dispatchSummary, "Two-story school");
    assert.ok(!Object.values(narrative).some((text) => text.includes("Chlorine") || text.includes("Meter")));
  });

  it("sync rebuilds stored text that contains a restricted value, keeps typed text otherwise", () => {
    const keys = preplanSensitiveKeys();
    const { publicAnswers, restrictedAnswers } = splitPreplanAnswers(answers, keys);
    const synced = syncPreplanNarrative({
      sectionAnswers: publicAnswers,
      utilities: "Meter east wall\nPanel room B\nRiser room\nRoof",
      tacticalPlan: "Defensive if roof involved",
    }, keys, restrictedAnswers);
    assert.equal(synced.utilities, "Riser room\nRoof");
    assert.equal(synced.tacticalPlan, "Defensive if roof involved");
    assert.equal(textContainsRestricted(JSON.stringify(synced), restrictedAnswers), false);
  });

  it("merge for allowed viewers restores derived narrative, leaves typed narrative", () => {
    const keys = preplanSensitiveKeys();
    const { publicAnswers, restrictedAnswers } = splitPreplanAnswers(answers, keys);
    const stored = syncPreplanNarrative({ sectionAnswers: publicAnswers, accessPlan: "Typed access plan" }, keys, restrictedAnswers);
    const shown = mergeRestrictedIntoRevision(stored, restrictedAnswers, keys);
    assert.equal(shown.utilities, "Meter east wall\nPanel room B\nRiser room\nRoof");
    assert.equal(shown.hazards, "Chlorine 500 gal\nDay care");
    assert.equal(shown.accessPlan, "Typed access plan");
    assert.equal(shown.sectionAnswers.gatesCodes, "#4411");
  });
});

describe("presentPreplanRevision", () => {
  const legacy = {
    templateSnapshot: starter,
    sectionAnswers: answers,
    utilities: "Meter east wall\nPanel room B\nRiser room\nRoof",
    hazards: "Chlorine 500 gal\nDay care",
  };

  it("viewers without access never get restricted values, even from inline (pre-move) data", () => {
    const shown = presentPreplanRevision(legacy, { allowed: false });
    assert.equal(shown.restrictedLoaded, false);
    const text = JSON.stringify(shown);
    for (const value of ["#4411", "Meter east wall", "Panel room B", "Chlorine"]) assert.equal(text.includes(value), false);
    assert.equal(shown.utilities, "Riser room\nRoof");
  });

  it("allowed viewers fall back to inline values before the move", () => {
    const shown = presentPreplanRevision(legacy, { allowed: true, restrictedAnswers: {} });
    assert.equal(shown.restrictedLoaded, true);
    assert.equal(shown.sectionAnswers.gas, "Meter east wall");
    assert.equal(shown.utilities, "Meter east wall\nPanel room B\nRiser room\nRoof");
  });

  it("restricted doc wins over inline values", () => {
    const shown = presentPreplanRevision(legacy, { allowed: true, restrictedAnswers: { gas: "Moved meter" } });
    assert.equal(shown.sectionAnswers.gas, "Moved meter");
    assert.equal(shown.sectionAnswers.electric, "Panel room B");
  });

  it("an unreadable restricted doc is reported as not loaded", () => {
    const shown = presentPreplanRevision({ sectionAnswers: { water: "x" } }, { allowed: true, restrictedAnswers: null });
    assert.equal(shown.restrictedLoaded, false);
  });
});

describe("save helpers", () => {
  it("only changed restricted answers are sent", () => {
    const keys = preplanSensitiveKeys();
    const out = changedAnswersForSave(
      { water: "Riser", gas: "", electric: "New panel", hazmat: "Same" },
      { water: "Riser", hazmat: "Same" },
      keys,
    );
    assert.deepEqual(out, { water: "Riser", electric: "New panel" });
  });

  it("builds the restricted record shape", () => {
    const rec = buildPreplanRestrictedRecord({
      preplanId: "PP-1", revisionId: "PPR-1", answers: { gas: null, hazmat: "x" }, updatedBy: "u1", updatedAt: "2026-01-01",
    });
    assert.deepEqual(rec, {
      preplanId: "PP-1", revisionId: "PPR-1", answers: { gas: "", hazmat: "x" }, updatedAt: "2026-01-01", updatedBy: "u1",
    });
  });
});
