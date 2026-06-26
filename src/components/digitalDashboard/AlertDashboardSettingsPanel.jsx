import { useState } from "react";
import { ExternalLink, FlaskConical, Save, Upload } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import {
  buildAlertDashboardUrl,
  defaultAlertDashboardConfig,
  prependTestAlert,
} from "../../lib/alertDashboard.js";
import { savePublicAlertDashboardDoc } from "../../lib/alertDashboardPublicLoader.js";
import {
  BUSINESS_DIRECTORY_CSV_TEMPLATE,
  parseBusinessDirectoryCsv,
} from "../../lib/alertBusinessDirectory.js";

export default function AlertDashboardSettingsPanel({
  departmentId = "",
  displays = [],
  configItems = [],
  setConfigItems,
  businessDirectory = [],
  setBusinessDirectory,
  active911Alerts = [],
  setActive911Alerts,
  canManage = false,
}) {
  const { gatewayDepartmentId, departmentId: tenantDepartmentId, profile } = useTenant();
  const gatewaySlug = gatewayDepartmentId || departmentId || tenantDepartmentId || "";
  const activeDepartmentId = departmentId || tenantDepartmentId || "";
  const saved = configItems.find((item) => item.id === "config") || configItems[0] || {};
  const [form, setForm] = useState(defaultAlertDashboardConfig(saved));
  const [csvText, setCsvText] = useState("");
  const [notice, setNotice] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveConfig() {
    if (!canManage) return;
    const record = defaultAlertDashboardConfig({ ...form, id: "config" });
    setConfigItems([record]);
    if (activeDepartmentId) {
      const stationDetails = Array.isArray(profile?.stationDetails)
        ? profile.stationDetails.map((station) => ({
          name: station.name || "",
          address: station.address || "",
          city: station.city || "",
          state: station.state || "",
          zip: station.zip || "",
        }))
        : [];
      await savePublicAlertDashboardDoc(activeDepartmentId, {
        departmentName: profile?.name || "",
        logoUrl: profile?.logoUrl || "",
        stationDetails,
      }).catch(() => {});
    }
    setNotice("Alert dashboard settings saved.");
  }

  function pushTestAlert() {
    if (!canManage || !setActive911Alerts) return;
    setActive911Alerts(prependTestAlert(active911Alerts));
    setNotice("Test alert pushed. Open a display URL to preview takeover (marked TEST — Structure Fire).");
  }

  function importCsv() {
    if (!canManage) return;
    const parsed = parseBusinessDirectoryCsv(csvText);
    if (!parsed.length) {
      setNotice("No business rows found in CSV.");
      return;
    }
    setBusinessDirectory(parsed);
    setNotice(`Imported ${parsed.length} business directory record${parsed.length === 1 ? "" : "s"}.`);
  }

  return (
    <section className="dd-panel dd-alert-settings-panel">
      <div className="dd-panel-head">
        <div>
          <h3>Alert Dashboard</h3>
          <p className="dd-panel-subtitle">
            Active911 takeover displays for station wall monitors — street view, hydrants, route, and incident context.
          </p>
        </div>
      </div>

      <div className="dd-panel-body dd-alert-settings-body">
        <div className="dd-form-row">
          <label>
            Takeover duration (minutes)
            <input
              type="number"
              min={5}
              max={240}
              value={form.takeoverDurationMinutes}
              onChange={(event) => updateField("takeoverDurationMinutes", Number(event.target.value) || 45)}
              disabled={!canManage}
            />
          </label>
          <label>
            Auto-sync interval (seconds)
            <input
              type="number"
              min={30}
              max={600}
              value={form.autoSyncIntervalSec}
              onChange={(event) => updateField("autoSyncIntervalSec", Number(event.target.value) || 90)}
              disabled={!canManage}
            />
          </label>
        </div>

        <label className="dd-alert-checkbox">
          <input
            type="checkbox"
            checked={form.autoTakeover !== false}
            onChange={(event) => updateField("autoTakeover", event.target.checked)}
            disabled={!canManage}
          />
          Automatically take over displays when a recent Active911 alert is active
        </label>

        {canManage ? (
          <div className="dd-alert-test-actions">
            <button type="button" className="dd-action-button primary" onClick={saveConfig}>
              <Save size={16} />
              Save alert dashboard settings
            </button>
            <button type="button" className="dd-action-button" onClick={pushTestAlert}>
              <FlaskConical size={16} />
              Push test alert to displays
            </button>
          </div>
        ) : null}

        <div className="dd-alert-display-links">
          <h4>Display URLs</h4>
          <p className="dd-empty-detail">
            Open these on station wall PCs while signed in. Each display link routes from that station&apos;s address.
          </p>
          {!gatewaySlug ? (
            <p className="dd-upload-error">Department gateway not resolved — open FORGE from your department portal first.</p>
          ) : null}
          <ul>
            <li>
              <a href={buildAlertDashboardUrl(gatewaySlug)} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                {buildAlertDashboardUrl(gatewaySlug)}
              </a>
            </li>
            <li>
              <a href={buildAlertDashboardUrl("", "")} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                {buildAlertDashboardUrl("")}
                <span className="dd-table-sub"> (any department when already signed in)</span>
              </a>
            </li>
            {displays.map((display) => (
              <li key={display.id}>
                <a href={buildAlertDashboardUrl(gatewaySlug, display.id)} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  {display.name || display.id}
                  {" · "}
                  {buildAlertDashboardUrl(gatewaySlug, display.id)}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="dd-alert-csv-import">
          <h4>Business critical info CSV</h4>
          <p className="dd-empty-detail">
            Upload addresses with business names and critical notes. Matching incidents will show this information automatically.
          </p>
          <textarea
            rows={6}
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={BUSINESS_DIRECTORY_CSV_TEMPLATE}
            disabled={!canManage}
          />
          {canManage ? (
            <button type="button" className="dd-action-button" onClick={importCsv}>
              <Upload size={16} />
              Import business directory ({businessDirectory.length} saved)
            </button>
          ) : null}
        </div>

        {notice ? <p className="dd-gallery-note">{notice}</p> : null}
      </div>
    </section>
  );
}
