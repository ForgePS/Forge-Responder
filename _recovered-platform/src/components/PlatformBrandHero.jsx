import { resolveDepartmentLogoUrl, resolvePlatformLogoUrl } from "../lib/brandAssets.js";
import { buildDepartmentGatewayUrl } from "../lib/gatewayRouting.js";
import { defaultPlatformConfig } from "../data/platformBrand.js";

export default function PlatformBrandHero({
  config = defaultPlatformConfig,
  profile = null,
  compact = false,
  children
}) {
  if (profile) {
    const logoSrc = resolveDepartmentLogoUrl(profile.logoUrl);
    const gatewayUrl = profile.id ? buildDepartmentGatewayUrl(profile.id) : "";

    return (
      <section className={`platform-brand-hero department-brand-hero ${compact ? "platform-brand-hero-compact" : ""}`}>
        <div className="platform-brand-hero-logo">
          <img src={logoSrc} alt={profile.name} />
        </div>
        <div className="platform-brand-hero-copy">
          <p className="platform-brand-eyebrow">{profile.branchLabel || "Department Branch"}</p>
          <h2>{profile.name}</h2>
          <p className="platform-brand-title">{profile.displayTitle || profile.shortName || profile.name}</p>
          {profile.address && (
            <p className="platform-brand-tagline">{profile.address}</p>
          )}
          {!compact && profile.contactEmail && (
            <p className="platform-brand-description">
              Contact: {profile.contactEmail}
              {profile.contactPhone ? ` · ${profile.contactPhone}` : ""}
            </p>
          )}
          {gatewayUrl && (
            <div className="platform-brand-links">
              <a className="platform-brand-rms" href={gatewayUrl} target="_blank" rel="noreferrer">
                Department portal: {gatewayUrl.replace(/^https?:\/\//, "")}
              </a>
            </div>
          )}
          <div className="platform-brand-meta">
            <span className="platform-brand-version">Workspace ID: {profile.id}</span>
            <span className="platform-brand-powered">Powered by FORGE RMS</span>
          </div>
        </div>
        {children}
      </section>
    );
  }

  const brand = { ...defaultPlatformConfig, ...config };
  const logoSrc = resolvePlatformLogoUrl(brand.logoUrl);

  return (
    <section className={`platform-brand-hero ${compact ? "platform-brand-hero-compact" : ""}`}>
      <div className="platform-brand-hero-logo">
        <img src={logoSrc} alt={brand.name} />
      </div>
      <div className="platform-brand-hero-copy">
        <p className="platform-brand-eyebrow">{brand.platformLabel}</p>
        <h2>{brand.name}</h2>
        <p className="platform-brand-title">{brand.platformTitle}</p>
        <p className="platform-brand-tagline">{brand.tagline}</p>
        {!compact && brand.description && (
          <p className="platform-brand-description">{brand.description}</p>
        )}
        <div className="platform-brand-links">
          {brand.websiteUrl && (
            <a className="platform-brand-website" href={brand.websiteUrl} target="_blank" rel="noreferrer">
              Website: {brand.websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
          {brand.rmsAppUrl && (
            <a className="platform-brand-rms" href={brand.rmsAppUrl} target="_blank" rel="noreferrer">
              RMS gateway: {brand.rmsAppUrl.replace(/^https?:\/\//, "")}/{"{departmentId}"}
            </a>
          )}
        </div>
        <div className="platform-brand-meta">
          <span className="platform-brand-version">Version {brand.version}</span>
          {brand.poweredByLabel && (
            <span className="platform-brand-powered">{brand.poweredByLabel} FORGE</span>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
