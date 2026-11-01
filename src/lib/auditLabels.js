// Turns stored audit entries into plain words for the Activity Log.

const ACTION_LABELS = {
  create: "Created",
  update: "Updated",
  updated: "Updated",
  delete: "Deleted",
  archive: "Archived",
  restore: "Restored",
  import: "Imported",
  upload: "Uploaded",
  publish: "Published",
  seed: "Set up defaults",
  migrate: "Moved data",
  submit: "Submitted",
  revoke: "Revoked",
  "invite.created": "Invited",
  "invite.accepted": "Accepted invite",
  "invite.revoked": "Cancelled invite",
  "onboarding.completed": "Finished setup",
  "security.two-factor-reset": "Reset two-step sign-in",
  "neris.ai-narrative-draft": "AI narrative draft",
  defect_create: "Reported defect",
  check_complete: "Completed check",
  meter: "Recorded reading",
  wo_create: "Opened work order",
  wo_update: "Updated work order",
};

/** "defect_create" → "Defect create"; known actions get a hand-written label. */
export function auditActionLabel(action = "") {
  const key = String(action || "").trim();
  if (!key) return "Updated";
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  const words = key.replace(/[._:-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Local date and time, e.g. "Oct 24, 2026, 10:34 AM". */
export function auditWhen(log = {}) {
  const raw = log.created_at || log.createdAt || "";
  const date = raw?.toDate ? raw.toDate() : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function auditTime(log = {}) {
  const raw = log.created_at || log.createdAt || "";
  const date = raw?.toDate ? raw.toDate() : new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

// Every list save writes "Saved Personnel (12 records)"; useful history, but it
// buries admin actions, so the log hides these unless asked.
export function isRoutineSave(log = {}) {
  return log.action === "update" && /^Saved .+ \(\d+ records?\)$/.test(String(log.summary || ""));
}

/** Older invite entries had no summary; build one. */
export function auditSummary(log = {}) {
  if (log.summary) return log.summary;
  if (log.target) return `${auditActionLabel(log.action)} ${log.target}`;
  return "";
}

export function auditModule(log = {}) {
  if (log.module) return log.module;
  if (String(log.action || "").startsWith("invite.")) return "Users";
  return "System";
}
