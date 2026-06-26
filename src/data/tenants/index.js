import {
  createDepartmentProfileTemplate,
  createDepartmentSettingsTemplate,
} from "../defaultDepartment.js";
import { demoDepartmentProfile, demoDepartmentSettings } from "../demoDepartment.js";
import { DEMO_LIST_SEEDS } from "../demoSeeds.js";
import {
  DEFAULT_DEPARTMENT_ID,
  HORN_LAKE_DEPARTMENT_ID,
  isDemoDepartment,
} from "../../lib/tenantPaths.js";
import { hornLakeDepartmentProfile, hornLakeDepartmentSettings } from "./hornLakeDepartment.js";
import { HORN_LAKE_LIST_SEEDS } from "./hornLakeSeeds.js";

export { hornLakeDepartmentProfile, hornLakeDepartmentSettings } from "./hornLakeDepartment.js";
export { HORN_LAKE_LIST_SEEDS } from "./hornLakeSeeds.js";

export function resolveDepartmentProfileDefaults(departmentId = "") {
  if (departmentId === HORN_LAKE_DEPARTMENT_ID || departmentId === DEFAULT_DEPARTMENT_ID) {
    return { ...hornLakeDepartmentProfile, id: departmentId || HORN_LAKE_DEPARTMENT_ID };
  }
  if (isDemoDepartment(departmentId)) {
    return { ...demoDepartmentProfile, id: departmentId };
  }
  return createDepartmentProfileTemplate(departmentId);
}

export function resolveDepartmentSettingsDefaults(departmentId = "") {
  if (departmentId === HORN_LAKE_DEPARTMENT_ID || departmentId === DEFAULT_DEPARTMENT_ID) {
    return { ...hornLakeDepartmentSettings, departmentId: departmentId || HORN_LAKE_DEPARTMENT_ID };
  }
  if (isDemoDepartment(departmentId)) {
    return { ...demoDepartmentSettings, departmentId };
  }
  return createDepartmentSettingsTemplate(departmentId);
}

export function getTenantListFallback(departmentId, listKey) {
  if (isDemoDepartment(departmentId)) {
    return DEMO_LIST_SEEDS[listKey] ?? [];
  }
  if (departmentId === HORN_LAKE_DEPARTMENT_ID || departmentId === DEFAULT_DEPARTMENT_ID) {
    return HORN_LAKE_LIST_SEEDS[listKey] ?? [];
  }
  return [];
}

export function resolvePersonnelIdPrefix(departmentId = "") {
  if (departmentId === HORN_LAKE_DEPARTMENT_ID || departmentId === DEFAULT_DEPARTMENT_ID) {
    return "HL";
  }
  const slug = String(departmentId).replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
  return slug || "P";
}
