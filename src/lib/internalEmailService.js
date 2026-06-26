import { createRecord, deleteRecord, listRecords, updateRecord } from "./firestoreService.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { doc, setDoc } from "firebase/firestore";
import { isPlatformScope } from "./tenantPaths.js";
import {
  buildRecipientLabel as formatRecipientLabel,
  messageVisibleToUser as recipientMessageVisibleToUser,
  normalizeRecipientTokens,
} from "./internalEmailRecipients.js";

export const INTERNAL_EMAIL_COLLECTION = "internalEmails";

export function isDepartmentEmailScope(departmentId) {
  return Boolean(departmentId) && !isPlatformScope(departmentId);
}

export function resolveEmailBoardScopeId(departmentId) {
  if (!isDepartmentEmailScope(departmentId)) return null;
  return departmentId;
}

export function buildRecipientLabel(recipients = "all", optionsByToken = {}, customGroups = []) {
  return formatRecipientLabel(recipients, optionsByToken, customGroups);
}

export function messageVisibleToUser(message = {}, user = {}, membership = {}, personnel = [], customGroups = []) {
  return recipientMessageVisibleToUser(message, user, membership, personnel, customGroups);
}

export function isMessageUnread(message = {}, userId = "") {
  if (!userId) return false;
  if (message.fromUid === userId) return false;
  const readBy = message.readBy || {};
  return !readBy[userId];
}

export async function listInternalEmails(departmentId) {
  const scopeId = resolveEmailBoardScopeId(departmentId);
  if (!scopeId) return [];
  const items = await listRecords(scopeId, INTERNAL_EMAIL_COLLECTION);
  return items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function sendInternalEmail(departmentId, payload = {}) {
  const scopeId = resolveEmailBoardScopeId(departmentId);
  if (!scopeId) {
    throw new Error("Internal email is only available inside department platforms.");
  }
  const id = payload.id || `EM-${Date.now()}`;
  const recipients = normalizeRecipientTokens(payload.recipients);
  return createRecord(scopeId, INTERNAL_EMAIL_COLLECTION, id, {
    id,
    subject: payload.subject || "(No subject)",
    body: payload.body || "",
    category: payload.category || "message",
    priority: payload.priority || "normal",
    recipients,
    recipientLabel: payload.recipientLabel || buildRecipientLabel(
      recipients,
      payload.recipientOptionsByToken,
      payload.customGroups
    ),
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

export async function deleteInternalEmail(departmentId, messageId) {
  if (!messageId) return false;
  const scopeId = resolveEmailBoardScopeId(departmentId);
  if (!scopeId) return false;
  return deleteRecord(scopeId, INTERNAL_EMAIL_COLLECTION, messageId);
}

export async function saveInternalEmailGroups(departmentId, settings, groups = []) {
  const db = getFirestoreDb();
  if (!db || !departmentId) {
    throw new Error("Database unavailable");
  }

  const payload = {
    ...settings,
    departmentId,
    internalEmailGroups: groups,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "departments", departmentId, "settings", "main"), payload, { merge: true });
  return payload.internalEmailGroups;
}

export const DEFAULT_INTERNAL_EMAIL_SEEDS = {
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
      body: "This messages board uses sample Riverside Fire & EMS data. Messages here are for demo walkthroughs only.",
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
  if (!scopeId) return 0;
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
