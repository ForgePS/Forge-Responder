/**
 * Navigation + permission tests for Prevention nested sidebar.
 * Run: node scripts/test-prevention-nav.mjs
 */
import assert from "node:assert/strict";
import { PREVENTION_NAV_TREE, filterNavTree, findActiveNavBranchIds, flattenNavLeaves, isNavBranch } from "../src/data/preventionNav.js";
import { filterNavGroupsTree, filterNavGroupsByModules, groupHasNavTree } from "../src/lib/navTree.js";
import { canAccessNavItem, filterNavGroups } from "../src/lib/permissions.js";
import { NAV_MODULE_MAP } from "../src/data/adminRegistry.js";

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test("prevention tree has expected first-level groups only", () => {
  const labels = PREVENTION_NAV_TREE.map((node) => node.label);
  assert.deepEqual(labels, [
    "Overview",
    "Inspections",
    "Code Enforcement",
    "Preplans",
    "Hydrants",
    "Administration",
  ]);
});

test("Damage Reports and Water Utilities are third-level branches", () => {
  const hydrants = PREVENTION_NAV_TREE.find((n) => n.id === "prevention-hydrants");
  const damage = hydrants.children.find((n) => n.id === "prevention-damage-reports");
  const utilities = hydrants.children.find((n) => n.id === "prevention-water-utilities");
  assert.ok(isNavBranch(damage));
  assert.ok(isNavBranch(utilities));
  assert.ok(damage.children.some((c) => c.name === "Open Damage Reports" && c.label === "Open Reports"));
  assert.ok(utilities.children.some((c) => c.name === "Water Districts"));
});

test("renamed leaves exist", () => {
  const leaves = flattenNavLeaves(PREVENTION_NAV_TREE).map((l) => l.name);
  assert.ok(leaves.includes("Enforcement Cases"));
  assert.ok(leaves.includes("Import & Data Quality"));
  assert.ok(!leaves.includes("Enforcement"));
  assert.ok(!leaves.includes("Import & Hardening"));
});

test("active branch ids expand nested path", () => {
  const ids = findActiveNavBranchIds(PREVENTION_NAV_TREE, "Water Districts");
  assert.deepEqual(ids, ["prevention-hydrants", "prevention-water-utilities"]);
});

test("filterNavTree hides empty parents", () => {
  const filtered = filterNavTree(PREVENTION_NAV_TREE, (leaf) => leaf.name === "Water Districts");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].label, "Hydrants");
  assert.equal(filtered[0].children.length, 1);
  assert.equal(filtered[0].children[0].label, "Water Utilities");
});

test("permission map allows Enforcement Cases and Import & Data Quality", () => {
  const perms = {
    viewInspectionEnforcement: true,
    viewInspectionHardening: true,
    viewInspectionDashboard: true,
    viewHydrants: true,
    viewWaterDistricts: true,
  };
  assert.equal(canAccessNavItem("Enforcement Cases", perms), true);
  assert.equal(canAccessNavItem("Import & Data Quality", perms), true);
  assert.equal(canAccessNavItem("Prevention Dashboard", perms), true);
  assert.equal(canAccessNavItem("Hydrant Overview", perms), true);
  assert.equal(canAccessNavItem("Water Districts", perms), true);
  assert.equal(canAccessNavItem("Enforcement Cases", {}), false);
});

test("filterNavGroups keeps nested prevention tree", () => {
  const groups = [{ label: "Prevention", tree: PREVENTION_NAV_TREE, items: [] }];
  const filtered = filterNavGroups(groups, {
    viewInspectionDashboard: true,
    viewInspections: true,
  }, {});
  assert.ok(groupHasNavTree(filtered[0]));
  assert.ok(filtered[0].tree.some((n) => n.label === "Overview"));
  assert.ok(filtered[0].tree.some((n) => n.label === "Inspections"));
  // viewInspections also unlocks hydrant nav via permission fallbacks in canAccessNavItem
  assert.ok(filtered[0].tree.some((n) => n.label === "Hydrants"));
});

test("filterNavGroups hides hydrants without hydrant/inspection access", () => {
  const groups = [{ label: "Prevention", tree: PREVENTION_NAV_TREE, items: [] }];
  const filtered = filterNavGroups(groups, {
    viewInspectionDashboard: true,
  }, {});
  assert.ok(filtered[0].tree.some((n) => n.label === "Overview"));
  assert.ok(!filtered[0].tree.some((n) => n.label === "Hydrants"));
});

test("module filter prunes disabled modules", () => {
  const groups = [{ label: "Prevention", tree: PREVENTION_NAV_TREE, items: [] }];
  const filtered = filterNavGroupsByModules(groups, (key) => key !== "hydrants", NAV_MODULE_MAP, {});
  assert.ok(!filtered[0].tree.some((n) => n.label === "Hydrants"));
  assert.ok(filtered[0].tree.some((n) => n.label === "Inspections"));
});

test("filterNavGroupsTree used by permissions export", () => {
  const out = filterNavGroupsTree(
    [{ label: "Prevention", tree: PREVENTION_NAV_TREE, items: [] }],
    (name) => name === "Configuration Studio",
    {},
    {}
  );
  assert.equal(out[0].tree.length, 1);
  assert.equal(out[0].tree[0].label, "Administration");
});

console.log("\nAll prevention nav tests passed.");
