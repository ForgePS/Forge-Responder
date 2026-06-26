import { useEffect, useMemo, useState } from "react";
import { Check, CirclePlus, Trash2 } from "lucide-react";
import AdminCellEditor from "./AdminCellEditor.jsx";
import { ROW_KEY_FIELD, getRowReactKey } from "../lib/adminCellUtils.js";

function dropdownRowKey(row = {}, rowIndex = 0) {
  return getRowReactKey(row, rowIndex);
}

function dropdownLabel(row = {}) {
  return row.label || row.id || "Untitled dropdown";
}

function sortDropdownRows(rows = []) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const moduleCompare = String(a.row.module || "").localeCompare(String(b.row.module || ""));
      if (moduleCompare !== 0) return moduleCompare;
      return dropdownLabel(a.row).localeCompare(dropdownLabel(b.row));
    });
}

export default function DropdownCollectionEditor({
  rows = [],
  loading = false,
  saving = false,
  onUpdateCell,
  onAddCategory,
  onRemoveCategory,
  onSave,
}) {
  const [selectedKey, setSelectedKey] = useState("");

  const sortedRows = useMemo(() => sortDropdownRows(rows), [rows]);

  const groupedRows = useMemo(() => {
    const groups = new Map();
    sortedRows.forEach((entry) => {
      const moduleName = entry.row.module || "Other";
      if (!groups.has(moduleName)) groups.set(moduleName, []);
      groups.get(moduleName).push(entry);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sortedRows]);

  const selectedEntry = useMemo(() => {
    if (!rows.length) return null;
    const found = rows
      .map((row, index) => ({ row, index, key: dropdownRowKey(row, index) }))
      .find((entry) => entry.key === selectedKey);
    return found || rows.map((row, index) => ({ row, index, key: dropdownRowKey(row, index) }))[0];
  }, [rows, selectedKey]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedKey("");
      return;
    }
    const keys = rows.map((row, index) => dropdownRowKey(row, index));
    if (!selectedKey || !keys.includes(selectedKey)) {
      setSelectedKey(keys[0]);
    }
  }, [rows, selectedKey]);

  function handleAddCategory() {
    const nextKey = onAddCategory?.();
    if (nextKey) setSelectedKey(nextKey);
  }

  function handleRemoveCategory() {
    if (!selectedEntry) return;
    const removedKey = selectedEntry.key;
    const nextIndex = Math.max(0, selectedEntry.index - 1);
    onRemoveCategory?.(selectedEntry.index);
    const fallback = rows.filter((_, index) => index !== selectedEntry.index);
    if (fallback.length) {
      setSelectedKey(dropdownRowKey(fallback[nextIndex] || fallback[0], nextIndex));
    } else {
      setSelectedKey("");
    }
    if (!fallback.length) return;
    if (removedKey === selectedKey) {
      setSelectedKey(dropdownRowKey(fallback[0], 0));
    }
  }

  const selectedRow = selectedEntry?.row;
  const selectedIndex = selectedEntry?.index ?? -1;
  const optionCount = Array.isArray(selectedRow?.options) ? selectedRow.options.length : 0;

  return (
    <div className="dropdown-category-editor">
      <div className="dropdown-category-toolbar">
        <label className="dropdown-category-picker">
          <span>Dropdown category</span>
          <select
            value={selectedKey}
            disabled={loading || !rows.length}
            onChange={(event) => setSelectedKey(event.target.value)}
          >
            {!rows.length && <option value="">No categories yet</option>}
            {groupedRows.map(([moduleName, entries]) => (
              <optgroup key={moduleName} label={moduleName}>
                {entries.map(({ row, index }) => {
                  const key = dropdownRowKey(row, index);
                  return (
                    <option key={key} value={key}>
                      {dropdownLabel(row)}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="dropdown-category-actions">
          <button className="secondary-button" type="button" onClick={handleAddCategory} disabled={loading || saving}>
            <CirclePlus size={14} /> New category
          </button>
          <button
            className="secondary-button danger-button"
            type="button"
            onClick={handleRemoveCategory}
            disabled={loading || saving || !selectedEntry}
          >
            <Trash2 size={14} /> Delete category
          </button>
          <button className="primary-button" type="button" onClick={onSave} disabled={saving || loading}>
            <Check size={14} /> {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <p className="auth-help">
        Choose a dropdown category above, then edit its label, module, and choices below. Save when finished.
      </p>

      {loading ? (
        <p className="auth-help">Loading dropdown categories...</p>
      ) : !selectedRow ? (
        <div className="dropdown-category-empty">
          <p className="empty-table">No dropdown categories yet.</p>
          <button className="primary-button" type="button" onClick={handleAddCategory}>
            <CirclePlus size={14} /> Create first category
          </button>
        </div>
      ) : (
        <article className="dropdown-category-panel">
          <header className="dropdown-category-panel-head">
            <div>
              <strong>{dropdownLabel(selectedRow)}</strong>
              <span>{selectedRow.module || "Unassigned module"} · {optionCount} option{optionCount === 1 ? "" : "s"}</span>
            </div>
            <code className="dropdown-category-id">{selectedRow.id}</code>
          </header>

          <div className="dropdown-category-fields">
            <AdminCellEditor
              column="label"
              value={selectedRow.label}
              showLabel
              context={{ collectionName: "dropdowns" }}
              onChange={(nextValue) => onUpdateCell(selectedIndex, "label", nextValue)}
            />
            <AdminCellEditor
              column="module"
              value={selectedRow.module}
              showLabel
              context={{ collectionName: "dropdowns" }}
              onChange={(nextValue) => onUpdateCell(selectedIndex, "module", nextValue)}
            />
            <AdminCellEditor
              column="id"
              value={selectedRow.id}
              showLabel
              context={{ collectionName: "dropdowns", originalId: selectedRow[ROW_KEY_FIELD] ? undefined : selectedRow.__originalId }}
              onChange={(nextValue) => onUpdateCell(selectedIndex, "id", nextValue)}
            />
          </div>

          <section className="dropdown-category-options">
            <AdminCellEditor
              column="options"
              value={selectedRow.options}
              showLabel
              context={{ collectionName: "dropdowns" }}
              onChange={(nextValue) => onUpdateCell(selectedIndex, "options", nextValue)}
            />
          </section>
        </article>
      )}
    </div>
  );
}
