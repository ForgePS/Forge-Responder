import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import {
  connectActive911,
  disconnectActive911,
  getActive911Status,
  syncActive911Alerts,
} from "../../lib/active911Service.js";
import { alertToDashboardMedia, summarizeActive911Alert } from "../../lib/active911.js";
import { createDigitalDashboardId } from "../../lib/digitalDashboard.js";
import "../../theme/digital-dashboard.css";

export default function Active911IntegrationPanel({
  departmentId = "",
  canConfigure = false,
  canEdit = false,
  variant = "dashboard",
  onAddAlertMedia,
}) {
  const [status, setStatus] = useState({ connected: false });
  const [alerts, setAlerts] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [useRefreshToken, setUseRefreshToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!departmentId) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    getActive911Status(departmentId)
      .then((next) => {
        if (active) setStatus(next || { connected: false });
      })
      .catch((err) => {
        if (active) setError(err.message || "Could not load Active911 status.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [departmentId]);

  async function handleConnect(event) {
    event.preventDefault();
    if (!canConfigure) return;
    setBusy("connect");
    setError("");
    setNotice("");
    try {
      const nextStatus = await connectActive911({
        departmentId,
        email: useRefreshToken ? "" : email,
        password: useRefreshToken ? "" : password,
        refreshToken: useRefreshToken ? refreshToken : "",
      });
      setStatus(nextStatus);
      setPassword("");
      setNotice("Active911 connected using the individual user API (email/password — no OAuth secret questions).");
    } catch (err) {
      setError(err.message || "Connection failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleDisconnect() {
    if (!canConfigure) return;
    setBusy("disconnect");
    setError("");
    try {
      await disconnectActive911(departmentId);
      setStatus({ connected: false });
      setAlerts([]);
      setNotice("Active911 disconnected.");
    } catch (err) {
      setError(err.message || "Disconnect failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleSync() {
    setBusy("sync");
    setError("");
    setNotice("");
    try {
      const result = await syncActive911Alerts(departmentId, { alertDays: 10 });
      setAlerts(result.alerts || []);
      setStatus(result.status || status);
      setNotice(`Synced ${result.count || 0} alert${result.count === 1 ? "" : "s"} from Active911.`);
    } catch (err) {
      setError(err.message || "Sync failed.");
    } finally {
      setBusy("");
    }
  }

  function handleAddToMedia(alert) {
    if (!onAddAlertMedia) return;
    onAddAlertMedia(alertToDashboardMedia(alert, createDigitalDashboardId));
    setNotice(`Added "${alert.description || "alert"}" to the media library.`);
  }

  const showConnectForm = canConfigure && !status.connected;
  const showDashboardOps = variant === "dashboard" && status.connected;
  const showAdminConnected = variant === "admin" && status.connected;

  return (
    <section className={`dd-panel dd-active911-panel${variant === "admin" ? " dd-active911-admin" : ""}`}>
      <div className="dd-panel-head">
        <div>
          <h3>Active911 Integration</h3>
          <p className="dd-panel-subtitle">
            {variant === "admin"
              ? "Brings Active911 dispatch alerts into your dashboards. Set up by FORGE Public Safety."
              : "Sync dispatch alerts into Digital Dashboard media and playlists."}
          </p>
        </div>
        {status.connected ? (
          <span className="dd-status-pill dd-status-success">
            <ShieldCheck size={14} />
            Connected
          </span>
        ) : (
          <span className="dd-status-pill dd-status-critical">Not connected</span>
        )}
      </div>

      <div className="dd-panel-body">
        {loading ? (
          <p className="dd-empty-detail"><LoaderCircle size={16} className="dd-spin" /> Loading integration status…</p>
        ) : null}

        {!canConfigure && variant === "admin" ? (
          <p className="dd-empty-detail">
            FORGE Public Safety connects Active911 for you. Contact us to set it up or change the account.
          </p>
        ) : null}

        {showConnectForm ? (
          <form className="dd-active911-connect" onSubmit={handleConnect}>
            <div className="dd-gallery-mode-toggle">
              <button
                type="button"
                className={!useRefreshToken ? "active" : ""}
                onClick={() => setUseRefreshToken(false)}
              >
                Email & Password
              </button>
              <button
                type="button"
                className={useRefreshToken ? "active" : ""}
                onClick={() => setUseRefreshToken(true)}
              >
                Refresh Token
              </button>
            </div>

            {!useRefreshToken ? (
              <>
                <label>
                  Active911 email
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </label>
                <label>
                  Active911 password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </label>
              </>
            ) : (
              <label>
                Refresh token
                <textarea
                  rows={4}
                  value={refreshToken}
                  onChange={(event) => setRefreshToken(event.target.value)}
                  placeholder="Paste the token from POST user-service.active911.com/v1/authenticate"
                  required
                />
              </label>
            )}

            <p className="dd-active911-help">
              Uses <code>user-service.active911.com/v1/authenticate</code> then stores a refresh token server-side.
              Password is never saved in FORGE.
            </p>

            <button type="submit" className="dd-action-button primary" disabled={busy === "connect"}>
              {busy === "connect" ? <LoaderCircle size={16} className="dd-spin" /> : <Link2 size={16} />}
              Connect Active911
            </button>
          </form>
        ) : null}

        {(showDashboardOps || showAdminConnected) ? (
          <div className="dd-active911-connected">
            <dl className="dd-active911-meta">
              <div><dt>Account</dt><dd>{status.emailHint || "Connected user"}</dd></div>
              <div><dt>Agency</dt><dd>{status.agencyName || "—"}</dd></div>
              <div><dt>Last sync</dt><dd>{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "Never"}</dd></div>
            </dl>

            <div className="dd-active911-actions">
              {variant === "dashboard" ? (
                <button type="button" className="dd-action-button primary" onClick={handleSync} disabled={busy === "sync"}>
                  {busy === "sync" ? <LoaderCircle size={16} className="dd-spin" /> : <RefreshCw size={16} />}
                  Sync alerts
                </button>
              ) : null}
              {canConfigure ? (
                <button type="button" className="dd-action-button danger" onClick={handleDisconnect} disabled={busy === "disconnect"}>
                  <Unlink size={16} />
                  Disconnect
                </button>
              ) : null}
            </div>

            {status.lastError ? <p className="dd-upload-error">{status.lastError}</p> : null}

            {variant === "dashboard" && alerts.length ? (
              <div className="dd-table-wrap">
                <table className="dd-table dd-library-table">
                  <thead>
                    <tr>
                      <th>Alert</th>
                      <th>Location</th>
                      <th>Units</th>
                      <th>Priority</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => {
                      const row = summarizeActive911Alert(alert);
                      return (
                        <tr key={row.id || row.title}>
                          <td>
                            <strong>{row.title}</strong>
                            <span className="dd-table-sub">{row.sentAt ? new Date(row.sentAt).toLocaleString() : ""}</span>
                          </td>
                          <td>{row.subtitle || "—"}</td>
                          <td>{row.units}</td>
                          <td>{row.priority}</td>
                          <td className="dd-row-actions">
                            {canEdit && onAddAlertMedia ? (
                              <button type="button" className="dd-action-button" onClick={() => handleAddToMedia(alert)}>
                                Add to media
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {variant === "dashboard" && !alerts.length ? (
              <div className="dd-empty">
                <AlertTriangle size={18} />
                <p className="dd-empty-title">No alerts synced yet</p>
                <p className="dd-empty-detail">Run Sync alerts to pull recent dispatch activity into Digital Dashboard.</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {variant === "dashboard" && !status.connected ? (
          <p className="dd-empty-detail">
            Active911 is not connected. The platform creator or super admin must connect it under
            {" "}
            <strong>System Admin → Integrations &amp; API Keys</strong>.
          </p>
        ) : null}

        {notice ? <p className="dd-gallery-note">{notice}</p> : null}
        {error ? <p className="dd-upload-error">{error}</p> : null}
      </div>
    </section>
  );
}
