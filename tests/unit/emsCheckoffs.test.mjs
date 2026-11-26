// EMS check-offs (slice E3): EMS item answers, schedules and due dates, unit
// readiness rules (src/lib/ems/checkoffLogic.js), the server rules that repeat
// them (functions/lib/emsCheckoffs/logic.js), and the Fleet checklist engine's
// handling of the new item types (src/lib/fleet/checkProgress.js).
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as client from "../../src/lib/ems/checkoffLogic.js";
import { checkProblems, checkProgress, fieldAnswered } from "../../src/lib/fleet/checkProgress.js";
import { FLEET_CHECK_FIELD_TYPES } from "../../src/lib/fleet/checklistDefaults.js";

const require = createRequire(import.meta.url);
const server = require("../../functions/lib/emsCheckoffs/logic.js");

const equipmentField = { key: "eq", label: "Equipment", type: "ems_equipment", required: true };
const suppliesField = { key: "sup", label: "Supplies", type: "ems_supplies", required: true };

describe("client and server constants match", () => {
  it("item types, states, schedules, targets, severities and rule keys", () => {
    assert.deepEqual(client.EMS_ITEM_TYPES, server.EMS_ITEM_TYPES);
    assert.deepEqual(client.EQUIPMENT_STATES, server.EQUIPMENT_STATES);
    assert.deepEqual(client.FREQUENCY_KINDS, server.FREQUENCY_KINDS);
    assert.deepEqual(client.TARGET_TYPES, server.TARGET_TYPES);
    assert.deepEqual(client.SEVERITIES, server.SEVERITIES);
    assert.deepEqual(client.READINESS_RULES.map((r) => r.key), server.READINESS_RULE_KEYS);
    assert.deepEqual(Object.fromEntries(client.READINESS_RULES.map((r) => [r.key, r.defaultSeverity])), server.DEFAULT_SEVERITIES);
  });

  it("the checklist builder's type list includes every EMS item type", () => {
    const ids = FLEET_CHECK_FIELD_TYPES.map((t) => t.id);
    for (const type of [...client.EMS_ITEM_TYPES, "dropdown", "multi_select", "date", "signature"]) assert.ok(ids.includes(type), type);
  });
});

describe("EMS item answers", () => {
  it("equipment is answered only when every listed piece has an answer; none listed counts as answered", () => {
    const expected = [{ id: "A", name: "Monitor" }, { id: "B", name: "AED" }];
    assert.equal(client.emsItemAnswered(equipmentField, undefined), false);
    assert.equal(client.emsItemAnswered(equipmentField, { expected, rows: { A: { state: "present" } } }), false);
    assert.equal(client.emsItemAnswered(equipmentField, { expected, rows: { A: { state: "present" }, B: { state: "missing" } } }), true);
    assert.equal(client.emsItemAnswered(equipmentField, { expected: [], rows: {} }), true);
  });

  it("supplies need a whole count of zero or more for each listed supply", () => {
    const expected = [{ id: "L1__I1", name: "Gauze", parMin: 4 }];
    assert.equal(client.emsItemAnswered(suppliesField, { expected, rows: { L1__I1: { count: "" } } }), false);
    assert.equal(client.emsItemAnswered(suppliesField, { expected, rows: { L1__I1: { count: -1 } } }), false);
    assert.equal(client.emsItemAnswered(suppliesField, { expected, rows: { L1__I1: { count: 0 } } }), true);
  });

  it("reports missing and damaged equipment, short, empty and expired supplies", () => {
    const eq = client.emsItemProblems(equipmentField, {
      expected: [{ id: "A", name: "Monitor" }, { id: "B", name: "AED" }, { id: "C", name: "Suction" }],
      rows: { A: { state: "present" }, B: { state: "missing" }, C: { state: "damaged", outOfUse: true } },
    });
    assert.deepEqual(eq.map((p) => [p.id, p.problem]), [["B", "missing"], ["C", "damaged_out_of_use"]]);
    const sup = client.emsItemProblems(suppliesField, {
      expected: [{ id: "x", name: "Gauze", parMin: 4 }, { id: "y", name: "Tape", parMin: 2 }, { id: "z", name: "Gloves", parMin: null }],
      rows: { x: { count: 3 }, y: { count: 0, expiredFound: true }, z: { count: 0 } },
    });
    assert.deepEqual(sup.map((p) => [p.id, p.problem]), [["x", "short"], ["y", "out"], ["y", "expired"]]);
    assert.match(client.describeProblems(sup), /Gauze: below minimum \(3 of 4\)/);
  });

  it("the Fleet engine counts EMS items in progress and required checks", () => {
    const sections = [{ id: "s", fields: [equipmentField, { key: "lights", type: "pass_fail", required: true }] }];
    const answers = { eq: { expected: [{ id: "A" }], rows: {} }, lights: "Pass" };
    assert.deepEqual(checkProgress(sections, answers), { answered: 1, total: 2, percent: 50 });
    assert.deepEqual(checkProblems(sections, answers).missing.map((f) => f.key), ["eq"]);
    answers.eq.rows.A = { state: "present" };
    assert.equal(checkProblems(sections, answers).missing.length, 0);
  });

  it("multi-select answers count only when something is picked", () => {
    assert.equal(fieldAnswered({ type: "multi_select" }, []), false);
    assert.equal(fieldAnswered({ type: "multi_select" }, ["Full"]), true);
  });

  it("finds templates with EMS items", () => {
    assert.equal(client.templateHasEmsItems({ sections: [{ fields: [{ type: "pass_fail" }] }] }), false);
    assert.equal(client.templateHasEmsItems({ sections: [{ fields: [{ type: "ems_supplies" }] }] }), true);
  });
});

describe("server reading of answers", () => {
  it("keeps only equipment rows with a known state and a safe id; out of use only when damaged", () => {
    const rows = server.equipmentRows({ rows: {
      A: { state: "present", outOfUse: true },
      B: { state: "damaged", outOfUse: true, note: " cracked " },
      "bad/id": { state: "missing" },
      C: { state: "lost" },
    } });
    assert.deepEqual(rows, [
      { equipmentId: "A", state: "present", outOfUse: false, note: "" },
      { equipmentId: "B", state: "damaged", outOfUse: true, note: "cracked" },
    ]);
  });

  it("keeps only whole, non-negative supply counts", () => {
    const rows = server.supplyRows({ rows: { L1__I1: { count: 3 }, L1__I2: { count: 2.5 }, L1__I3: { count: "" }, L1__I4: { count: -1 }, L1__I5: { count: "0", expiredFound: true } } });
    assert.deepEqual(rows.map((r) => [r.balanceId, r.count, r.expiredFound]), [["L1__I1", 3, false], ["L1__I5", 0, true]]);
  });

  it("judges a count against the par minimum and the ledger", () => {
    assert.deepEqual(server.judgeSupply({ count: 2 }, { onHand: 5, par: { min: 4 } }),
      { short: true, out: false, shortBy: 2, parMin: 4, ledgerOnHand: 5, countDiffers: true });
    assert.equal(server.judgeSupply({ count: 0 }, { onHand: 0, par: { min: 4 } }).out, true);
    assert.equal(server.judgeSupply({ count: 0 }, { onHand: 0, par: { max: 10 } }).short, false);
  });

  it("finds EMS items in a template snapshot", () => {
    const items = server.emsItems({ sections: [{ fields: [{ key: "a", type: "pass_fail" }, { key: "b", type: "ems_equipment", label: "Gear" }] }] });
    assert.deepEqual(items, [{ key: "b", label: "Gear", type: "ems_equipment" }]);
  });

  it("checks schedules and readiness rules", () => {
    assert.deepEqual(server.cleanFrequency({ kind: "weekly", days: 9 }), { kind: "weekly" });
    assert.deepEqual(server.cleanFrequency({ kind: "every_n_days", days: 3 }), { kind: "every_n_days", days: 3 });
    assert.throws(() => server.cleanFrequency({ kind: "every_n_days", days: 1 }), server.CheckoffRuleError);
    assert.throws(() => server.cleanFrequency({ kind: "hourly" }), server.CheckoffRuleError);
    const rules = server.cleanReadinessRules({ suppliesLow: "off", requiredEquipmentCategories: ["Defibrillation", "Defibrillation", " "] });
    assert.equal(rules.suppliesLow, "off");
    assert.equal(rules.checkOverdue, "not_ready");
    assert.deepEqual(rules.requiredEquipmentCategories, ["Defibrillation"]);
    assert.throws(() => server.cleanReadinessRules({ checkOverdue: "panic" }), server.CheckoffRuleError);
  });
});

describe("schedules", () => {
  it("daily: done today is done, done yesterday is due, earlier is overdue, never is due", () => {
    const daily = { kind: "daily" };
    assert.equal(client.scheduleState("2026-11-26", daily, "2026-11-26").state, "done");
    assert.equal(client.scheduleState("2026-11-25", daily, "2026-11-26").state, "due");
    assert.equal(client.scheduleState("2026-11-24", daily, "2026-11-26").state, "overdue");
    assert.equal(client.scheduleState("", daily, "2026-11-26").state, "due");
  });

  it("weekly, every N days and monthly (end of month kept)", () => {
    assert.equal(client.nextDueDate("2026-11-26", { kind: "weekly" }), "2026-12-03");
    assert.equal(client.nextDueDate("2026-11-26", { kind: "every_n_days", days: 3 }), "2026-11-29");
    assert.equal(client.nextDueDate("2026-01-31", { kind: "monthly" }), "2026-02-28");
    assert.equal(client.nextDueDate("2026-12-15", { kind: "monthly" }), "2027-01-15");
  });

  it("assignments cover a vehicle, its fleet class or its station; off assignments cover nothing", () => {
    const asset = { id: "M1", fleetClassId: "ALS", station: "Station 1" };
    assert.equal(client.assignmentCovers({ targetType: "vehicle", targetId: "M1" }, asset), true);
    assert.equal(client.assignmentCovers({ targetType: "fleetClass", targetId: "ALS" }, asset), true);
    assert.equal(client.assignmentCovers({ targetType: "station", targetId: "Station 1" }, asset), true);
    assert.equal(client.assignmentCovers({ targetType: "station", targetId: "Station 2" }, asset), false);
    assert.equal(client.assignmentCovers({ targetType: "vehicle", targetId: "M1", active: false }, asset), false);
    assert.equal(client.assignmentCovers({ targetType: "fleetClass", targetId: "" }, { id: "M2" }), false);
  });

  it("uses the last finished check of that checklist on that vehicle, and notes one in progress", () => {
    const assignment = { id: "A1", templateId: "T", targetType: "vehicle", targetId: "M1", frequency: { kind: "daily" } };
    const checks = [
      { id: "c1", fleetAssetId: "M1", templateId: "T", status: "completed", completedAt: "2026-11-20T15:00:00" },
      { id: "c2", fleetAssetId: "M1", templateId: "T", status: "completed", completedAt: "2026-11-26T08:00:00" },
      { id: "c3", fleetAssetId: "M1", templateId: "OTHER", status: "completed", completedAt: "2026-11-26T09:00:00" },
      { id: "c4", fleetAssetId: "M1", templateId: "T", status: "in_progress" },
    ];
    const [row] = client.unitAssignments({ id: "M1" }, [assignment], checks, "2026-11-26");
    assert.equal(row.lastCheck.id, "c2");
    assert.equal(row.state, "done");
    assert.equal(row.openCheckId, "c4");
  });
});

describe("unit readiness", () => {
  const today = "2026-11-26";
  const row = (state, extra = {}) => ({ assignment: { templateName: "Daily", ...extra.assignment }, state, nextDue: "2026-11-25", lastCheck: extra.lastCheck || null });

  it("is ready with nothing wrong", () => {
    assert.deepEqual(client.evaluateUnitReadiness({ asset: { id: "M1" }, today }), { status: "ready", reasons: [] });
  });

  it("an overdue check-off makes the unit not ready by default; a failed one is a warning", () => {
    const r = client.evaluateUnitReadiness({
      scheduled: [row("overdue"), row("done", { lastCheck: { id: "c1", result: "Failed" } })], today,
    });
    assert.equal(r.status, "not_ready");
    assert.deepEqual(r.reasons.map((x) => [x.rule, x.severity]), [["checkOverdue", "not_ready"], ["checkFailed", "warning"]]);
  });

  it("sign-off waiting is a warning; sent back is not ready", () => {
    const scheduled = [row("done", { lastCheck: { id: "c1", result: "Passed" } })];
    assert.equal(client.evaluateUnitReadiness({ scheduled, resultsByCheckId: { c1: { verification: { status: "pending" } } }, today }).status, "issues");
    assert.equal(client.evaluateUnitReadiness({ scheduled, resultsByCheckId: { c1: { verification: { status: "returned", note: "redo" } } }, today }).status, "not_ready");
  });

  it("equipment out of use, overdue inspections and required categories", () => {
    const equipment = [
      { name: "Monitor", category: "Cardiac Monitoring", status: "missing" },
      { name: "AED", category: "Defibrillation", status: "assigned", schedules: { nextInspectionDue: "2026-11-01" } },
      { name: "Old", category: "Suction", status: "retired" },
    ];
    const r = client.evaluateUnitReadiness({
      equipment, today, rules: { requiredEquipmentCategories: ["Defibrillation", "Suction", "Cardiac Monitoring"] },
    });
    assert.deepEqual(r.reasons.map((x) => x.rule), [
      "equipmentOutOfUse", "equipmentInspectionOverdue", "requiredEquipmentMissing", "requiredEquipmentMissing",
    ]);
    assert.match(r.reasons[2].message, /Suction/);
    assert.match(r.reasons[3].message, /Cardiac Monitoring/);
  });

  it("supplies: out, low and expired; rules set to Ignore drop out", () => {
    const balances = [
      { itemName: "Gauze", onHand: 0, par: { min: 4 }, outOfStock: true },
      { itemName: "Tape", onHand: 1, par: { min: 2 }, lowStock: true, lots: [{ expiration: "2026-10-01", quantity: 1 }] },
    ];
    const r = client.evaluateUnitReadiness({ balances, today });
    assert.deepEqual(r.reasons.map((x) => x.rule), ["suppliesOut", "suppliesLow", "suppliesExpired"]);
    assert.equal(r.status, "not_ready");
    const relaxed = client.evaluateUnitReadiness({ balances, today, rules: { suppliesOut: "off", suppliesLow: "off", suppliesExpired: "off" } });
    assert.deepEqual(relaxed, { status: "ready", reasons: [] });
  });

  it("a vehicle Fleet has out of service is always not ready", () => {
    const r = client.evaluateUnitReadiness({ asset: { readinessState: "out_of_service" }, today });
    assert.equal(r.status, "not_ready");
    assert.equal(r.reasons[0].rule, "fleetOutOfService");
  });
});
