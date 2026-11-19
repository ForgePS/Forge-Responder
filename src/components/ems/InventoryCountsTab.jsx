import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { Badge, Panel } from "../shell/ui.jsx";
import { COUNT_STATUS_LABELS, formatDate, formatWhen, locationPath } from "../../lib/ems/inventoryDisplay.js";
import {
  approveInventoryCount, describeError, newRequestId, rejectInventoryCount, saveInventoryCount, startInventoryCount,
  submitInventoryCount, watchInventoryCounts,
} from "../../lib/ems/emsInventoryService.js";

const STATUS_TONES = { open: "info", submitted: "warning", approved: "success", rejected: "critical" };

function rowPayload(rows) {
  return rows.map((r) => ({ rowId: r.rowId, counted: r.counted === "" ? null : r.counted, reason: r.reason || "" }));
}

/** Count, explain differences, submit; a different person approves or rejects. */
function CountEditor({ departmentId, uid, count, items, canApprove, onBack, onMessage }) {
  const [rows, setRows] = useState(() => (count.rows || []).map((r) => ({ ...r, counted: r.counted ?? "" })));
  const [found, setFound] = useState({ itemId: "", lot: "", expiration: "" });
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRows((count.rows || []).map((r) => ({ ...r, counted: r.counted ?? "" }))); }, [count]);

  const editable = count.status === "open";
  const isCounter = count.createdBy === uid || count.submittedBy === uid;
  const canReview = canApprove && count.status === "submitted" && !isCounter;
  const differences = rows.filter((r) => r.counted !== "" && Number(r.counted) !== r.expected).length;
  const uncounted = rows.filter((r) => r.counted === "").length;

  async function act(fn, done) {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (done) onMessage(done);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }
  const update = (rowId, key, value) => setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, [key]: value } : r)));

  return (
    <Panel title={`Count: ${count.locationName}`} icon={ClipboardList}
      action={<button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={14} /> Back</button>}>
      <p className="occupancy-muted">
        Started {formatWhen(count.createdAt)} by {count.createdByName}. <Badge tone={STATUS_TONES[count.status]}>{COUNT_STATUS_LABELS[count.status]}</Badge>
        {count.reviewedByName ? <> Reviewed by {count.reviewedByName}{count.reviewNote ? `: ${count.reviewNote}` : ""}.</> : null}
      </p>
      {editable ? (
        <p className="occupancy-muted">
          Expected quantities are what the system held when the count started. Anything used or received while you count
          is kept: approval only applies the difference you found.
        </p>
      ) : null}
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <div className="data-table-wrap">
        <table className="ems-table">
          <thead><tr><th>Item</th><th>Lot</th><th>Expiration</th><th>Expected</th><th>Counted</th><th>Difference</th><th>Reason for difference</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.counted === "" ? null : Number(r.counted) - r.expected;
              return (
                <tr key={r.rowId} className={diff ? "ems-variance" : ""}>
                  <td>{r.itemName}{r.added ? <small className="ems-block occupancy-muted">Found, not in system</small> : null}</td>
                  <td>{r.lot || "—"}</td>
                  <td>{r.expiration ? formatDate(r.expiration) : "—"}</td>
                  <td className="ems-num">{r.expected}</td>
                  <td>
                    {editable ? (
                      <input className="ems-count-input" type="number" min="0" step="1" inputMode="numeric" value={r.counted}
                        aria-label={`Counted ${r.itemName} ${r.lot}`} onChange={(e) => update(r.rowId, "counted", e.target.value === "" ? "" : Number(e.target.value))} />
                    ) : <span className="ems-num">{r.counted ?? "—"}</span>}
                  </td>
                  <td className={`ems-num ${diff < 0 ? "ems-out" : diff > 0 ? "ems-in" : ""}`}>{diff === null ? "" : diff > 0 ? `+${diff}` : diff}</td>
                  <td>
                    {editable ? (
                      <input value={r.reason || ""} maxLength={300} disabled={!diff} aria-label={`Reason for ${r.itemName}`}
                        placeholder={diff ? "Required" : ""} onChange={(e) => update(r.rowId, "reason", e.target.value)} />
                    ) : (r.reason || "")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <div className="empty-table">Nothing is stocked here yet. Add anything you find below.</div> : null}
      </div>
      {editable ? (
        <>
          <div className="ems-filters ems-found">
            <strong>Found stock that isn't listed?</strong>
            <select value={found.itemId} onChange={(e) => setFound((p) => ({ ...p, itemId: e.target.value }))} aria-label="Found item">
              <option value="">Choose an item</option>
              {[...items].filter((i) => i.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input placeholder="Lot" value={found.lot} maxLength={60} onChange={(e) => setFound((p) => ({ ...p, lot: e.target.value }))} aria-label="Found lot" />
            <input type="date" value={found.expiration} onChange={(e) => setFound((p) => ({ ...p, expiration: e.target.value }))} aria-label="Found expiration" />
            <button type="button" className="secondary-button" disabled={busy || !found.itemId}
              onClick={() => act(async () => {
                await saveInventoryCount(departmentId, count.id, rowPayload(rows), [found]);
                setFound({ itemId: "", lot: "", expiration: "" });
              })}><Plus size={14} /> Add row</button>
          </div>
          <div className="df-actions">
            <span className="occupancy-muted">{uncounted ? `${uncounted} not counted yet · ` : ""}{differences} difference{differences === 1 ? "" : "s"}</span>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => act(() => saveInventoryCount(departmentId, count.id, rowPayload(rows)), "Count saved.")}>Save progress</button>
            <button type="button" className="primary-button" disabled={busy || uncounted > 0}
              onClick={() => act(() => submitInventoryCount(departmentId, count.id, rowPayload(rows)), "Count submitted for review.")}>Submit for review</button>
          </div>
        </>
      ) : null}
      {count.status === "submitted" ? (
        canReview ? (
          <div className="ems-review">
            <label className="config-field">
              <span>Review note (required to reject)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </label>
            <div className="df-actions">
              <button type="button" className="secondary-button" disabled={busy || !note.trim()}
                onClick={() => act(() => rejectInventoryCount(departmentId, count.id, note), "Count rejected.")}>Reject</button>
              <button type="button" className="primary-button" disabled={busy}
                onClick={() => act(() => approveInventoryCount(departmentId, count.id, note), "Count approved. Stock adjusted.")}>
                Approve and adjust stock
              </button>
            </div>
          </div>
        ) : (
          <p className="occupancy-muted">
            {isCounter && canApprove ? "Someone other than the person who did this count must review it." : "Waiting for an approver to review this count."}
          </p>
        )
      ) : null}
    </Panel>
  );
}

export default function InventoryCountsTab({ departmentId, uid, items, locations, canCount, canApprove, onMessage }) {
  const [counts, setCounts] = useState([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const locationsById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  useEffect(() => watchInventoryCounts(departmentId, setCounts, (e) => setError(describeError(e))), [departmentId]);

  const open = counts.find((c) => c.id === openId);
  if (open) {
    return <CountEditor departmentId={departmentId} uid={uid} count={open} items={items} canApprove={canApprove}
      onBack={() => setOpenId("")} onMessage={onMessage} />;
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      const { countId } = await startInventoryCount(departmentId, locationId, newRequestId());
      setOpenId(countId);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Physical counts" icon={ClipboardList}>
      {canCount ? (
        <div className="ems-filters">
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Location to count">
            <option value="">Choose a location to count</option>
            {locations.filter((l) => l.active !== false).map((l) => ({ ...l, path: locationPath(l, locationsById) }))
              .sort((a, b) => a.path.localeCompare(b.path)).map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
          </select>
          <button type="button" className="primary-button" disabled={busy || !locationId} onClick={start}><Plus size={14} /> Start count</button>
        </div>
      ) : null}
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      {!counts.length ? <p className="occupancy-muted">No counts yet.</p> : (
        <div className="df-card-list">
          {counts.map((c) => (
            <button key={c.id} type="button" className="df-card df-card-button" onClick={() => setOpenId(c.id)}>
              <div>
                <strong>{c.locationName}</strong>
                <small className="occupancy-muted">
                  {formatWhen(c.createdAt)} · {c.createdByName} · {(c.rows || []).length} lots
                  {c.status !== "open" && Number.isFinite(c.varianceRows) ? ` · ${c.varianceRows} difference${c.varianceRows === 1 ? "" : "s"}` : ""}
                </small>
              </div>
              <Badge tone={STATUS_TONES[c.status]}>{COUNT_STATUS_LABELS[c.status] || c.status}</Badge>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
