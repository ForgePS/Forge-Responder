import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRightLeft, CheckCircle2, ClipboardCheck, FileText, Gauge, Image as ImageIcon, MapPin, Pencil,
  Printer, SearchX, Tag, Trash2, Upload, Wrench,
} from "lucide-react";
import { Badge, Modal } from "../../shell/ui.jsx";
import {
  CONDITION_LABELS, EVENT_LABELS, STATUS_INFO, describeAssignment, displayStatus, dueBadges, equipmentAbilities,
  formatDate, formatMoney, formatWhen,
} from "../../../lib/ems/equipmentDisplay.js";
import {
  addEquipmentFile, describeError, fileUrl, removeEquipmentFile, watchEquipmentEvents,
} from "../../../lib/ems/emsEquipmentService.js";
import { equipmentQrDataUrl, printLabels } from "../../../lib/ems/equipmentLabels.js";
import EquipmentActionForm, { ACTION_TITLES } from "./EquipmentActionForm.jsx";

function Detail({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return <div className="ems-detail"><dt>{label}</dt><dd>{children}</dd></div>;
}

function eventLine(event) {
  const bits = [];
  if (event.type === "transferred" || event.type === "registered" || event.type === "imported") {
    if (event.from) bits.push(`${describeAssignment(event.from)} → ${describeAssignment(event.to)}`);
    else if (event.to) bits.push(`at ${describeAssignment(event.to)}`);
  }
  if (event.result) bits.push(event.result === "pass" ? "Passed" : "Failed");
  if (event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus) {
    bits.push(`${STATUS_INFO[event.fromStatus]?.label || event.fromStatus} → ${STATUS_INFO[event.toStatus]?.label || event.toStatus}`);
  }
  for (const key of ["description", "notes", "note", "reason"]) if (event[key]) bits.push(event[key]);
  if (event.name) bits.push(event.name);
  if (Number.isFinite(event.cost)) bits.push(formatMoney(event.cost));
  if (event.nextDue && event.result === "pass") bits.push(`next due ${formatDate(event.nextDue)}`);
  if (event.changedFields?.length) bits.push(`changed ${event.changedFields.join(", ")}`);
  return bits.join(" · ");
}

/** One equipment record: what it is, where it is, what's due, the actions this person may take, files and history. */
export default function EquipmentDetailModal({
  departmentId, record, can, stations, fleetAssets, locations, departmentName, onClose, onEdit, onMessage,
}) {
  const [mode, setMode] = useState("");
  const [events, setEvents] = useState([]);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => watchEquipmentEvents(departmentId, { equipmentId: record.id, max: 100 }, setEvents, (e) => setError(describeError(e))), [departmentId, record.id]);
  useEffect(() => {
    let live = true;
    equipmentQrDataUrl(record.id, 200).then((src) => { if (live) setQr(src); }).catch(() => {});
    return () => { live = false; };
  }, [record.id]);

  const abilities = equipmentAbilities(record, can);
  const status = displayStatus(record);
  const info = STATUS_INFO[status] || STATUS_INFO.available;
  const badges = dueBadges(record);
  const s = record.schedules || {};
  const missing = record.status === "missing";

  async function openFile(path) {
    setError("");
    const win = window.open("", "_blank");
    try {
      const url = await fileUrl(path);
      if (win) win.location.href = url;
    } catch (e) {
      win?.close();
      setError(describeError(e));
    }
  }

  async function upload(event, kind) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await addEquipmentFile(departmentId, record.id, file, kind);
      onMessage(`${kind === "photo" ? "Photo" : "Document"} added to ${record.name}.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(file) {
    if (!window.confirm(`Remove ${file.name}? The file is deleted.`)) return;
    setBusy(true);
    setError("");
    try {
      await removeEquipmentFile(departmentId, record.id, file.path);
      onMessage(`Removed ${file.name}.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function print() {
    setError("");
    try {
      await printLabels([record], departmentName);
    } catch (e) {
      setError(describeError(e));
    }
  }

  const action = (key, icon, label = ACTION_TITLES[key], primary = false) => {
    const Icon = icon;
    return (
      <button key={key} type="button" className={primary ? "primary-button" : "secondary-button"} onClick={() => setMode(key)}>
        <Icon size={15} /> {label}
      </button>
    );
  };

  const files = (list = [], kind) => (
    <ul className="ems-files">
      {list.map((f) => (
        <li key={f.path}>
          <button type="button" className="link-button" onClick={() => openFile(f.path)}>{f.name}</button>
          <small className="occupancy-muted">{formatWhen(f.addedAt)}</small>
          {abilities.files ? (
            <button type="button" className="secondary-button" onClick={() => removeFile(f)} disabled={busy} title={`Remove ${f.name}`}>
              <Trash2 size={14} /><span className="sr-only">Remove {f.name}</span>
            </button>
          ) : null}
        </li>
      ))}
      {!list.length ? <li className="occupancy-muted">No {kind === "photo" ? "photos" : "documents"}.</li> : null}
    </ul>
  );

  return (
    <Modal title={record.name} onClose={onClose}>
      <div className="ems-equipment-detail">
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <div className="ems-equipment-head">
          <div className="ems-equipment-summary">
            <div className="ems-badges">
              <Badge tone={info.tone}>{info.label}</Badge>
              {badges.map((b) => <Badge key={b.label} tone={b.tone}>{b.label}</Badge>)}
            </div>
            <p className="ems-where"><MapPin size={15} /> {describeAssignment(record.assignment)}</p>
            <p className="occupancy-muted">
              <Tag size={13} /> {record.assetNumber}{record.serialNumber ? ` · S/N ${record.serialNumber}` : ""} · {record.category}
            </p>
            <p className="occupancy-muted">
              {record.lastVerifiedAt ? `Last verified ${formatWhen(record.lastVerifiedAt)} by ${record.lastVerifiedByName || "someone"}` : "Not verified yet"}
            </p>
            {record.openProblem ? (
              <div className="ems-problem" role="note"><AlertTriangle size={15} /> {record.openProblem.description} <small>({record.openProblem.reportedByName}, {formatWhen(record.openProblem.reportedAt)})</small></div>
            ) : null}
            {record.missingReport ? (
              <div className="ems-problem" role="note"><SearchX size={15} /> Missing: {record.missingReport.description} <small>({record.missingReport.reportedByName}, {formatWhen(record.missingReport.reportedAt)})</small></div>
            ) : null}
          </div>
          {qr ? (
            <figure className="ems-qr">
              <img src={qr} alt={`QR label for ${record.name}`} width={120} height={120} />
              <button type="button" className="secondary-button" onClick={print}><Printer size={14} /> Print label</button>
            </figure>
          ) : null}
        </div>

        {mode ? (
          <EquipmentActionForm departmentId={departmentId} record={record} mode={mode} stations={stations} fleetAssets={fleetAssets}
            locations={locations} onCancel={() => setMode("")} onDone={(text) => { setMode(""); onMessage(text); }} />
        ) : (
          <div className="ems-actions" role="group" aria-label="Equipment actions">
            {abilities.verify ? action(missing ? "found" : "verify", CheckCircle2, undefined, true) : null}
            {abilities.inspect ? action("inspection", ClipboardCheck) : null}
            {abilities.inspect && (s.calibrationIntervalDays || s.nextCalibrationDue) ? action("calibration", Gauge) : null}
            {abilities.report ? action("damaged", AlertTriangle) : null}
            {abilities.report ? action("maintenance", Wrench) : null}
            {abilities.transfer ? action("transfer", ArrowRightLeft) : null}
            {abilities.report ? action("missing", SearchX) : null}
            {abilities.maintain && (record.openProblem || ["maintenance_required", "out_of_service"].includes(record.status) || s.maintenanceIntervalDays)
              ? action("maintain", Wrench) : null}
            {abilities.status ? action("status", Tag) : null}
            {abilities.edit ? <button type="button" className="secondary-button" onClick={onEdit}><Pencil size={15} /> Edit details</button> : null}
          </div>
        )}

        <dl className="ems-details">
          <Detail label="Manufacturer / model">{[record.manufacturer, record.model].filter(Boolean).join(" · ")}</Detail>
          <Detail label="Barcode">{record.barcode}</Detail>
          <Detail label="Condition">{CONDITION_LABELS[record.condition] || record.condition}</Detail>
          <Detail label="Next inspection">{s.nextInspectionDue ? `${formatDate(s.nextInspectionDue)}${s.inspectionIntervalDays ? ` (every ${s.inspectionIntervalDays} days)` : ""}` : ""}</Detail>
          <Detail label="Last inspection">{formatWhen(s.lastInspectionAt)}</Detail>
          <Detail label="Next calibration">{s.nextCalibrationDue ? `${formatDate(s.nextCalibrationDue)}${s.calibrationIntervalDays ? ` (every ${s.calibrationIntervalDays} days)` : ""}` : ""}</Detail>
          <Detail label="Last calibration">{formatWhen(s.lastCalibrationAt)}</Detail>
          <Detail label="Next maintenance">{s.nextMaintenanceDue ? `${formatDate(s.nextMaintenanceDue)}${s.maintenanceIntervalDays ? ` (every ${s.maintenanceIntervalDays} days)` : ""}` : ""}</Detail>
          <Detail label="Last maintenance">{formatWhen(s.lastMaintenanceAt)}</Detail>
          <Detail label="Purchased">{[formatDate(record.purchaseDate), formatMoney(record.purchasePrice), record.vendorName].filter(Boolean).join(" · ")}</Detail>
          <Detail label="Warranty expires">{formatDate(record.warrantyExpiration)}</Detail>
          <Detail label="Replace by">{formatDate(record.replacementDate)}</Detail>
          <Detail label="Description">{record.description}</Detail>
          <Detail label="Notes"><span className="ems-pre">{record.notes}</span></Detail>
        </dl>

        <div className="ems-files-grid">
          <section>
            <h3 className="ems-subhead"><ImageIcon size={15} /> Photos</h3>
            {files(record.photos, "photo")}
            {abilities.files ? (
              <label className="secondary-button ems-upload"><Upload size={14} /> Add photo
                <input type="file" accept="image/*" capture="environment" onChange={(e) => upload(e, "photo")} disabled={busy} />
              </label>
            ) : null}
          </section>
          <section>
            <h3 className="ems-subhead"><FileText size={15} /> Documents</h3>
            {files(record.documents, "document")}
            {abilities.files ? (
              <label className="secondary-button ems-upload"><Upload size={14} /> Add document
                <input type="file" onChange={(e) => upload(e, "document")} disabled={busy} />
              </label>
            ) : null}
          </section>
        </div>

        <h3 className="ems-subhead">History</h3>
        <ol className="ems-history">
          {events.map((e) => (
            <li key={e.id}>
              <strong>{EVENT_LABELS[e.type] || e.type}</strong>
              <span>{eventLine(e)}</span>
              <small className="occupancy-muted">{formatWhen(e.at)} · {e.actorName}</small>
            </li>
          ))}
          {!events.length ? <li className="occupancy-muted">No history yet.</li> : null}
        </ol>
      </div>
    </Modal>
  );
}
