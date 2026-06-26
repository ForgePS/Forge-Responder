import { HelpCircle, ImageIcon } from "lucide-react";
import { formatNewMediaTitle } from "../../lib/digitalDashboardGallery.js";
import {
  buildSocialMediaFromConfig,
  DEFAULT_SOCIAL_CONFIG,
  SOCIAL_TABS,
} from "../../lib/digitalDashboardSourceConfigs.js";

export default function SocialSourcePanel({ socialConfig, onConfigChange, onApply, formTitle = "" }) {
  const config = { ...DEFAULT_SOCIAL_CONFIG, ...socialConfig };

  function updateConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  function handlePreview() {
    onApply?.(buildSocialMediaFromConfig(config, formTitle || formatNewMediaTitle()));
  }

  return (
    <div className="dd-source-panel">
      <nav className="dd-source-tabs" aria-label="Social apps">
        {SOCIAL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dd-source-tab ${config.tab === tab.id ? "active" : ""} ${tab.enabled ? "" : "is-disabled"}`}
            onClick={() => tab.enabled && updateConfig({ tab: tab.id })}
            disabled={!tab.enabled}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="dd-source-body">
        <label className="dd-source-field-full">
          Profile or page URL
          <input
            type="url"
            value={config.profileUrl}
            onChange={(event) => updateConfig({ profileUrl: event.target.value })}
            placeholder="https://…"
          />
        </label>
        <label className="dd-source-field-full">
          Hashtag filter (optional)
          <input
            type="text"
            value={config.hashtag}
            onChange={(event) => updateConfig({ hashtag: event.target.value.replace(/^#/, "") })}
            placeholder="HornLakeFire"
          />
        </label>
        <div className="dd-gallery-actions">
          <button type="button" className="dd-action-button dd-gallery-preview-btn" onClick={handlePreview}>
            <ImageIcon size={16} />
            Preview
          </button>
          <button type="button" className="dd-action-button dd-help-button"><HelpCircle size={15} />Help</button>
        </div>
      </div>
    </div>
  );
}
