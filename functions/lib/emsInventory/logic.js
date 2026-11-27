/**
 * EMS supply inventory: pure rules (no Firestore). The service in ./service.js
 * reads documents, calls these, and writes the results in one transaction.
 *
 * Balance document (departments/<id>/emsInventoryBalances/<locationId>__<itemId>):
 *   { itemId, locationId, onHand, lots: [{ key, lot, expiration, quantity, receivedAt, held }],
 *     earliestExpiration, par: { min, max, reorderPoint, reorderQuantity } | null,
 *     heldQuantity, lowStock, outOfStock, lastTransactionId, updatedAt }
 *
 * A lot can be on hold (quarantined, for example by a medication recall): an
 * emsLotHolds document for the item and lot key. Held stock stays on hand but
 * can't be used, and low / out of stock count only what isn't held.
 *
 * The ledger (emsInventoryTransactions) is the record of truth; a balance is the
 * running total of every ledger line for that item at that location. Quantities
 * never go below zero.
 */
const crypto = require("node:crypto");

const ROTATION_POLICIES = ["fefo", "fifo"];

const DEFAULT_SETTINGS = Object.freeze({
  rotationPolicy: "fefo",
  expirationWarningDays: [90, 60, 30, 14, 7],
});

const LOCATION_TYPES = ["station", "storageArea", "cabinet", "shelf", "bin", "vehicle"];

const DEFAULT_SUPPLY_CATEGORIES = [
  "IV supplies", "IV fluids", "Airway supplies", "Oxygen supplies", "Trauma supplies", "Bandages",
  "Dressings", "Syringes", "Needles", "Gloves", "PPE", "Diagnostic disposables", "Wound care",
  "Patient care supplies", "General medical consumables",
];

/**
 * Transaction types members can post directly. `use` = useEmsSupplies,
 * `manage` = manageEmsInventory. Count adjustments and reversals are posted only
 * by the approval and reversal flows.
 *   in:   adds stock at `toLocationId`
 *   out:  removes stock from `fromLocationId`
 *   move: removes from `fromLocationId`, adds the same lots at `toLocationId`
 * `stock` decides which lots may be picked automatically for an out/move.
 */
// `held`: how lots on hold are treated. exclude = never taken; explicit = only when
// that lot is chosen (moving held stock to a quarantine area); include = may be taken.
const TRANSACTION_TYPES = Object.freeze({
  receive: { label: "Received", direction: "in", access: "manage" },
  usage: { label: "Used", direction: "out", access: "use", stock: "unexpired", held: "exclude" },
  transfer: { label: "Transferred", direction: "move", access: "use", stock: "unexpired", held: "explicit" },
  expired: { label: "Removed: expired", direction: "out", access: "use", stock: "expired", held: "include" },
  damaged: { label: "Removed: damaged", direction: "out", access: "use", stock: "any", held: "include" },
  waste: { label: "Wasted", direction: "out", access: "manage", stock: "any", held: "include" },
  returnToVendor: { label: "Returned to vendor", direction: "out", access: "manage", stock: "any", held: "include" },
});

const INTERNAL_TYPES = Object.freeze({
  countAdjustment: { label: "Count adjustment" },
  reversal: { label: "Reversal" },
});

// ---------------------------------------------------------------- medications (E4)

const ITEM_CLASSES = ["supply", "medication"];
const DOSAGE_FORMS = [
  "Vial", "Ampule", "Prefilled syringe", "Autoinjector", "IV bag", "Tablet", "Chewable tablet",
  "Orally dissolving tablet", "Oral solution", "Oral gel", "Nebulizer solution", "Metered-dose inhaler",
  "Nasal spray", "Topical", "Compressed gas", "Other",
];
const ROUTES = ["IV", "IO", "IM", "SC", "IN", "PO", "SL", "Buccal", "Inhaled", "ET", "Topical", "PR"];
const CONTROLLED_SCHEDULES = ["", "II", "III", "IV", "V"];
const STORAGE_CONDITIONS = ["room", "refrigerated", "frozen"];
const RECALL_CLASSES = ["", "I", "II", "III"];
const DEFAULT_MEDICATION_CATEGORIES = [
  "Cardiac", "Respiratory", "Analgesics", "Antiemetics", "Anticonvulsants", "Sedation", "Antidotes",
  "Allergy and anaphylaxis", "Diabetic", "IV fluids", "Electrolytes", "Obstetric", "Other medications",
];

/**
 * An NDC as entered (10 digits in 4-4-2, 5-3-2 or 5-4-1 form, or 11 digits in 5-4-2
 * form) and its 11-digit 5-4-2 form. Returns null when it isn't an NDC.
 */
function normalizeNdc(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return { ndc: "", ndc11: "" };
  const parts = raw.split("-");
  const digits = raw.replace(/-/g, "");
  if (!/^\d+$/.test(digits)) return null;
  let segments;
  if (parts.length === 3) {
    const shape = parts.map((p) => p.length).join("-");
    if (shape === "4-4-2") segments = [`0${parts[0]}`, parts[1], parts[2]];
    else if (shape === "5-3-2") segments = [parts[0], `0${parts[1]}`, parts[2]];
    else if (shape === "5-4-1") segments = [parts[0], parts[1], `0${parts[2]}`];
    else if (shape === "5-4-2") segments = parts;
    else return null;
  } else if (parts.length === 1 && digits.length === 11) {
    segments = [digits.slice(0, 5), digits.slice(5, 9), digits.slice(9)];
  } else {
    return null; // 10 digits without dashes are ambiguous
  }
  return { ndc: raw, ndc11: segments.join("-") };
}

/** Lot numbers compare without case, spaces or dashes ("AB-123" = "ab123"). */
function sameLotNumber(a = "", b = "") {
  const clean = (v) => String(v || "").toUpperCase().replace(/[\s-]/g, "");
  return Boolean(clean(a)) && clean(a) === clean(b);
}

/** Does an open recall cover this lot of this item? An empty lot list means every lot. */
function recallCovers(recall = {}, itemId = "", lotNumber = "") {
  if (recall.status !== "open" || !(recall.itemIds || []).includes(itemId)) return false;
  const lots = recall.lotNumbers || [];
  return !lots.length || lots.some((l) => sameLotNumber(l, lotNumber));
}

function holdId(itemId, key) {
  return `${itemId}__${key}`;
}

class InventoryRuleError extends Error {
  constructor(message) {
    super(message);
    this.name = "InventoryRuleError";
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** "YYYY-MM-DD" for a Date in UTC. */
function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function balanceId(locationId, itemId) {
  return `${locationId}__${itemId}`;
}

/** Stable key for a lot at a location: same lot number + expiration = same key everywhere. */
function lotKey(lot = "", expiration = "") {
  return crypto.createHash("sha256").update(`${lot}\u0000${expiration}`).digest("hex").slice(0, 16);
}

/** Whole, non-negative quantity (supplies are counted in whole units of measure). */
function wholeQuantity(value, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || (!allowZero && n === 0) || n > 1_000_000) return null;
  return n;
}

function isExpired(lot, today) {
  return Boolean(lot.expiration) && lot.expiration < today;
}

/** Lots in the order stock should leave: FEFO (soonest expiration first) or FIFO (oldest receipt first). */
function orderLots(lots = [], policy = "fefo") {
  const received = (lot) => lot.receivedAt || "";
  return [...lots].sort((a, b) => {
    if (policy === "fefo") {
      const ae = a.expiration || "9999-12-31";
      const be = b.expiration || "9999-12-31";
      if (ae !== be) return ae < be ? -1 : 1;
    }
    if (received(a) !== received(b)) return received(a) < received(b) ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/**
 * Which lots to take `quantity` from.
 * @param {object[]} lots balance lots
 * @param {number} quantity
 * @param {{policy?: string, today: string, stock?: "unexpired"|"expired"|"any", lotKey?: string}} options
 * @returns {{key: string, lot: string, expiration: string, receivedAt: string, take: number}[]}
 */
function pickLots(lots, quantity, { policy = "fefo", today, stock = "any", lotKey: chosen = "", heldKeys = new Set(), held: heldRule = "include" } = {}) {
  const inStock = (lots || []).filter((lot) => lot.quantity > 0);
  const isHeld = (lot) => heldKeys.has(lot.key);
  let candidates;
  if (chosen) {
    candidates = inStock.filter((lot) => lot.key === chosen);
    if (!candidates.length) throw new InventoryRuleError("That lot isn't in stock at this location.");
    if (heldRule === "exclude" && isHeld(candidates[0])) {
      throw new InventoryRuleError(`Lot ${candidates[0].lot || "(no lot)"} is on hold and can't be used.`);
    }
    if (stock === "unexpired" && isExpired(candidates[0], today)) {
      throw new InventoryRuleError(`Lot ${candidates[0].lot || "(no lot)"} expired on ${candidates[0].expiration}. Remove it as expired instead.`);
    }
    if (stock === "expired" && !isExpired(candidates[0], today)) {
      throw new InventoryRuleError(`Lot ${candidates[0].lot || "(no lot)"} hasn't expired. Remove it as damaged or waste, with a reason, instead.`);
    }
  } else {
    const pickable = heldRule === "include" ? inStock : inStock.filter((lot) => !isHeld(lot));
    if (stock === "unexpired") candidates = pickable.filter((lot) => !isExpired(lot, today));
    else if (stock === "expired") candidates = pickable.filter((lot) => isExpired(lot, today));
    else candidates = pickable;
  }
  const available = candidates.reduce((sum, lot) => sum + lot.quantity, 0);
  if (available < quantity) {
    const total = inStock.reduce((sum, lot) => sum + lot.quantity, 0);
    const onHold = inStock.filter(isHeld).reduce((sum, lot) => sum + lot.quantity, 0);
    if (!chosen && heldRule !== "include" && onHold > 0 && total >= quantity) {
      throw new InventoryRuleError(`Only ${available} usable on hand; ${onHold} ${onHold === 1 ? "is" : "are"} on hold.`);
    }
    if (stock === "unexpired" && total >= quantity) {
      throw new InventoryRuleError(`Only ${available} usable on hand; the rest is expired. Remove expired stock first.`);
    }
    if (stock === "expired") throw new InventoryRuleError(`Only ${available} expired on hand at this location.`);
    throw new InventoryRuleError(`Only ${available} on hand at this location.`);
  }
  const picks = [];
  let remaining = quantity;
  for (const lot of orderLots(candidates, policy)) {
    if (!remaining) break;
    const take = Math.min(lot.quantity, remaining);
    picks.push({ key: lot.key, lot: lot.lot || "", expiration: lot.expiration || "", receivedAt: lot.receivedAt || "", take });
    remaining -= take;
  }
  return picks;
}

/** Flags kept on the balance so lists can filter without recomputing. Held stock isn't usable. */
function balanceFlags(onHand, par, lots = []) {
  const reorderPoint = par && Number.isFinite(par.reorderPoint) ? par.reorderPoint : null;
  const min = par && Number.isFinite(par.min) ? par.min : null;
  const threshold = reorderPoint ?? min;
  const expirations = lots.filter((lot) => lot.quantity > 0 && lot.expiration).map((lot) => lot.expiration).sort();
  const heldQuantity = lots.filter((lot) => lot.held && lot.quantity > 0).reduce((sum, lot) => sum + lot.quantity, 0);
  const usable = onHand - heldQuantity;
  return {
    heldQuantity,
    lowStock: threshold !== null && usable <= threshold,
    outOfStock: Boolean(par) && usable === 0,
    earliestExpiration: expirations[0] || "",
  };
}

/** A balance with each lot's hold flag set from `heldKeys`, and the flags recomputed. */
function withHolds(balance, heldKeys = new Set()) {
  const lots = (balance.lots || []).map((lot) => ({ ...lot, held: heldKeys.has(lot.key) }));
  return { ...balance, lots, ...balanceFlags(balance.onHand || 0, balance.par || null, lots) };
}

/**
 * Apply ledger lines for one balance. Returns the new balance; throws when any
 * lot would go below zero (the whole transaction is then refused).
 * @param {object|null} balance current balance doc (null = none yet)
 * @param {{key: string, lot: string, expiration: string, receivedAt: string, delta: number}[]} lines
 */
function applyLines(balance, lines, { itemId, locationId, transactionId, at, heldKeys = new Set() }) {
  const lots = (balance?.lots || []).map((lot) => ({ ...lot }));
  for (const line of lines) {
    let lot = lots.find((l) => l.key === line.key);
    if (!lot) {
      if (line.delta < 0) throw new InventoryRuleError("That lot isn't in stock at this location.");
      lot = { key: line.key, lot: line.lot || "", expiration: line.expiration || "", quantity: 0, receivedAt: line.receivedAt || at };
      lots.push(lot);
    }
    lot.quantity += line.delta;
    if (lot.quantity < 0) {
      throw new InventoryRuleError(`That would leave less than zero of lot ${lot.lot || "(no lot)"} at this location.`);
    }
  }
  const kept = lots.filter((lot) => lot.quantity > 0).map((lot) => ({ ...lot, held: heldKeys.has(lot.key) }));
  const onHand = kept.reduce((sum, lot) => sum + lot.quantity, 0);
  const par = balance?.par || null;
  return {
    id: balanceId(locationId, itemId),
    itemId,
    locationId,
    par,
    ...(balance || {}),
    lots: orderLots(kept, "fefo"),
    onHand,
    ...balanceFlags(onHand, par, kept),
    lastTransactionId: transactionId,
    updatedAt: at,
  };
}

/**
 * Ledger lines for a posted transaction: one per lot per location (negative = out).
 * @returns {{locationId: string, key: string, lot: string, expiration: string, receivedAt: string, delta: number}[]}
 */
function linesFor(type, { quantity, fromLocationId, toLocationId, fromBalance, lot, expiration, lotKey: chosen, policy, today, at, heldKeys }) {
  const rule = TRANSACTION_TYPES[type];
  if (!rule) throw new InventoryRuleError("Unknown transaction type.");
  if (rule.direction === "in") {
    const key = lotKey(lot, expiration);
    return [{ locationId: toLocationId, key, lot, expiration, receivedAt: at, delta: quantity }];
  }
  const picks = pickLots(fromBalance?.lots || [], quantity, { policy, today, stock: rule.stock, lotKey: chosen, heldKeys, held: rule.held });
  const out = picks.map((p) => ({ locationId: fromLocationId, key: p.key, lot: p.lot, expiration: p.expiration, receivedAt: p.receivedAt, delta: -p.take }));
  if (rule.direction === "out") return out;
  return [...out, ...picks.map((p) => ({ locationId: toLocationId, key: p.key, lot: p.lot, expiration: p.expiration, receivedAt: p.receivedAt, delta: p.take }))];
}

/** The opposite of a transaction's lines, for a reversal. */
function reversedLines(lines = []) {
  return lines.map((line) => ({ ...line, delta: -line.delta }));
}

/** Group lines by location id. */
function linesByLocation(lines = []) {
  const groups = new Map();
  for (const line of lines) {
    if (!groups.has(line.locationId)) groups.set(line.locationId, []);
    groups.get(line.locationId).push(line);
  }
  return groups;
}

/**
 * Count variance per row. Rows with a variance need a reason before submitting.
 * @param {{expected: number, counted: number|null, reason?: string}[]} rows
 */
function countProblems(rows = []) {
  const problems = [];
  rows.forEach((row, index) => {
    if (row.counted === null || row.counted === undefined) problems.push({ index, problem: "not counted" });
    else if (row.counted !== row.expected && !String(row.reason || "").trim()) problems.push({ index, problem: "needs a reason" });
  });
  return problems;
}

/** Days until a lot expires (negative = expired). */
function daysUntil(expiration, today) {
  if (!expiration) return null;
  return Math.round((Date.parse(`${expiration}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

module.exports = {
  CONTROLLED_SCHEDULES,
  DEFAULT_MEDICATION_CATEGORIES,
  DOSAGE_FORMS,
  ITEM_CLASSES,
  RECALL_CLASSES,
  ROUTES,
  STORAGE_CONDITIONS,
  holdId,
  normalizeNdc,
  recallCovers,
  sameLotNumber,
  withHolds,
  DEFAULT_SETTINGS,
  DEFAULT_SUPPLY_CATEGORIES,
  INTERNAL_TYPES,
  InventoryRuleError,
  LOCATION_TYPES,
  ROTATION_POLICIES,
  TRANSACTION_TYPES,
  applyLines,
  balanceFlags,
  balanceId,
  countProblems,
  daysUntil,
  isExpired,
  isValidDate,
  isoDay,
  linesByLocation,
  linesFor,
  lotKey,
  orderLots,
  pickLots,
  reversedLines,
  wholeQuantity,
};
