import { useState } from "react";
import { CirclePlus, GripVertical, Trash2 } from "lucide-react";
import AdminTextInput from "./AdminTextInput.jsx";

function normalizeOptions(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      id: item.id || `option-${index + 1}`,
      label: item.label || "",
      active: item.active !== false,
      sortOrder: index + 1,
    }));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeOptions(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function reindexSortOrder(options = []) {
  return options.map((item, index) => ({ ...item, sortOrder: index + 1 }));
}

function createOptionId() {
  return `option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function DropdownOptionsEditor({ value, onChange, disabled = false }) {
  const options = normalizeOptions(value);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  function updateOption(index, patch) {
    onChange((current) => reindexSortOrder(normalizeOptions(current).map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    ))));
  }

  function addOption() {
    onChange((current) => {
      const normalized = normalizeOptions(current);
      return reindexSortOrder([
        ...normalized,
        {
          id: createOptionId(),
          label: "New option",
          active: true,
          sortOrder: normalized.length + 1,
        },
      ]);
    });
  }

  function removeOption(index) {
    onChange((current) => reindexSortOrder(normalizeOptions(current).filter((_, itemIndex) => itemIndex !== index)));
  }

  function moveOption(fromIndex, toIndex) {
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) return;
    onChange((current) => {
      const normalized = normalizeOptions(current);
      const next = [...normalized];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return reindexSortOrder(next);
    });
  }

  function handleDragStart(event, index) {
    if (disabled) return;
    setDragIndex(index);
    setOverIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(event, index) {
    if (disabled || dragIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  }

  function handleDrop(event, index) {
    event.preventDefault();
    if (disabled || dragIndex === null) return;
    moveOption(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="dropdown-options-editor">
      <div className="dropdown-options-head">
        <span>Dropdown choices</span>
        {!disabled && (
          <button className="text-button" type="button" onClick={addOption}>
            <CirclePlus size={14} /> Add option
          </button>
        )}
      </div>
      {!options.length ? (
        <p className="auth-help">No options yet. Add one to get started.</p>
      ) : (
        <>
          {!disabled && (
            <p className="auth-help dropdown-options-drag-hint">Drag the grip handle to reorder options.</p>
          )}
          <div className="dropdown-options-list">
            {options.map((option, index) => (
              <div
                className={[
                  "dropdown-option-row",
                  dragIndex === index ? "is-dragging" : "",
                  overIndex === index && dragIndex !== null && dragIndex !== index ? "is-drag-over" : "",
                ].filter(Boolean).join(" ")}
                key={`option-row-${index}`}
                onDragOver={(event) => handleDragOver(event, index)}
                onDrop={(event) => handleDrop(event, index)}
              >
                <button
                  type="button"
                  className="dropdown-option-drag"
                  draggable={!disabled}
                  disabled={disabled}
                  aria-label={`Reorder ${option.label || "option"}`}
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragEnd={handleDragEnd}
                >
                  <GripVertical size={16} />
                </button>
                <div className="admin-field">
                  <span>Label</span>
                  <AdminTextInput
                    value={option.label}
                    disabled={disabled}
                    onChange={(nextValue) => updateOption(index, { label: nextValue })}
                  />
                </div>
                <div className="admin-field">
                  <span>ID</span>
                  <AdminTextInput
                    value={option.id}
                    disabled={disabled}
                    onChange={(nextValue) => updateOption(index, { id: nextValue })}
                  />
                </div>
                <label className="permission-toggle permission-check">
                  <input
                    type="checkbox"
                    checked={Boolean(option.active)}
                    disabled={disabled}
                    onChange={(event) => updateOption(index, { active: event.target.checked })}
                  />
                  <span>Active</span>
                </label>
                {!disabled && (
                  <button className="row-action danger" type="button" onClick={() => removeOption(index)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
