/**
 * EMS unit and supply closet check-offs (pure, unit tested).
 *
 * A list (departments/{id}/fieldCheckoffLists/{id}) is built by an admin in the
 * RMS: items with a par quantity and optional expiration tracking, assigned to a
 * unit (EMS) or a location (supply closet). A check-off
 * (departments/{id}/fieldCheckoffs/{id}) is one crew count of a list.
 */

export const CHECKOFF_KINDS = [
  { value: "ems", label: "EMS unit", targetType: "unit" },
  { value: "supply", label: "Supply closet", targetType: "location" },
];

export const CHECKOFF_FREQUENCIES = [
  { value: "daily", label: "Every shift / daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "", label: "As needed" },
];

export const DEFAULT_WARN_DAYS = 30;

function newId(prefix) {
  const random = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 6) : Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function newCheckoffItem(patch = {}) {
  return { id: newId("itm"), name: "", category: "", par: 1, unit: "", tracksExpiration: false, warnDays: DEFAULT_WARN_DAYS, required: true, ...patch };
}

export function newCheckoffList(kind = "ems") {
  return {
    id: newId(kind === "supply" ? "SUP" : "EMS"),
    name: "",
    kind,
    targetType: kind === "supply" ? "location" : "unit",
    target: "",
    frequency: kind === "supply" ? "weekly" : "daily",
    notes: "",
    active: true,
    items: [newCheckoffItem()],
  };
}

export function normalizeCheckoffList(raw = {}) {
  const kind = raw.kind === "supply" ? "supply" : "ems";
  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    kind,
    targetType: raw.targetType || (kind === "supply" ? "location" : "unit"),
    target: String(raw.target || ""),
    frequency: raw.frequency ?? "",
    notes: String(raw.notes || ""),
    active: raw.active !== false,
    items: (Array.isArray(raw.items) ? raw.items : [])
      .filter((item) => item && String(item.name || "").trim())
      .map((item) => ({
        id: String(item.id || newId("itm")),
        name: String(item.name || "").trim(),
        category: String(item.category || "").trim(),
        par: Math.max(0, Number(item.par) || 0),
        unit: String(item.unit || ""),
        tracksExpiration: Boolean(item.tracksExpiration),
        warnDays: Number(item.warnDays) > 0 ? Number(item.warnDays) : DEFAULT_WARN_DAYS,
        required: item.required !== false,
      })),
    updatedAt: raw.updatedAt || "",
    updatedBy: raw.updatedBy || "",
    createdAt: raw.createdAt || "",
  };
}

export function validateCheckoffList(list) {
  const errors = {};
  if (!String(list.name || "").trim()) errors.name = "Name the list.";
  if (!String(list.target || "").trim()) errors.target = list.kind === "supply" ? "Pick the location." : "Pick the unit.";
  const items = (list.items || []).filter((item) => String(item.name || "").trim());
  if (!items.length) errors.items = "Add at least one item.";
  return errors;
}

function daysBetween(fromDay, toDay) {
  const [y1, m1, d1] = String(fromDay).split("-").map(Number);
  const [y2, m2, d2] = String(toDay).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Status of one counted item.
 * @returns {"ok"|"short"|"missing"|"expired"|"expiring"|"unchecked"}
 */
export function checkoffItemStatus(item, entry = {}, today) {
  const raw = entry.count;
  if (raw === undefined || raw === null || raw === "") return "unchecked";
  const count = Number(raw);
  if (item.tracksExpiration && entry.expiration) {
    const days = daysBetween(today, entry.expiration);
    if (days < 0) return "expired";
    if (count < item.par) return count === 0 ? "missing" : "short";
    if (days <= (item.warnDays || DEFAULT_WARN_DAYS)) return "expiring";
  }
  if (count === 0 && item.par > 0) return "missing";
  if (count < item.par) return "short";
  return "ok";
}

export const STATUS_LABELS = {
  ok: "OK",
  short: "Short",
  missing: "Missing",
  expired: "Expired",
  expiring: "Expiring soon",
  unchecked: "Not counted",
};

/** Summary and restock list for a finished count. */
export function summarizeCheckoff(list, entries = {}, today) {
  const counts = { ok: 0, short: 0, missing: 0, expired: 0, expiring: 0, unchecked: 0 };
  const items = list.items.map((item) => {
    const entry = entries[item.id] || {};
    const status = checkoffItemStatus(item, entry, today);
    counts[status] += 1;
    const count = entry.count === "" || entry.count === undefined ? null : Number(entry.count);
    const need = status === "expired" ? item.par : Math.max(0, item.par - (count ?? 0));
    return {
      itemId: item.id,
      name: item.name,
      category: item.category,
      par: item.par,
      unit: item.unit,
      count,
      expiration: item.tracksExpiration ? entry.expiration || "" : "",
      status,
      need: ["short", "missing", "expired"].includes(status) ? need : 0,
      note: entry.note || "",
    };
  });
  const restock = items.filter((row) => row.need > 0).map((row) => ({ itemId: row.itemId, name: row.name, need: row.need, unit: row.unit, reason: row.status }));
  const problems = counts.short + counts.missing + counts.expired;
  return { items, counts, restock, result: problems ? "Needs restock" : counts.expiring ? "OK — items expiring soon" : "All OK" };
}

/** Errors before a count can be saved. */
export function validateCheckoff(list, entries = {}, { requireExpirations = true } = {}) {
  const errors = {};
  for (const item of list.items) {
    const entry = entries[item.id] || {};
    if (item.required && (entry.count === undefined || entry.count === null || entry.count === "")) {
      errors[item.id] = "Count this item.";
      continue;
    }
    const count = Number(entry.count);
    if (entry.count !== "" && entry.count !== undefined && (!Number.isFinite(count) || count < 0)) errors[item.id] = "Enter a count.";
    if (requireExpirations && item.tracksExpiration && count > 0 && !entry.expiration) {
      errors[`${item.id}:exp`] = "Enter the earliest expiration date.";
    }
  }
  return errors;
}

/** Group items by category for display, keeping list order. */
export function groupByCategory(items = []) {
  const groups = [];
  const index = new Map();
  for (const item of items) {
    const key = item.category || "";
    if (!index.has(key)) {
      index.set(key, groups.length);
      groups.push({ category: key, items: [] });
    }
    groups[index.get(key)].items.push(item);
  }
  return groups;
}
