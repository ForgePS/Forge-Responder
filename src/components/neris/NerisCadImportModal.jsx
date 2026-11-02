import { useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, Radio, UploadCloud, X } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { DEMO_DEPARTMENT_ID } from "../../lib/tenantPaths.js";
import { buildDemoCadRuns } from "../../data/demoCadRuns.js";
import {
  applyCadImport,
  buildCadImportPreview,
  parseCadFile,
  parseCadPayload,
} from "../../lib/neris/cadImport.js";

/** "2026-11-01T14:02" -> "Nov 1, 2026 14:02"; "2026-11-01" -> "Nov 1, 2026". */
function displayValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(String(value || ""));
  if (!match) return String(value ?? "");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return match[4] ? `${day} ${match[4]}` : day;
}

/** Plain rows for people: one "Units" row, no duplicate call number. */
function displayRows(fields) {
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  const unitIds = fields.filter((f) => /^unit-\d+-unitId$/.test(f.key)).map((f) => f.value);
  const rows = [];
  for (const field of fields) {
    // Per-unit details (times, station) are imported; the preview just names the units.
    if (/^unit-\d+-/.test(field.key)) continue;
    if (field.key === "cadCallNumber" && byKey.incidentNumber?.value === field.value) continue;
    rows.push({ key: field.key, label: field.label, value: displayValue(field.value) });
  }
  if (unitIds.length) rows.push({ key: "units", label: "Units", value: unitIds.join(", ") });
  return rows;
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card neris-cad-import-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <strong>{title}</strong>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   open?: boolean,
 *   onClose?: () => void,
 *   report?: Record<string, unknown>,
 *   onApply?: (nextReport: Record<string, unknown>) => void,
 * }} props
 */
export default function NerisCadImportModal({
  open = false,
  onClose,
  report,
  onApply,
  startsNewReport = false,
}) {
  const { departmentId } = useTenant();
  // Demo department only: sample dispatch records to import with one click.
  const sampleRuns = useMemo(
    () => (departmentId === DEMO_DEPARTMENT_ID ? buildDemoCadRuns() : []),
    [departmentId],
  );
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState(sampleRuns.length ? "recent" : "paste");
  const [pickedRun, setPickedRun] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState([]);
  const [previewFields, setPreviewFields] = useState([]);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [sourceMeta, setSourceMeta] = useState(null);
  const [parsing, setParsing] = useState(false);

  if (!open) return null;

  function handlePickRun(run) {
    setPickedRun(run.incident_number);
    setErrors([]);
    const result = parseCadPayload(JSON.stringify(run));
    if (!result.ok || !result.payload) {
      setErrors(result.errors);
      setPreviewFields([]);
      setPendingPayload(null);
      return;
    }
    showPreview(result.payload, { sourceType: "file-json", filename: `CAD ${run.incident_number}` });
  }

  function resetState() {
    setMode(sampleRuns.length ? "recent" : "paste");
    setPickedRun("");
    setPasteText("");
    setFileName("");
    setErrors([]);
    setPreviewFields([]);
    setPendingPayload(null);
    setSourceMeta(null);
    setParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    resetState();
    onClose?.();
  }

  function showPreview(payload, meta) {
    setPendingPayload(payload);
    setSourceMeta(meta);
    setPreviewFields(buildCadImportPreview(payload));
    setErrors([]);
  }

  function handleParsePaste() {
    setParsing(true);
    setErrors([]);
    setPreviewFields([]);
    setPendingPayload(null);
    try {
      const result = parseCadPayload(pasteText);
      if (!result.ok || !result.payload) {
        setErrors(result.errors);
        return;
      }
      showPreview(result.payload, { sourceType: "paste", pastedPreview: pasteText.slice(0, 500) });
    } finally {
      setParsing(false);
    }
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setParsing(true);
    setErrors([]);
    setPreviewFields([]);
    setPendingPayload(null);
    setFileName(file.name);

    try {
      const result = await parseCadFile(file);
      if (!result.ok || !result.payload) {
        setErrors(result.errors);
        return;
      }
      const sourceType = result.sourceType || (
        file.name.endsWith(".csv") ? "file-csv"
          : file.name.endsWith(".xml") ? "file-xml"
            : "file-json"
      );
      showPreview(result.payload, { sourceType, filename: file.name });
    } finally {
      setParsing(false);
    }
  }

  function handleApply() {
    if (!report || !pendingPayload || !sourceMeta) return;
    const next = applyCadImport(report, pendingPayload, sourceMeta);
    onApply?.(next);
    handleClose();
  }

  return (
    <ModalShell title="Import from CAD" onClose={handleClose}>
      <p className="auth-help">
        {sampleRuns.length
          ? "Pick a recent call from CAD, paste call details, or upload a CAD export file."
          : "Paste call details from your CAD system or upload a CAD export file."}
      </p>

      <div className="neris-cad-import-tabs">
        {sampleRuns.length ? (
          <button
            type="button"
            className={mode === "recent" ? "active" : ""}
            onClick={() => setMode("recent")}
          >
            <Radio size={14} /> Recent CAD calls
          </button>
        ) : null}
        <button
          type="button"
          className={mode === "paste" ? "active" : ""}
          onClick={() => setMode("paste")}
        >
          <ClipboardPaste size={14} /> Paste call details
        </button>
        <button
          type="button"
          className={mode === "upload" ? "active" : ""}
          onClick={() => setMode("upload")}
        >
          <UploadCloud size={14} /> Upload file
        </button>
      </div>

      {mode === "recent" ? (
        <div className="neris-cad-recent" role="list">
          {sampleRuns.map((run) => {
            const on = pickedRun === run.incident_number;
            return (
              <button
                key={run.incident_number}
                type="button"
                role="listitem"
                className={`neris-cad-recent-row${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => handlePickRun(run)}
              >
                <span className="neris-cad-recent-main">
                  <strong>{run.incident_type}</strong>
                  <small>{run.address} · {run.units.map((u) => u.unit_id).join(", ")}</small>
                </span>
                <span className="neris-cad-recent-meta">
                  <span>{displayValue(run.received_time)}</span>
                  <small>#{run.incident_number}</small>
                </span>
              </button>
            );
          })}
          <p className="auth-help">Sample calls for the demo. A live department connects its own CAD.</p>
        </div>
      ) : mode === "paste" ? (
        <div className="neris-cad-import-pane">
          <label className="neris-field neris-field-wide">
            <span>Call details from CAD</span>
            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Call #: 2026-1042\nAddress: 3101 Main St\nType: Structure fire"}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={!pasteText.trim() || parsing}
            onClick={handleParsePaste}
          >
            Preview import
          </button>
        </div>
      ) : (
        <div className="neris-cad-import-pane">
          <button
            type="button"
            className="primary-button"
            disabled={parsing}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud size={14} /> Choose CAD export file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,.xml,application/json,text/csv,text/xml,application/xml"
            hidden
            onChange={handleFileSelected}
          />
          {fileName ? <p className="auth-help">Selected file: <strong>{fileName}</strong></p> : null}
        </div>
      )}

      {parsing ? <p className="auth-help">Parsing CAD data…</p> : null}
      {errors.map((error) => (
        <p key={error} className="auth-help neris-cad-import-error">{error}</p>
      ))}

      {previewFields.length ? (
        <div className="neris-cad-import-preview">
          <h4>What will be filled in</h4>
          <table className="neris-table">
            <tbody>
              {displayRows(previewFields).map((field) => (
                <tr key={field.key}>
                  <th scope="row">{field.label}</th>
                  <td>{field.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="auth-help">
            Imported fields are marked <span className="neris-auto-badge">CAD</span>
            {startsNewReport ? " in the new report. You can edit anything afterward." : " and merged into this report."}
          </p>
        </div>
      ) : null}

      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={handleClose}>Cancel</button>
        <button
          type="button"
          className="primary-button"
          disabled={!pendingPayload || !previewFields.length}
          onClick={handleApply}
        >
          <Check size={14} /> {startsNewReport ? "Start report" : "Apply to report"}
        </button>
      </div>
    </ModalShell>
  );
}
