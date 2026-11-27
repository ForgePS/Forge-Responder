import { useMemo, useState } from "react";
import { Lock, PackageMinus, Plus, ShieldAlert, Unlock } from "lucide-react";
import { Badge, Modal, Panel } from "../../shell/ui.jsx";
import { RECALL_CLASSES, formatDate, formatWhen, locationPath } from "../../../lib/ems/inventoryDisplay.js";
import {
  closeMedicationRecall, createMedicationRecall, describeError, placeLotHold, releaseLotHold,
} from "../../../lib/ems/emsInventoryService.js";
import { lotsOnHand, sameLot } from "../../../lib/ems/medicationScreens.js";



function useAction(onDone) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function run(fn, message) {
    setSaving(true);
    setError("");
    try {
      const result = await fn();
      onDone(typeof message === "function" ? message(result) : message);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }
  return { error, saving, run };
}

function NewRecallModal({ departmentId, medications, lots, onClose, onDone }) {
  const [form, setForm] = useState({ itemIds: [], lotText: "", reason: "", recallClass: "", source: "", reference: "", issuedOn: "", note: "" });
  const { error, saving, run } = useAction(onDone);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const lotNumbers = form.lotText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const matches = lots.filter((l) => form.itemIds.includes(l.item.id) && (!lotNumbers.length || lotNumbers.some((n) => sameLot(n, l.lot))));
  const toggle = (id) => setForm((p) => ({ ...p, itemIds: p.itemIds.includes(id) ? p.itemIds.filter((x) => x !== id) : [...p.itemIds, id] }));

  return (
    <Modal title="Record a medication recall" onClose={onClose}>
      <form className="ems-form" onSubmit={(e) => {
        e.preventDefault();
        if (!form.itemIds.length) return;
        run(() => createMedicationRecall(departmentId, { ...form, lotNumbers }),
          (r) => `Recall recorded. ${r.heldLots ? `${r.heldQuantity} on hand in ${r.heldLots} lot${r.heldLots === 1 ? "" : "s"} put on hold.` : "None of it is on hand."}`);
      }}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <fieldset className="config-field ems-fieldset">
          <legend>Recalled medications *</legend>
          <div className="ems-chip-list">
            {medications.map((m) => (
              <label key={m.id} className="ems-chip"><input type="checkbox" checked={form.itemIds.includes(m.id)} onChange={() => toggle(m.id)} /> {m.name}</label>
            ))}
          </div>
          {!medications.length ? <small className="occupancy-muted">Add medications to the catalog first.</small> : null}
        </fieldset>
        <div className="ems-form-grid">
          <label className="config-field ems-span-2">
            <span>Lot numbers</span>
            <textarea rows={3} value={form.lotText} onChange={set("lotText")} placeholder="One per line. Leave blank if every lot is recalled." />
          </label>
          <label className="config-field ems-span-2"><span>Reason *</span><input value={form.reason} onChange={set("reason")} maxLength={500} required /></label>
          <label className="config-field">
            <span>Recall class</span>
            <select value={form.recallClass} onChange={set("recallClass")}>
              {RECALL_CLASSES.map((c) => <option key={c || "none"} value={c}>{c ? `Class ${c}` : "Not given"}</option>)}
            </select>
          </label>
          <label className="config-field"><span>Issued on</span><input type="date" value={form.issuedOn} onChange={set("issuedOn")} /></label>
          <label className="config-field"><span>Source</span><input value={form.source} onChange={set("source")} maxLength={120} placeholder="Manufacturer, FDA, vendor" /></label>
          <label className="config-field"><span>Reference number</span><input value={form.reference} onChange={set("reference")} maxLength={80} /></label>
          <label className="config-field ems-span-2"><span>Note</span><textarea rows={2} value={form.note} onChange={set("note")} maxLength={1000} /></label>
        </div>
        {form.itemIds.length ? (
          <p className={matches.length ? "checklist-missing-alert" : "occupancy-muted"}>
            {matches.length
              ? `${matches.reduce((s, l) => s + l.onHand, 0)} on hand in ${matches.length} lot${matches.length === 1 ? "" : "s"} will be put on hold everywhere: ${matches.map((l) => `${l.item.name} ${l.lot || "(no lot)"}`).join(", ")}.`
              : "None of the recalled stock is on hand. Lots received later that match are put on hold when received."}
          </p>
        ) : null}
        <div className="df-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving || !form.itemIds.length}>{saving ? "Saving…" : "Record recall"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CloseRecallModal({ departmentId, recall, heldLeft, onClose, onDone }) {
  const [outcome, setOutcome] = useState(heldLeft ? "withdrawn" : "completed");
  const [note, setNote] = useState("");
  const { error, saving, run } = useAction(onDone);
  return (
    <Modal title="Close the recall" onClose={onClose}>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <label className="ems-check"><input type="radio" name="outcome" checked={outcome === "completed"} onChange={() => setOutcome("completed")} disabled={heldLeft > 0} /> Completed: all recalled stock is gone</label>
      {heldLeft > 0 ? <small className="occupancy-muted ems-block">{heldLeft} recalled on hand. Return it to the vendor or waste it before closing the recall as completed.</small> : null}
      <label className="ems-check"><input type="radio" name="outcome" checked={outcome === "withdrawn"} onChange={() => setOutcome("withdrawn")} /> Withdrawn: the recall doesn't apply, release the stock</label>
      <label className="config-field">
        <span>Note{outcome === "withdrawn" ? " *" : ""}</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>
      <div className="df-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" disabled={saving || (outcome === "withdrawn" && !note.trim())}
          onClick={() => run(() => closeMedicationRecall(departmentId, recall.id, outcome, note), `Recall closed as ${outcome}.`)}>
          Close recall
        </button>
      </div>
    </Modal>
  );
}

function HoldModal({ departmentId, medications, lots, onClose, onDone }) {
  const [itemId, setItemId] = useState("");
  const [key, setKey] = useState("");
  const [reason, setReason] = useState("");
  const { error, saving, run } = useAction(onDone);
  const options = lots.filter((l) => l.item.id === itemId && !l.held);
  return (
    <Modal title="Put a lot on hold" onClose={onClose}>
      <form className="ems-form" onSubmit={(e) => { e.preventDefault(); run(() => placeLotHold(departmentId, itemId, key, reason), "Lot put on hold."); }}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <div className="ems-form-grid">
          <label className="config-field">
            <span>Medication *</span>
            <select value={itemId} onChange={(e) => { setItemId(e.target.value); setKey(""); }} required>
              <option value="">Choose…</option>
              {medications.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Lot *</span>
            <select value={key} onChange={(e) => setKey(e.target.value)} required disabled={!options.length}>
              <option value="">{itemId && !options.length ? "No lots on hand" : "Choose…"}</option>
              {options.map((l) => <option key={l.key} value={l.key}>{l.lot || "no lot"} · exp {formatDate(l.expiration)} · {l.onHand} on hand</option>)}
            </select>
          </label>
          <label className="config-field ems-span-2"><span>Reason *</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required placeholder="Temperature excursion, suspected contamination…" /></label>
        </div>
        <p className="occupancy-muted ems-hint">The lot is held everywhere it's stocked: it can't be used until the hold is released.</p>
        <div className="df-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving || !key}>{saving ? "Saving…" : "Put on hold"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReleaseModal({ departmentId, hold, onClose, onDone }) {
  const [note, setNote] = useState("");
  const { error, saving, run } = useAction(onDone);
  return (
    <Modal title={`Release ${hold.itemName} lot ${hold.lot || "(no lot)"}`} onClose={onClose}>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <p>The lot can be used again everywhere it's stocked.</p>
      <label className="config-field"><span>Why is it released? *</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
      <div className="df-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" disabled={saving || !note.trim()} onClick={() => run(() => releaseLotHold(departmentId, hold.id, note), "Hold released.")}>Release</button>
      </div>
    </Modal>
  );
}

function RecallDetailModal({ recall, lots, locationsById, canManage, onRemove, onClose }) {
  const held = lots.filter((l) => l.recallIds.includes(recall.id));
  return (
    <Modal title={`Recall ${recall.reference || ""}`.trim()} onClose={onClose}>
      <dl className="ems-detail-list">
        <dt>Medications</dt><dd>{(recall.itemNames || []).join(", ")}</dd>
        <dt>Lots</dt><dd>{recall.lotNumbers?.length ? recall.lotNumbers.join(", ") : "Every lot"}</dd>
        <dt>Reason</dt><dd>{recall.reason}</dd>
        {recall.recallClass ? <><dt>Class</dt><dd>{recall.recallClass}</dd></> : null}
        {recall.source ? <><dt>Source</dt><dd>{recall.source}</dd></> : null}
        {recall.issuedOn ? <><dt>Issued</dt><dd>{formatDate(recall.issuedOn)}</dd></> : null}
        <dt>Recorded</dt><dd>{formatWhen(recall.createdAt)} by {recall.createdByName}</dd>
        {recall.status === "closed" ? <><dt>Closed</dt><dd>{formatWhen(recall.closedAt)} by {recall.closedByName}: {recall.outcome}{recall.closeNote ? `, ${recall.closeNote}` : ""}</dd></> : null}
        {recall.note ? <><dt>Note</dt><dd>{recall.note}</dd></> : null}
      </dl>
      <h3 className="ems-subhead">Recalled stock on hand</h3>
      {held.length ? (
        <ul className="ems-recall-places">
          {held.flatMap((l) => l.places.map((p) => (
            <li key={`${l.id}-${p.locationId}`}>
              <span><strong>{l.item.name}</strong> lot {l.lot || "(no lot)"} · {p.quantity} at {locationPath(locationsById[p.locationId], locationsById) || "(removed location)"}</span>
              {canManage ? (
                <button type="button" className="secondary-button" onClick={() => onRemove({ type: "returnToVendor", itemId: l.item.id, fromLocationId: p.locationId, lotKey: l.key })}>
                  <PackageMinus size={14} /> Remove
                </button>
              ) : null}
            </li>
          )))}
        </ul>
      ) : <p className="occupancy-muted">None on hand.</p>}
      <div className="df-actions"><button type="button" className="secondary-button" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

/** Medication recalls and lots on hold. */
export default function MedicationRecallsTab({ departmentId, medications, balances, locations, holds, recalls, canManage, onRecord, onMessage }) {
  const [modal, setModal] = useState(null);
  const itemsById = useMemo(() => Object.fromEntries(medications.map((m) => [m.id, m])), [medications]);
  const locationsById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const lots = useMemo(() => lotsOnHand(balances, itemsById), [balances, itemsById]);
  const holdsById = useMemo(() => Object.fromEntries(holds.map((h) => [h.id, h])), [holds]);
  const heldLots = useMemo(() => lots.map((l) => ({ ...l, recallIds: holdsById[l.id]?.recallIds || [] })), [lots, holdsById]);
  const heldFor = (recallId) => heldLots.filter((l) => l.recallIds.includes(recallId)).reduce((s, l) => s + l.onHand, 0);
  const onHandFor = (hold) => lots.find((l) => l.id === hold.id)?.onHand || 0;
  const recallLabel = (id) => recalls.find((r) => r.id === id)?.reference || "recall";
  const open = recalls.filter((r) => r.status === "open");
  const closed = recalls.filter((r) => r.status !== "open");
  const done = (text) => { setModal(null); onMessage(text); };

  const recallRows = (list) => list.map((r) => (
    <tr key={r.id}>
      <td><strong>{r.reference || "No reference"}</strong>{r.recallClass ? <small className="ems-block occupancy-muted">Class {r.recallClass}</small> : null}</td>
      <td>{(r.itemNames || []).join(", ")}<small className="ems-block occupancy-muted">{r.lotNumbers?.length ? `Lots ${r.lotNumbers.join(", ")}` : "Every lot"}</small></td>
      <td>{r.reason}</td>
      <td>{r.issuedOn ? formatDate(r.issuedOn) : formatWhen(r.createdAt)}</td>
      <td className="ems-num">{r.status === "open" ? heldFor(r.id) : "—"}</td>
      <td><Badge tone={r.status === "open" ? "critical" : "neutral"}>{r.status === "open" ? "Open" : `Closed: ${r.outcome}`}</Badge></td>
      <td>
        <div className="ems-row-actions">
          <button type="button" className="link-button" onClick={() => setModal({ kind: "detail", recall: r })}>View</button>
          {canManage && r.status === "open" ? <button type="button" className="link-button" onClick={() => setModal({ kind: "close", recall: r })}>Close</button> : null}
        </div>
      </td>
    </tr>
  ));

  return (
    <>
      <Panel title="Recalls" icon={ShieldAlert}
        action={canManage ? <button type="button" className="primary-button" onClick={() => setModal({ kind: "new" })}><Plus size={14} /> Record a recall</button> : null}>
        <div className="ems-filters"><small className="occupancy-muted">A recall puts every matching lot on hold, wherever it's stocked. Held stock can't be used; return it to the vendor or waste it, then close the recall.</small></div>
        <div className="data-table-wrap">
          <table className="ems-table">
            <thead><tr><th>Recall</th><th>Medications and lots</th><th>Reason</th><th>Issued</th><th>Held now</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{recallRows(open)}{recallRows(closed)}</tbody>
          </table>
          {!recalls.length ? <div className="empty-table">No recalls recorded.</div> : null}
        </div>
      </Panel>
      <Panel title="Lots on hold" icon={Lock}
        action={canManage ? <button type="button" className="secondary-button" onClick={() => setModal({ kind: "hold" })}><Lock size={14} /> Put a lot on hold</button> : null}>
        <div className="data-table-wrap">
          <table className="ems-table">
            <thead><tr><th>Medication</th><th>Lot</th><th>Why</th><th>On hand</th><th>Since</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {holds.filter((h) => itemsById[h.itemId]).map((h) => (
                <tr key={h.id}>
                  <td><strong>{h.itemName}</strong></td>
                  <td>{h.lot || "no lot"}{h.expiration ? <small className="ems-block occupancy-muted">Exp {formatDate(h.expiration)}</small> : null}</td>
                  <td>
                    {(h.recallIds || []).map((id) => <small key={id} className="ems-block">Recall {recallLabel(id)}</small>)}
                    {h.manual ? <small className="ems-block">{h.manual.reason} ({h.manual.byName})</small> : null}
                  </td>
                  <td className="ems-num">{onHandFor(h)}</td>
                  <td>{formatWhen(h.placedAt)}</td>
                  <td>
                    {canManage && !(h.recallIds || []).length ? (
                      <button type="button" className="secondary-button" onClick={() => setModal({ kind: "release", hold: h })}><Unlock size={14} /> Release</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!holds.some((h) => itemsById[h.itemId]) ? <div className="empty-table">No medication lots are on hold.</div> : null}
        </div>
      </Panel>
      {modal?.kind === "new" ? <NewRecallModal departmentId={departmentId} medications={medications} lots={lots} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal?.kind === "close" ? <CloseRecallModal departmentId={departmentId} recall={modal.recall} heldLeft={heldFor(modal.recall.id)} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal?.kind === "hold" ? <HoldModal departmentId={departmentId} medications={medications} lots={lots} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal?.kind === "release" ? <ReleaseModal departmentId={departmentId} hold={modal.hold} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal?.kind === "detail" ? (
        <RecallDetailModal recall={modal.recall} lots={heldLots} locationsById={locationsById} canManage={canManage}
          onRemove={(preset) => { setModal(null); onRecord(preset); }} onClose={() => setModal(null)} />
      ) : null}
    </>
  );
}
