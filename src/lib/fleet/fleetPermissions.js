import { hasPermission } from "../permissions.js";

export const FLEET_PERMISSION_KEYS = {
  viewDashboard: "viewFleetDashboard",
  viewAssets: "viewFleetAssets",
  editAssets: "editFleetAssets",
  manageConfig: "manageFleetConfig",
  viewReadiness: "viewFleetReadiness",
  conductChecks: "conductFleetChecks",
  viewDefects: "viewFleetDefects",
  editDefects: "editFleetDefects",
  manageStatus: "manageFleetStatus",
  viewWorkOrders: "viewFleetWorkOrders",
  editWorkOrders: "editFleetWorkOrders",
  viewPm: "viewFleetPm",
  editPm: "editFleetPm",
  viewTests: "viewFleetTests",
  editTests: "editFleetTests",
  viewFuel: "viewFleetFuel",
  editFuel: "editFleetFuel",
  viewTelematics: "viewFleetTelematics",
  editTelematics: "editFleetTelematics",
  viewComponents: "viewFleetComponents",
  editComponents: "editFleetComponents",
  viewOperations: "viewFleetOperations",
  editOperations: "editFleetOperations",
  viewRisk: "viewFleetRisk",
  editRisk: "editFleetRisk",
  viewAccidentSensitive: "viewFleetAccidentSensitive",
  viewProcurement: "viewFleetProcurement",
  editProcurement: "editFleetProcurement",
  viewCost: "viewFleetCost",
  editCost: "editFleetCost",
  viewReporting: "viewFleetReporting",
  editReporting: "editFleetReporting",
  viewVendorPortal: "viewFleetVendorPortal",
  editVendorPortal: "editFleetVendorPortal",
};

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetDashboard(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewDashboard)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetAssets(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewDashboard)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetAssets(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageFleetConfig(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, "manageSystemSettings")
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetReadiness(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewReadiness)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewDashboard)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canConductFleetChecks(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.conductChecks)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetDefects(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewDefects)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewReadiness)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetDefects(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editDefects)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageFleetStatus(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.manageStatus)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editDefects)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetWorkOrders(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewWorkOrders)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewDefects)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetWorkOrders(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editWorkOrders)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editDefects)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetPm(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewPm)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewWorkOrders)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetPm(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editPm)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editWorkOrders)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetTests(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewTests)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewPm)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetTests(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editTests)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editPm)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetFuel(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewFuel)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewTelematics)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetFuel(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editFuel)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editTelematics)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetTelematics(permissions = {}, isCreator = false) {
  return canViewFleetFuel(permissions, isCreator)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewTelematics);
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetTelematics(permissions = {}, isCreator = false) {
  return canEditFleetFuel(permissions, isCreator)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editTelematics);
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetComponents(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewComponents)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewWorkOrders)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetComponents(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editComponents)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editWorkOrders)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetOperations(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewOperations)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewComponents)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetOperations(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editOperations)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.manageStatus)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetRisk(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewRisk)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewOperations)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetRisk(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editRisk)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editOperations)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * Restricted accident fields (legal, medical, preventability).
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetAccidentSensitive(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAccidentSensitive)
    || hasPermission(permissions, "manageSystemSettings")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetProcurement(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewProcurement)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetProcurement(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editProcurement)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetCost(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewCost)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewProcurement)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetCost(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editCost)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editProcurement)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetReporting(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewReporting)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewDashboard)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetReporting(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editReporting)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFleetVendorPortal(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewVendorPortal)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewWorkOrders)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.viewAssets)
    || hasPermission(permissions, "viewApparatus")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFleetVendorPortal(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editVendorPortal)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editWorkOrders)
    || hasPermission(permissions, FLEET_PERMISSION_KEYS.editAssets)
    || hasPermission(permissions, "editApparatus")
  );
}

/** @type {Record<string, string>} */
export const FLEET_NAV_PERMISSION_MAP = {
  "Fleet Dashboard": FLEET_PERMISSION_KEYS.viewDashboard,
  "Readiness Board": FLEET_PERMISSION_KEYS.viewReadiness,
  "Fleet Defects": FLEET_PERMISSION_KEYS.viewDefects,
  "Fleet Work Orders": FLEET_PERMISSION_KEYS.viewWorkOrders,
  "PM Forecast": FLEET_PERMISSION_KEYS.viewPm,
  "Fleet Tests": FLEET_PERMISSION_KEYS.viewTests,
  "Fuel & Energy": FLEET_PERMISSION_KEYS.viewFuel,
  "Components & Warranty": FLEET_PERMISSION_KEYS.viewComponents,
  "Fleet Operations": FLEET_PERMISSION_KEYS.viewOperations,
  "Accident & Risk": FLEET_PERMISSION_KEYS.viewRisk,
  "Fleet Procurement": FLEET_PERMISSION_KEYS.viewProcurement,
  "Cost & Replacement": FLEET_PERMISSION_KEYS.viewCost,
  "Reporting & Automation": FLEET_PERMISSION_KEYS.viewReporting,
  "Vendor Portal": FLEET_PERMISSION_KEYS.viewVendorPortal,
  "Fleet Hardening": FLEET_PERMISSION_KEYS.manageConfig,
  "All Fleet Assets": FLEET_PERMISSION_KEYS.viewAssets,
  "Fleet Configuration Studio": FLEET_PERMISSION_KEYS.manageConfig,
};
