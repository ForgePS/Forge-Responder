import { useEffect, useMemo, useState } from "react";
import { Check, CirclePlus, Database } from "lucide-react";
import AdminRecordCards from "./AdminRecordCards.jsx";
import SystemRecordCollectionEditor from "./SystemRecordCollectionEditor.jsx";
import { MODULE_DATASETS } from "../data/adminRegistry.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
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
import { saveErrorMessage } from "../lib/adminGuards.js";
import { createBlankRecord } from "../lib/adminRecordDefaults.js";
import { getFirestoreDb } from "../lib/firebaseClient.js";
import { restoreItemsFromFirestore, sanitizeItemsForFirestore } from "../lib/firestoreSanitize.js";
import { writeAuditLog } from "../lib/auditService.js";
import { usesRecordPanelEditor } from "../lib/moduleDataEditorConfig.js";
import { PERSONNEL_ADMIN_COLUMN_ORDER } from "../lib/personnelAdminFields.js";
import { departmentListSegments, isPlatformScope } from "../lib/tenantPaths.js";
import { loadTenantListFromFirestore } from "../lib/tenantListLoader.js";
import { replaceTenantList } from "../lib/tenantListStore.js";

const DEFAULT_COLUMNS = {
  "hlfd-rms-personnel": PERSONNEL_ADMIN_COLUMN_ORDER.slice(0, 12),
  "hlfd-rms-apparatus": ["id", "unit", "type", "station", "year", "status", "operator", "mileage", "engineHours", "pumpHours", "fuel", "pmDue"],
  "hlfd-rms-assets": ["id", "name", "category", "serial", "location", "assigned", "inspection", "value", "status"],
};

export default function DataEditorPanel({ onMessage }) {
  const { departmentId, isPlatformScope: inPlatformScope } = useTenant();
  // Module data always belongs to a department; none is editable in platform scope.
  const dataDepartmentId = inPlatformScope ? "" : departmentId;
  const { user, membership } = useAuth();
  const [datasetKey, setDatasetKey] = useState(MODULE_DATASETS[0].key);
  const [rows, setRows] = useState([]);
  const [columnKeys, setColumnKeys] = useState(["id"]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // If loading fails the editor is empty; saving then would delete every stored record.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  const columns = useMemo(() => orderColumns(columnKeys, datasetKey), [columnKeys, datasetKey]);
  const activeDataset = MODULE_DATASETS.find((item) => item.key === datasetKey);
  const datasetLabel = activeDataset?.label || datasetKey;
  const datasetTitle = activeDataset ? `${activeDataset.group} · ${activeDataset.label}` : datasetLabel;
  const usePanelEditor = usesRecordPanelEditor(datasetKey);

  async function loadDataset() {
    if (!dataDepartmentId || !datasetKey) return;

    setLoading(true);
    try {
      const { items } = await loadTenantListFromFirestore(dataDepartmentId, datasetKey);
      const keyedRows = withStableRowKeys(items, { persisted: true });
      setRows(keyedRows);
      setLoadFailed(false);
      setLoadedCount(keyedRows.length);
      setColumnKeys(orderColumns(collectColumns(keyedRows), datasetKey));
    } catch (error) {
      console.error(`Failed to load dataset ${datasetKey}`, error);
      onMessage?.(`Couldn't load ${datasetTitle}. Saving is turned off so nothing is overwritten. Refresh the page to try again.`, "error");
      setRows([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDataset();
  }, [dataDepartmentId, datasetKey]);

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
    const nextId = createUniqueRecordId(datasetKey);
    const fallbackColumns = DEFAULT_COLUMNS[datasetKey] || ["id"];
    const blank = {
      [ROW_KEY_FIELD]: rowKey,
      ...createBlankRecord(columns.length ? columns : fallbackColumns, datasetKey, nextId)
    };
    if (!blank.id) blank.id = nextId;
    setRows((current) => [...current, blank]);
    setColumnKeys((current) => orderColumns(mergeColumnKeys([blank], datasetKey, current), datasetKey));
    return rowKey;
  }

  function removeRow(rowIndex) {
    setRows((current) => {
      const nextRows = current.filter((_, index) => index !== rowIndex);
      setColumnKeys(orderColumns(collectColumns(nextRows), datasetKey));
      return nextRows;
    });
  }

  async function saveDataset() {
    const db = getFirestoreDb();
    if (!db || !dataDepartmentId) return;
    if (loadFailed) {
      onMessage?.("This list didn't load, so it can't be saved. Refresh the page and try again.", "error");
      return;
    }
    if (!rows.length && loadedCount > 0
      && !window.confirm(`This removes all ${loadedCount} ${datasetLabel} records. Continue?`)) {
      return;
    }

    setSaving(true);
    try {
      await replaceTenantList(db, dataDepartmentId, datasetKey, stripRowKeys(rows), {
        userId: user?.uid || "system"
      });
      await writeAuditLog(dataDepartmentId, {
        action: "update",
        module: "Data Editor",
        summary: `Saved ${datasetLabel} (${rows.length} records)`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email
      });
      onMessage?.(`Saved ${datasetLabel} (${rows.length} records)`);
      await loadDataset();
    } catch (error) {
      console.error("Failed to save dataset", error);
      onMessage?.(saveErrorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="data-editor-panel">
      <div className="data-editor-toolbar">
        <label>
          <span>Module dataset</span>
          <select value={datasetKey} onChange={(event) => setDatasetKey(event.target.value)}>
            {MODULE_DATASETS.map((dataset) => (
              <option key={dataset.key} value={dataset.key}>
                {dataset.group} · {dataset.label}
              </option>
            ))}
          </select>
        </label>
        {!usePanelEditor && (
          <div className="data-editor-actions">
            <button className="secondary-button" type="button" onClick={addRow}><CirclePlus size={14} /> Add row</button>
            <button className="primary-button" type="button" onClick={saveDataset} disabled={saving || loading || loadFailed}>
              <Check size={14} /> {saving ? "Saving..." : "Save dataset"}
            </button>
          </div>
        )}
      </div>

      {inPlatformScope && (
        <p className="auth-help">
          You are in the FORGE platform workspace. Switch to a department branch to edit its module data.
        </p>
      )}

      {!usePanelEditor && (
        <p className="auth-help">
          <Database size={14} /> Edit records with dropdowns and checkboxes where available. Status, priority, and yes/no fields use friendly controls.
        </p>
      )}

      {usePanelEditor ? (
        <SystemRecordCollectionEditor
          collectionName={datasetKey}
          rows={rows}
          columns={columns}
          loading={loading}
          saving={saving || loadFailed}
          onUpdateCell={updateCell}
          onAddRecord={addRow}
          onRemoveRecord={removeRow}
          onSave={saveDataset}
        />
      ) : loading ? (
        <p className="auth-help">Loading {datasetLabel}...</p>
      ) : (
        <div className="admin-record-scroll">
          <AdminRecordCards
            rows={rows}
            columns={columns}
            collectionName={datasetKey}
            context={{ datasetKey }}
            onUpdateCell={updateCell}
            onRemoveRow={removeRow}
          />
          {!rows.length && <p className="empty-table">No records yet. Add a row to get started.</p>}
        </div>
      )}
    </section>
  );
}
