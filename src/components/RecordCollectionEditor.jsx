import { useEffect, useMemo, useState } from "react";
import SystemRecordCollectionEditor from "./SystemRecordCollectionEditor.jsx";
import { ADMIN_COLLECTIONS } from "../data/adminRegistry.js";
import { useAuth } from "../context/AuthContext.jsx";
import { CREATOR_PERMISSIONS } from "../data/creatorPermissions.js";
import { useTenant } from "../context/TenantContext.jsx";
import { writeAuditLog } from "../lib/auditService.js";
import {
  ROW_KEY_FIELD,
  collectColumns,
  createRowKey,
  createUniqueRecordId,
  mergeColumnKeys,
  parseCellValue,
  stripRowKeys,
  withStableRowKeys
} from "../lib/adminCellUtils.js";
import { orderColumns } from "../lib/adminFieldSchema.js";
import { createBlankRecord } from "../lib/adminRecordDefaults.js";
import { createRecord, deleteRecord, listRecords, updateRecord } from "../lib/firestoreService.js";
import { ensureDefaultDropdowns } from "../lib/dropdownService.js";
import { ensureDefaultRoles } from "../lib/roleService.js";
import { useDropdowns } from "../context/DropdownContext.jsx";

const DEFAULT_COLUMNS = {
  users: ["id", "uid", "displayName", "email", "status"],
  roles: ["id", "name", "description", "permissions"],
  dropdowns: ["id", "label", "module", "options"],
  notifications: ["id", "title", "message", "module"],
};

export default function RecordCollectionEditor({
  onMessage,
  initialCollection = "users",
  personnel = [],
  onOpenPersonnelProfile,
  onOpenEmployeeProfile,
  onInviteSomeone,
}) {
  const { departmentId } = useTenant();
  const { user, membership, isCreator } = useAuth();
  const { refreshDropdowns } = useDropdowns();
  const [collectionName, setCollectionName] = useState(initialCollection);
  const [rows, setRows] = useState([]);
  const [columnKeys, setColumnKeys] = useState(["id"]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const columns = useMemo(
    () => orderColumns(columnKeys, collectionName),
    [columnKeys, collectionName]
  );
  const collectionLabel = ADMIN_COLLECTIONS.find((item) => item.key === collectionName)?.label || collectionName;

  async function loadRecords() {
    if (!departmentId || !collectionName) return;
    setLoading(true);
    try {
      const [records, nextRoles] = await Promise.all([
        collectionName === "dropdowns"
          ? ensureDefaultDropdowns(departmentId)
          : listRecords(departmentId, collectionName),
        ensureDefaultRoles(departmentId)
      ]);
      setRoles(nextRoles);
      const keyedRows = withStableRowKeys(records, { persisted: true });
      setRows(keyedRows);
      setColumnKeys(orderColumns(collectColumns(keyedRows), collectionName));
    } catch (error) {
      console.error("Failed to load records", error);
      onMessage?.(`Failed to load ${collectionLabel}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
  }, [departmentId, collectionName]);

  function updateCell(rowIndex, column, valueOrUpdater) {
    setRows((current) => current.map((row, index) => {
      if (index !== rowIndex) return row;
      const rawValue = typeof valueOrUpdater === "function"
        ? valueOrUpdater(row[column])
        : valueOrUpdater;
      const nextValue = typeof rawValue === "string"
        ? parseCellValue(rawValue, row[column], column)
        : rawValue;
      return { ...row, [column]: nextValue };
    }));
  }

  function addRow() {
    const rowKey = createRowKey();
    const nextId = createUniqueRecordId(collectionName);
    const fallbackColumns = DEFAULT_COLUMNS[collectionName] || ["id"];
    const blank = {
      [ROW_KEY_FIELD]: rowKey,
      ...createBlankRecord(columns.length ? columns : fallbackColumns, collectionName, nextId)
    };
    if (!blank.id) blank.id = nextId;
    setRows((current) => [...current, blank]);
    setColumnKeys((current) => orderColumns(mergeColumnKeys([blank], collectionName, current), collectionName));
    return rowKey;
  }

  function removeRow(rowIndex) {
    setRows((current) => {
      const nextRows = current.filter((_, index) => index !== rowIndex);
      setColumnKeys(orderColumns(collectColumns(nextRows), collectionName));
      return nextRows;
    });
  }

  async function saveRecords() {
    if (!departmentId) return;
    setSaving(true);
    try {
      const existing = await listRecords(departmentId, collectionName);
      const existingIds = new Set(existing.map((row) => row.id));
      const cleanedRows = stripRowKeys(rows).map((row) => {
        const isSelf = collectionName === "users" && (row.id === user?.uid || row.uid === user?.uid);
        if (!isSelf) return row;

        const next = { ...row, status: "active" };
        if (isCreator || membership?.isPlatformCreator || membership?.role === "creator") {
          return {
            ...next,
            role: "creator",
            roleIds: ["creator"],
            isPlatformCreator: true
          };
        }
        if (!next.roleIds?.length && !next.role) {
          next.roleIds = ["fireChief"];
          next.role = "fireChief";
        }
        return next;
      });
      const nextIds = new Set(cleanedRows.map((row) => row.id).filter(Boolean));

      for (const oldRow of existing) {
        if (!nextIds.has(oldRow.id)) {
          await deleteRecord(departmentId, collectionName, oldRow.id);
        }
      }

      const savedIds = new Set(existingIds);

      for (const row of cleanedRows) {
        if (!row.id) continue;
        const { id, ...payload } = row;
        if (collectionName === "roles" && id === "creator") {
          payload.permissions = { ...CREATOR_PERMISSIONS, ...(payload.permissions || {}) };
        }
        if (savedIds.has(id)) {
          await updateRecord(departmentId, collectionName, id, payload);
        } else {
          await createRecord(departmentId, collectionName, id, payload);
          savedIds.add(id);
        }
      }

      await writeAuditLog(departmentId, {
        action: "update",
        module: "System Admin",
        summary: `Saved ${collectionLabel} (${rows.length} records)`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email
      });
      onMessage?.(`Saved ${collectionLabel} (${rows.length} records)`);
      if (collectionName === "dropdowns") {
        await refreshDropdowns();
      }
      await loadRecords();
    } catch (error) {
      console.error("Failed to save records", error);
      onMessage?.("Save failed — check permissions and try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="data-editor-panel">
      <div className="data-editor-toolbar">
        <label>
          <span>Record collection</span>
          <select value={collectionName} onChange={(event) => setCollectionName(event.target.value)}>
            {ADMIN_COLLECTIONS.map((collection) => (
              <option key={collection.key} value={collection.key}>
                {collection.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SystemRecordCollectionEditor
        collectionName={collectionName}
        rows={rows}
        columns={columns}
        roles={roles}
        personnel={personnel}
        onOpenPersonnelProfile={onOpenPersonnelProfile}
        onOpenEmployeeProfile={onOpenEmployeeProfile}
        loading={loading}
        saving={saving}
        onUpdateCell={updateCell}
        onAddRecord={addRow}
        onInviteSomeone={onInviteSomeone}
        onRemoveRecord={removeRow}
        onSave={saveRecords}
      />
    </section>
  );
}
