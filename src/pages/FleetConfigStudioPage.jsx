import { useEffect, useState } from "react";
import { ArrowRightLeft, CirclePlus, ClipboardCheck, Download, Save, Settings2, Truck, AlertTriangle, Wrench, CalendarClock, Fuel, ShieldCheck, MapPin, Landmark, DollarSign, FileBarChart2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetPermissionGate,
} from "../components/fleet/FleetModuleLayout.jsx";
import FleetMigrationPanel from "../components/fleet/FleetMigrationPanel.jsx";
import FleetChecklistBuilderPanel from "../components/fleet/FleetChecklistBuilderPanel.jsx";
import FleetDefectConfigPanel from "../components/fleet/FleetDefectConfigPanel.jsx";
import FleetShopVendorConfigPanel from "../components/fleet/FleetShopVendorConfigPanel.jsx";
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
import {
  canManageFleetConfig,
  downloadClassicFleetExport,
  ensureFleetClassesSeeded,
  loadFleetSettings,
  saveFleetClass,
  saveFleetSettings,
} from "../lib/fleet/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetConfigStudioPage({
  onNavigate,
  legacyApparatus = [],
  legacyWorkOrders = [],
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canManageFleetConfig(permissions, isCreator);

  const [tab, setTab] = useState("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [classDraft, setClassDraft] = useState(null);

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextSettings, nextClasses] = await Promise.all([
        loadFleetSettings(departmentId),
        ensureFleetClassesSeeded(departmentId, actor),
      ]);
      setSettings(nextSettings);
      setClasses(nextClasses);
      setSelectedClassId((current) => current || nextClasses[0]?.id || "");
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load fleet configuration.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  useEffect(() => {
    const selected = classes.find((row) => row.id === selectedClassId) || null;
    setClassDraft(selected ? { ...selected } : null);
  }, [classes, selectedClassId]);

  async function handleSaveSettings() {
    if (!settings) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveFleetSettings(departmentId, settings, actor);
      setSettings(saved);
      setMessage("Fleet settings saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveClass() {
    if (!classDraft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveFleetClass(departmentId, classDraft, actor);
      setClasses((current) => (
        [saved, ...current.filter((row) => row.id !== saved.id)]
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      ));
      setSelectedClassId(saved.id);
      setMessage("Fleet class saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save class.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateClass() {
    setSaving(true);
    try {
      const saved = await saveFleetClass(departmentId, {
        name: "New fleet class",
        category: "emergency_response",
        description: "",
        defaultMeterTypes: ["mileage"],
      }, { ...actor, isNew: true });
      setClasses((current) => [saved, ...current]);
      setSelectedClassId(saved.id);
      setTab("classes");
      setMessage("Fleet class created.");
    } catch (createError) {
      setError(createError?.message || "Unable to create class.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setSaving(true);
    try {
      await downloadClassicFleetExport(departmentId);
      setMessage("Classic fleet backup downloaded.");
    } catch (exportError) {
      setError(exportError?.message || "Export failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FleetPermissionGate
      allowed={allowed}
      title="Fleet configuration access required"
      description="You need manageFleetConfig (or system settings / edit apparatus) to edit Fleet Configuration Studio."
    >
      <FleetModuleLayout
        title="Fleet Configuration Studio"
        description="Terminology, numbering, statuses, and fleet classes — editable without a code deploy."
        activeNavName="Fleet Configuration Studio"
        onNavigate={onNavigate}
        actions={(
          <button className="secondary-button" type="button" disabled={saving} onClick={handleExport}>
            <Download size={14} /> Backup classic lists
          </button>
        )}
      >
        <nav className="inspections-subnav" aria-label="Fleet configuration">
          {[
            ["general", "General & numbering", Settings2],
            ["classes", "Fleet classes", Truck],
            ["checklists", "Checklist builder", ClipboardCheck],
            ["defects", "Defects config", AlertTriangle],
            ["shops", "Shops & vendors", Wrench],
            ["pm", "PM builder", CalendarClock],
            ["tests", "Testing programs", ClipboardCheck],
            ["fuel", "Fuel & telematics", Fuel],
            ["components", "Components & warranty", ShieldCheck],
            ["operations", "Operations", MapPin],
            ["risk", "Accident & risk", AlertTriangle],
            ["procurement", "Procurement", Landmark],
            ["cost", "Cost & replacement", DollarSign],
            ["reporting", "Reporting & automation", FileBarChart2],
            ["hardening", "Hardening", ShieldCheck],
            ["migration", "Migration Center", ArrowRightLeft],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`inspections-subnav-item${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="inspections-loading-state" role="status"><p>Loading configuration...</p></div>
        ) : null}
        {!loading && error ? (
          <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div>
        ) : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && tab === "general" && settings ? (
          <section className="panel">
            <header>
              <div><Settings2 size={15} /><strong>Module settings</strong></div>
              <button className="primary-button" type="button" disabled={saving} onClick={handleSaveSettings}>
                <Save size={14} /> Save
              </button>
            </header>
            <div className="panel-body config-studio-body">
              <div className="occupancy-form-grid">
                <Field label="Module name">
                  <input
                    value={settings.moduleName || ""}
                    onChange={(e) => setSettings((c) => ({ ...c, moduleName: e.target.value }))}
                  />
                </Field>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={settings.moduleV2Enabled !== false}
                    onChange={(e) => setSettings((c) => ({ ...c, moduleV2Enabled: e.target.checked }))}
                  />
                  Fleet module V2 enabled
                </label>
                <Field label="Numbering prefix">
                  <input
                    value={settings.numbering?.prefix || ""}
                    onChange={(e) => setSettings((c) => ({
                      ...c,
                      numbering: { ...c.numbering, prefix: e.target.value },
                    }))}
                  />
                </Field>
                <Field label="Separator">
                  <input
                    value={settings.numbering?.separator || ""}
                    onChange={(e) => setSettings((c) => ({
                      ...c,
                      numbering: { ...c.numbering, separator: e.target.value },
                    }))}
                  />
                </Field>
                <Field label="Padding">
                  <input
                    type="number"
                    min="1"
                    value={settings.numbering?.padding ?? 4}
                    onChange={(e) => setSettings((c) => ({
                      ...c,
                      numbering: { ...c.numbering, padding: Number(e.target.value) || 4 },
                    }))}
                  />
                </Field>
                <Field label="Asset singular term">
                  <input
                    value={settings.terminology?.assetSingular || ""}
                    onChange={(e) => setSettings((c) => ({
                      ...c,
                      terminology: { ...c.terminology, assetSingular: e.target.value },
                    }))}
                  />
                </Field>
                <Field label="Asset plural term">
                  <input
                    value={settings.terminology?.assetPlural || ""}
                    onChange={(e) => setSettings((c) => ({
                      ...c,
                      terminology: { ...c.terminology, assetPlural: e.target.value },
                    }))}
                  />
                </Field>
              </div>
              <p className="occupancy-muted">
                Classic Apparatus, Assets, Maintenance, and Hose Testing remain available while V2 rolls out.
              </p>
            </div>
          </section>
        ) : null}

        {!loading && tab === "classes" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><Truck size={15} /><strong>Classes</strong></div>
                <button className="text-button" type="button" disabled={saving} onClick={handleCreateClass}>
                  <CirclePlus size={14} /> Add class
                </button>
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {classes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedClassId ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedClassId(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.category}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {classDraft ? (
              <section className="panel">
                <header>
                  <div><strong>Edit class</strong></div>
                  <button className="primary-button" type="button" disabled={saving} onClick={handleSaveClass}>
                    <Save size={14} /> Save
                  </button>
                </header>
                <div className="panel-body occupancy-form-grid">
                  <Field label="Name">
                    <input
                      value={classDraft.name || ""}
                      onChange={(e) => setClassDraft((c) => ({ ...c, name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Category">
                    <select
                      value={classDraft.category || "emergency_response"}
                      onChange={(e) => setClassDraft((c) => ({ ...c, category: e.target.value }))}
                    >
                      <option value="emergency_response">Emergency response</option>
                      <option value="ems">EMS</option>
                      <option value="support">Support</option>
                      <option value="specialty">Specialty</option>
                    </select>
                  </Field>
                  <Field label="Description" wide>
                    <textarea
                      rows={3}
                      value={classDraft.description || ""}
                      onChange={(e) => setClassDraft((c) => ({ ...c, description: e.target.value }))}
                    />
                  </Field>
                  <label className="occupancy-primary-toggle">
                    <input
                      type="checkbox"
                      checked={classDraft.active !== false}
                      onChange={(e) => setClassDraft((c) => ({ ...c, active: e.target.checked }))}
                    />
                    Active
                  </label>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {!loading && tab === "checklists" ? (
          <FleetChecklistBuilderPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {!loading && tab === "defects" ? (
          <FleetDefectConfigPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {!loading && tab === "shops" ? (
          <FleetShopVendorConfigPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {!loading && tab === "pm" ? (
          <FleetPmBuilderPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {!loading && tab === "tests" ? (
          <FleetTestProgramPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {!loading && tab === "fuel" ? (
          <FleetFuelTelematicsConfigPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
            legacyApparatus={legacyApparatus}
          />
        ) : null}

        {!loading && tab === "components" ? (
          <FleetComponentsConfigPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {!loading && tab === "operations" ? (
          <FleetOperationsConfigPanel />
        ) : null}

        {!loading && tab === "risk" ? (
          <FleetRiskConfigPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {!loading && tab === "procurement" ? (
          <FleetProcurementConfigPanel />
        ) : null}

        {!loading && tab === "cost" ? (
          <FleetCostConfigPanel />
        ) : null}

        {!loading && tab === "reporting" ? (
          <FleetReportingConfigPanel />
        ) : null}

        {!loading && tab === "hardening" ? (
          <FleetHardeningConfigPanel />
        ) : null}

        {!loading && tab === "migration" ? (
          <FleetMigrationPanel
            departmentId={departmentId}
            actor={actor}
            apparatusFallback={legacyApparatus}
            workOrderFallback={legacyWorkOrders}
            onMessage={setMessage}
            onError={setError}
            onSettingsChange={setSettings}
          />
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
