import { DEFAULT_PLATFORM_LOGO_PATH } from "../lib/brandAssets.js";
import { FORGE_PUBLIC_WEBSITE_URL, FORGE_RMS_APP_URL } from "../lib/platformUrls.js";
import { ADMIN_MODULE_OPTIONS } from "./adminRegistry.js";

export const defaultPlatformConfig = {
  name: "FORGE PUBLIC SAFETY",
  platformTitle: "FORGE RMS",
  platformLabel: "FORGE RMS Platform",
  tagline: "ONE PLATFORM. ONE MISSION.",
  description: "Multi-department public safety RMS platform. Each agency runs as its own branch with shared core modules.",
  websiteUrl: FORGE_PUBLIC_WEBSITE_URL,
  rmsAppUrl: FORGE_RMS_APP_URL,
  logoUrl: DEFAULT_PLATFORM_LOGO_PATH,
  poweredByLabel: "POWERED BY",
  version: "2.5.0",
  status: "active",
  availableModules: ADMIN_MODULE_OPTIONS.map((module) => module.key),
  /** Creator allowlist for Pre-Fire Plan feature flags (null/omitted = all allowed). */
  availablePreplanFeatures: null,
};

export const platformBrand = { ...defaultPlatformConfig };
