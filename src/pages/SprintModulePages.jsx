import { useMemo, useState, useEffect } from "react";
import {
  Activity, Archive, BarChart3, BookOpen, Check, CirclePlus, ClipboardCheck, FileText,
  Gauge, PackageSearch, ShieldCheck, Upload, X
} from "lucide-react";
import { documentCategoryMap } from "../data/sprintModuleSeeds.js";
import { exportCsv } from "../utils/dashboardMetrics.js";
import FleetRecordEditModal, { ASSET_EDIT_FIELDS } from "../components/FleetRecordEditModal.jsx";
import ObjectUploadField from "../components/ObjectUploadField.jsx";
import ObjectLifecycleActions from "../components/ObjectLifecycleActions.jsx";
import { buildDocumentLibraryPath } from "../lib/storagePaths.js";
import { deleteFirebaseFile } from "../lib/firebaseClient.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  acknowledgementKeys,
  acknowledgementLabel,
  acknowledgementList,
  hasAcknowledged,
  requiresAcknowledgement,
  withAcknowledgement,
} from "../lib/documentAcknowledgement.js";
import {
  archiveObject,
  isObjectArchived,
  isObjectDeleted,
  isObjectVisibleInActiveList,
  isObjectVisibleInArchivedList,
  restoreObject,
  softDeleteObject,
  withActiveLifecycle,
} from "../lib/objectLifecycle.js";

function Badge({ children }) {
  const text = String(children).toLowerCase();
  let tone = "neutral";
  if (/active|complete|approved|current|pass|scheduled|in service/.test(text)) tone = "success";
  if (/overdue|deficit|fail|critical|out of service|deleted/.test(text)) tone = "critical";
  if (/due|pending|pm|review|leave|archived/.test(text)) tone = "warning";
  if (/progress|submitted|info/.test(text)) tone = "info";
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Panel({ title, icon: Icon, action, children, className = "" }) {
  return <section className={`panel ${className}`}><header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header><div className="panel-body">{children}</div></section>;
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop"><section className="workflow-modal"><header><strong>{title}</strong><button onClick={onClose}><X size={16} /></button></header><div className="modal-content">{children}</div></section></div>;
}

function FleetSummary({ items }) {
  return <section className="fleet-summary">{items.map(([label, value, tone]) => <div key={label} className={`fleet-stat stat-${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</section>;
}

export function DocumentsPage({ query, records = [], setRecords, navLabel = "Documents", departmentId = "", canEdit = true }) {
  const { user, membership } = useAuth();
  const myAckIdentity = {
    personnelId: membership?.personnelId || "",
    uid: user?.uid || "",
    name: membership?.displayName || user?.displayName || user?.email || "",
  };
  const myAckKeys = acknowledgementKeys(myAckIdentity);
  const category = documentCategoryMap[navLabel];
  const [filter, setFilter] = useState(category || "All");
  const [lifecycleView, setLifecycleView] = useState("active");
  const [selectedId, setSelectedId] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadMeta, setUploadMeta] = useState({ title: "", category: category || "Upload", description: "" });

  const scoped = useMemo(() => (
    records.filter((item) => !isObjectDeleted(item)).filter((item) => (
      lifecycleView === "archived" ? isObjectVisibleInArchivedList(item) : isObjectVisibleInActiveList(item)
    ))
  ), [records, lifecycleView]);

  const visible = scoped.filter((item) => {
    const matchesCategory = filter === "All" || item.category === filter;
    const haystack = Object.values(item).join(" ").toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });

  const selected = visible.find((item) => item.id === selectedId) || visible[0] || null;

  useEffect(() => {
    if (!visible.length) {
      setSelectedId("");
      return;
    }
    if (!visible.some((item) => item.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  function acknowledge(id) {
    setRecords((current) => current.map((item) => item.id === id ? withAcknowledgement(item, myAckIdentity) : item));
  }

  function setRequiresAcknowledgement(id, required) {
    setRecords((current) => current.map((item) => item.id === id ? {
      ...item,
      requiresAcknowledgement: required ? "Yes" : "No",
      acknowledgementStatus: required ? "Pending" : "Not Required",
    } : item));
  }

  function patchRecord(id, mapper, successNotice) {
    setRecords((current) => current.map((item) => (item.id === id ? mapper(item) : item)));
    if (successNotice) setNotice(successNotice);
  }

  async function runLifecycle(id, action) {
    const record = records.find((item) => item.id === id);
    if (!record || !canEdit) return;
    setBusyId(id);
    try {
      if (action === "archive") {
        patchRecord(id, (item) => archiveObject(item), "Document archived.");
      } else if (action === "restore") {
        patchRecord(id, (item) => restoreObject(item), "Document restored.");
        setLifecycleView("active");
      } else if (action === "delete") {
        if (record.storagePath) await deleteFirebaseFile(record.storagePath);
        patchRecord(id, (item) => softDeleteObject(item), "Document deleted.");
        setSelectedId("");
      }
    } finally {
      setBusyId("");
    }
  }

  function handleUploaded(uploaded) {
    const today = new Date().toISOString().slice(0, 10);
    const ext = String(uploaded.name || "").split(".").pop()?.toUpperCase() || "FILE";
    const next = withActiveLifecycle({
      id: `DOC-${Date.now()}`,
      title: uploadMeta.title.trim() || uploaded.name,
      category: uploadMeta.category || "Upload",
      subcategory: "Uploads",
      version: "1.0",
      effectiveDate: today,
      uploadedBy: "Current User",
      uploadedDate: today,
      fileType: ext,
      fileUrl: uploaded.downloadUrl,
      storagePath: uploaded.storagePath,
      tags: "upload",
      requiresAcknowledgement: "No",
      acknowledgementStatus: "Not Required",
      description: uploadMeta.description.trim() || `Uploaded file: ${uploaded.name}`,
    });
    setRecords((current) => [next, ...current]);
    setSelectedId(next.id);
    setLifecycleView("active");
    setShowUpload(false);
    setUploadMeta({ title: "", category: category || "Upload", description: "" });
    setNotice("Document uploaded.");
  }

  const archivedCount = records.filter((item) => isObjectArchived(item)).length;

  return (
    <div className="module-page documents-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><FileText size={22} /></span>
          <div>
            <h1>{navLabel}</h1>
            <p>Department policies, protocols, forms, and uploaded reference documents.</p>
          </div>
        </div>
        {canEdit ? (
          <button className="primary-button" type="button" onClick={() => setShowUpload(true)} disabled={!departmentId}>
            <Upload size={14} /> Upload Document
          </button>
        ) : null}
      </section>
      {notice ? (
        <div className="success-banner">
          {notice}
          <button type="button" onClick={() => setNotice("")}><X size={13} /></button>
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
          {["All", "SOG", "Policy", "EMS Protocol", "Form", "Upload"].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <span>{visible.length} documents</span>
      </section>
      <section className="documents-workspace">
        <Panel title="Document Library" icon={FileText}>
          <div className="document-library">
            {visible.map((item) => (
              <button
                key={item.id}
                className={item.id === selected?.id ? "doc-row selected" : "doc-row"}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{item.title}</strong>
                <small>{item.category} · v{item.version}</small>
                <Badge>{isObjectArchived(item) ? "Archived" : acknowledgementLabel(item)}</Badge>
              </button>
            ))}
            {!visible.length ? <div className="empty-table">No documents in this view.</div> : null}
          </div>
        </Panel>
        {selected && (
          <Panel
            title="Document Detail"
            icon={BookOpen}
            action={requiresAcknowledgement(selected) && isObjectVisibleInActiveList(selected) && myAckKeys.length ? (
              hasAcknowledged(selected, myAckKeys)
                ? <span className="panel-count">You acknowledged this</span>
                : <button className="text-button" onClick={() => acknowledge(selected.id)}>Acknowledge</button>
            ) : null}
          >
            <div className="cert-detail-grid">
              {[
                ["Category", selected.category],
                ["Version", selected.version],
                ["Effective", selected.effectiveDate],
                ["Uploaded By", selected.uploadedBy],
                ["File Type", selected.fileType],
                ["Acknowledgement", acknowledgementLabel(selected)],
                ["Acknowledged By", acknowledgementList(selected).map((entry) => entry.name).join(", ") || "No one yet"],
                ["Lifecycle", isObjectArchived(selected) ? "Archived" : "Active"],
                ["Tags", selected.tags],
                ["Description", selected.description],
              ].map(([label, value]) => (
                <div key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>
            {selected.fileUrl && selected.fileUrl !== "#" ? (
              <a className="primary-button" href={selected.fileUrl} target="_blank" rel="noreferrer" style={{ marginTop: 12, display: "inline-flex" }}>
                Open Document
              </a>
            ) : null}
            {canEdit && isObjectVisibleInActiveList(selected) ? (
              <label className="inline-check" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={requiresAcknowledgement(selected)}
                  onChange={(event) => setRequiresAcknowledgement(selected.id, event.target.checked)}
                />
                <span>Everyone must acknowledge this document</span>
              </label>
            ) : null}
            {canEdit ? (
              <div style={{ marginTop: 12 }}>
                <ObjectLifecycleActions
                  record={selected}
                  canEdit={canEdit}
                  busy={busyId === selected.id}
                  onArchive={() => runLifecycle(selected.id, "archive")}
                  onRestore={() => runLifecycle(selected.id, "restore")}
                  onDelete={() => runLifecycle(selected.id, "delete")}
                />
              </div>
            ) : null}
          </Panel>
        )}
      </section>
      {showUpload && canEdit ? (
        <Modal title="Upload Document" onClose={() => setShowUpload(false)}>
          <div className="upload-form" style={{ marginBottom: 12 }}>
            <label>
              <span>Title</span>
              <input
                value={uploadMeta.title}
                onChange={(e) => setUploadMeta((current) => ({ ...current, title: e.target.value }))}
                placeholder="Document title"
              />
            </label>
            <label>
              <span>Category</span>
              <select
                value={uploadMeta.category}
                onChange={(e) => setUploadMeta((current) => ({ ...current, category: e.target.value }))}
              >
                {["SOG", "Policy", "EMS Protocol", "Form", "Upload"].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="wide-field">
              <span>Description</span>
              <input
                value={uploadMeta.description}
                onChange={(e) => setUploadMeta((current) => ({ ...current, description: e.target.value }))}
                placeholder="Optional description"
              />
            </label>
          </div>
          <ObjectUploadField
            label="Upload to document library"
            hint="PDF, Office, or image files up to 12 MB"
            disabled={!departmentId}
            buildPath={(file) => buildDocumentLibraryPath(departmentId, file.name)}
            onUploaded={handleUploaded}
          />
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={() => setShowUpload(false)}>Cancel</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function OccupanciesPage({ query, records = [], setRecords }) {
  const [selectedId, setSelectedId] = useState(records[0]?.id || "");
  const selected = records.find((item) => item.id === selectedId) || records[0];
  const visible = records.filter((item) => Object.values(item).join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="module-page">
      <section className="module-heading"><div><span className="module-icon"><Archive size={22} /></span><div><h1>Occupancies</h1><p>Business and occupancy registry with hazard levels and inspection due dates.</p></div></div><button className="primary-button" onClick={() => setRecords((c) => [{ id: `OCC-${300 + c.length}`, name: "New Occupancy", address: "Pending", type: "Business", hazard: "Low", occupancyLoad: "0", lastInspection: "Pending", inspectionDue: "Pending", inspector: "Unassigned", status: "Active" }, ...c])}><CirclePlus size={14} /> Add Occupancy</button></section>
      <FleetSummary items={[["Occupancies", records.length, "info"], ["High Hazard", records.filter((r) => r.hazard === "High").length, "critical"], ["Due Soon", records.filter((r) => /due|pending/i.test(r.status)).length, "warning"], ["Active", records.filter((r) => r.status === "Active").length, "success"]]} />
      <section className="personnel-workspace">
        <Panel title="Occupancy Registry" icon={Archive}><div className="personnel-list">{visible.map((item) => <button key={item.id} className={item.id === selected?.id ? "person-row selected" : "person-row"} onClick={() => setSelectedId(item.id)}><span><strong>{item.name}</strong><small>{item.type} · {item.address}</small></span><Badge>{item.status}</Badge></button>)}</div></Panel>
        {selected && <Panel title="Occupancy Detail" icon={ShieldCheck}><div className="cert-detail-grid">{[["Type", selected.type], ["Hazard", selected.hazard], ["Load", selected.occupancyLoad], ["Inspector", selected.inspector], ["Last Inspection", selected.lastInspection], ["Inspection Due", selected.inspectionDue], ["Status", selected.status]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></Panel>}
      </section>
    </div>
  );
}

export function InspectionsPage({ query, records = [], setRecords }) {
  const visible = records.filter((item) => Object.values(item).join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="module-page">
      <section className="module-heading"><div><span className="module-icon"><ClipboardCheck size={22} /></span><div><h1>Inspections</h1><p>Inspection queue, violations, reinspection dates, and occupancy history.</p></div></div></section>
      <FleetSummary items={[["Open", visible.filter((r) => r.status !== "Complete").length, "warning"], ["Overdue", visible.filter((r) => r.status === "Overdue").length, "critical"], ["Scheduled", visible.filter((r) => r.status === "Scheduled").length, "info"], ["Complete", visible.filter((r) => r.status === "Complete").length, "success"]]} />
      <Panel title="Inspection Queue" icon={ClipboardCheck}><div className="cert-table"><div className="cert-row cert-head"><span>Occupancy</span><span>Type</span><span>Due</span><span>Inspector</span><span>Violations</span><span>Status</span></div>{visible.map((item) => <div className="cert-row" key={item.id}><strong>{item.occupancy}</strong><span>{item.type}</span><span>{item.due}</span><span>{item.inspector}</span><span>{item.violations}</span><select value={item.status} onChange={(e) => setRecords((c) => c.map((r) => r.id === item.id ? { ...r, status: e.target.value } : r))}>{["Scheduled", "Overdue", "Pending Review", "Complete"].map((s) => <option key={s}>{s}</option>)}</select></div>)}</div></Panel>
    </div>
  );
}

export function PreplansPage({ query, records = [], setRecords }) {
  const visible = records.filter((item) => Object.values(item).join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="module-page">
      <section className="module-heading"><div><span className="module-icon"><ShieldCheck size={22} /></span><div><h1>Preplans</h1><p>Pre-incident plans linked to occupancies with hazards, access, and water supply.</p></div></div></section>
      <Panel title="Pre-Incident Plans" icon={ShieldCheck}><div className="cert-table"><div className="cert-row cert-head"><span>Occupancy</span><span>Hazards</span><span>Access</span><span>Water Supply</span><span>Updated</span><span>Status</span></div>{visible.map((item) => <div className="cert-row" key={item.id}><strong>{item.occupancy}</strong><span>{item.hazards}</span><span>{item.access}</span><span>{item.waterSupply}</span><span>{item.lastUpdated}</span><Badge>{item.status}</Badge></div>)}</div></Panel>
    </div>
  );
}

export function HoseTestingPage({ records = [], setRecords, query }) {
  const visible = records.filter((item) => Object.values(item).join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="module-page">
      <section className="module-heading"><div><span className="module-icon"><Gauge size={22} /></span><div><h1>Hose Testing</h1><p>Hose inventory test records, due dates, and failure tracking by apparatus.</p></div></div></section>
      <FleetSummary items={[["Sections", records.length, "info"], ["Current", records.filter((r) => r.status === "Current").length, "success"], ["Due Soon", records.filter((r) => r.status === "Due Soon").length, "warning"], ["Overdue", records.filter((r) => r.status === "Overdue").length, "critical"]]} />
      <Panel title="Hose Test Records" icon={Gauge}><div className="work-order-table"><div className="work-order-row work-order-head"><span>Apparatus</span><span>Section</span><span>Last Test</span><span>Next Due</span><span>Result</span><span>Status</span></div>{visible.map((item) => <div className="work-order-row" key={item.id}><strong>{item.apparatus}</strong><span>{item.section}</span><span>{item.lastTest}</span><span>{item.nextDue}</span><span>{item.result}</span><Badge>{item.status}</Badge></div>)}</div></Panel>
    </div>
  );
}

export function AnalyticsPage({
  personnel, certifications, training, apparatus, workOrders, assets, inspections, scheduleDays
}) {
  const [range, setRange] = useState("30");
  const sections = useMemo(() => ({
    staffing: scheduleDays.map((day) => ({ shift: day.shift, staffed: day.staffed, minimum: day.minimum, status: day.status })),
    training: training.map((item) => ({ course: item.course, category: item.category, completion: item.completion, status: item.status })),
    fleet: apparatus.map((item) => ({ unit: item.unit, status: item.status, pmDue: item.pmDue })),
    certifications: certifications.map((item) => ({ person: item.person, type: item.type, days: item.days, status: item.status })),
    inspections: inspections.map((item) => ({ occupancy: item.occupancy, due: item.due, status: item.status }))
  }), [scheduleDays, training, apparatus, certifications, inspections]);

  return (
    <div className="module-page analytics-page">
      <section className="module-heading"><div><span className="module-icon"><BarChart3 size={22} /></span><div><h1>Analytics</h1><p>Cross-module command analytics with exportable operational metrics.</p></div></div>
        <div className="heading-actions"><div className="segmented-control">{["30", "60", "90", "YTD"].map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item === "YTD" ? "YTD" : `${item} days`}</button>)}</div></div>
      </section>
      <FleetSummary items={[["Personnel", personnel.length, "info"], ["Training Events", training.length, "success"], ["Fleet Units", apparatus.length, "info"], ["Open Work Orders", workOrders.filter((w) => w.status !== "Complete").length, "warning"], ["Assets", assets.length, "info"]]} />
      {Object.entries(sections).map(([key, rows]) => (
        <Panel key={key} title={key.charAt(0).toUpperCase() + key.slice(1)} icon={BarChart3} action={<button className="text-button" onClick={() => exportCsv(`${key}-${range}-days.csv`, rows)}>Export CSV</button>}>
          <div className="mini-table"><div className="mini-row mini-head" style={{ gridTemplateColumns: `repeat(${Object.keys(rows[0] || {}).length}, minmax(0,1fr))` }}>{Object.keys(rows[0] || {}).map((col) => <span key={col}>{col}</span>)}</div>{rows.slice(0, 8).map((row) => <div className="mini-row" key={JSON.stringify(row)} style={{ gridTemplateColumns: `repeat(${Object.keys(row).length}, minmax(0,1fr))` }}>{Object.values(row).map((val, i) => <span key={i}>{val}</span>)}</div>)}</div>
        </Panel>
      ))}
    </div>
  );
}

export function AssetsPageConnected({ query, records = [], setRecords, canEdit = false }) {
  const [filter, setFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(records[0]?.id || "");
  const [showEdit, setShowEdit] = useState(false);
  const [message, setMessage] = useState("");
  const selected = records.find((asset) => asset.id === selectedId) || records[0];
  const visible = records.filter((asset) => (filter === "All" || asset.status === filter || asset.category === filter) && Object.values(asset).join(" ").toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!records.length) {
      setSelectedId("");
      return;
    }
    if (!records.some((asset) => asset.id === selectedId)) {
      setSelectedId(records[0].id);
    }
  }, [records, selectedId]);

  function addAsset() {
    const nextId = `AST-${1400 + records.length}`;
    const nextAsset = {
      id: nextId,
      name: "New Department Asset",
      category: "Equipment",
      serial: "",
      location: "Station 1",
      assigned: "Unassigned",
      inspection: "",
      value: "",
      status: "Available",
    };
    setRecords((current) => [nextAsset, ...current]);
    setSelectedId(nextId);
    setShowEdit(true);
    setMessage("New asset created — update details and save");
  }

  function saveAsset(nextAsset) {
    setRecords((current) => current.map((asset) => asset.id === selected.id ? { ...asset, ...nextAsset, id: asset.id } : asset));
    setMessage(`${nextAsset.name || selected.name} updated`);
  }

  return (
    <div className="module-page assets-page">
      <section className="module-heading"><div><span className="module-icon"><PackageSearch size={22} /></span><div><h1>Assets</h1><p>Department equipment inventory, assignment custody, inspection dates, value, and repair status.</p></div></div>{canEdit && <button className="primary-button" type="button" onClick={addAsset}><CirclePlus size={14} /> Add Asset</button>}</section>
      <FleetSummary items={[["Total Assets", records.length, "info"], ["In Service", records.filter((a) => a.status === "In Service").length, "success"], ["Inspection Due", records.filter((a) => a.status === "Inspection Due").length, "warning"], ["Out for Repair", records.filter((a) => a.status === "Out for Repair").length, "critical"]]} />
      {message && <div className="success-banner">{message}<button type="button" onClick={() => setMessage("")}><X size={13} /></button></div>}
      <section className="cert-toolbar"><div className="segmented-control">{["All", "Medical", "PPE", "In Service", "Inspection Due"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visible.length} assets shown</span></section>
      <Panel title="Asset Inventory & Custody" icon={PackageSearch} action={canEdit && selected ? <button type="button" className="text-button" onClick={() => setShowEdit(true)}>Edit selected</button> : null}><div className="asset-table"><div className="asset-row asset-head"><span>Asset</span><span>Category</span><span>Serial</span><span>Location</span><span>Assigned To</span><span>Inspection</span><span>Status</span><span /></div>{visible.map((asset) => <div className={`asset-row ${asset.id === selected?.id ? "selected" : ""}`} key={asset.id}><button type="button" className="asset-name-button" onClick={() => setSelectedId(asset.id)}><strong>{asset.name}</strong><small>{asset.id}</small></button><span>{asset.category}</span><span>{asset.serial}</span><span>{asset.location}</span><span>{asset.assigned}</span><span>{asset.inspection}</span><Badge>{asset.status}</Badge>{canEdit ? <button className="row-action" type="button" onClick={() => { setSelectedId(asset.id); setShowEdit(true); }}>Edit</button> : <button className="row-action" type="button" onClick={() => setRecords((c) => c.map((a) => a.id === asset.id ? { ...a, assigned: a.assigned === "Unassigned" ? "Checked Out" : "Unassigned", status: a.assigned === "Unassigned" ? "In Service" : "Available" } : a))}>{asset.assigned === "Unassigned" ? "Check Out" : "Return"}</button>}</div>)}</div></Panel>
      {showEdit && canEdit && selected && (
        <FleetRecordEditModal
          title={`Edit ${selected.name}`}
          fields={ASSET_EDIT_FIELDS}
          record={selected}
          onSave={saveAsset}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
