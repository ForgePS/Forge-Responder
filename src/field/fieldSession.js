/**
 * Access snapshot: who is signed in, for which department, and what they may
 * do. Saved on the device whenever the app loads access online, so the field
 * app can open with no signal. Firestore rules still decide every write when
 * records sync, so a stale snapshot can't grant anything on the server.
 */
import { kvDelete, kvGet, kvSet } from "./fieldDb.js";
import { canAccessNavItem, canEditNerisReports, hasPermission } from "../lib/permissions.js";
import { canConductFleetChecks } from "../lib/fleet/fleetPermissions.js";
import { canEditHydrantDamageDraft } from "../lib/hydrantDamage/permissions.js";
import { resolveDepartmentDisplayName, resolveDepartmentLogoUrl, resolveShiftOptions } from "../lib/hydrantTenantService.js";

export const FIELD_MODULE_KEYS = [
  "apparatus",
  "hydrants",
  "hoseTesting",
  "maintenance",
  "dailyLog",
  "nerisFireReports",
  "internalEmail",
];

const SNAPSHOT_MAX_AGE_DAYS = 30;

function accessKey(uid) {
  return `access:${uid}`;
}

export function buildAccessSnapshot({ user, membership, permissions, isCreator, departmentId, profile = {}, settings = {}, isModuleEnabled }) {
  const modules = Object.fromEntries(FIELD_MODULE_KEYS.map((key) => [key, Boolean(isModuleEnabled ? isModuleEnabled(key) : true)]));
  return {
    uid: user.uid,
    email: user.email || "",
    departmentId,
    departmentName: resolveDepartmentDisplayName(profile),
    logoUrl: resolveDepartmentLogoUrl(profile),
    displayName: membership?.displayName || user.displayName || user.email || "Member",
    personnelId: membership?.personnelId || "",
    assignedShift: membership?.assignedShift || "",
    assignedStation: membership?.assignedStation || "",
    roleIds: membership?.roleIds || [],
    permissions: { ...(permissions || {}) },
    isCreator: Boolean(isCreator),
    modules,
    profile: {
      shifts: resolveShiftOptions(profile).filter(Boolean),
      stations: Array.isArray(profile.stations)
        ? profile.stations.map((station, index) => String(station?.name || station?.label || station || `Station ${index + 1}`))
        : [],
      timezone: profile.timezone || "America/Chicago",
    },
    settings: {
      shiftChangeTime: settings?.dailyLogSettings?.shiftChangeTime || "07:00",
    },
    savedAt: new Date().toISOString(),
  };
}

export async function saveAccessSnapshot(snapshot) {
  await kvSet(accessKey(snapshot.uid), snapshot);
  return snapshot;
}

export async function loadAccessSnapshot(uid) {
  if (!uid) return null;
  const snapshot = await kvGet(accessKey(uid));
  if (!snapshot) return null;
  const ageDays = (Date.now() - new Date(snapshot.savedAt).getTime()) / 86_400_000;
  return { ...snapshot, stale: ageDays > SNAPSHOT_MAX_AGE_DAYS };
}

export async function clearAccessSnapshot(uid) {
  if (uid) await kvDelete(accessKey(uid));
}

/** What this person may do in the field app (mirrors the desktop page gates). */
export function fieldCapabilities(snapshot) {
  if (!snapshot) return {};
  const { permissions = {}, isCreator = false, modules = {} } = snapshot;
  const on = (key) => isCreator || modules[key] !== false;
  const nav = (name) => canAccessNavItem(name, permissions, { isCreator });
  return {
    truckChecks: on("apparatus") && canConductFleetChecks(permissions, isCreator),
    hoseTests: (on("hoseTesting") || on("hydrants")) && (isCreator || nav("Hose Testing")),
    hydrants: on("hydrants") && (isCreator || nav("Hydrant Overview")),
    hydrantDamage: on("hydrants") && canEditHydrantDamageDraft(permissions, isCreator),
    damageForm: (on("maintenance") || on("hydrants"))
      && (isCreator || hasPermission(permissions, "submitMaintenanceIssues") || hasPermission(permissions, "editApparatus")),
    dailyLogView: on("dailyLog") && (isCreator || hasPermission(permissions, "viewDailyLog")),
    dailyLogEdit: on("dailyLog") && (isCreator || hasPermission(permissions, "editDailyLog") || hasPermission(permissions, "editSchedule")),
    incidents: on("nerisFireReports") && canEditNerisReports(permissions, isCreator),
    internalEmail: on("internalEmail"),
    maintenance: on("maintenance"),
  };
}
