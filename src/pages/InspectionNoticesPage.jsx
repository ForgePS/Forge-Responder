import { useEffect, useMemo, useState } from "react";
import {
  CirclePlus,
  FileText,
  Printer,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout from "../components/inspections/InspectionsModuleLayout.jsx";
import {
  buildNoticeQueueMetrics,
  canEditInspectionNotices,
  canViewInspectionNotices,
  ensureDocumentTemplatesSeeded,
  generateNoticeFromInspection,
  getDeliveryChannelOptions,
  getNoticeDocumentTypeOptions,
  issueCertificateFromNotice,
  issueInspectionNotice,
  labelForDeliveryStatus,
  labelForNoticeStatus,
  listInspectionCertificates,
  listInspectionNotices,
  listNoticeDeliveries,
  listInspectionRecords,
  printNoticeRecord,
  recordNoticeDelivery,
  updateInspectionNotice,
} from "../lib/inspections/index.js";

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

export default function InspectionNoticesPage({
  query = "",
  onNavigate,
  inspectionId = "",
  embedded = false,
}) {
  const { departmentId, profile } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewInspectionNotices(permissions, isCreator);
  const canEdit = canEditInspectionNotices(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notices, setNotices] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createInspectionId, setCreateInspectionId] = useState(inspectionId || "");
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [deliveryChannel, setDeliveryChannel] = useState("print");
  const [deliveryRecipient, setDeliveryRecipient] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftRecipient, setDraftRecipient] = useState("");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const documentTypes = getNoticeDocumentTypeOptions();
  const channels = getDeliveryChannelOptions();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextTemplates = await ensureDocumentTemplatesSeeded(departmentId, actor);
      const [nextNotices, nextCerts, nextInspections] = await Promise.all([
        listInspectionNotices(departmentId, {
          inspectionId: inspectionId || undefined,
          openOnly: !inspectionId,
        }),
        listInspectionCertificates(departmentId, {
          inspectionId: inspectionId || undefined,
        }),
        inspectionId ? Promise.resolve([]) : listInspectionRecords(departmentId, {}),
      ]);
      setTemplates(nextTemplates);
      setNotices(nextNotices);
      setCertificates(nextCerts);
      setInspections(Array.isArray(nextInspections) ? nextInspections : []);
      setCreateTemplateId((current) => current || nextTemplates[0]?.id || "");
      setCreateInspectionId((current) => current || inspectionId || nextInspections[0]?.id || "");
      const openId = typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("forge-open-notice-id")
        : "";
      if (openId && nextNotices.some((row) => row.id === openId)) {
        setSelectedId(openId);
        sessionStorage.removeItem("forge-open-notice-id");
      } else {
        setSelectedId((current) => current || nextNotices[0]?.id || "");
      }
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load notices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, inspectionId]);

  const selected = useMemo(
    () => notices.find((row) => row.id === selectedId) || null,
    [notices, selectedId]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadDeliveries() {
      if (!departmentId || !selected?.id) {
        setDeliveries([]);
        return;
      }
      try {
        const rows = await listNoticeDeliveries(departmentId, selected.id);
        if (!cancelled) setDeliveries(rows);
      } catch {
        if (!cancelled) setDeliveries([]);
      }
    }
    loadDeliveries();
    setDraftSummary(selected?.summary || "");
    setDraftRecipient(selected?.recipientName || "");
    setDeliveryRecipient(selected?.recipientName || selected?.recipientEmail || "");
    return () => { cancelled = true; };
  }, [departmentId, selected?.id, selected?.updatedAt]);

  const visible = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return notices;
    return notices.filter((row) => (
      [row.noticeNumber, row.title, row.occupancyName, row.address, row.status, row.documentTypeId]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ));
  }, [notices, query]);

  const metrics = useMemo(
    () => buildNoticeQueueMetrics(notices, certificates),
    [notices, certificates]
  );

  function upsertNotice(next) {
    setNotices((current) => [next, ...current.filter((row) => row.id !== next.id)]);
    setSelectedId(next.id);
  }

  async function handleGenerate() {
    if (!canEdit || !createInspectionId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const template = templates.find((row) => row.id === createTemplateId);
      const created = await generateNoticeFromInspection(departmentId, createInspectionId, {
        templateId: createTemplateId,
        documentTypeId: template?.documentTypeId,
      }, actor);
      upsertNotice(created);
      setShowCreate(false);
      setMessage(`Created ${created.noticeNumber}`);
    } catch (createError) {
      setError(createError?.message || "Unable to generate notice.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    if (!selected || !canEdit) return;
    setSaving(true);
    setError("");
    try {
      const next = await updateInspectionNotice(departmentId, selected.id, {
        summary: draftSummary,
        recipientName: draftRecipient,
        status: selected.status === "draft" ? "ready" : selected.status,
      }, actor);
      upsertNotice(next);
      setMessage("Notice updated.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save notice.");
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue() {
    if (!selected || !canEdit) return;
    setSaving(true);
    setError("");
    try {
      const next = await issueInspectionNotice(departmentId, selected.id, actor);
      upsertNotice(next);
      setMessage("Notice issued.");
    } catch (issueError) {
      setError(issueError?.message || "Unable to issue notice.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePrint() {
    if (!selected) return;
    printNoticeRecord(selected, {
      departmentName: profile?.name || profile?.displayTitle || "",
    });
    if (canEdit) {
      setSaving(true);
      try {
        const result = await recordNoticeDelivery(departmentId, selected.id, {
          channel: "print",
          status: "printed",
          recipientName: draftRecipient || selected.recipientName,
          departmentName: profile?.name || "",
          openPrint: false,
        }, actor);
        upsertNotice(result.notice);
        setDeliveries((current) => [result.delivery, ...current]);
        setMessage("Print recorded.");
      } catch (printError) {
        setError(printError?.message || "Printed locally; delivery record failed.");
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleDelivery() {
    if (!selected || !canEdit) return;
    setSaving(true);
    setError("");
    try {
      const result = await recordNoticeDelivery(departmentId, selected.id, {
        channel: deliveryChannel,
        recipientName: deliveryRecipient || selected.recipientName,
        recipientEmail: selected.recipientEmail,
        recipientPhone: selected.recipientPhone,
        departmentName: profile?.name || "",
        openPrint: deliveryChannel === "print",
      }, actor);
      upsertNotice(result.notice);
      setDeliveries((current) => [result.delivery, ...current]);
      setMessage(`Delivery recorded (${labelForDeliveryStatus(result.delivery.status)}).`);
    } catch (deliveryError) {
      setError(deliveryError?.message || "Unable to record delivery.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCertificate() {
    if (!selected || !canEdit) return;
    setSaving(true);
    setError("");
    try {
      const result = await issueCertificateFromNotice(departmentId, selected.id, actor);
      upsertNotice(result.notice);
      setCertificates((current) => [result.certificate, ...current.filter((row) => row.id !== result.certificate.id)]);
      setMessage(`Certificate ${result.certificate.certificateNumber} issued.`);
    } catch (certError) {
      setError(certError?.message || "Unable to issue certificate.");
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <>
      {error ? <p className="occupancy-error">{error}</p> : null}
      {message ? <p className="occupancy-message">{message}</p> : null}
      {loading ? <p className="occupancy-muted">Loading notices…</p> : null}

      {!loading && !embedded ? (
        <div className="inspections-kpi-grid">
          {[
            ["Notices", metrics.total],
            ["Draft / ready", metrics.draft],
            ["Issued", metrics.issued],
            ["Delivered", metrics.delivered],
            ["Certificates", metrics.certificates],
          ].map(([label, value]) => (
            <div key={label} className="inspections-kpi-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && showCreate && canEdit ? (
        <section className="panel">
          <header>
            <div><CirclePlus size={15} /><strong>Generate notice</strong></div>
            <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          </header>
          <div className="panel-body occupancy-form-grid">
            {!inspectionId ? (
              <Field label="Inspection" wide>
                <select value={createInspectionId} onChange={(e) => setCreateInspectionId(e.target.value)}>
                  {inspections.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.inspectionNumber} — {row.occupancyName || "No occupancy"}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Template" wide>
              <select value={createTemplateId} onChange={(e) => setCreateTemplateId(e.target.value)}>
                {templates.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </Field>
            <button className="primary-button" type="button" disabled={saving || !createInspectionId} onClick={handleGenerate}>
              {saving ? "Generating…" : "Generate"}
            </button>
          </div>
        </section>
      ) : null}

      {!loading ? (
        <div className="personnel-workspace occupancy-workspace">
          <section className="panel">
            <header>
              <div><FileText size={15} /><strong>Notices</strong></div>
              <span className="inspections-count">{visible.length}</span>
            </header>
            <div className="panel-body">
              {!visible.length ? (
                <InspectionEmptyState
                  title="No notices yet"
                  description="Generate an inspection report, NOV, or certificate from an inspection or violation."
                  action={canEdit ? (
                    <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
                      Generate notice
                    </button>
                  ) : null}
                />
              ) : (
                <div className="personnel-list">
                  {visible.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={row.id === selected?.id ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <span>
                        <strong>{row.noticeNumber}</strong>
                        <small className="occupancy-muted"> {row.occupancyName || row.title}</small>
                      </span>
                      <InspectionStatusBadge status={labelForNoticeStatus(row.status)} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {selected ? (
            <section className="panel occupancy-detail-panel">
              <header>
                <div>
                  <ShieldCheck size={15} />
                  <strong>{selected.noticeNumber}</strong>
                  <small className="occupancy-muted"> {selected.title}</small>
                </div>
                <div className="occupancy-detail-actions">
                  <InspectionStatusBadge status={labelForNoticeStatus(selected.status)} />
                  <button className="secondary-button" type="button" onClick={handlePrint} disabled={saving}>
                    <Printer size={14} /> Print / PDF
                  </button>
                </div>
              </header>
              <div className="panel-body occupancy-detail-body">
                <div className="occupancy-form-grid">
                  <div><span className="occupancy-muted">Type</span><strong>{documentTypes.find((t) => t.id === selected.documentTypeId)?.label || selected.documentTypeId}</strong></div>
                  <div><span className="occupancy-muted">Occupancy</span><strong>{selected.occupancyName || "—"}</strong></div>
                  <div><span className="occupancy-muted">Address</span><strong>{selected.address || "—"}</strong></div>
                  <div><span className="occupancy-muted">Inspection</span><strong>{selected.inspectionNumber || "—"}</strong></div>
                  <div><span className="occupancy-muted">Issued</span><strong>{formatDate(selected.issuedAt)}</strong></div>
                  <div><span className="occupancy-muted">Last delivery</span><strong>{labelForDeliveryStatus(selected.lastDeliveryStatus) || "—"}</strong></div>
                </div>

                <Field label="Recipient">
                  <input
                    value={draftRecipient}
                    disabled={!canEdit}
                    onChange={(e) => setDraftRecipient(e.target.value)}
                  />
                </Field>
                <Field label="Summary" wide>
                  <textarea
                    rows={3}
                    value={draftSummary}
                    disabled={!canEdit}
                    onChange={(e) => setDraftSummary(e.target.value)}
                  />
                </Field>

                {selected.violationsSnapshot?.length ? (
                  <div className="template-section-card">
                    <strong>Violations snapshot ({selected.violationsSnapshot.length})</strong>
                    <ul className="occupancy-muted">
                      {selected.violationsSnapshot.map((row) => (
                        <li key={row.id || row.name}>{row.name || row.codeCitation} — {row.status}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {canEdit ? (
                  <div className="occupancy-detail-actions">
                    <button className="secondary-button" type="button" disabled={saving} onClick={handleSaveDraft}>
                      <Save size={14} /> Save
                    </button>
                    {["draft", "ready"].includes(selected.status) ? (
                      <button className="primary-button" type="button" disabled={saving} onClick={handleIssue}>
                        Issue
                      </button>
                    ) : null}
                    <button className="secondary-button" type="button" disabled={saving} onClick={handleCertificate}>
                      Issue certificate
                    </button>
                  </div>
                ) : null}

                {canEdit ? (
                  <div className="occupancy-form-grid" style={{ marginTop: "1rem" }}>
                    <Field label="Delivery channel">
                      <select value={deliveryChannel} onChange={(e) => setDeliveryChannel(e.target.value)}>
                        {channels.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Delivery recipient">
                      <input value={deliveryRecipient} onChange={(e) => setDeliveryRecipient(e.target.value)} />
                    </Field>
                    <button className="primary-button" type="button" disabled={saving} onClick={handleDelivery}>
                      <Send size={14} /> Record delivery
                    </button>
                  </div>
                ) : null}

                {deliveries.length ? (
                  <div className="template-section-card">
                    <strong>Delivery history</strong>
                    <div className="cert-table">
                      <div className="cert-row cert-head">
                        <span>Channel</span>
                        <span>Status</span>
                        <span>Recipient</span>
                        <span>When</span>
                      </div>
                      {deliveries.map((row) => (
                        <div className="cert-row" key={row.id}>
                          <span>{row.channel}</span>
                          <span>{labelForDeliveryStatus(row.status)}</span>
                          <span>{row.recipientName || row.recipientEmail || "—"}</span>
                          <span>{formatDate(row.sentAt || row.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {!loading && !embedded && certificates.length ? (
        <section className="panel">
          <header>
            <div><ShieldCheck size={15} /><strong>Certificates</strong></div>
          </header>
          <div className="panel-body">
            <div className="cert-table">
              <div className="cert-row cert-head">
                <span>Number</span>
                <span>Title</span>
                <span>Occupancy</span>
                <span>Issued</span>
              </div>
              {certificates.map((row) => (
                <div className="cert-row" key={row.id}>
                  <strong>{row.certificateNumber}</strong>
                  <span>{row.title}</span>
                  <span>{row.occupancyName || "—"}</span>
                  <span>{formatDate(row.issuedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <InspectionPermissionGate allowed={allowed} title="Notices">
        <div className="inspection-notices-embed">
          <div className="occupancy-detail-actions" style={{ marginBottom: "0.75rem" }}>
            <strong>Notices & certificates</strong>
            {canEdit ? (
              <button className="secondary-button" type="button" onClick={() => setShowCreate(true)}>
                <CirclePlus size={14} /> Generate
              </button>
            ) : null}
          </div>
          {body}
        </div>
      </InspectionPermissionGate>
    );
  }

  return (
    <InspectionPermissionGate allowed={allowed} title="Notices & Certificates">
      <InspectionsModuleLayout
        title="Notices & Certificates"
        description="Inspection reports, notices of violation, delivery tracking, and certificates."
        activeNavName="Notices & Certificates"
        onNavigate={onNavigate}
        tabs={[
          { id: "notices", label: "Notices & Certificates", navName: "Notices & Certificates" },
          { id: "violations", label: "Open Violations", navName: "Open Violations" },
          { id: "queue", label: "Work Queue", navName: "Work Queue" },
        ]}
        actions={canEdit ? (
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
            <CirclePlus size={14} /> Generate notice
          </button>
        ) : null}
      >
        {body}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
