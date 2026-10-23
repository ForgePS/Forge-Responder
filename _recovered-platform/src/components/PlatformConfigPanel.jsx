import { useEffect, useState } from "react";
import { Check, Image, RotateCcw } from "lucide-react";
import { ADMIN_MODULE_OPTIONS } from "../data/adminRegistry.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { defaultPlatformConfig } from "../data/platformBrand.js";
import { writeAuditLog } from "../lib/auditService.js";
import { savePlatformConfig } from "../lib/platformService.js";
import { DEFAULT_DEPARTMENT_ID } from "../lib/tenantPaths.js";
import {
  DEFAULT_PLATFORM_LOGO_PATH,
  isForgeLogoUrl,
  resolvePlatformLogoUrl
} from "../lib/brandAssets.js";
import PlatformBrandHero from "./PlatformBrandHero.jsx";

export default function PlatformConfigPanel({ onMessage }) {
  const { platformConfig, refreshPlatform } = useTenant();
  const { user, membership } = useAuth();
  const [form, setForm] = useState({ ...defaultPlatformConfig });
  const [availableModules, setAvailableModules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [useCustomLogo, setUseCustomLogo] = useState(false);

  useEffect(() => {
    const merged = { ...defaultPlatformConfig, ...platformConfig };
    setForm(merged);
    setAvailableModules(
      platformConfig?.availableModules?.length
        ? platformConfig.availableModules
        : defaultPlatformConfig.availableModules
    );
    setUseCustomLogo(!isForgeLogoUrl(merged.logoUrl));
  }, [platformConfig]);

  function toggleModule(moduleKey) {
    setAvailableModules((current) => (
      current.includes(moduleKey)
        ? current.filter((item) => item !== moduleKey)
        : [...current, moduleKey]
    ));
  }

  function useDefaultLogo() {
    setUseCustomLogo(false);
    setForm((current) => ({ ...current, logoUrl: DEFAULT_PLATFORM_LOGO_PATH }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const logoUrl = useCustomLogo
        ? form.logoUrl.trim()
        : DEFAULT_PLATFORM_LOGO_PATH;

      await savePlatformConfig({
        name: form.name.trim(),
        platformTitle: form.platformTitle.trim(),
        platformLabel: form.platformLabel.trim(),
        tagline: form.tagline.trim(),
        description: form.description.trim(),
        logoUrl,
        poweredByLabel: form.poweredByLabel.trim(),
        version: form.version.trim(),
        status: form.status || "active",
        availableModules
      });
      await writeAuditLog(DEFAULT_DEPARTMENT_ID, {
        action: "update",
        module: "FORGE Platform",
        summary: `Updated platform settings (${availableModules.length} modules available)`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email
      });
      refreshPlatform();
      onMessage?.("FORGE platform settings saved");
    } catch (error) {
      console.error("Failed to save platform config", error);
      onMessage?.("Failed to save platform settings");
    } finally {
      setSaving(false);
    }
  }

  const previewConfig = {
    ...form,
    logoUrl: useCustomLogo ? form.logoUrl : DEFAULT_PLATFORM_LOGO_PATH
  };

  return (
    <section className="platform-config-panel">
      <PlatformBrandHero config={previewConfig}>
        <p className="platform-brand-preview-note">Live preview of how the main platform appears to creators and admins.</p>
      </PlatformBrandHero>

      <div className="platform-config-sections">
        <section className="platform-config-card">
          <header>
            <strong>Brand identity</strong>
            <span>Names and messaging shown across the platform.</span>
          </header>
          <div className="workflow-form">
            <label>
              <span>Company name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="FORGE PUBLIC SAFETY"
              />
            </label>
            <label>
              <span>Platform title</span>
              <input
                value={form.platformTitle}
                onChange={(e) => setForm({ ...form, platformTitle: e.target.value })}
                placeholder="FORGE RMS"
              />
            </label>
            <label>
              <span>Platform label</span>
              <input
                value={form.platformLabel}
                onChange={(e) => setForm({ ...form, platformLabel: e.target.value })}
                placeholder="FORGE RMS Platform"
              />
            </label>
            <label>
              <span>Tagline</span>
              <input
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                placeholder="ONE PLATFORM. EVERY MISSION."
              />
            </label>
            <label className="admin-record-field-wide">
              <span>About the platform</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description for the main platform landing and admin views."
              />
            </label>
          </div>
        </section>

        <section className="platform-config-card">
          <header>
            <strong>Logo</strong>
            <span>Use the built-in FORGE logo or provide a custom image URL.</span>
          </header>
          <div className="platform-logo-editor">
            <div className="platform-logo-preview">
              <img src={resolvePlatformLogoUrl(previewConfig.logoUrl)} alt={form.name} />
            </div>
            <div className="platform-logo-actions">
              <button
                className={`secondary-button ${!useCustomLogo ? "active" : ""}`}
                type="button"
                onClick={useDefaultLogo}
              >
                <Image size={14} /> Use FORGE logo
              </button>
              <button
                className={`secondary-button ${useCustomLogo ? "active" : ""}`}
                type="button"
                onClick={() => setUseCustomLogo(true)}
              >
                <RotateCcw size={14} /> Custom logo URL
              </button>
              {useCustomLogo && (
                <label className="admin-record-field-wide">
                  <span>Custom logo URL</span>
                  <input
                    value={form.logoUrl}
                    onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                  />
                </label>
              )}
            </div>
          </div>
        </section>

        <section className="platform-config-card">
          <header>
            <strong>System details</strong>
            <span>Version and footer branding.</span>
          </header>
          <div className="workflow-form">
            <label>
              <span>Version</span>
              <input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="2.5.0"
              />
            </label>
            <label>
              <span>Powered-by label</span>
              <input
                value={form.poweredByLabel}
                onChange={(e) => setForm({ ...form, poweredByLabel: e.target.value })}
                placeholder="POWERED BY"
              />
            </label>
          </div>
        </section>

        <section className="platform-config-card">
          <header>
            <strong>Platform modules</strong>
            <span>Choose which features departments can turn on. A module must be enabled here before any branch can use it.</span>
          </header>
          <div className="platform-module-grid">
            {ADMIN_MODULE_OPTIONS.map((module) => (
              <label key={module.key} className="platform-module-card">
                <input
                  type="checkbox"
                  checked={availableModules.includes(module.key)}
                  onChange={() => toggleModule(module.key)}
                />
                <span>{module.label}</span>
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className="platform-config-actions">
        <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
          <Check size={14} /> {saving ? "Saving..." : "Save platform settings"}
        </button>
      </div>
    </section>
  );
}
