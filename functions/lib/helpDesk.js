/**
 * Help Desk: support requests from any signed-in user. FORGE staff (platform
 * creators) work every department's requests; each department's admins work
 * their own department's requests.
 *
 * Every write goes through these functions (the rules deny client writes), so
 * permissions, numbering, audit entries and notifications live in one place.
 *
 *   helpDeskTickets/{ticketId}                     the request (requester + staff read)
 *   helpDeskTickets/{ticketId}/messages/{id}       replies, internal notes, status/assignment events
 *   helpDeskTickets/{ticketId}/notifications/{id}  each email sent (or that would have been), staff only
 *   platformHelpDesk/settings                      platform notification list (Creator Console)
 *   platformHelpDesk/counter                       request numbers (HD-1001, ...)
 *   helpDeskSettings/{departmentId}                a department's own notification list (its admins)
 *   helpDeskRate/{uid}                             new-request rate limit
 * Attachments: Storage helpDesk/{departmentId}/{uid}/{uploadId}/{fileName}.
 *
 * A new request emails the platform list plus the department's list. Replies
 * and status changes from staff email the requester; a requester's reply emails
 * the assignee (or the lists when unassigned). The forge-demo department never
 * emails anyone (its login is public), and EMAIL_DELIVERY=log (offline demo,
 * staging) logs instead of sending. Either way the notification is recorded.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { isPlatformCreator, isDepartmentActive } = require("./access");
const { isAdminMembership, safeAppOrigin } = require("./invites");
const { isDemoDepartment } = require("./demoGuard");
const { sendTextEmail } = require("./mailer");

const CATEGORIES = {
  bug: "Bug",
  question: "Question",
  account: "Account / access",
  feature: "Feature request",
  data: "Data issue",
  other: "Other",
};
const PRIORITIES = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const STATUSES = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_user: "Waiting on you",
  resolved: "Resolved",
  closed: "Closed",
};
const STAFF_STATUS_LABELS = { ...STATUSES, waiting_on_user: "Waiting on user" };

const LIMITS = {
  subject: 160,
  description: 8000,
  body: 8000,
  attachments: 5,
  attachmentBytes: 10 * 1024 * 1024,
  notifyEmails: 20,
  ticketsPerHour: 10,
};
const DEMO_DEPARTMENT_EMAIL = "demo@forge.demo";
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const nowIso = () => new Date().toISOString();
/** Lines of an email, without runs of blank lines. */
const joinLines = (lines) => lines
  .filter((line) => line != null && line !== false)
  .filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""))
  .join("\n")
  .trim();
const clean = (value, max = 200) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return request.auth;
}

function actorName(auth, membership = {}) {
  return clean(membership.displayName || auth.token?.name || auth.token?.email || "User", 120);
}

async function loadMembership(db, departmentId, uid) {
  if (!departmentId || !uid) return null;
  const snap = await db.doc(`departments/${departmentId}/users/${uid}`).get();
  return snap.exists ? snap.data() || {} : null;
}

/** "platform" (creator), "department" (that department's admin) or "" (not staff). */
async function staffScope(db, departmentId, auth) {
  if (!auth?.uid) return "";
  if (await isPlatformCreator(db, auth)) return "platform";
  const membership = await loadMembership(db, departmentId, auth.uid);
  if (membership && isAdminMembership(membership) && await isDepartmentActive(db, departmentId)) return "department";
  return "";
}

async function loadTicket(db, ticketId) {
  const id = clean(ticketId, 80);
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "ticketId is required.");
  const snap = await db.doc(`helpDeskTickets/${id}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "That request was not found.");
  return { id, ref: snap.ref, ticket: snap.data() || {} };
}

/** The caller's relationship to a ticket; throws when they have none. */
async function ticketAccess(db, ticket, auth) {
  const scope = await staffScope(db, ticket.departmentId, auth);
  const isRequester = ticket.requesterUid === auth.uid;
  if (!scope && !isRequester) throw new HttpsError("permission-denied", "You don't have access to that request.");
  return { scope, isRequester, isStaff: Boolean(scope) };
}

function normalizeEmails(list) {
  const raw = Array.isArray(list) ? list : String(list || "").split(/[\s,;]+/);
  const emails = [...new Set(raw.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  const invalid = emails.filter((email) => !EMAIL_PATTERN.test(email) || email.length > 254);
  if (invalid.length) throw new HttpsError("invalid-argument", `Not a valid email address: ${invalid.join(", ")}`);
  if (emails.length > LIMITS.notifyEmails) {
    throw new HttpsError("invalid-argument", `Add at most ${LIMITS.notifyEmails} addresses.`);
  }
  return emails;
}

/**
 * Only files the caller uploaded to the right folder (see storage.rules): a new
 * request's go in helpDesk/{departmentId}/{uid}/..., a reply's in
 * helpDeskReplies/{ticketId}/{public|internal}/{uid}/..., so the requester can
 * open staff files on public replies but never on internal notes.
 */
function attachmentPrefix({ departmentId, ticketId, internal, uid }) {
  return ticketId
    ? `helpDeskReplies/${ticketId}/${internal ? "internal" : "public"}/${uid}/`
    : `helpDesk/${departmentId}/${uid}/`;
}

function normalizeAttachments(list, folder) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new HttpsError("invalid-argument", "attachments must be a list.");
  if (list.length > LIMITS.attachments) throw new HttpsError("invalid-argument", `Attach at most ${LIMITS.attachments} files.`);
  const prefix = attachmentPrefix(folder);
  // prefix + {uploadId}/{fileName}
  const depth = prefix.split("/").length + 1;
  return list.map((item) => {
    const path = clean(item?.path, 400);
    if (!path.startsWith(prefix) || path.includes("..") || path.includes("//") || path.split("/").length !== depth) {
      throw new HttpsError("invalid-argument", "An attachment is not one of your uploads.");
    }
    const size = Number(item?.size) || 0;
    if (size < 0 || size > LIMITS.attachmentBytes) throw new HttpsError("invalid-argument", "Attachments must be under 10 MB.");
    return {
      path,
      name: clean(item?.name, 160) || path.split("/").pop(),
      size,
      contentType: clean(item?.contentType, 100),
    };
  });
}

/** Browser context captured by the app; kept short and free of query strings. */
function normalizeContext(context = {}) {
  const page = clean(context.page, 120);
  let path = clean(context.path, 300);
  path = path.split("#")[0];
  return {
    page,
    path,
    userAgent: clean(context.userAgent, 400),
    browser: clean(context.browser, 80),
    appVersion: clean(context.appVersion, 80),
    viewport: clean(context.viewport, 20),
    timezone: clean(context.timezone, 60),
    theme: clean(context.theme, 20),
  };
}

function appOrigin() {
  return safeAppOrigin(process.env.RMS_APP_ORIGIN || "");
}

function requesterLink(ticketId, departmentId) {
  return `${appOrigin()}/${encodeURIComponent(departmentId)}?page=help-desk&ticket=${encodeURIComponent(ticketId)}`;
}

function staffLink(ticketId) {
  return `${appOrigin()}/creator-console?helpDeskTicket=${encodeURIComponent(ticketId)}`;
}

async function departmentName(db, departmentId) {
  const [registry, profile] = await Promise.all([
    db.doc(`platformDepartments/${departmentId}`).get(),
    db.doc(`departments/${departmentId}/profile/main`).get(),
  ]);
  const data = { ...(registry.data() || {}), ...(profile.data() || {}) };
  return clean(data.name || data.shortName || departmentId, 160);
}

/** Audit entry in the app's shape (src/lib/auditService.js). No departmentId = platform log. */
async function writeAudit(db, departmentId, entry) {
  const stamp = nowIso();
  const id = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const collection = departmentId ? `departments/${departmentId}/auditLogs` : "platformAuditLogs";
  await db.doc(`${collection}/${id}`).set({
    id,
    module: "Help Desk",
    recordId: "",
    summary: "",
    before: null,
    after: null,
    ...entry,
    created_at: stamp,
    createdAt: stamp,
  });
}

async function nextTicketNumber(db) {
  const ref = db.doc("platformHelpDesk/counter");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = (Number(snap.data()?.next) || 1001);
    tx.set(ref, { next: next + 1, updatedAt: nowIso() }, { merge: true });
    return next;
  });
}

async function checkRateLimit(db, uid) {
  const ref = db.doc(`helpDeskRate/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const windowStart = Number(data.windowStart) || 0;
    const now = Date.now();
    const fresh = now - windowStart > 60 * 60 * 1000;
    const count = fresh ? 0 : Number(data.count) || 0;
    if (count >= LIMITS.ticketsPerHour) {
      throw new HttpsError("resource-exhausted", "You've sent a lot of requests in the last hour. Please wait a little, or add to an existing request.");
    }
    tx.set(ref, { windowStart: fresh ? now : windowStart, count: count + 1 });
  });
}

// ---------------------------------------------------------------- callables

async function createTicket(db, request) {
  const auth = requireAuth(request);
  const data = request.data || {};
  const departmentId = clean(data.departmentId, 80);
  if (!departmentId || departmentId.includes("/")) throw new HttpsError("invalid-argument", "departmentId is required.");

  const creator = await isPlatformCreator(db, auth);
  const membership = await loadMembership(db, departmentId, auth.uid);
  const demoLogin = isDemoDepartment(departmentId) && String(auth.token?.email || "").toLowerCase() === DEMO_DEPARTMENT_EMAIL;
  // Members of a suspended department may still ask for help.
  if (!creator && !demoLogin && membership?.status !== "active") {
    throw new HttpsError("permission-denied", "You can only open requests for your own department.");
  }

  const subject = clean(data.subject, LIMITS.subject);
  const description = clean(data.description, LIMITS.description);
  const category = clean(data.category, 20);
  const priority = clean(data.priority || "normal", 20);
  if (subject.length < 3) throw new HttpsError("invalid-argument", "Add a short subject.");
  if (!description) throw new HttpsError("invalid-argument", "Describe what you need help with.");
  if (!CATEGORIES[category]) throw new HttpsError("invalid-argument", "Choose a category.");
  if (!PRIORITIES[priority]) throw new HttpsError("invalid-argument", "Choose a priority.");
  const attachments = normalizeAttachments(data.attachments, { departmentId, uid: auth.uid });

  if (!creator) await checkRateLimit(db, auth.uid);

  const number = await nextTicketNumber(db);
  const ref = db.collection("helpDeskTickets").doc();
  const stamp = nowIso();
  const requesterName = actorName(auth, membership || {});
  const ticket = {
    id: ref.id,
    number,
    numberLabel: `HD-${number}`,
    subject,
    description,
    category,
    priority,
    status: "open",
    departmentId,
    departmentName: await departmentName(db, departmentId),
    isDemo: isDemoDepartment(departmentId),
    requesterUid: auth.uid,
    requesterName,
    requesterEmail: clean(auth.token?.email, 254).toLowerCase(),
    assigneeUid: "",
    assigneeName: "",
    attachments,
    context: normalizeContext(data.context || {}),
    messageCount: 0,
    lastReplyAt: "",
    lastReplyBy: "",
    createdAt: stamp,
    updatedAt: stamp,
    resolvedAt: "",
    closedAt: "",
  };
  await ref.set(ticket);
  await writeAudit(db, departmentId, {
    action: "helpdesk.ticket.created",
    recordId: ref.id,
    summary: `Opened help request ${ticket.numberLabel}: ${subject}`,
    actorUid: auth.uid,
    actorName: requesterName,
    after: { status: "open", category, priority },
  });
  return { ticketId: ref.id, number, numberLabel: ticket.numberLabel };
}

function statusPatch(status, stamp) {
  const patch = { status };
  if (status === "resolved") patch.resolvedAt = stamp;
  if (status === "closed") patch.closedAt = stamp;
  if (["open", "in_progress", "waiting_on_user"].includes(status)) {
    patch.resolvedAt = "";
    patch.closedAt = "";
  }
  return patch;
}

async function addMessage(db, request) {
  const auth = requireAuth(request);
  const data = request.data || {};
  const { id, ref, ticket } = await loadTicket(db, data.ticketId);
  const access = await ticketAccess(db, ticket, auth);
  const body = clean(data.body, LIMITS.body);
  if (!body) throw new HttpsError("invalid-argument", "Write a message first.");
  const internal = data.internal === true;
  if (internal && !access.isStaff) throw new HttpsError("permission-denied", "Only help desk staff can add internal notes.");

  // A department admin who opened the request is its requester (FORGE staff work it);
  // their own reply reopens a resolved or waiting request, and a closed one stays closed.
  const asStaff = access.isStaff && (internal || !access.isRequester || access.scope === "platform");
  if (!asStaff && ticket.status === "closed") {
    throw new HttpsError("failed-precondition", "This request is closed. Open a new request if you still need help.");
  }
  let nextStatus = "";
  if (asStaff && data.status != null && data.status !== "") {
    nextStatus = clean(data.status, 20);
    if (!STATUSES[nextStatus]) throw new HttpsError("invalid-argument", "Unknown status.");
  } else if (!asStaff && ["waiting_on_user", "resolved"].includes(ticket.status)) {
    nextStatus = "open";
  }
  if (nextStatus === ticket.status) nextStatus = "";

  const membership = await loadMembership(db, ticket.departmentId, auth.uid);
  const authorName = access.scope === "platform" && asStaff ? clean(auth.token?.name || "FORGE Support", 120) : actorName(auth, membership || {});
  const attachments = normalizeAttachments(data.attachments, { ticketId: id, internal, uid: auth.uid });
  const stamp = nowIso();
  const messageRef = ref.collection("messages").doc();
  const message = {
    id: messageRef.id,
    kind: internal ? "note" : "reply",
    visibility: internal ? "internal" : "public",
    body,
    authorUid: auth.uid,
    authorName,
    authorRole: asStaff ? "staff" : "requester",
    staffScope: asStaff ? access.scope : "",
    attachments,
    createdAt: stamp,
  };
  if (nextStatus) message.statusChange = { from: ticket.status, to: nextStatus };

  const patch = { updatedAt: stamp, messageCount: (Number(ticket.messageCount) || 0) + 1 };
  if (!internal) {
    patch.lastReplyAt = stamp;
    patch.lastReplyBy = message.authorRole;
  }
  if (nextStatus) Object.assign(patch, statusPatch(nextStatus, stamp));
  // A first staff reply on a new request moves it along.
  if (!nextStatus && asStaff && !internal && ticket.status === "open") {
    Object.assign(patch, statusPatch("in_progress", stamp));
    message.statusChange = { from: "open", to: "in_progress" };
  }

  const batch = db.batch();
  batch.set(messageRef, message);
  batch.update(ref, patch);
  await batch.commit();
  await writeAudit(db, ticket.departmentId, {
    action: internal ? "helpdesk.ticket.note" : "helpdesk.ticket.replied",
    recordId: id,
    summary: `${internal ? "Internal note on" : "Replied to"} ${ticket.numberLabel}`,
    actorUid: auth.uid,
    actorName: authorName,
    before: message.statusChange ? { status: message.statusChange.from } : null,
    after: message.statusChange ? { status: message.statusChange.to } : null,
  });
  return { messageId: messageRef.id, status: patch.status || ticket.status };
}

async function assigneeOptions(db, ticket, callerScope) {
  const options = [];
  if (callerScope === "platform") {
    const creators = await db.collection("platformCreators").where("status", "==", "active").get();
    for (const doc of creators.docs) {
      const data = doc.data() || {};
      // The name is stored on the ticket (requesters can read it), so never an email address.
      options.push({ uid: doc.id, name: clean(data.displayName || data.name || "FORGE support", 120), detail: clean(data.email, 254), scope: "platform" });
    }
  }
  const members = await db.collection(`departments/${ticket.departmentId}/users`).where("status", "==", "active").get();
  for (const doc of members.docs) {
    const data = doc.data() || {};
    if (!isAdminMembership(data) || options.some((item) => item.uid === doc.id)) continue;
    options.push({ uid: doc.id, name: clean(data.displayName || "Department admin", 120), detail: clean(data.email, 254), scope: "department" });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

async function listAssignees(db, request) {
  const auth = requireAuth(request);
  const { ticket } = await loadTicket(db, request.data?.ticketId);
  const access = await ticketAccess(db, ticket, auth);
  if (!access.isStaff) throw new HttpsError("permission-denied", "Only help desk staff can assign requests.");
  return { assignees: await assigneeOptions(db, ticket, access.scope) };
}

async function updateTicket(db, request) {
  const auth = requireAuth(request);
  const data = request.data || {};
  const { id, ref, ticket } = await loadTicket(db, data.ticketId);
  const access = await ticketAccess(db, ticket, auth);
  const stamp = nowIso();
  const patch = {};
  const events = [];

  if (data.status != null && data.status !== ticket.status) {
    const status = clean(data.status, 20);
    if (!STATUSES[status]) throw new HttpsError("invalid-argument", "Unknown status.");
    // Requesters may close their own request or reopen a resolved/closed one.
    const requesterAllowed = access.isRequester && (status === "closed" || (status === "open" && ["resolved", "closed"].includes(ticket.status)));
    if (!access.isStaff && !requesterAllowed) throw new HttpsError("permission-denied", "Only help desk staff can change that.");
    Object.assign(patch, statusPatch(status, stamp));
    events.push({ kind: "status", visibility: "public", statusChange: { from: ticket.status, to: status } });
  }

  const staffOnly = ["priority", "category", "assigneeUid"].filter((key) => data[key] != null);
  if (staffOnly.length && !access.isStaff) throw new HttpsError("permission-denied", "Only help desk staff can change that.");

  if (data.priority != null && data.priority !== ticket.priority) {
    if (!PRIORITIES[data.priority]) throw new HttpsError("invalid-argument", "Unknown priority.");
    patch.priority = data.priority;
    events.push({ kind: "update", visibility: "internal", change: { field: "priority", from: ticket.priority, to: data.priority } });
  }
  if (data.category != null && data.category !== ticket.category) {
    if (!CATEGORIES[data.category]) throw new HttpsError("invalid-argument", "Unknown category.");
    patch.category = data.category;
    events.push({ kind: "update", visibility: "internal", change: { field: "category", from: ticket.category, to: data.category } });
  }
  if (data.assigneeUid != null && data.assigneeUid !== ticket.assigneeUid) {
    const assigneeUid = clean(data.assigneeUid, 128);
    let assigneeName = "";
    if (assigneeUid) {
      const option = (await assigneeOptions(db, ticket, access.scope)).find((item) => item.uid === assigneeUid);
      if (!option) throw new HttpsError("invalid-argument", "That person can't be assigned to this request.");
      assigneeName = option.name;
    }
    patch.assigneeUid = assigneeUid;
    patch.assigneeName = assigneeName;
    events.push({ kind: "assignment", visibility: "internal", assignment: { fromUid: ticket.assigneeUid || "", fromName: ticket.assigneeName || "", toUid: assigneeUid, toName: assigneeName } });
  }

  if (!events.length) return { changed: false, status: ticket.status };

  const membership = await loadMembership(db, ticket.departmentId, auth.uid);
  const authorName = access.scope === "platform" ? clean(auth.token?.name || "FORGE Support", 120) : actorName(auth, membership || {});
  const batch = db.batch();
  for (const event of events) {
    const messageRef = ref.collection("messages").doc();
    batch.set(messageRef, {
      id: messageRef.id,
      body: "",
      attachments: [],
      authorUid: auth.uid,
      authorName,
      authorRole: access.isStaff ? "staff" : "requester",
      staffScope: access.scope,
      createdAt: stamp,
      ...event,
    });
  }
  batch.update(ref, { ...patch, updatedAt: stamp });
  await batch.commit();

  const before = {};
  const after = {};
  for (const key of Object.keys(patch)) {
    if (["resolvedAt", "closedAt", "assigneeName"].includes(key)) continue;
    before[key] = ticket[key] ?? "";
    after[key] = patch[key];
  }
  const action = patch.status ? "helpdesk.ticket.status" : (patch.assigneeUid != null ? "helpdesk.ticket.assigned" : "helpdesk.ticket.updated");
  const summaryParts = [];
  if (patch.status) summaryParts.push(`status ${STAFF_STATUS_LABELS[ticket.status] || ticket.status} → ${STAFF_STATUS_LABELS[patch.status]}`);
  if (patch.assigneeUid != null) summaryParts.push(patch.assigneeUid ? `assigned to ${patch.assigneeName}` : "unassigned");
  if (patch.priority) summaryParts.push(`priority ${PRIORITIES[patch.priority]}`);
  if (patch.category) summaryParts.push(`category ${CATEGORIES[patch.category]}`);
  await writeAudit(db, ticket.departmentId, {
    action,
    recordId: id,
    summary: `${ticket.numberLabel}: ${summaryParts.join(", ")}`,
    actorUid: auth.uid,
    actorName: authorName,
    before,
    after,
  });
  return { changed: true, status: patch.status || ticket.status };
}

function settingsRef(db, scope) {
  return scope === "platform" ? db.doc("platformHelpDesk/settings") : db.doc(`helpDeskSettings/${scope}`);
}

async function assertSettingsAccess(db, scope, auth) {
  if (!scope || scope.includes("/")) throw new HttpsError("invalid-argument", "scope is required.");
  if (scope === "platform") {
    if (!(await isPlatformCreator(db, auth))) throw new HttpsError("permission-denied", "Platform creator access is required.");
    return;
  }
  if (!(await staffScope(db, scope, auth))) throw new HttpsError("permission-denied", "Department administrator access is required.");
}

async function getSettings(db, request) {
  const auth = requireAuth(request);
  const scope = clean(request.data?.scope, 80);
  await assertSettingsAccess(db, scope, auth);
  const data = (await settingsRef(db, scope).get()).data() || {};
  return {
    scope,
    notifyEmails: Array.isArray(data.notifyEmails) ? data.notifyEmails : [],
    updatedAt: data.updatedAt || "",
    updatedByName: data.updatedByName || "",
  };
}

async function saveSettings(db, request) {
  const auth = requireAuth(request);
  const scope = clean(request.data?.scope, 80);
  await assertSettingsAccess(db, scope, auth);
  const notifyEmails = normalizeEmails(request.data?.notifyEmails);
  const ref = settingsRef(db, scope);
  const before = (await ref.get()).data() || {};
  const membership = scope === "platform" ? null : await loadMembership(db, scope, auth.uid);
  const name = actorName(auth, membership || {});
  const stamp = nowIso();
  await ref.set({ notifyEmails, updatedAt: stamp, updatedByUid: auth.uid, updatedByName: name }, { merge: true });
  await writeAudit(db, scope === "platform" ? "" : scope, {
    action: "helpdesk.settings.updated",
    recordId: scope === "platform" ? "platformHelpDesk/settings" : `helpDeskSettings/${scope}`,
    summary: `Help desk notification list: ${notifyEmails.length} address${notifyEmails.length === 1 ? "" : "es"}`,
    actorUid: auth.uid,
    actorName: name,
    before: { notifyEmails: before.notifyEmails || [] },
    after: { notifyEmails },
  });
  return { scope, notifyEmails, updatedAt: stamp, updatedByName: name };
}

// ---------------------------------------------------------------- notifications

async function designatedRecipients(db, departmentId) {
  const [platform, department] = await Promise.all([
    db.doc("platformHelpDesk/settings").get(),
    db.doc(`helpDeskSettings/${departmentId}`).get(),
  ]);
  const list = [...(platform.data()?.notifyEmails || []), ...(department.data()?.notifyEmails || [])];
  return [...new Set(list.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))];
}

async function userEmail(db, departmentId, uid) {
  if (!uid) return "";
  const [member, creator] = await Promise.all([
    db.doc(`departments/${departmentId}/users/${uid}`).get(),
    db.doc(`platformCreators/${uid}`).get(),
  ]);
  return String(member.data()?.email || creator.data()?.email || "").trim().toLowerCase();
}

function contextLines(context = {}) {
  return [
    context.page ? `Page: ${context.page}${context.path ? ` (${context.path})` : ""}` : "",
    context.browser ? `Browser: ${context.browser}` : "",
    context.appVersion ? `App version: ${context.appVersion}` : "",
    context.viewport ? `Screen: ${context.viewport}` : "",
    context.timezone ? `Time zone: ${context.timezone}` : "",
  ].filter(Boolean);
}

function newTicketEmail(ticket) {
  const urgent = ["high", "urgent"].includes(ticket.priority) ? ` [${PRIORITIES[ticket.priority]}]` : "";
  const subject = `[FORGE Help Desk] ${ticket.numberLabel}${urgent} ${CATEGORIES[ticket.category] || "Request"}: ${ticket.subject}`;
  const text = joinLines([
    `New help request ${ticket.numberLabel} from ${ticket.departmentName || ticket.departmentId}.`,
    "",
    `Subject: ${ticket.subject}`,
    `Category: ${CATEGORIES[ticket.category] || ticket.category}`,
    `Priority: ${PRIORITIES[ticket.priority] || ticket.priority}`,
    `From: ${ticket.requesterName}${ticket.requesterEmail ? ` <${ticket.requesterEmail}>` : ""}`,
    `Department: ${ticket.departmentName || ticket.departmentId} (${ticket.departmentId})`,
    "",
    ticket.description,
    "",
    ...(ticket.attachments?.length ? [`Attachments: ${ticket.attachments.map((file) => file.name).join(", ")}`, ""] : []),
    ...contextLines(ticket.context),
    "",
    `FORGE support: ${staffLink(ticket.id)}`,
    `Department admins: ${requesterLink(ticket.id, ticket.departmentId)}`,
  ]);
  return { subject, text };
}

function requesterEmailFor(ticket, message) {
  const ticketLink = requesterLink(ticket.id, ticket.departmentId);
  const change = message.statusChange;
  const statusLine = change ? `Status: ${STATUSES[change.to] || change.to}` : "";
  if (message.kind === "status") {
    return {
      subject: `[${ticket.numberLabel}] Your help request is now ${STATUSES[change.to] || change.to}`,
      text: joinLines([
        `Your help request "${ticket.subject}" (${ticket.numberLabel}) changed from ${STATUSES[change.from] || change.from} to ${STATUSES[change.to] || change.to}.`,
        "",
        change.to === "resolved" ? "If it isn't fixed, reply in FORGE Responder and it will reopen." : "",
        `View it: ${ticketLink}`,
      ]),
    };
  }
  return {
    subject: `Re: [${ticket.numberLabel}] ${ticket.subject}`,
    text: joinLines([
      `${message.authorName} replied to your help request ${ticket.numberLabel}:`,
      "",
      message.body,
      "",
      statusLine,
      `Reply in FORGE Responder: ${ticketLink}`,
      "(Replies to this email are not monitored.)",
    ]),
  };
}

function staffReplyEmail(ticket, message) {
  return {
    subject: `Re: [FORGE Help Desk] ${ticket.numberLabel} ${ticket.subject}`,
    text: joinLines([
      `${message.authorName} (${ticket.departmentName || ticket.departmentId}) replied to ${ticket.numberLabel}:`,
      "",
      message.body,
      "",
      message.statusChange ? `The request reopened (${STAFF_STATUS_LABELS[message.statusChange.from]} → ${STAFF_STATUS_LABELS[message.statusChange.to]}).` : "",
      `Open the request: ${staffLink(ticket.id)}`,
    ]),
  };
}

function assignmentEmail(ticket, message) {
  return {
    subject: `[FORGE Help Desk] ${ticket.numberLabel} assigned to you`,
    text: joinLines([
      `${message.authorName} assigned help request ${ticket.numberLabel} to you.`,
      "",
      `Subject: ${ticket.subject}`,
      `Department: ${ticket.departmentName || ticket.departmentId}`,
      `Priority: ${PRIORITIES[ticket.priority] || ticket.priority}`,
      "",
      `Open the request: ${staffLink(ticket.id)}`,
    ]),
  };
}

/**
 * Send (or, for the demo department, only record) one notification and keep a
 * copy under the ticket. The doc id makes a retried trigger a no-op.
 */
async function deliver(db, ticketId, notificationId, { kind, to = [], replyTo = "", subject, text, departmentId }, send) {
  const ref = db.doc(`helpDeskTickets/${ticketId}/notifications/${notificationId}`);
  try {
    await ref.create({ id: notificationId, kind, to, subject, text, status: "sending", createdAt: nowIso() });
  } catch (error) {
    if (error?.code === 6 || /already exists/i.test(String(error?.message || ""))) return { skipped: true };
    throw error;
  }
  let status;
  if (!to.length) status = "no_recipient";
  else if (isDemoDepartment(departmentId)) {
    console.log("[demo: email not sent]", JSON.stringify({ to, subject, text: String(text || "").slice(0, 2000) }));
    status = "demo_not_sent";
  } else {
    status = await send({ to, replyTo, subject, text });
  }
  await ref.update({ status, finishedAt: nowIso() });
  return { status, to, subject, text };
}

async function handleTicketCreated(db, event, { send = sendTextEmail } = {}) {
  const ticketId = event.params.ticketId;
  const ticket = event.data?.data?.();
  if (!ticket) return null;
  const to = await designatedRecipients(db, ticket.departmentId);
  const { subject, text } = newTicketEmail({ ...ticket, id: ticketId });
  return deliver(db, ticketId, "new-ticket", {
    kind: "new_ticket", to, replyTo: ticket.requesterEmail || "", subject, text, departmentId: ticket.departmentId,
  }, send);
}

async function handleMessageCreated(db, event, { send = sendTextEmail } = {}) {
  const { ticketId, messageId } = event.params;
  const message = event.data?.data?.();
  if (!message) return null;
  const ticketSnap = await db.doc(`helpDeskTickets/${ticketId}`).get();
  if (!ticketSnap.exists) return null;
  const ticket = { ...ticketSnap.data(), id: ticketId };
  const base = { departmentId: ticket.departmentId };

  if (message.visibility === "public" && message.authorRole === "staff" && ["reply", "status"].includes(message.kind)) {
    if (message.authorUid === ticket.requesterUid) return null;
    const to = ticket.requesterEmail ? [ticket.requesterEmail] : [];
    return deliver(db, ticketId, `msg-${messageId}`, { ...base, kind: `requester_${message.kind}`, to, ...requesterEmailFor(ticket, message) }, send);
  }
  if (message.visibility === "public" && message.authorRole === "requester" && message.kind === "reply") {
    const assigneeEmail = await userEmail(db, ticket.departmentId, ticket.assigneeUid);
    const to = assigneeEmail ? [assigneeEmail] : await designatedRecipients(db, ticket.departmentId);
    return deliver(db, ticketId, `msg-${messageId}`, {
      ...base, kind: "staff_reply", to, replyTo: ticket.requesterEmail || "", ...staffReplyEmail(ticket, message),
    }, send);
  }
  if (message.kind === "assignment" && message.assignment?.toUid && message.assignment.toUid !== message.authorUid) {
    const email = await userEmail(db, ticket.departmentId, message.assignment.toUid);
    return deliver(db, ticketId, `msg-${messageId}`, { ...base, kind: "assigned", to: email ? [email] : [], ...assignmentEmail(ticket, message) }, send);
  }
  return null;
}

module.exports = {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  LIMITS,
  addMessage,
  createTicket,
  getSettings,
  handleMessageCreated,
  handleTicketCreated,
  listAssignees,
  normalizeEmails,
  saveSettings,
  staffScope,
  updateTicket,
};
