// Run: npm run test:unit  (fetch is mocked; no email is sent)
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sendTextEmail, DEFAULT_FROM } = require("../../functions/lib/mailer.js");

const realFetch = globalThis.fetch;
const saved = {};
let calls;

beforeEach(() => {
  for (const key of ["RESEND_API_KEY", "SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL", "EMAIL_FROM"]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, status: 200, text: async () => "{}" };
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("mailer", () => {
  it("reports not_configured and sends nothing without a provider", async () => {
    assert.equal(await sendTextEmail({ to: ["a@b.com"], subject: "s", text: "t" }), "not_configured");
    assert.equal(calls.length, 0);
  });

  it("sends through Resend with to, cc, reply-to and the default sender", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const status = await sendTextEmail({ to: ["Chief@Camden.gov"], cc: ["admin@forgepublicsafety.com", "chief@camden.gov"], replyTo: "boss@x.com", subject: "Hi", text: "Body" });
    assert.equal(status, "sent");
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].options.headers.Authorization, "Bearer re_test_key");
    assert.deepEqual(calls[0].body, {
      from: DEFAULT_FROM,
      to: ["chief@camden.gov"],
      cc: ["admin@forgepublicsafety.com"],
      reply_to: "boss@x.com",
      subject: "Hi",
      text: "Body",
    });
  });

  it("uses EMAIL_FROM when set, and prefers Resend over SendGrid", async () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.SENDGRID_API_KEY = "SG.x";
    process.env.SENDGRID_FROM_EMAIL = "x@y.com";
    process.env.EMAIL_FROM = "Billing <billing@forgeresponder.com>";
    await sendTextEmail({ to: ["a@b.com"], subject: "s", text: "t" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].body.from, "Billing <billing@forgeresponder.com>");
  });

  it("reports failed when the provider rejects, and no_recipient with no address", async () => {
    process.env.RESEND_API_KEY = "re_x";
    globalThis.fetch = async () => ({ ok: false, status: 422, text: async () => "domain not verified" });
    assert.equal(await sendTextEmail({ to: ["a@b.com"], subject: "s", text: "t" }), "failed");
    assert.equal(await sendTextEmail({ to: [""], subject: "s", text: "t" }), "no_recipient");
  });
});
