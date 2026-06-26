import { Check } from "lucide-react";
import {
  DEFAULT_SHIFT_COLORS,
  MAX_CYCLE_DAYS,
  ROTATION_PRESETS,
  normalizeShiftRotation,
  resizeSequence,
  rotationSummary,
  sequencePreview,
  shiftOptions,
} from "../data/defaultShiftRotation.js";

function uniqueShifts(sequence = []) {
  return [...new Set(sequence.filter(Boolean))];
}

export default function ShiftRotationPanel({
  rotation,
  profileShifts = [],
  onChange,
  readOnly = false,
}) {
  const normalized = normalizeShiftRotation(rotation, profileShifts);
  const preview = sequencePreview(normalized, 14);
  const colorShifts = uniqueShifts([
    ...normalized.sequence,
    ...profileShifts,
    ...Object.keys(DEFAULT_SHIFT_COLORS),
  ]);

  function update(patch) {
    onChange?.(normalizeShiftRotation({ ...normalized, ...patch }, profileShifts));
  }

  function applyPreset(presetKey) {
    const preset = ROTATION_PRESETS[presetKey];
    if (!preset) return;
    const nextSequence = preset.sequence.length
      ? [...preset.sequence]
      : normalized.sequence;
    update({
      preset: presetKey,
      sequence: nextSequence,
      cycleDays: nextSequence.length,
      anchorShift: preset.sequence[0] || normalized.anchorShift,
    });
  }

  function updateCycleDays(value) {
    const cycleDays = Math.max(1, Math.min(MAX_CYCLE_DAYS, Number(value) || 1));
    update({
      preset: "custom",
      cycleDays,
      sequence: resizeSequence(normalized.sequence, cycleDays, shiftOptions(profileShifts, normalized)),
    });
  }

  function updateCycleDay(index, shift) {
    const sequence = [...normalized.sequence];
    sequence[index] = shift;
    update({
      preset: "custom",
      cycleDays: sequence.length,
      sequence,
    });
  }

  function updateShiftColor(label, color) {
    update({
      shiftColors: {
        ...normalized.shiftColors,
        [label]: color,
      },
    });
  }

  return (
    <section className="shift-rotation-panel">
      <header className="shift-rotation-header">
        <div>
          <h3>Shift rotation</h3>
          <p>{rotationSummary(normalized)} · {normalized.sequence.length}-day repeating cycle</p>
        </div>
      </header>

      <div className="workflow-form">
        <label>
          <span>Rotation pattern</span>
          <select
            value={normalized.preset}
            disabled={readOnly}
            onChange={(event) => applyPreset(event.target.value)}
          >
            {Object.entries(ROTATION_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Anchor date</span>
          <input
            type="date"
            value={normalized.anchorDate}
            disabled={readOnly}
            onChange={(event) => update({ anchorDate: event.target.value })}
          />
        </label>

        <label>
          <span>Shift working on anchor date</span>
          <select
            value={normalized.anchorShift}
            disabled={readOnly}
            onChange={(event) => update({ anchorShift: event.target.value })}
          >
            {uniqueShifts(normalized.sequence).map((shift) => (
              <option key={shift} value={shift}>{shift}</option>
            ))}
          </select>
        </label>

        {normalized.preset === "custom" && (
          <>
            <label>
              <span>Repeat every (days)</span>
              <input
                type="number"
                min={1}
                max={MAX_CYCLE_DAYS}
                value={normalized.cycleDays}
                disabled={readOnly}
                onChange={(event) => updateCycleDays(event.target.value)}
              />
            </label>
            <div className="shift-cycle-grid wide-field">
              <strong>Day-by-day pattern</strong>
              <p className="auth-help">Assign which shift is on duty for each day of the cycle. The pattern repeats every {normalized.cycleDays} days.</p>
              {normalized.sequence.map((shift, index) => (
                <label key={`cycle-day-${index}`} className="shift-cycle-row">
                  <span>Day {index + 1}</span>
                  <select
                    value={shift}
                    disabled={readOnly}
                    onChange={(event) => updateCycleDay(index, event.target.value)}
                  >
                    {shiftOptions(profileShifts, normalized).map((option) => (
                      <option key={`${index}-${option}`} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="shift-color-grid">
        <strong>Calendar colors</strong>
        {colorShifts.slice(0, 6).map((shift) => (
          <label key={shift} className="shift-color-row">
            <span>{shift}</span>
            <input
              type="color"
              value={normalized.shiftColors[shift] || "#64748b"}
              disabled={readOnly}
              onChange={(event) => updateShiftColor(shift, event.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="shift-rotation-preview">
        <strong>Next 14 days from anchor</strong>
        <div className="shift-preview-strip">
          {preview.map((entry) => (
            <div
              key={`${entry.date}-${entry.shift}`}
              className="shift-preview-chip"
              style={{ borderTopColor: normalized.shiftColors[entry.shift] || "#64748b" }}
            >
              <small>{entry.date}</small>
              <strong>{entry.shift.replace(" Shift", "")}</strong>
            </div>
          ))}
        </div>
      </div>

      {!readOnly && (
        <p className="auth-help">
          <Check size={13} /> Changes apply to the shift calendar after you save department settings.
        </p>
      )}
      {readOnly && (
        <p className="auth-help">Shift rotation is view-only here. Only the FORGE platform creator can edit rotation settings.</p>
      )}
    </section>
  );
}
