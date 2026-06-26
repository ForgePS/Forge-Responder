import { useEffect, useMemo, useState } from "react";
import { CirclePlus, FileText, Wifi, WifiOff, X } from "lucide-react";
import NerisIncidentWorkspace from "../components/neris/NerisIncidentWorkspace.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { normalizeNerisFieldConfig } from "../lib/neris/fieldConfig.js";
import {
  NERIS_FORM_MODULES,
  NERIS_SCHEMA_REPO,
  summarizeIncidentType,
  summarizeReportAddress,
} from "../lib/nerisSchema.js";
import { NERIS_REPORT_STATUSES, statusTone, applyReviewAction } from "../lib/neris/workflow.js";
import { autoPopulateReport } from "../lib/neris/autoPopulation.js";
import { computeCompletionPercentage } from "../lib/neris/validation.js";
import { isNerisFeatureEnabled } from "../lib/neris/featureFlags.js";
import { queueOfflineReport, syncOfflineQueue } from "../lib/neris/offlineSync.js";

export { NERIS_REPORT_STATUSES };

function Badge({ children }) {
  const tone = statusTone(children);
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function buildEmptyReport(records = []) {
  const nextNumber = `NERIS-${new Date().getFullYear()}-${String(records.length + 1).padStart(3, "0")}`;
  const now = new Date().toISOString();
  return {
    id: `NERIS-${Date.now()}`,
    reportNumber: nextNumber,
    incidentDate: new Date().toISOString().slice(0, 10),
    incidentAddress: "",
    incidentTypeSummary: "",
    status: "Draft",
    disciplines: [],
    reviewStage: "author",
    locked: false,
    createdAt: now,
    updatedAt: now,
    workspace: {
      cad: {},
      location: {},
      units: [],
      personnel: [],
      weather: {},
      ems: {},
      rescue: {},
      wildland: {
        irwinIncidentId: "",
        externalSyncStatus: "not_connected",
        resourceSyncStatus: "not_connected",
        operationalPeriodSync: "not_connected",
      },
      casualties: {},
      propertyLoss: {},
      actions: [],
      narrative: {},
      attachments: [],
      approvals: [],
      auditLog: {},
      investigations: {},
    },
    autoPopulateSources: {},
    fieldOverrides: {},
    fieldInputOverrides: {},
    modules: Object.fromEntries(NERIS_FORM_MODULES.map((module) => [module.id, {}])),
  };
}

/**
 * @param {{
 *   query?: string,
 *   records?: Array<Record<string, unknown>>,
 *   setRecords?: (updater: unknown) => void,
 *   canEdit?: boolean,
 *   personnel?: Array<Record<string, unknown>>,
 *   apparatus?: Array<Record<string, unknown>>,
 *   occupancies?: Array<Record<string, unknown>>,
 *   preplans?: Array<Record<string, unknown>>,
 *   inspections?: Array<Record<string, unknown>>,
 *   scheduleDays?: Array<Record<string, unknown>>,
 *   hydrants?: Array<Record<string, unknown>>,
 * }} props
 */
export default function NerisFireReportsPage({
  query = "",
  records = [],
  setRecords = () => {},
  canEdit = false,
  personnel = [],
  apparatus = [],
  occupancies = [],
  preplans = [],
  inspections = [],
  scheduleDays = [],
  hydrants = [],
}) {
  const { settings } = useTenant();
  const nerisFieldConfig = useMemo(
    () => normalizeNerisFieldConfig(settings?.nerisFieldConfig),
    [settings?.nerisFieldConfig],
  );
  const [selectedId, setSelectedId] = useState(records[0]?.id || "");
  const [editorOpen, setEditorOpen] = useState(Boolean(records[0]?.id));
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [autoSavedAt, setAutoSavedAt] = useState("");

  const forgeSources = useMemo(() => ({
    personnel, apparatus, occupancies, preplans, inspections, scheduleDays, hydrants,
  }), [personnel, apparatus, occupancies, preplans, inspections, scheduleDays, hydrants]);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      if (!isNerisFeatureEnabled(settings, "offlineIncidentReports")) return;
      const { merged, synced, conflicts } = syncOfflineQueue(records);
      if (synced > 0) {
        setRecords(merged);
        setMessage(`Synced ${synced} offline report${synced !== 1 ? "s" : ""}`);
      }
      if (conflicts.length) {
        setMessage(`${conflicts.length} sync conflict(s) require officer review`);
      }
    }
    function handleOffline() { setOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [records, setRecords, settings]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return records;
    return records.filter((report) => {
      const haystack = [
        report.reportNumber,
        report.incidentAddress,
        report.incidentTypeSummary,
        report.status,
        summarizeIncidentType(report.modules || {}),
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [records, query]);

  const selected = visible.find((report) => report.id === selectedId) || visible[0] || null;

  useEffect(() => {
    if (!visible.length) {
      setSelectedId("");
      setEditorOpen(false);
      return;
    }
    if (!visible.some((report) => report.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  function updateSelected(patch) {
    if (!selected) return;
    const next = {
      ...selected,
      ...patch,
      completionPercentage: patch.completionPercentage ?? computeCompletionPercentage({ ...selected, ...patch }),
      updatedAt: new Date().toISOString(),
      syncStatus: online ? "synced" : "pending",
    };
    if (!online && isNerisFeatureEnabled(settings, "offlineIncidentReports")) {
      queueOfflineReport(next);
    }
    setRecords((current) => current.map((report) => (
      report.id === selected.id ? next : report
    )));
    setAutoSavedAt(new Date().toLocaleTimeString());
  }

  function updateModuleField(moduleId, fieldName, value) {
    if (!selected) return;
    const modules = { ...(selected.modules || {}) };
    modules[moduleId] = { ...(modules[moduleId] || {}), [fieldName]: value };
    const incidentTypeSummary = moduleId === "core_mod_incident" && fieldName === "incident_final_type"
      ? (Array.isArray(value) ? value.join(", ") : String(value || ""))
      : selected.incidentTypeSummary;
    updateSelected({
      modules,
      incidentTypeSummary: incidentTypeSummary || summarizeIncidentType(modules),
    });
  }

  function createReport() {
    const next = buildEmptyReport(records);
    setRecords((current) => [next, ...current]);
    setSelectedId(next.id);
    setEditorOpen(true);
    setMessage(`Created ${next.reportNumber}`);
  }

  function openReport(id) {
    setSelectedId(id);
    setEditorOpen(true);
  }

  function saveReport() {
    if (!selected) return;
    updateSelected({
      incidentTypeSummary: summarizeIncidentType(selected.modules || {}) || selected.incidentTypeSummary,
    });
    setMessage(`Saved ${selected.reportNumber}`);
  }

  function completeReport() {
    if (!selected) return;
    if (selected.status === "Draft" || selected.status === "In Progress") {
      updateSelected(applyReviewAction(selected, { action: "submit", comments: "Marked complete by author" }));
      setMessage(`${selected.reportNumber} submitted for review`);
    } else if (selected.status === "Approved" || selected.status === "Ready for Submission") {
      updateSelected({ status: "Submitted", submittedAt: new Date().toISOString() });
      setMessage(`${selected.reportNumber} submitted to NERIS`);
    } else {
      saveReport();
    }
  }

  function handleAutoPopulate() {
    if (!selected) return;
    const populated = autoPopulateReport(selected, forgeSources);
    updateSelected({
      ...populated,
      status: selected.status === "Draft" ? "In Progress" : selected.status,
    });
    setMessage("Auto-populated from CAD, scheduling, apparatus, occupancy, and weather sources.");
  }

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(NERIS_REPORT_STATUSES.map((s) => [s, 0]));
    for (const r of records) {
      const key = NERIS_REPORT_STATUSES.includes(r.status) ? r.status : "Draft";
      counts[key] += 1;
    }
    return counts;
  }, [records]);

  if (editorOpen && selected) {
    return (
      <div className="module-page neris-fire-reports-page neris-editor-mode">
        {!online ? (
          <div className="neris-offline-banner">
            <WifiOff size={14} /> Offline — edits save locally and sync when connection returns.
          </div>
        ) : null}
        {message ? (
          <div className="success-banner" style={{ margin: "8px 16px" }}>
            {message}
            <button type="button" onClick={() => setMessage("")}><X size={13} /></button>
          </div>
        ) : null}
        <NerisIncidentWorkspace
          report={selected}
          allReports={visible}
          canEdit={canEdit}
          nerisFieldConfig={nerisFieldConfig}
          onUpdate={updateSelected}
          onUpdateModule={updateModuleField}
          onAutoPopulate={handleAutoPopulate}
          onSelectReport={openReport}
          onSave={saveReport}
          onComplete={completeReport}
          onClose={() => setEditorOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="module-page neris-fire-reports-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><FileText size={22} /></span>
          <div>
            <h1>NERIS Fire Reports</h1>
            <p>
              Smart incident documentation — NERIS-native reporting powered by Forge operational intelligence.
              {" "}
              <a href={NERIS_SCHEMA_REPO} target="_blank" rel="noreferrer">ulfsri/neris-framework</a>
            </p>
          </div>
        </div>
        <div className="heading-actions">
          {canEdit ? (
            <button type="button" className="primary-button" onClick={createReport}>
              <CirclePlus size={14} /> New report
            </button>
          ) : null}
        </div>
      </section>

      {!online ? (
        <div className="neris-offline-banner">
          <WifiOff size={14} /> Offline — edits save locally and sync when connection returns.
        </div>
      ) : (
        <div className="neris-online-banner">
          <Wifi size={14} /> Online{autoSavedAt ? ` · Auto-saved ${autoSavedAt}` : ""}
        </div>
      )}

      <section className="fleet-summary neris-status-summary">
        <div className="fleet-stat stat-info"><strong>{records.length}</strong><span>Total</span></div>
        <div className="fleet-stat stat-warning"><strong>{statusCounts.Draft + statusCounts["In Progress"]}</strong><span>In progress</span></div>
        <div className="fleet-stat stat-warning"><strong>{statusCounts["Needs Review"] + statusCounts.Returned}</strong><span>Review</span></div>
        <div className="fleet-stat stat-success"><strong>{statusCounts.Approved + statusCounts["Ready for Submission"]}</strong><span>Approved</span></div>
        <div className="fleet-stat stat-success"><strong>{statusCounts.Submitted}</strong><span>Submitted</span></div>
      </section>

      {message ? <div className="success-banner">{message}<button type="button" onClick={() => setMessage("")}><X size={13} /></button></div> : null}

      <section className="neris-list-view">
        <div className="neris-list-view-header">
          <h2>Incident Reports</h2>
          {canEdit ? (
            <button type="button" className="primary-button" onClick={createReport}>
              <CirclePlus size={14} /> New report
            </button>
          ) : null}
        </div>
        {visible.length ? (
          <table className="neris-list-table">
            <thead>
              <tr>
                <th>Report #</th>
                <th>Date</th>
                <th>Address</th>
                <th>Type</th>
                <th>Status</th>
                <th>Complete</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((report) => (
                <tr
                  key={report.id}
                  className={report.id === selected?.id ? "selected" : ""}
                  onClick={() => openReport(report.id)}
                >
                  <td><strong>{report.reportNumber}</strong></td>
                  <td>{report.incidentDate || "—"}</td>
                  <td>{summarizeReportAddress(report) || "—"}</td>
                  <td>{report.incidentTypeSummary || summarizeIncidentType(report.modules || {}) || "—"}</td>
                  <td><Badge>{report.status}</Badge></td>
                  <td>{report.completionPercentage ?? computeCompletionPercentage(report)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="neris-empty-state">No NERIS fire reports yet. Create a report to begin capture.</p>
        )}
      </section>
    </div>
  );
}
