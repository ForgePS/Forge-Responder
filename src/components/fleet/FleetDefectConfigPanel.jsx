import { useEffect, useState } from "react";
import { AlertTriangle, CirclePlus, Save } from "lucide-react";
import {
  ensureDefectCategoriesSeeded,
  getDefaultDefectSeverities,
  saveDefectCategory,
} from "../../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Defect categories + severity reference for Fleet Configuration Studio.
 */
export default function FleetDefectConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const severities = getDefaultDefectSeverities();

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const next = await ensureDefectCategoriesSeeded(departmentId, actor);
      setCategories(next);
      setSelectedId((current) => current || next[0]?.id || "");
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load defect config.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    const selected = categories.find((row) => row.id === selectedId) || null;
    setDraft(selected ? { ...selected } : null);
  }, [categories, selectedId]);

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading defect configuration...</p></div>;
  }

  return (
    <section className="fleet-defect-config">
      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><AlertTriangle size={15} /><strong>Severity levels</strong></div></header>
        <div className="panel-body">
          <p className="occupancy-muted">
            Default severities drive OOS / restrict recommendations. Tenant labels can be extended in a later config pack.
          </p>
          <div className="cert-table">
            <div className="cert-row cert-head">
              <span>Severity</span>
              <span>Rank</span>
              <span>Default restrict</span>
              <span>Default OOS</span>
            </div>
            {severities.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.label}</strong>
                <span>{row.rank}</span>
                <span>{row.defaultRestrict ? "Yes" : "No"}</span>
                <span>{row.defaultOos ? "Yes" : "No"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><strong>Categories</strong></div>
            <button
              className="text-button"
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const saved = await saveDefectCategory(departmentId, {
                    name: "New category",
                    system: "General",
                  }, actor);
                  setCategories((current) => [saved, ...current]);
                  setSelectedId(saved.id);
                  onMessage?.("Category created.");
                } catch (createError) {
                  onError?.(createError?.message || "Unable to create category.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <CirclePlus size={14} /> Add
            </button>
          </header>
          <div className="panel-body">
            <div className="personnel-list">
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === selectedId ? "person-row selected" : "person-row"}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.system}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {draft ? (
          <section className="panel">
            <header>
              <div><strong>Edit category</strong></div>
              <button
                className="primary-button"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const saved = await saveDefectCategory(departmentId, draft, actor);
                    setCategories((current) => current.map((row) => (row.id === saved.id ? saved : row)));
                    onMessage?.("Category saved.");
                  } catch (saveError) {
                    onError?.(saveError?.message || "Unable to save.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Save size={14} /> Save
              </button>
            </header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name">
                <input value={draft.name || ""} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="System">
                <input value={draft.system || ""} onChange={(e) => setDraft((c) => ({ ...c, system: e.target.value }))} />
              </Field>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={draft.active !== false}
                  onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
