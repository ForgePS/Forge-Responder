import forgeLogo from "../assets/forge-logo.png";
import hornLakeLogo from "../assets/horn-lake-logo.png";

export { forgeLogo, hornLakeLogo };

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
  if (!url || url === "/horn-lake-logo.png" || url.endsWith("/horn-lake-logo.png")) {
    return hornLakeLogo;
  }
  if (isForgeLogoUrl(url) || url === DEFAULT_DEMO_DEPARTMENT_LOGO_PATH) {
    return forgeLogo;
  }
  return url;
}
