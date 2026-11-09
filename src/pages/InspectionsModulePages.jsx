import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Play, Save, UploadCloud, RotateCcw, Archive, ShieldCheck, FileText, Flame, DollarSign } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout from "../components/inspections/InspectionsModuleLayout.jsx";
import ChecklistFieldInput from "../components/inspections/ChecklistFieldInput.jsx";
import { findMissingRequiredFields, formatMissingFieldsMessage } from "../lib/inspections/checklistFields.js";
import { describeNumberingFormat } from "../lib/inspections/inspectionNumbering.js";
import {
  clearPendingCodeCitation,
  formatCitationLabel,
  readPendingCodeCitation,
} from "../lib/codeLibrary/pendingCitation.js";
import ViolationsPage from "./ViolationsPage.jsx";
import InspectionNoticesPage from "./InspectionNoticesPage.jsx";
import {
  approveInspection,
  archiveInspection,
  buildInspectionDashboardMetrics,
  canApproveInspections,
  canCreatePreplans,
  canEditInspectionEnforcement,
  canEditInspectionFees,
  canEditInspectionNotices,
  canEditInspectionsModule,
  canViewFireProtectionSystems,
  canViewInspectionDashboard,
  canViewInspectionsModule,
  completeInspection,
  createInspection,
  createViolation,
  createOrUpdatePreplanFromInspection,
  ensureInspectionConfigSeeded,
  ensureOccupancyRecords,
  formatCurrency,
  generateNoticeFromInspection,
  getInspectionRecord,
  getInspectionResultOptions,
  getPreventionKpiCards,
  listInspectionRecords,
  listInspectionTypes,
  loadInspectionSettings,
  loadPreventionCommandBoard,
  reopenInspection,
  saveInspectionDraftWithOffline,
  scheduleReinspection,
  startInspection,
} from "../lib/inspections/index.js";
import { friendlyError } from "../lib/friendlyError.js";
import { labelFromKey } from "../lib/labelFromKey.js";

// Stored lowercase ("normal"); shown capitalized.
function formatPriority(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}

function formatDue(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  // Due dates are days: show the time only when one was actually set.
  const midnight = date.getHours() === 0 && date.getMinutes() === 0;
  return midnight
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CreateInspectionModal({
  open,
  onClose,
  onCreated,
  occupancies,
  types,
  saving,
  defaultAssigneeId,
  defaultAssigneeName,
}) {
  const [occupancyId, setOccupancyId] = useState(occupancies[0]?.id || "");
  const [inspectionTypeId, setInspectionTypeId] = useState(types[0]?.id || "");
  const [scheduledStart, setScheduledStart] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignToMe, setAssignToMe] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setOccupancyId(occupancies[0]?.id || "");
    setInspectionTypeId(types[0]?.id || "");
    setScheduledStart("");
    setPriority("normal");
    setAssignToMe(true);
    setNotes("");
  }, [open, occupancies, types]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="workflow-modal inspection-create-modal">
        <header>
          <strong>Create inspection</strong>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="modal-content occupancy-form-grid">
          <Field label="Occupancy">
            <select value={occupancyId} onChange={(e) => setOccupancyId(e.target.value)}>
              <option value="">Select occupancy</option>
              {occupancies.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Inspection type">
            <select value={inspectionTypeId} onChange={(e) => setInspectionTypeId(e.target.value)}>
              <option value="">Select type</option>
              {types.filter((row) => row.lifecycleStatus !== "archived").map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Scheduled start">
            <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} />
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {["low", "normal", "high", "urgent"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <label className="occupancy-primary-toggle">
            <input type="checkbox" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} />
            Assign to me
          </label>
          <Field label="Internal notes">
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="primary-button"
            type="button"
            disabled={saving || !occupancyId || !inspectionTypeId}
            onClick={() => onCreated({
              occupancyId,
              inspectionTypeId,
              scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : "",
              priority,
              assignedInspectorIds: assignToMe && defaultAssigneeId ? [defaultAssigneeId] : [],
              assignedInspectorNames: assignToMe && defaultAssigneeName ? [defaultAssigneeName] : [],
              internalNotes: notes,
            })}
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </section>
    </div>
  );
}

function InspectionWorkspace({
  record,
  canEdit,
  canApprove,
  canCreatePreplan = false,
  canGenerateNotice = false,
  canScheduleReinspection = false,
  canViewFps = false,
  canEditFees = false,
  saving,
  onClose,
  onStart,
  onSaveDraft,
  onComplete,
  onApprove,
  onReopen,
  onArchive,
  onCreateOrUpdatePreplan,
  onGenerateNotice,
  onScheduleReinspection,
  onOpenFireProtectionSystems,
  onAddFee,
  onViolationChanged,
  departmentId,
  actor,
}) {
  const [answers, setAnswers] = useState(record?.answers || {});
  const [summary, setSummary] = useState(record?.summary || "");
  const [internalNotes, setInternalNotes] = useState(record?.internalNotes || "");
  const [result, setResult] = useState(record?.result || "");
  const [reinspectionRequired, setReinspectionRequired] = useState(Boolean(record?.reinspectionRequired));
  const [nextReinspectionAt, setNextReinspectionAt] = useState(record?.nextReinspectionAt || "");
  const [requireApproval, setRequireApproval] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  const [completeError, setCompleteError] = useState("");
  const [pendingCitation, setPendingCitation] = useState(() => readPendingCodeCitation());
  const [citationBusy, setCitationBusy] = useState(false);
  const [citationMessage, setCitationMessage] = useState("");
  const [violationsVersion, setViolationsVersion] = useState(0);

  // Reset local edits only when a different inspection is opened. Refreshes of the same
  // record (a violation added, a photo uploaded) must not wipe unsaved answers.
  useEffect(() => {
    setAnswers(record?.answers || {});
    setSummary(record?.summary || "");
    setInternalNotes(record?.internalNotes || "");
    setResult(record?.result || "");
    setReinspectionRequired(Boolean(record?.reinspectionRequired));
    setNextReinspectionAt(record?.nextReinspectionAt || "");
    setMissingFields([]);
    setCompleteError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const sections = Array.isArray(record?.templateSnapshot?.sections)
    ? record.templateSnapshot.sections
    : [];
  const locked = Boolean(record?.lockedAt) || record?.status === "archived";
  const editable = canEdit && !locked;
  const missingKeys = new Set(missingFields.map((item) => item.key));

  function setAnswer(key, value) {
    setAnswers((current) => ({ ...current, [key]: value }));
    if (missingKeys.has(key)) {
      setMissingFields((current) => current.filter((item) => item.key !== key));
    }
  }

  function focusField(key) {
    const target = typeof document !== "undefined"
      ? document.querySelector(`[data-checklist-key="${CSS.escape(key)}"]`)
      : null;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.querySelector("input, select, textarea, button")?.focus?.({ preventScroll: true });
  }

  function handleCompleteClick() {
    const missing = findMissingRequiredFields(record?.templateSnapshot, answers);
    setMissingFields(missing);
    if (missing.length) {
      setCompleteError(formatMissingFieldsMessage(missing));
      focusField(missing[0].key);
      return;
    }
    if (!result) {
      setCompleteError("Choose a result before completing the inspection.");
      return;
    }
    setCompleteError("");
    onComplete({ ...draftPayload, requireApproval });
  }

  function dismissPendingCitation() {
    clearPendingCodeCitation();
    setPendingCitation(null);
    setCitationMessage("");
  }

  async function issueViolationFromCitation() {
    if (!pendingCitation || !departmentId) return;
    setCitationBusy(true);
    setCitationMessage("");
    try {
      await createViolation(departmentId, {
        inspectionId: record.id,
        name: formatCitationLabel(pendingCitation),
        codeCitation: pendingCitation.sectionNumber,
        description: pendingCitation.citedText.slice(0, 1500) || pendingCitation.sectionTitle,
        severity: "moderate",
        publicationId: pendingCitation.publicationId,
        sectionNumber: pendingCitation.sectionNumber,
        sectionTitle: pendingCitation.sectionTitle,
        citedText: pendingCitation.citedText,
        codeNodeId: pendingCitation.codeNodeId,
        citedAt: pendingCitation.citedAt || undefined,
      }, actor);
      clearPendingCodeCitation();
      setPendingCitation(null);
      setViolationsVersion((value) => value + 1);
      setCitationMessage(`Violation issued citing ${pendingCitation.sectionNumber}.`);
      onViolationChanged?.();
    } catch (citeError) {
      setCitationMessage(`Couldn't issue the violation. ${friendlyError(citeError, "Please try again.")}`);
    } finally {
      setCitationBusy(false);
    }
  }

  const draftPayload = {
    answers,
    summary,
    internalNotes,
    result,
    reinspectionRequired,
    nextReinspectionAt,
  };

  return (
    <section className="panel inspection-workspace-panel">
      <header>
        <div>
          <strong>{record.inspectionNumber}</strong>
          <small className="occupancy-muted">
            {" "}{record.occupancyName} · {record.address || "No address"}
          </small>
        </div>
        <div className="occupancy-detail-actions">
          <InspectionStatusBadge status={record.status} />
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
      </header>
      <div className="panel-body config-studio-body">
        <div className="occupancy-form-grid">
          <div><span className="occupancy-muted">Type</span><strong>{record.inspectionTypeSnapshot?.label || record.inspectionTypeId || "—"}</strong></div>
          <div><span className="occupancy-muted">Priority</span><strong>{formatPriority(record.priority)}</strong></div>
          <div><span className="occupancy-muted">Scheduled</span><strong>{formatDue(record.scheduledStart)}</strong></div>
          <div><span className="occupancy-muted">Due</span><strong>{formatDue(record.dueAt)}</strong></div>
        </div>

        <div className="occupancy-detail-actions">
          {editable && ["draft", "scheduled"].includes(record.status) ? (
            <button className="primary-button" type="button" disabled={saving} onClick={onStart}>
              <Play size={14} /> Start
            </button>
          ) : null}
          {editable && ["draft", "scheduled", "in_progress", "awaiting_approval"].includes(record.status) ? (
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={() => onSaveDraft(draftPayload)}
            >
              <Save size={14} /> Save draft
            </button>
          ) : null}
          {editable && ["draft", "scheduled", "in_progress"].includes(record.status) ? (
            <button
              className="primary-button"
              type="button"
              disabled={saving}
              onClick={handleCompleteClick}
            >
              <UploadCloud size={14} /> Complete
            </button>
          ) : null}
          {canApprove && record.status === "awaiting_approval" ? (
            <button className="primary-button" type="button" disabled={saving} onClick={onApprove}>
              Approve
            </button>
          ) : null}
          {canEdit && ["completed", "awaiting_approval"].includes(record.status) ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onReopen}>
              <RotateCcw size={14} /> Reopen
            </button>
          ) : null}
          {canEdit && record.status !== "archived" ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onArchive}>
              <Archive size={14} /> Archive
            </button>
          ) : null}
          {canCreatePreplan ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onCreateOrUpdatePreplan}>
              <ShieldCheck size={14} /> Create / Update Preplan
            </button>
          ) : null}
          {canGenerateNotice ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onGenerateNotice}>
              <FileText size={14} /> Generate notice
            </button>
          ) : null}
          {canScheduleReinspection ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onScheduleReinspection}>
              <RotateCcw size={14} /> Schedule reinspection
            </button>
          ) : null}
          {canViewFps && record?.occupancyId ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onOpenFireProtectionSystems}>
              <Flame size={14} /> Fire protection systems
            </button>
          ) : null}
          {canEditFees ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onAddFee}>
              <DollarSign size={14} /> Add fee
            </button>
          ) : null}
        </div>

        {pendingCitation && editable ? (
          <div className="pending-citation-banner" role="status">
            <span>
              From the Code Library: <strong>{formatCitationLabel(pendingCitation)}</strong>.
              Issue it as a violation on this inspection, or use it in a code section item below.
            </span>
            <button
              className="primary-button"
              type="button"
              disabled={citationBusy || saving}
              onClick={issueViolationFromCitation}
            >
              {citationBusy ? "Issuing..." : "Issue violation"}
            </button>
            <button className="text-button" type="button" disabled={citationBusy} onClick={dismissPendingCitation}>
              Dismiss
            </button>
          </div>
        ) : null}
        {citationMessage ? <p className="occupancy-message">{citationMessage}</p> : null}

        {completeError ? (
          <div className="checklist-missing-alert" role="alert">
            <strong>{missingFields.length ? "Some required items aren't answered yet." : completeError}</strong>
            {missingFields.length ? (
              <ul>
                {missingFields.map((item) => (
                  <li key={item.key}>
                    <button type="button" onClick={() => focusField(item.key)}>
                      {item.label}{item.sectionTitle ? ` (${item.sectionTitle})` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {!sections.length ? (
          <InspectionEmptyState
            title="No template linked"
            description="Publish a template for this inspection type in Configuration Studio, then create a new inspection."
          />
        ) : (
          sections.map((section) => (
            <div key={section.id} className="template-section-card">
              <strong>{section.title}</strong>
              <div className="template-fields">
                {(section.fields || []).map((field) => {
                  const isDisplay = field.type === "heading" || field.type === "instruction";
                  if (isDisplay) {
                    return (
                      <div key={field.id || field.key} className="config-field">
                        <span>{field.label}</span>
                        {field.helpText ? <small className="occupancy-muted">{field.helpText}</small> : null}
                      </div>
                    );
                  }
                  const isMissing = missingKeys.has(field.key);
                  return (
                    <div
                      key={field.id || field.key}
                      className={`config-field${isMissing ? " checklist-field-missing" : ""}`}
                      data-checklist-key={field.key}
                    >
                      <span>
                        {field.label}
                        {field.required ? " *" : ""}
                        {isMissing ? " — required" : ""}
                      </span>
                      <ChecklistFieldInput
                        field={field}
                        value={answers[field.key]}
                        editable={editable}
                        invalid={isMissing}
                        departmentId={departmentId}
                        inspectionId={record.id}
                        actor={actor}
                        signerName={record.occupancySnapshot?.primaryContactName || ""}
                        pendingCitation={pendingCitation}
                        onChange={(next) => setAnswer(field.key, next)}
                      />
                      {field.helpText ? <small className="occupancy-muted">{field.helpText}</small> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="occupancy-form-grid">
          <Field label="Result *">
            <select value={result} disabled={!editable} onChange={(e) => setResult(e.target.value)}>
              <option value="">Select result</option>
              {result && !getInspectionResultOptions().includes(result) ? <option value={result}>{result}</option> : null}
              {getInspectionResultOptions().map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <label className="occupancy-primary-toggle">
            <input
              type="checkbox"
              checked={reinspectionRequired}
              disabled={!editable}
              onChange={(e) => setReinspectionRequired(e.target.checked)}
            />
            Reinspection required
          </label>
          <Field label="Reinspection date">
            <input
              type="date"
              value={nextReinspectionAt ? String(nextReinspectionAt).slice(0, 10) : ""}
              disabled={!editable}
              onChange={(e) => setNextReinspectionAt(e.target.value)}
            />
          </Field>
          <label className="occupancy-primary-toggle">
            <input
              type="checkbox"
              checked={requireApproval}
              disabled={!editable}
              onChange={(e) => setRequireApproval(e.target.checked)}
            />
            Require supervisor approval on complete
          </label>
        </div>
        <Field label="Summary">
          <textarea rows={3} value={summary} disabled={!editable} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="Internal notes">
          <textarea rows={2} value={internalNotes} disabled={!editable} onChange={(e) => setInternalNotes(e.target.value)} />
        </Field>
        {(record.attachments || []).length ? (
          <Field label="Attachments">
            <ul className="inspection-attachment-list">
              {record.attachments.map((item) => (
                <li key={item.id}>
                  <a href={item.downloadUrl} target="_blank" rel="noreferrer">{item.fileName || item.kind}</a>
                  <small className="occupancy-muted"> {item.kind}{item.note ? ` · ${item.note}` : ""}</small>
                </li>
              ))}
            </ul>
          </Field>
        ) : null}
        {record.historicalSnapshot?.capturedAt ? (
          <p className="occupancy-muted">
            Historical snapshot locked {new Date(record.historicalSnapshot.capturedAt).toLocaleString()}
          </p>
        ) : null}

        <section className="occupancy-section inspection-violations-embed">
          <ViolationsPage
            key={`${record.id}-${violationsVersion}`}
            inspectionId={record.id}
            embedded
            onChanged={onViolationChanged}
          />
        </section>

        <section className="occupancy-section inspection-violations-embed">
          <InspectionNoticesPage
            inspectionId={record.id}
            embedded
          />
        </section>
      </div>
    </section>
  );
}

function InspectionsShellPage({
  navName,
  title,
  description,
  mode = "list",
  onNavigate,
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(null);
  const [occupancies, setOccupancies] = useState([]);
  const [types, setTypes] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [commandBoard, setCommandBoard] = useState(null);

  const allowed = mode === "dashboard"
    ? canViewInspectionDashboard(permissions, isCreator)
    : canViewInspectionsModule(permissions, isCreator);
  const canEdit = canEditInspectionsModule(permissions, isCreator);
  const canApprove = canApproveInspections(permissions, isCreator);
  const canCreatePreplan = canCreatePreplans(permissions, isCreator);
  const canGenerateNotice = canEditInspectionNotices(permissions, isCreator);
  const canScheduleReinspection = canEditInspectionEnforcement(permissions, isCreator);
  const canViewFps = canViewFireProtectionSystems(permissions, isCreator);
  const canEditFees = canEditInspectionFees(permissions, isCreator);
  const inspectorId = membership?.personnelId || user?.uid || "";
  const inspectorName = membership?.displayName || user?.displayName || user?.email || "Inspector";

  const actor = {
    actorUid: user?.uid || "system",
    actorName: inspectorName,
  };

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      setRecords([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await ensureInspectionConfigSeeded(departmentId, actor);
      const [nextSettings, nextRecords, nextOccupancies, nextTypes] = await Promise.all([
        loadInspectionSettings(departmentId),
        listInspectionRecords(departmentId, mode === "mine" ? { assignedInspectorId: inspectorId } : {}),
        ensureOccupancyRecords(departmentId, [], actor),
        listInspectionTypes(departmentId),
      ]);
      setSettings(nextSettings);
      setRecords(Array.isArray(nextRecords) ? nextRecords : []);
      setOccupancies(nextOccupancies);
      setTypes(nextTypes);
      if (mode === "dashboard") {
        try {
          setCommandBoard(await loadPreventionCommandBoard(departmentId));
        } catch (boardError) {
          console.error(boardError);
          setCommandBoard(null);
        }
      } else {
        setCommandBoard(null);
      }
    } catch (loadError) {
      console.error("Failed to load inspections shell", loadError);
      setError(friendlyError(loadError, "Couldn't load inspections data."));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, mode, inspectorId]);

  const metrics = useMemo(() => buildInspectionDashboardMetrics(records), [records]);
  const dashboardKpis = useMemo(() => {
    if (commandBoard?.kpis) return commandBoard.kpis;
    return {
      due_today: metrics.dueToday,
      due_this_week: metrics.dueThisWeek,
      overdue: metrics.overdue,
      unassigned: metrics.unassigned,
      in_progress: metrics.inProgress,
      awaiting_approval: metrics.awaitingApproval,
      open_violations: metrics.openViolations,
      violations_overdue: 0,
      reinspections_due: 0,
      active_orders: 0,
      fps_impairments: 0,
      outstanding_fees: 0,
      revenue_collected: 0,
      preplans_review: 0,
      pass_rate: 0,
    };
  }, [commandBoard, metrics]);
  const kpiCards = getPreventionKpiCards();
  const filteredRecords = useMemo(() => {
    if (mode !== "queue") return records;
    return records.filter((record) => {
      const status = String(record.status || "").toLowerCase();
      return !["completed", "cancelled", "archived"].includes(status);
    });
  }, [records, mode]);

  const activeRecord = useMemo(
    () => records.find((row) => row.id === activeId) || null,
    [records, activeId]
  );

  function upsertRecord(next) {
    setRecords((current) => {
      const without = current.filter((row) => row.id !== next.id);
      return [next, ...without];
    });
  }

  async function handleCreate(payload) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await createInspection(departmentId, payload, actor);
      upsertRecord(created);
      setShowCreate(false);
      setActiveId(created.id);
      setMessage(`Created ${created.inspectionNumber}`);
      if (mode === "dashboard") onNavigate?.("Work Queue");
    } catch (createError) {
      setError(friendlyError(createError, "Couldn't create inspection."));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(actionFn, successMessage) {
    if (!activeRecord) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await actionFn();
      upsertRecord(next);
      setMessage(successMessage);
    } catch (actionError) {
      setError(friendlyError(actionError, "That didn't work. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={allowed} loading={false}>
      <InspectionsModuleLayout
        title={title}
        description={description}
        activeNavName={navName}
        onNavigate={onNavigate}
        actions={canEdit ? (
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
            <CirclePlus size={14} /> New inspection
          </button>
        ) : null}
      >
        {loading ? (
          <div className="inspections-loading-state" role="status"><p>Loading inspections...</p></div>
        ) : null}
        {!loading && error ? (
          <div className="inspections-error-state" role="alert"><strong>Unable to load inspections</strong><p>{error}</p></div>
        ) : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && !error && mode === "dashboard" ? (
          <>
            <div className="inspections-kpi-grid">
              {kpiCards.map((card) => {
                const raw = dashboardKpis[card.id];
                const display = card.id === "outstanding_fees" || card.id === "revenue_collected"
                  ? formatCurrency(raw || 0)
                  : (raw ?? 0);
                return (
                  <button
                    key={card.id}
                    type="button"
                    className="inspections-kpi-card inspections-kpi-card-button"
                    onClick={() => onNavigate?.(card.drillNav)}
                  >
                    <span>{card.label}</span>
                    <strong>{display}</strong>
                  </button>
                );
              })}
            </div>
            {commandBoard?.charts ? (
              <div className="inspection-chart-grid">
                {[
                  ["Inspections by status", commandBoard.charts.inspectionsByStatus],
                  ["Inspections by type", commandBoard.charts.inspectionsByType],
                  ["Open violations by severity", commandBoard.charts.violationsBySeverity],
                  ["Pass / fail", commandBoard.charts.passFail],
                ].map(([title, rows]) => {
                  const max = Math.max(1, ...(rows || []).map((row) => Number(row.count) || 0));
                  return (
                    <section key={title} className="panel">
                      <header><div><strong>{title}</strong></div></header>
                      <div className="panel-body">
                        {!(rows || []).length ? (
                          <p className="occupancy-muted">No data yet.</p>
                        ) : (
                          <div className="inspection-chart-bars">
                            {(rows || []).slice(0, 6).map((row) => (
                              <div key={row.key} className="inspection-chart-row">
                                <span>{row.label || labelFromKey(row.key)}</span>
                                <div className="inspection-chart-track">
                                  <div style={{ width: `${Math.max(4, ((Number(row.count) || 0) / max) * 100)}%` }} />
                                </div>
                                <strong>{row.count}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}
            <div className="occupancy-detail-actions" style={{ marginBottom: 12 }}>
              <button className="secondary-button" type="button" onClick={() => onNavigate?.("Inspection Reports")}>
                <FileText size={14} /> Open reports
              </button>
            </div>
            {metrics.total === 0 ? (
              <InspectionEmptyState
                title="No inspection activity yet"
                description="Create an inspection from Work Queue or All Inspections to begin the prevention workflow."
              />
            ) : (
              <section className="panel inspections-panel">
                <header><div><strong>Recent inspections</strong></div></header>
                <div className="panel-body">
                  <InspectionRecordsTable
                    records={records.slice(0, 10)}
                    onOpen={setActiveId}
                  />
                </div>
              </section>
            )}
          </>
        ) : null}

        {!loading && !error && mode !== "dashboard" ? (
          filteredRecords.length === 0 && !activeRecord ? (
            <InspectionEmptyState
              title={mode === "mine" ? "No inspections assigned to you" : "No inspections in this queue"}
              description="Use New inspection to schedule and conduct work against an occupancy."
            />
          ) : (
            <section className="panel inspections-panel">
              <header>
                <div>
                  <strong>
                    {mode === "queue" ? "Open work" : mode === "mine" ? "My inspections" : "All inspections"}
                  </strong>
                </div>
                <span className="inspections-count">{filteredRecords.length}</span>
              </header>
              <div className="panel-body">
                <InspectionRecordsTable records={filteredRecords} onOpen={setActiveId} />
              </div>
            </section>
          )
        ) : null}

        {activeRecord ? (
          <InspectionWorkspace
            record={activeRecord}
            canEdit={canEdit}
            canApprove={canApprove}
            canCreatePreplan={canCreatePreplan}
            canGenerateNotice={canGenerateNotice}
            canScheduleReinspection={canScheduleReinspection}
            canViewFps={canViewFps}
            canEditFees={canEditFees}
            departmentId={departmentId}
            actor={actor}
            saving={saving}
            onClose={() => setActiveId("")}
            onStart={() => runAction(
              () => startInspection(departmentId, activeRecord.id, actor),
              "Inspection started"
            )}
            onSaveDraft={async (payload) => {
              if (!activeRecord) return;
              setSaving(true);
              setError("");
              setMessage("");
              try {
                const result = await saveInspectionDraftWithOffline(
                  departmentId,
                  activeRecord.id,
                  payload,
                  actor
                );
                upsertRecord(result.record);
                setMessage(
                  result.queued
                    ? (result.mode === "offline"
                      ? "Draft saved offline — will sync when online"
                      : "Draft queued after network error — will sync when online")
                    : "Draft saved"
                );
              } catch (actionError) {
                setError(friendlyError(actionError, "Couldn't save draft."));
              } finally {
                setSaving(false);
              }
            }}
            onComplete={(payload) => runAction(
              () => completeInspection(departmentId, activeRecord.id, payload, actor),
              payload.requireApproval ? "Completed — awaiting approval" : "Inspection completed"
            )}
            onApprove={() => runAction(
              () => approveInspection(departmentId, activeRecord.id, actor),
              "Inspection approved"
            )}
            onReopen={() => runAction(
              () => reopenInspection(departmentId, activeRecord.id, actor),
              "Inspection reopened"
            )}
            onArchive={() => runAction(
              () => archiveInspection(departmentId, activeRecord.id, actor),
              "Inspection archived"
            )}
            onCreateOrUpdatePreplan={() => runAction(
              async () => {
                const result = await createOrUpdatePreplanFromInspection(
                  departmentId,
                  activeRecord.id,
                  {},
                  actor
                );
                if (typeof sessionStorage !== "undefined") {
                  sessionStorage.setItem("forge-open-preplan-id", result.preplan.id);
                }
                onNavigate?.("Preplan Work Queue");
                return result.preplan;
              },
              "Preplan created / updated — opening work queue"
            )}
            onGenerateNotice={() => runAction(
              async () => {
                const notice = await generateNoticeFromInspection(
                  departmentId,
                  activeRecord.id,
                  {},
                  actor
                );
                if (typeof sessionStorage !== "undefined") {
                  sessionStorage.setItem("forge-open-notice-id", notice.id);
                }
                onNavigate?.("Notices & Certificates");
                return activeRecord;
              },
              "Notice generated — opening Notices"
            )}
            onScheduleReinspection={() => runAction(
              async () => {
                await scheduleReinspection(departmentId, activeRecord.id, {}, actor);
                onNavigate?.("Enforcement Cases");
                return activeRecord;
              },
              "Reinspection scheduled — opening Enforcement"
            )}
            onOpenFireProtectionSystems={() => {
              if (typeof sessionStorage !== "undefined" && activeRecord.occupancyId) {
                sessionStorage.setItem("forge-fps-filter-occupancy", activeRecord.occupancyId);
              }
              onNavigate?.("Fire Protection Systems");
            }}
            onAddFee={() => {
              if (typeof sessionStorage !== "undefined") {
                sessionStorage.setItem("forge-fees-create-inspection", activeRecord.id);
                if (activeRecord.occupancyId) {
                  sessionStorage.setItem("forge-fees-filter-occupancy", activeRecord.occupancyId);
                }
              }
              onNavigate?.("Fees & Payments");
            }}
            onViolationChanged={async () => {
              try {
                const next = await getInspectionRecord(departmentId, activeRecord.id);
                if (next) upsertRecord(next);
              } catch {
                // Non-blocking refresh after violation mutations.
              }
            }}
          />
        ) : null}

        {settings?.numbering?.prefix ? (
          <p className="inspections-settings-hint">
            Numbering format: {describeNumberingFormat(settings)}
          </p>
        ) : null}
      </InspectionsModuleLayout>

      <CreateInspectionModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreate}
        occupancies={occupancies}
        types={types}
        saving={saving}
        defaultAssigneeId={inspectorId}
        defaultAssigneeName={inspectorName}
      />
    </InspectionPermissionGate>
  );
}

function InspectionRecordsTable({ records = [], onOpen }) {
  return (
    <div className="table-wrap">
      <table className="data-table inspections-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>Occupancy</th>
            <th>Status</th>
            <th>Due</th>
            <th>Priority</th>
            <th>Violations</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{record.inspectionNumber || record.id}</td>
              <td>{record.occupancyName || record.address || "—"}</td>
              <td><InspectionStatusBadge status={record.status} /></td>
              <td>{formatDue(record.dueAt || record.scheduledStart)}</td>
              <td>{formatPriority(record.priority)}</td>
              <td>{Number(record.openViolationCount) || 0}</td>
              <td>
                <button className="text-button" type="button" onClick={() => onOpen?.(record.id)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InspectionsDashboardPage({ onNavigate }) {
  return (
    <InspectionsShellPage
      navName="Inspections Dashboard"
      title="Inspections Dashboard"
      description="Prevention workload overview for this department."
      mode="dashboard"
      onNavigate={onNavigate}
    />
  );
}

export function InspectionsWorkQueuePage({ onNavigate }) {
  return (
    <InspectionsShellPage
      navName="Work Queue"
      title="Work Queue"
      description="Open and in-progress inspections awaiting action."
      mode="queue"
      onNavigate={onNavigate}
    />
  );
}

export function AllInspectionsPage({ onNavigate }) {
  return (
    <InspectionsShellPage
      navName="All Inspections"
      title="All Inspections"
      description="Department-wide inspection records."
      mode="all"
      onNavigate={onNavigate}
    />
  );
}

export function MyInspectionsPage({ onNavigate }) {
  return (
    <InspectionsShellPage
      navName="My Inspections"
      title="My Inspections"
      description="Inspections assigned to you."
      mode="mine"
      onNavigate={onNavigate}
    />
  );
}
