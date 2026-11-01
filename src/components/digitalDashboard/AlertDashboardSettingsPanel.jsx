import { useState } from "react";
import { FlaskConical, Save, Upload } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import {
  buildAlertDashboardUrl,
  createPublicDisplayKey,
  defaultAlertDashboardConfig,
  prependTestAlert,
  publicDisplayKeyFrom,
} from "../../lib/alertDashboard.js";
import { savePublicAlertDashboardDoc } from "../../lib/alertDashboardPublicLoader.js";
import {
  BUSINESS_DIRECTORY_CSV_TEMPLATE,
  parseBusinessDirectoryCsv,
} from "../../lib/alertBusinessDirectory.js";
import DisplayAlertUrlField from "./DisplayAlertUrlField.jsx";
import MvixProvisioningGuide from "./MvixProvisioningGuide.jsx";

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

  const displayKey = publicDisplayKeyFrom(configItems);

  function saveDisplayAccess(patch, message) {
    if (!canManage) return;
    const record = defaultAlertDashboardConfig({ ...saved, ...form, ...patch, id: "config" });
    setForm(record);
    setConfigItems([record]);
    setNotice(message);
  }

  function turnOnTvLinks() {
    saveDisplayAccess({ publicDashboardEnabled: true, publicDisplayKey: saved.publicDisplayKey || createPublicDisplayKey() }, "Station TV links are on. Copy each link below onto its screen.");
  }

  function turnOffTvLinks() {
    if (!window.confirm("Turn off station TV links? Every screen showing alerts goes blank until you turn them back on.")) return;
    saveDisplayAccess({ publicDashboardEnabled: false }, "Station TV links are off.");
  }

  function makeNewLinks() {
    if (!window.confirm("Make new links? Every screen using the current links stops working until you give it the new link. Use this if a link was shared by mistake.")) return;
    saveDisplayAccess({ publicDashboardEnabled: true, publicDisplayKey: createPublicDisplayKey() }, "New links made. Update each screen with its new link.");
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

        <MvixProvisioningGuide gatewaySlug={gatewaySlug} displays={displays} displayKey={displayKey} />

        <div className="dd-alert-display-links">
          <h4>Station TV links</h4>
          <p className="dd-empty-detail">
            Screens open these links without signing in. Each link contains a private key: only put it on your own screens,
            and use "Make new links" if one is shared by mistake.
          </p>
          {canManage ? (
            <div className="dd-alert-test-actions">
              {displayKey ? (
                <>
                  <button type="button" className="dd-action-button" onClick={makeNewLinks}>Make new links</button>
                  <button type="button" className="dd-action-button" onClick={turnOffTvLinks}>Turn off TV links</button>
                </>
              ) : (
                <button type="button" className="dd-action-button primary" onClick={turnOnTvLinks}>Turn on station TV links</button>
              )}
            </div>
          ) : null}
          {!displayKey ? <p className="dd-empty-detail">Station TV links are off.</p> : null}
          {!gatewaySlug ? (
            <p className="dd-upload-error">Department gateway not resolved — open FORGE from your department portal first.</p>
          ) : null}
          <ul>
            <li>
              <DisplayAlertUrlField
                url={gatewaySlug ? buildAlertDashboardUrl(gatewaySlug, "", displayKey) : ""}
                label="Department default"
                compact
              />
            </li>
            {displays.map((display) => (
              <li key={display.id}>
                <DisplayAlertUrlField
                  url={gatewaySlug ? buildAlertDashboardUrl(gatewaySlug, display.id, displayKey) : ""}
                  label={`${display.name || display.id}${display.station ? ` · ${display.station}` : ""}`}
                  compact
                />
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
