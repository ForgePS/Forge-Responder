import { normalizePersonnelRecord as applyPersonnelSchema } from "./personnelSchema.js";
import { normalizeApparatusList } from "./apparatusSchema.js";
import { normalizeDailyLogList } from "./dailyLogSchema.js";

function isTupleArray(value) {
  return Array.isArray(value) && value.some(Array.isArray);
}

function tupleToObject(entry) {
  if (!Array.isArray(entry)) return entry;
  return {
    v0: entry[0] ?? "",
    v1: entry[1] ?? "",
    v2: entry[2] ?? "",
    v3: entry[3] ?? ""
  };
}

function objectToTuple(entry) {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === "object" && "v0" in entry) {
    const tuple = [entry.v0 ?? "", entry.v1 ?? "", entry.v2 ?? ""];
    if (entry.v3) tuple.push(entry.v3);
    return tuple;
  }
  return entry;
}

export function sanitizeForFirestore(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    if (isTupleArray(value)) {
      return value.map(tupleToObject);
    }
    return value.map(sanitizeForFirestore);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeForFirestore(item)])
    );
  }
  return value;
}

export function restoreFromFirestore(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item) && "v0" in item) {
        return objectToTuple(item);
      }
      return restoreFromFirestore(item);
    });
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, restoreFromFirestore(item)])
    );
  }
  return value;
}

export function normalizePersonnelRecord(person = {}) {
  const next = restoreFromFirestore(person);
  if (Array.isArray(next.certifications)) {
    next.certifications = next.certifications.map((row) => {
      if (Array.isArray(row)) return row;
      if (row && typeof row === "object" && "v0" in row) return objectToTuple(row);
      return row;
    });
  }

  return applyPersonnelSchema(next);
}

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map(stripUndefined)
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, stripUndefined(item)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return value;
}

export function sanitizeItemsForFirestore(items = []) {
  return items.map((item) => stripUndefined(sanitizeForFirestore(item)));
}

export function restoreItemsFromFirestore(items = [], listKey = "") {
  const restored = (Array.isArray(items) ? items : [])
    .map((item) => restoreFromFirestore(item))
    .filter((item) => item != null && typeof item === "object");
  if (listKey === "hlfd-rms-personnel") {
    return restored.map((item) => normalizePersonnelRecord(item));
  }
  if (listKey === "hlfd-rms-apparatus") {
    return normalizeApparatusList(restored);
  }
  if (listKey === "hlfd-rms-daily-logs") {
    return normalizeDailyLogList(restored);
  }
  return restored;
}
