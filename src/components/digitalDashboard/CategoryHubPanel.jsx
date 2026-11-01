import { CATEGORY_HUB_TABS } from "../../lib/digitalDashboardSourceConfigs.js";

export default function CategoryHubPanel({ categoryId, hubConfig, onConfigChange }) {
  const tabs = CATEGORY_HUB_TABS[categoryId] || [];
  const config = { tab: tabs[0]?.id || "default", ...(hubConfig || {}) };
  const activeTab = tabs.find((tab) => tab.id === config.tab) || tabs[0];

  function updateConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  if (!tabs.length) {
    return (
      <div className="dd-source-panel">
        <div className="dd-source-placeholder">
          <strong>{categoryId}</strong>
          <p>Nothing to set up in this category.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dd-source-panel">
      <nav className="dd-source-tabs" aria-label={`${categoryId} apps`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dd-source-tab ${config.tab === tab.id ? "active" : ""} ${tab.enabled ? "" : "is-disabled"}`}
            onClick={() => updateConfig({ tab: tab.id })}
            disabled={!tab.enabled}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="dd-source-body">
        <div className="dd-source-placeholder">
          <strong>{activeTab?.label || categoryId}</strong>
          <p>
            {activeTab?.enabled
              ? "Configure this app from the fields on the right, then save to your media library."
              : "This app isn't available."}
          </p>
        </div>
      </div>
    </div>
  );
}
