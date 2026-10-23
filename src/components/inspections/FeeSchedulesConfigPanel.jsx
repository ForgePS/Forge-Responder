import { useEffect, useState } from "react";
import { DollarSign, Save } from "lucide-react";
import {
  ensureFeeSchedulesSeeded,
  formatCurrency,
  getFeeTypeOptions,
  saveFeeSchedule,
} from "../../lib/inspections/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Fee schedule panel for Inspection Config Studio (Phase 9).
 */
export default function FeeSchedulesConfigPanel({
  departmentId,
  actor = {},
  canManage = false,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [schedules, setSchedules] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);

  const types = getFeeTypeOptions();

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    setError("");
    try {
      const next = await ensureFeeSchedulesSeeded(departmentId, actor);
      setSchedules(next);
      setSelectedId((current) => current || next[0]?.id || "");
      setDraft(next[0] || null);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load fee schedules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    const next = schedules.find((row) => row.id === selectedId) || null;
    setDraft(next ? { ...next } : null);
  }, [selectedId, schedules]);

  async function handleSave() {
    if (!canManage || !draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveFeeSchedule(departmentId, {
        ...draft,
        amount: Number(draft.amount) || 0,
      }, actor);
      setSchedules((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setSelectedId(saved.id);
      setMessage("Fee schedule saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save fee schedule.");
    } finally {
      setSaving(false);
    }
  }

  function handleNew() {
    setSelectedId("");
    setDraft({
      id: "",
      feeTypeId: "custom",
      name: "New fee",
      amount: 0,
      unit: "flat",
      active: true,
      description: "",
      glCode: "",
    });
  }

  if (loading) return <p className="occupancy-muted">Loading fee schedules…</p>;

  return (
    <section className="personnel-workspace occupancy-workspace">
      {error ? <p className="occupancy-error">{error}</p> : null}
      {message ? <p className="occupancy-message">{message}</p> : null}

      <section className="panel">
        <header>
          <div>
            <DollarSign size={15} />
            <strong>Fee schedules</strong>
          </div>
          {canManage ? (
            <button className="secondary-button" type="button" onClick={handleNew}>
              New schedule item
            </button>
          ) : null}
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">
            Schedule items seed default amounts for Prevention → Fees & Payments. Online payment
            gateways are deferred; staff record cash/check/card payments in the fees board.
          </p>
          <div className="personnel-list">
            {schedules.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === selectedId ? "person-row selected" : "person-row"}
                onClick={() => setSelectedId(item.id)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small className="occupancy-muted">
                    {" "}{types.find((row) => row.id === item.feeTypeId)?.label || item.feeTypeId}
                    {item.active ? "" : " · inactive"}
                  </small>
                </span>
                <strong>{formatCurrency(item.amount)}</strong>
              </button>
            ))}
          </div>
        </div>
      </section>

      {draft ? (
        <section className="panel">
          <header>
            <div><strong>{draft.id ? "Edit schedule item" : "New schedule item"}</strong></div>
            {canManage ? (
              <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
                <Save size={14} /> {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
          </header>
          <div className="panel-body occupancy-form-grid">
            <Field label="Name" wide>
              <input
                value={draft.name || ""}
                disabled={!canManage}
                onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
              />
            </Field>
            <Field label="Fee type">
              <select
                value={draft.feeTypeId || "custom"}
                disabled={!canManage}
                onChange={(e) => setDraft((c) => ({ ...c, feeTypeId: e.target.value }))}
              >
                {types.map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.amount ?? 0}
                disabled={!canManage}
                onChange={(e) => setDraft((c) => ({ ...c, amount: e.target.value }))}
              />
            </Field>
            <Field label="Unit">
              <select
                value={draft.unit || "flat"}
                disabled={!canManage}
                onChange={(e) => setDraft((c) => ({ ...c, unit: e.target.value }))}
              >
                <option value="flat">Flat</option>
                <option value="per_day">Per day</option>
                <option value="per_sqft">Per sq ft</option>
                <option value="formula">Formula (manual)</option>
              </select>
            </Field>
            <Field label="GL code">
              <input
                value={draft.glCode || ""}
                disabled={!canManage}
                onChange={(e) => setDraft((c) => ({ ...c, glCode: e.target.value }))}
              />
            </Field>
            <label className="occupancy-primary-toggle">
              <input
                type="checkbox"
                checked={draft.active !== false}
                disabled={!canManage}
                onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))}
              />
              Active
            </label>
            <Field label="Description" wide>
              <textarea
                rows={3}
                value={draft.description || ""}
                disabled={!canManage}
                onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))}
              />
            </Field>
          </div>
        </section>
      ) : null}
    </section>
  );
}
