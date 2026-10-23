import { Check } from "lucide-react";
import {
  DEFAULT_SHIFT_COLORS,
  ROTATION_PRESETS,
  normalizeShiftRotation,
  rotationSummary,
  sequencePreview,
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
    update({
      preset: presetKey,
      sequence: preset.sequence.length ? [...preset.sequence] : normalized.sequence,
      anchorShift: preset.sequence[0] || normalized.anchorShift,
    });
  }

  function updateSequenceFromText(value) {
    const sequence = value.split(",").map((item) => item.trim()).filter(Boolean);
    update({ preset: "custom", sequence });
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
          <label className="wide-field">
            <span>Custom day sequence (comma-separated)</span>
            <input
              value={normalized.sequence.join(", ")}
              disabled={readOnly}
              onChange={(event) => updateSequenceFromText(event.target.value)}
              placeholder="A Shift, B Shift, C Shift, A Shift, B Shift"
            />
          </label>
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
    </section>
  );
}
