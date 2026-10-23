import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { getFirestoreDb } from "../../lib/firebaseClient.js";
import { listAuditLogs } from "../../lib/auditService.js";
import { listPlatformDepartments } from "../../lib/platformService.js";
import { PLATFORM_SCOPE_ID } from "../../lib/tenantPaths.js";

const BILLING_SOURCE = "__billing__";
const BILLING_KIND_LABELS = {
  remind: "Reminder sent",
  mark_past_due: "Marked past due",
  renew_complimentary: "Complimentary renewal",
};

async function loadBillingEvents() {
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "platformBillingEvents"), orderBy("createdAt", "desc"), limit(300)));
  return snap.docs.map((d) => {
    const e = d.data();
    return {
      id: d.id,
      when: e.createdAt,
      action: BILLING_KIND_LABELS[e.kind] || e.kind,
      module: e.departmentName || e.departmentId,
      summary: [e.dueDate && `due ${e.dueDate}`, e.daysLeft != null && e.daysLeft >= 0 && `${e.daysLeft} days left`, e.emailStatus && `email: ${e.emailStatus}`]
        .filter(Boolean).join(" · "),
      actor: "Billing job",
    };
  });
}

/** Creator Console: browse any department's activity log, the platform log, or billing events. */
export default function PlatformAuditLogPanel() {
  const [departments, setDepartments] = useState([]);
  const [source, setSource] = useState(PLATFORM_SCOPE_ID);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    listPlatformDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (source === BILLING_SOURCE) {
        setRows(await loadBillingEvents());
      } else {
        const logs = await listAuditLogs(source, { limit: 300 });
        setRows(logs.map((log) => ({
          id: log.id,
          when: log.created_at || log.createdAt,
          action: log.action,
          module: log.module,
          summary: log.summary || (log.target ? `${log.target}` : ""),
          actor: log.actorName || log.actorUid || "",
        })));
      }
    } catch (loadError) {
      setRows([]);
      setError(loadError?.message || "Could not load the log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [source]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.action} ${row.module} ${row.summary} ${row.actor}`.toLowerCase().includes(term));
  }, [rows, filter]);

  return (
    <div className="platform-audit">
      <div className="platform-usage-toolbar">
        <label className="platform-audit-field">
          <span>Log</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value={PLATFORM_SCOPE_ID}>Platform (creator console)</option>
            <option value={BILLING_SOURCE}>Billing events</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name || d.id}</option>
            ))}
          </select>
        </label>
        <label className="platform-audit-field">
          <span>Filter</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Action, module, person..." />
        </label>
        <button type="button" className="secondary-button" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="data-table-wrap">
        <table>
          <thead>
            <tr><th>When</th><th>Action</th><th>{source === BILLING_SOURCE ? "Department" : "Module"}</th><th>Details</th><th>By</th></tr>
          </thead>
          <tbody>
            {!loading && !visible.length && <tr><td colSpan={5} className="empty-table">No entries.</td></tr>}
            {visible.map((row) => (
              <tr key={row.id}>
                <td>{row.when ? new Date(row.when).toLocaleString() : "—"}</td>
                <td>{row.action}</td>
                <td>{row.module}</td>
                <td className="platform-audit-summary">{row.summary}</td>
                <td>{row.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="auth-help">Showing the newest {Math.min(rows.length, 300)} entries.</p>
    </div>
  );
}
