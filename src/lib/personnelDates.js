export const PERSONNEL_DATE_FIELDS = new Set([
  "birthdate",
  "hiredate",
  "secondarystartdate",
  "startdateranking",
  "endofservicedate",
  "driverslicenseexpiration",
  "payrateeffectivedate",
]);

export function isPersonnelDateField(column = "") {
  return PERSONNEL_DATE_FIELDS.has(String(column || "").toLowerCase());
}

export function isPersonnelDateColumnLabel(label = "") {
  return /date|expires|expiration/i.test(String(label || ""));
}

export function parsePersonnelDate(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function toIsoDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatPersonnelDateForInput(value = "") {
  const parsed = parsePersonnelDate(value);
  if (!parsed) return "";
  return toIsoDateString(parsed);
}

export function formatPersonnelDateForDisplay(value = "", emptyLabel = "—") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return emptyLabel;
  const parsed = parsePersonnelDate(trimmed);
  if (!parsed) return trimmed;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
