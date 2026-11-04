import forgeLogo from "../assets/forge-logo.png";
// The FORGE Responder platform logo (owner-supplied file with its empty margins
// trimmed, pixels unchanged). Used wherever no department or platform logo is set.
import forgeResponderLogo from "../assets/forge-responder-logo-trimmed.png";

// forgeLogo is the FORGE Public Safety company mark (the "Powered by" footer).
export { forgeLogo, forgeResponderLogo };

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
  if (isForgeLogoUrl(url)) return forgeResponderLogo;
  return url || forgeResponderLogo;
}

export function resolveDepartmentLogoUrl(url) {
  const value = String(url || "").trim();
  if (!value) return forgeResponderLogo;
  if (isForgeLogoUrl(value) || value === DEFAULT_DEMO_DEPARTMENT_LOGO_PATH) {
    return forgeResponderLogo;
  }
  return value;
}
