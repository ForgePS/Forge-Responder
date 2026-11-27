/**
 * EMS check-offs: rules with no Firestore access (slice E3 of
 * docs/ems/REPOSITORY_DISCOVERY.md). The browser's copy is
 * src/lib/ems/checkoffLogic.js; tests/unit/emsCheckoffs.test.mjs checks the
 * constants match.
 */

const EMS_ITEM_TYPES = ["ems_equipment", "ems_supplies"];
const EQUIPMENT_STATES = ["present", "damaged", "missing"];
const FREQUENCY_KINDS = ["daily", "weekly", "monthly", "every_n_days"];
const TARGET_TYPES = ["vehicle", "fleetClass", "station"];
const SEVERITIES = ["not_ready", "warning", "off"];
const READINESS_RULE_KEYS = [
  "checkOverdue", "checkFailed", "awaitingSignOff", "signOffReturned", "equipmentOutOfUse",
  "equipmentInspectionOverdue", "requiredEquipmentMissing", "suppliesOut", "suppliesLow", "suppliesExpired",
];
const DEFAULT_SEVERITIES = {
  checkOverdue: "not_ready", checkFailed: "warning", awaitingSignOff: "warning", signOffReturned: "not_ready",
  equipmentOutOfUse: "not_ready", equipmentInspectionOverdue: "warning", requiredEquipmentMissing: "not_ready",
  suppliesOut: "not_ready", suppliesLow: "warning", suppliesExpired: "warning",
};

class CheckoffRuleError extends Error {}

/** The EMS items in a check's template snapshot: [{ key, label, type }]. */
function emsItems(snapshot = {}) {
  const items = [];
  for (const section of snapshot?.sections || []) {
    for (const field of section?.fields || []) {
      if (EMS_ITEM_TYPES.includes(field?.type) && field.key) items.push({ key: String(field.key), label: String(field.label || ""), type: field.type });
    }
  }
  return items;
}

/** The equipment rows of an answer: [{ equipmentId, state, outOfUse, note }], only rows with a known state. */
function equipmentRows(answer = {}) {
  const rows = answer && typeof answer === "object" && answer.rows && typeof answer.rows === "object" ? answer.rows : {};
  return Object.entries(rows)
    .filter(([id, row]) => /^[A-Za-z0-9_-]{1,120}$/.test(id) && EQUIPMENT_STATES.includes(row?.state))
    .map(([equipmentId, row]) => ({
      equipmentId,
      state: row.state,
      outOfUse: row.state === "damaged" && row.outOfUse === true,
      note: String(row.note || "").trim().slice(0, 800),
    }));
}

/**
 * The supply rows of an answer: [{ balanceId, count, expiredFound, note }], only rows
 * with a whole count of 0 or more. Rows are keyed by balance id (<locationId>__<itemId>).
 */
function supplyRows(answer = {}) {
  const rows = answer && typeof answer === "object" && answer.rows && typeof answer.rows === "object" ? answer.rows : {};
  return Object.entries(rows)
    .filter(([id, row]) => /^[A-Za-z0-9_-]{1,120}$/.test(id) && row && row.count !== "" && row.count !== null
      && Number.isInteger(Number(row.count)) && Number(row.count) >= 0 && Number(row.count) <= 1_000_000)
    .map(([balanceId, row]) => ({
      balanceId,
      count: Number(row.count),
      expiredFound: row.expiredFound === true,
      note: String(row.note || "").trim().slice(0, 500),
    }));
}

/**
 * Judge one counted supply against the balance the server read:
 * short when below the par minimum, out at zero, and whether the count differs
 * from what the ledger says is there (a hint to do a full count, never an adjustment).
 */
function judgeSupply(row, balance = {}) {
  const min = Number.isFinite(balance?.par?.min) ? balance.par.min : null;
  const onHand = Number(balance?.onHand) || 0;
  return {
    short: min !== null && row.count < min,
    out: min !== null && min > 0 && row.count === 0,
    shortBy: min !== null && row.count < min ? min - row.count : 0,
    parMin: min,
    ledgerOnHand: onHand,
    countDiffers: row.count !== onHand,
  };
}

function cleanFrequency(input = {}) {
  const kind = String(input?.kind || "");
  if (!FREQUENCY_KINDS.includes(kind)) throw new CheckoffRuleError("Choose how often the check-off is due.");
  if (kind !== "every_n_days") return { kind };
  const days = Number(input.days);
  if (!Number.isInteger(days) || days < 2 || days > 365) throw new CheckoffRuleError("Days between check-offs must be a whole number from 2 to 365.");
  return { kind, days };
}

function cleanReadinessRules(input = {}) {
  const rules = {};
  for (const key of READINESS_RULE_KEYS) {
    const value = input?.[key] === undefined ? DEFAULT_SEVERITIES[key] : String(input[key]);
    if (!SEVERITIES.includes(value)) throw new CheckoffRuleError("Each readiness rule must be Not ready, Warning or Ignore.");
    rules[key] = value;
  }
  const categories = Array.isArray(input?.requiredEquipmentCategories) ? input.requiredEquipmentCategories : [];
  if (categories.length > 40) throw new CheckoffRuleError("List at most 40 required equipment categories.");
  rules.requiredEquipmentCategories = [...new Set(categories.map((c) => String(c || "").trim().slice(0, 80)).filter(Boolean))];
  return rules;
}

module.exports = {
  EMS_ITEM_TYPES,
  EQUIPMENT_STATES,
  FREQUENCY_KINDS,
  TARGET_TYPES,
  SEVERITIES,
  READINESS_RULE_KEYS,
  DEFAULT_SEVERITIES,
  CheckoffRuleError,
  emsItems,
  equipmentRows,
  supplyRows,
  judgeSupply,
  cleanFrequency,
  cleanReadinessRules,
};
