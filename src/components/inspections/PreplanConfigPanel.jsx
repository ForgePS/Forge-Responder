import { useEffect, useState } from "react";
import { Map, Save, Settings2, ShieldCheck, Upload } from "lucide-react";
import {
  ensurePreplanConfigSeeded,
  ensurePreplanDropdownsSeeded,
  filterFeaturesByCreatorAllowlist,
  getDepartmentPreplanFeatures,
  getPreplanTypeOptions,
  listDropdownOptions,
  PREPLAN_FEATURE_KEYS,
  PREPLAN_FEATURE_LABELS,
  publishPreplanTemplateVersion,
  saveDepartmentPreplanFeatures,
  savePreplanTemplate,
  setDropdownOptionActive,
  STARTER_PREPLAN_SYMBOLS,
  defaultPreplanFeatures,
} from "../../lib/inspections/index.js";
import { useTenant } from "../../context/TenantContext.jsx";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const SUB_TABS = [
  { id: "templates", label: "Templates" },
  { id: "dropdowns", label: "Dropdowns" },
  { id: "features", label: "Features" },
];

/**
 * Preplan types / templates / symbols / dropdowns / features for Config Studio.
 */
export default function PreplanConfigPanel({
  departmentId,
  actor = {},
  canManage = false,
}) {
  const { platformConfig } = useTenant();
  const [subTab, setSubTab] = useState("templates");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [templates, setTemplates] = useState([]);
  const [symbolLibrary, setSymbolLibrary] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [libraries, setLibraries] = useState([]);
  const [options, setOptions] = useState([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState("");
  const [features, setFeatures] = useState(defaultPreplanFeatures());

  const types = getPreplanTypeOptions();
  const creatorAllowlist = platformConfig?.availablePreplanFeatures || null;

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    setError("");
    try {
      const [seeded, dropdowns, nextFeatures] = await Promise.all([
        ensurePreplanConfigSeeded(departmentId, actor),
        ensurePreplanDropdownsSeeded(departmentId, actor),
        getDepartmentPreplanFeatures(departmentId),
      ]);
      setTemplates(seeded.templates);
      setSymbolLibrary(seeded.symbolLibrary);
      setSelectedId((current) => current || seeded.templates[0]?.id || "");
      setDraft(seeded.templates[0] || null);
      setLibraries(dropdowns.libraries || []);
      setOptions(dropdowns.options || []);
      setSelectedLibraryId((current) => current || dropdowns.libraries?.[0]?.id || "");
      setFeatures(filterFeaturesByCreatorAllowlist(nextFeatures, creatorAllowlist));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load preplan config.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    const next = templates.find((row) => row.id === selectedId) || null;
    setDraft(next ? { ...next } : null);
  }, [selectedId, templates]);

  async function handleSave() {
    if (!canManage || !draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await savePreplanTemplate(departmentId, draft, actor);
      setTemplates((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setSelectedId(saved.id);
      setMessage("Preplan template saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save template.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishVersion() {
    if (!canManage || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const version = await publishPreplanTemplateVersion(departmentId, draft.id, actor);
      setMessage(`Published immutable template version v${version.version}.`);
      await reload();
    } catch (publishError) {
      setError(publishError?.message || "Unable to publish template version.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFeatures() {
    if (!canManage) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const allowed = filterFeaturesByCreatorAllowlist(features, creatorAllowlist);
      const saved = await saveDepartmentPreplanFeatures(departmentId, allowed, actor);
      setFeatures(saved);
      setMessage("Preplan feature flags saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save features.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleOption(optionId, active) {
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      await setDropdownOptionActive(departmentId, optionId, active, actor);
      const next = await listDropdownOptions(departmentId, selectedLibraryId);
      setOptions(next);
      setMessage(active ? "Option restored." : "Option soft-disabled (historical values preserved).");
    } catch (toggleError) {
      setError(toggleError?.message || "Unable to update option.");
    } finally {
      setSaving(false);
    }
  }

  function addTemplate() {
    const id = `tpl-custom-${Date.now().toString(36)}`;
    const next = {
      id,
      name: "New preplan template",
      preplanTypeId: types[0]?.id || "commercial",
      description: "",
      sections: draft?.sections || [],
      active: true,
      version: 1,
    };
    setTemplates((current) => [next, ...current]);
    setSelectedId(id);
    setDraft(next);
  }

  if (loading) return <p className="occupancy-muted">Loading preplan configuration…</p>;

  const libraryOptions = options.filter((row) => row.libraryId === selectedLibraryId);

  return (
    <div className="config-studio-body">
      {error ? <p className="occupancy-error">{error}</p> : null}
      {message ? <p className="occupancy-message">{message}</p> : null}

      <div className="occupancy-detail-actions" style={{ marginBottom: "0.75rem" }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={subTab === tab.id ? "primary-button" : "secondary-button"}
            onClick={() => setSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === "templates" ? (
        <>
          <div className="config-split">
            <aside className="config-list-pane">
              <div className="occupancy-detail-actions">
                <strong><ShieldCheck size={14} /> Templates</strong>
                {canManage ? (
                  <button className="secondary-button" type="button" onClick={addTemplate}>Add</button>
                ) : null}
              </div>
              <div className="config-list">
                {templates.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`config-list-item${row.id === selectedId ? " active" : ""}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <strong>{row.name}</strong>
                    <span className="occupancy-muted">
                      {row.preplanTypeId}
                      {row.publishedVersion ? ` · published v${row.publishedVersion}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="config-editor-pane">
              {draft ? (
                <>
                  <div className="occupancy-form-grid">
                    <Field label="Name">
                      <input
                        value={draft.name || ""}
                        disabled={!canManage}
                        onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
                      />
                    </Field>
                <Field label="Preplan type">
                  <select
                    value={draft.preplanTypeId || ""}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, preplanTypeId: e.target.value }))}
                  >
                    {types.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Also assign to occupancy types (comma IDs)" wide>
                  <input
                    value={(draft.occupancyTypeIds || []).join(", ")}
                    disabled={!canManage}
                    placeholder="e.g. commercial, warehouse"
                    onChange={(e) => setDraft((current) => ({
                      ...current,
                      occupancyTypeIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    }))}
                  />
                </Field>
                <Field label="Description" wide>
                      <textarea
                        rows={2}
                        value={draft.description || ""}
                        disabled={!canManage}
                        onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
                      />
                    </Field>
                    <label className="occupancy-primary-toggle">
                      <input
                        type="checkbox"
                        checked={draft.active !== false}
                        disabled={!canManage}
                        onChange={(e) => setDraft((current) => ({ ...current, active: e.target.checked }))}
                      />
                      Active
                    </label>
                  </div>

                  <p className="occupancy-muted">
                    {(draft.sections || []).length} survey section(s). Working version {draft.version || 1}
                    {draft.publishedVersion ? ` · last published v${draft.publishedVersion}` : ""}.
                    Publish freezes an immutable snapshot; new revisions pin that version.
                  </p>

                  {canManage ? (
                    <div className="occupancy-detail-actions" style={{ marginBottom: "0.75rem" }}>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          const id = `sec-${Date.now().toString(36)}`;
                          setDraft((current) => ({
                            ...current,
                            sections: [
                              ...(current.sections || []),
                              {
                                id,
                                title: "New section",
                                fields: [{ key: `${id}_notes`, label: "Notes", type: "textarea" }],
                              },
                            ],
                          }));
                        }}
                      >
                        Add section
                      </button>
                    </div>
                  ) : null}

                  {(draft.sections || []).map((section, sectionIndex) => (
                    <div key={section.id} className="template-section-card">
                      {canManage ? (
                        <Field label="Section title" wide>
                          <input
                            value={section.title || ""}
                            onChange={(e) => {
                              const title = e.target.value;
                              setDraft((current) => ({
                                ...current,
                                sections: (current.sections || []).map((row, idx) => (
                                  idx === sectionIndex ? { ...row, title } : row
                                )),
                              }));
                            }}
                          />
                        </Field>
                      ) : (
                        <strong>{section.title}</strong>
                      )}
                      <ul className="occupancy-muted">
                        {(section.fields || []).map((field) => (
                          <li key={field.key}>{field.label} ({field.type})</li>
                        ))}
                      </ul>
                      {canManage ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            setDraft((current) => ({
                              ...current,
                              sections: (current.sections || []).filter((_, idx) => idx !== sectionIndex),
                            }));
                          }}
                        >
                          Remove section
                        </button>
                      ) : null}
                    </div>
                  ))}

                  {canManage ? (
                    <div className="occupancy-detail-actions">
                      <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
                        <Save size={14} /> {saving ? "Saving…" : "Save template"}
                      </button>
                      <button className="secondary-button" type="button" disabled={saving} onClick={handlePublishVersion}>
                        <Upload size={14} /> Publish version
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="occupancy-muted">Select a template.</p>
              )}
            </div>
          </div>

          <section className="panel" style={{ marginTop: "1rem" }}>
            <header>
              <div><Map size={15} /><strong>Symbol library reference</strong></div>
            </header>
            <div className="panel-body">
              <p className="occupancy-muted">
                {symbolLibrary?.name || "Default symbols"} — used on preplan diagram checklists (CAD canvas deferred).
              </p>
              <div className="occupancy-form-grid">
                {(symbolLibrary?.symbols || STARTER_PREPLAN_SYMBOLS).map((sym) => (
                  <div key={sym.id}>
                    <strong>{sym.label}</strong>
                    <div className="occupancy-muted">{sym.category} · {sym.id}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {subTab === "dropdowns" ? (
        <div className="config-split">
          <aside className="config-list-pane">
            <div className="occupancy-detail-actions">
              <strong><Settings2 size={14} /> Libraries</strong>
            </div>
            <div className="config-list">
              {libraries.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`config-list-item${row.id === selectedLibraryId ? " active" : ""}`}
                  onClick={() => setSelectedLibraryId(row.id)}
                >
                  <strong>{row.name}</strong>
                  <span className="occupancy-muted">{row.key}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className="config-editor-pane">
            <p className="occupancy-muted">
              Soft-disable options to hide them from new forms without breaking historical preplans.
            </p>
            {!libraryOptions.length ? (
              <p className="occupancy-muted">No options in this library.</p>
            ) : (
              <div className="cert-table">
                <div className="cert-row cert-head">
                  <span>Label</span>
                  <span>Code</span>
                  <span>Status</span>
                  <span />
                </div>
                {libraryOptions.map((opt) => (
                  <div key={opt.id} className="cert-row">
                    <strong>{opt.label}</strong>
                    <span>{opt.internalCode}</span>
                    <span>{opt.active === false ? "Disabled" : "Active"}</span>
                    <span>
                      {canManage ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={saving}
                          onClick={() => handleToggleOption(opt.id, opt.active === false)}
                        >
                          {opt.active === false ? "Restore" : "Disable"}
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {subTab === "features" ? (
        <section className="panel">
          <header>
            <div><Settings2 size={15} /><strong>Preplan feature toggles</strong></div>
          </header>
          <div className="panel-body">
            <p className="occupancy-muted">
              Tenant admins can only enable features the Creator has made available on the platform.
              Disabling a feature hides nav/routes; existing preplan data is preserved.
            </p>
            <div className="occupancy-form-grid">
              {Object.keys(PREPLAN_FEATURE_KEYS).map((key) => {
                const creatorBlocked = creatorAllowlist && creatorAllowlist[key] === false;
                return (
                  <label key={key} className="occupancy-primary-toggle">
                    <input
                      type="checkbox"
                      checked={features[key] !== false && !creatorBlocked}
                      disabled={!canManage || creatorBlocked}
                      onChange={(e) => setFeatures((current) => ({ ...current, [key]: e.target.checked }))}
                    />
                    {PREPLAN_FEATURE_LABELS[key] || key}
                    {creatorBlocked ? " (Creator locked)" : ""}
                  </label>
                );
              })}
            </div>
            {canManage ? (
              <button className="primary-button" type="button" disabled={saving} onClick={handleSaveFeatures}>
                <Save size={14} /> {saving ? "Saving…" : "Save features"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
