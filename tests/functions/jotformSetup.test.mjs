// JotForm damage-form secrets live server-side, against the Firestore emulator.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const store = require("./lib/jotformDamageStore.js");

const PROJECT_ID = "demo-forge-rms";
const D = "dept-a";
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

const publicDoc = async () => (await db.doc(`departments/${D}/settings/damageFormJotform`).get()).data() || {};
const secretDoc = async () => (await db.doc(`departments/${D}/integrations/damageFormJotform`).get()).data() || {};

describe("JotForm setup", () => {
  it("moves an old key and webhook token out of the member-readable settings", async () => {
    await db.doc(`departments/${D}/settings/damageFormJotform`).set({ formUrl: "https://form.jotform.com/123", apiKey: "k1", webhookToken: "t1" });
    const settings = await store.loadSettings(db, D);
    assert.equal(settings.apiKey, "k1");
    assert.equal(settings.webhookToken, "t1");
    assert.equal(settings.formUrl, "https://form.jotform.com/123");
    const pub = await publicDoc();
    assert.equal(pub.apiKey, undefined);
    assert.equal(pub.webhookToken, undefined);
    assert.equal((await secretDoc()).apiKey, "k1");
    assert.equal(await store.validateWebhookToken(db, D, "t1"), true);
  });

  it("keeps the key when saved blank, replaces it, and removes it on request", async () => {
    await store.saveSetup(db, D, { formUrl: "https://form.jotform.com/9", apiKey: "first" });
    await store.saveSetup(db, D, { formUrl: "https://form.jotform.com/9", formTitle: "Damage" });
    assert.equal((await secretDoc()).apiKey, "first");
    assert.equal((await publicDoc()).formId, "9");
    await store.saveSetup(db, D, { formUrl: "https://form.jotform.com/9", apiKey: "second" });
    assert.equal((await secretDoc()).apiKey, "second");
    await store.saveSetup(db, D, { formUrl: "https://form.jotform.com/9", removeApiKey: true });
    assert.equal((await secretDoc()).apiKey, undefined);
    assert.ok((await secretDoc()).webhookToken, "webhook token stays");
  });

  it("refuses a link that isn't JotForm", async () => {
    await assert.rejects(store.saveSetup(db, D, { formUrl: "https://evil.example/form" }), /JotForm link/);
  });
});
