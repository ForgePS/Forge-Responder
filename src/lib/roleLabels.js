// Display names for department roles ("fireChief" -> "Fire Chief").
const ROLE_LABELS = {
  firechief: "Fire Chief",
  department_admin: "Fire Chief",
  itadmin: "IT Admin",
  firefighter: "Firefighter",
  readonly: "Read Only",
  member: "Member",
};

export function formatRoleLabel(role = "", membership = {}) {
  if (membership?.isPlatformCreator || role === "creator") return "Creator";
  const roleIds = Array.isArray(membership?.roleIds) ? membership.roleIds : [];
  const preferred = ["fireChief", "itAdmin"].find((id) => roleIds.includes(id)) || roleIds[0] || role || "member";
  const known = ROLE_LABELS[String(preferred).toLowerCase()] || ROLE_LABELS[String(role).toLowerCase()];
  if (known && (known !== "Member" || !roleIds.length)) return known;
  return String(preferred)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
