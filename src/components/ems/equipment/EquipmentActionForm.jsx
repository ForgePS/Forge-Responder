import { useState } from "react";
import {
  MANUAL_STATUSES, REASON_REQUIRED_STATUSES, STATUS_INFO, describeAssignment,
} from "../../../lib/ems/equipmentDisplay.js";
import {
  completeEquipmentMaintenance, describeError, newRequestId, recordEquipmentInspection, reportEquipmentProblem,
  setEquipmentStatus, transferEquipment, verifyEquipment,
} from "../../../lib/ems/emsEquipmentService.js";
import AssignmentFields from "./AssignmentFields.jsx";

export const ACTION_TITLES = {
  verify: "Verify it's here",
  found: "Mark as found",
  damaged: "Report a deficiency",
  maintenance: "Request maintenance",
  missing: "Report missing",
  inspection: "Record an inspection",
  calibration: "Record a calibration",
  transfer: "Move equipment",
  maintain: "Complete maintenance",
  status: "Change status",
};

/**
 * One action on one record. The request id is made once when the form opens,
 * so pressing Save again after a dropped connection can't record it twice.
 */
export default function EquipmentActionForm({
  departmentId, record, mode, stations, fleetAssets, locations, onCancel, onDone,
}) {
  const [requestId] = useState(newRequestId);
  // The statuses this record may move to; the select starts on the first of them.
  const statusChoices = MANUAL_STATUSES.filter((s) => {
    if (s === record.status) return false;
    if (record.status === "missing") return s === "retired";
    if (s === "disposed") return record.status === "retired";
    return true;
  });
  const [form, setForm] = useState({
    note: "", description: "", takeOutOfService: false, result: "pass", reason: "", cost: "", vendorName: "",
    returnToService: true, status: statusChoices[0] || "",
  });
  const [to, setTo] = useState({ fleetAssetId: "", locationId: "", stationName: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const name = record.name;

  async function save(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      let message = "";
      if (mode === "verify" || mode === "found") {
        await verifyEquipment(departmentId, record.id, requestId, form.note);
        message = mode === "found" ? `${name} marked as found.` : `${name} verified.`;
      } else if (["damaged", "maintenance", "missing"].includes(mode)) {
        await reportEquipmentProblem(departmentId, record.id, requestId, {
          kind: mode, description: form.description, takeOutOfService: mode === "damaged" && form.takeOutOfService,
        });
        message = { damaged: `Deficiency reported for ${name}.`, maintenance: `Maintenance requested for ${name}.`, missing: `${name} reported missing.` }[mode];
      } else if (mode === "inspection" || mode === "calibration") {
        await recordEquipmentInspection(departmentId, record.id, requestId, { kind: mode, result: form.result, notes: form.note });
        message = `${mode === "inspection" ? "Inspection" : "Calibration"} ${form.result === "pass" ? "passed" : "failed"} for ${name}.`;
      } else if (mode === "transfer") {
        await transferEquipment(departmentId, record.id, requestId, to, form.reason);
        message = `${name} moved.`;
      } else if (mode === "maintain") {
        await completeEquipmentMaintenance(departmentId, record.id, requestId, {
          notes: form.note, cost: form.cost, vendorName: form.vendorName, returnToService: form.returnToService,
        });
        message = `Maintenance recorded for ${name}.`;
      } else if (mode === "status") {
        await setEquipmentStatus(departmentId, record.id, requestId, form.status, form.reason);
        message = `${name} is now ${STATUS_INFO[form.status]?.label.toLowerCase()}.`;
      }
      onDone(message);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  const textarea = (key, label, required, placeholder = "") => (
    <label className="config-field ems-span-2">
      <span>{label}{required ? " *" : ""}</span>
      <textarea rows={3} value={form[key]} onChange={set(key)} maxLength={1000} required={required} placeholder={placeholder} />
    </label>
  );

  return (
    <form className="ems-form ems-action-form" onSubmit={save}>
      <h3 className="ems-subhead">{ACTION_TITLES[mode]}</h3>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <div className="ems-form-grid">
        {mode === "verify" || mode === "found" ? (
          <>
            <p className="ems-span-2 occupancy-muted">
              {mode === "found"
                ? `Records that ${name} was found at ${describeAssignment(record.assignment)}. Move it afterwards if it belongs somewhere else.`
                : `Records that you saw ${name} at ${describeAssignment(record.assignment)} just now.`}
            </p>
            {textarea("note", "Note", false)}
          </>
        ) : null}

        {["damaged", "maintenance", "missing"].includes(mode) ? (
          <>
            {textarea("description", mode === "missing" ? "Where was it last seen?" : "What's wrong?", true)}
            {mode === "damaged" ? (
              <label className="ems-check"><input type="checkbox" checked={form.takeOutOfService} onChange={set("takeOutOfService")} /> Take it out of use until it's repaired</label>
            ) : null}
            {mode === "maintenance" ? <p className="ems-span-2 occupancy-muted">The equipment shows as Maintenance required until a manager records the repair.</p> : null}
          </>
        ) : null}

        {mode === "inspection" || mode === "calibration" ? (
          <>
            <fieldset className="ems-span-2 ems-radio-row">
              <legend>Result *</legend>
              <label><input type="radio" name="result" value="pass" checked={form.result === "pass"} onChange={set("result")} /> Pass</label>
              <label><input type="radio" name="result" value="fail" checked={form.result === "fail"} onChange={set("result")} /> Fail</label>
            </fieldset>
            {textarea("note", form.result === "fail" ? "What failed?" : "Notes", form.result === "fail")}
            {form.result === "fail" ? <p className="ems-span-2 occupancy-muted">A failed {mode} marks the equipment Maintenance required.</p> : null}
          </>
        ) : null}

        {mode === "transfer" ? (
          <div className="ems-span-2">
            <p className="occupancy-muted">Now at {describeAssignment(record.assignment)}. Choose where it's going; leave everything blank to unassign it.</p>
            <AssignmentFields value={to} onChange={setTo} stations={stations} fleetAssets={fleetAssets} locations={locations} />
            <label className="config-field"><span>Reason</span><input value={form.reason} onChange={set("reason")} maxLength={300} /></label>
          </div>
        ) : null}

        {mode === "maintain" ? (
          <>
            {record.openProblem ? <p className="ems-span-2 occupancy-muted">Open problem: {record.openProblem.description}</p> : null}
            {textarea("note", "What was done?", true)}
            <label className="config-field"><span>Vendor / shop</span><input value={form.vendorName} onChange={set("vendorName")} maxLength={120} /></label>
            <label className="config-field"><span>Cost ($)</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.cost} onChange={set("cost")} /></label>
            <label className="ems-check"><input type="checkbox" checked={form.returnToService} onChange={set("returnToService")} /> Fixed: clear the problem and put it back in use</label>
          </>
        ) : null}

        {mode === "status" ? (
          <>
            <label className="config-field ems-span-2">
              <span>New status *</span>
              <select value={form.status} onChange={set("status")} required>
                {statusChoices.map((s) => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
              </select>
            </label>
            {form.status === "disposed" ? <p className="ems-span-2 occupancy-muted">Disposed is final: the record stays for history but can't change again.</p> : null}
            <label className="config-field ems-span-2">
              <span>Reason{REASON_REQUIRED_STATUSES.includes(form.status) || record.status === "retired" ? " *" : ""}</span>
              <input value={form.reason} onChange={set("reason")} maxLength={500}
                required={REASON_REQUIRED_STATUSES.includes(form.status) || record.status === "retired"} />
            </label>
          </>
        ) : null}
      </div>
      <div className="df-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>Back</button>
        <button type="submit" className="primary-button" disabled={saving || (mode === "status" && !statusChoices.length)}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
