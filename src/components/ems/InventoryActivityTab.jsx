import { useEffect, useMemo, useState } from "react";
import { History, Undo2 } from "lucide-react";
import { Badge, Modal, Panel } from "../shell/ui.jsx";
import { TRANSACTION_LABELS, formatDate, formatWhen, locationPath } from "../../lib/ems/inventoryDisplay.js";
import { describeError, reverseInventoryTransaction, watchInventoryTransactions } from "../../lib/ems/emsInventoryService.js";

function ReverseModal({ departmentId, transaction, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!reason.trim()) return setError("Give a reason for the reversal.");
    setSaving(true);
    setError("");
    try {
      await reverseInventoryTransaction(departmentId, transaction.id, reason);
      onDone(`Reversed: ${TRANSACTION_LABELS[transaction.type] || transaction.type} of ${transaction.quantity} ${transaction.itemName}.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="Reverse a transaction" onClose={onClose}>
      <p>
        This posts a new <strong>reversal</strong> that puts the stock back exactly as it was before
        {" "}{TRANSACTION_LABELS[transaction.type] || transaction.type} of {transaction.quantity} {transaction.itemName}.
        The original record stays in the history.
      </p>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <label className="config-field">
        <span>Reason *</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </label>
      <div className="df-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" disabled={saving} onClick={save}>Reverse</button>
      </div>
    </Modal>
  );
}

/** The ledger, newest first. Records are never edited; mistakes are reversed. */
export default function InventoryActivityTab({ departmentId, items, locations, canApprove, onMessage, itemClass = "", title = "Inventory history" }) {
  const [filter, setFilter] = useState({ itemId: "", locationId: "" });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [reversing, setReversing] = useState(null);
  const locationsById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);

  useEffect(() => {
    setError("");
    // Medications query their own records; the supply history leaves medications out.
    const options = itemClass === "medication" ? { ...filter, itemClass } : filter;
    const keep = itemClass === "supply" ? (list) => setRows(list.filter((r) => r.itemClass !== "medication")) : setRows;
    return watchInventoryTransactions(departmentId, options, keep, (e) => setError(describeError(e)));
  }, [departmentId, filter, itemClass]);

  const reversedIds = new Set(rows.filter((r) => r.type === "reversal").map((r) => r.reversesTransactionId));
  const place = (id) => (id ? locationPath(locationsById[id], locationsById) || "(removed location)" : "");

  return (
    <Panel title={title} icon={History}>
      <div className="ems-filters">
        <select value={filter.itemId} onChange={(e) => setFilter({ itemId: e.target.value, locationId: "" })} aria-label="Item">
          <option value="">All items</option>
          {[...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={filter.locationId} onChange={(e) => setFilter({ itemId: "", locationId: e.target.value })} aria-label="Location">
          <option value="">All locations</option>
          {locations.map((l) => ({ ...l, path: locationPath(l, locationsById) })).sort((a, b) => a.path.localeCompare(b.path))
            .map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
        </select>
        <small className="occupancy-muted">Newest 200 records{filter.itemId || filter.locationId ? " for this filter" : ""}.</small>
      </div>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <div className="data-table-wrap">
        <table className="ems-table">
          <thead><tr><th>When</th><th>What</th><th>Item</th><th>Qty</th><th>Where</th><th>Lots</th><th>By</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{formatWhen(t.createdAt)}</td>
                <td>
                  <Badge tone={t.type === "reversal" ? "info" : t.type === "countAdjustment" ? "warning" : "neutral"}>{TRANSACTION_LABELS[t.type] || t.type}</Badge>
                  {t.reason ? <small className="ems-block occupancy-muted">{t.reason}</small> : null}
                  {t.incidentNumber ? <small className="ems-block occupancy-muted">Incident {t.incidentNumber}</small> : null}
                  {reversedIds.has(t.id) ? <small className="ems-block occupancy-muted">Reversed</small> : null}
                </td>
                <td>{t.itemName}</td>
                <td className="ems-num">{t.quantity} <small className="occupancy-muted">{t.unitOfMeasure}</small></td>
                <td>{[place(t.fromLocationId), place(t.toLocationId)].filter(Boolean).join(" → ")}</td>
                <td>
                  <ul className="ems-lots">
                    {(t.lines || []).map((line, i) => (
                      <li key={`${line.locationId}-${line.key}-${i}`}>
                        <span className={line.delta < 0 ? "ems-out" : "ems-in"}>{line.delta > 0 ? "+" : ""}{line.delta}</span>
                        {" "}{line.lot || "no lot"}{line.expiration ? ` · exp ${formatDate(line.expiration)}` : ""}
                      </li>
                    ))}
                  </ul>
                </td>
                <td>{t.createdByName}</td>
                <td>
                  {canApprove && t.type !== "reversal" && !reversedIds.has(t.id) ? (
                    <button type="button" className="secondary-button" onClick={() => setReversing(t)} title="Reverse"><Undo2 size={14} /><span className="sr-only">Reverse</span></button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !error ? <div className="empty-table">No inventory activity yet.</div> : null}
      </div>
      {reversing ? (
        <ReverseModal departmentId={departmentId} transaction={reversing} onClose={() => setReversing(null)}
          onDone={(text) => { setReversing(null); onMessage(text); }} />
      ) : null}
    </Panel>
  );
}
