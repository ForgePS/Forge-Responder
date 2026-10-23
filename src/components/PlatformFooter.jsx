import { defaultPlatformConfig } from "../data/platformBrand.js";
import { forgeLogo } from "../lib/brandAssets.js";
import { FORGE_PUBLIC_WEBSITE_HOST, FORGE_RMS_APP_HOST } from "../lib/platformUrls.js";

export default function PlatformFooter({
  departmentName = "",
  platformConfig = defaultPlatformConfig,
  showStatus = true,
  showForgeBranding = true
}) {
  const brand = { ...defaultPlatformConfig, ...platformConfig };
  const websiteUrl = brand.websiteUrl || defaultPlatformConfig.websiteUrl;

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
        {websiteUrl && (
          <a className="footer-website" href={websiteUrl} target="_blank" rel="noreferrer" title="Company website">
            {FORGE_PUBLIC_WEBSITE_HOST}
          </a>
        )}
        <span className="footer-rms-gateway" title="RMS gateway">{FORGE_RMS_APP_HOST}</span>
      </div>
      {showForgeBranding && (
        <div className="footer-powered-by">
          <span>{brand.poweredByLabel}</span>
          <a
            className="footer-forge-logo-link"
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            title={brand.name}
          >
            <img className="footer-forge-logo" src={forgeLogo} alt={brand.name} />
          </a>
        </div>
      )}
    </footer>
  );
}
