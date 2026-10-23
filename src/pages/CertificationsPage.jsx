import { useState } from "react";
import { FileCheck2, Upload, UploadCloud, X } from "lucide-react";
import ManagedSelect from "../components/ManagedSelect.jsx";
import { uploadFirebaseFile, deleteFirebaseFile } from "../lib/firebaseClient.js";
import { buildCertificationDocPath } from "../lib/storagePaths.js";
import { archiveObject, isObjectArchived, isObjectDeleted, isObjectVisibleInActiveList, isObjectVisibleInArchivedList, restoreObject, softDeleteObject } from "../lib/objectLifecycle.js";
import ObjectLifecycleActions from "../components/ObjectLifecycleActions.jsx";

import { Badge, Panel, Modal } from "../components/shell/ui.jsx";

export default function CertificationsPage({ query, records = [], setRecords, canEdit = false, departmentId = "" }) {
  const [filter, setFilter] = useState("All");
  const [lifecycleView, setLifecycleView] = useState("active");
  const [selected, setSelected] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [uploadDraft, setUploadDraft] = useState({ issue: "", expires: "", file: null });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");

  const scoped = records.filter((record) => !isObjectDeleted(record)).filter((record) => (
    lifecycleView === "archived" ? isObjectVisibleInArchivedList(record) : isObjectVisibleInActiveList(record)
  ));
  const filtered = scoped.filter((record) => (
    (filter === "All" || record.status === filter || record.category === filter)
    && Object.values(record).join(" ").toLowerCase().includes(query.toLowerCase())
  ));
  const activeRecords = records.filter((record) => isObjectVisibleInActiveList(record));
  const archivedCount = records.filter((record) => isObjectArchived(record)).length;

  function openUpload(record) {
    if (!canEdit || !record || isObjectArchived(record)) return;
    setUploading(record);
    setUploadDraft({
      issue: record.issue || "",
      expires: record.expires || "",
      file: null,
    });
  }

  function updateRenewal(id, renewal) {
    if (!canEdit) return;
    setRecords((current) => current.map((record) => record.id === id ? { ...record, renewal, status: renewal === "Approved" ? "Active" : record.status } : record));
    setMessage(`Renewal status updated to ${renewal}`);
  }

  async function completeUpload() {
    if (!canEdit || !uploading || !departmentId) return;
    if (!uploadDraft.file) {
      setMessage("Choose a credential file before uploading");
      return;
    }
    setBusy(true);
    try {
      const storagePath = buildCertificationDocPath(departmentId, uploading.id, uploadDraft.file.name);
      const uploaded = await uploadFirebaseFile(storagePath, uploadDraft.file);
      if (!uploaded?.downloadUrl) throw new Error("Upload failed");
      const issue = uploadDraft.issue || uploading.issue;
      const expires = uploadDraft.expires || uploading.expires;
      const days = expires
        ? Math.ceil((new Date(`${expires}T12:00:00`) - new Date()) / (1000 * 60 * 60 * 24))
        : uploading.days;
      setRecords((current) => current.map((record) => (
        record.id === uploading.id
          ? {
              ...record,
              issue,
              expires,
              days,
              document: uploadDraft.file.name,
              documentUrl: uploaded.downloadUrl,
              documentStoragePath: uploaded.storagePath,
              renewal: "Submitted",
              status: days < 0 ? "Expired" : record.status === "Expired" && days >= 0 ? "Active" : record.status,
            }
          : record
      )));
      setMessage("Certification document uploaded and renewal submitted");
      setUploading(null);
      setUploadDraft({ issue: "", expires: "", file: null });
    } catch (error) {
      console.error("Certification upload failed", error);
      setMessage("Certification upload failed — try again");
    } finally {
      setBusy(false);
    }
  }

  async function runLifecycle(record, action) {
    if (!canEdit || !record) return;
    setBusyId(record.id);
    try {
      if (action === "archive") {
        setRecords((current) => current.map((item) => item.id === record.id ? archiveObject(item) : item));
        if (selected?.id === record.id) setSelected(null);
        setMessage("Certification archived.");
      } else if (action === "restore") {
        setRecords((current) => current.map((item) => item.id === record.id ? restoreObject(item) : item));
        setLifecycleView("active");
        setMessage("Certification restored.");
      } else if (action === "delete") {
        if (record.documentStoragePath) await deleteFirebaseFile(record.documentStoragePath);
        setRecords((current) => current.map((item) => item.id === record.id ? softDeleteObject(item) : item));
        if (selected?.id === record.id) setSelected(null);
        if (uploading?.id === record.id) setUploading(null);
        setMessage(`Deleted ${record.person} · ${record.type}`);
      }
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="module-page certifications-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><FileCheck2 size={22} /></span>
          <div>
            <h1>Certifications</h1>
            <p>Expiration alerts, renewal status, uploaded credentials, and compliance review.</p>
          </div>
        </div>
        <div className="heading-actions">
          <button className="secondary-button">Export Compliance</button>
          {canEdit ? (
            <button className="primary-button" onClick={() => openUpload(activeRecords[0])} disabled={!activeRecords[0]}>
              <UploadCloud size={14} /> Upload Certification
            </button>
          ) : null}
        </div>
      </section>
      <section className="cert-summary">
        {[
          ["Expired", activeRecords.filter((r) => r.status === "Expired").length, "critical"],
          ["Due in 30 Days", activeRecords.filter((r) => r.days >= 0 && r.days <= 30).length, "critical"],
          ["Due in 60 Days", activeRecords.filter((r) => r.days > 30 && r.days <= 60).length, "warning"],
          ["Due in 90 Days", activeRecords.filter((r) => r.days > 60 && r.days <= 90).length, "info"],
          ["Active", activeRecords.filter((r) => r.status === "Active").length, "success"],
        ].map(([label, value, tone]) => (
          <button
            key={label}
            className={`cert-stat stat-${tone}`}
            onClick={() => {
              setLifecycleView("active");
              setFilter(label === "Expired" ? "Expired" : label === "Active" ? "Active" : "All");
            }}
          >
            <strong>{value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </section>
      {message ? (
        <div className="success-banner">
          {message}
          <button onClick={() => setMessage("")}><X size={13} /></button>
        </div>
      ) : null}
      <section className="cert-toolbar">
        <div className="segmented-control">
          <button className={lifecycleView === "active" ? "active" : ""} onClick={() => setLifecycleView("active")}>Active</button>
          <button className={lifecycleView === "archived" ? "active" : ""} onClick={() => setLifecycleView("archived")}>
            Archived{archivedCount ? ` (${archivedCount})` : ""}
          </button>
        </div>
        <div className="segmented-control">
          {["All", "EMS", "Fire", "Due Soon", "Expired"].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <span>{filtered.length} certifications shown</span>
      </section>
      <Panel title="Certification Compliance Records" icon={FileCheck2} action={<button className="text-button">Configure columns</button>}>
        <div className="cert-table">
          <div className="cert-row cert-head">
            <span>Personnel</span><span>Certification</span><span>Category</span><span>Issue Date</span>
            <span>Expiration</span><span>Days</span><span>Renewal</span><span>Status</span><span />
          </div>
          {filtered.map((record) => (
            <div className="cert-row" key={record.id}>
              <button className="link-button" onClick={() => setSelected(record)}>{record.person}</button>
              <span>{record.type}</span>
              <span>{record.category}</span>
              <span>{record.issue}</span>
              <span>{record.expires}</span>
              <strong className={`days-${record.days < 0 ? "critical" : record.days <= 30 ? "critical" : record.days <= 90 ? "warning" : "neutral"}`}>
                {record.days < 0 ? `${Math.abs(record.days)} overdue` : record.days}
              </strong>
              {canEdit && !isObjectArchived(record) ? (
                <ManagedSelect dropdownId="certRenewalStatus" value={record.renewal} onChange={(value) => updateRenewal(record.id, value)} />
              ) : (
                <span>{record.renewal}</span>
              )}
              <Badge>{isObjectArchived(record) ? "Archived" : record.status}</Badge>
              <div className="inline-actions">
                {canEdit && !isObjectArchived(record) ? (
                  <button className="row-action" onClick={() => openUpload(record)}>
                    {record.document || record.documentUrl ? "Replace" : "Upload"}
                  </button>
                ) : null}
                <ObjectLifecycleActions
                  record={record}
                  canEdit={canEdit}
                  busy={busyId === record.id}
                  compact
                  onArchive={() => runLifecycle(record, "archive")}
                  onRestore={() => runLifecycle(record, "restore")}
                  onDelete={() => runLifecycle(record, "delete")}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>
      {selected ? (
        <Modal title={`${selected.person} · ${selected.type}`} onClose={() => setSelected(null)}>
          <div className="cert-detail-grid">
            {[
              ["Certification ID", selected.id],
              ["Category", selected.category],
              ["Issue Date", selected.issue],
              ["Expiration Date", selected.expires],
              ["Renewal Status", selected.renewal],
              ["Lifecycle", isObjectArchived(selected) ? "Archived" : "Active"],
              ["Document", selected.document || "No document uploaded"],
            ].map(([label, value]) => (
              <div key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
          {selected.documentUrl ? (
            <a className="primary-button" href={selected.documentUrl} target="_blank" rel="noreferrer" style={{ marginTop: 12, display: "inline-flex" }}>
              Open Document
            </a>
          ) : null}
          <div className="modal-actions" style={{ flexWrap: "wrap", gap: 8 }}>
            <button className="secondary-button" onClick={() => setSelected(null)}>Close</button>
            <ObjectLifecycleActions
              record={selected}
              canEdit={canEdit}
              busy={busyId === selected.id}
              onArchive={() => runLifecycle(selected, "archive")}
              onRestore={() => runLifecycle(selected, "restore")}
              onDelete={() => runLifecycle(selected, "delete")}
            />
            {canEdit && !isObjectArchived(selected) ? (
              <button className="primary-button" onClick={() => { openUpload(selected); setSelected(null); }}>
                <UploadCloud size={14} /> Upload Renewal
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {uploading && canEdit ? (
        <Modal title="Upload Certification Document" onClose={() => !busy && setUploading(null)}>
          <div className="upload-zone">
            <UploadCloud size={28} />
            <strong>{uploading.person} · {uploading.type}</strong>
            <span>
              {uploadDraft.file
                ? `Selected: ${uploadDraft.file.name}`
                : "Drop a PDF or image credential here, or select a file."}
            </span>
            <input
              type="file"
              accept="image/*,.pdf,.png,.jpg,.jpeg,.webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setUploadDraft((current) => ({ ...current, file }));
              }}
            />
          </div>
          <div className="upload-form">
            <label>
              <span>Issue Date</span>
              <input
                type="date"
                value={uploadDraft.issue}
                disabled={busy}
                onChange={(event) => setUploadDraft((current) => ({ ...current, issue: event.target.value }))}
              />
            </label>
            <label>
              <span>Expiration Date</span>
              <input
                type="date"
                value={uploadDraft.expires}
                disabled={busy}
                onChange={(event) => setUploadDraft((current) => ({ ...current, expires: event.target.value }))}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setUploading(null)}>Cancel</button>
            <button className="primary-button" disabled={busy || !uploadDraft.file || !departmentId} onClick={completeUpload}>
              <UploadCloud size={14} /> {busy ? "Uploading…" : "Upload & Submit"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
