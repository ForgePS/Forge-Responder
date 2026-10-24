import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  CirclePlus,
  Map,
  Save,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout from "../components/inspections/InspectionsModuleLayout.jsx";
import PreplanWorkspacePanels from "../components/inspections/PreplanWorkspacePanels.jsx";
import {
  approvePreplan,
  buildPreplanWorkQueueMetrics,
  canApprovePreplans,
  canCreatePreplans,
  canEditPreplans,
  canUploadPreplanFiles,
  canViewPreplanSensitive,
  canViewPreplans,
  createPreplan,
  createPreplanFromOccupancy,
  ensureOccupancyRecords,
  ensurePreplanConfigSeeded,
  getPreplan,
  getPreplanRevision,
  getPreplanStatusOptions,
  getPreplanTypeOptions,
  labelForPreplanStatus,
  listDropdownOptions,
  listPreplanDiagrams,
  listPreplanLocalDrafts,
  listPreplanOfflineQueue,
  listPreplanRevisions,
  listPreplans,
  publishPreplanRevision,
  recordPreplanVerification,
  returnPreplanForRevision,
  savePreplanLocalDraft,
  startPreplanRevision,
  submitPreplanForReview,
  updatePreplan,
  updatePreplanDiagram,
  updatePreplanRevision,
  VERIFICATION_CHECKLIST_ITEMS,
} from "../lib/inspections/index.js";

const PREPLAN_TABS = [
  { id: "workQueue", label: "Preplan Work Queue", navName: "Preplan Work Queue" },
  { id: "all", label: "All Preplans", navName: "All Preplans" },
  { id: "new", label: "New Preplan", navName: "New Preplan" },
];

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function PreplanWizard({
  departmentId,
  occupancies,
  templates,
  types,
  canCreate,
  saving,
  onCreate,
  initialOccupancyId = "",
}) {
  const [step, setStep] = useState(1);
  const [occupancyId, setOccupancyId] = useState(initialOccupancyId || occupancies[0]?.id || "");
  const [preplanTypeId, setPreplanTypeId] = useState(types[0]?.id || "commercial");
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [riskLevel, setRiskLevel] = useState("Moderate");
  const [priority, setPriority] = useState("normal");
  const [station, setStation] = useState("");
  const [firstDue, setFirstDue] = useState("");
  const [standaloneName, setStandaloneName] = useState("");
  const [standaloneAddress, setStandaloneAddress] = useState("");

  useEffect(() => {
    if (initialOccupancyId) setOccupancyId(initialOccupancyId);
  }, [initialOccupancyId]);

  useEffect(() => {
    const match = templates.find((row) => row.preplanTypeId === preplanTypeId);
    if (match) setTemplateId(match.id);
  }, [preplanTypeId, templates]);

  const occupancy = occupancies.find((row) => row.id === occupancyId) || null;

  function persistLocal() {
    if (!departmentId) return;
    savePreplanLocalDraft(departmentId, "new-preplan", {
      occupancyId,
      preplanTypeId,
      templateId,
      riskLevel,
      priority,
      station,
      firstDue,
      standaloneName,
      standaloneAddress,
      step,
    });
  }

  async function handleSubmit() {
    persistLocal();
    await onCreate({
      occupancyId: occupancyId || undefined,
      occupancyName: occupancy?.name || standaloneName,
      address: occupancy?.address || standaloneAddress,
      preplanTypeId,
      templateId,
      riskLevel,
      priority,
      responsibleStation: station,
      firstDueCompany: firstDue,
    });
  }

  return (
    <section className="panel">
      <header>
        <div><CirclePlus size={15} /><strong>New preplan wizard</strong></div>
        <span className="occupancy-muted">Step {step} of 3</span>
      </header>
      <div className="panel-body config-studio-body">
        {step === 1 ? (
          <>
            <p className="occupancy-muted">Select an occupancy or enter a standalone location.</p>
            <div className="occupancy-form-grid">
              <Field label="Occupancy" wide>
                <select value={occupancyId} onChange={(e) => setOccupancyId(e.target.value)}>
                  <option value="">— Standalone / new location —</option>
                  {occupancies.map((row) => (
                    <option key={row.id} value={row.id}>{row.name} — {row.address || "No address"}</option>
                  ))}
                </select>
              </Field>
              {!occupancyId ? (
                <>
                  <Field label="Location name">
                    <input value={standaloneName} onChange={(e) => setStandaloneName(e.target.value)} />
                  </Field>
                  <Field label="Address">
                    <input value={standaloneAddress} onChange={(e) => setStandaloneAddress(e.target.value)} />
                  </Field>
                </>
              ) : (
                <div className="occupancy-muted">
                  {occupancy?.name} · {occupancy?.address || "No address"} · Risk {occupancy?.hazard || occupancy?.riskLevel || "—"}
                </div>
              )}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <div className="occupancy-form-grid">
            <Field label="Preplan type">
              <select value={preplanTypeId} onChange={(e) => setPreplanTypeId(e.target.value)}>
                {types.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </Field>
            <Field label="Template">
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </Field>
            <Field label="Risk level">
              <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
                {["Low", "Moderate", "High", "Critical"].map((level) => <option key={level}>{level}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {["low", "normal", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Responsible station">
              <input value={station} onChange={(e) => setStation(e.target.value)} />
            </Field>
            <Field label="First-due company">
              <input value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <p>Ready to create a draft preplan and open the field survey.</p>
            <ul className="occupancy-muted">
              <li>Location: {occupancy?.name || standaloneName || "Unnamed"}</li>
              <li>Address: {occupancy?.address || standaloneAddress || "—"}</li>
              <li>Type: {types.find((t) => t.id === preplanTypeId)?.label || preplanTypeId}</li>
              <li>Template: {templates.find((t) => t.id === templateId)?.name || templateId}</li>
            </ul>
          </div>
        ) : null}

        <div className="occupancy-detail-actions">
          {step > 1 ? (
            <button className="secondary-button" type="button" onClick={() => setStep((s) => s - 1)}>Back</button>
          ) : null}
          {step < 3 ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                persistLocal();
                setStep((s) => s + 1);
              }}
            >
              Continue
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              disabled={!canCreate || saving}
              onClick={handleSubmit}
            >
              <CirclePlus size={14} /> {saving ? "Creating…" : "Create draft preplan"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function PreplanDetailWorkspace({
  departmentId,
  preplan,
  revision,
  diagrams,
  canEdit,
  canApprove,
  canUpload = false,
  canViewSensitive = false,
  actor = {},
  saving,
  onClose,
  onSaveRevision,
  onSubmitReview,
  onReturn,
  onApprove,
  onPublish,
  onNewRevision,
  onVerify,
  onUpdateDiagram,
  onUpdateLinks,
  onMessage,
  onError,
}) {
  const [answers, setAnswers] = useState(revision?.sectionAnswers || {});
  const [dispatchSummary, setDispatchSummary] = useState(revision?.dispatchSummary || "");
  const [notes, setNotes] = useState(revision?.notes || "");
  const [symbolChecklist, setSymbolChecklist] = useState(revision?.symbolChecklist || []);
  const [verifyNotes, setVerifyNotes] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [dropdownMap, setDropdownMap] = useState({});

  useEffect(() => {
    setAnswers(revision?.sectionAnswers || {});
    setDispatchSummary(revision?.dispatchSummary || "");
    setNotes(revision?.notes || "");
    setSymbolChecklist(revision?.symbolChecklist || []);
  }, [revision?.id, revision?.updatedAt]);

  useEffect(() => {
    let cancelled = false;
    async function loadDropdowns() {
      if (!departmentId) return;
      const nextSections = revision?.templateSnapshot?.sections || [];
      const libraryIds = [...new Set(
        nextSections.flatMap((section) => (section.fields || [])
          .map((field) => field.dropdownLibrary)
          .filter(Boolean)),
      )];
      const entries = await Promise.all(libraryIds.map(async (libraryId) => {
        const options = await listDropdownOptions(departmentId, libraryId).catch(() => []);
        return [libraryId, options.filter((row) => row.active !== false)];
      }));
      if (!cancelled) setDropdownMap(Object.fromEntries(entries));
    }
    loadDropdowns();
    return () => { cancelled = true; };
  }, [departmentId, revision?.id, revision?.templateSnapshot]);

  const sections = revision?.templateSnapshot?.sections || [];
  const editable = canEdit && !["published", "superseded"].includes(revision?.status);

  function setAnswer(key, value) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function fieldVisible(field) {
    if (!field?.showIf?.key) return true;
    const expected = field.showIf.equals ?? field.showIf.value;
    return String(answers[field.showIf.key] || "") === String(expected);
  }

  function toggleSymbol(symbolId) {
    setSymbolChecklist((current) => current.map((row) => (
      row.symbolId === symbolId ? { ...row, present: !row.present } : row
    )));
  }

  const draftPayload = {
    sectionAnswers: answers,
    dispatchSummary,
    notes,
    symbolChecklist,
  };

  return (
    <section className="panel inspection-workspace-panel">
      <header>
        <div>
          <strong>{preplan.preplanNumber}</strong>
          <small className="occupancy-muted">
            {" "}{preplan.occupancyName || "No occupancy"} · {preplan.address || "No address"}
          </small>
        </div>
        <div className="occupancy-detail-actions">
          <InspectionStatusBadge status={labelForPreplanStatus(preplan.status)} />
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
      </header>
      <div className="panel-body config-studio-body">
        <div className="occupancy-form-grid">
          <div><span className="occupancy-muted">Type</span><strong>{preplan.preplanTypeId}</strong></div>
          <div><span className="occupancy-muted">Risk</span><strong>{preplan.riskLevel}</strong></div>
          <div><span className="occupancy-muted">Validity</span><strong>{preplan.operationalValidity}</strong></div>
          <div><span className="occupancy-muted">Revision</span><strong>#{preplan.currentRevisionNumber} ({revision?.status})</strong></div>
          <div><span className="occupancy-muted">Verified</span><strong>{formatDate(preplan.lastVerifiedAt)}</strong></div>
          <div><span className="occupancy-muted">Verification due</span><strong>{formatDate(preplan.verificationDueAt)}</strong></div>
          <div><span className="occupancy-muted">Template version</span><strong>{preplan.templateVersion || revision?.templateVersion || "—"}</strong></div>
          <div><span className="occupancy-muted">Station / district</span><strong>{preplan.stationId || "—"} / {preplan.districtId || "—"}</strong></div>
        </div>

        <div className="occupancy-detail-actions">
          {editable ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={() => onSaveRevision(draftPayload)}>
              <Save size={14} /> Save survey
            </button>
          ) : null}
          {canEdit && ["draft", "field_survey_in_progress", "returned_for_revision", "revision_in_progress"].includes(preplan.status) ? (
            <button className="primary-button" type="button" disabled={saving} onClick={onSubmitReview}>
              Submit for review
            </button>
          ) : null}
          {canApprove && preplan.status === "ready_for_review" ? (
            <>
              <button className="secondary-button" type="button" disabled={saving} onClick={() => onReturn(returnNotes)}>
                Return
              </button>
              <button className="primary-button" type="button" disabled={saving} onClick={onApprove}>
                Approve
              </button>
            </>
          ) : null}
          {canApprove && ["approved", "ready_for_review"].includes(preplan.status) ? (
            <button className="primary-button" type="button" disabled={saving} onClick={onPublish}>
              <UploadCloud size={14} /> Publish
            </button>
          ) : null}
          {canEdit && ["operational", "published", "verification_due", "verification_overdue"].includes(preplan.status) ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onNewRevision}>
              New revision
            </button>
          ) : null}
          {canEdit && ["operational", "published", "verification_due", "verification_overdue"].includes(preplan.status) ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={() => onVerify({ notes: verifyNotes })}>
              <CheckSquare size={14} /> Record verification
            </button>
          ) : null}
        </div>

        {canApprove && preplan.status === "ready_for_review" ? (
          <Field label="Return notes" wide>
            <input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} />
          </Field>
        ) : null}

        {sections.length ? sections.map((section) => (
          <div key={section.id} className="template-section-card">
            <strong>{section.title}</strong>
            <div className="template-fields">
              {(section.fields || []).filter(fieldVisible).map((field) => {
                if (field.sensitive && !canViewSensitive && !editable) {
                  return (
                    <div key={field.key} className="config-field">
                      <span>{field.label}</span>
                      <em className="occupancy-muted">Restricted</em>
                    </div>
                  );
                }
                const options = field.dropdownLibrary
                  ? (dropdownMap[field.dropdownLibrary] || [])
                  : (field.options || []);
                return (
                  <div key={field.key} className="config-field">
                    <span>{field.label}</span>
                    {field.type === "long_text" || field.type === "textarea" ? (
                      <textarea
                        rows={3}
                        value={answers[field.key] || ""}
                        disabled={!editable}
                        onChange={(e) => setAnswer(field.key, e.target.value)}
                      />
                    ) : field.type === "select" || field.type === "dropdown" ? (
                      <select
                        value={answers[field.key] || ""}
                        disabled={!editable}
                        onChange={(e) => setAnswer(field.key, e.target.value)}
                      >
                        <option value="">Select…</option>
                        {options.map((opt) => (
                          <option key={opt.id || opt.value || opt.label} value={opt.label || opt.value || opt.id}>
                            {opt.label || opt.value || opt.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={answers[field.key] || ""}
                        disabled={!editable}
                        onChange={(e) => setAnswer(field.key, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )) : (
          <InspectionEmptyState
            title="No template sections"
            description="Seed preplan templates in Configuration Studio."
          />
        )}

        <Field label="Dispatch summary" wide>
          <textarea
            rows={3}
            value={dispatchSummary}
            disabled={!editable}
            onChange={(e) => setDispatchSummary(e.target.value)}
          />
        </Field>
        <Field label="Revision notes" wide>
          <textarea rows={2} value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="template-section-card">
          <strong><Map size={14} /> Symbol checklist</strong>
          <div className="occupancy-form-grid">
            {symbolChecklist.map((row) => (
              <label key={row.symbolId} className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(row.present)}
                  disabled={!editable}
                  onChange={() => toggleSymbol(row.symbolId)}
                />
                {row.label || row.symbolId}
              </label>
            ))}
          </div>
          {diagrams[0] && canEdit ? (
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={() => onUpdateDiagram(diagrams[0].id, {
                status: "complete",
                symbolsPlaced: symbolChecklist.filter((row) => row.present).map((row) => row.symbolId),
              })}
            >
              Mark diagram checklist complete
            </button>
          ) : null}
        </div>

        <Field label="Verification notes" wide>
          <input value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} placeholder="Optional notes for verification" />
        </Field>

        <PreplanWorkspacePanels
          departmentId={departmentId}
          preplan={{ ...preplan, sectionAnswers: answers }}
          actor={actor}
          canEdit={canEdit}
          canUpload={canUpload}
          canViewSensitive={canViewSensitive}
          saving={saving}
          onUpdateLinks={onUpdateLinks}
          onMessage={onMessage}
          onError={onError}
        />
      </div>
    </section>
  );
}

function PreplansShell({
  navName,
  title,
  description,
  mode = "work",
  onNavigate,
  initialOccupancyId = "",
  openPreplanId = "",
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewPreplans(permissions, isCreator);
  const canEdit = canEditPreplans(permissions, isCreator);
  const canCreate = canCreatePreplans(permissions, isCreator);
  const canApprove = canApprovePreplans(permissions, isCreator);
  const canUpload = canUploadPreplanFiles(permissions, isCreator);
  const canViewSensitive = canViewPreplanSensitive(permissions, isCreator);

  const bootstrapOccupancyId = initialOccupancyId || (
    typeof sessionStorage !== "undefined"
      ? (sessionStorage.getItem("forge-preplan-create-occupancy") || "")
      : ""
  );
  const bootstrapPreplanId = openPreplanId || (
    typeof sessionStorage !== "undefined"
      ? (sessionStorage.getItem("forge-open-preplan-id") || "")
      : ""
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [occupancies, setOccupancies] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState(bootstrapPreplanId || "");
  const [revision, setRevision] = useState(null);
  const [diagrams, setDiagrams] = useState([]);
  const [offlineCount, setOfflineCount] = useState(0);
  const [seedOccupancyId] = useState(bootstrapOccupancyId);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (bootstrapPreplanId) sessionStorage.removeItem("forge-open-preplan-id");
    if (bootstrapOccupancyId) sessionStorage.removeItem("forge-preplan-create-occupancy");
  }, [bootstrapPreplanId, bootstrapOccupancyId]);

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const types = getPreplanTypeOptions();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const seeded = await ensurePreplanConfigSeeded(departmentId, actor);
      const [nextRecords, nextOccupancies] = await Promise.all([
        listPreplans(departmentId, mode === "work" ? { queue: "work" } : { openOnly: false }),
        ensureOccupancyRecords(departmentId, [], actor),
      ]);
      setTemplates(seeded.templates);
      setRecords(nextRecords);
      setOccupancies(nextOccupancies);
      setOfflineCount(
        listPreplanOfflineQueue(departmentId).length
        + Object.keys(listPreplanLocalDrafts(departmentId)).length
      );
          if (openPreplanId || bootstrapPreplanId) setActiveId(openPreplanId || bootstrapPreplanId);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load preplans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, mode]);

  const metrics = useMemo(() => buildPreplanWorkQueueMetrics(records), [records]);
  const visibleRecords = useMemo(() => {
    const uid = user?.uid || "";
    if (mode === "draft") {
      return records.filter((row) => (
        ["draft", "field_survey_in_progress", "revision_in_progress", "returned_for_revision"].includes(row.status)
      ));
    }
    if (mode === "review") {
      return records.filter((row) => ["ready_for_review", "awaiting_information"].includes(row.status));
    }
    if (mode === "approved") {
      return records.filter((row) => ["approved", "published", "operational"].includes(row.status));
    }
    if (mode === "mine") {
      return records.filter((row) => (
        row.assignedPlannerId === uid
        || row.createdBy === uid
        || row.reviewerId === uid
      ));
    }
    if (mode === "reports" || mode === "dashboard") {
      return records;
    }
    if (mode === "work") {
      return records.filter((row) => !["archived", "cancelled", "superseded"].includes(row.status));
    }
    return records;
  }, [records, mode, user?.uid]);
  const active = useMemo(
    () => visibleRecords.find((row) => row.id === activeId) || records.find((row) => row.id === activeId) || null,
    [visibleRecords, records, activeId]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (!departmentId || !active?.currentRevisionId) {
        setRevision(null);
        setDiagrams([]);
        return;
      }
      try {
        const [rev, diags] = await Promise.all([
          getPreplanRevision(departmentId, active.currentRevisionId),
          listPreplanDiagrams(departmentId, active.id),
        ]);
        if (!cancelled) {
          setRevision(rev);
          setDiagrams(diags);
        }
      } catch (detailError) {
        console.error(detailError);
      }
    }
    loadDetail();
    return () => { cancelled = true; };
  }, [departmentId, active?.id, active?.currentRevisionId, active?.updatedAt]);

  function upsert(next) {
    setRecords((current) => [next, ...current.filter((row) => row.id !== next.id)]);
    setActiveId(next.id);
  }

  async function handleCreate(payload) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = payload.occupancyId
        ? await createPreplanFromOccupancy(departmentId, payload.occupancyId, payload, actor)
        : await createPreplan(departmentId, payload, actor);
      upsert(result.preplan);
      setRevision(result.revision);
      setMessage(`Created ${result.preplan.preplanNumber}`);
      onNavigate?.("Preplan Work Queue");
    } catch (createError) {
      setError(createError?.message || "Unable to create preplan.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(fn, successMessage) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      if (result?.preplan) upsert(result.preplan);
      else if (result?.id) upsert(result);
      if (result?.revision) setRevision(result.revision);
      if (successMessage) setMessage(successMessage);
      await reload();
    } catch (actionError) {
      setError(actionError?.message || "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={allowed} title="Preplans">
      <InspectionsModuleLayout
        title={title}
        description={description}
        activeNavName={navName}
        onNavigate={onNavigate}
        tabs={PREPLAN_TABS}
        actions={canCreate && mode !== "new" ? (
          <button className="primary-button" type="button" onClick={() => onNavigate?.("New Preplan")}>
            <CirclePlus size={14} /> New Preplan
          </button>
        ) : null}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}
        {offlineCount > 0 ? (
          <p className="occupancy-muted">{offlineCount} local draft / offline queue item(s) stored on this device.</p>
        ) : null}

        {loading ? <p className="occupancy-muted">Loading preplans…</p> : null}

        {!loading && mode !== "new" && !active ? (
          <>
            <div className="inspections-kpi-grid">
              {[
                ["Open", metrics.total],
                ["In draft", metrics.draft],
                ["In review", metrics.review],
                ["Verification", metrics.verification],
                ["Operational", metrics.operational],
                ["High risk", metrics.highRisk],
              ].map(([label, value]) => (
                <div key={label} className="inspections-kpi-card">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <section className="panel">
              <header>
                <div><ShieldCheck size={15} /><strong>{
                  mode === "work" ? "Work queue"
                    : mode === "draft" ? "Draft preplans"
                      : mode === "review" ? "Awaiting review"
                        : mode === "approved" ? "Approved preplans"
                          : mode === "mine" ? "My preplans"
                            : mode === "dashboard" ? "Dashboard"
                              : mode === "reports" ? "Reports"
                                : "All preplans"
                }</strong></div>
              </header>
              <div className="panel-body">
                {!visibleRecords.length ? (
                  <InspectionEmptyState
                    title="No preplans yet"
                    description="Create a preplan from New Preplan, an occupancy, or an inspection."
                    action={canCreate ? (
                      <button className="primary-button" type="button" onClick={() => onNavigate?.("New Preplan")}>
                        New Preplan
                      </button>
                    ) : null}
                  />
                ) : (
                  <div className="cert-table">
                    <div className="cert-row cert-head">
                      <span>Number</span>
                      <span>Occupancy</span>
                      <span>Type</span>
                      <span>Status</span>
                      <span>Risk</span>
                      <span>Verified</span>
                      <span>Updated</span>
                    </div>
                    {visibleRecords.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="cert-row cert-row-button"
                        onClick={() => setActiveId(row.id)}
                      >
                        <strong>{row.preplanNumber}</strong>
                        <span>{row.occupancyName || "—"}</span>
                        <span>{row.preplanTypeId}</span>
                        <span>{labelForPreplanStatus(row.status)}</span>
                        <span>{row.riskLevel}</span>
                        <span>{formatDate(row.lastVerifiedAt)}</span>
                        <span>{formatDate(row.updatedAt)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}

        {!loading && mode === "new" && !active ? (
          <PreplanWizard
            departmentId={departmentId}
            occupancies={occupancies}
            templates={templates}
            types={types}
            canCreate={canCreate}
            saving={saving}
            initialOccupancyId={seedOccupancyId || initialOccupancyId}
            onCreate={handleCreate}
          />
        ) : null}

        {!loading && active && revision ? (
          <PreplanDetailWorkspace
            departmentId={departmentId}
            preplan={active}
            revision={revision}
            diagrams={diagrams}
            canEdit={canEdit}
            canApprove={canApprove}
            canUpload={canUpload}
            canViewSensitive={canViewSensitive}
            actor={actor}
            saving={saving}
            onClose={() => setActiveId("")}
            onMessage={setMessage}
            onError={setError}
            onSaveRevision={(payload) => runAction(
              () => updatePreplanRevision(departmentId, revision.id, payload, actor).then(async (rev) => {
                const next = await getPreplan(departmentId, active.id);
                return { preplan: next, revision: rev };
              }),
              "Survey saved."
            )}
            onSubmitReview={() => runAction(
              () => submitPreplanForReview(departmentId, active.id, actor),
              "Submitted for review."
            )}
            onReturn={(notes) => runAction(
              () => returnPreplanForRevision(departmentId, active.id, notes, actor),
              "Returned for revision."
            )}
            onApprove={() => runAction(
              () => approvePreplan(departmentId, active.id, actor),
              "Approved."
            )}
            onPublish={() => runAction(
              () => publishPreplanRevision(departmentId, active.id, actor),
              "Published — now operational."
            )}
            onNewRevision={() => runAction(
              () => startPreplanRevision(departmentId, active.id, actor),
              "New revision started."
            )}
            onVerify={(payload) => runAction(
              () => recordPreplanVerification(departmentId, active.id, {
                ...payload,
                checklist: VERIFICATION_CHECKLIST_ITEMS.map((item) => ({
                  id: item.id,
                  label: item.label,
                  checked: true,
                  notes: "",
                })),
              }, actor),
              "Verification recorded."
            )}
            onUpdateDiagram={(diagramId, patch) => runAction(
              () => updatePreplanDiagram(departmentId, diagramId, patch, actor).then(async (diagram) => {
                setDiagrams((current) => [diagram, ...current.filter((row) => row.id !== diagram.id)]);
                const next = await getPreplan(departmentId, active.id);
                return { preplan: next };
              }),
              "Diagram checklist updated."
            )}
            onUpdateLinks={(patch) => runAction(
              () => updatePreplan(departmentId, active.id, patch, actor),
              "Linked assets saved."
            )}
          />
        ) : null}

        {!loading && active && !revision ? (
          <p className="occupancy-muted">Loading revision…</p>
        ) : null}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}

export function PreplansWorkQueuePage({ onNavigate, openPreplanId, queueFilter = "" }) {
  const titleMap = {
    "Preplan Dashboard": "Preplan Dashboard",
    "My Preplans": "My Preplans",
    "Draft Preplans": "Draft Preplans",
    "Awaiting Review": "Awaiting Review",
    "Approved Preplans": "Approved Preplans",
    "Preplan Reports": "Preplan Reports",
  };
  const modeMap = {
    "Draft Preplans": "draft",
    "Awaiting Review": "review",
    "Approved Preplans": "approved",
    "My Preplans": "mine",
    "Preplan Reports": "reports",
    "Preplan Dashboard": "dashboard",
  };
  return (
    <PreplansShell
      navName={queueFilter || "Preplan Work Queue"}
      title={titleMap[queueFilter] || "Preplan Work Queue"}
      description="Drafts, field surveys, review, publication, and verification."
      mode={modeMap[queueFilter] || "work"}
      onNavigate={onNavigate}
      openPreplanId={openPreplanId}
    />
  );
}

export function AllPreplansPage({ onNavigate, openPreplanId }) {
  return (
    <PreplansShell
      navName="All Preplans"
      title="All Preplans"
      description="Department pre-incident plans linked to occupancies."
      mode="all"
      onNavigate={onNavigate}
      openPreplanId={openPreplanId}
    />
  );
}

export function NewPreplanPage({ onNavigate, initialOccupancyId }) {
  return (
    <PreplansShell
      navName="New Preplan"
      title="New Preplan"
      description="Create a pre-incident plan from an occupancy or standalone location."
      mode="new"
      onNavigate={onNavigate}
      initialOccupancyId={initialOccupancyId}
    />
  );
}

/** Legacy nav name → work queue. */
export function PreplansPage({ onNavigate, query: _query }) {
  return <PreplansWorkQueuePage onNavigate={onNavigate} />;
}

export async function openLatestPreplanForOccupancy(departmentId, occupancyId) {
  const list = await listPreplans(departmentId, { occupancyId, openOnly: true });
  return list[0] || null;
}

export { listPreplanRevisions, updatePreplan, getPreplanStatusOptions };
