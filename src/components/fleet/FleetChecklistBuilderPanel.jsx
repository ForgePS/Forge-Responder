import { useEffect, useState } from "react";
import { CirclePlus, ClipboardCheck, Save, UploadCloud } from "lucide-react";
import {
  ensureChecklistTemplatesSeeded,
  FLEET_CHECK_FIELD_TYPES,
  FAIL_RESPONSE_ACTIONS,
  listChecklistTemplateVersions,
  publishChecklistTemplate,
  saveChecklistTemplate,
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
 * Checklist builder for Fleet Configuration Studio.
 */
export default function FleetChecklistBuilderPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [versions, setVersions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [publishSummary, setPublishSummary] = useState("");

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const seeded = await ensureChecklistTemplatesSeeded(departmentId, actor);
      const nextVersions = await listChecklistTemplateVersions(departmentId);
      setTemplates(seeded);
      setVersions(nextVersions);
      setSelectedId((current) => current || seeded[0]?.id || "");
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load checklists.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    const selected = templates.find((row) => row.id === selectedId) || null;
    setDraft(selected ? JSON.parse(JSON.stringify(selected)) : null);
    setPublishSummary("");
  }, [templates, selectedId]);

  const templateVersions = versions.filter((row) => row.templateId === selectedId);

  function updateSection(sectionIndex, patch) {
    setDraft((current) => {
      if (!current) return current;
      const sections = [...(current.sections || [])];
      sections[sectionIndex] = { ...sections[sectionIndex], ...patch };
      return { ...current, sections };
    });
  }

  function updateField(sectionIndex, fieldIndex, patch) {
    setDraft((current) => {
      if (!current) return current;
      const sections = [...(current.sections || [])];
      const fields = [...(sections[sectionIndex].fields || [])];
      fields[fieldIndex] = { ...fields[fieldIndex], ...patch };
      sections[sectionIndex] = { ...sections[sectionIndex], fields };
      return { ...current, sections };
    });
  }

  function addSection() {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: [
          ...(current.sections || []),
          {
            id: `sec-${Date.now().toString(36)}`,
            title: "New section",
            fields: [],
          },
        ],
      };
    });
  }

  function addField(sectionIndex) {
    setDraft((current) => {
      if (!current) return current;
      const sections = [...(current.sections || [])];
      const fields = [...(sections[sectionIndex].fields || [])];
      fields.push({
        id: `f-${Date.now().toString(36)}`,
        key: `item_${fields.length + 1}`,
        label: "New item",
        type: "pass_fail",
        required: false,
        failAction: "continue",
      });
      sections[sectionIndex] = { ...sections[sectionIndex], fields };
      return { ...current, sections };
    });
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    onError?.("");
    try {
      const saved = await saveChecklistTemplate(departmentId, draft, actor);
      setTemplates((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setSelectedId(saved.id);
      onMessage?.("Checklist draft saved. Publish to create an immutable version.");
    } catch (saveError) {
      onError?.(saveError?.message || "Unable to save checklist.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!draft) return;
    setSaving(true);
    onError?.("");
    try {
      const draftSaved = await saveChecklistTemplate(departmentId, draft, actor);
      const { template, version } = await publishChecklistTemplate(departmentId, draftSaved, {
        ...actor,
        changeSummary: publishSummary || undefined,
      });
      setTemplates((current) => current.map((row) => (row.id === template.id ? template : row)));
      setVersions((current) => [version, ...current.filter((row) => row.id !== version.id)]);
      onMessage?.(`Published ${template.name} as v${template.currentVersion}.`);
      setPublishSummary("");
    } catch (publishError) {
      onError?.(publishError?.message || "Unable to publish checklist.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const saved = await saveChecklistTemplate(departmentId, {
        name: "New checklist",
        checkType: "custom",
        description: "",
        sections: [{ id: "sec-1", title: "Section 1", fields: [] }],
      }, actor);
      setTemplates((current) => [saved, ...current]);
      setSelectedId(saved.id);
      onMessage?.("Checklist created.");
    } catch (createError) {
      onError?.(createError?.message || "Unable to create checklist.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading checklists...</p></div>;
  }

  return (
    <section className="personnel-workspace occupancy-workspace">
      <section className="panel">
        <header>
          <div><ClipboardCheck size={15} /><strong>Checklists</strong></div>
          <button className="text-button" type="button" disabled={saving} onClick={handleCreate}>
            <CirclePlus size={14} /> Add
          </button>
        </header>
        <div className="panel-body">
          <div className="personnel-list">
            {templates.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === selectedId ? "person-row selected" : "person-row"}
                onClick={() => setSelectedId(item.id)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.checkType} · v{item.currentVersion || 0}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {draft ? (
        <section className="panel">
          <header>
            <div><strong>Checklist builder</strong></div>
            <div className="occupancy-detail-actions">
              <button className="secondary-button" type="button" disabled={saving} onClick={handleSave}>
                <Save size={14} /> Save draft
              </button>
              <button className="primary-button" type="button" disabled={saving} onClick={handlePublish}>
                <UploadCloud size={14} /> Publish
              </button>
            </div>
          </header>
          <div className="panel-body config-studio-body">
            <div className="occupancy-form-grid">
              <Field label="Name">
                <input value={draft.name || ""} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Check type">
                <input value={draft.checkType || ""} onChange={(e) => setDraft((c) => ({ ...c, checkType: e.target.value }))} />
              </Field>
              <Field label="Publish summary">
                <input
                  value={publishSummary}
                  onChange={(e) => setPublishSummary(e.target.value)}
                  placeholder="What changed?"
                />
              </Field>
              <Field label="Description">
                <textarea rows={2} value={draft.description || ""} onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))} />
              </Field>
            </div>

            <button className="text-button" type="button" onClick={addSection}>Add section</button>

            {(draft.sections || []).map((section, sectionIndex) => (
              <div key={section.id || sectionIndex} className="template-section-card">
                <Field label="Section title">
                  <input
                    value={section.title || ""}
                    onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
                  />
                </Field>
                <div className="template-fields">
                  {(section.fields || []).map((field, fieldIndex) => (
                    <div key={field.id || fieldIndex} className="template-field-card">
                      <Field label="Label">
                        <input value={field.label || ""} onChange={(e) => updateField(sectionIndex, fieldIndex, { label: e.target.value })} />
                      </Field>
                      <Field label="Key">
                        <input value={field.key || ""} onChange={(e) => updateField(sectionIndex, fieldIndex, { key: e.target.value })} />
                      </Field>
                      <Field label="Type">
                        <select value={field.type || "pass_fail"} onChange={(e) => updateField(sectionIndex, fieldIndex, { type: e.target.value })}>
                          {FLEET_CHECK_FIELD_TYPES.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="On fail">
                        <select value={field.failAction || "continue"} onChange={(e) => updateField(sectionIndex, fieldIndex, { failAction: e.target.value })}>
                          {FAIL_RESPONSE_ACTIONS.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                      <label className="occupancy-primary-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(field.required)}
                          onChange={(e) => updateField(sectionIndex, fieldIndex, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      <label className="occupancy-primary-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(field.noteRequiredOnFail)}
                          onChange={(e) => updateField(sectionIndex, fieldIndex, { noteRequiredOnFail: e.target.checked })}
                        />
                        Note on fail
                      </label>
                    </div>
                  ))}
                </div>
                <button className="text-button" type="button" onClick={() => addField(sectionIndex)}>
                  <CirclePlus size={14} /> Add field
                </button>
              </div>
            ))}

            <section className="occupancy-section">
              <header><div><strong>Published versions</strong></div></header>
              {!templateVersions.length ? (
                <p className="occupancy-muted">No published versions yet.</p>
              ) : (
                <ul className="occupancy-timeline">
                  {templateVersions.map((version) => (
                    <li key={version.id}>
                      <strong>v{version.version}</strong>
                      <small>
                        {version.publishedAt ? new Date(version.publishedAt).toLocaleString() : "—"}
                        {version.changeSummary ? ` · ${version.changeSummary}` : ""}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </section>
      ) : null}
    </section>
  );
}
