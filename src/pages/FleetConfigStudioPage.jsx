import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  Download,
  Fuel,
  Gauge,
  Save,
  Settings2,
  Truck,
  Wrench,
  Lock,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetPermissionGate,
} from "../components/fleet/FleetModuleLayout.jsx";
import FleetMigrationPanel from "../components/fleet/FleetMigrationPanel.jsx";
import FleetChecklistBuilderPanel from "../components/fleet/FleetChecklistBuilderPanel.jsx";
import FleetRepairsConfigPanel from "../components/fleet/FleetRepairsConfigPanel.jsx";
import FleetPmBuilderPanel from "../components/fleet/FleetPmBuilderPanel.jsx";
import FleetTestProgramPanel from "../components/fleet/FleetTestProgramPanel.jsx";
import FleetFuelTelematicsConfigPanel from "../components/fleet/FleetFuelTelematicsConfigPanel.jsx";
import FleetComponentsConfigPanel from "../components/fleet/FleetComponentsConfigPanel.jsx";
import FleetOperationsConfigPanel from "../components/fleet/FleetOperationsConfigPanel.jsx";
import FleetRiskConfigPanel from "../components/fleet/FleetRiskConfigPanel.jsx";
import FleetProcurementConfigPanel from "../components/fleet/FleetProcurementConfigPanel.jsx";
import FleetCostConfigPanel from "../components/fleet/FleetCostConfigPanel.jsx";
import FleetReportingConfigPanel from "../components/fleet/FleetReportingConfigPanel.jsx";
import FleetHardeningConfigPanel from "../components/fleet/FleetHardeningConfigPanel.jsx";
import FleetVehicleTypesPanel from "../components/fleet/FleetVehicleTypesPanel.jsx";
import {
  canManageFleetConfig,
  downloadClassicFleetExport,
  loadFleetSettings,
  saveFleetSettings,
} from "../lib/fleet/index.js";

// What a department admin sees.
const ADMIN_TABS = [
  ["types", "Vehicle Types", Truck],
  ["repairs", "Repairs", Wrench],
  ["maintenance", "Maintenance Schedules", CalendarClock],
  ["tests", "Testing Programs", Gauge],
  ["fuel", "Fuel", Fuel],
  ["roadside", "Roadside & Towing", AlertTriangle],
  ["checks", "Daily Checks", ClipboardCheck],
];

// FORGE staff only: advanced, read-only reference lists and one-time tools.
const STAFF_TABS = [
  ["general", "Module settings"],
  ["checklist-builder", "Advanced checklist builder"],
  ["components", "Components & warranty lists"],
  ["operations", "Operations lists"],
  ["procurement", "Procurement lists"],
  ["cost", "Cost & replacement lists"],
  ["reporting", "Reporting lists"],
  ["hardening", "Hardening"],
  ["migration", "Migration Center"],
];

export default function FleetConfigStudioPage({
  onNavigate,
  legacyApparatus = [],
  legacyWorkOrders = [],
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canManageFleetConfig(permissions, isCreator);

  const [tab, setTab] = useState("types");
  const [staffTab, setStaffTab] = useState("general");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  function showMessage(text) {
    setError("");
    setMessage(text || "");
  }
  function showError(text) {
    setMessage("");
    setError(text || "");
  }

  function switchTab(next) {
    setTab(next);
    setMessage("");
    setError("");
  }

  useEffect(() => {
    if (!isCreator || tab !== "staff" || settings || !departmentId) return;
    loadFleetSettings(departmentId).then(setSettings).catch((loadError) => showError(loadError?.message || "Couldn't load module settings."));
  }, [isCreator, tab, settings, departmentId]);

  async function handleSaveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      setSettings(await saveFleetSettings(departmentId, settings, actor));
      showMessage("Module settings saved.");
    } catch (saveError) {
      showError(saveError?.message || "Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setSaving(true);
    try {
      await downloadClassicFleetExport(departmentId);
      showMessage("Backup downloaded.");
    } catch (exportError) {
      showError(exportError?.message || "Export failed.");
    } finally {
      setSaving(false);
    }
  }

  const panelProps = { departmentId, actor, onMessage: showMessage, onError: showError };
  const tabs = isCreator ? [...ADMIN_TABS, ["staff", "Staff tools", Lock]] : ADMIN_TABS;

  return (
    <FleetPermissionGate
      allowed={allowed}
      title="Administrator access required"
      description="Only administrators (Fire Chief, IT Admin, or anyone allowed to manage fleet settings) can change fleet settings."
    >
      <FleetModuleLayout
        title="Fleet Configuration Studio"
        description="Set up how your department runs its fleet: vehicle types, repairs, maintenance, testing, fuel, and towing."
        activeNavName="Fleet Configuration Studio"
        onNavigate={onNavigate}
      >
        <nav className="inspections-subnav" aria-label="Fleet settings">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`inspections-subnav-item${tab === id ? " active" : ""}`}
              onClick={() => switchTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        {error ? (
          <div className="error-banner" role="alert">
            {error}
            <button type="button" onClick={() => setError("")} aria-label="Dismiss">×</button>
          </div>
        ) : null}
        {message ? (
          <div className="success-banner" role="status">
            {message}
            <button type="button" onClick={() => setMessage("")} aria-label="Dismiss">×</button>
          </div>
        ) : null}

        {tab === "types" ? <FleetVehicleTypesPanel {...panelProps} /> : null}

        {tab === "repairs" ? (
<FleetRepairsConfigPanel {...panelProps} />
        ) : null}

        {tab === "maintenance" ? <FleetPmBuilderPanel {...panelProps} /> : null}
        {tab === "tests" ? <FleetTestProgramPanel {...panelProps} /> : null}
        {tab === "fuel" ? <FleetFuelTelematicsConfigPanel {...panelProps} legacyApparatus={legacyApparatus} /> : null}
        {tab === "roadside" ? <FleetRiskConfigPanel {...panelProps} /> : null}

        {tab === "checks" ? (
          <section className="panel">
            <header><div><ClipboardCheck size={15} /><strong>Daily apparatus checks</strong></div></header>
            <div className="panel-body">
              <p>Units and daily checklists are set up on their own page, where you can add or remove units and edit, reorder, or delete checklist items.</p>
              <button className="primary-button" type="button" onClick={() => onNavigate?.("Apparatus Check Setup")}>
                Open Apparatus Check Setup <ArrowRight size={14} />
              </button>
            </div>
          </section>
        ) : null}

        {tab === "staff" && isCreator ? (
          <>
            <p className="occupancy-muted">FORGE staff only. Department administrators don't see this tab.</p>
            <nav className="inspections-subnav" aria-label="Staff tools">
              {STAFF_TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`inspections-subnav-item${staffTab === id ? " active" : ""}`}
                  onClick={() => { setStaffTab(id); setMessage(""); setError(""); }}
                >
                  {label}
                </button>
              ))}
              <button className="inspections-subnav-item" type="button" disabled={saving} onClick={handleExport}>
                <Download size={14} /> Backup classic lists
              </button>
            </nav>

            {staffTab === "general" ? (
              settings ? (
                <section className="panel">
                  <header>
                    <div><Settings2 size={15} /><strong>Module settings</strong></div>
                    <button className="primary-button" type="button" disabled={saving} onClick={handleSaveSettings}>
                      <Save size={14} /> Save
                    </button>
                  </header>
                  <div className="panel-body config-studio-body">
                    <div className="occupancy-form-grid">
                      <label className="config-field">
                        <span>Module name (shown on the Fleet Dashboard)</span>
                        <input
                          value={settings.moduleName || ""}
                          onChange={(e) => setSettings((c) => ({ ...c, moduleName: e.target.value }))}
                        />
                      </label>
                    </div>
                    <p className="occupancy-muted">
                      Numbering, terminology, and the "V2" switch were removed: nothing in the app used them.
                    </p>
                  </div>
                </section>
              ) : <p className="occupancy-muted">Loading…</p>
            ) : null}
            {staffTab === "checklist-builder" ? <FleetChecklistBuilderPanel {...panelProps} /> : null}
            {staffTab === "components" ? <FleetComponentsConfigPanel {...panelProps} /> : null}
            {staffTab === "operations" ? <FleetOperationsConfigPanel /> : null}
            {staffTab === "procurement" ? <FleetProcurementConfigPanel /> : null}
            {staffTab === "cost" ? <FleetCostConfigPanel /> : null}
            {staffTab === "reporting" ? <FleetReportingConfigPanel /> : null}
            {staffTab === "hardening" ? <FleetHardeningConfigPanel /> : null}
            {staffTab === "migration" ? (
              <FleetMigrationPanel
                {...panelProps}
                apparatusFallback={legacyApparatus}
                workOrderFallback={legacyWorkOrders}
                onSettingsChange={setSettings}
              />
            ) : null}
          </>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
