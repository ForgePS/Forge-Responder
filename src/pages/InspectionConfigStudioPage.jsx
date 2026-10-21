import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  CirclePlus,
  ClipboardList,
  FileStack,
  FileText,
  Save,
  Settings2,
  ShieldCheck,
  UploadCloud,
  Flame,
  DollarSign,
  FileBarChart2,
  Wifi,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import CodeAndViolationsConfigPanel from "../components/inspections/CodeAndViolationsConfigPanel.jsx";
import PreplanConfigPanel from "../components/inspections/PreplanConfigPanel.jsx";
import NoticeDocumentsConfigPanel from "../components/inspections/NoticeDocumentsConfigPanel.jsx";
import FireProtectionConfigPanel from "../components/inspections/FireProtectionConfigPanel.jsx";
import FeeSchedulesConfigPanel from "../components/inspections/FeeSchedulesConfigPanel.jsx";
import InspectionReportingConfigPanel from "../components/inspections/InspectionReportingConfigPanel.jsx";
import InspectionOfflineConfigPanel from "../components/inspections/InspectionOfflineConfigPanel.jsx";
import InspectionAutomationConfigPanel from "../components/inspections/InspectionAutomationConfigPanel.jsx";
import InspectionHardeningConfigPanel from "../components/inspections/InspectionHardeningConfigPanel.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import {
  TEMPLATE_FIELD_TYPES,
  archiveInspectionType,
  canManageInspectionConfig,
  ensureInspectionConfigSeeded,
  listTemplateVersions,
  loadInspectionSettings,
  publishInspectionTemplate,
  restoreTemplateVersionAsDraft,
  saveInspectionSettings,
  saveInspectionTemplate,
  saveInspectionType,
} from "../lib/inspections/index.js";

const TABS = [
  { id: "general", label: "General & numbering", icon: Settings2 },
  { id: "types", label: "Inspection types", icon: ClipboardList },
  { id: "templates", label: "Template builder", icon: FileStack },
  { id: "codes", label: "Codes & catalog", icon: BookOpen },
  { id: "preplans", label: "Preplans", icon: ShieldCheck },
  { id: "documents", label: "Notices & docs", icon: FileText },
  { id: "fps", label: "Fire protection", icon: Flame },
  { id: "fees", label: "Fees", icon: DollarSign },
  { id: "reports", label: "Reporting", icon: FileBarChart2 },
  { id: "offline", label: "Offline", icon: Wifi },
  { id: "automation", label: "Automation", icon: Zap },
  { id: "hardening", label: "Hardening", icon: ShieldCheck },
];

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function listToLines(values = []) {
  return (Array.isArray(values) ? values : []).join("\n");
}

function linesToList(text = "") {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function InspectionConfigStudioPage() {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canManageInspectionConfig(permissions, isCreator);

  const [tab, setTab] = useState(() => {
    try {
      const stored = window.sessionStorage.getItem("forge-config-studio-tab");
      if (stored) {
        window.sessionStorage.removeItem("forge-config-studio-tab");
        return stored;
      }
    } catch {
      // ignore
    }
    return "general";
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [settings, setSettings] = useState(null);
  const [types, setTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [versions, setVersions] = useState([]);

  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [typeDraft, setTypeDraft] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState(null);
  const [publishSummary, setPublishSummary] = useState("");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  async function reload() {
    if (!departmentId || !allowed) return;
    setLoading(true);
    setError("");
    try {
      const [nextSettings, seeded] = await Promise.all([
        loadInspectionSettings(departmentId),
        ensureInspectionConfigSeeded(departmentId, actor),
      ]);
      const nextVersions = await listTemplateVersions(departmentId);
      setSettings(nextSettings);
      setTypes(seeded.types);
      setTemplates(seeded.templates);
      setVersions(nextVersions);
      setSelectedTypeId((current) => current || seeded.types[0]?.id || "");
      setSelectedTemplateId((current) => current || seeded.templates[0]?.id || "");
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load configuration studio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  useEffect(() => {
    const selected = types.find((row) => row.id === selectedTypeId) || null;
    setTypeDraft(selected ? { ...selected } : null);
  }, [types, selectedTypeId]);

  useEffect(() => {
    const selected = templates.find((row) => row.id === selectedTemplateId) || null;
    setTemplateDraft(selected ? JSON.parse(JSON.stringify(selected)) : null);
    setPublishSummary("");
  }, [templates, selectedTemplateId]);

  const templateVersions = useMemo(
    () => versions.filter((row) => row.templateId === selectedTemplateId),
    [versions, selectedTemplateId]
  );

  async function handleSaveSettings() {
    if (!departmentId || !settings) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveInspectionSettings(departmentId, settings, actor);
      setSettings(saved);
      setMessage("General settings saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveType() {
    if (!departmentId || !typeDraft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveInspectionType(departmentId, typeDraft, {
        ...actor,
        isNew: !types.some((row) => row.id === typeDraft.id),
      });
      const next = [
        saved,
        ...types.filter((row) => row.id !== saved.id),
      ].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setTypes(next);
      setSelectedTypeId(saved.id);
      setMessage("Inspection type saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save inspection type.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateType() {
    if (!departmentId) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveInspectionType(departmentId, {
        name: "New inspection type",
        category: "General",
        description: "",
        lifecycleStatus: "draft",
        frequency: "As needed",
        durationMinutes: 60,
      }, { ...actor, isNew: true });
      setTypes((current) => [saved, ...current]);
      setSelectedTypeId(saved.id);
      setTab("types");
      setMessage("Draft inspection type created.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to create type.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveType() {
    if (!departmentId || !typeDraft?.id) return;
    setSaving(true);
    try {
      const archived = await archiveInspectionType(departmentId, typeDraft.id, actor);
      if (archived) {
        setTypes((current) => current.map((row) => (row.id === archived.id ? archived : row)));
        setMessage("Inspection type archived.");
      }
    } catch (archiveError) {
      setError(archiveError?.message || "Unable to archive type.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTemplate() {
    if (!departmentId || !templateDraft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveInspectionTemplate(departmentId, templateDraft, {
        ...actor,
        isNew: !templates.some((row) => row.id === templateDraft.id),
      });
      setTemplates((current) => (
        [saved, ...current.filter((row) => row.id !== saved.id)]
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      ));
      setSelectedTemplateId(saved.id);
      setMessage("Template draft saved. Publish to create an immutable version.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save template.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishTemplate() {
    if (!departmentId || !templateDraft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      // Persist draft first so publish snapshot matches UI.
      const draftSaved = await saveInspectionTemplate(departmentId, templateDraft, {
        ...actor,
        isNew: false,
      });
      const { template, version } = await publishInspectionTemplate(departmentId, draftSaved, {
        ...actor,
        changeSummary: publishSummary || undefined,
      });
      setTemplates((current) => current.map((row) => (row.id === template.id ? template : row)));
      setVersions((current) => [version, ...current.filter((row) => row.id !== version.id)]);
      setMessage(`Published ${template.name} as v${template.currentVersion}.`);
      setPublishSummary("");
    } catch (publishError) {
      setError(publishError?.message || "Unable to publish template.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreVersion(version) {
    if (!departmentId || !version) return;
    setSaving(true);
    setError("");
    try {
      const restored = await restoreTemplateVersionAsDraft(departmentId, version, actor);
      setTemplates((current) => current.map((row) => (row.id === restored.id ? restored : row)));
      setMessage(`Restored draft from v${version.version}. Publish again to create a new version.`);
    } catch (restoreError) {
      setError(restoreError?.message || "Unable to restore version.");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(sectionIndex, patch) {
    setTemplateDraft((current) => {
      if (!current) return current;
      const sections = [...(current.sections || [])];
      sections[sectionIndex] = { ...sections[sectionIndex], ...patch };
      return { ...current, sections };
    });
  }

  function updateField(sectionIndex, fieldIndex, patch) {
    setTemplateDraft((current) => {
      if (!current) return current;
      const sections = [...(current.sections || [])];
      const fields = [...(sections[sectionIndex].fields || [])];
      fields[fieldIndex] = { ...fields[fieldIndex], ...patch };
      sections[sectionIndex] = { ...sections[sectionIndex], fields };
      return { ...current, sections };
    });
  }

  function addSection() {
    setTemplateDraft((current) => {
      if (!current) return current;
      const sections = [...(current.sections || [])];
      sections.push({
        id: `sec-${Date.now()}`,
        title: `Section ${sections.length + 1}`,
        sortOrder: sections.length,
        fields: [],
      });
      return { ...current, sections };
    });
  }

  function addField(sectionIndex) {
    setTemplateDraft((current) => {
      if (!current) return current;
      const sections = [...(current.sections || [])];
      const fields = [...(sections[sectionIndex].fields || [])];
      fields.push({
        id: `fld-${Date.now()}`,
        key: `field_${fields.length + 1}`,
        type: "pass_fail",
        label: "New field",
        required: false,
        helpText: "",
        sortOrder: fields.length,
        options: [],
        autoCreateViolation: false,
        severity: "",
      });
      sections[sectionIndex] = { ...sections[sectionIndex], fields };
      return { ...current, sections };
    });
  }

  function removeField(sectionIndex, fieldIndex) {
    setTemplateDraft((current) => {
      if (!current) return current;
      const sections = [...(current.sections || [])];
      const fields = (sections[sectionIndex].fields || []).filter((_, i) => i !== fieldIndex);
      sections[sectionIndex] = { ...sections[sectionIndex], fields };
      return { ...current, sections };
    });
  }

  return (
    <InspectionPermissionGate
      allowed={allowed}
      title="Configuration access required"
      description="You need manageInspectionConfig (or system settings) permission to edit the Inspections Configuration Studio."
    >
      <div className="module-page inspection-config-studio">
        <section className="module-heading">
          <div>
            <span className="module-icon"><Settings2 size={22} /></span>
            <div>
              <h1>Inspections Configuration Studio</h1>
              <p>Edit inspection types, statuses, numbering, and versioned form templates without a code deploy.</p>
            </div>
          </div>
          <button className="secondary-button" type="button" onClick={reload} disabled={loading || saving}>
            Refresh
          </button>
        </section>

        <nav className="inspections-subnav" aria-label="Configuration studio">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`inspections-subnav-item${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </nav>

        {loading ? <div className="inspections-loading-state" role="status"><p>Loading configuration...</p></div> : null}
        {!loading && error ? (
          <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div>
        ) : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && tab === "general" && settings ? (
          <section className="panel">
            <header><div><Settings2 size={15} /><strong>Module settings</strong></div></header>
            <div className="panel-body config-studio-body">
              <div className="occupancy-form-grid">
                <Field label="Numbering prefix">
                  <input
                    value={settings.numbering?.prefix || ""}
                    onChange={(e) => setSettings((current) => ({
                      ...current,
                      numbering: { ...current.numbering, prefix: e.target.value },
                    }))}
                  />
                </Field>
                <Field label="Separator">
                  <input
                    value={settings.numbering?.separator || ""}
                    onChange={(e) => setSettings((current) => ({
                      ...current,
                      numbering: { ...current.numbering, separator: e.target.value },
                    }))}
                  />
                </Field>
                <Field label="Sequence padding">
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={settings.numbering?.sequencePadding ?? 4}
                    onChange={(e) => setSettings((current) => ({
                      ...current,
                      numbering: { ...current.numbering, sequencePadding: Number(e.target.value) || 4 },
                    }))}
                  />
                </Field>
                <Field label="Module name">
                  <input
                    value={settings.terminology?.moduleName || ""}
                    onChange={(e) => setSettings((current) => ({
                      ...current,
                      terminology: { ...current.terminology, moduleName: e.target.value },
                    }))}
                  />
                </Field>
              </div>

              <Field label="Inspection statuses (one per line)" wide>
                <textarea
                  rows={5}
                  value={listToLines(settings.inspectionStatuses)}
                  onChange={(e) => setSettings((current) => ({
                    ...current,
                    inspectionStatuses: linesToList(e.target.value),
                  }))}
                />
              </Field>
              <Field label="Violation statuses (one per line)" wide>
                <textarea
                  rows={4}
                  value={listToLines(settings.violationStatuses)}
                  onChange={(e) => setSettings((current) => ({
                    ...current,
                    violationStatuses: linesToList(e.target.value),
                  }))}
                />
              </Field>
              <Field label="Severity levels (one per line)" wide>
                <textarea
                  rows={3}
                  value={listToLines(settings.severityLevels)}
                  onChange={(e) => setSettings((current) => ({
                    ...current,
                    severityLevels: linesToList(e.target.value),
                  }))}
                />
              </Field>
              <Field label="Priority levels (one per line)" wide>
                <textarea
                  rows={3}
                  value={listToLines(settings.priorityLevels)}
                  onChange={(e) => setSettings((current) => ({
                    ...current,
                    priorityLevels: linesToList(e.target.value),
                  }))}
                />
              </Field>

              <div className="occupancy-detail-actions">
                <button className="primary-button" type="button" onClick={handleSaveSettings} disabled={saving}>
                  <Save size={14} /> Save settings
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "types" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><ClipboardList size={15} /><strong>Types</strong></div>
                <button className="text-button" type="button" onClick={handleCreateType} disabled={saving}>
                  <CirclePlus size={14} /> Add
                </button>
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {types.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedTypeId ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedTypeId(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.category} · {item.frequency}</small>
                      </span>
                      <InspectionStatusBadge status={item.lifecycleStatus} />
                    </button>
                  ))}
                  {!types.length ? <InspectionEmptyState title="No inspection types" description="Starter types will seed automatically on first open." /> : null}
                </div>
              </div>
            </section>

            {typeDraft ? (
              <section className="panel">
                <header>
                  <div><strong>Edit type</strong></div>
                  <div className="occupancy-detail-actions">
                    <button className="secondary-button" type="button" onClick={handleArchiveType} disabled={saving}>
                      <Archive size={14} /> Archive
                    </button>
                    <button className="primary-button" type="button" onClick={handleSaveType} disabled={saving}>
                      <Save size={14} /> Save type
                    </button>
                  </div>
                </header>
                <div className="panel-body occupancy-form-grid">
                  <Field label="Name"><input value={typeDraft.name || ""} onChange={(e) => setTypeDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                  <Field label="Category"><input value={typeDraft.category || ""} onChange={(e) => setTypeDraft((c) => ({ ...c, category: e.target.value }))} /></Field>
                  <Field label="Frequency"><input value={typeDraft.frequency || ""} onChange={(e) => setTypeDraft((c) => ({ ...c, frequency: e.target.value }))} /></Field>
                  <Field label="Duration (minutes)">
                    <input
                      type="number"
                      value={typeDraft.durationMinutes ?? 60}
                      onChange={(e) => setTypeDraft((c) => ({ ...c, durationMinutes: Number(e.target.value) || 0 }))}
                    />
                  </Field>
                  <Field label="Color"><input value={typeDraft.color || ""} onChange={(e) => setTypeDraft((c) => ({ ...c, color: e.target.value }))} /></Field>
                  <Field label="Lifecycle">
                    <select value={typeDraft.lifecycleStatus || "draft"} onChange={(e) => setTypeDraft((c) => ({ ...c, lifecycleStatus: e.target.value }))}>
                      {["draft", "published", "archived"].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </Field>
                  <Field label="Default template ID"><input value={typeDraft.defaultTemplateId || ""} onChange={(e) => setTypeDraft((c) => ({ ...c, defaultTemplateId: e.target.value }))} /></Field>
                  <Field label="Fee amount">
                    <input
                      type="number"
                      value={typeDraft.feeAmount ?? 0}
                      onChange={(e) => setTypeDraft((c) => ({ ...c, feeAmount: Number(e.target.value) || 0 }))}
                    />
                  </Field>
                  <label className="occupancy-primary-toggle">
                    <input type="checkbox" checked={Boolean(typeDraft.publicRequestEligible)} onChange={(e) => setTypeDraft((c) => ({ ...c, publicRequestEligible: e.target.checked }))} />
                    Public request eligible
                  </label>
                  <label className="occupancy-primary-toggle">
                    <input type="checkbox" checked={Boolean(typeDraft.requiredApprovals)} onChange={(e) => setTypeDraft((c) => ({ ...c, requiredApprovals: e.target.checked }))} />
                    Requires approval
                  </label>
                  <Field label="Description" wide>
                    <textarea rows={3} value={typeDraft.description || ""} onChange={(e) => setTypeDraft((c) => ({ ...c, description: e.target.value }))} />
                  </Field>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {!loading && tab === "codes" ? (
          <CodeAndViolationsConfigPanel
            departmentId={departmentId}
            actor={actor}
            onMessage={setMessage}
            onError={setError}
          />
        ) : null}

        {!loading && tab === "preplans" ? (
          <PreplanConfigPanel
            departmentId={departmentId}
            actor={actor}
            canManage={allowed}
          />
        ) : null}

        {!loading && tab === "documents" ? (
          <NoticeDocumentsConfigPanel
            departmentId={departmentId}
            actor={actor}
            canManage={allowed}
          />
        ) : null}

        {!loading && tab === "fps" ? (
          <FireProtectionConfigPanel />
        ) : null}

        {!loading && tab === "fees" ? (
          <FeeSchedulesConfigPanel
            departmentId={departmentId}
            actor={actor}
            canManage={allowed}
          />
        ) : null}

        {!loading && tab === "reports" ? (
          <InspectionReportingConfigPanel />
        ) : null}

        {!loading && tab === "offline" ? (
          <InspectionOfflineConfigPanel />
        ) : null}

        {!loading && tab === "automation" ? (
          <InspectionAutomationConfigPanel />
        ) : null}

        {!loading && tab === "hardening" ? (
          <InspectionHardeningConfigPanel />
        ) : null}

        {!loading && tab === "templates" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><FileStack size={15} /><strong>Templates</strong></div></header>
              <div className="panel-body">
                <div className="personnel-list">
                  {templates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedTemplateId ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedTemplateId(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>v{item.currentVersion || 0} · {item.inspectionTypeId || "unlinked"}</small>
                      </span>
                      <InspectionStatusBadge status={item.lifecycleStatus} />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {templateDraft ? (
              <section className="panel">
                <header>
                  <div><strong>Template builder</strong></div>
                  <div className="occupancy-detail-actions">
                    <button className="secondary-button" type="button" onClick={handleSaveTemplate} disabled={saving}>
                      <Save size={14} /> Save draft
                    </button>
                    <button className="primary-button" type="button" onClick={handlePublishTemplate} disabled={saving}>
                      <UploadCloud size={14} /> Publish version
                    </button>
                  </div>
                </header>
                <div className="panel-body config-studio-body">
                  <div className="occupancy-form-grid">
                    <Field label="Name"><input value={templateDraft.name || ""} onChange={(e) => setTemplateDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                    <Field label="Inspection type ID">
                      <select
                        value={templateDraft.inspectionTypeId || ""}
                        onChange={(e) => setTemplateDraft((c) => ({ ...c, inspectionTypeId: e.target.value }))}
                      >
                        <option value="">Select type</option>
                        {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Publish change summary" wide>
                      <input
                        value={publishSummary}
                        onChange={(e) => setPublishSummary(e.target.value)}
                        placeholder="What changed in this version?"
                      />
                    </Field>
                    <Field label="Description" wide>
                      <textarea rows={2} value={templateDraft.description || ""} onChange={(e) => setTemplateDraft((c) => ({ ...c, description: e.target.value }))} />
                    </Field>
                  </div>

                  <div className="occupancy-detail-actions">
                    <button className="text-button" type="button" onClick={addSection}>Add section</button>
                  </div>

                  {(templateDraft.sections || []).map((section, sectionIndex) => (
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
                              <select value={field.type || "short_text"} onChange={(e) => updateField(sectionIndex, fieldIndex, { type: e.target.value })}>
                                {TEMPLATE_FIELD_TYPES.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Help text">
                              <input value={field.helpText || ""} onChange={(e) => updateField(sectionIndex, fieldIndex, { helpText: e.target.value })} />
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
                                checked={Boolean(field.autoCreateViolation)}
                                onChange={(e) => updateField(sectionIndex, fieldIndex, { autoCreateViolation: e.target.checked })}
                              />
                              Auto-create violation
                            </label>
                            <button className="text-button" type="button" onClick={() => removeField(sectionIndex, fieldIndex)}>Remove field</button>
                          </div>
                        ))}
                      </div>
                      <button className="text-button" type="button" onClick={() => addField(sectionIndex)}>
                        <CirclePlus size={14} /> Add field
                      </button>
                    </div>
                  ))}

                  <section className="occupancy-section">
                    <header><div><strong>Version history</strong></div></header>
                    {!templateVersions.length ? (
                      <p className="occupancy-muted">No published versions yet.</p>
                    ) : (
                      <ul className="occupancy-timeline">
                        {templateVersions.map((version) => (
                          <li key={version.id}>
                            <strong>v{version.version}</strong>
                            <small>
                              {version.publishedAt ? new Date(version.publishedAt).toLocaleString() : "—"}
                              {version.publishedBy ? ` · ${version.publishedBy}` : ""}
                              {version.changeSummary ? ` · ${version.changeSummary}` : ""}
                            </small>
                            <button className="text-button" type="button" onClick={() => handleRestoreVersion(version)} disabled={saving}>
                              Restore as draft
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </div>
    </InspectionPermissionGate>
  );
}
