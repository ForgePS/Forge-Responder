/**
 * Hydrant app: email the daily activity CSV (built in the browser) to up to
 * 10 recipients. The mailer is text-only, so the CSV goes inline in the body
 * (or, when it is too large, a summary plus a note to download it).
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { assertDepartmentAccess } = require("./access");

const MAX_RECIPIENTS = 10;
const MAX_CSV_BYTES = 500 * 1024;
const MAX_INLINE_CSV_BYTES = 200 * 1024;
const MAX_SUMMARY_CHARS = 4000;
const EMAIL_PATTERN = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseRecipients(emails) {
  const list = Array.isArray(emails)
    ? emails
    : String(emails || "").split(/[;,\n]/);
  const cleaned = [...new Set(list.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))];
  if (!cleaned.length) {
    throw new HttpsError("invalid-argument", "Add at least one recipient email address.");
  }
  if (cleaned.length > MAX_RECIPIENTS) {
    throw new HttpsError("invalid-argument", `Send to at most ${MAX_RECIPIENTS} recipients at a time.`);
  }
  const invalid = cleaned.filter((email) => email.length > 254 || !EMAIL_PATTERN.test(email));
  if (invalid.length) {
    throw new HttpsError("invalid-argument", `Invalid email address: ${invalid.slice(0, 3).join(", ")}`);
  }
  return cleaned;
}

function validateInput(data = {}) {
  const departmentId = String(data.departmentId || "").trim();
  if (!departmentId) throw new HttpsError("invalid-argument", "departmentId is required.");

  const date = String(data.date || "").trim();
  if (!DATE_PATTERN.test(date)) throw new HttpsError("invalid-argument", "date must be YYYY-MM-DD.");

  const emails = parseRecipients(data.emails);

  if (typeof data.csv !== "string") throw new HttpsError("invalid-argument", "csv must be a string.");
  const csvBytes = Buffer.byteLength(data.csv, "utf8");
  if (csvBytes > MAX_CSV_BYTES) {
    throw new HttpsError("invalid-argument", "The CSV is too large to email (max 500 KB). Download it instead.");
  }

  const summary = data.summary == null ? "" : String(data.summary).slice(0, MAX_SUMMARY_CHARS).trim();
  const departmentName = String(data.departmentName || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120);

  return { departmentId, date, emails, csv: data.csv, csvBytes, summary, departmentName };
}

function buildEmailText({ date, departmentName, summary, csv, csvBytes, senderEmail }) {
  const lines = [
    `Hydrant daily activity for ${date}${departmentName ? ` (${departmentName})` : ""}.`,
  ];
  if (senderEmail) lines.push(`Sent by ${senderEmail} from FORGE Hydrant Testing.`);
  if (summary) lines.push("", summary);
  lines.push("");
  if (!csv.trim()) {
    lines.push("No activity records were found for this date.");
  } else if (csvBytes > MAX_INLINE_CSV_BYTES) {
    lines.push("The CSV is too large to include in this email. Open Hydrant Testing > Reports and use Download Daily Activity to get the full file.");
  } else {
    lines.push("CSV (copy into a .csv file or a spreadsheet):", "", csv);
  }
  return lines.join("\n");
}

async function sendDailyActivityEmail(db, request, { sendTextEmail, assertAccess = assertDepartmentAccess } = {}) {
  if (!request?.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
  if (typeof sendTextEmail !== "function") throw new HttpsError("internal", "Email is not configured.");

  const input = validateInput(request.data || {});
  await assertAccess(db, input.departmentId, request.auth);

  const senderEmail = String(request.auth.token?.email || "").trim();
  const subject = `${input.departmentName || "Hydrant"} daily activity ${input.date}`;
  const status = await sendTextEmail({
    to: input.emails,
    replyTo: senderEmail,
    subject,
    text: buildEmailText({ ...input, senderEmail }),
  });

  if (status === "sent" || status === "logged") {
    return { ok: true, status, recipients: input.emails.length };
  }
  if (status === "not_configured") {
    throw new HttpsError("failed-precondition", "Email delivery is not configured.");
  }
  throw new HttpsError("internal", "The email could not be sent.");
}

module.exports = {
  sendDailyActivityEmail,
  buildEmailText,
  MAX_RECIPIENTS,
  MAX_CSV_BYTES,
};
