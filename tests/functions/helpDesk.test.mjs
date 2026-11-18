// Help Desk callables and notification triggers against the Firestore emulator.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const helpDesk = require("./lib/helpDesk.js");

const PROJECT_ID = "demo-forge-rms";
let db;

const req = (uid, email, data = {}, name = "") => ({ auth: { uid, token: { email, name } }, data });
const creator = (data) => req("creator-1", "creator@forge.test", data, "Pat Support");
const adminA = (data) => req("admin-a", "chief@a.gov", data);
const memberA = (data) => req("member-a", "ff@a.gov", data);
const member2A = (data) => req("member2-a", "ff2@a.gov", data);
const adminB = (data) => req("admin-b", "chief@b.gov", data);

const NEW_TICKET = {
  departmentId: "dept-a",
  subject: "Can't save a time card",
  category: "bug",
  priority: "high",
  description: "Saving shows an error.",
  context: { page: "Time Card", path: "/dept-a?page=time-card", browser: "Chrome 142", appVersion: "0.1.0", userAgent: "Mozilla/5.0" },
};

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });
}

/** Capture what the triggers would send. */
function fakeSender() {
  const sent = [];
  const send = async (message) => {
    sent.push(message);
    return "sent";
  };
  return { sent, send };
}

async function fireTicketCreated(ticketId, send) {
  const snap = await db.doc(`helpDeskTickets/${ticketId}`).get();
  return helpDesk.handleTicketCreated(db, { params: { ticketId }, data: snap }, { send });
}

async function fireMessages(ticketId, send) {
  const snaps = await db.collection(`helpDeskTickets/${ticketId}/messages`).orderBy("createdAt").get();
  const results = [];
  for (const snap of snaps.docs) {
    results.push(await helpDesk.handleMessageCreated(db, { params: { ticketId, messageId: snap.id }, data: snap }, { send }));
  }
  return results;
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
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await db.doc("platformCreators/creator-1").set({ status: "active", email: "creator@forge.test" });
  await db.doc("platformDepartments/dept-a").set({ name: "Alpha Fire" });
  await db.doc("departments/dept-a/users/admin-a").set({ uid: "admin-a", status: "active", role: "department_admin", roleIds: ["fireChief"], displayName: "Chief Alpha", email: "chief@a.gov" });
  await db.doc("departments/dept-a/users/member-a").set({ uid: "member-a", status: "active", role: "firefighter", roleIds: ["firefighter"], displayName: "FF Able", email: "ff@a.gov" });
  await db.doc("departments/dept-a/users/member2-a").set({ uid: "member2-a", status: "active", role: "firefighter", roleIds: ["firefighter"] });
  await db.doc("departments/dept-b/users/admin-b").set({ uid: "admin-b", status: "active", roleIds: ["itAdmin"], email: "chief@b.gov" });
  await db.doc("departments/forge-demo/users/demo-user").set({ uid: "demo-user", status: "active", roleIds: ["fireChief"], displayName: "Chief A. Sample" });
  await db.doc("platformHelpDesk/settings").set({ notifyEmails: ["support@forge.test"] });
  await db.doc("helpDeskSettings/dept-a").set({ notifyEmails: ["it@a.gov", "SUPPORT@forge.test"] });
});

describe("opening a request", () => {
  it("a member opens a numbered request with context, and it is audit-logged", async () => {
    const { ticketId, numberLabel } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    assert.equal(numberLabel, "HD-1001");
    const ticket = (await db.doc(`helpDeskTickets/${ticketId}`).get()).data();
    assert.equal(ticket.status, "open");
    assert.equal(ticket.requesterUid, "member-a");
    assert.equal(ticket.requesterName, "FF Able");
    assert.equal(ticket.requesterEmail, "ff@a.gov");
    assert.equal(ticket.departmentName, "Alpha Fire");
    assert.equal(ticket.context.page, "Time Card");
    assert.equal(ticket.context.browser, "Chrome 142");
    const logs = await db.collection("departments/dept-a/auditLogs").where("action", "==", "helpdesk.ticket.created").get();
    assert.equal(logs.size, 1);
    assert.equal(logs.docs[0].data().recordId, ticketId);
    const second = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    assert.equal(second.numberLabel, "HD-1002");
  });

  it("rejects other departments, bad fields and other people's uploads", async () => {
    await rejects(helpDesk.createTicket(db, memberA({ ...NEW_TICKET, departmentId: "dept-b" })), "permission-denied");
    await rejects(helpDesk.createTicket(db, { data: NEW_TICKET }), "unauthenticated");
    await rejects(helpDesk.createTicket(db, memberA({ ...NEW_TICKET, category: "nope" })), "invalid-argument");
    await rejects(helpDesk.createTicket(db, memberA({ ...NEW_TICKET, subject: "" })), "invalid-argument");
    await rejects(helpDesk.createTicket(db, memberA({ ...NEW_TICKET, attachments: [{ path: "helpDesk/dept-a/member2-a/u1/x.png", name: "x.png", size: 10 }] })), "invalid-argument");
    await rejects(helpDesk.createTicket(db, memberA({ ...NEW_TICKET, attachments: [{ path: "departments/dept-a/secret.pdf", name: "x", size: 10 }] })), "invalid-argument");
  });

  it("keeps the caller's own attachments", async () => {
    const attachments = [{ path: "helpDesk/dept-a/member-a/u1/error.png", name: "error.png", size: 2048, contentType: "image/png" }];
    const { ticketId } = await helpDesk.createTicket(db, memberA({ ...NEW_TICKET, attachments }));
    const ticket = (await db.doc(`helpDeskTickets/${ticketId}`).get()).data();
    assert.deepEqual(ticket.attachments, attachments);
  });

  it("limits how many requests one person opens per hour", async () => {
    await db.doc("helpDeskRate/member-a").set({ windowStart: Date.now(), count: helpDesk.LIMITS.ticketsPerHour });
    await rejects(helpDesk.createTicket(db, memberA(NEW_TICKET)), "resource-exhausted");
  });
});

describe("new request notification", () => {
  it("emails the platform list plus the department's list, once", async () => {
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    const { sent, send } = fakeSender();
    const result = await fireTicketCreated(ticketId, send);
    assert.equal(result.status, "sent");
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ["support@forge.test", "it@a.gov"]);
    assert.equal(sent[0].replyTo, "ff@a.gov");
    assert.match(sent[0].subject, /HD-1001 \[High\] Bug: Can't save a time card/);
    assert.match(sent[0].text, /Saving shows an error\./);
    assert.match(sent[0].text, /Page: Time Card/);
    assert.match(sent[0].text, /App version: 0\.1\.0/);
    const record = (await db.doc(`helpDeskTickets/${ticketId}/notifications/new-ticket`).get()).data();
    assert.equal(record.status, "sent");
    assert.deepEqual(record.to, ["support@forge.test", "it@a.gov"]);
    // A retried trigger does not send again.
    assert.deepEqual(await fireTicketCreated(ticketId, send), { skipped: true });
    assert.equal(sent.length, 1);
  });

  it("records no_recipient when nobody is designated", async () => {
    await db.doc("platformHelpDesk/settings").delete();
    await db.doc("helpDeskSettings/dept-a").delete();
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    const { sent, send } = fakeSender();
    assert.equal((await fireTicketCreated(ticketId, send)).status, "no_recipient");
    assert.equal(sent.length, 0);
  });

  it("the demo department never emails anyone but keeps what would have been sent", async () => {
    const { ticketId } = await helpDesk.createTicket(db, req("demo-user", "demo@forge.demo", { ...NEW_TICKET, departmentId: "forge-demo" }));
    const { sent, send } = fakeSender();
    const result = await fireTicketCreated(ticketId, send);
    assert.equal(result.status, "demo_not_sent");
    assert.equal(sent.length, 0);
    const record = (await db.doc(`helpDeskTickets/${ticketId}/notifications/new-ticket`).get()).data();
    assert.deepEqual(record.to, ["support@forge.test"]);
    assert.match(record.text, /New help request HD-1001/);
  });

  it("EMAIL_DELIVERY=log (offline demo, staging) logs instead of sending", async () => {
    const previous = process.env.EMAIL_DELIVERY;
    process.env.EMAIL_DELIVERY = "log";
    try {
      const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
      const snap = await db.doc(`helpDeskTickets/${ticketId}`).get();
      const result = await helpDesk.handleTicketCreated(db, { params: { ticketId }, data: snap });
      assert.equal(result.status, "logged");
    } finally {
      if (previous === undefined) delete process.env.EMAIL_DELIVERY;
      else process.env.EMAIL_DELIVERY = previous;
    }
  });
});

describe("working a request", () => {
  it("a staff reply moves it along and emails the requester; internal notes stay internal", async () => {
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    await helpDesk.addMessage(db, creator({ ticketId, body: "Looking into it now." }));
    await helpDesk.addMessage(db, creator({ ticketId, body: "Customer is on an old build.", internal: true }));
    const ticket = (await db.doc(`helpDeskTickets/${ticketId}`).get()).data();
    assert.equal(ticket.status, "in_progress");
    assert.equal(ticket.lastReplyBy, "staff");

    const { sent, send } = fakeSender();
    await fireMessages(ticketId, send);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ["ff@a.gov"]);
    assert.match(sent[0].subject, /Re: \[HD-1001\]/);
    assert.match(sent[0].text, /Looking into it now\./);
    assert.match(sent[0].text, /Status: In progress/);
    assert.doesNotMatch(sent[0].text, /old build/);
    const audit = await db.collection("departments/dept-a/auditLogs").where("action", "==", "helpdesk.ticket.note").get();
    assert.equal(audit.size, 1);
  });

  it("status changes notify the requester and are audit-logged", async () => {
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    await helpDesk.updateTicket(db, adminA({ ticketId, status: "resolved" }));
    const ticket = (await db.doc(`helpDeskTickets/${ticketId}`).get()).data();
    assert.equal(ticket.status, "resolved");
    assert.ok(ticket.resolvedAt);
    const { sent, send } = fakeSender();
    await fireMessages(ticketId, send);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /now Resolved/);
    const audit = (await db.collection("departments/dept-a/auditLogs").where("action", "==", "helpdesk.ticket.status").get()).docs[0].data();
    assert.deepEqual(audit.before, { status: "open" });
    assert.deepEqual(audit.after, { status: "resolved" });
  });

  it("a requester's reply reopens a resolved request and emails the assignee", async () => {
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    const { assignees } = await helpDesk.listAssignees(db, creator({ ticketId }));
    assert.deepEqual(assignees.map((item) => item.uid).sort(), ["admin-a", "creator-1"]);
    // Stored on the ticket, which requesters read: a name, never an email address.
    assert.equal(assignees.find((item) => item.uid === "creator-1").name, "FORGE support");
    await helpDesk.updateTicket(db, creator({ ticketId, assigneeUid: "admin-a", status: "resolved" }));
    await helpDesk.addMessage(db, memberA({ ticketId, body: "Still broken." }));
    const ticket = (await db.doc(`helpDeskTickets/${ticketId}`).get()).data();
    assert.equal(ticket.status, "open");
    assert.equal(ticket.assigneeName, "Chief Alpha");

    const { sent, send } = fakeSender();
    await fireMessages(ticketId, send);
    const toAssignee = sent.filter((mail) => mail.to.includes("chief@a.gov"));
    assert.equal(toAssignee.length, 2, "assignment + requester reply");
    assert.ok(toAssignee.some((mail) => /Still broken\./.test(mail.text)));
    assert.ok(sent.some((mail) => mail.to.includes("ff@a.gov") && /now Resolved/.test(mail.subject)));
  });

  it("department admins can only assign their own admins", async () => {
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    const { assignees } = await helpDesk.listAssignees(db, adminA({ ticketId }));
    assert.deepEqual(assignees.map((item) => item.uid), ["admin-a"]);
    await rejects(helpDesk.updateTicket(db, adminA({ ticketId, assigneeUid: "creator-1" })), "invalid-argument");
  });

  it("requesters can close or reopen their own request, nothing else", async () => {
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    await rejects(helpDesk.updateTicket(db, memberA({ ticketId, status: "in_progress" })), "permission-denied");
    await rejects(helpDesk.updateTicket(db, memberA({ ticketId, priority: "urgent" })), "permission-denied");
    await rejects(helpDesk.addMessage(db, memberA({ ticketId, body: "psst", internal: true })), "permission-denied");
    await helpDesk.updateTicket(db, memberA({ ticketId, status: "closed" }));
    await rejects(helpDesk.addMessage(db, memberA({ ticketId, body: "hello?" })), "failed-precondition");
    await helpDesk.updateTicket(db, memberA({ ticketId, status: "open" }));
    assert.equal((await db.doc(`helpDeskTickets/${ticketId}`).get()).data().status, "open");
  });

  it("reply attachments must be the caller's own, in the folder matching the reply", async () => {
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    const file = (path) => [{ path, name: "x.png", size: 10, contentType: "image/png" }];
    await helpDesk.addMessage(db, memberA({ ticketId, body: "screenshot", attachments: file(`helpDeskReplies/${ticketId}/public/member-a/u1/x.png`) }));
    await helpDesk.addMessage(db, adminA({ ticketId, body: "log", internal: true, attachments: file(`helpDeskReplies/${ticketId}/internal/admin-a/u2/x.png`) }));
    await rejects(helpDesk.addMessage(db, adminA({ ticketId, body: "oops", attachments: file(`helpDeskReplies/${ticketId}/internal/admin-a/u2/x.png`) })), "invalid-argument");
    await rejects(helpDesk.addMessage(db, memberA({ ticketId, body: "x", attachments: file(`helpDeskReplies/${ticketId}/public/admin-a/u2/x.png`) })), "invalid-argument");
    await rejects(helpDesk.addMessage(db, memberA({ ticketId, body: "x", attachments: file(`helpDeskReplies/other/public/member-a/u2/x.png`) })), "invalid-argument");
  });

  it("nobody else can see or touch a request", async () => {
    const { ticketId } = await helpDesk.createTicket(db, memberA(NEW_TICKET));
    await rejects(helpDesk.addMessage(db, member2A({ ticketId, body: "hi" })), "permission-denied");
    await rejects(helpDesk.addMessage(db, adminB({ ticketId, body: "hi" })), "permission-denied");
    await rejects(helpDesk.updateTicket(db, adminB({ ticketId, status: "closed" })), "permission-denied");
    await rejects(helpDesk.listAssignees(db, memberA({ ticketId })), "permission-denied");
  });
});

describe("notification lists", () => {
  it("creators keep the platform list; it is validated and audit-logged", async () => {
    const saved = await helpDesk.saveSettings(db, creator({ scope: "platform", notifyEmails: ["Help@Forge.test", "help@forge.test", "ops@forge.test"] }));
    assert.deepEqual(saved.notifyEmails, ["help@forge.test", "ops@forge.test"]);
    assert.deepEqual((await helpDesk.getSettings(db, creator({ scope: "platform" }))).notifyEmails, ["help@forge.test", "ops@forge.test"]);
    await rejects(helpDesk.saveSettings(db, creator({ scope: "platform", notifyEmails: ["not-an-email"] })), "invalid-argument");
    await rejects(helpDesk.saveSettings(db, adminA({ scope: "platform", notifyEmails: [] })), "permission-denied");
    const logs = await db.collection("platformAuditLogs").where("action", "==", "helpdesk.settings.updated").get();
    assert.equal(logs.size, 1);
  });

  it("department admins keep their own department's list only", async () => {
    await helpDesk.saveSettings(db, adminA({ scope: "dept-a", notifyEmails: ["it@a.gov"] }));
    await rejects(helpDesk.saveSettings(db, adminB({ scope: "dept-a", notifyEmails: [] })), "permission-denied");
    await rejects(helpDesk.getSettings(db, memberA({ scope: "dept-a" })), "permission-denied");
    const logs = await db.collection("departments/dept-a/auditLogs").where("action", "==", "helpdesk.settings.updated").get();
    assert.equal(logs.size, 1);
  });
});
