import { createRecord, listRecords, updateRecord } from "./firestoreService.js";
import { PLATFORM_SCOPE_ID } from "./tenantPaths.js";

export const INTERNAL_EMAIL_COLLECTION = "internalEmails";

export function resolveEmailBoardScopeId(departmentId) {
  return departmentId || PLATFORM_SCOPE_ID;
}

export function buildRecipientLabel(recipients = "all") {
  if (recipients === "all") return "All personnel";
  if (recipients === "command") return "Command staff";
  if (recipients === "shift") return "On-duty shift";
  if (Array.isArray(recipients)) return `${recipients.length} selected`;
  return String(recipients);
}

export function messageVisibleToUser(message = {}, user = {}, membership = {}) {
  const recipients = message.recipients || "all";
  if (recipients === "all") return true;
  if (recipients === "command" && /chief|captain|battalion|deputy|admin|creator/i.test(membership?.role || "")) {
    return true;
  }
  if (Array.isArray(recipients)) {
    return recipients.includes(user?.uid) || recipients.includes(membership?.email);
  }
  if (typeof recipients === "string" && recipients.startsWith("user:")) {
    return recipients.slice(5) === user?.uid;
  }
  return message.fromUid === user?.uid;
}

export function isMessageUnread(message = {}, userId = "") {
  if (!userId) return false;
  if (message.fromUid === userId) return false;
  const readBy = message.readBy || {};
  return !readBy[userId];
}

export async function listInternalEmails(departmentId) {
  const scopeId = resolveEmailBoardScopeId(departmentId);
  const items = await listRecords(scopeId, INTERNAL_EMAIL_COLLECTION);
  return items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function sendInternalEmail(departmentId, payload = {}) {
  const scopeId = resolveEmailBoardScopeId(departmentId);
  const id = payload.id || `EM-${Date.now()}`;
  return createRecord(scopeId, INTERNAL_EMAIL_COLLECTION, id, {
    id,
    subject: payload.subject || "(No subject)",
    body: payload.body || "",
    category: payload.category || "message",
    priority: payload.priority || "normal",
    recipients: payload.recipients || "all",
    recipientLabel: payload.recipientLabel || buildRecipientLabel(payload.recipients),
    fromUid: payload.fromUid || "",
    fromName: payload.fromName || "System",
    fromEmail: payload.fromEmail || "",
    readBy: payload.readBy || {},
    status: "sent",
    scopeId,
    scopeLabel: payload.scopeLabel || scopeId
  });
}

export async function markInternalEmailRead(departmentId, messageId, userId) {
  if (!messageId || !userId) return null;
  const scopeId = resolveEmailBoardScopeId(departmentId);
  const messages = await listRecords(scopeId, INTERNAL_EMAIL_COLLECTION);
  const message = messages.find((item) => item.id === messageId);
  if (!message) return null;
  const readBy = { ...(message.readBy || {}), [userId]: new Date().toISOString() };
  return updateRecord(scopeId, INTERNAL_EMAIL_COLLECTION, messageId, { readBy });
}

export const DEFAULT_INTERNAL_EMAIL_SEEDS = {
  [PLATFORM_SCOPE_ID]: [
    {
      id: "EM-P001",
      subject: "Welcome to FORGE Internal Email",
      body: "This is the company-wide board for FORGE platform creators. Use department workspaces for agency-specific messaging.",
      category: "announcement",
      priority: "normal",
      recipients: "all",
      recipientLabel: "All platform creators",
      fromName: "FORGE Platform",
      fromEmail: "platform@forgepublicsafety.com",
      status: "sent"
    }
  ],
  "horn-lake-fd": [
    {
      id: "EM-H001",
      subject: "Weekly command briefing — Jun 12",
      body: "Command staff briefing is scheduled for Thursday at 0900 in Fire Administration. Bring staffing and fleet updates.",
      category: "announcement",
      priority: "high",
      recipients: "command",
      recipientLabel: "Command staff",
      fromName: "Jeremy Powell",
      fromEmail: "jpowell@hornlake.org",
      status: "sent"
    },
    {
      id: "EM-H002",
      subject: "A Shift apparatus checks",
      body: "Complete daily apparatus checks before 0800. Report maintenance issues through the employee portal.",
      category: "message",
      priority: "normal",
      recipients: "all",
      recipientLabel: "All personnel",
      fromName: "Stephen White",
      fromEmail: "swhite@hornlake.org",
      status: "sent"
    }
  ],
  "forge-demo": [
    {
      id: "EM-D001",
      subject: "Riverside Demo — training sandbox notice",
      body: "This internal email board uses sample Riverside Fire & EMS data. Messages here are for demo walkthroughs only.",
      category: "announcement",
      priority: "normal",
      recipients: "all",
      recipientLabel: "All demo personnel",
      fromName: "Chief A. Sample",
      fromEmail: "chief@demo.forge.demo",
      status: "sent"
    },
    {
      id: "EM-D002",
      subject: "Shift trade policy reminder",
      body: "Submit shift trades through the employee portal at least 48 hours before the affected shift.",
      category: "message",
      priority: "normal",
      recipients: "all",
      recipientLabel: "All personnel",
      fromName: "Deputy B. Example",
      fromEmail: "deputy@demo.forge.demo",
      status: "sent"
    }
  ]
};

export async function seedInternalEmailsForScope(departmentId, actor = {}) {
  const scopeId = resolveEmailBoardScopeId(departmentId);
  const seeds = DEFAULT_INTERNAL_EMAIL_SEEDS[scopeId] || [];
  if (!seeds.length) return 0;

  const existing = await listRecords(scopeId, INTERNAL_EMAIL_COLLECTION);
  if (existing.length) return 0;

  let count = 0;
  for (const seed of seeds) {
    await sendInternalEmail(scopeId, {
      ...seed,
      fromUid: actor.uid || "seed",
      readBy: {}
    });
    count += 1;
  }
  return count;
}
