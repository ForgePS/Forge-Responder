import { getPersonDisplayName } from "./personnelSchema.js";
import { formatDayId, parseDayId } from "./shiftCalendar.js";

export function resolveAllBattalionChiefs(personnel = []) {
  return (Array.isArray(personnel) ? personnel : [])
    .filter((person) => {
      const status = String(person.status || "").toLowerCase();
      if (/inactive|terminated/.test(status)) return false;
      return /battalion chief/i.test(String(person.rank || ""));
    })
    .map((person) => ({
      id: person.id,
      name: getPersonDisplayName(person),
      shift: person.shift || "",
    }));
}

export function buildBattalionChiefRecipientTokens(personnel = []) {
  const chiefs = resolveAllBattalionChiefs(personnel);
  if (!chiefs.length) return ["g:command"];
  return chiefs.map((chief) => `person:${chief.id}`);
}

export function formatMaintenanceReportDate(dateValue = "") {
  if (!dateValue) return "";
  try {
    const date = String(dateValue).includes("-")
      ? parseDayId(dateValue)
      : new Date(dateValue);
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return String(dateValue);
  }
}

export function buildMaintenanceIssueMessageBody(form = {}, submittedBy = "") {
  const lines = [
    "Maintenance / damage report submitted from the employee portal.",
    "",
    `Date: ${formatMaintenanceReportDate(form.date)}`,
    `Damaged property/equipment location: ${form.location || "Not specified"}`,
    form.equipment ? `Equipment: ${form.equipment}` : "Equipment: (not listed)",
    "",
    "What is damaged and description of the damage:",
    form.damageDescription || "(No description provided)",
    "",
    `Person filling out the form: ${submittedBy || "Employee"}`,
  ];
  return lines.join("\n");
}

export function buildMaintenanceWorkOrderRecord(form = {}, submittedBy = "", existingCount = 0) {
  const id = `WO-E${26000 + existingCount}`;
  const equipmentLine = String(form.equipment || "").trim();
  const damageDescription = String(form.damageDescription || "").trim();
  const issueParts = [equipmentLine, damageDescription].filter(Boolean);

  return {
    id,
    unit: form.location || "Unspecified",
    location: form.location || "",
    equipment: equipmentLine,
    damageDescription,
    reportDate: form.date || "",
    issue: issueParts.join(" — ") || "Damage report",
    category: "Damage Report",
    priority: "Medium",
    opened: formatMaintenanceReportDate(form.date) || "Today",
    vendor: "Pending review",
    cost: "Pending",
    status: "Open",
    reportedBy: submittedBy,
    source: "employee-portal",
    submittedAt: new Date().toISOString(),
  };
}

export function validateMaintenanceIssueForm(form = {}) {
  if (!form.date) return "Select the date of the damage.";
  if (!String(form.location || "").trim()) return "Select the damaged property/equipment location.";
  if (!String(form.damageDescription || "").trim()) return "Describe what is damaged.";
  return "";
}

export const defaultMaintenanceIssueForm = () => ({
  date: formatDayId(new Date()),
  location: "",
  equipment: "",
  damageDescription: "",
});
