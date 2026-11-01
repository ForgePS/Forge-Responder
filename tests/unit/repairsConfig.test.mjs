import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeOptionsWithSelected,
  countOpenReferences,
  firstActiveId,
  isOpenWorkOrder,
  shopTypeLabel,
  validateConfigName,
} from "../../src/lib/fleet/repairsConfig.js";
import { STARTER_SHOPS, STARTER_VENDORS } from "../../src/lib/fleet/workOrderDefaults.js";

const rows = [
  { id: "a", name: "Brakes", active: true },
  { id: "b", name: "Lights", active: false },
  { id: "c", name: "Pump" },
];

test("pickers hide turned-off rows but keep the current selection", () => {
  assert.deepEqual(activeOptionsWithSelected(rows).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(activeOptionsWithSelected(rows, "b").map((r) => r.id), ["a", "b", "c"]);
  assert.equal(firstActiveId([{ id: "x", active: false }, ...rows]), "a");
  assert.equal(firstActiveId([]), "");
});

test("names must be present and unique (case-insensitive)", () => {
  assert.match(validateConfigName("  ", rows, "", "category"), /name/);
  assert.match(validateConfigName("brakes", rows, "", "category"), /already/);
  assert.equal(validateConfigName("Brakes", rows, "a", "category"), "");
  assert.equal(validateConfigName("Tires", rows, "", "category"), "");
});

test("open work order references ignore closed and cancelled orders", () => {
  const orders = [
    { shopId: "s1", status: "in_progress" },
    { shopId: "s1", status: "closed" },
    { shopId: "s1", status: "cancelled" },
    { shopId: "s2", status: "requested" },
  ];
  assert.equal(countOpenReferences(orders, "shopId", "s1", isOpenWorkOrder), 1);
  assert.equal(countOpenReferences(orders, "shopId", "", isOpenWorkOrder), 0);
});

test("shop types show plain labels, never raw keys", () => {
  assert.equal(shopTypeLabel("internal"), "In-house shop");
  assert.equal(shopTypeLabel("something_else"), "Repair shop");
});

test("no outside vendors are seeded; the starter shop is generic", () => {
  assert.equal(STARTER_VENDORS.length, 0);
  assert.equal(STARTER_SHOPS.length, 1);
  assert.equal(STARTER_SHOPS[0].name, "In-house shop");
  assert.equal(STARTER_SHOPS[0].location, "");
});
