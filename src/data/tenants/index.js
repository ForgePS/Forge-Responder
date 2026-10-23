import {
  createDepartmentProfileTemplate,
  createDepartmentSettingsTemplate,
} from "../defaultDepartment.js";
import { demoDepartmentProfile, demoDepartmentSettings } from "../demoDepartment.js";
import { DEMO_LIST_SEEDS } from "../demoSeeds.js";
import { isDemoDepartment } from "../../lib/tenantPaths.js";

// Every real department starts from the same generic template; its actual
// profile, settings and lists live in Firestore. Only the demo tenant ships
// with sample data.

export function resolveDepartmentProfileDefaults(departmentId = "") {
  if (isDemoDepartment(departmentId)) {
    return { ...demoDepartmentProfile, id: departmentId };
  }
  return createDepartmentProfileTemplate(departmentId);
}

export function resolveDepartmentSettingsDefaults(departmentId = "") {
  if (isDemoDepartment(departmentId)) {
    return { ...demoDepartmentSettings, departmentId };
  }
  return createDepartmentSettingsTemplate(departmentId);
}

export function getTenantListFallback(departmentId, listKey) {
  if (isDemoDepartment(departmentId)) {
    return DEMO_LIST_SEEDS[listKey] ?? [];
  }
  return [];
}

/**
 * Prefix for new personnel IDs: initials of the department id's first two words
 * ("horn-lake-fd" -> "HL", "st-charles" -> "SC"), or its first two letters for a
 * one-word id ("camden" -> "CA").
 */
export function resolvePersonnelIdPrefix(departmentId = "") {
  const words = String(departmentId).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  const slug = (words[0] || "").slice(0, 2).toUpperCase();
  return slug || "P";
}
