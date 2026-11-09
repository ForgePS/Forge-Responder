import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, { FleetEmptyState, FleetPermissionGate } from "../components/fleet/FleetModuleLayout.jsx";
import {
  canEditFleetWorkOrders,
  canViewFleetWorkOrders,
  ensureFleetAssets,
  subscribeFleetWorkOrders,
  syncLegacyWorkOrders,
} from "../lib/fleet/index.js";
import { subscribeDamageForms } from "../lib/damageFormService.js";
import {
  ISSUE_OUTCOME_LABELS,
  ISSUE_PATHS,
  ISSUE_PATH_OPTIONS,
  ISSUE_STAGES,
  OVERDUE_AFTER_DAYS,
  buildMaintenanceIssues,
  filterMaintenanceIssues,
  nextStep,
  pathSteps,
  stepLabel,
  summarizeMaintenanceIssues,
} from "../lib/maintenanceIssueBoard.js";
import { addIssueNote, advanceIssueStep, setIssuePath, startTrackingIssue } from "../lib/maintenanceIssueService.js";
import { friendlyError } from "../lib/friendlyError.js";
import "../styles/maintenance-issues.css";

const PATH_TONE = { repair: "info", replace: "warning", dispose: "neutral", no_action: "neutral" };
const OUTCOME_TONE = { repaired: "success", replaced: "success", disposed: "neutral", no_action: "neutral", cancelled: "neutral" };
const SOURCES = ["Employee Portal", "FORGE FIELD", "Fleet", "JotForm (older)"];

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ageLabel(days = 0) {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function IssueBadges({ issue }) {
  return (
    <span className="mi-badges">
      {issue.stage === "resolved" && issue.outcome ? (
        <span className={`badge badge-${OUTCOME_TONE[issue.outcome] || "neutral"}`}>{ISSUE_OUTCOME_LABELS[issue.outcome]}</span>
      ) : issue.path ? (
        <span className={`badge badge-${PATH_TONE[issue.path] || "neutral"}`}>{ISSUE_PATHS[issue.path]?.label}</span>
      ) : null}
      {issue.safety ? <span className="badge badge-critical">Safety</span> : null}
      {issue.overdue ? <span className="badge badge-warning">Overdue</span> : null}
    </span>
  );
}

function IssueCard({ issue, active, onOpen }) {
  const step = issue.stage === "in_progress" ? stepLabel(issue.path, issue.step) : "";
  return (
    <button type="button" className={`mi-card${active ? " active" : ""}${issue.safety ? " is-safety" : ""}`} onClick={() => onOpen(issue.id)}>
      <span className="mi-card-top">
        <strong>{issue.title}</strong>
        {issue.photos.length ? <ImageIcon size={14} aria-label={`${issue.photos.length} photo(s)`} /> : null}
      </span>
      <span className="mi-card-meta">
        {issue.unit ? <span>{issue.unit}</span> : null}
        <span>{issue.source}</span>
      </span>
      {step ? <span className="mi-card-step">{step}</span> : null}
      <span className="mi-card-bottom">
        <IssueBadges issue={issue} />
        <span className="mi-card-age"><Clock3 size={12} aria-hidden /> {issue.stage === "resolved" ? formatDate(issue.resolvedAt) : ageLabel(issue.ageDays)}</span>
      </span>
    </button>
  );
}

function PathProgress({ issue }) {
  const steps = pathSteps(issue.path);
  if (!steps.length) return null;
  const reached = steps.findIndex((step) => step.id === issue.step);
  return (
    <ol className="mi-progress" aria-label={`${ISSUE_PATHS[issue.path]?.label} progress`}>
      {steps.map((step, index) => (
        <li key={step.id} className={index < reached ? "done" : index === reached ? "current" : ""}>
          <span className="mi-progress-dot" aria-hidden>{index < reached || (index === reached && issue.stage === "resolved") ? <CheckCircle2 size={14} /> : index + 1}</span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function IssueDetail({ issue, canEdit, busy, onClose, onStartTracking, onSetPath, onAdvance, onNote, onOpenWorkOrders }) {
  const [note, setNote] = useState("");
  const [choosingPath, setChoosingPath] = useState(false);
  const upcoming = issue.path ? nextStep(issue.path, issue.step) : null;
  const open = issue.stage !== "resolved";
  const showPathChooser = canEdit && issue.workOrder && open && (!issue.path || choosingPath);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action) => {
    const ok = await action(note);
    if (ok) {
      setNote("");
      setChoosingPath(false);
    }
  };

  return (
    <div className="mi-drawer-layer" role="presentation">
      <button type="button" className="mi-drawer-scrim" aria-label="Close issue" onClick={onClose} />
      <aside className="mi-drawer" role="dialog" aria-modal="true" aria-labelledby="mi-detail-title">
        <header className="mi-drawer-header">
          <div>
            <p className="mi-eyebrow">{ISSUE_STAGES.find((stage) => stage.id === issue.stage)?.label}{issue.workOrderNumber ? ` · ${issue.workOrderNumber}` : ""}</p>
            <h3 id="mi-detail-title">{issue.title}</h3>
            <IssueBadges issue={issue} />
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="mi-drawer-body">
          {issue.description ? <p className="mi-description">{issue.description}</p> : null}

          <dl className="mi-facts">
            <div><dt>Unit / location</dt><dd>{issue.unit || "Not given"}</dd></div>
            <div><dt>Reported</dt><dd>{formatDate(issue.reportedAt) || "Unknown"}{issue.reportedBy ? ` by ${issue.reportedBy}` : ""}</dd></div>
            <div><dt>Source</dt><dd>{issue.source}</dd></div>
            <div><dt>{open ? "Open for" : "Took"}</dt><dd>{ageLabel(issue.ageDays)}</dd></div>
          </dl>

          {issue.photos.length ? (
            <div className="mi-photos">
              {issue.photos.map((photo) => (
                <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" title={photo.name || "Open photo"}>
                  <img src={photo.url} alt={photo.name || "Damage photo"} loading="lazy" />
                </a>
              ))}
            </div>
          ) : null}

          {issue.path ? (
            <section className="mi-section">
              <h4>{ISSUE_PATHS[issue.path]?.label} path</h4>
              <PathProgress issue={issue} />
            </section>
          ) : null}

          {canEdit ? (
            <section className="mi-section mi-actions">
              {!issue.workOrder ? (
                <>
                  <p className="mi-help">This report has no work order yet. Start tracking it to triage and follow it through.</p>
                  <button type="button" className="primary-button" disabled={busy} onClick={() => run(() => onStartTracking(issue))}>
                    <Wrench size={14} /> Start tracking
                  </button>
                </>
              ) : open ? (
                <>
                  <label className="mi-field">
                    <span>Note (optional)</span>
                    <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Ordered from Fire Supply Co., PO 4471" />
                  </label>
                  {showPathChooser ? (
                    <div className="mi-path-choices" role="group" aria-label="Choose what happens to this issue">
                      {ISSUE_PATH_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={option.id === "no_action" ? "secondary-button" : "primary-button"}
                          disabled={busy}
                          onClick={() => run((text) => onSetPath(issue, option.id, text))}
                        >
                          {option.label}
                        </button>
                      ))}
                      {issue.path ? <button type="button" className="secondary-button" onClick={() => setChoosingPath(false)}>Keep {ISSUE_PATHS[issue.path]?.label}</button> : null}
                    </div>
                  ) : (
                    <div className="mi-path-choices">
                      {upcoming ? (
                        <button type="button" className="primary-button" disabled={busy} onClick={() => run((text) => onAdvance(issue, upcoming.id, text))}>
                          Mark: {upcoming.label} <ChevronRight size={14} />
                        </button>
                      ) : null}
                      <button type="button" className="secondary-button" disabled={busy} onClick={() => setChoosingPath(true)}>Change path</button>
                      <button type="button" className="secondary-button" disabled={busy || !note.trim()} onClick={() => run((text) => onNote(issue, text))}>Add note</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="mi-path-choices">
                  <label className="mi-field mi-field-inline">
                    <span>Note (optional)</span>
                    <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
                  </label>
                  <button type="button" className="secondary-button" disabled={busy || !note.trim()} onClick={() => run((text) => onNote(issue, text))}>Add note</button>
                </div>
              )}
            </section>
          ) : null}

          <section className="mi-section">
            <h4>Timeline</h4>
            <ol className="mi-timeline">
              {issue.timeline.map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  <span className="mi-timeline-at">{formatDateTime(event.at)}</span>
                  <strong>{event.label}</strong>
                  {event.detail ? <span className="mi-timeline-detail">{event.detail}</span> : null}
                </li>
              ))}
            </ol>
          </section>

          {issue.workOrder ? (
            <button type="button" className="secondary-button mi-link-button" onClick={onOpenWorkOrders}>
              <ExternalLink size={14} /> Open in Fleet Work Orders
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export default function MaintenanceIssuesPage({ onNavigate, legacyApparatus = [], legacyWorkOrders = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetWorkOrders(permissions, isCreator);
  const canEdit = canEditFleetWorkOrders(permissions, isCreator);

  const [workOrders, setWorkOrders] = useState([]);
  const [damageForms, setDamageForms] = useState([]);
  const [loaded, setLoaded] = useState({ orders: false, forms: false });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [filters, setFilters] = useState({ search: "", path: "", source: "", safetyOnly: false, overdueOnly: false, stage: "" });
  const [now, setNow] = useState(() => Date.now());

  const actor = useMemo(() => ({
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  }), [user, membership]);

  // Editors first copy classic list reports (e.g. FORGE FIELD) into Fleet so they can be tracked.
  useEffect(() => {
    if (!departmentId || !allowed || !canEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const assets = await ensureFleetAssets(departmentId, legacyApparatus, actor);
        if (!cancelled) await syncLegacyWorkOrders(departmentId, legacyWorkOrders, { ...actor, assets });
      } catch (syncError) {
        console.warn("Maintenance Dashboard: classic work orders not synced", syncError);
      }
    })();
    return () => { cancelled = true; };
    // Runs once per department; the live subscriptions below pick up what it adds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, canEdit]);

  useEffect(() => {
    if (!departmentId || !allowed) return undefined;
    const onError = (loadError) => {
      console.error(loadError);
      setError(friendlyError(loadError, "Couldn't load maintenance issues."));
    };
    const stopOrders = subscribeFleetWorkOrders(departmentId, (rows) => {
      setWorkOrders(rows);
      setLoaded((current) => ({ ...current, orders: true }));
    }, onError);
    const stopForms = subscribeDamageForms(departmentId, (rows) => {
      setDamageForms(rows);
      setLoaded((current) => ({ ...current, forms: true }));
    }, onError);
    return () => {
      stopOrders();
      stopForms();
    };
  }, [departmentId, allowed]);

  // Keep ages and "overdue" current on a page left open all shift.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const issues = useMemo(() => buildMaintenanceIssues({ workOrders, damageForms, now }), [workOrders, damageForms, now]);
  const summary = useMemo(() => summarizeMaintenanceIssues(issues, { now }), [issues, now]);
  const filtered = useMemo(() => filterMaintenanceIssues(issues, filters), [issues, filters]);
  const columns = useMemo(() => {
    const recentCutoff = now - summary.windowDays * 86400000;
    return ISSUE_STAGES
      .filter((stage) => !filters.stage || stage.id === filters.stage)
      .map((stage) => ({
        ...stage,
        issues: filtered.filter((issue) => issue.stage === stage.id
          && (stage.id !== "resolved" || filters.stage === "resolved" || new Date(issue.resolvedAt).getTime() >= recentCutoff)),
      }));
  }, [filtered, filters.stage, now, summary.windowDays]);
  const activeIssue = issues.find((issue) => issue.id === activeId) || null;
  const loading = !loaded.orders || !loaded.forms;

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const toggleKpi = (patch) => setFilters((current) => {
    const isOn = Object.entries(patch).every(([key, value]) => current[key] === value);
    const reset = { stage: "", safetyOnly: false, overdueOnly: false };
    return { ...current, ...reset, ...(isOn ? {} : patch) };
  });
  // A KPI card is "on" when it is filtering (the "Open issues" card only clears filters).
  const kpiActive = (patch) => Object.values(patch).some(Boolean)
    && Object.entries(patch).every(([key, value]) => filters[key] === value);

  async function perform(action, success) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      const warnings = result?.warnings || [];
      setMessage([success, ...warnings].filter(Boolean).join(" "));
      return true;
    } catch (actionError) {
      console.error(actionError);
      setError(friendlyError(actionError, "Couldn't save that change. Try again."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const handlers = {
    onStartTracking: async (issue) => {
      let createdId = "";
      const ok = await perform(async () => {
        const created = await startTrackingIssue(departmentId, issue.damageForm, actor);
        createdId = created.id;
        return created;
      }, "Work order opened. Choose what happens to this issue next.");
      if (ok && createdId) setActiveId(createdId);
      return ok;
    },
    onSetPath: (issue, path, note) => perform(
      () => setIssuePath(departmentId, issue.workOrder, path, { note }, actor),
      path === "no_action" ? "Issue closed: no action needed." : `Path set to ${ISSUE_PATHS[path].label}.`,
    ),
    onAdvance: (issue, stepId, note) => perform(
      () => advanceIssueStep(departmentId, issue.workOrder, stepId, { note }, actor),
      `${stepLabel(issue.path, stepId)}.`,
    ),
    onNote: (issue, note) => perform(() => addIssueNote(departmentId, issue.workOrder, note, actor), "Note added."),
  };

  const kpis = [
    { label: "Awaiting triage", value: summary.new, patch: { stage: "new" }, tone: summary.new ? "info" : "" },
    { label: "Open issues", value: summary.open, patch: { stage: "" }, tone: "" },
    { label: "Safety / out of service", value: summary.safety, patch: { safetyOnly: true }, tone: summary.safety ? "critical" : "" },
    { label: `Overdue (${OVERDUE_AFTER_DAYS}+ days)`, value: summary.overdue, patch: { overdueOnly: true }, tone: summary.overdue ? "warning" : "" },
    { label: "Avg. days open", value: summary.avgDaysOpen, tone: "" },
    { label: `Resolved, last ${summary.windowDays} days`, value: summary.resolvedRecently, patch: { stage: "resolved" }, tone: "success", sub: summary.resolvedRecently ? `avg. ${summary.avgDaysToResolve} days` : "" },
  ];

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Maintenance Dashboard"
        description="Every reported issue from intake to its outcome: repaired, replaced or disposed of."
        activeNavName="Maintenance Dashboard"
        onNavigate={onNavigate}
      >
        <div className="mi-page">
          {error ? <p className="inspections-error-state" role="alert">{error}</p> : null}
          {message ? <p className="occupancy-message" role="status">{message}</p> : null}

          <div className="inspections-kpi-grid mi-kpis">
            {kpis.map((kpi) => {
              const content = (
                <>
                  <span>{kpi.label}</span>
                  <strong>{loading ? "–" : kpi.value}</strong>
                  {kpi.sub ? <small>{kpi.sub}</small> : null}
                </>
              );
              return kpi.patch ? (
                <button
                  key={kpi.label}
                  type="button"
                  className={`inspections-kpi-card inspections-kpi-card-button mi-kpi${kpi.tone ? ` mi-kpi-${kpi.tone}` : ""}${kpiActive(kpi.patch) ? " active" : ""}`}
                  aria-pressed={kpiActive(kpi.patch)}
                  onClick={() => toggleKpi(kpi.patch)}
                >
                  {content}
                </button>
              ) : (
                <article key={kpi.label} className="inspections-kpi-card mi-kpi">{content}</article>
              );
            })}
          </div>

          <section className="panel mi-outcomes" aria-label={`Outcomes, last ${summary.windowDays} days`}>
            <span className="mi-outcomes-title">Outcomes, last {summary.windowDays} days</span>
            {["repaired", "replaced", "disposed", "no_action"].map((key) => (
              <span key={key} className="mi-outcome">
                <span className={`badge badge-${OUTCOME_TONE[key]}`}>{ISSUE_OUTCOME_LABELS[key]}</span>
                <strong>{summary.byOutcome[key] || 0}</strong>
              </span>
            ))}
          </section>

          <div className="mi-filters">
            <label className="mi-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                value={filters.search}
                onChange={(event) => setFilter("search", event.target.value)}
                placeholder="Search issue, unit, reporter, work order"
                aria-label="Search maintenance issues"
              />
            </label>
            <select value={filters.path} onChange={(event) => setFilter("path", event.target.value)} aria-label="Filter by path">
              <option value="">All paths</option>
              {ISSUE_PATH_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <select value={filters.source} onChange={(event) => setFilter("source", event.target.value)} aria-label="Filter by source">
              <option value="">All sources</option>
              {SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
          </div>

          {loading ? (
            <p className="inspections-loading-state">Loading maintenance issues…</p>
          ) : !issues.length ? (
            <FleetEmptyState
              icon={Wrench}
              title="No maintenance issues reported yet"
              description="Reports from the Employee Portal, FORGE FIELD and the damage form appear here as they come in."
            />
          ) : (
            <div className={`mi-board${columns.length === 1 ? " single" : ""}`}>
              {columns.map((column) => (
                <section key={column.id} className={`mi-column mi-column-${column.id}`} aria-labelledby={`mi-col-${column.id}`}>
                  <header>
                    <h3 id={`mi-col-${column.id}`}>{column.label}</h3>
                    <span className="inspections-count">{column.issues.length}</span>
                  </header>
                  <p className="mi-column-hint">{column.id === "resolved" && filters.stage !== "resolved" ? `Last ${summary.windowDays} days` : column.hint}</p>
                  <div className="mi-column-list">
                    {column.issues.length ? column.issues.map((issue) => (
                      <IssueCard key={issue.id} issue={issue} active={issue.id === activeId} onOpen={setActiveId} />
                    )) : <p className="mi-column-empty">Nothing here</p>}
                  </div>
                </section>
              ))}
            </div>
          )}

          {!canEdit && issues.length ? (
            <p className="mi-help"><AlertTriangle size={14} aria-hidden /> You can view issues; fleet editors triage and update them.</p>
          ) : null}
        </div>

        {activeIssue ? (
          <IssueDetail
            key={activeIssue.id}
            issue={activeIssue}
            canEdit={canEdit}
            busy={busy}
            onClose={() => setActiveId("")}
            onOpenWorkOrders={() => onNavigate?.("Fleet Work Orders")}
            {...handlers}
          />
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
