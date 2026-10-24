/** Unique, readable record IDs (e.g. WO-LX3K9A2F) that don't collide after deletes. */
export function uniqueRecordId(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const bytes = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else { bytes[0] = Math.random() * 2 ** 32; bytes[1] = Math.random() * 2 ** 32; }
  const rand = (bytes[0].toString(36) + bytes[1].toString(36)).toUpperCase().slice(0, 8).padStart(8, "0");
  return `${prefix}-${time}${rand}`;
}

/** Today as YYYY-MM-DD in local time. */
export function todayIsoDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-06-14" -> "Jun 14, 2026" (the format existing records use). Blank stays blank. */
export function displayDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return String(isoDate || "");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Short "Oct 23" label used by work orders and trade requests. */
export function shortDateLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
