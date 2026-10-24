import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sendDailyActivityEmail } = require("../../functions/lib/hydrantActivityEmail.js");

const auth = { uid: "u1", token: { email: "captain@example.com" } };
const fakeDb = {};

function harness({ status = "sent", deny = false } = {}) {
  const sent = [];
  const accessCalls = [];
  return {
    sent,
    accessCalls,
    deps: {
      sendTextEmail: async (message) => { sent.push(message); return status; },
      assertAccess: async (db, departmentId, callerAuth) => {
        accessCalls.push({ db, departmentId, uid: callerAuth?.uid });
        if (deny) {
          const error = new Error("You do not have access to this department.");
          error.code = "permission-denied";
          throw error;
        }
      },
    },
  };
}

const validData = {
  departmentId: "dept1",
  date: "2026-10-20",
  emails: ["Chief@Example.com", "chief@example.com", "ops@example.org"],
  csv: "\"hydrant\",\"result\"\n\"H-1\",\"Pass\"",
  summary: "1 hydrant done",
  departmentName: "Test FD",
};

test("sends to de-duplicated recipients with the CSV inline", async () => {
  const h = harness();
  const result = await sendDailyActivityEmail(fakeDb, { auth, data: validData }, h.deps);
  assert.deepEqual(result, { ok: true, status: "sent", recipients: 2 });
  assert.equal(h.accessCalls.length, 1);
  assert.equal(h.accessCalls[0].departmentId, "dept1");
  assert.equal(h.accessCalls[0].db, fakeDb);
  assert.deepEqual(h.sent[0].to, ["chief@example.com", "ops@example.org"]);
  assert.equal(h.sent[0].replyTo, "captain@example.com");
  assert.match(h.sent[0].subject, /Test FD daily activity 2026-10-20/);
  assert.match(h.sent[0].text, /1 hydrant done/);
  assert.match(h.sent[0].text, /"H-1","Pass"/);
});

test("rejects unauthenticated callers before checking access", async () => {
  const h = harness();
  await assert.rejects(sendDailyActivityEmail(fakeDb, { data: validData }, h.deps), { code: "unauthenticated" });
  assert.equal(h.accessCalls.length, 0);
  assert.equal(h.sent.length, 0);
});

test("rejects bad input", async () => {
  const cases = [
    { ...validData, departmentId: "" },
    { ...validData, date: "10/20/2026" },
    { ...validData, emails: [] },
    { ...validData, emails: ["not-an-email"] },
    { ...validData, emails: Array.from({ length: 11 }, (_, i) => `p${i}@example.com`) },
    { ...validData, csv: 42 },
    { ...validData, csv: "x".repeat(500 * 1024 + 1) },
  ];
  for (const data of cases) {
    const h = harness();
    await assert.rejects(sendDailyActivityEmail(fakeDb, { auth, data }, h.deps), { code: "invalid-argument" });
    assert.equal(h.sent.length, 0);
  }
});

test("does not send when department access is denied", async () => {
  const h = harness({ deny: true });
  await assert.rejects(sendDailyActivityEmail(fakeDb, { auth, data: validData }, h.deps), { code: "permission-denied" });
  assert.equal(h.sent.length, 0);
});

test("large CSV is replaced by a note; delivery failures throw", async () => {
  const h = harness();
  const bigCsv = "\"a\"\n" + "\"row\"\n".repeat(50000);
  await sendDailyActivityEmail(fakeDb, { auth, data: { ...validData, csv: bigCsv } }, h.deps);
  assert.doesNotMatch(h.sent[0].text, /"row"/);
  assert.match(h.sent[0].text, /too large/);

  await assert.rejects(
    sendDailyActivityEmail(fakeDb, { auth, data: validData }, harness({ status: "not_configured" }).deps),
    { code: "failed-precondition" }
  );
  await assert.rejects(
    sendDailyActivityEmail(fakeDb, { auth, data: validData }, harness({ status: "failed" }).deps),
    { code: "internal" }
  );
});
