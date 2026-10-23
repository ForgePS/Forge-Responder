// Department lists in both storage formats, against the Firestore emulator.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const lists = require("./lib/listStore.js");

const PROJECT_ID = "demo-forge-rms";
let db;

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});

after(async () => {
  await Promise.all(admin.apps.map((app) => app.delete()));
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
});

const itemDocs = async (path) => (await db.collection(`${path}/items`).get()).docs.map((d) => d.id).sort();

describe("list store", () => {
  it("reads and rewrites an older array list as an array", async () => {
    await db.doc("departments/d1/lists/k").set({ items: [{ id: "A" }, { id: "B" }] });
    assert.deepEqual((await lists.readListItems(db, "d1", "k")).map((i) => i.id), ["A", "B"]);
    const result = await lists.replaceListItems(db, "d1", "k", [{ id: "B" }, { id: "C" }]);
    assert.equal(result.storage, "array");
    assert.deepEqual((await db.doc("departments/d1/lists/k").get()).data().items.map((i) => i.id), ["B", "C"]);
    assert.equal(await lists.countListItems(db, "d1", "k"), 2);
  });

  it("creates a new list per item", async () => {
    const result = await lists.replaceListItems(db, "d1", "new", [{ id: "A", n: 1 }, { id: "B", n: 2 }], { updatedBy: "test" });
    assert.equal(result.storage, "items");
    const header = (await db.doc("departments/d1/lists/new").get()).data();
    assert.equal(header.storage, "items");
    assert.equal(header.items, undefined);
    assert.deepEqual(await itemDocs("departments/d1/lists/new"), ["A", "B"]);
    assert.deepEqual((await lists.readListItems(db, "d1", "new")).map((i) => i.id), ["A", "B"]);
    assert.equal(await lists.countListItems(db, "d1", "new"), 2);
  });

  it("writes only what changed, keeps order, and deletes removed items", async () => {
    await lists.replaceListItems(db, "d1", "k", [{ id: "A" }, { id: "B" }, { id: "C" }]);
    const result = await lists.replaceListItems(db, "d1", "k", [{ id: "N" }, { id: "A" }, { id: "C", edited: true }]);
    assert.equal(result.writes, 3, "add N, edit C, delete B");
    assert.deepEqual((await lists.readListItems(db, "d1", "k")).map((i) => i.id), ["N", "A", "C"]);
    assert.deepEqual(await itemDocs("departments/d1/lists/k"), ["A", "C", "N"]);
  });

  it("stores ids that aren't safe record names", async () => {
    await lists.replaceListItems(db, "d1", "k", [{ id: "unit/1" }, { name: "no id" }]);
    const items = await lists.readListItems(db, "d1", "k");
    assert.equal(items[0].id, "unit/1");
    assert.ok(items[1].id.startsWith("itm-"));
  });
});
