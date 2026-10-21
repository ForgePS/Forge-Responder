import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "../../lib/firebaseClient.js";
import { SUBSCRIPTION_STATUS_LABELS, formatShortDate } from "../../data/platformSubscriptions.js";

function call(name, data = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  return httpsCallable(functions, name, { timeout: 540000 })(data).then((r) => r.data || {});
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatWhen(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString();
}

/** Creator Console: one row per department with usage and a data export. */
export default function PlatformUsagePanel({ onMessage }) {
  const [rows, setRows] = useState([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");
  const [exports, setExports] = useState({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await call("departmentUsage");
      setRows(result.departments || []);
      setGeneratedAt(result.generatedAt || "");
    } catch (loadError) {
      setError(loadError?.message || "Could not load usage.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function exportDepartment(row) {
    setExporting(row.departmentId);
    try {
      const result = await call("exportDepartmentData", { departmentId: row.departmentId });
      setExports((current) => ({ ...current, [row.departmentId]: result }));
      onMessage?.(`Export ready for ${row.name}: ${result.counts?.documents ?? 0} records, ${result.counts?.files ?? 0} file references.`);
    } catch (exportError) {
      onMessage?.(exportError?.message || `Export failed for ${row.name}.`);
    } finally {
      setExporting("");
    }
  }

  return (
    <div className="platform-usage">
      <div className="platform-usage-toolbar">
        <p className="auth-help">
          {generatedAt ? `Updated ${new Date(generatedAt).toLocaleString()}.` : ""} Records counts every saved item;
          files are uploads (photos, documents, logos).
        </p>
        <button type="button" className="secondary-button" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="data-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th>Plan</th>
              <th>Renews</th>
              <th>Members</th>
              <th>Invites</th>
              <th>Personnel</th>
              <th>Records</th>
              <th>Files</th>
              <th>Last activity</th>
              <th>Export</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !rows.length && (
              <tr><td colSpan={10} className="empty-table">No departments.</td></tr>
            )}
            {rows.map((row) => {
              const ready = exports[row.departmentId];
              return (
                <tr key={row.departmentId}>
                  <td>
                    <strong>{row.name}</strong>
                    <div className="auth-help">{row.subdomain}</div>
                  </td>
                  <td>
                    {row.subscription
                      ? `${row.subscription.planId} · ${SUBSCRIPTION_STATUS_LABELS[row.subscription.status] || row.subscription.status}`
                      : "No subscription"}
                  </td>
                  <td>{row.subscription?.renewalDate ? formatShortDate(row.subscription.renewalDate) : "—"}</td>
                  <td title={`${row.members?.total ?? 0} total`}>{row.members?.active ?? "—"}</td>
                  <td>{row.pendingInvites ?? "—"}</td>
                  <td>{row.personnel}</td>
                  <td title={(row.topCollections || []).map((c) => `${c.name}: ${c.count}`).join("\n")}>{row.records}</td>
                  <td>{row.storage?.files ?? "—"} · {formatBytes(row.storage?.bytes)}</td>
                  <td>{formatWhen(row.lastActivity)}</td>
                  <td>
                    {ready ? (
                      <a className="secondary-button" href={ready.url} target="_blank" rel="noopener noreferrer">
                        <Download size={14} /> Download
                      </a>
                    ) : (
                      <button type="button" className="secondary-button" onClick={() => exportDepartment(row)} disabled={Boolean(exporting)}>
                        <Download size={14} /> {exporting === row.departmentId ? "Exporting..." : "Export data"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="auth-help">
        Exports are a JSON file of every record plus a list of uploaded files. Integration API keys and invite tokens are never
        included. Download links are private to whoever has them; keep them safe.
      </p>
    </div>
  );
}
