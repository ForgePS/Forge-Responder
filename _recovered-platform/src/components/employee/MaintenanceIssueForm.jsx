import { CirclePlus } from "lucide-react";

export default function MaintenanceIssueForm({
  value,
  onChange,
  apparatusOptions = [],
  submittedByName = "",
  onSubmit,
  submitting = false,
}) {
  function update(patch) {
    onChange?.({ ...value, ...patch });
  }

  return (
    <form
      className="maintenance-damage-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <p className="auth-help">
        Complete this damage report. When submitted, a message is sent to all Battalion Chiefs.
      </p>

      <label className="maintenance-line-field">
        <span>Date:</span>
        <input
          type="date"
          value={value.date || ""}
          onChange={(event) => update({ date: event.target.value })}
          required
        />
      </label>

      <label className="maintenance-line-field">
        <span>Damaged Property/Equipment Location:</span>
        <select
          value={value.location || ""}
          onChange={(event) => update({ location: event.target.value })}
          required
        >
          <option value="">Select apparatus…</option>
          {apparatusOptions.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </label>

      <label className="maintenance-line-field">
        <span>Equipment (Please write if not listed above)</span>
        <input
          type="text"
          value={value.equipment || ""}
          onChange={(event) => update({ equipment: event.target.value })}
          placeholder="Pump, compartment door, SCBA, etc."
        />
      </label>

      <label className="maintenance-block-field">
        <span>What is damaged and provide a description of the damage:</span>
        <textarea
          rows={6}
          value={value.damageDescription || ""}
          onChange={(event) => update({ damageDescription: event.target.value })}
          placeholder="Describe the damage, location on the unit, and any safety concerns."
          required
        />
      </label>

      <label className="maintenance-line-field">
        <span>Person Filling out the form:</span>
        <input
          type="text"
          className="employee-computed-value"
          value={submittedByName || "Employee"}
          readOnly
        />
      </label>

      <button type="submit" className="primary-button" disabled={submitting}>
        <CirclePlus size={14} /> {submitting ? "Submitting..." : "Submit Damage Report"}
      </button>
    </form>
  );
}
