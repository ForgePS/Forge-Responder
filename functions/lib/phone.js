function digitsOnly(value = "") {
  return String(value || "").replace(/\D/g, "");
}

/** Normalize US display numbers to E.164 (+1XXXXXXXXXX). */
function toUsE164(value = "") {
  const digits = digitsOnly(value);
  if (!digits) return "";

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(value).trim().startsWith("+") && digits.length >= 10) return `+${digits}`;

  return "";
}

module.exports = {
  digitsOnly,
  toUsE164,
};
