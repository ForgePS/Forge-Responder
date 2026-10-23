import { getPersonDisplayName } from "./personnelSchema.js";

export const EMPTY_PERSONNEL_FILTERS = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  district: "",
  rank: "",
  shift: "",
  unit: "",
  status: "",
  systemUser: "",
  trainingInstructor: "",
};

function matchesText(value, filter) {
  if (!filter) return true;
  return String(value || "").toLowerCase().includes(filter.toLowerCase());
}

function matchesSelect(value, filter) {
  if (!filter) return true;
  return String(value || "") === filter;
}

function matchesBoolean(value, filter) {
  if (!filter) return true;
  const bool = Boolean(value);
  if (filter === "Yes") return bool;
  if (filter === "No") return !bool;
  return true;
}

export function filterPersonnelRecords(records = [], filters = {}, globalQuery = "") {
  return records.filter((person) => {
    const haystack = Object.values(person).join(" ").toLowerCase();
    if (globalQuery && !haystack.includes(globalQuery.toLowerCase())) return false;

    if (!matchesText(person.firstName, filters.firstName)) return false;
    if (!matchesText(person.lastName, filters.lastName)) return false;
    if (!matchesText(person.email, filters.email)) return false;
    if (!matchesText(person.phone, filters.phone)) return false;
    if (!matchesSelect(person.district, filters.district)) return false;
    if (!matchesSelect(person.rank, filters.rank)) return false;
    if (!matchesSelect(person.shift, filters.shift)) return false;
    if (!matchesSelect(person.unit, filters.unit)) return false;
    if (!matchesSelect(person.status, filters.status)) return false;
    if (!matchesBoolean(person.isSystemUser, filters.systemUser)) return false;
    if (!matchesBoolean(person.isTrainingInstructor, filters.trainingInstructor)) return false;

    return true;
  });
}

export function exportPersonnelCsv(records = []) {
  const headers = ["Name", "Email", "Phone", "IAFF Local Number", "Rank", "Shift", "Unit", "Status"];
  const rows = records.map((person) => [
    getPersonDisplayName(person),
    person.email || "",
    person.phone || "",
    person.iaffLocalNumber || "",
    person.rank || "",
    person.shift || "",
    person.unit || "",
    person.status || "",
  ]);

  const escape = (value) => `"${String(value).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
