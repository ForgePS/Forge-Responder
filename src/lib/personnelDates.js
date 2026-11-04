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
  // "2017-03-01" is a calendar day: read it in local time. Date.parse treats it
  // as midnight UTC, which is the day before in US time zones (and an edit
  // box would then save the earlier day).
  const day = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12);
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
