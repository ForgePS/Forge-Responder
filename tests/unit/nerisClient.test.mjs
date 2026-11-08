import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const client = require("../../functions/lib/nerisClient.js");

const CREDS = { clientId: "05dd2999-329b-41ec-b94d-000000000001", clientSecret: "s3cret", environment: "test" };

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    const handler = routes[path];
    if (!handler) return jsonResponse(404, { detail: "no route" });
    return handler(url, options, calls);
  };
  impl.calls = calls;
  return impl;
}

beforeEach(() => client.clearTokenCache());

test("NERIS IDs: normalized and shape-checked", () => {
  assert.equal(client.normalizeNerisId(" fd24027214 "), "FD24027214");
  assert.equal(client.isValidNerisId("FD24027214"), true);
  assert.equal(client.isValidNerisId("fd 2402 7214"), true);
  assert.equal(client.isValidNerisId("24027214"), false);
  assert.equal(client.isValidNerisId("FD2402"), false);
  assert.equal(client.isValidNerisId("05dd2999-329b-41ec-b94d-000000000001"), false, "a client ID is not a NERIS ID");
  assert.equal(client.isValidClientId("05dd2999-329b-41ec-b94d-000000000001"), true);
});

test("environment defaults to the test sandbox", () => {
  assert.equal(client.baseUrlFor(""), "https://api-test.neris.fsri.org/v1");
  assert.equal(client.baseUrlFor("PRODUCTION"), "https://api.neris.fsri.org/v1");
  assert.equal(client.normalizeEnvironment("prod"), "test", "only the exact word switches to production");
});

test("token: Basic auth header + form body, then cached", async () => {
  const fetchImpl = fakeFetch({
    "/v1/token": () => jsonResponse(200, { access_token: "tok-1", expires_in: 3600 }),
  });
  const token = await client.getAccessToken({ ...CREDS, fetchImpl });
  assert.equal(token, "tok-1");
  const { options } = fetchImpl.calls[0];
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, `Basic ${Buffer.from(`${CREDS.clientId}:${CREDS.clientSecret}`).toString("base64")}`);
  assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(options.body, "grant_type=client_credentials");
  assert.ok(!options.body.includes(CREDS.clientSecret), "secret is never in the body");

  await client.getAccessToken({ ...CREDS, fetchImpl });
  assert.equal(fetchImpl.calls.length, 1, "second call uses the cached token");
});

test("token: refreshed when close to expiry", async () => {
  let n = 0;
  const fetchImpl = fakeFetch({ "/v1/token": () => jsonResponse(200, { access_token: `tok-${++n}`, expires_in: 120 }) });
  let clock = 1_000_000;
  const now = () => clock;
  assert.equal(await client.getAccessToken({ ...CREDS, fetchImpl, now }), "tok-1");
  clock += 30_000;
  assert.equal(await client.getAccessToken({ ...CREDS, fetchImpl, now }), "tok-1");
  clock += 40_000; // inside the 60s refresh margin
  assert.equal(await client.getAccessToken({ ...CREDS, fetchImpl, now }), "tok-2");
});

test("token: missing or rejected credentials", async () => {
  await assert.rejects(client.getAccessToken({ clientId: "", clientSecret: "", fetchImpl: fakeFetch({}) }), (e) => e.code === "config");
  const fetchImpl = fakeFetch({ "/v1/token": () => jsonResponse(401, { detail: "bad" }) });
  await assert.rejects(client.getAccessToken({ ...CREDS, fetchImpl }), (e) => e.code === "auth");
  const down = fakeFetch({ "/v1/token": () => jsonResponse(503, {}) });
  await assert.rejects(client.getAccessToken({ ...CREDS, fetchImpl: down }), (e) => e.code === "unavailable");
});

test("entity lookup: connected, not enrolled, not found", async () => {
  const entities = {
    FD24027214: () => jsonResponse(200, { neris_id: "FD24027214", name: "FSRI Fire Department" }),
    FD24027999: () => jsonResponse(403, { detail: "forbidden" }),
  };
  const fetchImpl = fakeFetch({
    "/v1/token": () => jsonResponse(200, { access_token: "tok", expires_in: 3600 }),
    "/v1/entity/FD24027214": entities.FD24027214,
    "/v1/entity/FD24027999": entities.FD24027999,
  });
  const entity = await client.fetchEntity("fd24027214", { credentials: CREDS, fetchImpl });
  assert.equal(entity.name, "FSRI Fire Department");
  const entityCall = fetchImpl.calls.find((c) => c.url.endsWith("/entity/FD24027214"));
  assert.equal(entityCall.options.headers.Authorization, "Bearer tok");

  await assert.rejects(client.fetchEntity("FD24027999", { credentials: CREDS, fetchImpl }), (e) => e.code === "not_enrolled");
  await assert.rejects(client.fetchEntity("FD24027000", { credentials: CREDS, fetchImpl }), (e) => e.code === "not_found");
  await assert.rejects(client.fetchEntity("nope", { credentials: CREDS, fetchImpl }), (e) => e.code === "invalid");
});

test("network failure becomes a friendly 'unavailable' error", async () => {
  const fetchImpl = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(client.getAccessToken({ ...CREDS, fetchImpl }), (e) => e.code === "unavailable" && /reach NERIS/.test(e.message));
});
