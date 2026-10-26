// Run: npm run test:unit
// Verification emails go through our mailer (Forge Public Safety sender),
// not Firebase's default noreply@<project>.firebaseapp.com.
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sendVerificationEmail, continueUrlFor } = require("../../functions/lib/emailVerification.js");

// Firestore stand-in; transactions run one at a time, like Firestore's retries.
function fakeDb() {
  const docs = new Map();
  const write = (path, value) => docs.set(path, { ...(docs.get(path) || {}), ...value });
  let queue = Promise.resolve();
  return {
    docs,
    doc: (path) => ({ path, set: async (value) => write(path, value) }),
    runTransaction(fn) {
      const run = queue.then(() => fn({
        get: async (ref) => ({ data: () => docs.get(ref.path) }),
        set: (ref, value) => write(ref.path, value),
      }));
      queue = run.catch(() => {});
      return run;
    },
  };
}

function fakeAuth(user, { rejectContinueUrl = false } = {}) {
  const calls = [];
  return {
    calls,
    getUser: async () => user,
    generateEmailVerificationLink: async (email, settings) => {
      calls.push({ email, settings });
      if (settings && rejectContinueUrl) throw Object.assign(new Error("bad"), { code: "auth/unauthorized-continue-uri" });
      return `https://example.test/verify?email=${encodeURIComponent(email)}`;
    },
  };
}

const req = (data = {}) => ({ auth: { uid: "u1" }, data });
let sent;
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent = [];
  process.env.RESEND_API_KEY = "test-key";
  delete process.env.EMAIL_DELIVERY;
  delete process.env.EMAIL_FROM;
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true, text: async () => "" };
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
});

describe("sendVerificationEmail", () => {
  it("sends the link from Forge Public Safety through Resend", async () => {
    const auth = fakeAuth({ email: "tim@example.com", emailVerified: false });
    const result = await sendVerificationEmail(fakeDb(), auth, req({ continueUrl: "https://01002.forgeresponder.com/" }));
    assert.equal(result.status, "sent");
    assert.equal(sent.length, 1);
    assert.match(sent[0].body.from, /^Forge Public Safety </);
    assert.deepEqual(sent[0].body.to, ["tim@example.com"]);
    assert.match(sent[0].body.text, /https:\/\/example\.test\/verify/);
    assert.equal(auth.calls[0].settings.url, "https://01002.forgeresponder.com/");
  });

  it("skips accounts that are already verified", async () => {
    const result = await sendVerificationEmail(fakeDb(), fakeAuth({ email: "a@b.co", emailVerified: true }), req());
    assert.equal(result.status, "already_verified");
    assert.equal(sent.length, 0);
  });

  it("refuses a second send within the cooldown", async () => {
    const db = fakeDb();
    const auth = fakeAuth({ email: "a@b.co", emailVerified: false });
    await sendVerificationEmail(db, auth, req());
    await assert.rejects(sendVerificationEmail(db, auth, req()), (e) => e.code === "resource-exhausted");
    assert.equal(sent.length, 1);
  });

  it("sends only one email when requests arrive at the same time", async () => {
    const db = fakeDb();
    const auth = fakeAuth({ email: "a@b.co", emailVerified: false });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => sendVerificationEmail(db, auth, req())));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(sent.length, 1);
  });

  it("still sends a link when the continue URL isn't authorized", async () => {
    const auth = fakeAuth({ email: "a@b.co", emailVerified: false }, { rejectContinueUrl: true });
    await sendVerificationEmail(fakeDb(), auth, req({ continueUrl: "https://01002.forgeresponder.com/" }));
    assert.equal(auth.calls.length, 2);
    assert.equal(auth.calls[1].settings, undefined);
    assert.equal(sent.length, 1);
  });

  it("reports an error and allows an immediate retry when the mailer fails", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => "down" });
    const db = fakeDb();
    await assert.rejects(
      sendVerificationEmail(db, fakeAuth({ email: "a@b.co", emailVerified: false }), req()),
      (e) => e.code === "unavailable",
    );
    assert.equal(db.docs.get("emailVerificationRequests/u1").lastSentAt, null);
    globalThis.fetch = async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return { ok: true, text: async () => "" };
    };
    const retry = await sendVerificationEmail(db, fakeAuth({ email: "a@b.co", emailVerified: false }), req());
    assert.equal(retry.status, "sent");
  });

  it("explains Firebase's per-address limit and frees the cooldown", async () => {
    const db = fakeDb();
    const auth = fakeAuth({ email: "a@b.co", emailVerified: false });
    auth.generateEmailVerificationLink = async () => {
      throw new Error('Raw server response: "{"error":{"message":"TOO_MANY_ATTEMPTS_TRY_LATER"}}"');
    };
    await assert.rejects(sendVerificationEmail(db, auth, req()), (e) => e.code === "resource-exhausted" && /about an hour/.test(e.message));
    assert.equal(db.docs.get("emailVerificationRequests/u1").lastSentAt, null);
    assert.equal(sent.length, 0);
  });

  it("requires sign-in", async () => {
    await assert.rejects(sendVerificationEmail(fakeDb(), fakeAuth({}), { data: {} }), (e) => e.code === "unauthenticated");
  });
});

describe("continueUrlFor", () => {
  it("keeps trusted pages and replaces untrusted ones", () => {
    assert.equal(continueUrlFor("https://01002.forgeresponder.com/login"), "https://01002.forgeresponder.com/login");
    assert.equal(continueUrlFor("https://evil.example/phish"), "https://app.forgeresponder.com/");
  });

  it("keeps only the invite token from the query", () => {
    assert.equal(
      continueUrlFor("https://01002.forgeresponder.com/?invite=abc123&next=https://evil.example"),
      "https://01002.forgeresponder.com/?invite=abc123",
    );
    assert.equal(continueUrlFor("https://evil.example/?invite=abc"), "https://app.forgeresponder.com/?invite=abc");
  });
});
