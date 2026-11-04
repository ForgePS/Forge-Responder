// Reseed from CAD: newer CAD information without overwriting hand edits.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyCadImport, parseCadPayload } from "../../src/lib/neris/cadImport.js";
import { cadUpdates, findCadPayloadForReport, reseedFromCad, withCurrentOption, PRIORITY_OPTIONS } from "../../src/lib/neris/cadReseed.js";
import { buildDemoCadRuns } from "../../src/data/demoCadRuns.js";

const payloadOf = (run) => parseCadPayload(JSON.stringify(run)).payload;

describe("reseed from CAD", () => {
  const initial = buildDemoCadRuns({ stage: "initial" })[0];
  const latest = buildDemoCadRuns()[0];
  const imported = applyCadImport({ reportNumber: "R1", workspace: {} }, payloadOf(initial), { sourceType: "file-json" });

  it("keeps a snapshot on import and finds the CAD record again", () => {
    assert.ok(imported.cadSnapshot?.incidentNumber);
    assert.ok(findCadPayloadForReport(imported, buildDemoCadRuns()));
    assert.equal(findCadPayloadForReport({ workspace: { cad: { cadCallNumber: "nope" } } }, buildDemoCadRuns()), null);
  });

  it("offers what CAD added since the import", () => {
    const changes = cadUpdates(imported, payloadOf(latest));
    const keys = changes.map((change) => change.key);
    assert.ok(keys.includes("alarmLevel"), "alarm went to 2nd");
    assert.ok(keys.includes("clearTime"));
    assert.ok(changes.some((change) => change.kind === "unit"), "the late unit");
    assert.equal(cadUpdates(imported, payloadOf(initial)).length, 0, "nothing new");
  });

  it("never overwrites a hand edit, and stops offering once reseeded", () => {
    const edited = { ...imported, workspace: { ...imported.workspace, cad: { ...imported.workspace.cad, alarmLevel: "3" } } };
    assert.ok(!cadUpdates(edited, payloadOf(latest)).some((change) => change.key === "alarmLevel"));
    const reseeded = reseedFromCad(edited, payloadOf(latest));
    assert.equal(reseeded.workspace.cad.alarmLevel, "3");
    assert.ok(reseeded.workspace.cad.clearTime);
    assert.equal(reseeded.workspace.units.length, latest.units.length);
    assert.equal(cadUpdates(reseeded, payloadOf(latest)).length, 0);
  });

  it("without a snapshot only fills blanks", () => {
    const old = { workspace: { cad: { cadCallNumber: imported.workspace.cad.cadCallNumber, alarmLevel: "1", clearTime: "" }, units: [] } };
    const keys = cadUpdates(old, payloadOf(latest)).map((change) => change.key);
    assert.ok(keys.includes("clearTime"));
    assert.ok(!keys.includes("alarmLevel"));
  });

  it("keeps an unlisted CAD priority selectable", () => {
    assert.equal(withCurrentOption(PRIORITY_OPTIONS, "Priority 1")[0].value, "Priority 1");
    assert.equal(withCurrentOption(PRIORITY_OPTIONS, "Urgent"), PRIORITY_OPTIONS);
  });
});
