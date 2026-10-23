const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const DOB_PATTERN = /\b(?:DOB|D\.O\.B\.?|Date of Birth)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi;
const NAME_LABEL_PATTERN = /\b(?:Patient|Caller|Name|Resident|Occupant)[:\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g;

function sanitizeAlertText(text = "") {
  return String(text || "")
    .replace(SSN_PATTERN, "[redacted]")
    .replace(DOB_PATTERN, "[redacted]")
    .replace(NAME_LABEL_PATTERN, "[redacted]")
    .replace(/\b\d{9}\b/g, "[redacted]")
    .trim();
}

module.exports = {
  sanitizeAlertText,
};
