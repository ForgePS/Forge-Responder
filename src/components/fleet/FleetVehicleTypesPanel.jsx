import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Save, Trash2, Truck } from "lucide-react";
import {
  deleteFleetClass,
  ensureFleetClassesSeeded,
  FLEET_CLASS_CATEGORIES,
  fleetClassCategoryLabel,
  listFleetAssets,
  saveFleetClass,
} from "../../lib/fleet/index.js";

const EMPTY_DRAFT = { id: "", name: "", category: "emergency_response", description: "", active: true, defaultMeterTypes: ["mileage"] };

/**
 * Vehicle types (fleet classes): Engine, Ladder, Ambulance… Used by the unit list,
 * maintenance schedules, and the readiness board filter.
 */
export default function FleetVehicleTypesPanel({ departmentId, actor, onMessage, onError }) {
  const [classes, setClasses] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load(keepId = selectedId) {
    setLoading(true);
    try {
      const [nextClasses, nextAssets] = await Promise.all([
        ensureFleetClassesSeeded(departmentId, actor),
        listFleetAssets(departmentId),
      ]);
      setClasses(nextClasses);
      setAssets(nextAssets);
      const pick = nextClasses.find((row) => row.id === keepId) || nextClasses[0] || null;
      setSelectedId(pick?.id || "");
      setDraft(pick ? { ...pick } : null);
    } catch (error) {
      onError?.(error?.message || "Couldn't load vehicle types.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [departmentId]);

  const unitCounts = useMemo(() => {
    const counts = {};
    for (const asset of assets) {
      if (asset.fleetClassId) counts[asset.fleetClassId] = (counts[asset.fleetClassId] || 0) + 1;
    }
    return counts;
  }, [assets]);

  const saved = classes.find((row) => row.id === draft?.id) || null;
  const dirty = Boolean(draft) && (!draft.id || JSON.stringify({ ...saved }) !== JSON.stringify({ ...saved, ...draft }));

  function select(id) {
    if (dirty && !window.confirm("You have unsaved changes. Switch without saving?")) return;
    const row = classes.find((item) => item.id === id);
    setSelectedId(id);
    setDraft(row ? { ...row } : null);
  }

  function startNew() {
    if (dirty && !window.confirm("You have unsaved changes. Start a new type without saving?")) return;
    setSelectedId("");
    setDraft({ ...EMPTY_DRAFT });
  }

  async function save() {
    if (!draft) return;
    const name = String(draft.name || "").trim();
    if (!name) {
      onError?.("Give the vehicle type a name, like Engine or Ambulance.");
      return;
    }
    if (classes.some((row) => row.id !== draft.id && row.name.toLowerCase() === name.toLowerCase())) {
      onError?.(`There's already a vehicle type called ${name}.`);
      return;
    }
    setSaving(true);
    onError?.("");
    try {
      const result = await saveFleetClass(departmentId, { ...draft, name }, actor);
      onMessage?.(`${result.name} saved.`);
      await load(result.id);
    } catch (error) {
      onError?.(error?.message || "Couldn't save the vehicle type.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft?.id) {
      setDraft(classes.find((row) => row.id === selectedId) ? { ...classes.find((row) => row.id === selectedId) } : null);
      return;
    }
    const inUse = unitCounts[draft.id] || 0;
    if (inUse) {
      if (window.confirm(`${inUse} unit${inUse === 1 ? " uses" : "s use"} ${draft.name}, so it can't be deleted. Turn it off instead? It will stop appearing in lists.`)) {
        setSaving(true);
        try {
          await saveFleetClass(departmentId, { ...draft, active: false }, actor);
          onMessage?.(`${draft.name} turned off.`);
          await load(draft.id);
        } catch (error) {
          onError?.(error?.message || "Couldn't update the vehicle type.");
        } finally {
          setSaving(false);
        }
      }
      return;
    }
    if (!window.confirm(`Delete the ${draft.name} vehicle type?`)) return;
    setSaving(true);
    try {
      await deleteFleetClass(departmentId, draft, actor);
      onMessage?.(`${draft.name} deleted.`);
      await load("");
    } catch (error) {
      onError?.(error?.message || "Couldn't delete the vehicle type.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="inspections-loading-state" role="status"><p>Loading vehicle types…</p></div>;

  return (
    <section className="personnel-workspace occupancy-workspace">
      <section className="panel">
        <header>
          <div><Truck size={15} /><strong>Vehicle types</strong></div>
          <button className="text-button" type="button" onClick={startNew}>
            <CirclePlus size={14} /> Add type
          </button>
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">Group your units (Engine, Ladder, Ambulance…). Maintenance schedules can apply to just some types.</p>
          <div className="personnel-list">
            {!draft?.id && draft ? (
              <button type="button" className="person-row selected">
                <span><strong>{draft.name || "New vehicle type"}</strong><small>Not saved yet</small></span>
              </button>
            ) : null}
            {classes.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === selectedId && draft?.id ? "person-row selected" : "person-row"}
                onClick={() => select(item.id)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {[fleetClassCategoryLabel(item.category), `${unitCounts[item.id] || 0} unit${unitCounts[item.id] === 1 ? "" : "s"}`, item.active === false ? "Off" : ""].filter(Boolean).join(" · ")}
                  </small>
                </span>
              </button>
            ))}
            {!classes.length && !draft ? <p className="empty-table">No vehicle types yet.</p> : null}
          </div>
        </div>
      </section>

      {draft ? (
        <section className="panel">
          <header>
            <div><strong>{draft.id ? `Edit ${saved?.name || "vehicle type"}` : "New vehicle type"}</strong></div>
          </header>
          <div className="panel-body occupancy-form-grid">
            <label className="config-field">
              <span>Name</span>
              <input value={draft.name || ""} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. Engine" />
            </label>
            <label className="config-field">
              <span>Category</span>
              <select value={draft.category || "emergency_response"} onChange={(e) => setDraft((c) => ({ ...c, category: e.target.value }))}>
                {FLEET_CLASS_CATEGORIES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </label>
            <label className="config-field wide">
              <span>Description (optional)</span>
              <textarea rows={2} value={draft.description || ""} onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))} />
            </label>
            <label className="occupancy-primary-toggle">
              <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))} />
              In use (turn off to hide it from lists)
            </label>
            <div className="occupancy-detail-actions" style={{ gridColumn: "1 / -1" }}>
              {dirty ? <span className="unsaved-chip">Unsaved changes</span> : null}
              <button className="secondary-button danger-button" type="button" disabled={saving} onClick={remove}>
                <Trash2 size={14} /> {draft.id ? "Delete" : "Discard"}
              </button>
              <button className="primary-button" type="button" disabled={saving || !dirty} onClick={save}>
                <Save size={14} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
