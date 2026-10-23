export function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function parseCellValue(text, originalValue) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return "";
  if (typeof originalValue === "boolean") return trimmed === "true";
  if (typeof originalValue === "number" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function collectColumns(rows = []) {
  const keys = new Set(["id"]);
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => keys.add(key)));
  return Array.from(keys);
}
