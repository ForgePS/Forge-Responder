// FORGE Field: per-role settings and EMS / supply check-off math.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formFieldRules,
  requiredFieldErrors,
  resolveFieldMode,
  setFieldMode,
  setWorkflow,
  workflowAllowed,
  workflowEditRoles,
  emptyFieldAppConfig,
} from "../../src/field/fieldAppConfig.js";
import {
  checkoffItemStatus,
  groupByCategory,
  normalizeCheckoffList,
  summarizeCheckoff,
  validateCheckoff,
  validateCheckoffList,
} from "../../src/field/checkoffModel.js";

describe("FORGE Field settings", () => {
  it("workflows are on for everyone until restricted", () => {
    let config = emptyFieldAppConfig();
    assert.ok(workflowAllowed(config, "inspections", ["firefighter"]));
    config = setWorkflow(config, "inspections", { roles: ["captain"] });
    assert.ok(!workflowAllowed(config, "inspections", ["firefighter"]));
    assert.ok(workflowAllowed(config, "inspections", ["firefighter", "captain"]));
    assert.ok(workflowAllowed(config, "inspections", [], { isCreator: true }));
    config = setWorkflow(config, "inspections", { enabled: false });
    assert.ok(!workflowAllowed(config, "inspections", ["captain"]));
    assert.ok(!workflowAllowed(config, "inspections", [], { isCreator: true }), "off means off");
  });

  it("pre-fire plan editor roles", () => {
    let config = emptyFieldAppConfig();
    assert.equal(workflowEditRoles(config, "preFirePlans"), null);
    config = setWorkflow(config, "preFirePlans", { editRoles: ["captain"] });
    assert.deepEqual(workflowEditRoles(config, "preFirePlans"), ["captain"]);
  });

  it("field modes: department default, then role overrides (most visible wins)", () => {
    let config = emptyFieldAppConfig();
    assert.equal(resolveFieldMode(config, "incident", "narrative", []), "show");
    config = setFieldMode(config, "incident", "narrative", "hide");
    assert.equal(resolveFieldMode(config, "incident", "narrative", ["firefighter"]), "hide");
    config = setFieldMode(config, "incident", "narrative", "required", "captain");
    assert.equal(resolveFieldMode(config, "incident", "narrative", ["captain"]), "required");
    assert.equal(resolveFieldMode(config, "incident", "narrative", ["firefighter", "captain"]), "required");
    config = setFieldMode(config, "incident", "narrative", "show", "engineer");
    assert.equal(resolveFieldMode(config, "incident", "narrative", ["engineer", "captain"]), "required");
    config = setFieldMode(config, "incident", "narrative", "default", "captain");
    assert.equal(resolveFieldMode(config, "incident", "narrative", ["captain"]), "hide", "role cleared falls back to department");
  });

  it("required field errors only for required, empty fields", () => {
    const config = setFieldMode(emptyFieldAppConfig(), "dailyLog", "crew", "required");
    const rules = formFieldRules(config, "dailyLog", []);
    assert.deepEqual(Object.keys(requiredFieldErrors(rules, [{ field: "crew", value: [] }, { field: "notes", value: "" }])), ["crew"]);
    assert.deepEqual(requiredFieldErrors(rules, [{ field: "crew", value: ["A"] }]), {});
    assert.ok(rules.show("notes"));
    assert.ok(rules.required("crew"));
  });
});

describe("check-offs", () => {
  const list = normalizeCheckoffList({
    id: "EMS-1",
    name: "Jump bag",
    kind: "ems",
    target: "Medic 1",
    items: [
      { id: "a", name: "Epinephrine", category: "Meds", par: 2, tracksExpiration: true, warnDays: 30 },
      { id: "b", name: "4x4 gauze", category: "Supplies", par: 10 },
      { id: "c", name: "Tourniquet", category: "Supplies", par: 1, required: false },
      { id: "", name: "  " },
    ],
  });

  it("normalizes lists and drops blank items", () => {
    assert.equal(list.items.length, 3);
    assert.equal(list.items[2].required, false);
    assert.deepEqual(validateCheckoffList({ ...list, target: "" }).target !== undefined, true);
  });

  it("item status: ok, short, missing, expired, expiring", () => {
    const today = "2026-10-24";
    const epi = list.items[0];
    assert.equal(checkoffItemStatus(epi, {}, today), "unchecked");
    assert.equal(checkoffItemStatus(epi, { count: "2", expiration: "2027-06-01" }, today), "ok");
    assert.equal(checkoffItemStatus(epi, { count: "2", expiration: "2026-11-10" }, today), "expiring");
    assert.equal(checkoffItemStatus(epi, { count: "2", expiration: "2026-10-01" }, today), "expired");
    assert.equal(checkoffItemStatus(epi, { count: "1", expiration: "2027-06-01" }, today), "short");
    assert.equal(checkoffItemStatus(list.items[1], { count: "0" }, today), "missing");
  });

  it("summary lists what to restock", () => {
    const done = summarizeCheckoff(list, {
      a: { count: "2", expiration: "2026-10-01" },
      b: { count: "6" },
      c: { count: "1" },
    }, "2026-10-24");
    assert.equal(done.result, "Needs restock");
    assert.deepEqual(done.restock.map((row) => [row.name, row.need, row.reason]), [["Epinephrine", 2, "expired"], ["4x4 gauze", 4, "short"]]);
    assert.equal(done.counts.ok, 1);
    const allGood = summarizeCheckoff(list, { a: { count: "2", expiration: "2027-01-01" }, b: { count: "10" }, c: { count: "1" } }, "2026-10-24");
    assert.equal(allGood.result, "All OK");
  });

  it("validation: required counts and expiration dates", () => {
    const errors = validateCheckoff(list, { a: { count: "2" } });
    assert.ok(errors["a:exp"], "expiration needed when counted");
    assert.ok(errors.b, "required item must be counted");
    assert.ok(!errors.c, "optional item can be skipped");
    assert.ok(!validateCheckoff(list, { a: { count: "2" }, b: { count: "1" } }, { requireExpirations: false })["a:exp"]);
  });

  it("groups by category in list order", () => {
    assert.deepEqual(groupByCategory(list.items).map((group) => group.category), ["Meds", "Supplies"]);
  });
});
