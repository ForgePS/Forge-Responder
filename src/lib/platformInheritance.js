import { defaultDepartmentSettings } from "../data/defaultDepartment.js";
import { defaultPlatformConfig } from "../data/platformBrand.js";

/** Keep platform module lists current when new modules ship after initial platform setup. */
export function resolveAvailableModules(storedModules) {
  const defaults = defaultPlatformConfig.availableModules;
  if (!Array.isArray(storedModules) || !storedModules.length) {
    return [...defaults];
  }

  const merged = [...storedModules];
  for (const moduleKey of defaults) {
    if (!merged.includes(moduleKey)) {
      merged.push(moduleKey);
    }
  }
  return merged;
}

export function normalizePlatformConfig(platformConfig = {}) {
  const merged = { ...defaultPlatformConfig, ...platformConfig };
  return {
    ...merged,
    availableModules: resolveAvailableModules(merged.availableModules),
  };
}

export function buildInheritedPlatformSnapshot(platformConfig = {}) {
  const merged = normalizePlatformConfig(platformConfig);
  return {
    name: merged.name,
    platformTitle: merged.platformTitle,
    platformLabel: merged.platformLabel,
    tagline: merged.tagline,
    description: merged.description,
    websiteUrl: merged.websiteUrl,
    rmsAppUrl: merged.rmsAppUrl,
    logoUrl: merged.logoUrl,
    poweredByLabel: merged.poweredByLabel,
    version: merged.version,
    status: merged.status,
    availableModules: merged.availableModules,
  };
}

export function applyPlatformToDepartmentProfile(profile = {}, platformConfig = {}, departmentId = "") {
  const inherited = buildInheritedPlatformSnapshot(platformConfig);
  return {
    ...profile,
    id: departmentId || profile.id,
    productTitle: inherited.platformTitle
  };
}

export function resolveEnabledModules(storedModules = [], platformConfig = {}) {
  const inherited = buildInheritedPlatformSnapshot(platformConfig);
  const available = inherited.availableModules;
  const defaults = defaultDepartmentSettings.enabledModules.filter((moduleKey) => available.includes(moduleKey));

  const base = (Array.isArray(storedModules) && storedModules.length)
    ? storedModules.filter((moduleKey) => available.includes(moduleKey))
    : [...defaults];

  const merged = [...base];
  for (const moduleKey of defaults) {
    if (!merged.includes(moduleKey)) {
      merged.push(moduleKey);
    }
  }
  return merged;
}

export function applyPlatformToDepartmentSettings(settings = {}, platformConfig = {}, departmentId = "") {
  const inherited = buildInheritedPlatformSnapshot(platformConfig);
  const enabledModules = resolveEnabledModules(settings.enabledModules, platformConfig);

  return {
    ...settings,
    departmentId: departmentId || settings.departmentId,
    enabledModules,
    platform: {
      name: inherited.name,
      platformTitle: inherited.platformTitle,
      platformLabel: inherited.platformLabel,
      tagline: inherited.tagline,
      description: inherited.description,
      websiteUrl: inherited.websiteUrl,
      rmsAppUrl: inherited.rmsAppUrl,
      logoUrl: inherited.logoUrl,
      poweredByLabel: inherited.poweredByLabel,
      version: inherited.version
    }
  };
}
