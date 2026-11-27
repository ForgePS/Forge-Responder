import { useEffect, useMemo, useState } from "react";
import { READINESS_RULES, SEVERITIES, SEVERITY_LABELS } from "../../../lib/ems/checkoffLogic.js";
import { DEFAULT_EQUIPMENT_CATEGORIES } from "../../../lib/ems/equipmentDisplay.js";
import { describeError, saveReadinessRules } from "../../../lib/ems/emsCheckoffService.js";

/** What makes an EMS unit not ready or ready with issues. */
export default function RulesTab({ departmentId, rules, equipment, canManage, onMessage }) {
  const [draft, setDraft] = useState(rules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(rules); }, [rules]);

  const categories = useMemo(() => [...new Set([
    ...DEFAULT_EQUIPMENT_CATEGORIES,
    ...equipment.map((e) => e.category).filter(Boolean),
    ...rules.requiredEquipmentCategories,
  ])].sort(), [equipment, rules]);
  const required = new Set(draft.requiredEquipmentCategories);
  const changed = JSON.stringify(draft) !== JSON.stringify(rules);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveReadinessRules(departmentId, draft);
      onMessage("Readiness rules saved.");
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-body">
        <p className="occupancy-muted ems-hint">
          A unit is <strong>Not ready</strong> when any rule set to Not ready applies, and <strong>Ready with issues</strong> when a Warning applies.
          A vehicle Fleet has out of service is always not ready. EMS readiness is shown here; it doesn't change the vehicle's Fleet status.
        </p>
        <div className="ems-rules-grid">
          {READINESS_RULES.map((rule) => (
            <label key={rule.key} className="ems-rule-row">
              <span>{rule.label}</span>
              <select value={draft[rule.key]} disabled={!canManage} onChange={(e) => setDraft((d) => ({ ...d, [rule.key]: e.target.value }))}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
              </select>
            </label>
          ))}
        </div>
        <h3 className="ems-subhead">Equipment every unit must carry</h3>
        <p className="occupancy-muted ems-hint">A unit with nothing usable in one of these categories matches the "required equipment category" rule.</p>
        <div className="ems-chip-list">
          {categories.map((c) => (
            <label key={c} className="ems-chip">
              <input
                type="checkbox"
                checked={required.has(c)}
                disabled={!canManage}
                onChange={(e) => setDraft((d) => ({
                  ...d,
                  requiredEquipmentCategories: e.target.checked
                    ? [...d.requiredEquipmentCategories, c]
                    : d.requiredEquipmentCategories.filter((x) => x !== c),
                }))}
              />
              {c}
            </label>
          ))}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {canManage ? (
          <div className="df-actions">
            <button type="button" className="secondary-button" disabled={!changed || saving} onClick={() => setDraft(rules)}>Undo changes</button>
            <button type="button" className="primary-button" disabled={!changed || saving} onClick={save}>{saving ? "Saving…" : "Save rules"}</button>
          </div>
        ) : <p className="occupancy-muted">Only members who manage EMS check-offs can change these.</p>}
      </div>
    </section>
  );
}
