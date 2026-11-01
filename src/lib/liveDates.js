// Dates that must be worked out from "now", never stored: certification days left
// and which shift day is currently on duty.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses "Dec 18, 2026", "2026-12-18" and full ISO strings; null when unreadable. */
export function parseLooseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
}

/** Whole days from today until the date (negative once it has passed). */
export function daysUntil(value, now = new Date()) {
  const date = parseLooseDate(value);
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((date - today) / DAY_MS);
}

const AUTOMATIC_CERT_STATUSES = ["", "active", "expired", "due soon"];

/**
 * A certification with days-left and status computed from its expiration date.
 * Statuses someone set on purpose (e.g. "Revoked", "Pending") are kept.
 */
export function withLiveCertDays(cert = {}, now = new Date()) {
  const days = daysUntil(cert.expires || cert.expiration || cert.expirationDate, now);
  if (days === null) return cert;
  const current = String(cert.status || "").toLowerCase();
  const status = AUTOMATIC_CERT_STATUSES.includes(current)
    ? (days < 0 ? "Expired" : days <= 30 ? "Due Soon" : "Active")
    : cert.status;
  return { ...cert, days, status };
}

/**
 * The shift day that is on duty right now. A 24-hour shift that started at 07:00
 * yesterday is still "yesterday" until 07:00 today.
 */
export function dutyDayId(now = new Date(), shiftChangeTime = "07:00") {
  const [hours, minutes] = String(shiftChangeTime || "07:00").split(":").map((part) => Number(part) || 0);
  const date = new Date(now);
  if (date.getHours() < hours || (date.getHours() === hours && date.getMinutes() < minutes)) {
    date.setDate(date.getDate() - 1);
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
