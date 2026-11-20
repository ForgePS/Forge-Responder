/**
 * Labels and display rules for EMS supply inventory screens. The stock rules
 * themselves live on the server (functions/lib/emsInventory/logic.js); the
 * shared constants below are checked against it by tests/unit/emsInventory.test.mjs.
 */

export const DEFAULT_EMS_SETTINGS = Object.freeze({
  rotationPolicy: "fefo",
  expirationWarningDays: [90, 60, 30, 14, 7],
});

export const LOCATION_TYPES = ["station", "storageArea", "cabinet", "shelf", "bin", "vehicle"];

export const LOCATION_TYPE_LABELS = {
  station: "Station",
  storageArea: "Storage area",
  cabinet: "Cabinet",
  shelf: "Shelf",
  bin: "Bin",
  vehicle: "Vehicle",
};

export const DEFAULT_SUPPLY_CATEGORIES = [
  "IV supplies", "IV fluids", "Airway supplies", "Oxygen supplies", "Trauma supplies", "Bandages",
  "Dressings", "Syringes", "Needles", "Gloves", "PPE", "Diagnostic disposables", "Wound care",
  "Patient care supplies", "General medical consumables",
];

/** Types a member can post, with who may post them (`use` = useEmsSupplies, `manage` = manageEmsInventory). */
export const TRANSACTION_TYPES = {
  receive: { label: "Received", direction: "in", access: "manage" },
  usage: { label: "Used", direction: "out", access: "use" },
  transfer: { label: "Transferred", direction: "move", access: "use" },
  expired: { label: "Removed: expired", direction: "out", access: "use" },
  damaged: { label: "Removed: damaged", direction: "out", access: "use" },
  waste: { label: "Wasted", direction: "out", access: "manage" },
  returnToVendor: { label: "Returned to vendor", direction: "out", access: "manage" },
};

export const TRANSACTION_LABELS = {
  ...Object.fromEntries(Object.entries(TRANSACTION_TYPES).map(([key, value]) => [key, value.label])),
  countAdjustment: "Count adjustment",
  reversal: "Reversal",
};

export const REASON_REQUIRED = ["waste", "damaged", "returnToVendor"];

export const COUNT_STATUS_LABELS = { open: "In progress", submitted: "Awaiting review", approved: "Approved", rejected: "Rejected" };

export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function daysUntil(expiration, today = todayIso()) {
  if (!expiration) return null;
  return Math.round((Date.parse(`${expiration}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * How close an expiration is, against the department's warning days.
 * @returns {{level: "none"|"ok"|"warning"|"soon"|"expired", label: string, days: number|null}}
 */
export function expirationStatus(expiration, warningDays = DEFAULT_EMS_SETTINGS.expirationWarningDays, today = todayIso()) {
  const days = daysUntil(expiration, today);
  if (days === null) return { level: "none", label: "No expiration", days };
  if (days < 0) return { level: "expired", label: `Expired ${-days} day${days === -1 ? "" : "s"} ago`, days };
  const sorted = [...warningDays].sort((a, b) => a - b);
  const smallest = sorted[0] ?? 7;
  const largest = sorted[sorted.length - 1] ?? 90;
  const label = days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`;
  if (days <= smallest) return { level: "soon", label, days };
  if (days <= largest) {
    const bucket = sorted.find((d) => days <= d);
    return { level: "warning", label: `${label} (within ${bucket})`, days };
  }
  return { level: "ok", label, days };
}

export const EXPIRATION_TONES = { none: "neutral", ok: "neutral", warning: "warning", soon: "critical", expired: "critical" };

/** Stock state of a balance for badges and filters. */
export function stockStatus(balance = {}) {
  if (balance.outOfStock) return { key: "out", label: "Out of stock", tone: "critical" };
  if (balance.lowStock) return { key: "low", label: "Low stock", tone: "warning" };
  if (balance.par?.max !== null && balance.par?.max !== undefined && balance.onHand > balance.par.max) {
    return { key: "over", label: "Over max", tone: "info" };
  }
  return { key: "ok", label: "In stock", tone: "neutral" };
}

/** "Station 1 › Supply room › Cabinet A" for a location. */
export function locationPath(location, locationsById = {}) {
  if (!location) return "";
  const names = [...(location.ancestorIds || [])].reverse().map((id) => locationsById[id]?.name).filter(Boolean);
  return [...names, location.name].join(" › ");
}

/** Usable quantity (not expired) of a balance. */
export function usableQuantity(balance = {}, today = todayIso()) {
  return (balance.lots || []).filter((lot) => !lot.expiration || lot.expiration >= today).reduce((sum, lot) => sum + (lot.quantity || 0), 0);
}

export function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(day) {
  if (!day) return "";
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

/** Rows of the inventory valuation (on hand × unit cost) for items with a cost. */
export function inventoryValue(balances = [], itemsById = {}) {
  return balances.reduce((sum, b) => {
    const cost = itemsById[b.itemId]?.unitCost;
    return Number.isFinite(cost) ? sum + cost * (b.onHand || 0) : sum;
  }, 0);
}
