// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import * as plan from "../../src/lib/listItemsPlan.js";

const require = createRequire(import.meta.url);
const serverPlan = require("../../functions/lib/listItemsPlan.js");

const stored = (items) => {
  const map = new Map();
  items.forEach((item, i) => map.set(item.id, plan.itemEntry(item, (i + 1) * 1024)));
  return map;
};
const A = { id: "A", name: "Alpha" };
const B = { id: "B", name: "Bravo" };
const C = { id: "C", name: "Charlie" };
const D = { id: "D", name: "Delta" };

describe("list item planning", () => {
  it("writes nothing when nothing changed", () => {
    const { upserts, deletes } = plan.planListWrites(stored([A, B, C]), [A, B, C]);
    assert.equal(upserts.length, 0);
    assert.equal(deletes.length, 0);
  });

  it("writes only the edited item", () => {
    const { upserts } = plan.planListWrites(stored([A, B, C]), [A, { ...B, name: "Bravo 2" }, C]);
    assert.deepEqual(upserts.map((u) => u.id), ["B"]);
    assert.equal(upserts[0].data._order, 2048);
  });

  it("adds a new first item with one write, ahead of the rest", () => {
    const { upserts } = plan.planListWrites(stored([A, B, C]), [D, A, B, C]);
    assert.deepEqual(upserts.map((u) => u.id), ["D"]);
    assert.ok(upserts[0].data._order < 1024);
  });

  it("adds at the end and in the middle with one write each", () => {
    const end = plan.planListWrites(stored([A, B, C]), [A, B, C, D]);
    assert.deepEqual(end.upserts.map((u) => u.id), ["D"]);
    assert.ok(end.upserts[0].data._order > 3072);
    const mid = plan.planListWrites(stored([A, B, C]), [A, D, B, C]);
    assert.deepEqual(mid.upserts.map((u) => u.id), ["D"]);
    assert.ok(mid.upserts[0].data._order > 1024 && mid.upserts[0].data._order < 2048);
  });

  it("deletes removed items", () => {
    const { upserts, deletes } = plan.planListWrites(stored([A, B, C]), [A, C]);
    assert.equal(upserts.length, 0);
    assert.deepEqual(deletes, ["B"]);
  });

  it("moves one item with one write", () => {
    const { upserts } = plan.planListWrites(stored([A, B, C, D]), [D, A, B, C]);
    assert.deepEqual(upserts.map((u) => u.id), ["D"]);
  });

  it("keeps the order when read back", () => {
    const first = plan.planListWrites(new Map(), [C, A, B]);
    const records = first.upserts.map((u) => ({ docId: u.docId, data: u.data })).reverse();
    assert.deepEqual(plan.itemsFromRecords(records).map((i) => i.id), ["C", "A", "B"]);
    const entries = plan.entriesFromRecords(records);
    const again = plan.planListWrites(entries, [C, A, B]);
    assert.equal(again.upserts.length, 0, "reading back then saving the same list writes nothing");
  });

  it("ignores key order inside an item when comparing", () => {
    const { upserts } = plan.planListWrites(stored([A]), [{ name: "Alpha", id: "A" }]);
    assert.equal(upserts.length, 0);
  });

  it("renumbers when repeated inserts run out of room", () => {
    let entries = new Map([["A", { order: 1, json: "{}" }], ["B", { order: 1 + 1e-7, json: "{}" }]]);
    const { upserts } = plan.planListWrites(entries, [{ id: "A" }, { id: "X" }, { id: "B" }]);
    assert.equal(upserts.length, 3);
    const orders = upserts.map((u) => u.data._order);
    assert.deepEqual([...orders].sort((x, y) => x - y), orders);
  });

  it("makes safe record ids from any item id", () => {
    assert.equal(plan.itemDocId("HL-001"), "HL-001");
    assert.equal(plan.itemDocId("a/b"), "a%2Fb");
    assert.equal(plan.itemDocId("."), "%2E");
    assert.equal(plan.itemDocId("__x__"), "%5F_x__");
    assert.equal(plan.itemIdFromDocId(plan.itemDocId("a/b c")), "a/b c");
    assert.throws(() => plan.itemDocId(""));
  });

  it("fills in missing ids and splits repeated ones", () => {
    const { items, changed } = plan.ensureItemIds([{ id: "A" }, { name: "no id" }, { id: "A" }]);
    assert.equal(changed, true);
    assert.equal(items[0].id, "A");
    assert.ok(items[1].id.startsWith("itm-"));
    assert.equal(items[2].id, "A-2");
    assert.deepEqual(plan.duplicateItemIds([{ id: "A" }, { id: "B" }, { id: "A" }]), ["A"]);
  });

  it("server copy matches the app copy", () => {
    const cases = [[A, B, C], [D, A, B, C], [A, C], [C, B, A, D]];
    for (const next of cases) {
      const fromApp = plan.planListWrites(stored([A, B, C]), next);
      const fromServer = serverPlan.planListWrites(stored([A, B, C]), next);
      assert.deepEqual(fromServer.upserts, fromApp.upserts);
      assert.deepEqual(fromServer.deletes, fromApp.deletes);
    }
    const strip = (text) => text.replace(/^export /gm, "").replace(/\r/g, "").split("module.exports")[0].split("\n").filter((l) => !/^\s*\/\//.test(l) && !/^ \*|^\/\*\*/.test(l)).join("\n").trim();
    const appSource = readFileSync(new URL("../../src/lib/listItemsPlan.js", import.meta.url), "utf8");
    const serverSource = readFileSync(new URL("../../functions/lib/listItemsPlan.js", import.meta.url), "utf8");
    assert.equal(strip(serverSource), strip(appSource), "functions/lib/listItemsPlan.js must stay a copy of src/lib/listItemsPlan.js");
  });
});
