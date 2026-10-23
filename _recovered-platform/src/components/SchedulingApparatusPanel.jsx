import { useMemo } from "react";
import { Truck } from "lucide-react";
import {
  DEFAULT_ROSTER_COMMAND_UNIT,
  normalizeSchedulingSettings,
} from "../lib/schedulingSettings.js";

export default function SchedulingApparatusPanel({
  value,
  onChange,
  availableUnits = [],
  readOnly = false,
}) {
  const normalized = useMemo(
    () => normalizeSchedulingSettings(value, availableUnits),
    [value, availableUnits]
  );

  const unitChoices = useMemo(() => {
    const fleet = (Array.isArray(availableUnits) ? availableUnits : [])
      .map(String)
      .map((unit) => unit.trim())
      .filter(Boolean);
    const configured = normalized.displayApparatus || [];
    return [...new Set([DEFAULT_ROSTER_COMMAND_UNIT, ...fleet, ...configured])];
  }, [availableUnits, normalized.displayApparatus]);

  function toggleUnit(unit) {
    if (readOnly) return;
    const current = normalized.displayApparatus || [];
    const nextUnits = current.includes(unit)
      ? current.filter((entry) => entry !== unit)
      : [...current, unit];
    onChange?.(normalizeSchedulingSettings({ displayApparatus: nextUnits }, availableUnits));
  }

  function selectAll() {
    if (readOnly) return;
    onChange?.(normalizeSchedulingSettings({ displayApparatus: unitChoices }, availableUnits));
  }

  function clearAll() {
    if (readOnly) return;
    onChange?.(normalizeSchedulingSettings({ displayApparatus: [DEFAULT_ROSTER_COMMAND_UNIT] }, availableUnits));
  }

  return (
    <section className="scheduling-apparatus-panel panel">
      <header>
        <div>
          <Truck size={15} />
          <strong>Scheduling — Daily Roster Apparatus</strong>
        </div>
        {!readOnly ? (
          <div className="inline-actions">
            <button type="button" className="text-button" onClick={selectAll}>Select all</button>
            <button type="button" className="text-button" onClick={clearAll}>Reset</button>
          </div>
        ) : null}
      </header>
      <div className="panel-body">
        <p className="auth-help">
          {readOnly
            ? "Daily roster apparatus are managed by the platform creator. Selected units appear on Scheduling with assigned crew for each shift day."
            : "Choose which apparatus appear on the Scheduling daily roster. Each selected unit shows everyone assigned to that apparatus for the selected shift day."}
        </p>
        {!unitChoices.length ? (
          <p className="auth-help">Add apparatus in the Apparatus module to configure roster display units.</p>
        ) : (
          <div className={`module-toggle-grid${readOnly ? " is-readonly" : ""}`}>
            {unitChoices.map((unit) => (
              <label key={unit} className="permission-toggle permission-check">
                <input
                  type="checkbox"
                  checked={normalized.displayApparatus.includes(unit)}
                  disabled={readOnly}
                  onChange={() => toggleUnit(unit)}
                />
                <span>{unit}</span>
              </label>
            ))}
          </div>
        )}
        <p className="auth-help" style={{ marginTop: 10 }}>
          {normalized.displayApparatus.length} unit{normalized.displayApparatus.length === 1 ? "" : "s"} selected for the daily roster.
        </p>
      </div>
    </section>
  );
}
