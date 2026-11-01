import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { listAuditLogs } from "../lib/auditService.js";
import { auditActionLabel, auditModule, auditSummary, auditTime, auditWhen, isRoutineSave } from "../lib/auditLabels.js";

/** Who did what, newest first. Loads once; filters run in the browser. */
export default function AuditLogPanel({ departmentId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [showRoutine, setShowRoutine] = useState(false);

  async function load() {
    if (!departmentId) return;
    setLoading(true);
    setError("");
    try {
      const next = await listAuditLogs(departmentId, { limit: 500 });
      setLogs([...next].sort((a, b) => auditTime(b) - auditTime(a)));
    } catch (loadError) {
      console.error("Failed to load audit logs", loadError);
      setError("Couldn't load the activity log. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [departmentId]);

  const visible = useMemo(() => logs.filter((log) => showRoutine || !isRoutineSave(log)), [logs, showRoutine]);
  const modules = useMemo(
    () => ["All", ...Array.from(new Set(visible.map(auditModule))).sort()],
    [visible]
  );
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return visible
      .filter((log) => moduleFilter === "All" || auditModule(log) === moduleFilter)
      .filter((log) => !term || [log.actorName, auditSummary(log), auditActionLabel(log.action), auditModule(log)]
        .some((value) => String(value || "").toLowerCase().includes(term)))
      .slice(0, 200);
  }, [visible, moduleFilter, search]);

  if (loading) return <p className="auth-help">Loading activity…</p>;

  return (
    <>
      <p className="auth-help">Who changed what in this department, newest first.</p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="admin-filter-bar audit-log-filters">
        <label className="audit-log-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people or changes"
            aria-label="Search the activity log"
          />
        </label>
        <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} aria-label="Filter by area">
          {modules.map((item) => (
            <option key={item} value={item}>{item === "All" ? "All areas" : item}</option>
          ))}
        </select>
        <label className="audit-log-toggle">
          <input type="checkbox" checked={showRoutine} onChange={(event) => setShowRoutine(event.target.checked)} />
          Show routine list saves
        </label>
        <button type="button" className="secondary-button" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <div className="admin-audit-table">
        <div className="admin-audit-row admin-audit-head">
          <span>When</span><span>Who</span><span>What</span><span>Area</span><span>Details</span>
        </div>
        {rows.map((log) => (
          <div className="admin-audit-row" key={log.id}>
            <span>{auditWhen(log)}</span>
            <span>{log.actorName || "System"}</span>
            <span>{auditActionLabel(log.action)}</span>
            <span>{auditModule(log)}</span>
            <span>{auditSummary(log)}</span>
          </div>
        ))}
        {!rows.length && <p className="empty-table">{logs.length ? "Nothing matches these filters." : "No activity yet."}</p>}
      </div>
    </>
  );
}
