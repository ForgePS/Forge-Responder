import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CirclePlus, FileText, Save, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import {
  addViolationEvidence,
  canEditInspectionNotices,
  canEditInspectionsModule,
  canViewViolations,
  closeViolation,
  createViolation,
  ensureCodeLibrarySeeded,
  ensureViolationCatalogSeeded,
  escalateViolation,
  extendViolationDeadline,
  generateNoticeFromViolation,
  listViolations,
} from "../lib/inspections/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
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

export default function ViolationsPage({ query = "", inspectionId = "", embedded = false, onChanged, onNavigate }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewViolations(permissions, isCreator);
  const canEdit = canEditInspectionsModule(permissions, isCreator)
    || Boolean(permissions?.editViolations)
    || isCreator;
  const canGenerateNotice = canEditInspectionNotices(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createCatalogId, setCreateCatalogId] = useState("");
  const [createLocation, setCreateLocation] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [extensionDueAt, setExtensionDueAt] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [closureNotes, setClosureNotes] = useState("");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await ensureCodeLibrarySeeded(departmentId, actor);
      const nextCatalog = await ensureViolationCatalogSeeded(departmentId, actor);
      const nextRecords = await listViolations(departmentId, {
        openOnly: !inspectionId,
        inspectionId: inspectionId || undefined,
      });
      setCatalog(nextCatalog);
      setRecords(nextRecords);
      setSelectedId((current) => current || nextRecords[0]?.id || "");
      setCreateCatalogId(nextCatalog[0]?.id || "");
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load violations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, inspectionId]);

  const selected = useMemo(
    () => records.find((row) => row.id === selectedId) || null,
    [records, selectedId]
  );

  const visible = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return records;
    return records.filter((row) => (
      [row.name, row.occupancyName, row.address, row.codeCitation, row.status, row.severity]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ));
  }, [records, query]);

  function upsert(next) {
    setRecords((current) => [next, ...current.filter((row) => row.id !== next.id)]);
    setSelectedId(next.id);
  }

  async function handleCreate() {
    if (!canEdit || !createCatalogId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await createViolation(departmentId, {
        catalogItemId: createCatalogId,
        inspectionId: inspectionId || undefined,
        locationOnProperty: createLocation,
      }, actor);
      upsert(created);
      setShowCreate(false);
      setCreateLocation("");
      setMessage("Violation issued.");
      onChanged?.(created);
      if (!inspectionId) await reload();
    } catch (createError) {
      setError(createError?.message || "Unable to create violation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExtend() {
    if (!selected || !extensionDueAt) return;
    setSaving(true);
    setError("");
    try {
      const next = await extendViolationDeadline(departmentId, selected.id, {
        dueAt: extensionDueAt,
        reason: extensionReason,
      }, actor);
      upsert(next);
      setMessage("Deadline extended.");
      setExtensionReason("");
      onChanged?.(next);
    } catch (extendError) {
      setError(extendError?.message || "Unable to extend deadline.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEvidence(asCorrection = false) {
    if (!selected || !evidenceNotes.trim()) return;
    setSaving(true);
    setError("");
    try {
      const next = await addViolationEvidence(departmentId, selected.id, {
        type: "note",
        label: asCorrection ? "Correction evidence" : "Inspector evidence",
        notes: evidenceNotes.trim(),
        asCorrection,
      }, actor);
      upsert(next);
      setEvidenceNotes("");
      setMessage(asCorrection ? "Correction evidence recorded." : "Evidence added.");
      onChanged?.(next);
    } catch (evidenceError) {
      setError(evidenceError?.message || "Unable to add evidence.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClose(status = "closed") {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const next = await closeViolation(departmentId, selected.id, {
        status,
        closureNotes,
      }, actor);
      upsert(next);
      setMessage(status === "dismissed" ? "Violation dismissed." : "Violation closed.");
      onChanged?.(next);
    } catch (closeError) {
      setError(closeError?.message || "Unable to close violation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateNotice() {
    if (!selected || !canGenerateNotice) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const notice = await generateNoticeFromViolation(departmentId, selected.id, {}, actor);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("forge-open-notice-id", notice.id);
      }
      setMessage(`Notice ${notice.noticeNumber} created.`);
      onNavigate?.("Notices & Certificates");
      onChanged?.(selected);
    } catch (noticeError) {
      setError(noticeError?.message || "Unable to generate notice.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEscalate() {
    if (!selected) return;
    setSaving(true);
    try {
      const next = await escalateViolation(departmentId, selected.id, actor);
      upsert(next);
      setMessage("Violation escalated.");
      onChanged?.(next);
    } catch (escalateError) {
      setError(escalateError?.message || "Unable to escalate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={allowed}>
      <div className={`module-page violations-page${embedded ? " embedded" : ""}`}>
        {!embedded ? (
          <section className="module-heading">
            <div>
              <span className="module-icon"><ShieldAlert size={22} /></span>
              <div>
                <h1>{inspectionId ? "Inspection violations" : "Open Violations"}</h1>
                <p>Code citations, deadlines, evidence, and closure tracking.</p>
              </div>
            </div>
            {canEdit ? (
              <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
                <CirclePlus size={14} /> Issue violation
              </button>
            ) : null}
          </section>
        ) : (
          <div className="occupancy-detail-actions" style={{ marginBottom: "0.75rem" }}>
            <strong>Violations</strong>
            {canEdit ? (
              <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
                <CirclePlus size={14} /> Issue violation
              </button>
            ) : null}
          </div>
        )}

        {loading ? <div className="inspections-loading-state" role="status"><p>Loading violations...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && !records.length ? (
          <InspectionEmptyState
            title="No violations"
            description="Issue a violation from the catalog during or after an inspection."
            icon={AlertTriangle}
          />
        ) : null}

        {!loading && records.length ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><AlertTriangle size={15} /><strong>Violations</strong></div>
                <span className="inspections-count">{visible.length}</span>
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
                        <strong>{item.name}</strong>
                        <small>
                          {item.occupancyName || "No occupancy"} · due {formatDate(item.dueAt)}
                          {item.immediateHazard ? " · IMMEDIATE" : ""}
                        </small>
                      </span>
                      <InspectionStatusBadge status={item.status} />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {selected ? (
              <section className="panel">
                <header>
                  <div><strong>{selected.name}</strong></div>
                  <InspectionStatusBadge status={selected.status} />
                </header>
                <div className="panel-body config-studio-body">
                  <div className="occupancy-form-grid">
                    <div><span className="occupancy-muted">Citation</span><strong>{selected.codeCitation || "—"}</strong></div>
                    <div><span className="occupancy-muted">Severity</span><strong>{selected.severity}</strong></div>
                    <div><span className="occupancy-muted">Occupancy</span><strong>{selected.occupancyName || "—"}</strong></div>
                    <div><span className="occupancy-muted">Inspection</span><strong>{selected.inspectionNumber || "—"}</strong></div>
                    <div><span className="occupancy-muted">Due</span><strong>{formatDate(selected.dueAt)}</strong></div>
                    <div><span className="occupancy-muted">Observed</span><strong>{formatDate(selected.observedAt)}</strong></div>
                  </div>

                  <p>{selected.description}</p>
                  {selected.correctiveAction ? (
                    <p><strong>Corrective action:</strong> {selected.correctiveAction}</p>
                  ) : null}
                  {selected.localAmendmentSnapshot?.summary ? (
                    <p className="occupancy-muted">
                      Local amendment: {selected.localAmendmentSnapshot.title} — {selected.localAmendmentSnapshot.summary}
                    </p>
                  ) : null}
                  {selected.locationOnProperty ? (
                    <p className="occupancy-muted">Location: {selected.locationOnProperty}</p>
                  ) : null}

                  {canEdit && !["closed", "dismissed"].includes(selected.status) ? (
                    <>
                      <div className="occupancy-form-grid">
                        <Field label="Extend due date">
                          <input type="date" value={extensionDueAt} onChange={(e) => setExtensionDueAt(e.target.value)} />
                        </Field>
                        <Field label="Extension reason">
                          <input value={extensionReason} onChange={(e) => setExtensionReason(e.target.value)} />
                        </Field>
                      </div>
                      <div className="occupancy-detail-actions">
                        <button className="secondary-button" type="button" disabled={saving || !extensionDueAt} onClick={handleExtend}>
                          Extend deadline
                        </button>
                        <button className="secondary-button" type="button" disabled={saving} onClick={handleEscalate}>
                          Escalate
                        </button>
                      </div>

                      <Field label="Evidence notes">
                        <textarea rows={3} value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} />
                      </Field>
                      <div className="occupancy-detail-actions">
                        <button className="secondary-button" type="button" disabled={saving || !evidenceNotes.trim()} onClick={() => handleEvidence(false)}>
                          Add evidence
                        </button>
                        <button className="secondary-button" type="button" disabled={saving || !evidenceNotes.trim()} onClick={() => handleEvidence(true)}>
                          Record correction evidence
                        </button>
                      </div>

                      <Field label="Closure notes">
                        <textarea rows={2} value={closureNotes} onChange={(e) => setClosureNotes(e.target.value)} />
                      </Field>
                      <div className="occupancy-detail-actions">
                        <button className="primary-button" type="button" disabled={saving} onClick={() => handleClose("closed")}>
                          <Save size={14} /> Close violation
                        </button>
                        <button className="secondary-button" type="button" disabled={saving} onClick={() => handleClose("dismissed")}>
                          Dismiss
                        </button>
                        {canGenerateNotice ? (
                          <button className="secondary-button" type="button" disabled={saving} onClick={handleGenerateNotice}>
                            <FileText size={14} /> Generate notice
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  <section className="occupancy-section">
                    <header><div><strong>Evidence</strong></div></header>
                    {(selected.evidence || []).length === 0 ? (
                      <p className="occupancy-muted">No evidence yet.</p>
                    ) : (
                      <ul className="occupancy-timeline">
                        {selected.evidence.map((item) => (
                          <li key={item.id}>
                            <strong>{item.label}</strong>
                            <small>
                              {item.addedAt ? new Date(item.addedAt).toLocaleString() : "—"}
                              {item.addedBy ? ` · ${item.addedBy}` : ""}
                            </small>
                            <p>{item.notes}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {(selected.extensionHistory || []).length ? (
                    <section className="occupancy-section">
                      <header><div><strong>Extension history</strong></div></header>
                      <ul className="occupancy-timeline">
                        {selected.extensionHistory.map((item, index) => (
                          <li key={`${item.at}-${index}`}>
                            <strong>{formatDate(item.previousDueAt)} → {formatDate(item.dueAt)}</strong>
                            <small>{item.reason || "No reason"} · {item.actorName || ""}</small>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {showCreate ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header>
                <strong>Issue violation</strong>
                <button type="button" onClick={() => setShowCreate(false)}>×</button>
              </header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Catalog item">
                  <select value={createCatalogId} onChange={(e) => setCreateCatalogId(e.target.value)}>
                    {catalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.codeCitation || "n/a"})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Location on property">
                  <input value={createLocation} onChange={(e) => setCreateLocation(e.target.value)} />
                </Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !createCatalogId} onClick={handleCreate}>
                  Issue
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </InspectionPermissionGate>
  );
}
