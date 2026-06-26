import { DEFAULT_PLATFORM_LOGO_PATH } from "./brandAssets.js";
import { normalizeGatewayDepartmentId, RESERVED_GATEWAY_PATHS } from "./gatewayRouting.js";
import { applyPlatformToDepartmentProfile } from "./platformInheritance.js";

export function slugifyDepartmentId(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateDepartmentId(departmentId, existingIds = []) {
  const normalized = slugifyDepartmentId(departmentId);
  if (!normalized) {
    return { valid: false, message: "Department ID is required." };
  }
  if (normalized.length < 3) {
    return { valid: false, message: "Department ID must be at least 3 characters." };
  }
  if (RESERVED_GATEWAY_PATHS.has(normalized)) {
    return { valid: false, message: `"${normalized}" is reserved. Choose a different ID.` };
  }
  if (existingIds.includes(normalized)) {
    return { valid: false, message: `Department ID "${normalized}" already exists.` };
  }
  return { valid: true, id: normalized };
}

export function buildNewDepartmentProfile(departmentId, input = {}, platformConfig = {}) {
  const name = input.name?.trim() || departmentId;
  const shortName = input.shortName?.trim() || name;

  return applyPlatformToDepartmentProfile({
    id: departmentId,
    name,
    shortName,
    displayTitle: input.displayTitle?.trim() || name,
    themeName: name,
    branchLabel: input.branchLabel?.trim() || "Department Branch",
    logoUrl: input.logoUrl || DEFAULT_PLATFORM_LOGO_PATH,
    address: input.address?.trim() || "",
    contactEmail: input.contactEmail?.trim() || "",
    contactPhone: input.contactPhone?.trim() || "",
    timezone: input.timezone?.trim() || "America/Chicago",
    stations: [],
    shifts: [],
    status: "active"
  }, platformConfig, departmentId);
}

export function buildDepartmentGatewayRecord(departmentId, profile = {}) {
  const gatewayId = normalizeGatewayDepartmentId(departmentId);
  return {
    gatewayId,
    departmentId: gatewayId,
    label: profile.name || gatewayId,
    departmentName: profile.name || gatewayId,
    departmentShortName: profile.shortName || profile.name || gatewayId,
    logoUrl: profile.logoUrl || DEFAULT_PLATFORM_LOGO_PATH,
    status: profile.status || "active"
  };
}

export function notifyDepartmentsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("rms-departments-changed"));
}
