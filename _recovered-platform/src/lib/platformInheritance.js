import { defaultDepartmentSettings } from "../data/defaultDepartment.js";
import { defaultPlatformConfig } from "../data/platformBrand.js";

export function buildInheritedPlatformSnapshot(platformConfig = {}) {
  const merged = { ...defaultPlatformConfig, ...platformConfig };
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
    availableModules: merged.availableModules?.length
      ? merged.availableModules
      : defaultPlatformConfig.availableModules
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

export function applyPlatformToDepartmentSettings(settings = {}, platformConfig = {}, departmentId = "") {
  const inherited = buildInheritedPlatformSnapshot(platformConfig);
  const enabledModules = (settings.enabledModules || defaultDepartmentSettings.enabledModules)
    .filter((moduleKey) => inherited.availableModules.includes(moduleKey));

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
