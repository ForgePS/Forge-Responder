import forgeLogo from "../assets/forge-logo.png";

export { forgeLogo };

export const DEFAULT_PLATFORM_LOGO_PATH = "/forge-logo.png";
export const DEFAULT_DEMO_DEPARTMENT_LOGO_PATH = "/forge-logo.png";

export function isForgeLogoUrl(url = "") {
  const value = String(url).trim();
  if (!value) return true;
  return (
    value === DEFAULT_PLATFORM_LOGO_PATH
    || value.includes("forge-logo")
    || value === forgeLogo
  );
}

export function resolvePlatformLogoUrl(url) {
  if (isForgeLogoUrl(url)) return forgeLogo;
  return url || forgeLogo;
}

export function resolveDepartmentLogoUrl(url) {
  const value = String(url || "").trim();
  if (!value) return forgeLogo;
  if (isForgeLogoUrl(value) || value === DEFAULT_DEMO_DEPARTMENT_LOGO_PATH) {
    return forgeLogo;
  }
  return value;
}
