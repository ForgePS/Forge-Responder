import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, CirclePlus, Mail, Trash2 } from "lucide-react";
import AdminCellEditor from "./AdminCellEditor.jsx";
import { adminColumnClass, getRowReactKey } from "../lib/adminCellUtils.js";
import { formatColumnLabel, getFieldType, splitRecordColumns } from "../lib/adminFieldSchema.js";
import { getRecordEditorConfig } from "../lib/moduleDataEditorConfig.js";

function recordKey(row = {}, rowIndex = 0) {
  return getRowReactKey(row, rowIndex);
}

function sortEntries(rows = [], config) {
  const entries = rows.map((row, index) => ({ row, index, key: recordKey(row, index) }));
  return entries.sort((a, b) => {
    if (config.groupBy) {
      const groupCompare = String(config.groupBy(a.row)).localeCompare(String(config.groupBy(b.row)));
      if (groupCompare !== 0) return groupCompare;
    }
    return config.displayLabel(a.row).localeCompare(config.displayLabel(b.row));
  });
}

function isWideField(fieldType) {
  return fieldType === "dropdown-options"
    || fieldType === "permissions-link"
    || fieldType === "personnel-link"
    || fieldType === "textarea"
    || fieldType === "role-multi";
}

export default function SystemRecordCollectionEditor({
  collectionName = "",
  rows = [],
  columns = [],
  roles = [],
  personnel = [],
  onOpenPersonnelProfile,
  onOpenEmployeeProfile,
  loading = false,
  saving = false,
  onUpdateCell,
  onAddRecord,
  onRemoveRecord,
  onSave,
  onInviteSomeone,
}) {
  const config = useMemo(() => getRecordEditorConfig(collectionName), [collectionName]);
  const autoSelectFirst = config.autoSelectFirst !== false;
  const [selectedKey, setSelectedKey] = useState("");
  const { fields, meta } = splitRecordColumns(columns, collectionName);

  const sortedEntries = useMemo(() => sortEntries(rows, config), [rows, config]);

  const groupedEntries = useMemo(() => {
    if (!config.groupBy) {
      return [["All", sortedEntries]];
    }
    const groups = new Map();
    sortedEntries.forEach((entry) => {
      const groupName = config.groupBy(entry.row) || "Other";
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(entry);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sortedEntries, config]);

  const selectedEntry = useMemo(() => {
    if (!rows.length || !selectedKey) return null;
    const entries = rows.map((row, index) => ({ row, index, key: recordKey(row, index) }));
    return entries.find((entry) => entry.key === selectedKey) || null;
  }, [rows, selectedKey]);

  useEffect(() => {
    setSelectedKey("");
  }, [collectionName]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedKey("");
      return;
    }
    setSelectedKey((current) => {
      const keys = rows.map((row, index) => recordKey(row, index));
      if (current && keys.includes(current)) return current;
      return autoSelectFirst ? (keys[0] ?? "") : "";
    });
  }, [rows, autoSelectFirst]);

  const selectedRow = selectedEntry?.row;
  const selectedIndex = selectedEntry?.index ?? -1;
  const compactFields = config.compactFields.filter((column) => fields.includes(column));
  const detailFields = fields.filter((column) => !compactFields.includes(column));
  const deleteProtected = selectedRow && config.protectDelete?.(selectedRow);
  const inviteOnly = Boolean(config.inviteOnly);

  function handleAddRecord() {
    const nextKey = onAddRecord?.();
    if (nextKey) setSelectedKey(nextKey);
  }

  function handleRemoveRecord() {
    if (!selectedEntry || deleteProtected) return;
    const label = selectedEntry.row?.label || selectedEntry.row?.name || selectedEntry.row?.title || "this record";
    if (!window.confirm(`Remove ${label}? It's deleted when you save.`)) return;
    onRemoveRecord?.(selectedEntry.index);
  }

  function renderField(column) {
    const fieldType = getFieldType(column, selectedRow[column], { collectionName });
    const wide = isWideField(fieldType);

    return (
      <div
        key={`${selectedEntry.key}-${column}`}
        className={`admin-record-field ${adminColumnClass(column)} ${wide ? "admin-record-field-wide" : ""}`}
      >
        <AdminCellEditor
          column={column}
          value={selectedRow[column]}
          showLabel
          roles={roles}
          personnel={personnel}
          onOpenPersonnelProfile={onOpenPersonnelProfile}
          onOpenEmployeeProfile={onOpenEmployeeProfile}
          context={{
            collectionName,
            originalId: selectedRow.__originalId,
            originalUid: selectedRow.__originalUid,
          }}
          onChange={(nextValue) => onUpdateCell(selectedIndex, column, nextValue)}
        />
      </div>
    );
  }

  function renderFieldList(fieldList = []) {
    return fieldList.map((column) => {
      const sectionTitle = config.sectionBreaks?.[column];
      return (
        <Fragment key={`${selectedEntry.key}-${column}-wrap`}>
          {sectionTitle && (
            <h3 className="admin-record-section-title">{sectionTitle}</h3>
          )}
          {renderField(column)}
        </Fragment>
      );
    });
  }

  return (
    <div className="system-record-editor">
      <div className="system-record-toolbar">
        <label className="system-record-picker">
          <span>{config.selectorLabel}</span>
          <select
            value={selectedKey}
            disabled={loading || !rows.length}
            onChange={(event) => setSelectedKey(event.target.value)}
          >
            <option value="">{config.selectPlaceholder || "Select a record..."}</option>
            {!rows.length && <option value="" disabled>{config.emptyLabel}</option>}
            {groupedEntries.map(([groupName, entries]) => (
              config.groupBy ? (
                <optgroup key={groupName} label={groupName}>
                  {entries.map(({ row, index, key }) => (
                    <option key={key} value={key}>
                      {config.displayLabel(row)}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <Fragment key={groupName}>
                  {entries.map(({ row, key }) => (
                    <option key={key} value={key}>
                      {config.displayLabel(row)}
                    </option>
                  ))}
                </Fragment>
              )
            ))}
          </select>
        </label>

        <div className="system-record-actions">
          {inviteOnly ? (
            onInviteSomeone && (
              <button className="secondary-button" type="button" onClick={onInviteSomeone} disabled={loading || saving}>
                <Mail size={14} /> {config.inviteLabel || "Invite someone"}
              </button>
            )
          ) : (
            <button className="secondary-button" type="button" onClick={handleAddRecord} disabled={loading || saving}>
              <CirclePlus size={14} /> {config.newRecordLabel}
            </button>
          )}
          <button
            className="secondary-button danger-button"
            type="button"
            onClick={handleRemoveRecord}
            disabled={loading || saving || !selectedEntry || deleteProtected}
          >
            <Trash2 size={14} /> {config.deleteLabel}
          </button>
          <button className="primary-button" type="button" onClick={onSave} disabled={saving || loading}>
            <Check size={14} /> {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <p className="auth-help">{config.helpText}</p>
      {inviteOnly && config.inviteNote && (
        <p className="auth-help">{config.inviteNote}</p>
      )}

      {loading ? (
        <p className="auth-help">{config.loadingText}</p>
      ) : !rows.length ? (
        <div className="system-record-empty">
          <p className="empty-table">{config.emptyLabel}</p>
          {inviteOnly ? (
            onInviteSomeone && (
              <button className="primary-button" type="button" onClick={onInviteSomeone}>
                <Mail size={14} /> {config.inviteLabel || "Invite someone"}
              </button>
            )
          ) : (
            <button className="primary-button" type="button" onClick={handleAddRecord}>
              <CirclePlus size={14} /> {config.createFirstLabel}
            </button>
          )}
        </div>
      ) : !selectedEntry ? (
        <div className="system-record-empty system-record-select-prompt">
          <p className="empty-table">{config.selectPromptLabel || "Select a record from the dropdown above."}</p>
        </div>
      ) : (
        <article className="system-record-panel" key={selectedEntry.key}>
          <header className="system-record-panel-head">
            <div>
              <strong>{config.displayLabel(selectedRow)}</strong>
              {config.summary(selectedRow) && <span>{config.summary(selectedRow)}</span>}
            </div>
            {selectedRow.id && (
              <code className="system-record-id">{selectedRow.id}</code>
            )}
          </header>

          {compactFields.length > 0 && (
            <div className={`system-record-fields system-record-fields-compact system-record-fields-compact-${Math.min(compactFields.length, 3)}`}>
              {renderFieldList(compactFields)}
            </div>
          )}

          {detailFields.length > 0 && (
            <div className="system-record-fields">
              {renderFieldList(detailFields)}
            </div>
          )}

          {meta.length > 0 && (
            <footer className="admin-record-meta">
              {meta.map((column) => (
                <span key={`${selectedEntry.key}-${column}-meta`}>
                  {formatColumnLabel(column, collectionName)}:{" "}
                  <AdminCellEditor
                    column={column}
                    value={selectedRow[column]}
                    context={{ collectionName }}
                    onChange={() => {}}
                    disabled
                  />
                </span>
              ))}
            </footer>
          )}
        </article>
      )}
    </div>
  );
}
