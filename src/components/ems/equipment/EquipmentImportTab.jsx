import { useEffect, useState } from "react";
import { DatabaseZap, Undo2 } from "lucide-react";
import { Badge, Panel } from "../../shell/ui.jsx";
import { STATUS_INFO, formatDate, formatWhen } from "../../../lib/ems/equipmentDisplay.js";
import {
  applyEquipmentImport, describeError, previewEquipmentImport, rollbackEquipmentImport, watchEquipmentImports,
} from "../../../lib/ems/emsEquipmentService.js";

const IMPORT_STATUS = { applied: "Imported", rolled_back: "Rolled back", partly_rolled_back: "Partly rolled back" };

/**
 * Copy rows of the classic Assets list into EMS equipment. Preview first; the
 * Assets list itself is never changed, and an import can be rolled back while
 * its records are untouched.
 */
export default function EquipmentImportTab({ departmentId, stations, onMessage }) {
  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState({ totalRows: 0, alreadyImportedCount: 0, remainingCount: 0 });
  const [chosen, setChosen] = useState(() => new Set());
  const [imports, setImports] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => watchEquipmentImports(departmentId, setImports, (e) => setError(describeError(e))), [departmentId]);

  async function preview() {
    setBusy(true);
    setError("");
    try {
      const result = await previewEquipmentImport(departmentId, stations);
      setRows(result.rows || []);
      setCounts({ totalRows: result.totalRows || 0, alreadyImportedCount: result.alreadyImportedCount || 0, remainingCount: result.remainingCount || 0 });
      setChosen(new Set((result.rows || []).filter((r) => !r.skip).map((r) => r.sourceId)));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!chosen.size) return;
    if (!window.confirm(`Import ${chosen.size} item${chosen.size === 1 ? "" : "s"} as EMS equipment? The Assets list stays as it is.`)) return;
    setBusy(true);
    setError("");
    try {
      const result = await applyEquipmentImport(departmentId, [...chosen], stations);
      onMessage(`Imported ${result.createdCount} item${result.createdCount === 1 ? "" : "s"}${result.skippedCount ? `, skipped ${result.skippedCount}` : ""}.`);
      setRows(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function rollback(batch) {
    if (!window.confirm(`Roll back import ${batch.id}? Records nobody has changed since are deleted; changed ones are kept.`)) return;
    setBusy(true);
    setError("");
    try {
      const result = await rollbackEquipmentImport(departmentId, batch.id);
      onMessage(`Removed ${result.removedCount} imported record${result.removedCount === 1 ? "" : "s"}${result.kept?.length ? `; kept ${result.kept.length} changed since the import` : ""}.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const importable = (rows || []).filter((r) => !r.skip);

  return (
    <>
      <Panel title="Import from the Assets list" icon={DatabaseZap}
        action={<button type="button" className="primary-button" onClick={preview} disabled={busy}>{rows ? "Preview again" : "Preview import"}</button>}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <p className="occupancy-muted">
          Copies rows of the classic Assets list into EMS equipment, so they get QR labels, history and schedules. Locations
          that match a Fleet vehicle or a station are linked; anything else is kept in the notes. The Assets list isn't changed.
          Untick anything that isn't EMS equipment.
        </p>
        {rows ? (
          <>
            {counts.alreadyImportedCount || counts.remainingCount > rows.length ? (
              <p className="occupancy-muted">
                {counts.alreadyImportedCount ? `${counts.alreadyImportedCount} of ${counts.totalRows} rows are already imported and not shown. ` : ""}
                {counts.remainingCount > rows.length ? `Showing the first ${rows.length} of ${counts.remainingCount} rows left; import these, then preview again for the rest.` : ""}
              </p>
            ) : null}
            <div className="data-table-wrap">
              <table className="ems-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" aria-label="Choose all"
                        checked={importable.length > 0 && importable.every((r) => chosen.has(r.sourceId))}
                        onChange={(e) => setChosen(e.target.checked ? new Set(importable.map((r) => r.sourceId)) : new Set())} />
                    </th>
                    <th>Assets list</th><th>Becomes</th><th>Where</th><th>Status</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.sourceId}>
                      <td><input type="checkbox" checked={chosen.has(r.sourceId)} disabled={Boolean(r.skip)} onChange={() => toggle(r.sourceId)} aria-label={`Import ${r.source.name || r.sourceId}`} /></td>
                      <td>{r.source.name || "—"}<small className="ems-block occupancy-muted">{r.sourceId} · {r.source.category} · {r.source.location} · {r.source.status}</small></td>
                      <td>{r.record.name}<small className="ems-block occupancy-muted">{r.record.assetNumber} · {r.record.category}</small></td>
                      <td>{r.record.where}</td>
                      <td>
                        <Badge tone={STATUS_INFO[r.record.status]?.tone}>{STATUS_INFO[r.record.status]?.label}</Badge>
                        {r.record.nextInspectionDue ? <small className="ems-block occupancy-muted">Inspection {formatDate(r.record.nextInspectionDue)}</small> : null}
                      </td>
                      <td>
                        {r.skip ? <strong>{r.skip}</strong> : null}
                        {r.warnings.map((w) => <small key={w} className="ems-block occupancy-muted">{w}</small>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length ? <div className="empty-table">{counts.totalRows ? "Every row of the Assets list has been imported." : "The Assets list is empty."}</div> : null}
            </div>
            <div className="df-actions">
              <button type="button" className="primary-button" onClick={apply} disabled={busy || !chosen.size}>
                Import {chosen.size} item{chosen.size === 1 ? "" : "s"}
              </button>
            </div>
          </>
        ) : null}
      </Panel>
      <Panel title="Past imports" icon={Undo2}>
        <div className="data-table-wrap">
          <table className="ems-table">
            <thead><tr><th>When</th><th>By</th><th>Imported</th><th>Skipped</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {imports.map((b) => (
                <tr key={b.id}>
                  <td className="ems-num">{formatWhen(b.createdAt)}</td>
                  <td>{b.createdByName}</td>
                  <td className="ems-num">{b.createdCount}</td>
                  <td className="ems-num">{b.skippedCount}</td>
                  <td>
                    {IMPORT_STATUS[b.status] || b.status}
                    {b.kept?.length ? <small className="ems-block occupancy-muted">Kept {b.kept.length} changed since</small> : null}
                  </td>
                  <td>
                    {b.status !== "rolled_back" ? (
                      <button type="button" className="secondary-button" onClick={() => rollback(b)} disabled={busy}><Undo2 size={14} /> Roll back</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!imports.length ? <div className="empty-table">No imports yet.</div> : null}
        </div>
      </Panel>
    </>
  );
}
