import { useEffect, useState } from "react";
import {
  Download,
  RefreshCw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout, {
  PREVENTION_TOOL_TABS,
} from "../components/inspections/InspectionsModuleLayout.jsx";
import {
  canManageInspectionOffline,
  canViewInspectionOffline,
  clearAllInspectionLocalData,
  clearInspectionOfflineQueue,
  getConflictResolutions,
  getDownloadPackTypes,
  labelForOfflineQueueStatus,
  loadInspectionOfflineBoard,
  purgeInspectionLocalData,
  queueInspectionAttachment,
  resolveInspectionConflictAndSync,
  saveInspectionDevicePolicy,
  syncInspectionOfflineQueue,
  downloadInspectionOfflinePack,
} from "../lib/inspections/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

const TABS = [
  { id: "status", label: "Status" },
  { id: "queue", label: "Mutation queue" },
  { id: "attachments", label: "Attachments" },
  { id: "conflicts", label: "Conflicts" },
  { id: "policy", label: "Device policy" },
];

export default function InspectionOfflinePage({ onNavigate }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewInspectionOffline(permissions, isCreator);
  const canManage = canManageInspectionOffline(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("status");
  const [board, setBoard] = useState(null);
  const [policyDraft, setPolicyDraft] = useState(null);
  const [attachDraft, setAttachDraft] = useState({
    inspectionId: "",
    file: null,
    kind: "photo",
    note: "",
  });
  const [fileInputKey, setFileInputKey] = useState(0);

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };
  const packTypes = getDownloadPackTypes();
  const resolutions = getConflictResolutions();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await loadInspectionOfflineBoard(departmentId);
      setBoard(next);
      setPolicyDraft({ ...next.policy });
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load offline board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    function handleOnline() {
      reload();
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  useEffect(() => {
    if (!departmentId || !allowed || !canManage) return undefined;
    const policy = board?.policy;
    if (!policy?.autoSyncOnReconnect) return undefined;
    async function onReconnect() {
      try {
        const result = await syncInspectionOfflineQueue(departmentId, actor);
        setMessage(result.message);
        await reload();
      } catch {
        // ignore auto-sync errors; user can retry manually
      }
    }
    window.addEventListener("online", onReconnect);
    return () => window.removeEventListener("online", onReconnect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, canManage, board?.policy?.autoSyncOnReconnect]);

  async function run(fn, success) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      setMessage(typeof success === "function" ? success(result) : success);
      await reload();
    } catch (actionError) {
      setError(actionError?.message || "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={allowed} title="Offline & Sync">
      <InspectionsModuleLayout
        title="Offline & Sync"
        description="Download packs, local drafts, mutation/attachment queues, conflict resolution, and device policy."
        activeNavName="Offline & Sync"
        onNavigate={onNavigate}
        tabs={PREVENTION_TOOL_TABS}
        actions={canManage ? (
          <div className="occupancy-detail-actions">
            <button
              className="primary-button"
              type="button"
              disabled={saving}
              onClick={() => run(
                () => downloadInspectionOfflinePack(departmentId, { inspectorId: user?.uid || "" }, actor),
                (result) => `Downloaded ${result.counts.inspections} inspections for offline use.`
              )}
            >
              <Download size={14} /> Download pack
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={() => run(
                () => syncInspectionOfflineQueue(departmentId, actor),
                (result) => result.message
              )}
            >
              <RefreshCw size={14} /> Sync now
            </button>
          </div>
        ) : null}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}
        {loading ? <p className="occupancy-muted">Loading offline status…</p> : null}

        {!loading ? (
          <div className={`inspection-offline-banner${board?.online ? "" : " is-offline"}`}>
            {board?.online ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>
              {board?.online ? "Online" : "Offline"} · last sync {formatWhen(board?.lastSuccessfulSyncAt)}
              {board?.lastError ? ` · ${board.lastError}` : ""}
            </span>
          </div>
        ) : null}

        {!loading ? (
          <div className="inspections-kpi-grid">
            {[
              ["Queued mutations", board?.queued || 0],
              ["Failed", board?.failed || 0],
              ["Open conflicts", board?.openConflicts || 0],
              ["Local drafts", board?.localDrafts || 0],
              ["Attachments", board?.attachmentsQueued || 0],
              ["Cached inspections", board?.cachedInspections || 0],
            ].map(([label, value]) => (
              <div key={label} className="inspections-kpi-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Offline sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inspections-subnav-item${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}

        {!loading && tab === "status" ? (
          <section className="panel">
            <header><div><strong>Download pack contents</strong></div></header>
            <div className="panel-body">
              <p className="occupancy-muted">
                Pack downloaded {formatWhen(board?.cache?.downloadedAt)}. Includes assigned/open inspections,
                related occupancies, open violations, and template snapshots.
              </p>
              <ul className="config-reference-list">
                {packTypes.map((row) => (
                  <li key={row.id}>
                    <code>{row.id}</code>
                    <span>
                      {row.label}
                      {board?.cache?.packs?.[row.id] ? " · cached" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="occupancy-muted">
                Preplan local queue: {board?.preplanQueued || 0} · preplan drafts: {board?.preplanDrafts || 0}
              </p>
              {canManage ? (
                <div className="occupancy-detail-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={saving}
                    onClick={() => run(
                      () => {
                        purgeInspectionLocalData(departmentId, board?.policy);
                        return true;
                      },
                      "Purged stale local data per device policy."
                    )}
                  >
                    <Trash2 size={14} /> Purge stale local data
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={saving}
                    onClick={() => run(
                      () => {
                        clearAllInspectionLocalData(departmentId);
                        return true;
                      },
                      "Cleared all inspection local offline data on this device."
                    )}
                  >
                    <Trash2 size={14} /> Clear all local data
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {!loading && tab === "queue" ? (
          <section className="panel">
            <header>
              <div><strong>Mutation queue</strong></div>
              {canManage ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => run(() => {
                    clearInspectionOfflineQueue(departmentId);
                    return true;
                  }, "Mutation queue cleared.")}
                >
                  Clear queue
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              {!(board?.queue || []).length ? (
                <InspectionEmptyState
                  title="Queue empty"
                  description="Draft saves while offline appear here until sync succeeds."
                />
              ) : (
                <div className="personnel-list">
                  {(board.queue || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.entityLabel || row.recordId}</strong>
                        <small className="occupancy-muted">
                          {" "}{row.collection} · {row.operation} · {formatWhen(row.clientUpdatedAt)}
                          {row.lastError ? ` · ${row.lastError}` : ""}
                        </small>
                      </span>
                      <InspectionStatusBadge status={labelForOfflineQueueStatus(row.status)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "attachments" ? (
          <section className="panel">
            <header><div><strong>Attachment upload queue</strong></div></header>
            <div className="panel-body">
              <p className="occupancy-muted">
                Photos, signatures and documents are kept on this device until you sync. Sync uploads them and adds them to the inspection.
              </p>
              {canManage ? (
                <div className="occupancy-form-grid" style={{ marginBottom: 12 }}>
                  <Field label="Inspection ID">
                    <input
                      value={attachDraft.inspectionId}
                      onChange={(e) => setAttachDraft((c) => ({ ...c, inspectionId: e.target.value }))}
                      placeholder="INS-…"
                    />
                  </Field>
                  <Field label="File">
                    <input
                      key={fileInputKey}
                      type="file"
                      accept={attachDraft.kind === "photo" ? "image/*" : undefined}
                      capture={attachDraft.kind === "photo" ? "environment" : undefined}
                      onChange={(e) => setAttachDraft((c) => ({ ...c, file: e.target.files?.[0] || null }))}
                    />
                  </Field>
                  <Field label="Kind">
                    <select
                      value={attachDraft.kind}
                      onChange={(e) => setAttachDraft((c) => ({ ...c, kind: e.target.value }))}
                    >
                      <option value="photo">Photo</option>
                      <option value="signature">Signature</option>
                      <option value="document">Document</option>
                    </select>
                  </Field>
                  <Field label="Note" wide>
                    <input
                      value={attachDraft.note}
                      onChange={(e) => setAttachDraft((c) => ({ ...c, note: e.target.value }))}
                    />
                  </Field>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={saving || !attachDraft.inspectionId || !attachDraft.file}
                    onClick={() => run(
                      async () => {
                        await queueInspectionAttachment(departmentId, attachDraft, actor);
                        setAttachDraft((c) => ({ ...c, file: null, note: "" }));
                        setFileInputKey((k) => k + 1);
                      },
                      "Attachment saved on this device. It uploads on the next sync."
                    )}
                  >
                    Save attachment
                  </button>
                </div>
              ) : null}
              {!(board?.attachments || []).length ? (
                <InspectionEmptyState title="No attachments queued" description="Save photos, signatures or documents here while working offline." />
              ) : (
                <div className="personnel-list">
                  {(board.attachments || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.fileName}</strong>
                        <small className="occupancy-muted">
                          {" "}{row.kind} · {row.inspectionId} · {formatWhen(row.clientUpdatedAt)}
                          {row.lastError ? ` · ${row.lastError}` : ""}
                        </small>
                      </span>
                      <InspectionStatusBadge status={row.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "conflicts" ? (
          <section className="panel">
            <header><div><strong>Conflicts</strong></div></header>
            <div className="panel-body">
              {!(board?.conflicts || []).filter((row) => row.status === "open" || row.status === "escalated").length ? (
                <InspectionEmptyState title="No open conflicts" description="Conflicts appear when the server changed while a local draft was queued." />
              ) : (
                <div className="personnel-list">
                  {(board.conflicts || [])
                    .filter((row) => row.status === "open" || row.status === "escalated")
                    .map((row) => (
                      <div key={row.id} className="person-row">
                        <span>
                          <strong>{row.entityLabel || row.recordId}</strong>
                          <small className="occupancy-muted"> {row.message || row.reason}</small>
                        </span>
                        {canManage ? (
                          <div className="occupancy-detail-actions">
                            {resolutions.map((option) => (
                              <button
                                key={option.id}
                                className="secondary-button"
                                type="button"
                                disabled={saving}
                                onClick={() => run(
                                  () => resolveInspectionConflictAndSync(departmentId, row.id, option.id, actor),
                                  `Conflict resolved: ${option.label}`
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <InspectionStatusBadge status={row.status} />
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "policy" && policyDraft ? (
          <section className="panel">
            <header>
              <div><strong>Device policy</strong></div>
              {canManage ? (
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => run(
                    () => saveInspectionDevicePolicy(departmentId, policyDraft, actor),
                    "Device policy saved."
                  )}
                >
                  <Save size={14} /> Save policy
                </button>
              ) : null}
            </header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Max cache days">
                <input
                  type="number"
                  min="1"
                  value={policyDraft.maxCacheDays}
                  disabled={!canManage}
                  onChange={(e) => setPolicyDraft((c) => ({ ...c, maxCacheDays: Number(e.target.value) }))}
                />
              </Field>
              <Field label="Max queue items">
                <input
                  type="number"
                  min="10"
                  value={policyDraft.maxQueueItems}
                  disabled={!canManage}
                  onChange={(e) => setPolicyDraft((c) => ({ ...c, maxQueueItems: Number(e.target.value) }))}
                />
              </Field>
              <Field label="Max attachment queue">
                <input
                  type="number"
                  min="5"
                  value={policyDraft.maxAttachmentQueueItems}
                  disabled={!canManage}
                  onChange={(e) => setPolicyDraft((c) => ({ ...c, maxAttachmentQueueItems: Number(e.target.value) }))}
                />
              </Field>
              <Field label="Max local drafts">
                <input
                  type="number"
                  min="10"
                  value={policyDraft.maxLocalDrafts}
                  disabled={!canManage}
                  onChange={(e) => setPolicyDraft((c) => ({ ...c, maxLocalDrafts: Number(e.target.value) }))}
                />
              </Field>
              {[
                ["allowOfflineDrafts", "Allow offline drafts"],
                ["allowPhotoOffline", "Allow photo offline"],
                ["allowSignatureOffline", "Allow signature offline"],
                ["autoSyncOnReconnect", "Auto-sync on reconnect"],
                ["purgeOnLogout", "Purge on logout (policy flag)"],
                ["encryptSensitiveFlag", "Encrypt sensitive when supported"],
                ["requireWifiForAttachments", "Require Wi-Fi for attachments"],
              ].map(([key, label]) => (
                <label key={key} className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(policyDraft[key])}
                    disabled={!canManage}
                    onChange={(e) => setPolicyDraft((c) => ({ ...c, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
              <Field label="Notes" wide>
                <textarea
                  rows={3}
                  value={policyDraft.notes || ""}
                  disabled={!canManage}
                  onChange={(e) => setPolicyDraft((c) => ({ ...c, notes: e.target.value }))}
                />
              </Field>
            </div>
          </section>
        ) : null}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
