import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Link2, Plus, RotateCcw, XCircle } from "lucide-react";
import { alertCategoryLabel, normalizeAlert } from "../../lib/preplans/alertModel.js";
import { decideAlert, decideReviewTask, listAlertsForPreplan, listFindingLinks, listReviewTasks } from "../../lib/preplans/alertService.js";
import AlertReportForm from "./AlertReportForm.jsx";

const SEVERITY_RANK = { critical: 0, high: 1, moderate: 2, low: 3 };
const TASK_STATUS_LABELS = { open: "open", investigating: "investigating", accepted: "preplan needs updating", rejected: "no change needed" };
const TASK_SOURCE_LABELS = { inspection: "From an inspection", occupancy: "Occupancy record changed", violation: "Inspection finding", manual: "Requested" };

function when(value) {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/**
 * Alerts, review requests and linked inspection findings for one preplan.
 * Anyone with preplan access can report; only approvers verify, reject or
 * resolve alerts (enforced again by firestore.rules).
 */
export default function PreplanAlertsPanel({ departmentId, preplan, canEdit = false, canApprove = false, actor = {}, onMessage, onError }) {
  const [alerts, setAlerts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [links, setLinks] = useState([]);
  const [reporting, setReporting] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!departmentId || !preplan?.id) return;
    const [alertRows, taskRows, linkRows] = await Promise.all([
      listAlertsForPreplan(departmentId, { preplanId: preplan.id, occupancyId: preplan.occupancyId }),
      listReviewTasks(departmentId, { preplanId: preplan.id }).catch(() => []),
      listFindingLinks(departmentId, { preplanId: preplan.id }).catch(() => []),
    ]);
    setAlerts(alertRows);
    setTasks(taskRows);
    setLinks(linkRows);
  }, [departmentId, preplan?.id, preplan?.occupancyId]);

  useEffect(() => {
    load().catch((error) => onError?.(error?.message || "Couldn't load alerts."));
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const { open, closed } = useMemo(() => {
    const rows = alerts.map(normalizeAlert)
      .sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return {
      open: rows.filter((row) => row.resolutionStatus === "active" && row.verificationStatus !== "rejected"),
      closed: rows.filter((row) => row.resolutionStatus !== "active" || row.verificationStatus === "rejected"),
    };
  }, [alerts]);
  const openTasks = tasks.filter((row) => row.status === "open" || row.status === "investigating");

  async function decide(alert, decision) {
    const note = decision === "reject" || decision === "resolve"
      ? window.prompt(decision === "reject" ? "Why isn't this a real condition?" : "How was it resolved?", "") : "";
    if (note === null) return;
    setBusyId(alert.id);
    try {
      await decideAlert(departmentId, alert.id, decision, actor, note);
      await load();
      onMessage?.({ verify: "Alert verified.", reverify: "Alert re-checked.", reject: "Alert rejected.", resolve: "Alert resolved." }[decision]);
    } catch (error) {
      onError?.(error?.message || "Couldn't update the alert.");
    } finally {
      setBusyId("");
    }
  }

  async function decideTask(task, status) {
    const note = window.prompt(
      status === "accepted" ? "Note (optional): what will change in the preplan?" : status === "rejected" ? "Why doesn't the preplan need to change?" : "Note (optional)",
      "",
    );
    if (note === null) return;
    setBusyId(task.id);
    try {
      await decideReviewTask(departmentId, task.id, status, actor, note);
      await load();
    } catch (error) {
      onError?.(error?.message || "Couldn't update the review request.");
    } finally {
      setBusyId("");
    }
  }

  const fpsAlert = (alert) => alert.source === "fps_impairment";

  function renderAlert(alert) {
    return (
      <li key={alert.id} className={`pal-alert sev-${alert.severity} is-${alert.verificationStatus}${alert.resolutionStatus === "resolved" ? " is-resolved" : ""}`}>
        <div className="pal-alert-head">
          <AlertTriangle size={14} aria-hidden="true" />
          <strong>{alertCategoryLabel(alert.category)}</strong>
          <span className="pal-badge">{alert.severity}</span>
          <span className={`pal-badge is-${alert.verificationStatus}`}>
            {alert.resolutionStatus === "resolved" ? "resolved" : alert.verificationStatus === "reported" ? "reported, not verified" : alert.verificationStatus}
          </span>
        </div>
        <p>{alert.description}</p>
        <small>
          {alert.source === "inspection" ? "From an inspection" : alert.source === "field_survey" ? "From a field survey" : "Reported"}
          {alert.createdByName ? ` by ${alert.createdByName}` : ""}{alert.createdAt ? ` · ${when(alert.createdAt)}` : ""}
          {alert.lastVerifiedAt ? ` · verified ${when(alert.lastVerifiedAt)}${alert.reviewedByName ? ` by ${alert.reviewedByName}` : ""}` : ""}
          {alert.reviewBy ? ` · check again by ${when(alert.reviewBy)}` : ""}
        </small>
        {canApprove && !fpsAlert(alert) && alert.resolutionStatus === "active" && alert.verificationStatus !== "rejected" ? (
          <div className="spm-row">
            {alert.verificationStatus === "reported" ? (
              <>
                <button type="button" className="secondary-button" disabled={busyId === alert.id} onClick={() => decide(alert, "verify")}><CheckCircle2 size={13} /> Verify</button>
                <button type="button" className="secondary-button danger" disabled={busyId === alert.id} onClick={() => decide(alert, "reject")}><XCircle size={13} /> Not a real condition</button>
              </>
            ) : (
              <button type="button" className="secondary-button" disabled={busyId === alert.id} onClick={() => decide(alert, "reverify")}><RotateCcw size={13} /> Still true</button>
            )}
            <button type="button" className="secondary-button" disabled={busyId === alert.id} onClick={() => decide(alert, "resolve")}>Resolved</button>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="pal-root">
      <section aria-label="Operational alerts">
        <div className="pal-head">
          <h4>Current alerts ({open.length})</h4>
          {canEdit && !reporting ? (
            <button type="button" className="secondary-button" onClick={() => setReporting(true)}><Plus size={13} /> Report an alert</button>
          ) : null}
        </div>
        <p className="fpe-muted">Current conditions, kept apart from the approved plan. Responders see them in the response view; unverified reports are labelled as such.</p>
        {reporting ? (
          <AlertReportForm
            departmentId={departmentId}
            context={{ preplanId: preplan.id, occupancyId: preplan.occupancyId || "", source: "manual" }}
            canVerify={canApprove}
            actor={actor}
            onCancel={() => setReporting(false)}
            onError={onError}
            onSaved={async () => { setReporting(false); await load(); onMessage?.("Alert saved."); }}
          />
        ) : null}
        {open.length ? <ul className="pal-list">{open.map(renderAlert)}</ul> : <p className="fpe-muted">No current alerts.</p>}
        {closed.length ? (
          <button type="button" className="link-button" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "Hide" : "Show"} resolved and rejected ({closed.length})
          </button>
        ) : null}
        {showClosed ? <ul className="pal-list is-closed">{closed.map(renderAlert)}</ul> : null}
      </section>

      <section aria-label="Review requests">
        <h4><ClipboardList size={14} /> Review requests ({openTasks.length} open)</h4>
        {tasks.length ? (
          <ul className="pal-list">
            {tasks.map((task) => (
              <li key={task.id} className={`pal-task is-${task.status}`}>
                <div className="pal-alert-head">
                  <strong>{task.reason || "Preplan review requested"}</strong>
                  <span className="pal-badge">{TASK_STATUS_LABELS[task.status] || task.status}</span>
                </div>
                <small>
                  {TASK_SOURCE_LABELS[task.source] || "Requested"}
                  {task.automatic ? " (automatic)" : task.requestedByName ? ` by ${task.requestedByName}` : ""}{task.createdAt ? ` · ${when(task.createdAt)}` : ""}
                  {task.changedFields?.length && task.source === "occupancy" ? ` · changed: ${task.changedFields.join(", ")}` : ""}
                  {task.decidedByName ? ` · decided by ${task.decidedByName}` : ""}
                  {task.decisionNote ? ` · "${task.decisionNote}"` : ""}
                </small>
                {canEdit && (task.status === "open" || task.status === "investigating") ? (
                  <div className="spm-row">
                    <button type="button" className="secondary-button" disabled={busyId === task.id} onClick={() => decideTask(task, "accepted")}>Preplan needs updating</button>
                    {task.status === "open" ? (
                      <button type="button" className="secondary-button" disabled={busyId === task.id} onClick={() => decideTask(task, "investigating")}>Investigating</button>
                    ) : null}
                    <button type="button" className="secondary-button" disabled={busyId === task.id} onClick={() => decideTask(task, "rejected")}>No change needed</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="fpe-muted">No review requests.</p>}
      </section>

      <section aria-label="Linked inspection findings">
        <h4><Link2 size={14} /> Linked inspection findings ({links.length})</h4>
        {links.length ? (
          <ul className="pal-list">
            {links.map((link) => (
              <li key={link.id}>
                <span>Inspection {link.inspectionNumber || link.inspectionId}{link.violationLabel ? ` · ${link.violationLabel}` : link.violationId ? ` · finding ${link.violationId}` : ""}</span>
                {link.objectLabel ? <small> → {link.objectLabel}</small> : null}
                {link.note ? <small> · {link.note}</small> : null}
              </li>
            ))}
          </ul>
        ) : <p className="fpe-muted">No inspection findings are linked to this preplan.</p>}
      </section>
    </div>
  );
}
