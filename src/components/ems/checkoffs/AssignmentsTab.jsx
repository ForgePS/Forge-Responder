import { useMemo, useState } from "react";
import { CirclePlus } from "lucide-react";
import { Modal } from "../../shell/ui.jsx";
import { isUsableChecklist } from "../../../lib/fleet/index.js";
import { FREQUENCY_KINDS, FREQUENCY_LABELS, TARGET_LABELS, TARGET_SHORT_LABELS, TARGET_TYPES, frequencyLabel } from "../../../lib/ems/checkoffLogic.js";
import { describeError, saveCheckoffAssignment } from "../../../lib/ems/emsCheckoffService.js";

const unitName = (a = {}) => a.unitDesignation || a.fleetNumber || a.name || a.id;

function AssignmentForm({ departmentId, record, templates, assets, fleetClasses, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    templateId: record?.templateId || templates[0]?.id || "",
    targetType: record?.targetType || "vehicle",
    targetId: record?.targetId || "",
    kind: record?.frequency?.kind || "daily",
    days: record?.frequency?.days || 3,
    requiresSignOff: Boolean(record?.requiresSignOff),
    active: record ? record.active !== false : true,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const stations = useMemo(() => [...new Set(assets.map((a) => a.station).filter(Boolean))].sort(), [assets]);
  const targets = form.targetType === "vehicle"
    ? assets.map((a) => ({ id: a.id, label: `${unitName(a)}${a.station ? ` · ${a.station}` : ""}` }))
    : form.targetType === "fleetClass"
      ? fleetClasses.map((c) => ({ id: c.id, label: c.name || c.id }))
      : stations.map((s) => ({ id: s, label: s }));

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveCheckoffAssignment(departmentId, {
        id: record?.id || "",
        templateId: form.templateId,
        targetType: form.targetType,
        targetId: form.targetId,
        frequency: form.kind === "every_n_days" ? { kind: form.kind, days: Number(form.days) } : { kind: form.kind },
        requiresSignOff: form.requiresSignOff,
        active: form.active,
      });
      onSaved(record ? "Assignment saved." : "Check-off assigned.");
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={record ? "Edit assignment" : "Assign a check-off"} onClose={onClose}>
      <form className="ems-form" onSubmit={save}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        {!templates.length ? (
          <p className="occupancy-muted">Publish a checklist in Apparatus Check Setup first.</p>
        ) : null}
        <div className="ems-form-grid">
          <label className="config-field">
            <span>Checklist *</span>
            <select value={form.templateId} onChange={set("templateId")} required>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>For *</span>
            <select value={form.targetType} onChange={(e) => setForm((f) => ({ ...f, targetType: e.target.value, targetId: "" }))}>
              {TARGET_TYPES.map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>{form.targetType === "vehicle" ? "Vehicle" : form.targetType === "fleetClass" ? "Fleet class" : "Station"} *</span>
            <select value={form.targetId} onChange={set("targetId")} required>
              <option value="">Choose…</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>How often *</span>
            <select value={form.kind} onChange={set("kind")}>
              {FREQUENCY_KINDS.map((k) => <option key={k} value={k}>{FREQUENCY_LABELS[k]}</option>)}
            </select>
          </label>
          {form.kind === "every_n_days" ? (
            <label className="config-field">
              <span>Days between *</span>
              <input type="number" min={2} max={365} step={1} value={form.days} onChange={set("days")} required />
            </label>
          ) : null}
        </div>
        <label className="ems-check"><input type="checkbox" checked={form.requiresSignOff} onChange={set("requiresSignOff")} /> A supervisor signs off each one</label>
        <label className="ems-check"><input type="checkbox" checked={form.active} onChange={set("active")} /> Active</label>
        <p className="occupancy-muted ems-hint">A check-off is due on the day its interval ends after the last one was finished, and overdue the day after. Daily check-offs are due every day.</p>
        <div className="df-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving || !templates.length}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Which checklist is due on which vehicles, and how often. */
export default function AssignmentsTab({ departmentId, assignments, templates, assets, fleetClasses, canManage, onMessage }) {
  const [editing, setEditing] = useState(null);
  const usable = templates.filter(isUsableChecklist);
  const templateName = (id) => templates.find((t) => t.id === id)?.name;
  const sorted = [...assignments].sort((a, b) => Number(b.active !== false) - Number(a.active !== false)
    || String(a.targetLabel).localeCompare(String(b.targetLabel), undefined, { numeric: true }));

  return (
    <>
      <section className="cert-toolbar">
        <p className="occupancy-muted ems-hint">
          Checklists are built in Apparatus Check Setup. Add the "EMS equipment on the unit" and "EMS supplies on the unit" items to check equipment and count supplies.
        </p>
        {canManage ? (
          <button type="button" className="primary-button" onClick={() => setEditing({})}><CirclePlus size={14} /> Assign a check-off</button>
        ) : null}
      </section>
      <div className="data-table-wrap">
        <table>
          <thead><tr><th>Checklist</th><th>For</th><th>How often</th><th>Sign-off</th><th>Status</th>{canManage ? <th /> : null}</tr></thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.id}>
                <td>{templateName(a.templateId) || a.templateName}</td>
                <td>{a.targetType === "vehicle" ? a.targetLabel : `${TARGET_SHORT_LABELS[a.targetType] || a.targetType}: ${a.targetLabel}`}</td>
                <td>{frequencyLabel(a.frequency)}</td>
                <td>{a.requiresSignOff ? "Needed" : "Not needed"}</td>
                <td><span className={`badge badge-${a.active === false ? "neutral" : "success"}`}>{a.active === false ? "Off" : "Active"}</span></td>
                {canManage ? <td><button type="button" className="link-button" onClick={() => setEditing(a)}>Edit</button></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!assignments.length ? <div className="empty-table">No check-offs are assigned yet.</div> : null}
      </div>
      {editing ? (
        <AssignmentForm
          departmentId={departmentId}
          record={editing.id ? editing : null}
          templates={usable}
          assets={assets}
          fleetClasses={fleetClasses}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); onMessage(text); }}
        />
      ) : null}
    </>
  );
}
