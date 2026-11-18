/** Recipient helpers for emailing inspection reports (Firebase-free, shared with tests). */
export const MAX_REPORT_RECIPIENTS = 5;
const EMAIL_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

/** Email addresses on the occupancy: primary contact first, then other contacts. */
export function occupancyEmails(occupancy) {
  const list = [occupancy?.primaryContactEmail, ...(occupancy?.contacts || []).map((c) => c?.email)];
  return [...new Set(list.map((e) => String(e || "").trim().toLowerCase()).filter((e) => EMAIL_PATTERN.test(e)))];
}

/** Split a typed list ("a@x.com, b@y.com") into { recipients, invalid }. */
export function parseRecipients(value) {
  const parts = [...new Set(String(value || "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  return { recipients: parts.filter((e) => EMAIL_PATTERN.test(e)), invalid: parts.filter((e) => !EMAIL_PATTERN.test(e)) };
}
