import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Save, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  canEditFleetAssets,
  canViewFleetAssets,
  DEFAULT_FLEET_STATUSES,
  ensureFleetAssets,
  ensureFleetClassesSeeded,
  filterFleetAssets,
  migrateFleetAssetsFromApparatusIfEmpty,
  saveFleetAsset,
} from "../lib/fleet/index.js";

const EMPTY_DRAFT = {
  fleetNumber: "",
  unitDesignation: "",
  name: "",
  type: "Apparatus",
  fleetClassId: "",
  station: "",
  year: "",
  mileage: "",
  engineHours: "",
  pumpHours: "",
  fuel: "",
  pmDue: "",
  status: "in_service",
  operator: "",
  notes: "",
};

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetAssetsMasterPage({
  query = "",
  onNavigate,
  legacyApparatus = [],
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const canView = canViewFleetAssets(permissions, isCreator);
  const canEdit = canEditFleetAssets(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [localSearch, setLocalSearch] = useState("");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  async function reload() {
    if (!departmentId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [assets, nextClasses] = await Promise.all([
        ensureFleetAssets(departmentId, legacyApparatus, actor),
        ensureFleetClassesSeeded(departmentId, actor),
      ]);
      setRecords(assets);
      setClasses(nextClasses);
      setSelectedId((current) => current || assets[0]?.id || "");
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load fleet assets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, canView]);

  useEffect(() => {
    const selected = records.find((row) => row.id === selectedId) || null;
    setDraft(selected ? { ...selected } : null);
  }, [records, selectedId]);

  const visible = useMemo(() => {
    const combined = [query, localSearch].filter(Boolean).join(" ");
    return filterFleetAssets(records, combined);
  }, [records, query, localSearch]);

  async function handleImport() {
    if (!canEdit) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      // Force import path only when empty; ensureFleetAssets already does this on load.
      const existing = records.length;
      if (existing) {
        setMessage("Fleet assets already exist. Import runs only when the collection is empty.");
        return;
      }
      const migrated = await migrateFleetAssetsFromApparatusIfEmpty(
        departmentId,
        legacyApparatus,
        actor
      );
      setRecords(migrated);
      setSelectedId(migrated[0]?.id || "");
      setMessage(migrated.length
        ? `Imported ${migrated.length} asset(s) from Apparatus list.`
        : "No apparatus records found to import.");
    } catch (importError) {
      setError(importError?.message || "Unable to import apparatus.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveFleetAsset(departmentId, {
        ...EMPTY_DRAFT,
        fleetNumber: `NEW-${Date.now().toString(36).toUpperCase()}`,
        name: "New fleet asset",
      }, actor);
      setRecords((current) => [saved, ...current]);
      setSelectedId(saved.id);
      setMessage("Fleet asset created.");
    } catch (createError) {
      setError(createError?.message || "Unable to create asset.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!canEdit || !draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveFleetAsset(departmentId, draft, actor);
      setRecords((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setSelectedId(saved.id);
      setMessage("Fleet asset saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save asset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FleetPermissionGate allowed={canView}>
      <FleetModuleLayout
        title="All Fleet Assets"
        description="Authoritative fleet master records. Classic Apparatus list remains until Phase 3 cutover."
        activeNavName="All Fleet Assets"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            {!records.length ? (
              <button className="secondary-button" type="button" disabled={saving} onClick={handleImport}>
                Import from Apparatus
              </button>
            ) : null}
            <button className="primary-button" type="button" disabled={saving} onClick={handleCreate}>
              <CirclePlus size={14} /> New asset
            </button>
          </div>
        ) : null}
      >
        {loading ? (
          <div className="inspections-loading-state" role="status"><p>Loading fleet assets...</p></div>
        ) : null}
        {!loading && error ? (
          <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div>
        ) : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && !records.length ? (
          <FleetEmptyState
            title="No fleet assets"
            description="Import from the classic Apparatus list or create a new fleet asset."
            icon={Truck}
          />
        ) : null}

        {!loading && records.length ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><Truck size={15} /><strong>Assets</strong></div>
                <input
                  className="config-inline-search"
                  placeholder="Filter"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                />
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {visible.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedId ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>
                        <strong>{item.fleetNumber || item.name}</strong>
                        <small>{item.type} · {item.station || "No station"}</small>
                      </span>
                      <FleetStatusBadge status={item.status} />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {draft ? (
              <section className="panel">
                <header>
                  <div><strong>{draft.fleetNumber || draft.name}</strong></div>
                  {canEdit ? (
                    <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
                      <Save size={14} /> Save
                    </button>
                  ) : null}
                </header>
                <div className="panel-body config-studio-body">
                  <div className="occupancy-form-grid">
                    <Field label="Fleet number">
                      <input
                        value={draft.fleetNumber || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, fleetNumber: e.target.value }))}
                      />
                    </Field>
                    <Field label="Unit designation">
                      <input
                        value={draft.unitDesignation || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, unitDesignation: e.target.value }))}
                      />
                    </Field>
                    <Field label="Name">
                      <input
                        value={draft.name || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
                      />
                    </Field>
                    <Field label="Type">
                      <input
                        value={draft.type || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, type: e.target.value }))}
                      />
                    </Field>
                    <Field label="Fleet class">
                      <select
                        value={draft.fleetClassId || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, fleetClassId: e.target.value }))}
                      >
                        <option value="">Select class</option>
                        {classes.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select
                        value={draft.status || "in_service"}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, status: e.target.value }))}
                      >
                        {DEFAULT_FLEET_STATUSES.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Station">
                      <input
                        value={draft.station || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, station: e.target.value }))}
                      />
                    </Field>
                    <Field label="Year">
                      <input
                        value={draft.year || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, year: e.target.value }))}
                      />
                    </Field>
                    <Field label="Mileage">
                      <input
                        value={draft.mileage ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, mileage: e.target.value }))}
                      />
                    </Field>
                    <Field label="Engine hours">
                      <input
                        value={draft.engineHours ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, engineHours: e.target.value }))}
                      />
                    </Field>
                    <Field label="Pump hours">
                      <input
                        value={draft.pumpHours ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, pumpHours: e.target.value }))}
                      />
                    </Field>
                    <Field label="Fuel">
                      <input
                        value={draft.fuel || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, fuel: e.target.value }))}
                      />
                    </Field>
                    <Field label="PM due">
                      <input
                        type="date"
                        value={draft.pmDue ? String(draft.pmDue).slice(0, 10) : ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, pmDue: e.target.value }))}
                      />
                    </Field>
                    <Field label="Operator">
                      <input
                        value={draft.operator || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, operator: e.target.value }))}
                      />
                    </Field>
                    <Field label="Notes" wide>
                      <textarea
                        rows={3}
                        value={draft.notes || ""}
                        disabled={!canEdit}
                        onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))}
                      />
                    </Field>
                  </div>
                  {draft.legacyApparatusId ? (
                    <p className="occupancy-muted">
                      Legacy apparatus id: {draft.legacyApparatusId}
                      {draft.migratedFromList ? " · imported from apparatus list" : ""}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
