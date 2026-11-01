import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sendHydrantDamageEmail } = require("../../functions/lib/hydrantDamageEmail.js");

const pdfBuffer = Buffer.from("%PDF-test");
const base = { to: ["Water@Utility.example"], subject: "Hydrant damage", text: "Body", pdfBuffer, filename: "HDR-1.pdf" };

function fakeFetch({ ok = true, status = 200, json = { id: "msg_123" }, text = "" } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok, status, json: async () => json, text: async () => text, headers: { get: () => "" } };
  };
  return { calls, impl };
}

test("sends through Resend with the PDF attached and reply-to set", async () => {
  const fetch = fakeFetch();
  const result = await sendHydrantDamageEmail({
    ...base,
    replyTo: "captain@fd.example",
    env: { RESEND_API_KEY: "re_test", EMAIL_FROM: "FD <noreply@fd.example>" },
    fetchImpl: fetch.impl,
  });
  assert.equal(result.outcome, "sent");
  assert.equal(result.ok, true);
  assert.equal(result.providerMessageId, "msg_123");
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.resend.com/emails");
  const body = fetch.calls[0].body;
  assert.deepEqual(body.to, ["water@utility.example"]);
  assert.equal(body.from, "FD <noreply@fd.example>");
  assert.equal(body.reply_to, "captain@fd.example");
  assert.equal(body.attachments[0].filename, "HDR-1.pdf");
  assert.equal(body.attachments[0].content, pdfBuffer.toString("base64"));
});

test("log-only mode sends nothing and is not reported as sent", async () => {
  const fetch = fakeFetch();
  const result = await sendHydrantDamageEmail({ ...base, env: { EMAIL_DELIVERY: "log", RESEND_API_KEY: "re_test" }, fetchImpl: fetch.impl });
  assert.equal(result.outcome, "logged");
  assert.equal(result.ok, false);
  assert.match(result.errorText, /nothing was sent/);
  assert.equal(fetch.calls.length, 0);
});

test("no provider key reports not_configured", async () => {
  const fetch = fakeFetch();
  const result = await sendHydrantDamageEmail({ ...base, env: {}, fetchImpl: fetch.impl });
  assert.equal(result.outcome, "not_configured");
  assert.equal(result.ok, false);
  assert.equal(fetch.calls.length, 0);
});

test("provider rejection is a failure with the reason", async () => {
  const fetch = fakeFetch({ ok: false, status: 422, text: "Invalid from address" });
  const result = await sendHydrantDamageEmail({ ...base, env: { RESEND_API_KEY: "re_test" }, fetchImpl: fetch.impl });
  assert.equal(result.outcome, "failed");
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.match(result.errorText, /Invalid from address/);
});

test("no recipients fails without calling the provider", async () => {
  const fetch = fakeFetch();
  const result = await sendHydrantDamageEmail({ ...base, to: [], env: { RESEND_API_KEY: "re_test" }, fetchImpl: fetch.impl });
  assert.equal(result.ok, false);
  assert.equal(fetch.calls.length, 0);
});
