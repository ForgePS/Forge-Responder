/** Suspended / archived department wording, from the public registry record. */
/** "archived" | "suspended" | "cancelled" | "" from a public department registry record. */
export function departmentInactiveReason(registry = {}) {
  const status = String(registry?.status || "").toLowerCase();
  if (status === "archived" || status === "disabled") return "archived";
  const saas = String(registry?.subscription?.saasStatus || "").toLowerCase();
  if (saas === "suspended" || saas === "cancelled") return saas;
  return "";
}

export const INACTIVE_DEPARTMENT_TEXT = {
  archived: { title: "Department no longer active", body: "has been archived on FORGE Responder. Its records are kept, but nobody can sign in to it." },
  suspended: { title: "Subscription suspended", body: "has a suspended FORGE Responder subscription, so sign-in is paused." },
  cancelled: { title: "Subscription cancelled", body: "no longer has an active FORGE Responder subscription." },
};
