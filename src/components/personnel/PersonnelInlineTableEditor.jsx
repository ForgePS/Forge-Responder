import { CirclePlus, Trash2 } from "lucide-react";
import AdminTextInput from "../AdminTextInput.jsx";
import {
  formatPersonnelDateForDisplay,
  formatPersonnelDateForInput,
  isPersonnelDateColumnLabel,
} from "../../lib/personnelDates.js";
import { MiniTable } from "./PersonnelFieldControls.jsx";

function normalizeRows(value, columnCount) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    if (Array.isArray(row)) {
      const cells = row.map((cell) => String(cell ?? ""));
      while (cells.length < columnCount) cells.push("");
      return cells.slice(0, columnCount);
    }
    return Array.from({ length: columnCount }, () => "");
  });
}

export default function PersonnelInlineTableEditor({
  columns = [],
  value = [],
  editing = false,
  onChange,
  emptyMessage = "No records found.",
}) {
  const rows = normalizeRows(value, columns.length);

  if (!editing) {
    const displayRows = rows.map((row) => row.map((cell, columnIndex) => (
      isPersonnelDateColumnLabel(columns[columnIndex])
        ? formatPersonnelDateForDisplay(cell)
        : cell
    )));

    return (
      <MiniTable
        columns={columns}
        rows={displayRows}
        emptyMessage={emptyMessage}
      />
    );
  }

  function updateCell(rowIndex, columnIndex, nextValue) {
    onChange(rows.map((row, index) => (
      index === rowIndex
        ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? nextValue : cell))
        : row
    )));
  }

  function addRow() {
    onChange([...rows, Array.from({ length: columns.length }, () => "")]);
  }

  function removeRow(rowIndex) {
    onChange(rows.filter((_, index) => index !== rowIndex));
  }

  return (
    <div className="personnel-inline-table-editor">
      {!rows.length ? (
        <p className="auth-help">{emptyMessage}</p>
      ) : (
        <div className="personnel-inline-table-list">
          {rows.map((row, rowIndex) => (
            <div className="personnel-inline-table-row" key={`personnel-row-${rowIndex}`}>
              {columns.map((column, columnIndex) => (
                <div className="admin-field" key={`${column}-${columnIndex}`}>
                  <span>{column}</span>
                  <AdminTextInput
                    type={isPersonnelDateColumnLabel(column) ? "date" : "text"}
                    value={
                      isPersonnelDateColumnLabel(column)
                        ? formatPersonnelDateForInput(row[columnIndex] || "")
                        : (row[columnIndex] || "")
                    }
                    onChange={(nextValue) => updateCell(rowIndex, columnIndex, nextValue)}
                  />
                </div>
              ))}
              <button
                className="row-action danger"
                type="button"
                onClick={() => removeRow(rowIndex)}
                aria-label="Remove row"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="text-button personnel-inline-table-add" type="button" onClick={addRow}>
        <CirclePlus size={14} /> Add row
      </button>
    </div>
  );
}
