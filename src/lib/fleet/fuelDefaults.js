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

export const STARTER_FUEL_SITES = [
  {
    id: "site-hq-diesel",
    name: "HQ diesel tank",
    siteType: "station_tank",
    product: "diesel",
    capacity: 5000,
    currentInventory: 3200,
    location: "Headquarters",
    active: true,
  },
  {
    id: "site-hq-gas",
    name: "HQ gasoline tank",
    siteType: "station_tank",
    product: "gasoline",
    capacity: 2000,
    currentInventory: 1100,
    location: "Headquarters",
    active: true,
  },
  {
    id: "site-ev-bay1",
    name: "EV charger bay 1",
    siteType: "ev_charger",
    product: "electric",
    capacity: 0,
    currentInventory: 0,
    location: "Headquarters",
    connectorType: "J1772",
    active: true,
  },
];

export const STARTER_FUEL_EXCEPTION_RULES = [
  {
    id: "rule-meter-rollback",
    name: "Meter rollback",
    ruleType: "meter_rollback",
    enabled: true,
    threshold: 0,
    severity: "high",
    description: "Flag when reported meter is lower than the previous reading.",
  },
  {
    id: "rule-excess-qty",
    name: "Excess quantity",
    ruleType: "excess_quantity",
    enabled: true,
    threshold: 100,
    severity: "medium",
    description: "Flag transactions above the quantity threshold (gallons / kWh).",
  },
  {
    id: "rule-over-capacity",
    name: "Above tank capacity",
    ruleType: "above_capacity",
    enabled: true,
    threshold: 0,
    severity: "high",
    description: "Flag when quantity exceeds the fuel site remaining capacity.",
  },
  {
    id: "rule-type-mismatch",
    name: "Fuel type mismatch",
    ruleType: "fuel_type_mismatch",
    enabled: true,
    threshold: 0,
    severity: "medium",
    description: "Flag when transaction product does not match the selected site product.",
  },
  {
    id: "rule-duplicate",
    name: "Duplicate transaction",
    ruleType: "duplicate",
    enabled: true,
    threshold: 15,
    severity: "medium",
    description: "Flag near-duplicate transactions for the same asset within N minutes.",
  },
  {
    id: "rule-missing-receipt",
    name: "Missing receipt",
    ruleType: "missing_receipt",
    enabled: true,
    threshold: 0,
    severity: "low",
    description: "Flag card / vendor transactions without a receipt reference.",
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
