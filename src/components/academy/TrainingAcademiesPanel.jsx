import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CONNECTION_STATUS_LABELS,
  PROVIDER_TYPE_OPTIONS,
  disableAcademyConnection,
  disconnectAcademyConnection,
  listAcademyAuditLogs,
  listAcademyConnections,
  migrateLegacyForgeAcademySettings,
  setPrimaryAcademyConnection,
  testAcademyConnection,
  upsertAcademyConnection,
} from "../../lib/academyIntegrations.js";
import "../../theme/academy-integrations.css";

const emptyForm = {
  connectionId: "",
  displayName: "",
  providerType: "forge_academy",
  academyOrganizationId: "",
  syncMode: "automatic",
  isPrimary: true,
  enabled: true,
  status: "pending",
  hubBaseUrl: "",
  forgeDepartmentId: "",
  hubBearerToken: "",
  hubSecret: "",
  apiBaseUrl: "",
  apiKey: "",
  sftpHost: "",
  sftpUsername: "",
  sftpPassword: "",
  csvNotes: "",
};

function capabilityList(capabilities = {}) {
  return Object.entries(capabilities)
    .filter(([, on]) => on)
    .map(([key]) => key);
}

export default function TrainingAcademiesPanel({
  departmentId = "",
  canConfigure = false,
  canView = true,
  canMigrateLegacy = false,
}) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditConnectionId, setAuditConnectionId] = useState("");

  const activeConnections = useMemo(
    () => connections.filter((c) => c.status !== "disconnected"),
    [connections]
  );

  const refresh = useCallback(async () => {
    if (!departmentId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await listAcademyConnections(departmentId);
      setConnections(result.connections || []);
    } catch (err) {
      setError(err.message || "Could not load academy connections.");
    } finally {
      setLoading(false);
    }
  }, [departmentId, canView]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openCreate() {
    setForm({ ...emptyForm, isPrimary: activeConnections.length === 0 });
    setShowForm(true);
    setNotice("");
    setError("");
  }

  function openEdit(connection) {
    setForm({
      ...emptyForm,
      connectionId: connection.connectionId,
      displayName: connection.displayName || "",
      providerType: connection.providerType || "forge_academy",
      academyOrganizationId: connection.academyOrganizationId || "",
      syncMode: connection.syncMode || "manual",
      isPrimary: Boolean(connection.isPrimary),
      enabled: connection.enabled !== false,
      status: connection.status || "pending",
      hubBaseUrl: connection.config?.hubBaseUrl || "",
      forgeDepartmentId: connection.config?.forgeDepartmentId || "",
      apiBaseUrl: connection.config?.apiBaseUrl || "",
      sftpHost: connection.config?.sftpHost || "",
      csvNotes: connection.config?.csvNotes || "",
    });
    setShowForm(true);
    setNotice("");
    setError("");
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!canConfigure) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const connection = {
        connectionId: form.connectionId || undefined,
        displayName: form.displayName,
        providerType: form.providerType,
        academyOrganizationId: form.academyOrganizationId,
        syncMode: form.syncMode,
        isPrimary: form.isPrimary,
        enabled: form.enabled,
        status: form.status === "not_connected" ? "pending" : form.status,
        config: {
          hubBaseUrl: form.hubBaseUrl,
          forgeDepartmentId: form.forgeDepartmentId,
          apiBaseUrl: form.apiBaseUrl,
          sftpHost: form.sftpHost,
          csvNotes: form.csvNotes,
        },
      };
      const secrets = {
        hubBaseUrl: form.hubBaseUrl,
        forgeDepartmentId: form.forgeDepartmentId,
        hubBearerToken: form.hubBearerToken,
        hubSecret: form.hubSecret,
        apiBaseUrl: form.apiBaseUrl,
        apiKey: form.apiKey,
        sftpHost: form.sftpHost,
        sftpUsername: form.sftpUsername,
        sftpPassword: form.sftpPassword,
      };
      await upsertAcademyConnection(departmentId, connection, secrets);
      setShowForm(false);
      setNotice("Academy connection saved. Credentials are stored by secret reference only.");
      await refresh();
    } catch (err) {
      setError(err.message || "Could not save academy connection.");
    } finally {
      setBusy("");
    }
  }

  async function runAction(key, fn, successMessage) {
    if (!canConfigure && key !== "audit") return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const outcome = await fn();
      const message = typeof outcome === "string" ? outcome : successMessage;
      if (message) setNotice(message);
      await refresh();
    } catch (err) {
      setError(err.message || "Action failed.");
    } finally {
      setBusy("");
    }
  }

  async function openAudit(connectionId = "") {
    setBusy("audit");
    setError("");
    try {
      const result = await listAcademyAuditLogs(departmentId, {
        connectionId: connectionId || undefined,
        limit: 40,
      });
      setAuditLogs(result.logs || []);
      setAuditConnectionId(connectionId);
      setAuditOpen(true);
    } catch (err) {
      setError(err.message || "Could not load audit history.");
    } finally {
      setBusy("");
    }
  }

  if (!canView) {
    return (
      <section className="card admin-integration-card">
        <h3>Training Academies</h3>
        <p className="muted">You do not have permission to view academy integrations.</p>
      </section>
    );
  }

  return (
    <section className="card admin-integration-card">
      <div className="admin-integration-card__header">
        <div>
          <h3>Training Academies</h3>
          <p className="muted">
            Connect FORGE Academy to show members their classes and training records. Optional.
          </p>
        </div>
        <div className="admin-integration-card__actions">
          {canConfigure ? (
            <>
              {connections.length ? (
                <button type="button" className="btn-secondary" onClick={openCreate} disabled={Boolean(busy)}>
                  Add another academy
                </button>
              ) : null}
              {canMigrateLegacy ? <button
                type="button"
                className="btn-secondary"
                disabled={Boolean(busy)}
                onClick={() =>
                  runAction(
                    "migrate",
                    () => migrateLegacyForgeAcademySettings(departmentId),
                    "Legacy Forge Academy settings migrated when applicable."
                  )
                }
              >
                Migrate legacy Hub settings
              </button> : null}
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      {loading ? (
        <p className="muted">Loading academy connections…</p>
      ) : activeConnections.length === 0 ? (
        <div className="academy-empty-state">
          <h4>Academy Integration</h4>
          <p>
            This department is not currently connected to a training academy.
          </p>
          <p className="muted">
            Department training records, certificates, qualifications, and manually entered
            academy records remain available.
          </p>
          {canConfigure ? (
            <button type="button" className="btn-primary" onClick={openCreate}>
              Configure Academy Integration
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="academy-connection-list">
          {activeConnections.map((connection) => (
            <li key={connection.connectionId} className="academy-connection-card">
              <div className="academy-connection-card__title">
                <strong>{connection.displayName || "Training Academy"}</strong>
                {connection.isPrimary ? <span className="badge">Primary</span> : <span className="badge badge-muted">Secondary</span>}
                <span className="badge">{CONNECTION_STATUS_LABELS[connection.status] || connection.status}</span>
              </div>
              <p className="muted">
                {PROVIDER_TYPE_OPTIONS.find((p) => p.value === connection.providerType)?.label || connection.providerType}
                {" · "}
                Sync: {connection.syncMode}
                {connection.academyOrganizationId ? ` · Org: ${connection.academyOrganizationId}` : ""}
              </p>
              <p className="muted small">
                Capabilities: {capabilityList(connection.capabilities).join(", ") || "none"}
              </p>
              <p className="muted small">
                Last success: {connection.lastSuccessfulSyncAt || "—"}
                {" · "}
                Last error: {connection.lastErrorAt || "—"}
                {connection.lastErrorSummary ? ` (${connection.lastErrorSummary})` : ""}
              </p>
              <div className="academy-connection-card__actions">
                {canConfigure ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        runAction(
                          `test-${connection.connectionId}`,
                          async () => {
                            const response = await testAcademyConnection(departmentId, connection.connectionId);
                            const result = response?.result || {};
                            if (!result.ok) throw new Error(`Connection test failed: ${result.message || "the academy didn't respond."}`);
                            return `Connection test passed. ${result.message || ""}`.trim();
                          }
                        )
                      }
                    >
                      Test connection
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => openEdit(connection)}>
                      Edit
                    </button>
                    {!connection.isPrimary ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          runAction(
                            `primary-${connection.connectionId}`,
                            () => setPrimaryAcademyConnection(departmentId, connection.connectionId),
                            "Primary academy updated."
                          )
                        }
                      >
                        Make primary
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        runAction(
                          `disable-${connection.connectionId}`,
                          () => disableAcademyConnection(departmentId, connection.connectionId),
                          "Connection disabled."
                        )
                      }
                    >
                      Disable
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        runAction(
                          `disconnect-${connection.connectionId}`,
                          () => disconnectAcademyConnection(departmentId, connection.connectionId),
                          "Connection disconnected."
                        )
                      }
                    >
                      Disconnect
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={Boolean(busy)}
                  onClick={() => openAudit(connection.connectionId)}
                >
                  View audit history
                </button>
              </div>

            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form className="academy-connection-form" onSubmit={handleSave}>
          <h4>{form.connectionId ? "Edit academy connection" : "Configure Academy Integration"}</h4>
          <label>
            Display name
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
            />
          </label>
          <label>
            Provider type
            <select
              value={form.providerType}
              onChange={(e) => setForm({ ...form, providerType: e.target.value })}
            >
              {PROVIDER_TYPE_OPTIONS
                .filter((opt) => ["forge_academy", "manual"].includes(opt.value) || opt.value === form.providerType)
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
          </label>
          <label>
            Academy organization ID
            <input
              value={form.academyOrganizationId}
              onChange={(e) => setForm({ ...form, academyOrganizationId: e.target.value })}
              placeholder="e.g. arkansas-fire-academy"
            />
          </label>
          <label>
            Sync mode
            <select
              value={form.syncMode}
              onChange={(e) => setForm({ ...form, syncMode: e.target.value })}
            >
              <option value="automatic">Automatic</option>
              <option value="scheduled">Scheduled</option>
              <option value="file_based">File-based</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
            />
            Primary academy for this department
          </label>

          {form.providerType === "forge_academy" ? (
            <fieldset className="academy-provider-fields">
              <legend>Forge Academy (Hub) credentials</legend>
              <p className="muted small">
                Stored via secret reference — not written to the connection document.
                Do not enter a Firebase project ID; routing is server-side only.
              </p>
              <label>
                Hub base URL
                <input
                  value={form.hubBaseUrl}
                  onChange={(e) => setForm({ ...form, hubBaseUrl: e.target.value })}
                  placeholder="https://…run.app"
                />
              </label>
              <label>
                Forge department ID
                <input
                  value={form.forgeDepartmentId}
                  onChange={(e) => setForm({ ...form, forgeDepartmentId: e.target.value })}
                />
              </label>
              <label>
                Hub bearer token
                <input
                  type="password"
                  value={form.hubBearerToken}
                  onChange={(e) => setForm({ ...form, hubBearerToken: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Hub integration secret
                <input
                  type="password"
                  value={form.hubSecret}
                  onChange={(e) => setForm({ ...form, hubSecret: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
            </fieldset>
          ) : null}

          {form.providerType === "external_api" ? (
            <fieldset className="academy-provider-fields">
              <legend>External API</legend>
              <label>
                API base URL
                <input
                  value={form.apiBaseUrl}
                  onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
                />
              </label>
              <label>
                API key
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
            </fieldset>
          ) : null}

          {form.providerType === "csv_import" ? (
            <fieldset className="academy-provider-fields">
              <legend>CSV import</legend>
              <p className="muted small">
                CSV upload isn't available in the app yet. Use these notes to record how this academy's records are imported.
              </p>
              <label>
                Import notes
                <textarea
                  value={form.csvNotes}
                  onChange={(e) => setForm({ ...form, csvNotes: e.target.value })}
                  rows={3}
                />
              </label>
            </fieldset>
          ) : null}

          {form.providerType === "sftp_import" ? (
            <fieldset className="academy-provider-fields">
              <legend>SFTP import</legend>
              <label>
                Host
                <input
                  value={form.sftpHost}
                  onChange={(e) => setForm({ ...form, sftpHost: e.target.value })}
                />
              </label>
              <label>
                Username
                <input
                  value={form.sftpUsername}
                  onChange={(e) => setForm({ ...form, sftpUsername: e.target.value })}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={form.sftpPassword}
                  onChange={(e) => setForm({ ...form, sftpPassword: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
            </fieldset>
          ) : null}

          {form.providerType === "manual" ? (
            <fieldset className="academy-provider-fields">
              <legend>Manual academy records</legend>
              <p className="muted small">
                Source: Manual Entry. Records are labeled as manual and are not live-synchronized.
              </p>
            </fieldset>
          ) : null}

          <div className="academy-connection-card__actions">
            <button type="submit" className="btn-primary" disabled={Boolean(busy) || !canConfigure}>
              {busy === "save" ? "Saving…" : "Save connection"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {auditOpen ? (
        <div className="academy-audit-drawer">
          <div className="admin-integration-card__header">
            <h4>Audit history{auditConnectionId ? ` · ${auditConnectionId}` : ""}</h4>
            <button type="button" className="btn-secondary" onClick={() => setAuditOpen(false)}>
              Close
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <p className="muted">No audit entries yet.</p>
          ) : (
            <ul className="academy-audit-list">
              {auditLogs.map((log) => (
                <li key={log.id}>
                  <strong>{log.action}</strong>
                  {" · "}
                  {log.result}
                  {" · "}
                  <span className="muted">{log.timestamp}</span>
                  {log.errorDetails ? <div className="form-error">{log.errorDetails}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
