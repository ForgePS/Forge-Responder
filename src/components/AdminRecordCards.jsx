import { Fragment } from "react";
import { Trash2 } from "lucide-react";
import AdminCellEditor from "./AdminCellEditor.jsx";
import { adminColumnClass, getRowReactKey } from "../lib/adminCellUtils.js";
import { formatColumnLabel, getFieldType, splitRecordColumns } from "../lib/adminFieldSchema.js";
import { isPersonnelCollection, PERSONNEL_ADMIN_SECTION_BREAKS } from "../lib/personnelAdminFields.js";

const PERSONNEL_SECTION_BREAKS = PERSONNEL_ADMIN_SECTION_BREAKS;

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
      {rows.map((row, rowIndex) => {
        const rowKey = getRowReactKey(row, rowIndex);

        return (
        <article className="admin-record-card" key={rowKey}>
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
              const sectionTitle = isPersonnelCollection(collectionName) ? PERSONNEL_SECTION_BREAKS[column] : null;

              return (
                <Fragment key={`${rowKey}-${column}`}>
                  {sectionTitle && (
                    <h3 className="admin-record-section-title">
                      {sectionTitle}
                    </h3>
                  )}
                  <div
                    className={`admin-record-field ${adminColumnClass(column)} ${wide ? "admin-record-field-wide" : ""}`}
                  >
                    <AdminCellEditor
                      column={column}
                      value={row[column]}
                      showLabel
                      roles={roles}
                      context={{
                        ...context,
                        collectionName,
                        originalId: row.__originalId,
                        originalUid: row.__originalUid,
                      }}
                      onChange={(nextValue) => onUpdateCell(rowIndex, column, nextValue)}
                    />
                  </div>
                </Fragment>
              );
            })}
          </div>

          {meta.length > 0 && (
            <footer className="admin-record-meta">
              {meta.map((column) => (
                <span key={`${rowKey}-${column}-meta`}>
                  {formatColumnLabel(column, collectionName)}:{" "}
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
        );
      })}
    </div>
  );
}
