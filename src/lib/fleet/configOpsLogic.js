/**
 * Plain-language labels and small pure helpers for the Configuration Studio
 * "Testing Programs", "Fuel", and "Roadside & Towing" tabs.
 * Firebase-free so it can be unit tested with node --test.
 */

// ——— Testing programs ———

export const TEST_PROGRAM_TYPES = [
  { id: "hose", label: "Hose" },
  { id: "pump_performance", label: "Pump performance" },
  { id: "ground_ladder", label: "Ground ladder" },
  { id: "aerial_device", label: "Aerial device" },
  { id: "generator", label: "Generator" },
  { id: "custom", label: "Other" },
];

export function testProgramTypeLabel(id) {
  return TEST_PROGRAM_TYPES.find((row) => row.id === id)?.label || "Other";
}

export function newTestProgramDraft() {
  return {
    id: "",
    name: "",
    programType: "custom",
    standardReference: "",
    intervalMonths: 12,
    dueSoonDays: 30,
    createDefectOnFail: true,
    blockReturnToServiceOnFail: false,
    certificateRequired: true,
    active: true,
  };
}

/**
 * Decide how a program is removed. Programs with recorded tests are turned off
 * (so test history keeps its program). The last remaining program is also only
 * turned off, because an empty program list is re-filled with the starter set.
 * @param {number} referencingTestCount
 * @param {number} programCount total saved programs (including this one)
 * @returns {"deactivate"|"delete"}
 */
export function testProgramRemovalMode(referencingTestCount, programCount) {
  if (Number(referencingTestCount) > 0) return "deactivate";
  if (Number(programCount) <= 1) return "deactivate";
  return "delete";
}

// ——— Fuel ———

export const FUEL_SITE_TYPES = [
  { id: "station_tank", label: "Station fuel tank" },
  { id: "ev_charger", label: "EV charger" },
  { id: "mobile", label: "Mobile fueling" },
  { id: "vendor", label: "Outside vendor / fuel card" },
];

export function fuelSiteTypeLabel(id) {
  return FUEL_SITE_TYPES.find((row) => row.id === id)?.label || "Fuel site";
}

/** Site types that hold an on-hand quantity we track. */
export function siteTracksInventory(siteType) {
  return siteType === "station_tank" || siteType === "mobile";
}

export function fuelUnitFor(product, products = []) {
  const unit = products.find((row) => row.id === product)?.unit || "gal";
  if (unit === "gal") return "gallons";
  if (unit === "kWh") return "kWh";
  return "units";
}

export function newFuelSiteDraft() {
  return {
    id: "",
    name: "",
    siteType: "station_tank",
    product: "diesel",
    capacity: 0,
    currentInventory: 0,
    location: "",
    connectorType: "",
    active: true,
  };
}

/**
 * Exception rule kinds the fuel log actually checks. Only these can be added;
 * a rule of any other kind would never fire.
 */
export const FUEL_RULE_TYPES = [
  {
    id: "excess_quantity",
    label: "Fill larger than normal",
    explain: "Flags a fill-up bigger than the amount you set.",
    threshold: { label: "Flag fills over", unit: "gallons (kWh for EV)", defaultValue: 100 },
  },
  {
    id: "above_capacity",
    label: "More fuel than the tank had on hand",
    explain: "Flags a fill from a station tank that is larger than what the tank had left.",
    threshold: null,
  },
  {
    id: "meter_rollback",
    label: "Odometer went backwards",
    explain: "Flags a fill where the mileage entered is lower than the last reading.",
    threshold: null,
  },
  {
    id: "fuel_type_mismatch",
    label: "Wrong fuel for the site",
    explain: "Flags a fill whose fuel type does not match the site's fuel.",
    threshold: null,
  },
  {
    id: "duplicate",
    label: "Possible duplicate fill",
    explain: "Flags the same unit and amount entered twice within the time you set.",
    threshold: { label: "Within", unit: "minutes", defaultValue: 15 },
  },
  {
    id: "missing_receipt",
    label: "Missing receipt",
    explain: "Flags fuel card or vendor fills entered without a receipt number.",
    threshold: null,
  },
];

export function fuelRuleType(id) {
  return FUEL_RULE_TYPES.find((row) => row.id === id) || null;
}

export function fuelRuleTypeLabel(id) {
  return fuelRuleType(id)?.label || "Custom check (not used)";
}

/** Short plain summary of a rule's setting, e.g. "Over 100 gallons". */
export function describeFuelRuleSetting(rule = {}) {
  const meta = fuelRuleType(rule.ruleType);
  if (!meta) return "";
  if (!meta.threshold) return "";
  const value = Number(rule.threshold) || meta.threshold.defaultValue;
  if (rule.ruleType === "duplicate") return `Within ${value} minutes`;
  return `Over ${value} ${meta.threshold.unit}`;
}

export const SEVERITY_LABELS = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

export function newFuelRuleDraft(ruleType = "excess_quantity") {
  const meta = fuelRuleType(ruleType) || FUEL_RULE_TYPES[0];
  return {
    id: "",
    name: meta.label,
    ruleType: meta.id,
    enabled: true,
    threshold: meta.threshold?.defaultValue ?? 0,
    severity: "medium",
    description: meta.explain,
  };
}

/**
 * Recommended rules not yet saved (matched by id or by kind).
 * @param {object[]} existing
 * @param {object[]} recommended
 */
export function missingRecommendedRules(existing = [], recommended = []) {
  const ids = new Set(existing.map((row) => row.id));
  const kinds = new Set(existing.map((row) => row.ruleType));
  return recommended.filter((row) => !ids.has(row.id) && !kinds.has(row.ruleType));
}

// ——— Roadside & towing ———

export function activeProviders(providers = []) {
  return providers.filter((row) => row && row.active !== false);
}

/**
 * The provider for a roadside call: the chosen one, only if it is active.
 * Never falls back to some other provider.
 */
export function pickRoadsideProvider(providers = [], providerId = "") {
  if (!providerId) return null;
  return activeProviders(providers).find((row) => row.id === providerId) || null;
}

export function newTowProviderDraft() {
  return { id: "", name: "", phone: "", afterHoursPhone: "", services: "", notes: "", active: true };
}

/** Sort helper: active first, then by name. */
export function byActiveThenName(a, b) {
  const aa = a.active === false || a.enabled === false ? 1 : 0;
  const bb = b.active === false || b.enabled === false ? 1 : 0;
  return aa - bb || String(a.name || "").localeCompare(String(b.name || ""));
}
