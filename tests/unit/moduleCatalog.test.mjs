// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { ADMIN_MODULE_OPTIONS } from "../../src/data/adminRegistry.js";

const require = createRequire(import.meta.url);
const catalog = require("../../functions/lib/moduleCatalog.js");
const { effectiveModules } = require("../../functions/lib/entitlements.js");

const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Parse a generated `function name(x) { return {...}.get(x, ""); }` map from the rules. */
function rulesMap(name) {
  const match = rules.match(new RegExp(`function ${name}\\([a-zA-Z]+\\) \\{\\s*return (\\{[\\s\\S]*?\\})\\.get\\(`));
  assert.ok(match, `firestore.rules has no ${name}() map`);
  return JSON.parse(match[1]);
}

describe("module catalog", () => {
  it("uses the same module keys as the app", () => {
    assert.deepEqual(catalog.MODULE_KEYS, ADMIN_MODULE_OPTIONS.map((m) => m.key));
  });

  it("maps only to real modules", () => {
    const mapped = [...Object.values(catalog.LIST_MODULES), ...Object.values(catalog.COLLECTION_MODULES), ...catalog.COLLECTION_PREFIX_MODULES.map(([, m]) => m)];
    for (const key of mapped) assert.ok(catalog.MODULE_KEYS.includes(key), `unknown module ${key}`);
  });

  it("matches the maps in firestore.rules", () => {
    assert.deepEqual(rulesMap("listModule"), catalog.LIST_MODULES);
    assert.deepEqual(rulesMap("collectionModule"), catalog.COLLECTION_MODULES);
  });

  it("gates every explicitly ruled module collection's writes in firestore.rules", () => {
    const blocks = rules.split(/\n      match \//).slice(1);
    const ungated = [];
    for (const block of blocks) {
      const name = block.match(/^([A-Za-z]+)\//)?.[1];
      const moduleKey = name && catalog.collectionModule(name);
      if (!moduleKey) continue;
      const body = block.split(/\n      \}/)[0];
      const writeLines = body.split("\n").filter((l) => /^\s+allow /.test(l) && !/^\s+allow read:/.test(l));
      if (writeLines.some((l) => l.includes("canAccessDepartment(departmentId)") && !l.includes("canWriteModule"))) ungated.push(name);
    }
    assert.deepEqual(ungated, []);
  });

  it("finds the module for prefixed collection families", () => {
    assert.equal(catalog.collectionModule("fleetWorkOrders"), "apparatus");
    assert.equal(catalog.collectionModule("inspectionNotices"), "inspections");
    assert.equal(catalog.collectionModule("fpsImpairments"), "inspections");
    assert.equal(catalog.collectionModule("preplanFiles"), "preplans");
    assert.equal(catalog.collectionModule("auditLogs"), "");
  });
});

describe("effective modules", () => {
  it("is every module when nothing narrows it", () => {
    assert.deepEqual(effectiveModules({}), catalog.MODULE_KEYS);
  });

  it("is the plan's modules minus switched-off ones, keeping Dashboard and System Admin", () => {
    const result = effectiveModules({
      planModules: ["personnel", "training", "hydrants", "scheduling"],
      disabledModules: ["hydrants", "dashboard"],
    });
    assert.deepEqual(result, ["dashboard", "personnel", "training", "scheduling", "administration"]);
  });

  it("gives every module when the plan lists none, so new modules appear automatically", () => {
    assert.deepEqual(effectiveModules({ planModules: [], disabledModules: [] }), catalog.MODULE_KEYS);
    assert.deepEqual(effectiveModules({ planModules: ["notAModule"] }), catalog.MODULE_KEYS);
    assert.deepEqual(effectiveModules({ disabledModules: ["hydrants"] }), catalog.MODULE_KEYS.filter((k) => k !== "hydrants"));
  });
});
