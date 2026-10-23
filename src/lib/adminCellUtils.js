export function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const ROW_KEY_FIELD = "__rowKey";
export const ORIGINAL_ID_FIELD = "__originalId";
export const ORIGINAL_UID_FIELD = "__originalUid";

const INTERNAL_ROW_FIELDS = new Set([
  ROW_KEY_FIELD,
  ORIGINAL_ID_FIELD,
  ORIGINAL_UID_FIELD,
]);

export function getRowReactKey(row = {}, rowIndex = 0) {
  return row?.[ROW_KEY_FIELD] || `row-${rowIndex}`;
}

export function mergeColumnKeys(rows = [], collectionName = "", currentKeys = []) {
  const discovered = collectColumns(rows);
  const merged = [...new Set([...currentKeys, ...discovered])];
  return merged;
}

export function createRowKey() {
  return `rk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createUniqueRecordId(collectionName = "record") {
  return `${collectionName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function withStableRowKeys(rows = [], { persisted = false } = {}) {
  return rows.map((row, index) => {
    const next = {
      ...row,
      [ROW_KEY_FIELD]: row?.[ROW_KEY_FIELD] || createRowKey() || `row-${index}`,
    };

    if (persisted) {
      if (next.id !== undefined && next.id !== "" && next[ORIGINAL_ID_FIELD] === undefined) {
        next[ORIGINAL_ID_FIELD] = next.id;
      }
      if (next.uid !== undefined && next.uid !== "" && next[ORIGINAL_UID_FIELD] === undefined) {
        next[ORIGINAL_UID_FIELD] = next.uid;
      }
    }

    return next;
  });
}

export function stripRowKeys(rows = []) {
  return rows.map((row) => {
    const next = { ...row };
    delete next[ROW_KEY_FIELD];
    delete next[ORIGINAL_ID_FIELD];
    delete next[ORIGINAL_UID_FIELD];
    return next;
  });
}

export function parseCellValue(text, originalValue, column = "") {
  const columnKey = String(column).toLowerCase();
  if (columnKey === "id" || columnKey === "uid") {
    return String(text ?? "");
  }

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
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!INTERNAL_ROW_FIELDS.has(key)) keys.add(key);
    });
  });
  return Array.from(keys);
}

const NARROW_COLUMNS = new Set(["id", "uid", "status", "role", "module", "action"]);
const WIDE_COLUMNS = new Set([
  "permissions",
  "options",
  "description",
  "certifications",
  "documents",
  "address",
  "summary",
  "displayName",
  "email",
  "name",
  "title",
  "notes",
  "tags"
]);

export function adminColumnClass(column = "") {
  const key = String(column).toLowerCase();
  if (NARROW_COLUMNS.has(key)) return "col-narrow";
  if (WIDE_COLUMNS.has(key)) return "col-wide";
  return "col-medium";
}
