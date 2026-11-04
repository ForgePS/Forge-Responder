/**
 * Who an internal message is for, worked out on the server so Firestore rules
 * can hand each message only to its sender, its recipients and message managers.
 *
 * Matching mirrors src/lib/internalEmailRecipients.js (messageVisibleToUser);
 * tests/unit/messageRecipients.test.mjs checks the two agree.
 *
 * Each message gets:
 *   toAll          true when it goes to everyone in the department
 *   recipientUids  member uids it is addressed to (empty when toAll)
 */
const { readListItems } = require("./listStore");

const COMMAND_PATTERN = /chief|captain|battalion|deputy|admin|creator|officer/i;
const PERSONNEL_LIST_KEYS = ["hlfd-rms-personnel", "personnel"];

function normalizeRecipientTokens(recipients) {
  if (Array.isArray(recipients)) return recipients.map(String).filter(Boolean);
  if (!recipients) return ["g:all"];
  if (typeof recipients === "string") {
    if (recipients === "all") return ["g:all"];
    if (recipients === "command") return ["g:command"];
    if (recipients === "shift") return ["g:on-duty"];
    return [recipients];
  }
  return ["g:all"];
}

function isToAll(recipients) {
  const tokens = normalizeRecipientTokens(recipients);
  return !tokens.length || tokens.includes("g:all") || tokens.includes("all");
}

const lower = (value) => String(value || "").toLowerCase();

function findPerson(user = {}, membership = {}, personnel = []) {
  return personnel.find((entry) => (
    (membership.personnelId && entry.id === membership.personnelId)
    || (membership.email && entry.email && lower(entry.email) === lower(membership.email))
    || (user.email && entry.email && lower(entry.email) === lower(user.email))
  ));
}

function tokenMatches(token, context, customGroups, depth = 0) {
  const { user, membership, person } = context;
  const value = String(token || "");

  if (value === "g:all" || value === "all") return true;
  if (value === "g:command" || value === "command") {
    return COMMAND_PATTERN.test(`${membership?.role || ""} ${person?.rank || ""} ${person?.assignment || ""}`);
  }
  if (value === "g:on-duty" || value === "shift") return Boolean(person?.shift || membership?.shift);
  if (value.startsWith("shift:")) return lower(person?.shift || membership?.shift) === lower(value.slice(6));
  if (value.startsWith("station:")) return lower(person?.station) === lower(value.slice(8));
  if (value.startsWith("user:")) return value.slice(5) === user?.uid;
  if (value.startsWith("person:")) {
    const personnelId = value.slice(7);
    return personnelId === person?.id || personnelId === membership?.personnelId;
  }
  if (value.startsWith("group:")) {
    const group = customGroups.find((item) => item.id === value.slice(6));
    if (!group?.members?.length || depth > 5) return false;
    return group.members.map(String).some((member) => tokenMatches(member, context, customGroups, depth + 1));
  }
  if (value.includes("@")) return lower(value) === lower(membership?.email || user?.email);
  return false;
}

/**
 * @param {object} message internal message (recipients, fromUid)
 * @param {{ uid: string, email?: string, role?: string, personnelId?: string, shift?: string }[]} members
 * @param {object[]} personnel
 * @param {object[]} customGroups
 * @returns {{ toAll: boolean, recipientUids: string[] }}
 */
function resolveMessageAudience(message = {}, members = [], personnel = [], customGroups = []) {
  if (isToAll(message.recipients)) return { toAll: true, recipientUids: [] };
  const tokens = normalizeRecipientTokens(message.recipients);
  const uids = new Set();
  for (const member of members) {
    if (!member?.uid) continue;
    const user = { uid: member.uid, email: member.email || "" };
    const context = { user, membership: member, person: findPerson(user, member, personnel) };
    if (tokens.some((token) => tokenMatches(token, context, customGroups))) uids.add(member.uid);
  }
  return { toAll: false, recipientUids: [...uids].sort() };
}

async function loadAudienceContext(db, departmentId) {
  const [membersSnap, settingsSnap] = await Promise.all([
    db.collection(`departments/${departmentId}/users`).get(),
    db.doc(`departments/${departmentId}/settings/main`).get(),
  ]);
  const members = membersSnap.docs
    .map((snap) => ({ ...snap.data(), uid: snap.id }))
    .filter((member) => !member.status || member.status === "active");
  let personnel = [];
  for (const listKey of PERSONNEL_LIST_KEYS) {
    personnel = await readListItems(db, departmentId, listKey);
    if (personnel.length) break;
  }
  const customGroups = settingsSnap.exists ? settingsSnap.get("internalEmailGroups") || [] : [];
  return { members, personnel, customGroups: Array.isArray(customGroups) ? customGroups : [] };
}

function sameAudience(data = {}, audience) {
  const stored = Array.isArray(data.recipientUids) ? [...data.recipientUids].sort() : null;
  return data.toAll === audience.toAll
    && stored !== null
    && stored.length === audience.recipientUids.length
    && stored.every((uid, i) => uid === audience.recipientUids[i]);
}

/** Store toAll / recipientUids on one message when they differ. Returns true if written. */
async function applyMessageAudience(db, departmentId, messageId, data, context = null) {
  const ctx = context || await loadAudienceContext(db, departmentId);
  const audience = resolveMessageAudience(data, ctx.members, ctx.personnel, ctx.customGroups);
  if (sameAudience(data, audience)) return false;
  await db.doc(`departments/${departmentId}/internalEmails/${messageId}`).update(audience);
  return true;
}

/** Firestore trigger body: a message was created or its recipients changed. */
async function handleMessageWritten(db, event) {
  const after = event.data?.after;
  if (!after?.exists) return;
  const data = after.data() || {};
  const before = event.data?.before?.exists ? event.data.before.data() || {} : null;
  const recipientsChanged = !before || JSON.stringify(before.recipients) !== JSON.stringify(data.recipients);
  const audienceMissing = typeof data.toAll !== "boolean" || !Array.isArray(data.recipientUids);
  // Re-check when the audience fields were edited by anyone but this function.
  const audienceEdited = before && (before.toAll !== data.toAll
    || JSON.stringify(before.recipientUids) !== JSON.stringify(data.recipientUids));
  if (!recipientsChanged && !audienceMissing && !audienceEdited) return;
  await applyMessageAudience(db, event.params.departmentId, event.params.messageId, data);
}

/** Fill toAll / recipientUids on every message in a department (one-off backfill). */
async function backfillDepartmentMessages(db, departmentId, { dryRun = true } = {}) {
  const snap = await db.collection(`departments/${departmentId}/internalEmails`).get();
  if (snap.empty) return { updated: 0, unchanged: 0 };
  const ctx = await loadAudienceContext(db, departmentId);
  const counts = { updated: 0, unchanged: 0 };
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const audience = resolveMessageAudience(data, ctx.members, ctx.personnel, ctx.customGroups);
    if (sameAudience(data, audience)) {
      counts.unchanged += 1;
      continue;
    }
    if (!dryRun) await doc.ref.update(audience);
    counts.updated += 1;
  }
  return counts;
}

module.exports = {
  normalizeRecipientTokens,
  resolveMessageAudience,
  loadAudienceContext,
  applyMessageAudience,
  handleMessageWritten,
  backfillDepartmentMessages,
};
