/**
 * Module switches and plan limits on the app side. The server keeps the real
 * answer in platformEntitlements/<departmentId> (functions/lib/entitlements.js)
 * and the Firestore rules enforce it; this mirrors it for the UI.
 */
import { ADMIN_MODULE_OPTIONS } from "../data/adminRegistry.js";

export const MODULE_KEYS = ADMIN_MODULE_OPTIONS.map((m) => m.key);
export const ALWAYS_ON_MODULES = ["dashboard", "administration"];

/** Same as effectiveModules in functions/lib/entitlements.js. */
export function effectiveModules({ planModules, disabledModules } = {}) {
  const known = (list) => (Array.isArray(list) ? list.filter((key) => MODULE_KEYS.includes(key)) : []);
  const planned = known(planModules);
  const off = known(disabledModules);
  return MODULE_KEYS.filter((key) => ALWAYS_ON_MODULES.includes(key)
    || ((!planned.length || planned.includes(key)) && !off.includes(key)));
}

/** The switched-off list to store for a set of ticked modules. */
export function disabledModulesFor(enabledModules = []) {
  const on = new Set(enabledModules);
  return MODULE_KEYS.filter((key) => !on.has(key) && !ALWAYS_ON_MODULES.includes(key));
}

/**
 * Whether one more of something fits the plan: { allowed, limit, used }.
 * limit 0 = unlimited; no entitlements yet = allowed.
 */
export function limitCheck(entitlements, limitKey, usageKey, adding = 1) {
  const limit = Number(entitlements?.limits?.[limitKey] || 0);
  const used = Number(entitlements?.usage?.[usageKey] || 0);
  return { allowed: !limit || used + adding <= limit, limit, used };
}

export function limitMessage(what, { limit, used }) {
  return `Your plan allows ${limit} ${what} and ${used} are in use. Contact FORGE Public Safety to upgrade the plan.`;
}
