import { useRef, useState } from "react";
import { Check, Download, UploadCloud, X } from "lucide-react";
import {
  buildPersonnelImportPreview,
  buildPersonnelRecordsFromImport,
  downloadPersonnelImportTemplate,
  parsePersonnelSpreadsheet,
  PERSONNEL_IMPORT_HEADERS,
} from "../../lib/personnelImport.js";

function ImportModalShell({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card personnel-import-modal" onClick={(event) => event.stopPropagation()}>
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

export default function PersonnelImportModal({
  open = false,
  onClose,
  existingRecords = [],
  onImport,
  idPrefix = "P",
}) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  if (!open) return null;

  function resetState() {
    setFileName("");
    setErrors([]);
    setPreviewRows([]);
    setResultMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    resetState();
    onClose?.();
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setResultMessage("");
    setErrors([]);
    setPreviewRows([]);
    setFileName(file.name);

    try {
      const parsed = await parsePersonnelSpreadsheet(file);
      if (parsed.errors.length) {
        setErrors(parsed.errors);
        return;
      }
      setPreviewRows(buildPersonnelImportPreview(parsed.rows, existingRecords));
    } finally {
      setImporting(false);
    }
  }

  function handleImport() {
    if (!previewRows.length) return;
    setImporting(true);
    try {
      const outcome = buildPersonnelRecordsFromImport(previewRows, existingRecords, { idPrefix });
      onImport?.(outcome);
      setResultMessage(`Imported ${outcome.created} new and updated ${outcome.updated} personnel record(s).`);
      setPreviewRows([]);
    } finally {
      setImporting(false);
    }
  }

  const createCount = previewRows.filter((row) => row.action === "create").length;
  const updateCount = previewRows.filter((row) => row.action === "update").length;

  return (
    <ImportModalShell title="Import Personnel from Excel" onClose={handleClose}>
      <p className="auth-help">
        Upload a spreadsheet with columns: {PERSONNEL_IMPORT_HEADERS.join(", ")}.
        Matching names update existing records; new names create personnel records.
      </p>

      <div className="personnel-import-actions">
        <button type="button" className="secondary-button" onClick={() => downloadPersonnelImportTemplate()}>
          <Download size={14} /> Download template
        </button>
        <button type="button" className="primary-button" onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={14} /> Choose Excel file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          hidden
          onChange={handleFileSelected}
        />
      </div>

      {fileName ? <p className="auth-help">Selected file: <strong>{fileName}</strong></p> : null}
      {importing && !previewRows.length && !errors.length ? <p className="auth-help">Reading spreadsheet…</p> : null}
      {errors.map((error) => <p key={error} className="auth-help personnel-import-error">{error}</p>)}
      {resultMessage ? <div className="success-banner">{resultMessage}</div> : null}

      {previewRows.length ? (
        <>
          <div className="personnel-import-summary">
            <span>{previewRows.length} row{previewRows.length === 1 ? "" : "s"} ready</span>
            <span>{createCount} new · {updateCount} update{updateCount === 1 ? "" : "s"}</span>
          </div>
          <div className="data-table-wrap personnel-import-preview">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Position/Rank</th>
                  <th>Apparatus</th>
                  <th>Station</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.displayName}`}>
                    <td>{row.rowNumber}</td>
                    <td>{row.displayName}</td>
                    <td>{row.rank || "—"}</td>
                    <td>{row.apparatus || "—"}</td>
                    <td>{row.station || "—"}</td>
                    <td>
                      <span className={`badge badge-${row.action === "create" ? "info" : "warning"}`}>
                        {row.action === "create" ? "Create" : "Update"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={resetState}>Clear</button>
            <button type="button" className="primary-button" onClick={handleImport} disabled={importing}>
              <Check size={14} /> Import personnel
            </button>
          </div>
        </>
      ) : null}
    </ImportModalShell>
  );
}
