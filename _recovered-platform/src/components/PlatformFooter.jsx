import { defaultPlatformConfig } from "../data/platformBrand.js";
import { resolvePlatformLogoUrl } from "../lib/brandAssets.js";

export default function PlatformFooter({
  departmentName = "",
  platformConfig = defaultPlatformConfig,
  showStatus = true,
  showForgeBranding = true
}) {
  const brand = { ...defaultPlatformConfig, ...platformConfig };
  const logoSrc = resolvePlatformLogoUrl(brand.logoUrl);

  return (
    <footer className="app-footer">
      {showStatus && (
        <>
          <span>System Status <i /> All Systems Operational</span>
          <span>Last Data Sync: {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        </>
      )}
      <div className="footer-department">
        <span className="footer-version">v{brand.version}</span>
        {departmentName && <span className="footer-tenant">{departmentName}</span>}
      </div>
      {showForgeBranding && (
        <div className="footer-powered-by">
          <span>{brand.poweredByLabel}</span>
          <img className="forge-logo-knockout" src={logoSrc} alt={brand.name} />
        </div>
      )}
    </footer>
  );
}
