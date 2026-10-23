import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import ManagedSelect from "./ManagedSelect.jsx";

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <section className="workflow-modal">
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

export default function FleetRecordEditModal({
  title,
  fields = [],
  record,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(record || {});

  useEffect(() => {
    setDraft(record || {});
  }, [record]);

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSave() {
    onSave?.(draft);
    onClose?.();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="workflow-form">
        {fields.map(({ key, label, dropdownId, type = "text", wide = false }) => (
          <label key={key} className={wide ? "wide-field" : undefined}>
            <span>{label}</span>
            {dropdownId ? (
              <ManagedSelect
                dropdownId={dropdownId}
                value={draft[key] || ""}
                onChange={(value) => updateField(key, value)}
              />
            ) : (
              <input
                type={type}
                value={draft[key] ?? ""}
                onChange={(event) => updateField(key, event.target.value)}
              />
            )}
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" onClick={handleSave}>
          <Check size={14} /> Save changes
        </button>
      </div>
    </Modal>
  );
}

export const APPARATUS_EDIT_FIELDS = [
  { key: "unit", label: "Unit name", dropdownId: "apparatusUnits" },
  { key: "type", label: "Apparatus type" },
  { key: "station", label: "Station", dropdownId: "stations" },
  { key: "year", label: "Model year" },
  { key: "status", label: "Status", dropdownId: "apparatusStatus" },
  { key: "operator", label: "Primary operator" },
  { key: "mileage", label: "Mileage" },
  { key: "engineHours", label: "Engine hours" },
  { key: "pumpHours", label: "Pump hours" },
  { key: "fuel", label: "Fuel level" },
  { key: "pmDue", label: "PM due" },
];

export const ASSET_EDIT_FIELDS = [
  { key: "name", label: "Asset name", wide: true },
  { key: "category", label: "Category", dropdownId: "assetCategories" },
  { key: "serial", label: "Serial number" },
  { key: "location", label: "Location", dropdownId: "stations" },
  { key: "assigned", label: "Assigned to" },
  { key: "inspection", label: "Inspection due" },
  { key: "value", label: "Value" },
  { key: "status", label: "Status", dropdownId: "assetStatuses" },
];
