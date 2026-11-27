import { useMemo, useState } from "react";
import { Modal } from "../../shell/ui.jsx";
import { CONDITIONS, CONDITION_LABELS, DEFAULT_EQUIPMENT_CATEGORIES } from "../../../lib/ems/equipmentDisplay.js";
import { describeError, saveEquipment } from "../../../lib/ems/emsEquipmentService.js";
import AssignmentFields from "./AssignmentFields.jsx";

const EMPTY = {
  assetNumber: "", name: "", description: "", category: "", manufacturer: "", model: "", serialNumber: "", barcode: "",
  purchaseDate: "", purchasePrice: "", vendorName: "", warrantyExpiration: "", replacementDate: "", condition: "good", notes: "",
};
const EMPTY_SCHEDULES = {
  inspectionIntervalDays: "", nextInspectionDue: "", calibrationIntervalDays: "", nextCalibrationDue: "",
  maintenanceIntervalDays: "", nextMaintenanceDue: "",
};
const blank = (v) => (v === null || v === undefined ? "" : v);

/** Register new equipment or edit an existing record's details and schedules. */
export default function EquipmentFormModal({
  departmentId, record, equipment, stations, fleetAssets, locations, onClose, onDone,
}) {
  const editing = Boolean(record?.id);
  const [form, setForm] = useState(() => {
    const base = { ...EMPTY };
    for (const key of Object.keys(EMPTY)) base[key] = blank(record?.[key] ?? EMPTY[key]);
    return base;
  });
  const [schedules, setSchedules] = useState(() => {
    const base = { ...EMPTY_SCHEDULES };
    for (const key of Object.keys(EMPTY_SCHEDULES)) base[key] = blank(record?.schedules?.[key]);
    return base;
  });
  const [assignment, setAssignment] = useState({ fleetAssetId: "", locationId: "", stationName: "" });
  const [inService, setInService] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const categories = useMemo(() => [...new Set([...DEFAULT_EQUIPMENT_CATEGORIES, ...equipment.map((e) => e.category).filter(Boolean)])].sort(), [equipment]);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const setSchedule = (key) => (e) => setSchedules((p) => ({ ...p, [key]: e.target.value }));

  async function save(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = { ...form, schedules, ...(editing ? { id: record.id } : { assignment, status: inService ? "in_service" : "" }) };
      const { equipmentId } = await saveEquipment(departmentId, payload);
      onDone(`${form.name} ${editing ? "saved" : "registered"}.`, equipmentId);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  const field = (key, label, props = {}) => (
    <label className={`config-field ${props.wide ? "ems-span-2" : ""}`}>
      <span>{label}{props.required ? " *" : ""}</span>
      <input value={form[key]} onChange={set(key)} maxLength={props.max || 120} required={props.required} type={props.type || "text"}
        step={props.step} min={props.min} placeholder={props.placeholder} inputMode={props.inputMode} />
    </label>
  );
  const scheduleRow = (label, intervalKey, nextKey) => (
    <>
      <label className="config-field">
        <span>{label} every (days)</span>
        <input type="number" min="1" max="3650" step="1" inputMode="numeric" value={schedules[intervalKey]} onChange={setSchedule(intervalKey)} />
      </label>
      <label className="config-field">
        <span>Next {label.toLowerCase()}</span>
        <input type="date" value={schedules[nextKey]} onChange={setSchedule(nextKey)} />
      </label>
    </>
  );

  return (
    <Modal title={editing ? `Edit ${record.name}` : "Register equipment"} onClose={onClose}>
      <form className="ems-form" onSubmit={save}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <div className="ems-form-grid">
          {field("name", "Name", { required: true, wide: true })}
          <label className="config-field">
            <span>Category *</span>
            <input list="ems-equipment-categories" value={form.category} onChange={set("category")} maxLength={60} required />
            <datalist id="ems-equipment-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          {field("assetNumber", "Equipment ID", { max: 60, placeholder: editing ? "" : "Made for you if blank" })}
          {field("manufacturer", "Manufacturer")}
          {field("model", "Model")}
          {field("serialNumber", "Serial number", { max: 80 })}
          {field("barcode", "Barcode", { max: 80 })}
          <label className="config-field">
            <span>Condition</span>
            <select value={form.condition} onChange={set("condition")}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
            </select>
          </label>
          {field("vendorName", "Vendor")}
          {field("purchaseDate", "Purchase date", { type: "date" })}
          {field("purchasePrice", "Purchase price ($)", { type: "number", step: "0.01", min: "0", inputMode: "decimal" })}
          {field("warrantyExpiration", "Warranty expires", { type: "date" })}
          {field("replacementDate", "Replace by", { type: "date" })}
          <label className="config-field ems-span-2"><span>Description</span><textarea rows={2} value={form.description} onChange={set("description")} maxLength={1000} /></label>
        </div>

        <h3 className="ems-subhead">Schedules</h3>
        <p className="occupancy-muted ems-hint">Passing an inspection or calibration, or completing maintenance, sets the next date from the interval.</p>
        <div className="ems-form-grid">
          {scheduleRow("Inspection", "inspectionIntervalDays", "nextInspectionDue")}
          {scheduleRow("Calibration", "calibrationIntervalDays", "nextCalibrationDue")}
          {scheduleRow("Maintenance", "maintenanceIntervalDays", "nextMaintenanceDue")}
        </div>

        {!editing ? (
          <>
            <h3 className="ems-subhead">Where it goes</h3>
            <AssignmentFields value={assignment} onChange={setAssignment} stations={stations} fleetAssets={fleetAssets} locations={locations} />
            <label className="ems-check"><input type="checkbox" checked={inService} onChange={(e) => setInService(e.target.checked)} /> In service now</label>
          </>
        ) : (
          <p className="occupancy-muted ems-hint">To move it or change its status, use the actions on the equipment record.</p>
        )}

        <label className="config-field ems-span-2"><span>Notes</span><textarea rows={3} value={form.notes} onChange={set("notes")} maxLength={2000} /></label>
        <div className="df-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Register"}</button>
        </div>
      </form>
    </Modal>
  );
}
