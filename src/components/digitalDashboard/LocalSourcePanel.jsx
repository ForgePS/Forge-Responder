import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, ImageIcon } from "lucide-react";
import {
  buildLocalMediaFromConfig,
  DEFAULT_LOCAL_CONFIG,
  LOCAL_TABS,
  WEATHER_TEMPLATES,
} from "../../lib/digitalDashboardSourceConfigs.js";
import { formatNewMediaTitle } from "../../lib/digitalDashboardGallery.js";

export default function LocalSourcePanel({ localConfig, onConfigChange, onApply, formTitle = "" }) {
  const config = { ...DEFAULT_LOCAL_CONFIG, ...localConfig };
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeTab = LOCAL_TABS.find((tab) => tab.id === config.tab) || LOCAL_TABS[0];

  function updateConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  function handlePreview() {
    const media = buildLocalMediaFromConfig(config, formTitle || formatNewMediaTitle());
    onApply?.(media);
  }

  return (
    <div className="dd-source-panel">
      <nav className="dd-source-tabs" aria-label="Local apps">
        {LOCAL_TABS.map((tab) => (
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
        {!activeTab.enabled ? (
          <div className="dd-source-placeholder">
            <strong>{activeTab.label}</strong>
            <p>This local widget is coming soon.</p>
          </div>
        ) : null}

        {config.tab === "weather" && activeTab.enabled ? (
          <>
            <div className="dd-local-location-row">
              <label className="dd-source-field-grow">
                Location
                <input
                  type="text"
                  value={config.location}
                  disabled={config.autoLocation}
                  onChange={(event) => updateConfig({ location: event.target.value })}
                  placeholder="Your City, ST"
                />
              </label>
              <label className="dd-toggle-row dd-local-auto-toggle">
                <span>Auto</span>
                <input type="checkbox" role="switch" checked={config.autoLocation} onChange={(event) => updateConfig({ autoLocation: event.target.checked })} />
              </label>
            </div>
            <div className="dd-local-template-grid">
              {WEATHER_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`dd-local-template-card ${config.templateId === template.id ? "selected" : ""}`}
                  onClick={() => updateConfig({ templateId: template.id })}
                >
                  <span className="dd-local-template-preview" style={{ background: `linear-gradient(135deg, ${template.accent}, #0f172a)` }} />
                  <span>{template.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {config.tab === "traffic" && activeTab.enabled ? (
          <label className="dd-source-field-full">
            Traffic region / corridor
            <input
              type="text"
              value={config.trafficRegion}
              onChange={(event) => updateConfig({ trafficRegion: event.target.value })}
              placeholder="I-55 @ Main St"
            />
          </label>
        ) : null}

        {config.tab === "events" && activeTab.enabled ? (
          <label className="dd-source-field-full">
            Events source
            <select value={config.eventSource} onChange={(event) => updateConfig({ eventSource: event.target.value })}>
              <option value="department-calendar">Department Calendar</option>
              <option value="training-schedule">Training Schedule</option>
              <option value="community-events">Community Events</option>
            </select>
          </label>
        ) : null}

        {(config.tab === "clock" || config.tab === "date") && activeTab.enabled ? (
          <div className="dd-gallery-form-grid">
            <label>
              Time format
              <select value={config.clockFormat} onChange={(event) => updateConfig({ clockFormat: event.target.value })}>
                <option value="12h">12-hour</option>
                <option value="24h">24-hour</option>
              </select>
            </label>
            <label>
              Timezone
              <select value={config.timezone} onChange={(event) => updateConfig({ timezone: event.target.value })}>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
              </select>
            </label>
          </div>
        ) : null}

        {activeTab.enabled ? (
          <>
            <button type="button" className="dd-gallery-advanced-toggle" onClick={() => setBrandingOpen((value) => !value)}>
              Branding
              {brandingOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {brandingOpen ? (
              <div className="dd-gallery-advanced">
                <label>
                  Temperature units
                  <select value={config.units} onChange={(event) => updateConfig({ units: event.target.value })}>
                    <option value="imperial">Fahrenheit</option>
                    <option value="metric">Celsius</option>
                  </select>
                </label>
              </div>
            ) : null}
            <button type="button" className="dd-gallery-advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
              Advanced Settings
              {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {advancedOpen ? (
              <div className="dd-gallery-advanced">
                <label className="dd-toggle-row">
                  <span>Show seconds on clock widgets</span>
                  <input type="checkbox" role="switch" checked={config.showSeconds} onChange={(event) => updateConfig({ showSeconds: event.target.checked })} />
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
