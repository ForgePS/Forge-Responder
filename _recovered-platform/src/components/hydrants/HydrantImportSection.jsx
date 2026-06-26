import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, UploadCloud } from "lucide-react";
import {
  buildHydrantImportTemplateCsv,
  importHydrantsToTenant,
  parseHydrantImportFile,
  summarizeHydrantImport,
} from "../../lib/hydrantImport.js";

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function downloadTextFile(filename, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function HydrantImportSection({
  departmentId = "",
  departmentName = "Department",
  hydrantCount = 0,
  onImported,
}) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsedHydrants, setParsedHydrants] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [importMode, setImportMode] = useState("merge");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ imported: 0, total: 0 });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");

  const summary = useMemo(() => summarizeHydrantImport(parsedHydrants), [parsedHydrants]);
  const previewRows = parsedHydrants.slice(0, 5);

  async function handleFile(file) {
    if (!file) return;
    setMessage("");
    setFileName(file.name);
    try {
      const result = await parseHydrantImportFile(file);
      setParsedHydrants(result.hydrants || []);
      setParseErrors(result.errors || []);
      if (!result.hydrants?.length) {
        setMessageTone("warning");
        setMessage("No hydrant records were found in that file.");
      } else {
        setMessageTone("info");
        setMessage(`Parsed ${result.hydrants.length} hydrant record${result.hydrants.length === 1 ? "" : "s"} from ${file.name}.`);
      }
    } catch (error) {
      console.error("Hydrant import parse failed", error);
      setParsedHydrants([]);
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
    if (!parsedHydrants.length) {
      setMessageTone("warning");
      setMessage("Choose a CSV or JSON file before importing.");
      return;
    }

    setImporting(true);
    setProgress({ imported: 0, total: parsedHydrants.length });
    try {
      const result = await importHydrantsToTenant(departmentId, parsedHydrants, {
        mode: importMode,
        onProgress: setProgress,
      });
      setMessageTone("success");
      setMessage(
        importMode === "replace"
          ? `Replaced tenant hydrant inventory with ${result.imported} records for ${departmentName}.`
          : `Imported ${result.imported} hydrant records for ${departmentName}.`
      );
      setParsedHydrants([]);
      setParseErrors([]);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      await onImported?.();
    } catch (error) {
      console.error("Hydrant import failed", error);
      setMessageTone("critical");
      setMessage(error.message || "Hydrant import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="sync-page module-page">
      <div className="module-card hydrant-import-card">
        <div className="module-card-header">
          <strong>Import Hydrants</strong>
          <span>
            Load your department hydrant inventory from CSV or JSON. Each department keeps its own records.
          </span>
        </div>

        <div className="hydrant-import-stats">
          <div><span>Department</span><strong>{departmentName}</strong></div>
          <div><span>Current Inventory</span><strong>{hydrantCount}</strong></div>
          <div><span>Ready To Import</span><strong>{parsedHydrants.length}</strong></div>
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
          <strong>Drop CSV or JSON here</strong>
          <span>Use the same field structure as the Horn Lake program: hydrant ID, district, address, latitude, longitude, status, and flow class.</span>
          <button type="button" className="secondary" onClick={() => inputRef.current?.click()} disabled={importing}>
            <UploadCloud size={16} /> Choose File
          </button>
          {fileName && <em>{fileName}</em>}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json,application/json,text/csv"
            hidden
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </div>

        <div className="report-actions hydrant-import-actions">
          <button
            type="button"
            className="button"
            onClick={() => downloadTextFile("hydrants-import-template.csv", buildHydrantImportTemplateCsv())}
          >
            <Download size={16} /> Download CSV Template
          </button>
        </div>

        <div className="form-grid hydrant-import-options">
          <Field label="Import Mode">
            <select value={importMode} onChange={(event) => setImportMode(event.target.value)} disabled={importing}>
              <option value="merge">Merge with existing tenant records</option>
              <option value="replace">Replace tenant hydrant inventory</option>
            </select>
          </Field>
        </div>

        {parsedHydrants.length > 0 && (
          <div className="hydrant-import-preview">
            <div className="panel-title">
              <strong>Import Preview</strong>
              <span>
                {summary.total} records, {summary.withCoordinates} mapped, {summary.districts} district{summary.districts === 1 ? "" : "s"}
              </span>
            </div>
            {summary.withoutCoordinates > 0 && (
              <div className="private-banner compact-banner">
                <AlertTriangle size={16} />
                {summary.withoutCoordinates} record{summary.withoutCoordinates === 1 ? "" : "s"} missing latitude/longitude and will not appear on the map until coordinates are added.
              </div>
            )}
            <div className="hydrant-import-table-wrap">
              <table className="hydrant-import-table">
                <thead>
                  <tr>
                    <th>Hydrant ID</th>
                    <th>District</th>
                    <th>Address</th>
                    <th>Lat / Lon</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((hydrant) => (
                    <tr key={`${hydrant.location_id}-${hydrant.hydrant_id}`}>
                      <td>{hydrant.hydrant_id}</td>
                      <td>{hydrant.district || "—"}</td>
                      <td>{hydrant.address || hydrant.location || "—"}</td>
                      <td>{hydrant.latitude && hydrant.longitude ? `${hydrant.latitude}, ${hydrant.longitude}` : "Missing"}</td>
                      <td>{hydrant.status || "In Service"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedHydrants.length > previewRows.length && (
              <p className="hydrant-import-more">Showing 5 of {parsedHydrants.length} records.</p>
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
          <button type="button" className="primary" onClick={runImport} disabled={importing || !parsedHydrants.length}>
            <UploadCloud size={16} /> {importing ? "Importing..." : "Import Hydrants"}
          </button>
        </div>
      </div>

      <div className="module-card">
        <div className="module-card-header">
          <strong>Supported Formats</strong>
          <span>Use the same hydrant structure already working for Horn Lake.</span>
        </div>
        <div className="integration-grid">
          <div>
            <strong>CSV</strong>
            <p>Header row required. Minimum columns: hydrant_id or location_id. Include latitude and longitude for map placement.</p>
          </div>
          <div>
            <strong>JSON</strong>
            <p>Accepts a plain array, a `{`"hydrants": []`}` wrapper, or ArcGIS-style `{`"features": []`}` exports.</p>
          </div>
          <div>
            <strong>Merge</strong>
            <p>Updates matching hydrants in this department and adds new ones without deleting unrelated records.</p>
          </div>
          <div>
            <strong>Replace</strong>
            <p>Clears this department&apos;s Firestore hydrant inventory and loads the file as the new tenant baseline.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
