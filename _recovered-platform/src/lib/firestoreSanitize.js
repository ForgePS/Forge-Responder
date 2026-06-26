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
  if (entry && typeof entry === "object" && ("v0" in entry || "v1" in entry)) {
    return [entry.v0 ?? "", entry.v1 ?? "", entry.v2 ?? "", entry.v3 ?? ""].filter((_, index, arr) => {
      if (index < 2) return true;
      return arr[index] !== "";
    });
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
    if (value.length && value.every((item) => item && typeof item === "object" && "v0" in item)) {
      return value.map(objectToTuple);
    }
    return value.map(restoreFromFirestore);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, restoreFromFirestore(item)])
    );
  }
  return value;
}

export function sanitizeItemsForFirestore(items = []) {
  return items.map((item) => sanitizeForFirestore(item));
}

export function restoreItemsFromFirestore(items = []) {
  return items.map((item) => restoreFromFirestore(item));
}
