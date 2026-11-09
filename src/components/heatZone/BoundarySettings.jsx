import { useState } from "react";
import { Layers, Trash2, Upload } from "lucide-react";
import { Panel } from "../shell/ui.jsx";
import { deleteHeatZoneBoundary, importHeatZoneBoundaries, saveHeatZoneBoundary } from "../../lib/heatZone/heatZoneService.js";
import { rebuildSummary } from "../../lib/heatZone/heatZoneUi.js";
import SectionStatus from "./SectionStatus.jsx";

const MAX_IMPORT_BYTES = 9 * 1024 * 1024; // callable payloads are capped at 10 MB

/** Feature count and property names, so the user can pick the name column. */
function inspectGeoJson(text) {
  const data = JSON.parse(text);
  const features = data?.type === "FeatureCollection" ? data.features || []
    : data?.type === "Feature" ? [data]
      : data?.type ? [{ properties: {} }] : [];
  const keys = new Set();
  for (const f of features.slice(0, 50)) for (const key of Object.keys(f?.properties || {})) keys.add(key);
  return { count: features.length, keys: [...keys].sort() };
}

const kindLabel = (kind) => (kind === "zone" ? "Response zone" : "District");

/** Boundary list (rename, recolour, activate, delete) and GeoJSON import. */
export default function BoundarySettings({ departmentId, zones = [], status, run, onChanged }) {
  const [drafts, setDrafts] = useState({});
  const [upload, setUpload] = useState(null);
  const [kind, setKind] = useState("district");
  const [nameProperty, setNameProperty] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const busy = Boolean(status?.busy);

  const draftOf = (z) => ({ name: z.name, color: z.color, ...drafts[z.id] });
  const isDirty = (z) => { const d = draftOf(z); return d.name !== z.name || d.color !== z.color; };
  const setDraft = (id, changes) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...changes } }));
  const clearDraft = (id) => setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });

  async function readFile(file) {
    if (!file) { setUpload(null); return; }
    if (file.size > MAX_IMPORT_BYTES) {
      setUpload({ name: file.name, error: "That file is larger than 9 MB. Simplify the boundaries or split the file." });
      return;
    }
    try {
      const text = await file.text();
      const info = inspectGeoJson(text);
      if (!info.count) throw new Error("No features found.");
      setUpload({ name: file.name, text, ...info });
      setNameProperty(info.keys.find((k) => /^name$/i.test(k)) || "");
    } catch {
      setUpload({ name: file.name, error: "This file is not valid GeoJSON (expected a FeatureCollection, Feature or Polygon)." });
    }
  }

  const save = (z, changes, verb) => run(async () => {
    const d = draftOf(z);
    const zone = { id: z.id, name: d.name.trim(), color: d.color, active: z.active, ...changes };
    if (!zone.name) throw new Error("Each boundary needs a name.");
    const res = await saveHeatZoneBoundary(departmentId, zone);
    clearDraft(z.id);
    await onChanged();
    return `${verb} ${zone.name}. ${rebuildSummary(res.rebuild)}`;
  });

  const remove = (z) => {
    if (!window.confirm(`Delete the boundary “${z.name}”? Incident district and zone assignments will be recalculated. This cannot be undone.`)) return;
    run(async () => {
      const res = await deleteHeatZoneBoundary(departmentId, z.id);
      clearDraft(z.id);
      await onChanged();
      return `Deleted ${z.name}. ${rebuildSummary(res.rebuild)}`;
    });
  };

  const importFile = () => run(async () => {
    const res = await importHeatZoneBoundaries(departmentId, upload.text, kind, nameProperty);
    setUpload(null);
    setFileKey((k) => k + 1);
    await onChanged();
    const n = res.saved?.length || 0;
    return `Imported ${n} ${kind === "zone" ? "response zone" : "district"}${n === 1 ? "" : "s"}. ${rebuildSummary(res.rebuild)}`;
  });

  return (
    <Panel title="Boundaries" icon={Layers}>
      <SectionStatus status={status} />
      <div className="data-table-wrap">
        <table className="hz-table">
          <thead><tr><th>Name</th><th>Type</th><th>Colour</th><th>Active</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {zones.map((z) => {
              const d = draftOf(z);
              return (
                <tr key={z.id}>
                  <td><input className="hz-input" value={d.name} maxLength={80} aria-label={`Name for ${z.name}`} onChange={(e) => setDraft(z.id, { name: e.target.value })} disabled={busy} /></td>
                  <td>{kindLabel(z.kind)}</td>
                  <td><input type="color" className="hz-color" value={d.color} aria-label={`Colour for ${z.name}`} onChange={(e) => setDraft(z.id, { color: e.target.value })} disabled={busy} /></td>
                  <td>
                    <label className="hz-switch">
                      <input type="checkbox" checked={z.active !== false} disabled={busy} onChange={() => save(z, { active: z.active === false }, z.active === false ? "Activated" : "Deactivated")} />
                      <span>{z.active === false ? "Inactive" : "Active"}</span>
                    </label>
                  </td>
                  <td className="hz-row-actions">
                    {isDirty(z) && (
                      <>
                        <button type="button" className="primary-button hz-button" disabled={busy} onClick={() => save(z, {}, "Saved")}>Save</button>
                        <button type="button" className="text-button" disabled={busy} onClick={() => clearDraft(z.id)}>Cancel</button>
                      </>
                    )}
                    <button type="button" className="secondary-button danger-button hz-button" disabled={busy} onClick={() => remove(z)} aria-label={`Delete ${z.name}`}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!zones.length && <div className="empty-table">No boundaries yet. Import a GeoJSON file of your districts or response zones below.</div>}
      </div>

      <div className="hz-import">
        <strong>Import GeoJSON</strong>
        <p className="hz-muted">Upload a FeatureCollection of Polygon or MultiPolygon features (up to 200 at a time). Importing recalculates every incident’s district and zones.</p>
        <div className="hz-form">
          <label className="config-field">
            <span>File</span>
            <input key={fileKey} type="file" accept=".geojson,.json,application/geo+json,application/json" disabled={busy} onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          <label className="config-field">
            <span>Import as</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>
              <option value="district">District</option>
              <option value="zone">Response zone</option>
            </select>
          </label>
          <label className="config-field">
            <span>Name property (optional)</span>
            {upload?.keys?.length ? (
              <select value={nameProperty} onChange={(e) => setNameProperty(e.target.value)} disabled={busy}>
                <option value="">Detect automatically</option>
                {upload.keys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            ) : (
              <input className="hz-input" value={nameProperty} placeholder="e.g. NAME" onChange={(e) => setNameProperty(e.target.value)} disabled={busy} />
            )}
          </label>
          <div className="hz-form-actions">
            <button type="button" className="primary-button hz-button" disabled={busy || !upload?.text} onClick={importFile}><Upload size={14} /> Import</button>
          </div>
        </div>
        {upload?.error && <p className="hz-panel-note is-error" role="alert">{upload.error}</p>}
        {upload?.text && <p className="hz-panel-note">{upload.name}: {upload.count} feature{upload.count === 1 ? "" : "s"} found{upload.count > 200 ? " — only 200 can be imported at a time" : ""}.</p>}
      </div>
    </Panel>
  );
}
