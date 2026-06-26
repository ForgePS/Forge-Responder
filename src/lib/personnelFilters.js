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

export const DEFAULT_PERSONNEL_SORT = {
  key: "name",
  direction: "asc",
};

function personnelSortValue(person = {}, key = "") {
  switch (key) {
    case "name":
      return [
        person.lastName,
        person.firstName,
        getPersonDisplayName(person),
      ].map((value) => String(value || "").trim().toLowerCase()).join("|");
    case "email":
      return String(person.email || "").trim().toLowerCase();
    case "phone":
      return String(person.phone || "").replace(/\D/g, "");
    case "iaffLocalNumber":
      return String(person.iaffLocalNumber || "").trim().toLowerCase();
    case "rank":
      return String(person.rank || "").trim().toLowerCase();
    case "shift":
      return String(person.shift || "").trim().toLowerCase();
    case "unit":
      return String(person.unit || person.assignment || "").trim().toLowerCase();
    case "station":
      return String(person.station || "").trim().toLowerCase();
    case "status":
      return String(person.status || "").trim().toLowerCase();
    default:
      return String(person[key] || "").trim().toLowerCase();
  }
}

export function sortPersonnelRecords(
  records = [],
  sortKey = DEFAULT_PERSONNEL_SORT.key,
  direction = DEFAULT_PERSONNEL_SORT.direction
) {
  const multiplier = direction === "desc" ? -1 : 1;
  return [...records].sort((left, right) => {
    const leftValue = personnelSortValue(left, sortKey);
    const rightValue = personnelSortValue(right, sortKey);
    if (leftValue === rightValue) {
      return getPersonDisplayName(left).localeCompare(getPersonDisplayName(right), undefined, { sensitivity: "base" });
    }
    if (leftValue < rightValue) return -1 * multiplier;
    if (leftValue > rightValue) return 1 * multiplier;
    return 0;
  });
}

export function exportPersonnelCsv(records = []) {
  const headers = ["Name", "Rank", "Shift", "Apparatus", "Station", "Email", "Phone", "IAFF Local Number", "Status"];
  const rows = records.map((person) => [
    getPersonDisplayName(person),
    person.rank || "",
    person.shift || "",
    person.unit || person.assignment || "",
    person.station || "",
    person.email || "",
    person.phone || "",
    person.iaffLocalNumber || "",
    person.status || "",
  ]);

  const escape = (value) => `"${String(value).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
