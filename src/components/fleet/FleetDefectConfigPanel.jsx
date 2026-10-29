import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CirclePlus, Save, Trash2, X } from "lucide-react";
import {
  deleteDefectCategory,
  ensureDefectCategoriesSeeded,
  listDefects,
  saveDefectCategory,
} from "../../lib/fleet/index.js";
import {
  COMMON_DEFECT_SYSTEMS,
  SEVERITY_HELP,
  countOpenReferences,
  isOpenDefect,
  sortByName,
  validateConfigName,
} from "../../lib/fleet/repairsConfig.js";
import "../../styles/fleet-config-repairs.css";

const NEW_ID = "__new__";

function Field({ label, hint, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
      {hint ? <small className="occupancy-muted">{hint}</small> : null}
    </label>
  );
}

/**
 * Defect categories for the Fleet Configuration Studio "Repairs" tab.
 * Categories are what crews pick when they report a problem with a unit.
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
  const [showSeverityHelp, setShowSeverityHelp] = useState(false);

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const next = sortByName(await ensureDefectCategoriesSeeded(departmentId, actor));
      setCategories(next);
      setSelectedId((current) => current || next[0]?.id || "");
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load defect categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    if (selectedId === NEW_ID) return;
    const selected = categories.find((row) => row.id === selectedId) || null;
    setDraft(selected ? { ...selected } : null);
  }, [categories, selectedId]);

  const systemOptions = useMemo(() => {
    const set = new Set(COMMON_DEFECT_SYSTEMS);
    categories.forEach((row) => row.system && set.add(row.system));
    if (draft?.system) set.add(draft.system);
    return [...set];
  }, [categories, draft?.system]);

  const isNew = selectedId === NEW_ID;

  function startNew() {
    setSelectedId(NEW_ID);
    setDraft({ name: "", system: "General", active: true });
  }

  function cancelNew() {
    setSelectedId(categories[0]?.id || "");
  }

  async function handleSave() {
    const problem = validateConfigName(draft?.name, categories, isNew ? "" : draft?.id, "category");
    if (problem) {
      onError?.(problem);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, name: draft.name.trim() };
      if (isNew) delete payload.id;
      const saved = await saveDefectCategory(departmentId, payload, actor);
      setCategories((current) => sortByName([saved, ...current.filter((row) => row.id !== saved.id)]));
      setSelectedId(saved.id);
      onMessage?.(isNew ? `Added "${saved.name}".` : `Saved "${saved.name}".`);
    } catch (saveError) {
      onError?.(saveError?.message || "Unable to save the category.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft?.id) return;
    setSaving(true);
    try {
      const openDefects = await listDefects(departmentId, { openOnly: true });
      const inUse = countOpenReferences(openDefects, "categoryId", draft.id, isOpenDefect);
      const question = inUse
        ? `${inUse} open defect${inUse === 1 ? " uses" : "s use"} "${draft.name}". They will keep the category name, but it can no longer be picked.\n\nRemove it anyway? (To just stop crews from picking it, cancel and turn off "Available for new reports" instead.)`
        : `Remove the category "${draft.name}"? This cannot be undone.`;
      if (!window.confirm(question)) return;
      await deleteDefectCategory(departmentId, draft, actor);
      const remaining = categories.filter((row) => row.id !== draft.id);
      setCategories(remaining);
      setSelectedId(remaining[0]?.id || "");
      onMessage?.(`Removed "${draft.name}".`);
    } catch (deleteError) {
      onError?.(deleteError?.message || "Unable to remove the category.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading defect categories...</p></div>;
  }

  return (
    <section className="fleet-defect-config fleet-repairs-block">
      <div className="fleet-repairs-intro">
        <p className="occupancy-muted">
          Categories are what crews choose when they report a problem with a unit (for example, brakes or lights).
          Each report also gets a severity, which decides whether the unit stays in service.
        </p>
        <button
          type="button"
          className="text-button"
          aria-expanded={showSeverityHelp}
          onClick={() => setShowSeverityHelp((value) => !value)}
        >
          <AlertTriangle size={14} /> {showSeverityHelp ? "Hide severity levels" : "What do the severity levels mean?"}
        </button>
      </div>

      {showSeverityHelp ? (
        <ul className="fleet-repairs-severity-help">
          {SEVERITY_HELP.map((row) => (
            <li key={row.label}><strong>{row.label}:</strong> {row.text}</li>
          ))}
        </ul>
      ) : null}

      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><strong>Defect categories</strong></div>
            <button className="text-button" type="button" disabled={saving || isNew} onClick={startNew}>
              <CirclePlus size={14} /> Add category
            </button>
          </header>
          <div className="panel-body">
            <div className="personnel-list">
              {isNew ? (
                <button type="button" className="person-row selected">
                  <span>
                    <strong>{draft?.name?.trim() || "New category"}</strong>
                    <small>Not saved yet</small>
                  </span>
                </button>
              ) : null}
              {categories.length === 0 && !isNew ? (
                <p className="occupancy-muted fleet-repairs-empty">No categories yet. Add one so crews can report problems.</p>
              ) : null}
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === selectedId ? "person-row selected" : "person-row"}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.system || "General"}</small>
                  </span>
                  {item.active === false ? <span className="badge badge-neutral">Turned off</span> : null}
                </button>
              ))}
            </div>
          </div>
        </section>

        {draft ? (
          <section className="panel">
            <header>
              <div><strong>{isNew ? "New category" : "Edit category"}</strong></div>
              <div className="fleet-repairs-actions">
                {isNew ? (
                  <button className="secondary-button" type="button" disabled={saving} onClick={cancelNew}>
                    <X size={14} /> Cancel
                  </button>
                ) : (
                  <button className="secondary-button danger-button" type="button" disabled={saving} onClick={handleDelete}>
                    <Trash2 size={14} /> Remove
                  </button>
                )}
                <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
                  <Save size={14} /> {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name">
                <input
                  value={draft.name || ""}
                  placeholder="e.g. Brakes"
                  autoFocus={isNew}
                  onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
                />
              </Field>
              <Field label="Part of the apparatus" hint="Used to group categories in reports.">
                <select value={draft.system || "General"} onChange={(e) => setDraft((c) => ({ ...c, system: e.target.value }))}>
                  {systemOptions.map((system) => (
                    <option key={system} value={system}>{system}</option>
                  ))}
                </select>
              </Field>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={draft.active !== false}
                  onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))}
                />
                Available for new reports
              </label>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
