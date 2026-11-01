import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FUEL_RULE_TYPES,
  activeProviders,
  byActiveThenName,
  describeFuelRuleSetting,
  fuelRuleTypeLabel,
  fuelSiteTypeLabel,
  fuelUnitFor,
  missingRecommendedRules,
  newFuelRuleDraft,
  pickRoadsideProvider,
  siteTracksInventory,
  testProgramRemovalMode,
  testProgramTypeLabel,
} from "../../src/lib/fleet/configOpsLogic.js";
import { STARTER_FUEL_EXCEPTION_RULES, STARTER_FUEL_SITES } from "../../src/lib/fleet/fuelDefaults.js";
import { STARTER_TOW_PROVIDERS } from "../../src/lib/fleet/riskDefaults.js";

test("program, site, and rule kinds read as plain words", () => {
  assert.equal(testProgramTypeLabel("pump_performance"), "Pump performance");
  assert.equal(testProgramTypeLabel("custom"), "Other");
  assert.equal(testProgramTypeLabel("nonsense"), "Other");
  assert.equal(fuelSiteTypeLabel("station_tank"), "Station fuel tank");
  assert.equal(fuelRuleTypeLabel("meter_rollback"), "Odometer went backwards");
  assert.equal(fuelRuleTypeLabel("custom"), "Custom check (not used)");
});

test("test program removal keeps history", () => {
  assert.equal(testProgramRemovalMode(3, 5), "deactivate");
  assert.equal(testProgramRemovalMode(0, 1), "deactivate", "last program is turned off, not deleted");
  assert.equal(testProgramRemovalMode(0, 4), "delete");
});

test("fuel rule settings carry units", () => {
  assert.equal(describeFuelRuleSetting({ ruleType: "excess_quantity", threshold: 80 }), "Over 80 gallons (kWh for EV)");
  assert.equal(describeFuelRuleSetting({ ruleType: "excess_quantity", threshold: 0 }), "Over 100 gallons (kWh for EV)");
  assert.equal(describeFuelRuleSetting({ ruleType: "duplicate", threshold: 20 }), "Within 20 minutes");
  assert.equal(describeFuelRuleSetting({ ruleType: "missing_receipt" }), "");
  assert.equal(fuelUnitFor("diesel", [{ id: "diesel", unit: "gal" }]), "gallons");
  assert.equal(fuelUnitFor("electric", [{ id: "electric", unit: "kWh" }]), "kWh");
  assert.equal(siteTracksInventory("station_tank"), true);
  assert.equal(siteTracksInventory("ev_charger"), false);
});

test("new rule drafts use a real, checked rule kind", () => {
  const draft = newFuelRuleDraft("duplicate");
  assert.equal(draft.ruleType, "duplicate");
  assert.equal(draft.threshold, 15);
  assert.equal(draft.id, "");
  assert.equal(newFuelRuleDraft("bogus").ruleType, FUEL_RULE_TYPES[0].id);
});

test("recommended rules: only the missing kinds are added", () => {
  assert.equal(missingRecommendedRules([], STARTER_FUEL_EXCEPTION_RULES).length, STARTER_FUEL_EXCEPTION_RULES.length);
  const have = [{ id: "rule-abc", ruleType: "duplicate" }, { id: "rule-missing-receipt", ruleType: "x" }];
  const missing = missingRecommendedRules(have, STARTER_FUEL_EXCEPTION_RULES).map((r) => r.ruleType);
  assert.ok(!missing.includes("duplicate"));
  assert.ok(!missing.includes("missing_receipt"));
  assert.equal(missing.length, STARTER_FUEL_EXCEPTION_RULES.length - 2);
  for (const rule of STARTER_FUEL_EXCEPTION_RULES) {
    assert.ok(FUEL_RULE_TYPES.some((t) => t.id === rule.ruleType), `${rule.ruleType} is a checked kind`);
  }
});

test("no made-up starter fuel sites or tow providers", () => {
  assert.deepEqual(STARTER_FUEL_SITES, []);
  assert.deepEqual(STARTER_TOW_PROVIDERS, []);
});

test("roadside provider: only the chosen active one, never a fallback", () => {
  const providers = [
    { id: "a", name: "Off", active: false },
    { id: "b", name: "On", active: true },
  ];
  assert.deepEqual(activeProviders(providers).map((p) => p.id), ["b"]);
  assert.equal(pickRoadsideProvider(providers, "b")?.id, "b");
  assert.equal(pickRoadsideProvider(providers, "a"), null, "inactive provider is not used");
  assert.equal(pickRoadsideProvider(providers, ""), null, "no fallback to the first provider");
  assert.equal(pickRoadsideProvider(providers, "zzz"), null);
});

test("lists sort in-use items first, then by name", () => {
  const rows = [
    { name: "Zed", active: true },
    { name: "Alpha", active: false },
    { name: "Bravo", active: true },
  ].sort(byActiveThenName);
  assert.deepEqual(rows.map((r) => r.name), ["Bravo", "Zed", "Alpha"]);
});
