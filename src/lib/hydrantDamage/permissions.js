import { hasPermission } from "../permissions.js";

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canViewHydrantDamage(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "viewHydrantDamageReports")
    || hasPermission(permissions, "viewHydrants")
    || hasPermission(permissions, "viewInspections");
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canCreateHydrantDamage(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "createHydrantDamageReports")
    || hasPermission(permissions, "editHydrants");
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canEditHydrantDamageDraft(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "editHydrantDamageDrafts")
    || canCreateHydrantDamage(permissions, isCreator);
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canSendHydrantDamage(permissions, isCreator = false) {
  return isCreator || hasPermission(permissions, "sendHydrantDamageReports");
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canManageWaterCompanies(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "manageWaterCompanies")
    || hasPermission(permissions, "editHydrants");
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canViewWaterCompanies(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "viewWaterCompanies")
    || canViewHydrantDamage(permissions, isCreator);
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canManageWaterDistricts(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "manageWaterDistricts")
    || canManageWaterCompanies(permissions, isCreator);
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canViewWaterDistricts(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "viewWaterDistricts")
    || canViewWaterCompanies(permissions, isCreator);
}

export function canVerifyHydrantDamage(permissions, isCreator = false) {
  return isCreator || hasPermission(permissions, "verifyHydrantDamageReports");
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canAcknowledgeHydrantDamage(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "acknowledgeHydrantDamageReports")
    || canSendHydrantDamage(permissions, isCreator)
    || canVerifyHydrantDamage(permissions, isCreator);
}

/**
 * @param {Record<string, boolean>|undefined} permissions
 * @param {boolean} [isCreator]
 */
export function canEscalateHydrantDamage(permissions, isCreator = false) {
  return isCreator
    || hasPermission(permissions, "escalateHydrantDamageReports")
    || canSendHydrantDamage(permissions, isCreator)
    || canAcknowledgeHydrantDamage(permissions, isCreator);
}
