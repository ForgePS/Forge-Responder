// NERIS connection record, against the Firestore emulator. Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const store = require("./lib/nerisStore.js");
const { clearTokenCache } = require("./lib/nerisClient.js");

const PROJECT_ID = "demo-forge-rms";
const D = "dept-a";
const CREDS = { clientId: "05dd2999-329b-41ec-b94d-000000000001", clientSecret: "s3cret", environment: "test" };
let db;

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

// NERIS stand-in: FD24027214 has enrolled FORGE, FD24027999 hasn't.
async function fakeNeris(url) {
  const path = new URL(url).pathname;
  if (path === "/v1/token") return jsonResponse(200, { access_token: "tok", expires_in: 3600 });
  if (path === "/v1/entity/FD24027214") return jsonResponse(200, { name: "FSRI Fire Department" });
  if (path === "/v1/entity/FD24027999") return jsonResponse(403, {});
  return jsonResponse(404, {});
}

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});

after(async () => {
  await Promise.all(admin.apps.map((app) => app.delete()));
});

beforeEach(async () => {
  clearTokenCache();
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
});

describe("NERIS connection", () => {
  it("reports 'not set up' with FORGE's client ID before anything is saved", async () => {
    const status = store.publicStatus(await store.loadConnection(db, D), CREDS);
    assert.equal(status.configured, false);
    assert.equal(status.status, "not_set_up");
    assert.equal(status.clientId, CREDS.clientId);
    assert.equal(status.environment, "test");
    assert.ok(!JSON.stringify(status).includes(CREDS.clientSecret));
  });

  it("saves a NERIS ID and marks it connected when NERIS answers", async () => {
    const connection = await store.saveNerisId(db, D, " fd24027214 ", { savedBy: "u1", credentials: CREDS, fetchImpl: fakeNeris });
    assert.equal(connection.nerisId, "FD24027214");
    assert.equal(connection.status, "connected");
    assert.equal(connection.entityName, "FSRI Fire Department");
    assert.equal(connection.checkedEnvironment, "test");
    const status = store.publicStatus(connection, CREDS);
    assert.equal(status.status, "connected");
    assert.equal(status.environmentMismatch, false);
    assert.equal(store.publicStatus(connection, { ...CREDS, environment: "production" }).environmentMismatch, true);
  });

  it("records 'not enrolled' instead of failing, and clears old results when the ID changes", async () => {
    await store.saveNerisId(db, D, "FD24027214", { credentials: CREDS, fetchImpl: fakeNeris });
    const connection = await store.saveNerisId(db, D, "FD24027999", { credentials: CREDS, fetchImpl: fakeNeris });
    assert.equal(connection.status, "not_enrolled");
    assert.equal(connection.entityName, "", "old department name is not carried over");
    assert.equal(connection.lastConnectedAt, "");
    assert.match(connection.lastError, /Enrollments/);
  });

  it("re-check notices when a department removes FORGE's enrollment", async () => {
    await store.saveNerisId(db, D, "FD24027214", { credentials: CREDS, fetchImpl: fakeNeris });
    const revoked = async (url) => (new URL(url).pathname.startsWith("/v1/entity/") ? jsonResponse(403, {}) : fakeNeris(url));
    const connection = await store.checkConnection(db, D, { credentials: CREDS, fetchImpl: revoked });
    assert.equal(connection.status, "not_enrolled");
    assert.equal(connection.entityName, "FSRI Fire Department", "keeps the last known name");
    assert.ok(connection.lastConnectedAt, "keeps when it last worked");
  });

  it("rejects a malformed ID (including pasting the client ID by mistake)", async () => {
    await assert.rejects(store.saveNerisId(db, D, CREDS.clientId, { credentials: CREDS, fetchImpl: fakeNeris }), /NERIS ID/);
    assert.equal(await store.loadConnection(db, D), null);
  });

  it("missing FORGE credentials are saved as an error status", async () => {
    const connection = await store.saveNerisId(db, D, "FD24027214", { credentials: { environment: "test" }, fetchImpl: fakeNeris });
    assert.equal(connection.status, "error");
    assert.match(connection.lastError, /credentials/);
  });

  it("sync runs merge links instead of replacing them", async () => {
    await store.saveNerisId(db, D, "FD24027214", { credentials: CREDS, fetchImpl: fakeNeris });
    await store.saveSyncResult(db, D, { stationLinks: { s1: "N1" }, unitLinks: { a1: "U1" }, unitSettings: { a1: { type: "ENGINE_STRUCT", staffing: 3 } }, summary: { sent: 2, failed: 0 } });
    await store.saveSyncResult(db, D, { stationLinks: { s2: "N2" }, unitLinks: {}, unitSettings: { a1: { type: "ENGINE_STRUCT", staffing: 4 } }, summary: { sent: 1, failed: 1 } });
    const connection = await store.loadConnection(db, D);
    assert.deepEqual(connection.stationLinks, { s1: "N1", s2: "N2" });
    assert.deepEqual(connection.unitLinks, { a1: "U1" });
    assert.equal(connection.unitSettings.a1.staffing, 4);
    assert.equal(connection.status, "connected", "connection fields untouched");
    assert.equal(store.publicStatus(connection, CREDS).lastSync.failed, 1);
    assert.equal(store.publicStatus(connection, CREDS).stationLinks, undefined, "links stay server-side");
  });

  it("remove deletes the record", async () => {
    await store.saveNerisId(db, D, "FD24027214", { credentials: CREDS, fetchImpl: fakeNeris });
    await store.removeConnection(db, D);
    assert.equal(await store.loadConnection(db, D), null);
  });
});
