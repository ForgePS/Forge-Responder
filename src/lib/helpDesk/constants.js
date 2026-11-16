// Help Desk choices. Keep in step with functions/lib/helpDesk.js (tests/unit/helpDesk.test.mjs checks).

export const HELP_DESK_PAGE = "Help Desk";

export const CATEGORIES = [
  { id: "bug", label: "Bug", hint: "Something is broken or shows an error" },
  { id: "question", label: "Question", hint: "How do I…?" },
  { id: "account", label: "Account / access", hint: "Sign-in, invites, roles, permissions" },
  { id: "feature", label: "Feature request", hint: "An idea or something you need" },
  { id: "data", label: "Data issue", hint: "Missing, wrong or duplicated records" },
  { id: "other", label: "Other", hint: "Anything else" },
];

export const PRIORITIES = [
  { id: "low", label: "Low", hint: "Whenever you get to it" },
  { id: "normal", label: "Normal", hint: "Getting in the way" },
  { id: "high", label: "High", hint: "Blocking my work" },
  { id: "urgent", label: "Urgent", hint: "Operations affected now" },
];

// Requesters see "Waiting on you"; staff see "Waiting on user".
export const STATUSES = [
  { id: "open", label: "Open", requesterLabel: "Open" },
  { id: "in_progress", label: "In progress", requesterLabel: "In progress" },
  { id: "waiting_on_user", label: "Waiting on user", requesterLabel: "Waiting on you" },
  { id: "resolved", label: "Resolved", requesterLabel: "Resolved" },
  { id: "closed", label: "Closed", requesterLabel: "Closed" },
];

export const ACTIVE_STATUSES = ["open", "in_progress", "waiting_on_user"];

export const ATTACHMENT_LIMITS = {
  count: 5,
  bytes: 10 * 1024 * 1024,
  accept: "image/*,application/pdf,text/plain,text/csv,application/json,.log,.txt,.csv,.json",
};

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));
const CATEGORY_BY_ID = byId(CATEGORIES);
const PRIORITY_BY_ID = byId(PRIORITIES);
const STATUS_BY_ID = byId(STATUSES);

export const categoryLabel = (id) => CATEGORY_BY_ID[id]?.label || id || "";
export const priorityLabel = (id) => PRIORITY_BY_ID[id]?.label || id || "";
export const statusLabel = (id, { requester = false } = {}) => {
  const status = STATUS_BY_ID[id];
  if (!status) return id || "";
  return requester ? status.requesterLabel : status.label;
};

/** Same definition of department admin as firestore.rules isDepartmentAdmin(). */
export function isDepartmentAdminMembership(membership = {}) {
  if (!membership || membership.status === "disabled") return false;
  const roleIds = Array.isArray(membership.roleIds) ? membership.roleIds : [];
  return membership.role === "department_admin" || roleIds.some((id) => ["fireChief", "itAdmin"].includes(id));
}
