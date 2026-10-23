import { useEffect, useMemo, useState } from "react";
import {
  Biohazard, ChevronRight, CirclePlus, ClipboardList, FileText, Flame, HandHelping, HeartPulse, LifeBuoy, Search,
  ShieldQuestion, Sparkles, Wifi, WifiOff, X,
} from "lucide-react";
import NerisReportEditor from "../components/neris/NerisReportEditor.jsx";
import { ProgressRing } from "../components/neris/NerisControls.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { NERIS_FORM_MODULES, summarizeIncidentType } from "../lib/nerisSchema.js";
import { NERIS_REPORT_STATUSES } from "../lib/neris/workflow.js";
import { autoPopulateReport } from "../lib/neris/autoPopulation.js";
import { isNerisFeatureEnabled } from "../lib/neris/featureFlags.js";
import { queueOfflineReport, syncOfflineQueue } from "../lib/neris/offlineSync.js";
import {
  INCIDENT_KINDS, STATUS_GROUPS, applicability, checklistProgress, primaryTypeLabel, statusTone,
} from "../lib/neris/reportModel.js";
import { uniqueRecordId } from "../lib/recordIds.js";

export { NERIS_REPORT_STATUSES };

const KIND_ICONS = { fire: Flame, ems: HeartPulse, rescue: LifeBuoy, hazmat: Biohazard, service: HandHelping, noemerg: ShieldQuestion };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Next report number for the year, e.g. NERIS-2026-014 (never reuses a number). */
function nextReportNumber(records = []) {
  const year = new Date().getFullYear();
  const prefix = `NERIS-${year}-`;
  const highest = records.reduce((max, r) => {
    const n = String(r.reportNumber || "").startsWith(prefix) ? Number(String(r.reportNumber).slice(prefix.length)) : 0;
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

function buildNewReport(records, { disciplines = [], incidentDate, incidentAddress }) {
  const now = new Date().toISOString();
  const reportNumber = nextReportNumber(records);
  return {
    id: uniqueRecordId("NERIS"),
    reportNumber,
    incidentDate: incidentDate || todayIso(),
    incidentAddress: incidentAddress || "",
    incidentTypeSummary: "",
    status: "Draft",
    disciplines,
    reviewStage: "author",
    locked: false,
    createdAt: now,
    updatedAt: now,
    workspace: {
      cad: {}, location: {}, units: [], personnel: [], weather: {}, ems: {}, rescue: {}, wildland: {},
      casualties: {}, propertyLoss: {}, actions: [], narrative: {}, attachments: [], approvals: [], auditLog: [], investigations: {}, disciplines,
    },
    autoPopulateSources: {},
    fieldOverrides: {},
    fieldInputOverrides: {},
    modules: Object.fromEntries(NERIS_FORM_MODULES.map((module) => [module.id, module.id === "core_mod_incident" ? { incident_internal_id: reportNumber } : {}])),
  };
}

function kindOf(report) {
  const a = applicability(report);
  if (a.fire) return "fire";
  if (a.hazmat) return "hazmat";
  if (a.rescue) return "rescue";
  if (a.ems) return "ems";
  const types = report.modules?.core_mod_incident?.incident_final_type;
  const first = String((Array.isArray(types) ? types.flat()[0] : types) || "");
  if (first.startsWith("PUBSERV")) return "service";
  if (first.startsWith("NOEMERG")) return "noemerg";
  return "";
}

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
  const { settings, departmentId, profile } = useTenant();
  const { user, membership } = useAuth();
  const [selectedId, setSelectedId] = useState("");
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [savedAt, setSavedAt] = useState("");
  const reviewerName = membership?.displayName || user?.displayName || user?.email || "";

  const sources = useMemo(() => ({ personnel, apparatus, occupancies, preplans, inspections, scheduleDays, hydrants }),
    [personnel, apparatus, occupancies, preplans, inspections, scheduleDays, hydrants]);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      if (!isNerisFeatureEnabled(settings, "offlineIncidentReports")) return;
      const { merged, synced, conflicts } = syncOfflineQueue(records);
      if (synced > 0) {
        setRecords(merged);
        setMessage(`Synced ${synced} report${synced !== 1 ? "s" : ""} saved while offline.`);
      }
      if (conflicts.length) setMessage(`${conflicts.length} report(s) changed in two places while offline. Check them before submitting.`);
    }
    function handleOffline() { setOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [records, setRecords, settings]);

  const sorted = useMemo(() => [...records].sort((a, b) => String(b.incidentDate || b.createdAt || "").localeCompare(String(a.incidentDate || a.createdAt || ""))), [records]);
  const counts = useMemo(() => Object.fromEntries(STATUS_GROUPS.map((g) => [g.id, g.statuses ? records.filter((r) => g.statuses.includes(r.status || "Draft")).length : records.length])), [records]);

  const visible = useMemo(() => {
    const statuses = STATUS_GROUPS.find((g) => g.id === group)?.statuses;
    const term = `${search} ${query}`.trim().toLowerCase();
    return sorted.filter((r) => {
      if (statuses && !statuses.includes(r.status || "Draft")) return false;
      if (!term) return true;
      return [r.reportNumber, r.incidentAddress, r.incidentTypeSummary, r.status, summarizeIncidentType(r.modules || {}), r.workspace?.location?.occupancyName]
        .join(" ").toLowerCase().includes(term);
    });
  }, [sorted, group, search, query]);

  const selected = records.find((r) => r.id === selectedId) || null;

  // Every change is applied to the latest copy of the report, so two changes made
  // back to back (e.g. the narrative text and its NERIS field) don't overwrite each other.
  function applyToSelected(change) {
    if (!selected) return;
    const id = selected.id;
    const queueOffline = !online && isNerisFeatureEnabled(settings, "offlineIncidentReports");
    setRecords((current) => current.map((r) => {
      if (r.id !== id) return r;
      const patch = change(r);
      const next = {
        ...r,
        ...patch,
        status: patch.status || (r.status === "Draft" ? "In Progress" : r.status),
        updatedAt: new Date().toISOString(),
        syncStatus: online ? "synced" : "pending",
      };
      next.completionPercentage = checklistProgress(next).percent;
      if (queueOffline) queueOfflineReport(next);
      return next;
    }));
    setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  }

  function updateSelected(patch) {
    applyToSelected((current) => (patch.workspace
      ? { ...patch, workspace: { ...(current.workspace || {}), ...patch.workspace } }
      : patch));
  }

  function updateModuleField(moduleId, fieldName, value) {
    applyToSelected((current) => {
      const modules = { ...(current.modules || {}) };
      modules[moduleId] = { ...(modules[moduleId] || {}), [fieldName]: value };
      return { modules };
    });
  }

  function startReport(details) {
    const next = buildNewReport(records, details);
    setRecords((current) => [next, ...current]);
    setSelectedId(next.id);
    setStarting(false);
  }

  function autoFill() {
    if (!selected) return;
    const filled = autoPopulateReport(selected, sources);
    updateSelected({ workspace: filled.workspace, autoPopulateSources: filled.autoPopulateSources });
    const found = [];
    if (filled.workspace.location?.occupancyName && !selected.workspace?.location?.occupancyName) found.push("property details");
    if ((filled.workspace.personnel || []).length && !(selected.workspace?.personnel || []).length) found.push("crew from the schedule");
    setMessage(found.length ? `Filled in ${found.join(" and ")}. Check them before you submit.` : "Nothing new to fill in from FORGE records for this address and date.");
  }

  function deleteDraft() {
    if (!selected) return;
    if (!window.confirm(`Delete draft ${selected.reportNumber}? This can't be undone.`)) return;
    const number = selected.reportNumber;
    setRecords((current) => current.filter((r) => r.id !== selected.id));
    setSelectedId("");
    setMessage(`Deleted draft ${number}.`);
  }

  function recordSubmission() {
    if (!selected) return;
    if (!window.confirm(`Have you submitted ${selected.reportNumber} in the NERIS portal? This records it as submitted and locks the report.`)) return;
    updateSelected({ status: "Submitted", submittedAt: new Date().toISOString(), submissionMethod: "manual-neris-portal", locked: true });
    setMessage(`${selected.reportNumber} recorded as submitted.`);
  }

  const banner = message ? (
    <div className="nr-banner" role="status">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button>
    </div>
  ) : null;

  if (selected) {
    return (
      <div className="module-page nr-page">
        {banner}
        <NerisReportEditor
          report={selected}
          allReports={records}
          canEdit={canEdit}
          departmentId={departmentId}
          online={online}
          savedAt={savedAt}
          reviewerName={reviewerName}
          sources={sources}
          onUpdate={updateSelected}
          onUpdateModule={updateModuleField}
          onAutoPopulate={autoFill}
          onRecordSubmission={recordSubmission}
          onOpenReport={setSelectedId}
          onDelete={deleteDraft}
          onClose={() => { setSelectedId(""); setMessage(""); }}
        />
      </div>
    );
  }

  return (
    <div className="module-page nr-page">
      <section className="nr-hero">
        <div className="nr-hero-text">
          <span className="nr-hero-icon"><FileText size={22} /></span>
          <div>
            <h1>Incident Reports</h1>
            <p>NERIS reporting for {profile?.shortName || profile?.name || "your department"}. Step-by-step, with an AI writer for the narrative.</p>
          </div>
        </div>
        <div className="nr-hero-actions">
          <span className={`nr-pill ${online ? "nr-pill-ok" : "nr-pill-warn"}`}>{online ? <Wifi size={12} /> : <WifiOff size={12} />} {online ? "Online" : "Offline — saving on this device"}</span>
          {canEdit ? <button type="button" className="nr-btn nr-btn-primary nr-btn-lg" onClick={() => setStarting(true)}><CirclePlus size={18} /> Start a report</button> : null}
        </div>
      </section>

      {banner}

      <section className="nr-stats">
        {STATUS_GROUPS.filter((g) => g.id !== "all").map((g) => (
          <button key={g.id} type="button" className={`nr-stat nr-stat-${g.id}${group === g.id ? " active" : ""}`} onClick={() => setGroup(group === g.id ? "all" : g.id)}>
            <strong>{counts[g.id]}</strong>
            <span>{g.label}</span>
          </button>
        ))}
      </section>

      <section className="nr-list-card">
        <div className="nr-toolbar">
          <div className="nr-segmented nr-small" role="tablist">
            {STATUS_GROUPS.map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className={group === g.id ? "active" : ""} onClick={() => setGroup(g.id)}>
                {g.label} <span className="nr-count-badge">{counts[g.id]}</span>
              </button>
            ))}
          </div>
          <label className="nr-search">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, address, type…" />
          </label>
        </div>

        {visible.length ? (
          <ul className="nr-reports">
            {visible.map((r) => {
              const kind = kindOf(r);
              const Icon = KIND_ICONS[kind] || ClipboardList;
              const prog = checklistProgress(r);
              return (
                <li key={r.id}>
                  <button type="button" className="nr-report" onClick={() => setSelectedId(r.id)}>
                    <span className={`nr-report-icon nr-kind-${kind || "other"}`}><Icon size={18} /></span>
                    <span className="nr-report-main">
                      <strong>{primaryTypeLabel(r)}</strong>
                      <small>
                        {r.reportNumber}
                        {r.incidentDate ? ` · ${r.incidentDate}` : ""}
                        {r.incidentAddress ? ` · ${r.incidentAddress}` : ""}
                      </small>
                    </span>
                    <span className="nr-report-side">
                      {r.workspace?.narrative?.aiGenerated && !r.workspace?.narrative?.reviewedAt ? <span className="nr-pill nr-pill-warn nr-hide-sm"><Sparkles size={11} /> AI draft to review</span> : null}
                      {r.status !== "Submitted" && prog.missing.length ? <span className="nr-missing-count nr-hide-sm">{prog.missing.length} to do</span> : null}
                      <span className={`nr-status nr-status-${statusTone(r.status)}`}>{r.status || "Draft"}</span>
                      <ProgressRing percent={prog.percent} size={38} stroke={4} />
                      <ChevronRight size={18} className="nr-chevron" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="nr-empty-state">
            <span className="nr-empty-icon"><ClipboardList size={28} /></span>
            <h3>{records.length ? "No reports match" : "No incident reports yet"}</h3>
            <p>{records.length ? "Try another filter or search." : "Start a report after a call. It takes you step by step, and the AI writer can draft the narrative."}</p>
            {canEdit && !records.length ? <button type="button" className="nr-btn nr-btn-primary" onClick={() => setStarting(true)}><CirclePlus size={16} /> Start a report</button> : null}
          </div>
        )}
      </section>

      {starting ? <StartReportDialog onCancel={() => setStarting(false)} onStart={startReport} /> : null}
    </div>
  );
}

function StartReportDialog({ onCancel, onStart }) {
  const [kinds, setKinds] = useState([]);
  const [incidentDate, setIncidentDate] = useState(todayIso());
  const [incidentAddress, setIncidentAddress] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function toggle(id) {
    setKinds((current) => (current.includes(id) ? current.filter((k) => k !== id) : [...current, id]));
  }

  return (
    <div className="nr-dialog-backdrop" onClick={onCancel}>
      <div className="nr-dialog" role="dialog" aria-modal="true" aria-labelledby="nr-start-title" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="nr-start-title">Start a report</h2>
          <button type="button" className="nr-icon-btn" aria-label="Close" onClick={onCancel}><X size={18} /></button>
        </header>
        <p className="nr-muted">What kind of call was it? Pick all that apply — you can change this later.</p>
        <div className="nr-kinds">
          {INCIDENT_KINDS.map((kind) => {
            const Icon = KIND_ICONS[kind.id];
            const on = kinds.includes(kind.id);
            return (
              <button key={kind.id} type="button" className={`nr-kind${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(kind.id)}>
                <span className={`nr-report-icon nr-kind-${kind.id}`}><Icon size={18} /></span>
                <strong>{kind.label}</strong>
                <small>{kind.hint}</small>
              </button>
            );
          })}
        </div>
        <div className="nr-grid">
          <div className="nr-field">
            <span className="nr-label">Incident date</span>
            <input className="nr-input" type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} />
          </div>
          <div className="nr-field">
            <span className="nr-label">Address or location</span>
            <input className="nr-input" value={incidentAddress} placeholder="123 Main St" onChange={(e) => setIncidentAddress(e.target.value)} />
          </div>
        </div>
        <footer>
          <button type="button" className="nr-btn nr-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="nr-btn nr-btn-primary"
            onClick={() => onStart({
              disciplines: INCIDENT_KINDS.filter((k) => kinds.includes(k.id) && k.discipline).map((k) => k.discipline),
              incidentDate,
              incidentAddress: incidentAddress.trim(),
            })}
          >
            Start report <ChevronRight size={16} />
          </button>
        </footer>
      </div>
    </div>
  );
}
