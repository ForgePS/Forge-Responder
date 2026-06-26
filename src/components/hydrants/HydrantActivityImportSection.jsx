import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, UploadCloud } from "lucide-react";
import {
  importHydrantActivityToTenant,
  parseHydrantActivityImportFile,
  summarizeHydrantActivityImport,
} from "../../lib/hydrantActivityImport.js";

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export default function HydrantActivityImportSection({
  departmentId = "",
  departmentName = "Department",
  onImported,
}) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsedRecords, setParsedRecords] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ imported: 0, total: 0 });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");

  const summary = useMemo(() => summarizeHydrantActivityImport(parsedRecords), [parsedRecords]);
  const previewRows = parsedRecords.slice(0, 5);

  async function handleFile(file) {
    if (!file) return;
    setMessage("");
    setFileName(file.name);
    try {
      const result = await parseHydrantActivityImportFile(file);
      setParsedRecords(result.records || []);
      setParseErrors(result.errors || []);
      if (!result.records?.length) {
        setMessageTone("warning");
        setMessage(result.hint || "No flow test or inspection records were found in that file.");
      } else {
        setMessageTone("info");
        setMessage(`Parsed ${result.records.length} activity record${result.records.length === 1 ? "" : "s"} from ${file.name}.`);
      }
    } catch (error) {
      console.error("Activity import parse failed", error);
      setParsedRecords([]);
      setParseErrors([error.message || "Unable to read import file."]);
      setMessageTone("critical");
      setMessage("Import file could not be read.");
    }
  }

  async function runImport() {
    if (!departmentId) {
      setMessageTone("critical");
      setMessage("Department context is missing.");
      return;
    }
    if (!parsedRecords.length) {
      setMessageTone("warning");
      setMessage("Choose a CSV file before importing.");
      return;
    }

    setImporting(true);
    setProgress({ imported: 0, total: parsedRecords.length });
    try {
      const result = await importHydrantActivityToTenant(departmentId, parsedRecords, {
        onProgress: setProgress,
      });
      setMessageTone("success");
      setMessage(
        `Imported ${result.imported} activity record${result.imported === 1 ? "" : "s"} and updated ${result.hydrantsUpdated} hydrant${result.hydrantsUpdated === 1 ? "" : "s"} for ${departmentName}.`
      );
      setParsedRecords([]);
      setParseErrors([]);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      await onImported?.();
    } catch (error) {
      console.error("Activity import failed", error);
      setMessageTone("critical");
      const code = String(error?.code || "");
      const text = String(error?.message || "");
      if (code === "permission-denied" || /insufficient permissions/i.test(text)) {
        setMessage(
          "Missing permission to import activity. Sign in with your @hornlake.org account, or ask an admin to add you under User Permissions."
        );
      } else {
        setMessage(text || "Activity import failed.");
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="sync-page module-page">
      <div className="module-card hydrant-import-card">
        <div className="module-card-header">
          <strong>Import Flow Tests &amp; Inspections</strong>
          <span>
            Bulk upload flow test and inspection history. Matching hydrants are updated and new activity records are added.
          </span>
        </div>

        <div className="hydrant-import-stats">
          <div><span>Department</span><strong>{departmentName}</strong></div>
          <div><span>Flow Tests Ready</span><strong>{summary.flowTests}</strong></div>
          <div><span>Inspections Ready</span><strong>{summary.inspections}</strong></div>
        </div>

        <div
          className="hydrant-import-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleFile(event.dataTransfer.files?.[0]);
          }}
        >
          <FileUp size={28} />
          <strong>Drop activity CSV here</strong>
          <span>Use record_type = Flow Test or Inspection. Include hydrant_id or location_id to match existing hydrants. Download the template above first.</span>
          <button type="button" className="secondary" onClick={() => inputRef.current?.click()} disabled={importing}>
            <UploadCloud size={16} /> Choose File
          </button>
          {fileName && <em>{fileName}</em>}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </div>

        {parsedRecords.length > 0 && (
          <div className="hydrant-import-preview">
            <div className="panel-title">
              <strong>Import Preview</strong>
              <span>
                {summary.total} records across {summary.hydrants} hydrant{summary.hydrants === 1 ? "" : "s"}
              </span>
            </div>
            <div className="hydrant-import-table-wrap">
              <table className="hydrant-import-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Hydrant ID</th>
                    <th>Date</th>
                    <th>By</th>
                    <th>Shift</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((record) => (
                    <tr key={record.id}>
                      <td>{record.type}</td>
                      <td>{record.hydrant_id}</td>
                      <td>{record.tested_at.slice(0, 10)}</td>
                      <td>{record.tested_by || "—"}</td>
                      <td>{record.shift || "—"}</td>
                      <td>{record.recordType === "flow" ? (record.flow_result || record.flow_gpm || "—") : (record.repair_needed || "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRecords.length > previewRows.length && (
              <p className="hydrant-import-more">Showing 5 of {parsedRecords.length} records.</p>
            )}
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="hydrant-import-errors">
            <strong>Parse warnings</strong>
            <ul>
              {parseErrors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
            </ul>
            {parseErrors.length > 8 && <span>...and {parseErrors.length - 8} more</span>}
          </div>
        )}

        {importing && progress.total > 0 && (
          <div className="hydrant-import-progress">
            <span>Importing {progress.imported} of {progress.total}</span>
            <div className="hydrant-import-progress-bar">
              <i style={{ width: `${Math.round((progress.imported / progress.total) * 100)}%` }} />
            </div>
          </div>
        )}

        {message && (
          <div className={`hydrant-import-message tone-${messageTone}`}>
            {messageTone === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{message}</span>
          </div>
        )}

        <div className="report-actions">
          <button type="button" className="primary" onClick={runImport} disabled={importing || !parsedRecords.length}>
            <UploadCloud size={16} /> {importing ? "Importing..." : "Import Activity Records"}
          </button>
        </div>
      </div>

      <div className="module-card">
        <div className="module-card-header">
          <strong>CSV Column Guide</strong>
          <span>Required fields are marked with *.</span>
        </div>
        <div className="integration-grid">
          <div>
            <strong>record_type *</strong>
            <p>Use <code>Flow Test</code> or <code>Inspection</code>.</p>
          </div>
          <div>
            <strong>hydrant_id * / location_id</strong>
            <p>Match existing hydrants by Horn Lake hydrant ID (example: HL 1000) or ArcGIS location_id.</p>
          </div>
          <div>
            <strong>date / time</strong>
            <p>Date as YYYY-MM-DD. Time as HH:MM (24-hour or standard).</p>
          </div>
          <div>
            <strong>Flow test fields</strong>
            <p>discharge_size (or discharge), pitot_psi, static_psi, residual_psi. flow_gpm, flow_result, and nfpa_class are calculated automatically when pitot/discharge are provided.</p>
          </div>
          <div>
            <strong>flow_result / nfpa_class</strong>
            <p>Flow codes: B = Class AA, G = Class A, O = Class B, R = Class C, OOS = Out of Service.</p>
          </div>
          <div>
            <strong>Inspection fields</strong>
            <p>notes and repair_needed (Yes/No). Status can be In Service, Needs Repair, or Out of Service.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
