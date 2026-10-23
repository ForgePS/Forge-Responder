import { Trash2 } from "lucide-react";
import AdminCellEditor from "./AdminCellEditor.jsx";
import { adminColumnClass } from "../lib/adminCellUtils.js";
import { formatColumnLabel, splitRecordColumns } from "../lib/adminFieldSchema.js";
import { getFieldType } from "../lib/adminFieldSchema.js";

function recordTitle(row = {}, collectionName = "") {
  return row.label || row.displayName || row.name || row.title || row.email || row.id || "New record";
}

export default function AdminRecordCards({
  rows = [],
  columns = [],
  collectionName = "",
  context = {},
  roles = [],
  onUpdateCell,
  onRemoveRow
}) {
  const { fields, meta } = splitRecordColumns(columns, collectionName);

  return (
    <div className="admin-record-cards">
      {rows.map((row, rowIndex) => (
        <article className="admin-record-card" key={row.__rowKey || `row-${rowIndex}`}>
          <header className="admin-record-card-head">
            <div>
              <strong>{recordTitle(row, collectionName)}</strong>
              {row.id && row.id !== recordTitle(row, collectionName) && (
                <span>{row.id}</span>
              )}
            </div>
            <button className="row-action danger" type="button" onClick={() => onRemoveRow(rowIndex)}>
              <Trash2 size={14} />
            </button>
          </header>

          <div className="admin-record-fields">
            {fields.map((column) => {
              const fieldType = getFieldType(column, row[column], { ...context, collectionName });
              const wide = fieldType === "dropdown-options" || fieldType === "permissions-link" || fieldType === "textarea" || fieldType === "role-multi";

              return (
                <div
                  key={`${row.__rowKey}-${column}`}
                  className={`admin-record-field ${adminColumnClass(column)} ${wide ? "admin-record-field-wide" : ""}`}
                >
                  <AdminCellEditor
                    column={column}
                    value={row[column]}
                    showLabel
                    roles={roles}
                    context={{ ...context, collectionName }}
                    onChange={(nextValue) => onUpdateCell(rowIndex, column, nextValue)}
                  />
                </div>
              );
            })}
          </div>

          {meta.length > 0 && (
            <footer className="admin-record-meta">
              {meta.map((column) => (
                <span key={`${row.__rowKey}-${column}-meta`}>
                  {formatColumnLabel(column)}:{" "}
                  <AdminCellEditor
                    column={column}
                    value={row[column]}
                    context={{ ...context, collectionName }}
                    onChange={() => {}}
                    disabled
                  />
                </span>
              ))}
            </footer>
          )}
        </article>
      ))}
    </div>
  );
}
