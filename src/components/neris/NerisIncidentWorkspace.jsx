import { useMemo, useState, useEffect } from "react";
import {
  Sparkles, Wand2, Save, X, CheckCircle2, RefreshCw, PanelRightOpen,
  Flame, MapPin, Clock, Info, Menu, ChevronDown, ExternalLink, Loader2,
} from "lucide-react";
import NerisFieldInput from "./NerisFieldInput.jsx";
import NerisSearchableSelect from "./NerisSearchableSelect.jsx";
import NerisSectionNav from "./NerisSectionNav.jsx";
import NerisIntelligencePanel from "./NerisIntelligencePanel.jsx";
import {
  fieldAllowsOfficerToggle,
  normalizeNerisFieldConfig,
  resolveFieldInputMode,
} from "../../lib/neris/fieldConfig.js";
import {
  getFillableFields,
  humanizeFieldName,
} from "../../lib/nerisSchema.js";
import { resolveApplicableSections, resolveApplicableSidebar } from "../../lib/neris/sections.js";
import { validateNerisReport, computeCompletionPercentage } from "../../lib/neris/validation.js";
import { getOccupancyIncidentHistory, logFieldOverride } from "../../lib/neris/autoPopulation.js";
import {
  ACTIONS_TAKEN,
  EMS_CHIEF_COMPLAINTS,
  EMS_DISPOSITIONS,
  EMS_TREATMENTS,
  INCIDENT_DISCIPLINES,
  NARRATIVE_TEMPLATES,
  WILDLAND_FUEL_TYPES,
} from "../../lib/neris/picklists.js";
import { generateDraftNarrative, bulletsToNarrative } from "../../lib/neris/narrative.js";
import {
  applyReviewAction,
  adminUnlockReport,
  REVIEW_STAGES,
} from "../../lib/neris/workflow.js";
import { uploadFirebaseFile, deleteFirebaseFile } from "../../lib/firebaseClient.js";
import { buildNerisAttachmentPath } from "../../lib/storagePaths.js";
import ObjectLifecycleActions from "../ObjectLifecycleActions.jsx";
import {
  archiveObject,
  isObjectDeleted,
  isObjectVisibleInActiveList,
  isObjectVisibleInArchivedList,
  restoreObject,
  softDeleteObject,
  withActiveLifecycle,
} from "../../lib/objectLifecycle.js";

/**
 * @param {{
 *   report: Record<string, unknown>,
 *   allReports?: Array<Record<string, unknown>>,
 *   canEdit?: boolean,
 *   onUpdate: (patch: Record<string, unknown>) => void,
 *   onUpdateModule: (moduleId: string, fieldName: string, value: unknown) => void,
 *   onAutoPopulate?: () => void,
 *   allReports?: Array<Record<string, unknown>>,
 *   onSelectReport?: (id: string) => void,
 *   onSave?: () => void,
 *   onComplete?: () => void,
 *   onClose?: () => void,
 *   nerisFieldConfig?: Record<string, { inputMode?: string, allowToggle?: boolean }>,
 *   departmentId?: string,
 * }} props
 */
export default function NerisIncidentWorkspace({
  report,
  allReports = [],
  canEdit = false,
  onUpdate,
  onUpdateModule,
  onAutoPopulate,
  onSelectReport,
  onSave,
  onComplete,
  onClose,
  nerisFieldConfig = {},
  departmentId = "",
}) {
  const applicableSections = useMemo(() => resolveApplicableSections(report), [report]);
  const sidebarItems = useMemo(() => resolveApplicableSidebar(report), [report]);
  const [activeSidebarId, setActiveSidebarId] = useState(sidebarItems[0]?.id || "response");
  const [activeSectionId, setActiveSectionId] = useState(
    sidebarItems[0]?.tabs?.[0]?.id || applicableSections[0]?.id || "overview",
  );
  const [intelOpen, setIntelOpen] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [bulletNotes, setBulletNotes] = useState("");
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentView, setAttachmentView] = useState("active");
  const [attachmentBusyId, setAttachmentBusyId] = useState("");

  const activeSidebar = sidebarItems.find((s) => s.id === activeSidebarId) || sidebarItems[0];
  const activeTabs = activeSidebar?.tabs || [];

  useEffect(() => {
    if (!sidebarItems.some((s) => s.id === activeSidebarId)) {
      const first = sidebarItems[0];
      if (first) {
        setActiveSidebarId(first.id);
        setActiveSectionId(first.tabs[0]?.id || "overview");
      }
    }
  }, [sidebarItems, activeSidebarId]);

  function selectSidebar(sidebarId) {
    const item = sidebarItems.find((s) => s.id === sidebarId);
    if (!item) return;
    setActiveSidebarId(sidebarId);
    setActiveSectionId(item.tabs[0]?.id || item.sectionIds[0]);
    setSidebarMobileOpen(false);
  }

  function selectTab(sectionId) {
    setActiveSectionId(sectionId);
    const parent = sidebarItems.find((s) => s.tabs.some((t) => t.id === sectionId));
    if (parent) setActiveSidebarId(parent.id);
  }

  const validationIssues = useMemo(() => validateNerisReport(report), [report]);
  const completionPercentage = useMemo(
    () => report.completionPercentage ?? computeCompletionPercentage(report),
    [report],
  );

  const sectionStatus = useMemo(() => {
    const status = {};
    for (const section of applicableSections) {
      const sectionIssues = validationIssues.filter((i) => i.section === section.id);
      if (!sectionIssues.length) status[section.id] = "complete";
      else if (sectionIssues.some((i) => i.blocking)) status[section.id] = "error";
      else status[section.id] = "warning";
    }
    return status;
  }, [applicableSections, validationIssues]);

  const occupancyHistory = useMemo(
    () => getOccupancyIncidentHistory(report, allReports),
    [report, allReports],
  );

  const workspace = report.workspace || {};
  const modules = report.modules || {};
  const locked = report.locked && !canEdit;
  const resolvedFieldConfig = useMemo(
    () => normalizeNerisFieldConfig(nerisFieldConfig),
    [nerisFieldConfig],
  );
  const fieldInputOverrides = report.fieldInputOverrides || {};

  function updateWorkspace(key, patch) {
    onUpdate({
      workspace: { ...workspace, [key]: { ...(workspace[key] || {}), ...patch } },
      completionPercentage: undefined,
    });
  }

  function updateWorkspaceArray(key, value) {
    onUpdate({ workspace: { ...workspace, [key]: value }, completionPercentage: undefined });
  }

  const activeSection = applicableSections.find((s) => s.id === activeSectionId)
    || { id: activeSectionId, label: activeTabs.find((t) => t.id === activeSectionId)?.label || "Section" };

  function updateFieldInputOverride(fieldKey, mode) {
    onUpdate({
      fieldInputOverrides: {
        ...fieldInputOverrides,
        [fieldKey]: mode,
      },
    });
  }

  function renderModuleSection(moduleId) {
    const fields = getFillableFields(moduleId);
    const grouped = fields.reduce((groups, field) => {
      const key = field.group || "general";
      if (!groups[key]) groups[key] = [];
      groups[key].push(field);
      return groups;
    }, /** @type {Record<string, typeof fields>} */ ({}));

    return (
      <div className="neris-form-sections">
        {Object.entries(grouped).map(([group, groupFields]) => (
          <section key={group} className="neris-form-section">
            <h3>{humanizeFieldName(group)}</h3>
            <div className="neris-form-grid">
              {groupFields.map((field) => {
                const fieldWithModule = { ...field, moduleId };
                const fieldKey = `${moduleId}.${field.name}`;
                const sourceKey = `modules.${fieldKey}`;
                const autoPopulated = Boolean(report.autoPopulateSources?.[sourceKey]);
                const officerOverride = fieldInputOverrides[fieldKey] || null;
                return (
                  <NerisFieldInput
                    key={field.name}
                    field={fieldWithModule}
                    disabled={!canEdit || locked}
                    autoPopulated={autoPopulated}
                    value={modules[moduleId]?.[field.name]}
                    inputMode={resolveFieldInputMode(fieldWithModule, resolvedFieldConfig)}
                    allowToggle={fieldAllowsOfficerToggle(fieldWithModule, resolvedFieldConfig)}
                    fieldConfig={resolvedFieldConfig}
                    officerOverrideMode={officerOverride}
                    onOfficerOverrideChange={(mode) => updateFieldInputOverride(fieldKey, mode)}
                    onChange={(value) => onUpdateModule(moduleId, field.name, value)}
                    onOverride={(reason) => {
                      onUpdate(logFieldOverride(report, sourceKey, modules[moduleId]?.[field.name], reason));
                    }}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  function renderSectionContent() {
    switch (activeSection?.id) {
      case "overview":
        return (
          <div className="neris-overview-cards">
            <article className="neris-card">
              <h3>Incident Summary</h3>
              <dl>
                <dt>Report #</dt><dd>{report.reportNumber}</dd>
                <dt>Date</dt><dd>{report.incidentDate}</dd>
                <dt>Address</dt><dd>{report.incidentAddress || "—"}</dd>
                <dt>Type</dt><dd>{report.incidentTypeSummary || "—"}</dd>
                <dt>Status</dt><dd>{report.status}</dd>
              </dl>
            </article>
            <article className="neris-card">
              <h3>Disciplines</h3>
              <div className="neris-chip-group">
                {(report.disciplines || workspace.disciplines || []).map((d) => (
                  <span key={d} className="neris-chip">{d}</span>
                ))}
                {!((report.disciplines || workspace.disciplines || []).length) ? (
                  <p className="muted">Select disciplines in Incident Information.</p>
                ) : null}
              </div>
            </article>
            {onAutoPopulate && canEdit ? (
              <button type="button" className="secondary-button" onClick={onAutoPopulate}>
                <Sparkles size={14} /> Auto-populate from Forge data
              </button>
            ) : null}
          </div>
        );

      case "cad": {
        const cadFieldBadge = (field) => (
          report.autoPopulateSources?.[`workspace.cad.${field}`] === "cad-import"
            ? <span className="neris-auto-badge">CAD</span>
            : null
        );
        return (
          <div className="neris-form-grid">
            <label className="neris-field"><span>Incident number {cadFieldBadge("incidentNumber")}</span><input disabled={!canEdit || locked} value={workspace.cad?.incidentNumber || ""} onChange={(e) => updateWorkspace("cad", { incidentNumber: e.target.value })} /></label>
            <label className="neris-field"><span>CAD call number {cadFieldBadge("cadCallNumber")}</span><input disabled={!canEdit || locked} value={workspace.cad?.cadCallNumber || ""} onChange={(e) => updateWorkspace("cad", { cadCallNumber: e.target.value })} /></label>
            <label className="neris-field"><span>Dispatch time {cadFieldBadge("dispatchTime")}</span><input type="datetime-local" disabled={!canEdit || locked} value={workspace.cad?.dispatchTime || ""} onChange={(e) => updateWorkspace("cad", { dispatchTime: e.target.value })} /></label>
            <label className="neris-field"><span>Arrival time {cadFieldBadge("arrivalTime")}</span><input type="datetime-local" disabled={!canEdit || locked} value={workspace.cad?.arrivalTime || ""} onChange={(e) => updateWorkspace("cad", { arrivalTime: e.target.value })} /></label>
            <label className="neris-field"><span>Clear time {cadFieldBadge("clearTime")}</span><input type="datetime-local" disabled={!canEdit || locked} value={workspace.cad?.clearTime || ""} onChange={(e) => updateWorkspace("cad", { clearTime: e.target.value })} /></label>
            <label className="neris-field"><span>Priority {cadFieldBadge("priority")}</span><input disabled={!canEdit || locked} value={workspace.cad?.priority || ""} onChange={(e) => updateWorkspace("cad", { priority: e.target.value })} /></label>
            <label className="neris-field"><span>Alarm level {cadFieldBadge("alarmLevel")}</span><input disabled={!canEdit || locked} value={workspace.cad?.alarmLevel || ""} onChange={(e) => updateWorkspace("cad", { alarmLevel: e.target.value })} /></label>
            <label className="neris-field neris-field-wide"><span>Initial dispatch comments {cadFieldBadge("initialComments")}</span><textarea rows={3} disabled={!canEdit || locked} value={workspace.cad?.initialComments || ""} onChange={(e) => updateWorkspace("cad", { initialComments: e.target.value })} /></label>
            {report.cadImportAudit?.importedAt ? (
              <p className="auth-help neris-field-wide">
                Last CAD import: {new Date(report.cadImportAudit.importedAt).toLocaleString()}
                {report.cadImportAudit.filename ? ` from ${report.cadImportAudit.filename}` : " (pasted payload)"}
              </p>
            ) : null}
          </div>
        );
      }

      case "incident":
        return (
          <>
            <label className="neris-field neris-field-wide">
              <span>Disciplines</span>
              <div className="neris-multiselect-chips">
                {INCIDENT_DISCIPLINES.map((d) => {
                  const selected = (report.disciplines || workspace.disciplines || []).includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      className={selected ? "neris-chip active" : "neris-chip"}
                      disabled={!canEdit || locked}
                      onClick={() => {
                        const current = new Set(report.disciplines || workspace.disciplines || []);
                        if (current.has(d.value)) current.delete(d.value);
                        else current.add(d.value);
                        onUpdate({ disciplines: [...current], workspace: { ...workspace, disciplines: [...current] } });
                      }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </label>
            {renderModuleSection("core_mod_incident")}
          </>
        );

      case "location":
        return (
          <div className="neris-form-grid">
            <label className="neris-field neris-field-wide"><span>Incident address</span><input disabled={!canEdit || locked} value={report.incidentAddress || ""} onChange={(e) => onUpdate({ incidentAddress: e.target.value })} /></label>
            <label className="neris-field"><span>Occupancy name {report.autoPopulateSources?.["workspace.location"] ? <span className="neris-auto-badge">Auto</span> : null}</span><input disabled={!canEdit || locked} value={workspace.location?.occupancyName || ""} onChange={(e) => updateWorkspace("location", { occupancyName: e.target.value })} /></label>
            <label className="neris-field"><span>Property use</span><input disabled={!canEdit || locked} value={workspace.location?.propertyUse || ""} onChange={(e) => updateWorkspace("location", { propertyUse: e.target.value })} /></label>
            <label className="neris-field"><span>Construction type</span><input disabled={!canEdit || locked} value={workspace.location?.constructionType || ""} onChange={(e) => updateWorkspace("location", { constructionType: e.target.value })} /></label>
            <label className="neris-field"><span>Sprinkler status</span><input disabled={!canEdit || locked} value={workspace.location?.sprinklerStatus || ""} onChange={(e) => updateWorkspace("location", { sprinklerStatus: e.target.value })} /></label>
            <label className="neris-field"><span>Alarm system</span><input disabled={!canEdit || locked} value={workspace.location?.alarmStatus || ""} onChange={(e) => updateWorkspace("location", { alarmStatus: e.target.value })} /></label>
            <label className="neris-field"><span>Knox Box</span><input disabled={!canEdit || locked} value={workspace.location?.knoxBox || ""} onChange={(e) => updateWorkspace("location", { knoxBox: e.target.value })} /></label>
            <label className="neris-field neris-field-wide"><span>Known hazards</span><textarea rows={2} disabled={!canEdit || locked} value={workspace.location?.hazards || ""} onChange={(e) => updateWorkspace("location", { hazards: e.target.value })} /></label>
          </div>
        );

      case "units":
        return (
          <div className="neris-units-list">
            {(workspace.units || []).map((unit, idx) => (
              <article key={unit.unitId || idx} className="neris-card">
                <h4>{unit.unitId} {unit.source === "cad-import" ? <span className="neris-auto-badge">CAD</span> : unit.source ? <span className="neris-auto-badge">Auto</span> : null}</h4>
                <div className="neris-form-grid">
                  <label className="neris-field"><span>Type</span><input disabled={!canEdit || locked} value={unit.apparatusType || ""} onChange={(e) => {
                    const units = [...(workspace.units || [])];
                    units[idx] = { ...unit, apparatusType: e.target.value };
                    updateWorkspaceArray("units", units);
                  }} /></label>
                  <label className="neris-field"><span>Dispatch</span><input type="datetime-local" disabled={!canEdit || locked} value={unit.dispatchTime || ""} onChange={(e) => {
                    const units = [...(workspace.units || [])];
                    units[idx] = { ...unit, dispatchTime: e.target.value };
                    updateWorkspaceArray("units", units);
                  }} /></label>
                  <label className="neris-field"><span>Arrival</span><input type="datetime-local" disabled={!canEdit || locked} value={unit.arrivalTime || ""} onChange={(e) => {
                    const units = [...(workspace.units || [])];
                    units[idx] = { ...unit, arrivalTime: e.target.value };
                    updateWorkspaceArray("units", units);
                  }} /></label>
                  <label className="neris-field"><span>Clear</span><input type="datetime-local" disabled={!canEdit || locked} value={unit.clearTime || ""} onChange={(e) => {
                    const units = [...(workspace.units || [])];
                    units[idx] = { ...unit, clearTime: e.target.value };
                    updateWorkspaceArray("units", units);
                  }} /></label>
                </div>
              </article>
            ))}
            {!workspace.units?.length ? <p className="muted">No units assigned. Use auto-populate or add from apparatus.</p> : null}
          </div>
        );

      case "personnel":
        return (
          <div className="neris-personnel-list">
            <table className="neris-table">
              <thead><tr><th>Name</th><th>Rank</th><th>Cert</th><th>Unit</th><th>Role</th></tr></thead>
              <tbody>
                {(workspace.personnel || []).map((p, i) => (
                  <tr key={p.personnelId || i}>
                    <td>{p.name} {p.source ? <span className="neris-auto-badge">Auto</span> : null}</td>
                    <td>{p.rank}</td>
                    <td>{p.certification}</td>
                    <td>{p.unitId}</td>
                    <td>{p.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!workspace.personnel?.length ? <p className="muted">No personnel attached. Auto-populate from scheduling.</p> : null}
          </div>
        );

      case "fire":
        return renderModuleSection("mod_fire");

      case "hazmat":
        return renderModuleSection("mod_hazard");

      case "ems":
        return (
          <div className="neris-form-grid">
            <label className="neris-field"><span>Number of patients</span><input type="number" min="0" disabled={!canEdit || locked} value={workspace.ems?.patientCount || ""} onChange={(e) => updateWorkspace("ems", { patientCount: e.target.value })} /></label>
            <label className="neris-field"><span>Chief complaint <span className="neris-required">*</span></span><NerisSearchableSelect picklistId="ems_complaint" value={workspace.ems?.chiefComplaint || ""} options={EMS_CHIEF_COMPLAINTS} disabled={!canEdit || locked} onChange={(v) => updateWorkspace("ems", { chiefComplaint: v })} /></label>
            <label className="neris-field"><span>Provider impression</span><input disabled={!canEdit || locked} value={workspace.ems?.impression || ""} onChange={(e) => updateWorkspace("ems", { impression: e.target.value })} /></label>
            <label className="neris-field"><span>ALS/BLS response</span><NerisSearchableSelect picklistId="ems_level" value={workspace.ems?.responseLevel || ""} options={[{ value: "ALS", label: "ALS" }, { value: "BLS", label: "BLS" }]} disabled={!canEdit || locked} onChange={(v) => updateWorkspace("ems", { responseLevel: v })} /></label>
            <label className="neris-field"><span>Treatment</span><NerisSearchableSelect picklistId="ems_treatment" value={workspace.ems?.treatment || ""} options={EMS_TREATMENTS} disabled={!canEdit || locked} onChange={(v) => updateWorkspace("ems", { treatment: v })} /></label>
            <label className="neris-field"><span>Disposition</span><NerisSearchableSelect picklistId="ems_disposition" value={workspace.ems?.disposition || ""} options={EMS_DISPOSITIONS} disabled={!canEdit || locked} onChange={(v) => updateWorkspace("ems", { disposition: v })} /></label>
            <label className="neris-field"><span>Transport agency</span><input disabled={!canEdit || locked} value={workspace.ems?.transportAgency || ""} onChange={(e) => updateWorkspace("ems", { transportAgency: e.target.value })} /></label>
            <label className="neris-field"><span>EMS assist type</span><input disabled={!canEdit || locked} value={workspace.ems?.assistType || ""} onChange={(e) => updateWorkspace("ems", { assistType: e.target.value })} /></label>
          </div>
        );

      case "rescue":
        return (
          <div className="neris-form-grid">
            <label className="neris-field"><span>Rescue type</span><input disabled={!canEdit || locked} value={workspace.rescue?.type || ""} onChange={(e) => updateWorkspace("rescue", { type: e.target.value })} /></label>
            <label className="neris-field"><span>Patients extricated</span><input type="number" min="0" disabled={!canEdit || locked} value={workspace.rescue?.extricated || ""} onChange={(e) => updateWorkspace("rescue", { extricated: e.target.value })} /></label>
            <label className="neris-field neris-field-wide"><span>Rescue narrative</span><textarea rows={3} disabled={!canEdit || locked} value={workspace.rescue?.notes || ""} onChange={(e) => updateWorkspace("rescue", { notes: e.target.value })} /></label>
          </div>
        );

      case "wildland":
        return (
          <div className="neris-form-grid">
            <label className="neris-field"><span>Fire name</span><input disabled={!canEdit || locked} value={workspace.wildland?.fireName || ""} onChange={(e) => updateWorkspace("wildland", { fireName: e.target.value })} /></label>
            <label className="neris-field"><span>Acres burned</span><input type="number" step="0.01" disabled={!canEdit || locked} value={workspace.wildland?.acresBurned || ""} onChange={(e) => updateWorkspace("wildland", { acresBurned: e.target.value })} /></label>
            <label className="neris-field"><span>Percent contained</span><input type="number" min="0" max="100" disabled={!canEdit || locked} value={workspace.wildland?.percentContained || ""} onChange={(e) => updateWorkspace("wildland", { percentContained: e.target.value })} /></label>
            <label className="neris-field"><span>Fuel type</span><NerisSearchableSelect picklistId="wildland_fuel" value={workspace.wildland?.fuelType || ""} options={WILDLAND_FUEL_TYPES} disabled={!canEdit || locked} onChange={(v) => updateWorkspace("wildland", { fuelType: v })} /></label>
            <label className="neris-field"><span>IRWIN ID</span><input disabled={!canEdit || locked} value={workspace.wildland?.irwinId || ""} onChange={(e) => updateWorkspace("wildland", { irwinId: e.target.value })} /></label>
            <label className="neris-field"><span>Structures threatened</span><input type="number" min="0" disabled={!canEdit || locked} value={workspace.wildland?.structuresThreatened || ""} onChange={(e) => updateWorkspace("wildland", { structuresThreatened: e.target.value })} /></label>
          </div>
        );

      case "casualties":
        return (
          <div className="neris-form-grid">
            <label className="neris-field"><span>Civilian injuries</span><input type="number" min="0" disabled={!canEdit || locked} value={workspace.casualties?.injuries || ""} onChange={(e) => updateWorkspace("casualties", { injuries: e.target.value })} /></label>
            <label className="neris-field"><span>Civilian fatalities</span><input type="number" min="0" disabled={!canEdit || locked} value={workspace.casualties?.fatalities || ""} onChange={(e) => updateWorkspace("casualties", { fatalities: e.target.value })} /></label>
            <label className="neris-field"><span>Firefighter injuries</span><input type="number" min="0" disabled={!canEdit || locked} value={workspace.casualties?.ffInjuries || ""} onChange={(e) => updateWorkspace("casualties", { ffInjuries: e.target.value })} /></label>
            <label className="neris-field neris-field-wide"><span>Casualty notes</span><textarea rows={3} disabled={!canEdit || locked} value={workspace.casualties?.notes || ""} onChange={(e) => updateWorkspace("casualties", { notes: e.target.value })} /></label>
          </div>
        );

      case "property_loss":
        return (
          <div className="neris-form-grid">
            <label className="neris-field"><span>Property loss ($)</span><input type="number" min="0" disabled={!canEdit || locked} value={workspace.propertyLoss?.property || ""} onChange={(e) => updateWorkspace("propertyLoss", { property: e.target.value })} /></label>
            <label className="neris-field"><span>Contents loss ($)</span><input type="number" min="0" disabled={!canEdit || locked} value={workspace.propertyLoss?.contents || ""} onChange={(e) => updateWorkspace("propertyLoss", { contents: e.target.value })} /></label>
          </div>
        );

      case "actions":
        return (
          <div className="neris-multiselect-chips">
            {ACTIONS_TAKEN.map((action) => {
              const selected = (workspace.actions || []).includes(action.value);
              return (
                <button
                  key={action.value}
                  type="button"
                  className={selected ? "neris-chip active" : "neris-chip"}
                  disabled={!canEdit || locked}
                  onClick={() => {
                    const current = new Set(workspace.actions || []);
                    if (current.has(action.value)) current.delete(action.value);
                    else current.add(action.value);
                    updateWorkspaceArray("actions", [...current]);
                  }}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        );

      case "narrative":
        return (
          <div className="neris-narrative-builder">
            <div className="neris-narrative-tools">
              {canEdit && !locked ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => {
                    const draft = generateDraftNarrative(report);
                    updateWorkspace("narrative", draft);
                    onUpdateModule("core_mod_incident", "incident_narrative_outcome", draft.body);
                  }}>
                    <Wand2 size={14} /> Generate draft narrative
                  </button>
                  <select
                    className="managed-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const tpl = NARRATIVE_TEMPLATES.find((t) => t.id === e.target.value);
                      if (tpl) updateWorkspace("narrative", { templateId: tpl.id, body: `Template: ${tpl.label}. ` });
                    }}
                  >
                    <option value="">Insert template…</option>
                    {NARRATIVE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </>
              ) : null}
            </div>
            <label className="neris-field neris-field-wide">
              <span>Narrative {workspace.narrative?.aiGenerated ? <span className="neris-ai-badge">AI draft — review required</span> : null}</span>
              <textarea
                rows={8}
                disabled={!canEdit || locked}
                value={workspace.narrative?.body || modules.core_mod_incident?.incident_narrative_outcome || ""}
                onChange={(e) => {
                  updateWorkspace("narrative", { body: e.target.value, aiGenerated: false });
                  onUpdateModule("core_mod_incident", "incident_narrative_outcome", e.target.value);
                }}
              />
            </label>
            {canEdit && !locked ? (
              <label className="neris-field neris-field-wide">
                <span>Bullet notes → narrative</span>
                <textarea rows={3} value={bulletNotes} onChange={(e) => setBulletNotes(e.target.value)} placeholder="- Arrived on scene&#10;- Confirmed fire out" />
                <button type="button" className="secondary-button" onClick={() => {
                  const prose = bulletsToNarrative(bulletNotes);
                  updateWorkspace("narrative", { body: prose });
                  onUpdateModule("core_mod_incident", "incident_narrative_outcome", prose);
                }}>Convert bullets to narrative</button>
              </label>
            ) : null}
          </div>
        );

      case "attachments": {
        const attachments = workspace.attachments || [];
        const visibleAttachments = attachments
          .filter((att) => !isObjectDeleted(att))
          .filter((att) => (
            attachmentView === "archived"
              ? isObjectVisibleInArchivedList(att)
              : isObjectVisibleInActiveList(att)
          ));
        const archivedCount = attachments.filter((att) => isObjectVisibleInArchivedList(att)).length;

        async function runAttachmentLifecycle(att, action) {
          if (!canEdit || locked || !att) return;
          setAttachmentBusyId(att.id);
          try {
            let nextAtt;
            if (action === "archive") nextAtt = archiveObject(att);
            else if (action === "restore") {
              nextAtt = restoreObject(att);
              setAttachmentView("active");
            } else {
              if (att.storagePath) await deleteFirebaseFile(att.storagePath);
              nextAtt = softDeleteObject(att);
            }
            updateWorkspaceArray(
              "attachments",
              attachments.map((item) => (item.id === att.id ? nextAtt : item))
            );
          } finally {
            setAttachmentBusyId("");
          }
        }

        return (
          <div className="neris-attachments">
            <p className="muted">Attach photos, signatures, and supplemental files. Files sync when online.</p>
            <div className="segmented-control" style={{ marginBottom: 12 }}>
              <button type="button" className={attachmentView === "active" ? "active" : ""} onClick={() => setAttachmentView("active")}>Active</button>
              <button type="button" className={attachmentView === "archived" ? "active" : ""} onClick={() => setAttachmentView("archived")}>
                Archived{archivedCount ? ` (${archivedCount})` : ""}
              </button>
            </div>
            {visibleAttachments.map((att, i) => (
              <div key={att.id || i} className="neris-attachment-row" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {att.downloadUrl || att.url ? (
                  <a href={att.downloadUrl || att.url} target="_blank" rel="noreferrer">
                    {att.name || att.filename}
                    <ExternalLink size={12} style={{ marginLeft: 6 }} />
                  </a>
                ) : (
                  <span>{att.name || att.filename}</span>
                )}
                {canEdit && !locked ? (
                  <ObjectLifecycleActions
                    record={att}
                    canEdit={canEdit && !locked}
                    busy={attachmentBusyId === att.id}
                    compact
                    onArchive={() => runAttachmentLifecycle(att, "archive")}
                    onRestore={() => runAttachmentLifecycle(att, "restore")}
                    onDelete={() => runAttachmentLifecycle(att, "delete")}
                  />
                ) : null}
              </div>
            ))}
            {!visibleAttachments.length ? <p className="muted">No attachments in this view.</p> : null}
            {attachmentError ? <p className="object-upload-error hint-text">{attachmentError}</p> : null}
            {canEdit && !locked && attachmentView === "active" ? (
              <label className={`secondary-button neris-upload-btn ${attachmentUploading ? "is-disabled" : ""}`}>
                {attachmentUploading ? <><Loader2 size={14} className="spin" /> Uploading…</> : "Add attachment"}
                <input
                  type="file"
                  hidden
                  disabled={attachmentUploading || !departmentId}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !departmentId || !report?.id) return;
                    setAttachmentUploading(true);
                    setAttachmentError("");
                    try {
                      const storagePath = buildNerisAttachmentPath(departmentId, report.id, file.name);
                      const uploaded = await uploadFirebaseFile(storagePath, file);
                      if (!uploaded?.downloadUrl) throw new Error("Upload failed");
                      const next = [
                        ...attachments,
                        withActiveLifecycle({
                          id: `ATT-${Date.now()}`,
                          name: file.name,
                          downloadUrl: uploaded.downloadUrl,
                          storagePath: uploaded.storagePath,
                          contentType: uploaded.contentType,
                          addedAt: new Date().toISOString(),
                        }),
                      ];
                      updateWorkspaceArray("attachments", next);
                    } catch (error) {
                      console.error("NERIS attachment upload failed", error);
                      setAttachmentError("Attachment upload failed — try again.");
                    } finally {
                      setAttachmentUploading(false);
                    }
                  }}
                />
              </label>
            ) : null}
          </div>
        );
      }

      case "review":
        return (
          <div className="neris-review-panel">
            <ol className="neris-review-stages">
              {REVIEW_STAGES.map((stage) => (
                <li key={stage.id} className={report.reviewStage === stage.id ? "current" : ""}>{stage.label}</li>
              ))}
            </ol>
            <ul className="neris-approval-history">
              {(workspace.approvals || []).map((a) => (
                <li key={a.id}>
                  <strong>{a.action}</strong> by {a.reviewerName} — {new Date(a.timestamp).toLocaleString()}
                  {a.comments ? <p>{a.comments}</p> : null}
                </li>
              ))}
            </ul>
            {canEdit ? (
              <>
                <label className="neris-field neris-field-wide"><span>Review comments</span><textarea rows={2} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} /></label>
                <div className="heading-actions">
                  <button type="button" className="secondary-button" onClick={() => onUpdate(applyReviewAction(report, { action: "submit", comments: reviewComment }))}>Submit for review</button>
                  <button type="button" className="primary-button" onClick={() => onUpdate(applyReviewAction(report, { action: "approve", comments: reviewComment, reviewerName: "Company Officer" }))}>Approve</button>
                  <button type="button" className="danger-button" onClick={() => onUpdate(applyReviewAction(report, { action: "return", comments: reviewComment, reviewerName: "Company Officer" }))}>Return for correction</button>
                </div>
              </>
            ) : null}
            {report.locked && canEdit ? (
              <button type="button" className="secondary-button" onClick={() => onUpdate(adminUnlockReport(report, "Admin unlock for corrections"))}>Admin unlock</button>
            ) : null}
          </div>
        );

      case "submission":
        return (
          <div className="neris-submission-panel">
            <p>Completion: <strong>{completionPercentage}%</strong></p>
            <p>Blocking errors: <strong>{validationIssues.filter((i) => i.blocking).length}</strong></p>
            <p className="muted">FORGE doesn't send reports to NERIS automatically yet. Submit the report in the NERIS portal, then record the submission here.</p>
            {canEdit && !locked ? (
              <button
                type="button"
                className="primary-button"
                disabled={validationIssues.some((i) => i.blocking)}
                onClick={() => {
                  if (!window.confirm("FORGE doesn't send reports to NERIS yet. Have you submitted this report in the NERIS portal? OK records it as submitted.")) return;
                  onUpdate({ status: "Submitted", submittedAt: new Date().toISOString(), submissionMethod: "manual-neris-portal" });
                }}
              >
                Record NERIS Submission
              </button>
            ) : null}
            {validationIssues.some((i) => i.blocking) ? (
              <p className="neris-intel-error">Resolve blocking validation errors before submission.</p>
            ) : null}
          </div>
        );

      case "investigations":
        return (
          <div className="neris-form-grid">
            <p className="neris-field-wide muted">
              Investigation notes and cause determination. Link investigation findings to the incident narrative and wrap-up review.
            </p>
            <label className="neris-field neris-field-wide">
              <span>Investigation status</span>
              <select
                disabled={!canEdit || locked}
                value={workspace.investigations?.status || ""}
                onChange={(e) => updateWorkspace("investigations", { status: e.target.value })}
              >
                <option value="">Select status…</option>
                <option value="not_required">Not required</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="complete">Complete</option>
              </select>
            </label>
            <label className="neris-field">
              <span>Cause determination</span>
              <input
                disabled={!canEdit || locked}
                value={workspace.investigations?.cause || ""}
                onChange={(e) => updateWorkspace("investigations", { cause: e.target.value })}
              />
            </label>
            <label className="neris-field">
              <span>Investigator</span>
              <input
                disabled={!canEdit || locked}
                value={workspace.investigations?.investigator || ""}
                onChange={(e) => updateWorkspace("investigations", { investigator: e.target.value })}
              />
            </label>
            <label className="neris-field neris-field-wide">
              <span>Investigation notes</span>
              <textarea
                rows={5}
                disabled={!canEdit || locked}
                value={workspace.investigations?.notes || ""}
                onChange={(e) => updateWorkspace("investigations", { notes: e.target.value })}
              />
            </label>
          </div>
        );

      case "associated":
        return (
          <div>
            <p className="muted" style={{ marginBottom: 12 }}>
              Prior incidents at this occupancy and related Forge records.
            </p>
            {occupancyHistory.length ? (
              <ul className="neris-associated-list">
                {occupancyHistory.map((h) => (
                  <li key={h.id}>
                    <span>
                      <strong>{h.reportNumber}</strong>
                      <br />
                      <small>{h.incidentDate} · {h.type}</small>
                    </span>
                    {onSelectReport && h.id !== report.id ? (
                      <button type="button" className="secondary-button" onClick={() => onSelectReport(h.id)}>
                        Open
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No associated records found for this location.</p>
            )}
          </div>
        );

      default:
        if (activeSection?.moduleId) return renderModuleSection(activeSection.moduleId);
        return <p className="muted">Select a section from the navigation.</p>;
    }
  }

  const incidentType = report.incidentTypeSummary || "Fire Incident";
  const dispatchTime = workspace.cad?.dispatchTime || report.incidentDate || "";
  const formattedDateTime = dispatchTime
    ? new Date(dispatchTime).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" })
    : report.incidentDate || "—";

  const completeLabel = report.status === "Draft" || report.status === "In Progress"
    ? "Complete"
    : report.status === "Needs Review" ? "Submit" : "Complete";

  return (
    <div className="neris-workspace">
      <header className="neris-ws-header">
        <button type="button" className="neris-ws-btn neris-ws-btn-icon neris-ws-btn-ghost" onClick={() => setSidebarMobileOpen((v) => !v)} aria-label="Menu">
          <Menu size={18} />
        </button>
        <div className="neris-ws-header-brand">
          <Flame size={20} />
          <h1>{incidentType}</h1>
        </div>
        <div className="neris-ws-incident-select">
          <select
            value={report.id}
            onChange={(e) => onSelectReport?.(e.target.value)}
            aria-label="Select incident report"
          >
            {allReports.map((r) => (
              <option key={r.id} value={r.id}>{r.reportNumber}</option>
            ))}
          </select>
          <ChevronDown size={14} style={{ marginLeft: -20, pointerEvents: "none", opacity: 0.6 }} />
        </div>
        <div className="neris-ws-header-meta">
          <span className="neris-ws-address">
            <MapPin size={13} />
            {report.incidentAddress || "No address"}
          </span>
          <span>
            <Clock size={13} />
            {formattedDateTime}
            <Info size={12} style={{ opacity: 0.6 }} />
          </span>
        </div>
        <div className="neris-ws-header-actions">
          {canEdit && onSave ? (
            <button type="button" className="neris-ws-btn neris-ws-btn-ghost" onClick={onSave}>
              <Save size={15} />
              <span className="btn-label">Save</span>
            </button>
          ) : null}
          {canEdit && onComplete ? (
            <button type="button" className="neris-ws-btn neris-ws-btn-success" onClick={onComplete}>
              <CheckCircle2 size={15} />
              <span className="btn-label">{completeLabel}</span>
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className="neris-ws-btn neris-ws-btn-ghost neris-ws-btn-icon" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="neris-ws-body">
        <NerisSectionNav
          sidebarItems={sidebarItems}
          activeSidebarId={activeSidebarId}
          onSelect={selectSidebar}
          sectionStatus={sectionStatus}
          mobileOpen={sidebarMobileOpen}
          onToggleMobile={() => setSidebarMobileOpen((v) => !v)}
        />

        <div className="neris-ws-main">
          <div className="neris-ws-toolbar">
            {onAutoPopulate && canEdit ? (
              <button type="button" className="neris-ws-toolbar-btn" onClick={onAutoPopulate}>
                <RefreshCw size={14} />
                <span>Refresh CAD Info</span>
              </button>
            ) : null}
            <div className="neris-ws-toolbar-spacer" />
            <button type="button" className="neris-ws-toolbar-intel-btn" onClick={() => setIntelOpen(true)}>
              <PanelRightOpen size={14} />
              Intelligence ({completionPercentage}%)
            </button>
          </div>

          {activeTabs.length > 1 ? (
            <div className="neris-ws-tabs" role="tablist">
              {activeTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={activeSectionId === tab.id ? "active" : ""}
                  onClick={() => selectTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="neris-ws-canvas">
            <h2 className="neris-ws-section-title">
              {activeTabs.find((t) => t.id === activeSectionId)?.label || activeSection?.label}
            </h2>
            {renderSectionContent()}
          </div>
        </div>
      </div>

      <div
        className={`neris-ws-intel-backdrop${intelOpen ? " open" : ""}`}
        onClick={() => setIntelOpen(false)}
        role="presentation"
      />
      <div className={`neris-ws-intel-drawer${intelOpen ? " open" : ""}`}>
        <NerisIntelligencePanel
          report={{ ...report, completionPercentage }}
          completionPercentage={completionPercentage}
          validationIssues={validationIssues}
          onToggleCollapse={() => setIntelOpen(false)}
          occupancyHistory={occupancyHistory}
        />
      </div>
    </div>
  );
}
