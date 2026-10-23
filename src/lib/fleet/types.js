/** @typedef {Record<string, string>} FleetNavLabels */

/**
 * Default Fleet V2 nav keys (coexist with classic Apparatus/Assets/Maintenance/Hose).
 * @type {string[]}
 */
export const DEFAULT_FLEET_NAV_KEYS = [
  "fleetDashboard",
  "allFleetAssets",
  "fleetConfigStudio",
];

export const DEFAULT_FLEET_STATUSES = [
  { id: "in_service", label: "In Service", color: "success" },
  { id: "out_of_service", label: "Out of Service", color: "critical" },
  { id: "reserve", label: "Reserve", color: "warning" },
  { id: "restricted", label: "Restricted Service", color: "warning" },
  { id: "decommissioned", label: "Decommissioned", color: "muted" },
];

/**
 * @param {string} [departmentId]
 */
export function createEmptyFleetSettings(departmentId = "") {
  return {
    departmentId,
    moduleV2Enabled: true,
    moduleName: "Fleet",
    navLabels: {
      fleetDashboard: "Fleet Dashboard",
      allFleetAssets: "All Fleet Assets",
      fleetConfigStudio: "Fleet Configuration Studio",
      apparatus: "Apparatus",
      assets: "Assets",
      maintenance: "Maintenance",
      hoseTesting: "Hose Testing",
    },
    enabledNavKeys: [...DEFAULT_FLEET_NAV_KEYS],
    numbering: {
      prefix: "FLT",
      separator: "-",
      padding: 4,
      nextSequence: 1,
    },
    statuses: [...DEFAULT_FLEET_STATUSES],
    terminology: {
      assetSingular: "Fleet asset",
      assetPlural: "Fleet assets",
      apparatusSingular: "Apparatus",
      apparatusPlural: "Apparatus",
    },
    /** When true, classic Apparatus UI redirects to All Fleet Assets and list writes are discouraged. */
    legacyApparatusWritesLocked: false,
    /** Soft redirect classic Apparatus nav → All Fleet Assets after successful migration. */
    redirectApparatusToFleetAssets: false,
    lastMigrationReportId: "",
    lastMigrationAt: "",
    lastMigrationMode: "",
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * Starter fleet classes (tenant-owned editable copies).
 */
export const STARTER_FLEET_CLASSES = [
  {
    id: "class-engine",
    name: "Engine / Pumper",
    category: "emergency_response",
    description: "Structural fire engine / pumper apparatus",
    defaultMeterTypes: ["mileage", "engine_hours", "pump_hours"],
    active: true,
  },
  {
    id: "class-aerial",
    name: "Aerial / Ladder",
    category: "emergency_response",
    description: "Aerial ladder, tower, or quint",
    defaultMeterTypes: ["mileage", "engine_hours", "aerial_hours"],
    active: true,
  },
  {
    id: "class-ambulance",
    name: "Ambulance / Medic",
    category: "ems",
    description: "EMS transport or medic unit",
    defaultMeterTypes: ["mileage", "engine_hours"],
    active: true,
  },
  {
    id: "class-brush",
    name: "Brush / Wildland",
    category: "emergency_response",
    description: "Wildland engine, brush truck, or mini-pumper",
    defaultMeterTypes: ["mileage", "engine_hours"],
    active: true,
  },
  {
    id: "class-staff",
    name: "Staff / Support",
    category: "support",
    description: "Staff car, SUV, pickup, or utility vehicle",
    defaultMeterTypes: ["mileage"],
    active: true,
  },
];
