import { useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "../shell/ui.jsx";
import { shortDateLabel, uniqueRecordId } from "../../lib/recordIds.js";

export const WORK_ORDER_CATEGORIES = ["General", "PM", "Pump", "Electrical", "Tires", "Body", "Repair"];
export const WORK_ORDER_PRIORITIES = ["Medium", "High", "Low"];

/** Parse a cost like "$1,250.00" or "1250" into a number; "Pending" and blanks give 0. */
export function parseCost(value) {
  const number = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

/**
 * New work order form shared by Maintenance and Apparatus. `unitNames` lists the
 * units to choose from; pass `fixedUnit` to lock it to one unit.
 */
export default function WorkOrderModal({ unitNames = [], fixedUnit = "", vendors = [], onCreate, onClose }) {
  const [form, setForm] = useState({
    unit: fixedUnit || unitNames[0] || "",
    priority: "Medium",
    issue: "",
    category: "General",
    vendor: "",
    cost: "",
  });
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  function submit() {
    if (!form.unit) { setError("Choose a unit."); return; }
    if (!form.issue.trim()) { setError("Describe the issue."); return; }
    const cost = form.cost.trim();
    onCreate({
      id: uniqueRecordId("WO"),
      unit: form.unit,
      issue: form.issue.trim(),
      category: form.category,
      priority: form.priority,
      opened: shortDateLabel(),
      openedAt: new Date().toISOString(),
      vendor: form.vendor.trim() || "Internal Fleet",
      cost: cost ? (cost.startsWith("$") ? cost : `$${cost}`) : "Pending",
      status: "Open",
    });
  }

  const vendorOptions = [...new Set(["Internal Fleet", ...vendors.filter(Boolean)])];
  return (
    <Modal title={fixedUnit ? `New Work Order - ${fixedUnit}` : "New Work Order"} onClose={onClose}>
      <div className="workflow-form">
        {error && <p className="form-error" role="alert">{error}</p>}
        <label><span>Unit</span>
          {fixedUnit
            ? <input value={fixedUnit} readOnly />
            : <select value={form.unit} onChange={set("unit")}>{unitNames.length ? unitNames.map((name) => <option key={name}>{name}</option>) : <option value="">No apparatus on file</option>}</select>}
        </label>
        <label><span>Priority</span><select value={form.priority} onChange={set("priority")}>{WORK_ORDER_PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="wide-field"><span>Issue Description</span><input value={form.issue} placeholder="What needs to be done?" onChange={set("issue")} /></label>
        <label><span>Category</span><select value={form.category} onChange={set("category")}>{WORK_ORDER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label><span>Vendor</span><input list="work-order-vendors" value={form.vendor} placeholder="Internal Fleet" onChange={set("vendor")} /><datalist id="work-order-vendors">{vendorOptions.map((v) => <option key={v} value={v} />)}</datalist></label>
        <label><span>Estimated Cost</span><input value={form.cost} placeholder="Pending" inputMode="decimal" onChange={set("cost")} /></label>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" onClick={submit}><Check size={14} /> Create Work Order</button>
      </div>
    </Modal>
  );
}
