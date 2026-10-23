import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CirclePlus, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import HydrantDamageModuleLayout, {
  HydrantDamagePermissionGate,
  HydrantDamageStatusBadge,
} from "../components/hydrants/HydrantDamageModuleLayout.jsx";
import HydrantDamageWizard from "../components/hydrants/HydrantDamageWizard.jsx";
import OutOfServiceHydrantList, {
  hydrantRecordKey,
} from "../components/hydrants/OutOfServiceHydrantList.jsx";
import {
  canCreateHydrantDamage,
  canEditHydrantDamageDraft,
  canAcknowledgeHydrantDamage,
  canEscalateHydrantDamage,
  canManageWaterCompanies,
  canSendHydrantDamage,
  canVerifyHydrantDamage,
  canViewHydrantDamage,
  acknowledgeHydrantDamageReport,
  canEscalateDamageReport,
  createHydrantDamageReport,
  escalateHydrantDamageReport,
  filterDamageReportsByQueue,
  getDamageQueueViews,
  getSlaSnapshot,
  getVerificationResultOptions,
  getVerificationTypeOptions,
  HYDRANT_DAMAGE_PRESELECT_KEY,
  isBrowserOnline,
  listHydrantDamageReports,
  listOfflineDamageDrafts,
  listWaterCompanies,
  markDamageReportReadyToSend,
  markReadyForVerification,
  recordUtilityRepairUpdate,
  reopenHydrantDamageReport,
  resolveWaterCompanyForHydrant,
  saveOfflineDamageDraft,
  sendHydrantDamageReport,
  setDamageReportSlaPaused,
  submitHydrantDamageVerification,
  summarizeSlaQueue,
  syncOfflineDamageDrafts,
  updateHydrantDamageReport,
} from "../lib/hydrantDamage/index.js";
import { loadTenantHydrantRecords, loadStaticHydrants } from "../lib/hydrantTenantService.js";
import { isOutOfServiceHydrant } from "../lib/hydrantCompletionStats.js";

function queueIdFromNav(navName = "") {
  const views = getDamageQueueViews();
  const match = views.find((row) => row.label === navName);
  if (match) return match.id;
  if (navName === "Damage Reports") return "all";
  return "all";
}

export default function HydrantDamageReportsPage({
  onNavigate,
  activeNavName = "Damage Reports",
  queueOverride = "",
}) {
  const { departmentId, profile } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewHydrantDamage(permissions, isCreator);
  const canCreate = canCreateHydrantDamage(permissions, isCreator);
  const canEdit = canEditHydrantDamageDraft(permissions, isCreator);
  const canSend = canSendHydrantDamage(permissions, isCreator);
  const canAck = canAcknowledgeHydrantDamage(permissions, isCreator);
  const canEscalate = canEscalateHydrantDamage(permissions, isCreator);
  const canVerify = canVerifyHydrantDamage(permissions, isCreator);

  const queueId = queueOverride || queueIdFromNav(activeNavName);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reports, setReports] = useState([]);
  const [hydrants, setHydrants] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null);
  const [ackDraft, setAckDraft] = useState({
    acknowledgedByName: "",
    acknowledgedByEmail: "",
    utilityWorkOrderNumber: "",
    estimatedRepairAt: "",
    utilityNotes: "",
  });
  const [escalateNotes, setEscalateNotes] = useState("");
  const [verifyDraft, setVerifyDraft] = useState({
    verificationType: "visual_inspection",
    result: "passed",
    notes: "",
    returnToService: true,
    leakageObserved: false,
    opensAndCloses: true,
    capsSecure: true,
  });
  const [offlineDrafts, setOfflineDrafts] = useState([]);
  const [online, setOnline] = useState(() => isBrowserOnline());

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };
  const departmentName = profile?.displayTitle || profile?.name || profile?.shortName || "";

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextReports, tenantHydrants, staticHydrants, nextCompanies] = await Promise.all([
        listHydrantDamageReports(departmentId),
        loadTenantHydrantRecords(departmentId),
        loadStaticHydrants(departmentId),
        listWaterCompanies(departmentId),
      ]);
      setReports(nextReports);
      setCompanies(nextCompanies.filter((row) => row.active !== false));
      const merged = [...tenantHydrants];
      const seen = new Set(merged.map((row) => row.location_id || row.id));
      for (const row of staticHydrants) {
        const key = row.location_id || row.id;
        if (!seen.has(key)) merged.push(row);
      }
      setHydrants(merged);
      setSelectedId((current) => current || nextReports[0]?.id || "");
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load damage reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  useEffect(() => {
    if (!departmentId) return;
    setOfflineDrafts(listOfflineDamageDrafts(departmentId));
  }, [departmentId, reports.length, message]);

  useEffect(() => {
    function refreshOnline() {
      setOnline(isBrowserOnline());
    }
    window.addEventListener("online", refreshOnline);
    window.addEventListener("offline", refreshOnline);
    return () => {
      window.removeEventListener("online", refreshOnline);
      window.removeEventListener("offline", refreshOnline);
    };
  }, []);

  useEffect(() => {
    if (!departmentId || !allowed || !online) return;
    const queued = listOfflineDamageDrafts(departmentId);
    if (!queued.length) return;
    let cancelled = false;
    (async () => {
      const result = await syncOfflineDamageDrafts(departmentId, {
        createReport: createHydrantDamageReport,
        updateReport: updateHydrantDamageReport,
      }, actor);
      if (cancelled) return;
      setOfflineDrafts(listOfflineDamageDrafts(departmentId));
      if (result.succeeded) {
        setMessage(`Synced ${result.succeeded} offline draft${result.succeeded === 1 ? "" : "s"}.`);
        await reload();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, online]);

  useEffect(() => {
    const selected = reports.find((row) => row.id === selectedId) || null;
    setDraft(selected ? { ...selected } : null);
  }, [reports, selectedId]);

  useEffect(() => {
    if (!departmentId || !canCreate) return;
    let preselect = "";
    try {
      preselect = sessionStorage.getItem(HYDRANT_DAMAGE_PRESELECT_KEY) || "";
      if (preselect) sessionStorage.removeItem(HYDRANT_DAMAGE_PRESELECT_KEY);
    } catch {
      preselect = "";
    }
    if (!preselect) return;
    const hydrant = hydrants.find((row) =>
      [row.location_id, row.hydrant_id, row.id].includes(preselect)
    );
    if (!hydrant) return;
    (async () => {
      setSaving(true);
      try {
        const created = await createHydrantDamageReport(departmentId, {
          hydrant,
          sourceType: "hydrant_record",
        }, actor);
        setReports((current) => [created, ...current]);
        setSelectedId(created.id);
        setMessage(`Draft ${created.reportNumber} created for ${created.hydrantLabel}.`);
      } catch (createError) {
        setError(createError?.message || "Unable to create damage report.");
      } finally {
        setSaving(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, hydrants.length, canCreate]);

  const visible = useMemo(() => {
    const queued = filterDamageReportsByQueue(reports, queueId);
    const q = search.trim().toLowerCase();
    if (!q) return queued;
    return queued.filter((row) =>
      [row.reportNumber, row.hydrantLabel, row.hydrantAddress, row.waterCompanyName, row.statusLabel, row.severityLabel]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [reports, queueId, search]);

  const slaSummary = useMemo(() => summarizeSlaQueue(reports), [reports]);
  const draftSla = useMemo(() => (draft ? getSlaSnapshot(draft) : null), [draft]);
  const escalateGate = useMemo(() => (draft ? canEscalateDamageReport(draft) : { ok: false }), [draft]);

  async function handleCreateBlank() {
    if (!canCreate) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await createHydrantDamageReport(departmentId, {
        sourceType: "manual",
        description: "",
      }, actor);
      setReports((current) => [created, ...current]);
      setSelectedId(created.id);
      setMessage(`Draft ${created.reportNumber} created.`);
    } catch (createError) {
      setError(createError?.message || "Unable to create report.");
    } finally {
      setSaving(false);
    }
  }

  async function handleIssueFromOutOfService(hydrant) {
    if (!canCreate || !hydrant) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await createHydrantDamageReport(departmentId, {
        hydrant,
        sourceType: "hydrant_record",
        operationalStatus: isOutOfServiceHydrant(hydrant) ? "out_of_service" : undefined,
        description: `Out-of-service hydrant ${hydrantRecordKey(hydrant)} selected from current inventory.`,
      }, actor);
      setReports((current) => [created, ...current]);
      setSelectedId(created.id);
      setMessage(`Draft ${created.reportNumber} created for OOS hydrant ${created.hydrantLabel}.`);
    } catch (createError) {
      setError(createError?.message || "Unable to create damage report for hydrant.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignHydrant(hydrantKey) {
    if (!canEdit || !draft?.id || !hydrantKey) return;
    const hydrant = hydrants.find((row) =>
      [row.location_id, row.hydrant_id, row.id].includes(hydrantKey)
    );
    if (!hydrant) return;
    setSaving(true);
    setError("");
    try {
      const resolution = await resolveWaterCompanyForHydrant(departmentId, hydrant);
      const company = resolution.company;
      const district = resolution.district;
      const ownershipNeeded = !company || resolution.requiresConfirmation;
      const recipients = [];
      if (company?.damageReportEmail) {
        recipients.push({
          email: company.damageReportEmail,
          name: company.legalName,
          role: "damage_report",
          required: true,
        });
      }
      const patch = {
        hydrantId: hydrant.location_id || hydrant.hydrant_id || hydrant.id || "",
        hydrantLabel: hydrant.location_id || hydrant.hydrant_id || hydrant.id || "",
        hydrantAddress: hydrant.address || hydrant.full_address || "",
        waterCompanyId: company?.id || "",
        waterCompanyName: company?.legalName || hydrant.provider || hydrant.water_assoc || "",
        waterDistrictId: district?.id || "",
        waterDistrictName: district?.name || "",
        ownershipCandidates: resolution.candidates || [],
        ownershipReason: resolution.reason || "",
        assignmentSource: resolution.source,
        assignmentConfidence: resolution.confidence,
        recipientSnapshot: recipients,
        status: ownershipNeeded ? "ownership_review_required" : (draft.status === "ownership_review_required" ? "draft" : draft.status),
        operationalStatus: isOutOfServiceHydrant(hydrant) ? "out_of_service" : draft.operationalStatus,
      };
      const saved = await updateHydrantDamageReport(departmentId, draft.id, patch, actor);
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage("Hydrant assigned.");
    } catch (assignError) {
      setError(assignError?.message || "Unable to assign hydrant.");
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
      if (!isBrowserOnline() || !draft.id) {
        const savedOffline = saveOfflineDamageDraft(departmentId, {
          ...draft,
          id: draft.id || "",
        }, { localId: draft.localId });
        setOfflineDrafts(listOfflineDamageDrafts(departmentId));
        setDraft((current) => ({ ...current, localId: savedOffline.localId, offlineQueued: true }));
        setMessage("Saved offline draft. It will sync when you reconnect (email is never sent offline).");
        return;
      }
      const saved = await updateHydrantDamageReport(departmentId, draft.id, draft, actor);
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage("Damage report saved.");
    } catch (saveError) {
      if (!isBrowserOnline() || /network|offline|Failed to fetch/i.test(saveError?.message || "")) {
        const savedOffline = saveOfflineDamageDraft(departmentId, draft, { localId: draft.localId });
        setOfflineDrafts(listOfflineDamageDrafts(departmentId));
        setDraft((current) => ({ ...current, localId: savedOffline.localId, offlineQueued: true }));
        setMessage("Network unavailable — draft queued offline.");
      } else {
        setError(saveError?.message || "Unable to save report.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReadyToSend() {
    if (!canEdit || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateHydrantDamageReport(departmentId, draft.id, draft, actor);
      const saved = await markDamageReportReadyToSend(departmentId, draft.id, actor);
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage("Marked Ready to Send. Use Send on step 8 to deliver via server email.");
    } catch (readyError) {
      setError(readyError?.message || "Unable to mark ready.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!canSend || !draft?.id) return;
    if (!isBrowserOnline()) {
      setError("Cannot send email while offline. Save the draft and send after reconnecting.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateHydrantDamageReport(departmentId, draft.id, draft, actor);
      const saved = await sendHydrantDamageReport(departmentId, draft.id, {
        ...actor,
        departmentName,
      });
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage(`Email accepted by provider. Status: ${saved.emailStatusLabel}.`);
    } catch (sendError) {
      setError(sendError?.message || "Unable to send report.");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleAcknowledge() {
    if (!canAck || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await acknowledgeHydrantDamageReport(departmentId, draft.id, {
        ...ackDraft,
        utilityWorkOrderNumber: ackDraft.utilityWorkOrderNumber || draft.utilityWorkOrderNumber,
      }, actor);
      setReports((current) => [result.report, ...current.filter((row) => row.id !== result.report.id)]);
      setMessage("Acknowledgment recorded.");
      setAckDraft({
        acknowledgedByName: "",
        acknowledgedByEmail: "",
        utilityWorkOrderNumber: "",
        estimatedRepairAt: "",
        utilityNotes: "",
      });
    } catch (ackError) {
      setError(ackError?.message || "Unable to record acknowledgment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRepairUpdate(status) {
    if (!canAck || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await recordUtilityRepairUpdate(departmentId, draft.id, {
        utilityWorkOrderNumber: ackDraft.utilityWorkOrderNumber || draft.utilityWorkOrderNumber,
        repairStatus: status,
        utilityNotes: ackDraft.utilityNotes || "",
        estimatedRepairAt: ackDraft.estimatedRepairAt || "",
      }, actor);
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage(status === "completed" ? "Repair completed — queued for FD verification." : "Repair update recorded.");
    } catch (updateError) {
      setError(updateError?.message || "Unable to record repair update.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEscalate() {
    if (!canEscalate || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await escalateHydrantDamageReport(departmentId, draft.id, {
        notes: escalateNotes,
        notifySupervisor: true,
        channel: "internal_alert",
      }, actor);
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setEscalateNotes("");
      setMessage("Escalation recorded (internal alert + history). Reminder email can be sent separately.");
    } catch (escalateError) {
      setError(escalateError?.message || "Unable to escalate.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleSlaPause() {
    if (!canEscalate || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await setDamageReportSlaPaused(departmentId, draft.id, {
        paused: !draft.slaPaused,
        reason: draft.slaPaused ? "" : "Paused by operator",
      }, actor);
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage(saved.slaPaused ? "SLA paused." : "SLA resumed.");
    } catch (pauseError) {
      setError(pauseError?.message || "Unable to update SLA pause.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReadyForVerification() {
    if (!canAck || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await markReadyForVerification(departmentId, draft.id, {}, actor);
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage("Queued for fire-department verification.");
    } catch (readyError) {
      setError(readyError?.message || "Unable to queue verification.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    if (!canVerify || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await submitHydrantDamageVerification(departmentId, draft.id, verifyDraft, actor);
      setReports((current) => [result.report, ...current.filter((row) => row.id !== result.report.id)]);
      setMessage(`Verification ${result.verification.resultLabel}. Status: ${result.report.statusLabel}.`);
    } catch (verifyError) {
      setError(verifyError?.message || "Unable to submit verification.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReopen() {
    if (!canVerify || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await reopenHydrantDamageReport(departmentId, draft.id, {
        reason: "Reopened from damage reports workspace",
      }, actor);
      setReports((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage("Report reopened.");
    } catch (reopenError) {
      setError(reopenError?.message || "Unable to reopen report.");
    } finally {
      setSaving(false);
    }
  }

  const showAckPanel = draft && (
    ["awaiting_acknowledgment", "sent", "acknowledged", "repair_scheduled", "repair_in_progress", "repair_completed", "escalated"].includes(draft.status)
    || draft.emailStatus === "accepted"
  );
  const showVerifyPanel = draft && [
    "ready_for_verification",
    "verification_scheduled",
    "repair_completed",
    "temporary_repair_completed",
  ].includes(draft.status);
  const showReopen = draft && ["closed", "verified", "cancelled"].includes(draft.status);

  function handleCloseDraft() {
    setSelectedId("");
    setDraft(null);
  }

  return (
    <HydrantDamagePermissionGate allowed={allowed}>
      <HydrantDamageModuleLayout
        title={activeNavName || "Damage Reports"}
        description="Select out-of-service hydrants from current inventory to create and email damage reports to the responsible water company."
        activeNavName={activeNavName}
        onNavigate={onNavigate}
        actions={canCreate ? (
          <div className="occupancy-detail-actions">
            <button className="primary-button" type="button" disabled={saving} onClick={handleCreateBlank}>
              <CirclePlus size={14} /> New damage report
            </button>
            {canManageWaterCompanies(permissions, isCreator) ? (
              <button className="secondary-button" type="button" onClick={() => onNavigate?.("Water Company Directory")}>
                Water companies
              </button>
            ) : null}
            <button className="secondary-button" type="button" onClick={() => onNavigate?.("Water Districts")}>
              Water districts
            </button>
          </div>
        ) : null}
      >
        {loading ? <p className="occupancy-muted" role="status">Loading damage reports…</p> : null}
        {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
        {message ? <p className="occupancy-message" role="status">{message}</p> : null}
        {!online ? (
          <p className="occupancy-muted" role="status">
            You are offline. Drafts can be saved locally; email send is disabled until you reconnect.
          </p>
        ) : null}
        {offlineDrafts.length ? (
          <p className="occupancy-muted" role="status">
            {offlineDrafts.length} offline draft{offlineDrafts.length === 1 ? "" : "s"} queued for sync.
          </p>
        ) : null}

        {!loading ? (
          <>
            <div className="hydrant-damage-sla-strip" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
              <HydrantDamageStatusBadge status={slaSummary.overdue ? "overdue" : "ok"} label={`${slaSummary.overdue} overdue`} />
              <HydrantDamageStatusBadge status="awaiting_acknowledgment" label={`${slaSummary.awaitingAck} awaiting ack`} />
              <HydrantDamageStatusBadge status="ready_for_verification" label={`${slaSummary.readyVerify} ready to verify`} />
              <HydrantDamageStatusBadge status="paused" label={`${slaSummary.paused} SLA paused`} />
            </div>

            <section className="panel oos-hydrant-panel">
              <div className="panel-body">
                <OutOfServiceHydrantList
                  hydrants={hydrants}
                  reports={reports}
                  selectedKey={draft?.hydrantId || ""}
                  onSelect={(key) => {
                    if (draft && canEdit) {
                      handleAssignHydrant(key);
                      return;
                    }
                    const open = reports.find((row) =>
                      String(row.hydrantId || "") === key
                      && !["closed", "verified", "cancelled"].includes(String(row.status || ""))
                    );
                    if (open) setSelectedId(open.id);
                  }}
                  onIssueReport={canCreate ? handleIssueFromOutOfService : undefined}
                  canCreate={canCreate}
                  saving={saving}
                />
              </div>
            </section>

          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><strong>Queue</strong></div>
                <label className="config-inline-search">
                  <Search size={14} aria-hidden />
                  <input
                    placeholder="Filter"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
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
                        <strong>{item.reportNumber}</strong>
                        <small>
                          {item.hydrantLabel || "No hydrant"} · {item.waterCompanyName || "No utility"} · {item.severityLabel}
                          {getSlaSnapshot(item).overdue ? " · SLA overdue" : ""}
                        </small>
                      </span>
                      <HydrantDamageStatusBadge
                        status={getSlaSnapshot(item).overdue ? "overdue" : item.status}
                        label={getSlaSnapshot(item).overdue ? "Overdue" : item.statusLabel}
                      />
                    </button>
                  ))}
                  {!visible.length ? <p className="occupancy-muted">No reports in this queue.</p> : null}
                </div>
              </div>
            </section>

            {draft ? (
              <section className="panel">
                <header>
                  <div>
                    <strong>{draft.reportNumber}</strong>
                    <span className="occupancy-muted" style={{ marginLeft: 8 }}>
                      {draft.statusLabel} · {draft.emailStatusLabel}
                    </span>
                    {draftSla ? (
                      <span style={{ marginLeft: 8 }}>
                        <HydrantDamageStatusBadge status={draftSla.level} label={draftSla.label} />
                      </span>
                    ) : null}
                  </div>
                  <button className="secondary-button" type="button" onClick={handleCloseDraft}>
                    <ArrowLeft size={14} /> Back
                  </button>
                </header>
                <div className="panel-body">
                  {draftSla?.reasons?.length ? (
                    <p className="occupancy-muted">{draftSla.reasons.join(" · ")}</p>
                  ) : null}
                  <HydrantDamageWizard
                    draft={draft}
                    setDraft={setDraft}
                    hydrants={hydrants}
                    companies={companies}
                    reports={reports}
                    canEdit={canEdit}
                    canSend={canSend}
                    saving={saving}
                    departmentName={departmentName}
                    onSave={handleSave}
                    onReadyToSend={handleReadyToSend}
                    onSend={handleSend}
                    onAssignHydrant={handleAssignHydrant}
                    onClose={handleCloseDraft}
                  />
                  {canEscalate && draft.status !== "draft" && draft.status !== "ownership_review_required" ? (
                    <div className="occupancy-form-grid" style={{ marginTop: 18, borderTop: "1px solid var(--rms-border)", paddingTop: 14 }}>
                      <div className="config-field wide">
                        <span>SLA / escalation</span>
                        <p className="occupancy-muted">
                          Escalations are recorded with rate limiting (4h). This does not fake an email send.
                        </p>
                      </div>
                      <label className="config-field wide">
                        <span>Escalation notes</span>
                        <textarea
                          rows={2}
                          value={escalateNotes}
                          onChange={(e) => setEscalateNotes(e.target.value)}
                          placeholder="Why escalate / who was notified"
                        />
                      </label>
                      <div className="occupancy-detail-actions">
                        <button
                          className="primary-button"
                          type="button"
                          disabled={saving || !escalateGate.ok}
                          title={escalateGate.reason || ""}
                          onClick={handleEscalate}
                        >
                          Escalate
                        </button>
                        <button className="secondary-button" type="button" disabled={saving} onClick={handleToggleSlaPause}>
                          {draft.slaPaused ? "Resume SLA" : "Pause SLA"}
                        </button>
                        {!escalateGate.ok ? <span className="occupancy-muted">{escalateGate.reason}</span> : null}
                      </div>
                      {(draft.escalationHistory || []).length ? (
                        <p className="occupancy-muted">
                          Last escalation: {new Date(draft.escalationHistory[0].at).toLocaleString()}
                          {draft.escalationHistory[0].notes ? ` — ${draft.escalationHistory[0].notes}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {showAckPanel && canAck ? (
                    <div className="occupancy-form-grid" style={{ marginTop: 18, borderTop: "1px solid var(--rms-border)", paddingTop: 14 }}>
                      <div className="config-field wide">
                        <span>Utility acknowledgment / repair updates</span>
                        <p className="occupancy-muted">
                          Record acknowledgment from the water company (phone/email reply). Completing repair queues FD verification (does not auto-close).
                        </p>
                      </div>
                      <label className="config-field">
                        <span>Acknowledged by</span>
                        <input
                          value={ackDraft.acknowledgedByName}
                          onChange={(e) => setAckDraft((c) => ({ ...c, acknowledgedByName: e.target.value }))}
                          placeholder="Utility contact name"
                        />
                      </label>
                      <label className="config-field">
                        <span>Contact email</span>
                        <input
                          value={ackDraft.acknowledgedByEmail}
                          onChange={(e) => setAckDraft((c) => ({ ...c, acknowledgedByEmail: e.target.value }))}
                        />
                      </label>
                      <label className="config-field">
                        <span>Work order #</span>
                        <input
                          value={ackDraft.utilityWorkOrderNumber || draft.utilityWorkOrderNumber || ""}
                          onChange={(e) => setAckDraft((c) => ({ ...c, utilityWorkOrderNumber: e.target.value }))}
                        />
                      </label>
                      <label className="config-field">
                        <span>Est. repair</span>
                        <input
                          type="datetime-local"
                          value={(ackDraft.estimatedRepairAt || "").slice(0, 16)}
                          onChange={(e) => setAckDraft((c) => ({ ...c, estimatedRepairAt: e.target.value ? new Date(e.target.value).toISOString() : "" }))}
                        />
                      </label>
                      <label className="config-field wide">
                        <span>Utility notes</span>
                        <textarea
                          rows={2}
                          value={ackDraft.utilityNotes}
                          onChange={(e) => setAckDraft((c) => ({ ...c, utilityNotes: e.target.value }))}
                        />
                      </label>
                      <div className="occupancy-detail-actions">
                        <button className="primary-button" type="button" disabled={saving} onClick={handleAcknowledge}>
                          Record acknowledgment
                        </button>
                        <button className="secondary-button" type="button" disabled={saving} onClick={() => handleRepairUpdate("scheduled")}>
                          Repair scheduled
                        </button>
                        <button className="secondary-button" type="button" disabled={saving} onClick={() => handleRepairUpdate("in_progress")}>
                          In progress
                        </button>
                        <button className="secondary-button" type="button" disabled={saving} onClick={() => handleRepairUpdate("completed")}>
                          Repair completed
                        </button>
                        <button className="secondary-button" type="button" disabled={saving} onClick={handleReadyForVerification}>
                          Ready for verification
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {showVerifyPanel && canVerify ? (
                    <div className="occupancy-form-grid" style={{ marginTop: 18, borderTop: "1px solid var(--rms-border)", paddingTop: 14 }}>
                      <div className="config-field wide">
                        <span>Fire department verification</span>
                        <p className="occupancy-muted">
                          Utility completion does not close the report. Pass to return to service, or fail to reopen repair.
                        </p>
                      </div>
                      <label className="config-field">
                        <span>Verification type</span>
                        <select
                          value={verifyDraft.verificationType}
                          onChange={(e) => setVerifyDraft((c) => ({ ...c, verificationType: e.target.value }))}
                        >
                          {getVerificationTypeOptions().map((row) => (
                            <option key={row.id} value={row.id}>{row.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="config-field">
                        <span>Result</span>
                        <select
                          value={verifyDraft.result}
                          onChange={(e) => setVerifyDraft((c) => ({ ...c, result: e.target.value }))}
                        >
                          {getVerificationResultOptions().map((row) => (
                            <option key={row.id} value={row.id}>{row.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={verifyDraft.returnToService}
                          onChange={(e) => setVerifyDraft((c) => ({ ...c, returnToService: e.target.checked }))}
                        />
                        <span>Return to service on pass</span>
                      </label>
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={verifyDraft.leakageObserved}
                          onChange={(e) => setVerifyDraft((c) => ({ ...c, leakageObserved: e.target.checked }))}
                        />
                        <span>Leakage observed</span>
                      </label>
                      <label className="config-field wide">
                        <span>Notes</span>
                        <textarea
                          rows={2}
                          value={verifyDraft.notes}
                          onChange={(e) => setVerifyDraft((c) => ({ ...c, notes: e.target.value }))}
                        />
                      </label>
                      <div className="occupancy-detail-actions">
                        <button className="primary-button" type="button" disabled={saving} onClick={handleVerify}>
                          Submit verification
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {showReopen && canVerify ? (
                    <div className="occupancy-detail-actions" style={{ marginTop: 14 }}>
                      <button className="secondary-button" type="button" disabled={saving} onClick={handleReopen}>
                        Reopen report
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="panel">
                <div className="panel-body">
                  <p className="occupancy-muted">Select a report or create a new damage report.</p>
                </div>
              </section>
            )}
          </section>
          </>
        ) : null}
      </HydrantDamageModuleLayout>
    </HydrantDamagePermissionGate>
  );
}
