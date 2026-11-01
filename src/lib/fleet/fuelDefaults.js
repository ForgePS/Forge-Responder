/** Fuel, energy, and telematics defaults for Phase 8. */

export const FUEL_PRODUCT_TYPES = [
  { id: "diesel", label: "Diesel", unit: "gal" },
  { id: "gasoline", label: "Gasoline", unit: "gal" },
  { id: "biodiesel", label: "Biodiesel", unit: "gal" },
  { id: "e85", label: "E85", unit: "gal" },
  { id: "propane", label: "Propane", unit: "gal" },
  { id: "electric", label: "Electric", unit: "kWh" },
  { id: "other", label: "Other", unit: "unit" },
];

export const FUEL_TRANSACTION_SOURCES = [
  { id: "manual", label: "Manual entry" },
  { id: "fuel_card", label: "Fuel card import" },
  { id: "station_tank", label: "Station tank" },
  { id: "mobile", label: "Mobile fueling" },
  { id: "vendor_invoice", label: "Vendor invoice" },
  { id: "telematics", label: "Telematics" },
  { id: "ev_charger", label: "EV charger" },
];

/**
 * No starter fuel sites: a department's tanks, chargers, and vendors are
 * entered by the department. (Made-up tanks with made-up inventory used to be
 * written here on first view.)
 */
export const STARTER_FUEL_SITES = [];

/**
 * Recommended exception rules. Written only when an admin clicks
 * "Add recommended rules" in Configuration Studio, never just by viewing.
 */
export const STARTER_FUEL_EXCEPTION_RULES = [
  {
    id: "rule-meter-rollback",
    name: "Odometer went backwards",
    ruleType: "meter_rollback",
    enabled: true,
    threshold: 0,
    severity: "high",
    description: "Flags a fill where the mileage entered is lower than the last reading.",
  },
  {
    id: "rule-excess-qty",
    name: "Fill larger than normal",
    ruleType: "excess_quantity",
    enabled: true,
    threshold: 100,
    severity: "medium",
    description: "Flags a fill-up bigger than the amount you set.",
  },
  {
    id: "rule-over-capacity",
    name: "More fuel than the tank had on hand",
    ruleType: "above_capacity",
    enabled: true,
    threshold: 0,
    severity: "high",
    description: "Flags a fill from a station tank that is larger than what the tank had left.",
  },
  {
    id: "rule-type-mismatch",
    name: "Wrong fuel for the site",
    ruleType: "fuel_type_mismatch",
    enabled: true,
    threshold: 0,
    severity: "medium",
    description: "Flags a fill whose fuel type does not match the site's fuel.",
  },
  {
    id: "rule-duplicate",
    name: "Possible duplicate fill",
    ruleType: "duplicate",
    enabled: true,
    threshold: 15,
    severity: "medium",
    description: "Flags the same unit and amount entered twice within the time you set.",
  },
  {
    id: "rule-missing-receipt",
    name: "Missing receipt",
    ruleType: "missing_receipt",
    enabled: true,
    threshold: 0,
    severity: "low",
    description: "Flags fuel card or vendor fills entered without a receipt number.",
  },
];

export const STARTER_TELEMATICS_ADAPTERS = [
  {
    id: "adapter-manual",
    name: "Manual / CSV ingest",
    provider: "manual",
    status: "active",
    syncMeters: true,
    syncFuelLevel: true,
    pollMinutes: 0,
    notes: "Operator-entered or file-imported telematics events.",
  },
  {
    id: "adapter-generic-api",
    name: "Generic API adapter",
    provider: "generic_api",
    status: "configured",
    syncMeters: true,
    syncFuelLevel: true,
    pollMinutes: 15,
    notes: "Placeholder adapter for a future vendor API connection.",
  },
];
