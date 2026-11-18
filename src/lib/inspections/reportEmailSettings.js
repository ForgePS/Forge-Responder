/**
 * Each department's settings for emailed inspection reports, kept in
 * inspectionSettings/main.reportEmail and set in Configuration Studio:
 *
 *   senderName  shown as the sender ("Springfield Fire Prevention"); the address
 *               stays the platform's verified sending address
 *   replyTo     where replies go (blank = the inspector who sent the report)
 *   copyTo      up to 3 addresses copied on every report (e.g. a records inbox)
 *   signature   closing lines at the end of every report email
 *
 * The server (functions/lib/inspectionEmail.js) re-checks all of this.
 */
export const REPORT_EMAIL_LIMITS = { senderName: 80, signature: 1000, copyTo: 3 };
const EMAIL_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

function cleanName(value) {
  return String(value || "").replace(/["<>\\\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, REPORT_EMAIL_LIMITS.senderName);
}

function emailList(value) {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[,;\s]+/);
  return [...new Set(parts.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
}

export function normalizeReportEmailSettings(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    senderName: cleanName(data.senderName),
    replyTo: String(data.replyTo || "").trim().toLowerCase(),
    copyTo: emailList(data.copyTo),
    signature: String(data.signature || "").replace(/\r\n/g, "\n").trim().slice(0, REPORT_EMAIL_LIMITS.signature),
  };
}

/** Problems that stop the settings from being saved ([] = fine). */
export function reportEmailSettingsProblems(raw = {}) {
  const settings = normalizeReportEmailSettings(raw);
  const problems = [];
  if (settings.replyTo && !EMAIL_PATTERN.test(settings.replyTo)) problems.push(`Reply-to address isn't valid: ${settings.replyTo}`);
  const badCopy = settings.copyTo.find((e) => !EMAIL_PATTERN.test(e));
  if (badCopy) problems.push(`Copy address isn't valid: ${badCopy}`);
  if (settings.copyTo.length > REPORT_EMAIL_LIMITS.copyTo) problems.push(`Copy reports to ${REPORT_EMAIL_LIMITS.copyTo} addresses or fewer.`);
  return problems;
}
