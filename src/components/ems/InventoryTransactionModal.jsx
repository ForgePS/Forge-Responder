import { useMemo, useState } from "react";
import { Modal } from "../shell/ui.jsx";
import {
  REASON_REQUIRED, TRANSACTION_TYPES, expirationStatus, formatDate, locationPath, todayIso,
} from "../../lib/ems/inventoryDisplay.js";
import { describeError, newRequestId, postInventoryTransaction } from "../../lib/ems/emsInventoryService.js";

const AUTO_LOT = "";

/**
 * Record one stock movement. The request id is made once when the dialog opens,
 * so pressing Save again after a dropped connection can't move stock twice.
 */
export default function InventoryTransactionModal({
  departmentId, items, locations, balances, settings, canUse, canManage, preset = {}, onClose, onDone,
}) {
  const allowedTypes = Object.entries(TRANSACTION_TYPES)
    .filter(([, rule]) => (rule.access === "use" ? canUse || canManage : canManage));
  const [requestId] = useState(newRequestId);
  const [form, setForm] = useState({
    type: preset.type && allowedTypes.some(([key]) => key === preset.type) ? preset.type : allowedTypes[0]?.[0] || "",
    itemId: preset.itemId || "",
    fromLocationId: preset.fromLocationId || "",
    toLocationId: preset.toLocationId || "",
    quantity: "",
    lotKey: AUTO_LOT,
    lot: "",
    expiration: "",
    unitCost: "",
    reason: "",
    incidentNumber: "",
    note: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const rule = TRANSACTION_TYPES[form.type] || { direction: "out" };
  const locationsById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const activeLocations = locations.filter((l) => l.active !== false)
    .map((l) => ({ ...l, path: locationPath(l, locationsById) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const activeItems = items.filter((i) => i.active !== false || i.id === form.itemId).sort((a, b) => a.name.localeCompare(b.name));
  const item = items.find((i) => i.id === form.itemId);
  const fromBalance = balances.find((b) => b.itemId === form.itemId && b.locationId === form.fromLocationId);
  const today = todayIso();
  const warningDays = settings?.expirationWarningDays;
  // Offer only the lots the server will accept: expired lots for "remove expired",
  // unexpired lots for use and transfer, any lot otherwise.
  const lotIsExpired = (lot) => expirationStatus(lot.expiration, warningDays, today).level === "expired";
  const lots = (fromBalance?.lots || []).filter((lot) => {
    if (!(lot.quantity > 0)) return false;
    if (form.type === "expired") return lotIsExpired(lot);
    if (form.type === "usage" || form.type === "transfer") return !lotIsExpired(lot);
    return true;
  });

  async function save(event) {
    event.preventDefault();
    setError("");
    if (!form.type || !form.itemId) return setError("Choose what happened and the item.");
    if (rule.direction !== "in" && !form.fromLocationId) return setError("Choose where the stock comes from.");
    if (rule.direction !== "out" && !form.toLocationId) return setError("Choose where the stock goes.");
    if (!(Number(form.quantity) >= 1) || !Number.isInteger(Number(form.quantity))) return setError("Quantity must be a whole number of one or more.");
    if (REASON_REQUIRED.includes(form.type) && !form.reason.trim()) return setError("Give a reason.");
    setSaving(true);
    try {
      const result = await postInventoryTransaction(departmentId, {
        requestId,
        type: form.type,
        itemId: form.itemId,
        quantity: Number(form.quantity),
        fromLocationId: rule.direction === "in" ? "" : form.fromLocationId,
        toLocationId: rule.direction === "out" ? "" : form.toLocationId,
        lotKey: rule.direction === "in" ? "" : form.lotKey,
        lot: rule.direction === "in" ? form.lot : "",
        expiration: rule.direction === "in" ? form.expiration : "",
        unitCost: rule.direction === "in" ? form.unitCost : "",
        reason: form.reason,
        incidentNumber: form.incidentNumber,
        note: form.note,
      });
      onDone(`${TRANSACTION_TYPES[form.type].label}: ${form.quantity} ${item?.unitOfMeasure || ""} ${item?.name || ""}.${result.replayed ? " (Already saved earlier.)" : ""}`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  const locationSelect = (key, label) => (
    <label className="config-field">
      <span>{label} *</span>
      <select value={form[key]} onChange={set(key)} required>
        <option value="">Choose a location</option>
        {activeLocations.map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
      </select>
    </label>
  );

  return (
    <Modal title="Record inventory" onClose={onClose}>
      <form className="ems-form" onSubmit={save}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <div className="ems-form-grid">
          <label className="config-field">
            <span>What happened *</span>
            <select value={form.type} onChange={set("type")}>
              {allowedTypes.map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Item *</span>
            <select value={form.itemId} onChange={(e) => setForm((prev) => ({ ...prev, itemId: e.target.value, lotKey: AUTO_LOT }))} required>
              <option value="">Choose an item</option>
              {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unitOfMeasure || "each"})</option>)}
            </select>
          </label>
          {rule.direction !== "in" ? locationSelect("fromLocationId", rule.direction === "move" ? "From" : "Location") : null}
          {rule.direction !== "out" ? locationSelect("toLocationId", rule.direction === "move" ? "To" : "Receive into") : null}
          <label className="config-field">
            <span>Quantity{item ? ` (${item.unitOfMeasure || "each"})` : ""} *</span>
            <input type="number" min="1" step="1" inputMode="numeric" value={form.quantity} onChange={set("quantity")} required />
          </label>
          {rule.direction === "in" ? (
            <>
              <label className="config-field">
                <span>Lot number{item?.tracksLots ? " *" : ""}</span>
                <input value={form.lot} onChange={set("lot")} maxLength={60} required={Boolean(item?.tracksLots)} />
              </label>
              <label className="config-field">
                <span>Expiration{item?.tracksExpiration ? " *" : ""}</span>
                <input type="date" value={form.expiration} onChange={set("expiration")} required={Boolean(item?.tracksExpiration)} />
              </label>
              <label className="config-field">
                <span>Unit cost</span>
                <input type="number" min="0" step="0.01" value={form.unitCost} onChange={set("unitCost")} placeholder={item?.unitCost ?? ""} />
              </label>
            </>
          ) : (
            <label className="config-field ems-span-2">
              <span>Lot</span>
              <select value={form.lotKey} onChange={set("lotKey")} disabled={!lots.length}>
                <option value={AUTO_LOT}>{settings?.rotationPolicy === "fifo" ? "Automatic (oldest received first)" : "Automatic (soonest expiration first)"}</option>
                {lots.map((lot) => {
                  const status = expirationStatus(lot.expiration, warningDays, today);
                  return (
                    <option key={lot.key} value={lot.key}>
                      {lot.lot || "No lot"} · {lot.expiration ? `exp ${formatDate(lot.expiration)}` : "no expiration"} · {lot.quantity} on hand{status.level === "expired" ? " · EXPIRED" : ""}
                    </option>
                  );
                })}
              </select>
              {form.fromLocationId && form.itemId && !lots.length ? <small className="occupancy-muted">None on hand at this location.</small> : null}
            </label>
          )}
          {form.type === "usage" ? (
            <label className="config-field">
              <span>Incident number</span>
              <input value={form.incidentNumber} onChange={set("incidentNumber")} maxLength={40} />
            </label>
          ) : null}
          <label className="config-field ems-span-2">
            <span>Reason{REASON_REQUIRED.includes(form.type) ? " *" : ""}</span>
            <input value={form.reason} onChange={set("reason")} maxLength={300} required={REASON_REQUIRED.includes(form.type)} />
          </label>
          <label className="config-field ems-span-2">
            <span>Note</span>
            <textarea rows={2} value={form.note} onChange={set("note")} maxLength={500} />
          </label>
        </div>
        <div className="df-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
