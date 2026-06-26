import { getPersonDisplayName } from "./personnelSchema.js";
import { resolvePersonnelRecordId } from "./personnelService.js";

const COMMAND_PATTERN = /chief|captain|battalion|deputy|admin|creator|officer/i;

export const BUILTIN_RECIPIENT_GROUPS = [
  { token: "g:all", label: "All personnel", section: "Groups" },
  { token: "g:command", label: "Command staff", section: "Groups" },
  { token: "g:on-duty", label: "On-duty shift today", section: "Groups" },
];

export function normalizeRecipientTokens(recipients) {
  if (Array.isArray(recipients)) {
    return recipients.map(String).filter(Boolean);
  }
  if (!recipients) return ["g:all"];
  if (typeof recipients === "string") {
    if (recipients === "all") return ["g:all"];
    if (recipients === "command") return ["g:command"];
    if (recipients === "shift") return ["g:on-duty"];
    return [recipients];
  }
  return ["g:all"];
}

export function buildRecipientOptions({
  profile = {},
  personnel = [],
  users = [],
  customGroups = [],
} = {}) {
  const options = [...BUILTIN_RECIPIENT_GROUPS];
  const seen = new Set(options.map((item) => item.token));

  for (const shift of profile.shifts || []) {
    const token = `shift:${shift}`;
    if (seen.has(token)) continue;
    seen.add(token);
    options.push({ token, label: shift, section: "Shifts" });
  }

  for (const station of profile.stations || []) {
    const token = `station:${station}`;
    if (seen.has(token)) continue;
    seen.add(token);
    options.push({ token, label: station, section: "Stations" });
  }

  for (const group of customGroups) {
    const token = `group:${group.id}`;
    if (!group.id || seen.has(token)) continue;
    seen.add(token);
    options.push({
      token,
      label: group.label || group.id,
      section: "Custom groups",
      members: group.members || [],
    });
  }

  const individualOptions = [];
  const coveredPersonnelIds = new Set();
  const coveredEmails = new Set();

  for (const person of personnel) {
    const personnelId = resolvePersonnelRecordId(person);
    if (!personnelId) continue;
    const token = `person:${personnelId}`;
    if (seen.has(token)) continue;
    seen.add(token);
    coveredPersonnelIds.add(personnelId.toLowerCase());
    if (person.email) {
      coveredEmails.add(String(person.email).trim().toLowerCase());
    }
    individualOptions.push({
      token,
      label: getPersonDisplayName(person) || personnelId,
      section: "Individuals",
      email: person.email || "",
      personnelId,
      rank: person.rank || "",
    });
  }

  for (const account of users) {
    const uid = account.uid || account.id;
    if (!uid) continue;

    const linkedPersonnelId = String(account.personnelId || "").trim();
    if (linkedPersonnelId && coveredPersonnelIds.has(linkedPersonnelId.toLowerCase())) {
      continue;
    }

    const email = String(account.email || "").trim().toLowerCase();
    if (email && coveredEmails.has(email)) {
      continue;
    }

    const token = `user:${uid}`;
    if (seen.has(token)) continue;
    seen.add(token);
    individualOptions.push({
      token,
      label: account.displayName || account.email || uid,
      section: "Individuals",
      email: account.email || "",
      uid,
    });
  }

  individualOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  options.push(...individualOptions);

  return options;
}

export function buildRecipientOptionsMap(options = []) {
  return Object.fromEntries(options.map((option) => [option.token, option]));
}

export function buildRecipientLabel(recipients, optionsByToken = {}, customGroups = []) {
  const tokens = normalizeRecipientTokens(recipients);
  if (!tokens.length) return "All personnel";

  const labels = tokens.map((token) => {
    const option = optionsByToken[token];
    if (option?.label) return option.label;

    if (token.startsWith("group:")) {
      const groupId = token.slice(6);
      const group = customGroups.find((item) => item.id === groupId);
      return group?.label || groupId;
    }

    if (token.startsWith("person:")) return token.slice(7);
    if (token.startsWith("user:")) return token.slice(5);
    if (token.startsWith("shift:")) return token.slice(6);
    if (token.startsWith("station:")) return token.slice(8);
    if (token === "g:all" || token === "all") return "All personnel";
    if (token === "g:command" || token === "command") return "Command staff";
    if (token === "g:on-duty" || token === "shift") return "On-duty shift today";
    return token;
  });

  return labels.join(", ");
}

export function resolvePersonContext(user = {}, membership = {}, personnel = []) {
  const person = personnel.find((entry) => (
    (membership?.personnelId && entry.id === membership.personnelId)
    || (membership?.email && entry.email && entry.email.toLowerCase() === membership.email.toLowerCase())
    || (user?.email && entry.email && entry.email.toLowerCase() === user.email.toLowerCase())
  ));

  return { user, membership, person };
}

function expandCustomGroupMembers(token, customGroups = []) {
  if (!token.startsWith("group:")) return [token];
  const groupId = token.slice(6);
  const group = customGroups.find((item) => item.id === groupId);
  if (!group?.members?.length) return [token];
  return group.members.map(String);
}

function tokenMatchesRecipient(token, context = {}, customGroups = []) {
  const { user, membership, person } = context;
  const normalized = String(token || "");

  if (normalized === "g:all" || normalized === "all") return true;

  if (normalized === "g:command" || normalized === "command") {
    const roleText = `${membership?.role || ""} ${person?.rank || ""} ${person?.assignment || ""}`;
    return COMMAND_PATTERN.test(roleText);
  }

  if (normalized === "g:on-duty" || normalized === "shift") {
    return Boolean(person?.shift || membership?.shift);
  }

  if (normalized.startsWith("shift:")) {
    const shift = normalized.slice(6);
    const personShift = String(person?.shift || membership?.shift || "");
    return personShift.toLowerCase() === shift.toLowerCase();
  }

  if (normalized.startsWith("station:")) {
    const station = normalized.slice(8);
    const personStation = String(person?.station || "");
    return personStation.toLowerCase() === station.toLowerCase();
  }

  if (normalized.startsWith("user:")) {
    const uid = normalized.slice(5);
    return uid === user?.uid;
  }

  if (normalized.startsWith("person:")) {
    const personnelId = normalized.slice(7);
    return personnelId === person?.id || personnelId === membership?.personnelId;
  }

  if (normalized.startsWith("group:")) {
    const members = expandCustomGroupMembers(normalized, customGroups);
    return members.some((memberToken) => tokenMatchesRecipient(memberToken, context, customGroups));
  }

  if (normalized.includes("@")) {
    return normalized.toLowerCase() === String(membership?.email || user?.email || "").toLowerCase();
  }

  return false;
}

export function messageVisibleToUser(message = {}, user = {}, membership = {}, personnel = [], customGroups = []) {
  if (message.fromUid && message.fromUid === user?.uid) return true;

  const tokens = normalizeRecipientTokens(message.recipients);
  if (!tokens.length || tokens.includes("g:all") || tokens.includes("all")) return true;

  const context = resolvePersonContext(user, membership, personnel);
  return tokens.some((token) => tokenMatchesRecipient(token, context, customGroups));
}

export function slugifyGroupId(label = "") {
  const slug = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `cg-${slug}` : `cg-${Date.now()}`;
}
