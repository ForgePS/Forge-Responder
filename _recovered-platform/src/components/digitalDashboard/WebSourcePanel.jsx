import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, ImageIcon } from "lucide-react";
import {
  buildWebMediaFromConfig,
  DEFAULT_WEB_CONFIG,
  WEB_TABS,
} from "../../lib/digitalDashboardSourceConfigs.js";
import { formatNewMediaTitle } from "../../lib/digitalDashboardGallery.js";

export default function WebSourcePanel({ webConfig, onConfigChange, onApply, formTitle = "" }) {
  const config = { ...DEFAULT_WEB_CONFIG, ...webConfig };
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeTab = WEB_TABS.find((tab) => tab.id === config.tab) || WEB_TABS[0];

  function updateConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  function handlePreview() {
    const media = buildWebMediaFromConfig(config, formTitle || formatNewMediaTitle());
    onApply?.(media);
  }

  return (
    <div className="dd-source-panel">
      <nav className="dd-source-tabs" aria-label="Web apps">
        {WEB_TABS.map((tab) => (
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
        {config.tab === "web-url" ? (
          <>
            <div className="dd-gallery-mode-toggle">
              <button type="button" className={config.urlMode === "web" ? "active" : ""} onClick={() => updateConfig({ urlMode: "web" })}>Web URL</button>
              <button type="button" className={config.urlMode === "local" ? "active" : ""} onClick={() => updateConfig({ urlMode: "local" })}>Local URL</button>
            </div>
            <label className="dd-source-field-full">
              Web Page URL
              <input
                type="url"
                value={config.pageUrl}
                onChange={(event) => updateConfig({ pageUrl: event.target.value })}
                placeholder={config.urlMode === "local" ? "http://localhost:8080/dashboard" : "https://forgepublicsafety.com"}
              />
            </label>
          </>
        ) : null}

        {config.tab === "rss" || config.tab === "news" ? (
          <>
            {config.tab === "news" ? (
              <label>
                News source
                <select value={config.newsSource} onChange={(event) => updateConfig({ newsSource: event.target.value })}>
                  <option value="fire-service-news">Fire Service News</option>
                  <option value="ems-world">EMS World</option>
                  <option value="department-bulletin">Department Bulletin RSS</option>
                </select>
              </label>
            ) : null}
            <label className="dd-source-field-full">
              Feed URL
              <input
                type="url"
                value={config.feedUrl}
                onChange={(event) => updateConfig({ feedUrl: event.target.value })}
                placeholder="https://example.com/feed.xml"
              />
            </label>
          </>
        ) : null}

        {config.tab === "youtube" || config.tab === "vimeo" ? (
          <label className="dd-source-field-full">
            Video URL
            <input
              type="url"
              value={config.videoUrl}
              onChange={(event) => updateConfig({ videoUrl: event.target.value })}
              placeholder={config.tab === "youtube" ? "https://www.youtube.com/watch?v=…" : "https://vimeo.com/…"}
            />
          </label>
        ) : null}

        {config.tab === "gdrive" || config.tab === "microsoft" ? (
          <label className="dd-source-field-full">
            {config.tab === "microsoft" ? "OneDrive / SharePoint link" : "Google Drive share link"}
            <input
              type="url"
              value={config.pageUrl}
              onChange={(event) => updateConfig({ pageUrl: event.target.value })}
              placeholder="https://…"
            />
          </label>
        ) : null}

        {!activeTab.enabled ? (
          <div className="dd-source-placeholder">
            <strong>{activeTab.label}</strong>
            <p>This web integration is coming soon.</p>
          </div>
        ) : null}

        {activeTab.enabled ? (
          <>
            <button type="button" className="dd-gallery-advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
              Advanced Settings
              {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {advancedOpen ? (
              <div className="dd-gallery-advanced">
                <label>
                  Refresh interval (minutes)
                  <select value={String(config.refreshMinutes)} onChange={(event) => updateConfig({ refreshMinutes: Number(event.target.value) })}>
                    <option value="5">5</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="60">60</option>
                  </select>
                </label>
                <label className="dd-toggle-row">
                  <span>Allow embedded scripts</span>
                  <input type="checkbox" role="switch" checked={config.allowScripts} onChange={(event) => updateConfig({ allowScripts: event.target.checked })} />
                </label>
              </div>
            ) : null}
            <div className="dd-gallery-actions">
              <button type="button" className="dd-action-button dd-gallery-preview-btn" onClick={handlePreview}>
                <ImageIcon size={16} />
                Preview
              </button>
              <button type="button" className="dd-action-button dd-help-button"><HelpCircle size={15} />Help</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
