import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, ExternalLink, Link2, Siren } from "lucide-react";
import { listViolations } from "../../lib/inspections/violationService.js";
import { normalizeAlert } from "../../lib/preplans/alertModel.js";
import { linkFindingToObject, listAlertsForPreplan, listReviewTasks, openReviewTask } from "../../lib/preplans/alertService.js";
import { OBJECT_TYPES } from "../../lib/preplans/floorPlanModel.js";
import { listFloorPlansForRevision, listPreplanFloors } from "../../lib/preplans/floorPlanService.js";
import { listPreplansForOccupancy, openPreplanInModule } from "../../lib/preplans/preplanLookup.js";
import { PREPLAN_STATUS_LABELS } from "../../lib/inspections/preplanDefaults.js";
import AlertReportForm from "./AlertReportForm.jsx";
import PreplanResponseView from "./PreplanResponseView.jsx";
import "../../theme/preplan-editor.css";


function when(value) {
  if (!value) return "";
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

/**
 * Preplans for an occupancy, shown on the occupancy and inspection pages.
 * From here people open the preplan or its response view, report a current
 * condition, ask for the preplan to be reviewed, and (on an inspection) link a
 * finding to a spot on the floor plan. Nothing here edits a preplan.
 *
 * @param {{departmentId:string, occupancyId:string, inspection?:{id:string, inspectionNumber?:string}|null,
 *   canViewPreplans:boolean, canReport:boolean, canApprove?:boolean, findingsVersion?:number, actor:object,
 *   onNavigate?:(page:string)=>void}} props
 */
export default function PreplanEntryPoints({
  departmentId, occupancyId, inspection = null, canViewPreplans = false, canReport = false, canApprove = false, findingsVersion = 0, actor = {}, onNavigate,
}) {
  const [preplans, setPreplans] = useState([]);
  const [alertCounts, setAlertCounts] = useState({});
  const [openTasks, setOpenTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(""); // "" | "alert" | "review" | "link"
  const [responseFor, setResponseFor] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canViewPreplans || !departmentId || !occupancyId) { setLoading(false); return; }
    const rows = await listPreplansForOccupancy(departmentId, occupancyId);
    setPreplans(rows);
    const alerts = await listAlertsForPreplan(departmentId, { preplanId: rows[0]?.id || "", occupancyId }).catch(() => []);
    const counts = {};
    for (const alert of alerts.map(normalizeAlert)) {
      if (alert.resolutionStatus !== "active" || alert.verificationStatus === "rejected") continue;
      counts[alert.verificationStatus] = (counts[alert.verificationStatus] || 0) + 1;
    }
    setAlertCounts(counts);
    const taskLists = await Promise.all(rows.map((row) => listReviewTasks(departmentId, { preplanId: row.id }).catch(() => [])));
    setOpenTasks(Object.fromEntries(rows.map((row, i) => [row.id,
      taskLists[i].filter((task) => task.status === "open" || task.status === "investigating").length])));
    setLoading(false);
  }, [canViewPreplans, departmentId, occupancyId]);

  useEffect(() => {
    load().catch((err) => { setError(err?.message || "Couldn't load preplans."); setLoading(false); });
  }, [load]);

  if (!canViewPreplans || !occupancyId) return null;
  const primary = preplans[0] || null;
  const alertTotal = (alertCounts.verified || 0) + (alertCounts.reported || 0);
  const done = (text) => { setMode(""); setError(""); setMessage(text); load().catch(() => {}); };

  return (
    <section className="occupancy-section ppe-root" aria-label="Preplans">
      <header>
        <div><Siren size={15} /><strong>Preplans</strong></div>
      </header>
      {loading ? <p className="fpe-muted">Loading…</p> : null}
      {!loading && !preplans.length ? <p className="fpe-muted">No preplan for this occupancy yet.</p> : null}
      {preplans.map((plan) => (
        <div key={plan.id} className="ppe-plan">
          <strong>{plan.preplanNumber || plan.id} · {plan.facilityName || "Preplan"}</strong>
          <small>
            {PREPLAN_STATUS_LABELS[plan.status] || plan.status}
            {plan.publishedRevisionId ? "" : " · nothing published yet"}
            {plan.verificationDueAt ? ` · verify by ${when(plan.verificationDueAt)}` : ""}
            {openTasks[plan.id] ? ` · ${openTasks[plan.id]} open review task${openTasks[plan.id] === 1 ? "" : "s"}` : ""}
          </small>
          <button type="button" className="secondary-button" onClick={() => openPreplanInModule(plan.id, onNavigate)}>
            <ExternalLink size={13} /> Open preplan
          </button>
          <button type="button" className="secondary-button" onClick={() => setResponseFor(plan)}>
            <Siren size={13} /> Response view
          </button>
        </div>
      ))}
      {alertTotal ? (
        <p className="fpe-warn">
          <AlertTriangle size={13} aria-hidden="true" /> {alertTotal} current alert{alertTotal === 1 ? "" : "s"} for this property
          {alertCounts.reported ? ` (${alertCounts.reported === alertTotal ? (alertTotal === 1 ? "not verified yet" : "none verified yet") : `${alertCounts.reported} not verified yet`})` : ""}.
        </p>
      ) : null}

      {canReport ? (
        <div className="spm-row">
          <button type="button" className={`secondary-button${mode === "alert" ? " is-active" : ""}`} onClick={() => setMode(mode === "alert" ? "" : "alert")}>
            <AlertTriangle size={13} /> Report a condition for responders
          </button>
          {primary ? (
            <button type="button" className={`secondary-button${mode === "review" ? " is-active" : ""}`} onClick={() => setMode(mode === "review" ? "" : "review")}>
              <ClipboardList size={13} /> Ask for a preplan review
            </button>
          ) : null}
          {inspection?.id && primary ? (
            <button type="button" className={`secondary-button${mode === "link" ? " is-active" : ""}`} onClick={() => setMode(mode === "link" ? "" : "link")}>
              <Link2 size={13} /> Link a finding to the floor plan
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "alert" ? (
        <AlertReportForm
          departmentId={departmentId}
          context={{
            occupancyId,
            preplanId: primary?.id || "",
            inspectionId: inspection?.id || "",
            source: inspection?.id ? "inspection" : "manual",
          }}
          canVerify={canApprove}
          actor={actor}
          onCancel={() => setMode("")}
          onError={setError}
          onSaved={() => done("Alert saved. Responders see it in the preplan's response view.")}
        />
      ) : null}
      {mode === "review" && primary ? (
        <ReviewRequestForm departmentId={departmentId} preplan={primary} occupancyId={occupancyId} inspection={inspection} actor={actor}
          onCancel={() => setMode("")} onError={setError} onSaved={() => done("Review requested. It shows under Alerts & reviews on the preplan.")} />
      ) : null}
      {mode === "link" && primary && inspection?.id ? (
        <LinkFindingForm departmentId={departmentId} preplans={preplans} findingsVersion={findingsVersion} occupancyId={occupancyId} inspection={inspection} actor={actor}
          onCancel={() => setMode("")} onError={setError} onSaved={() => done("Finding linked to the preplan.")} />
      ) : null}

      {message ? <p className="fpe-muted" role="status">{message}</p> : null}
      {error ? <p className="fpe-warn" role="alert">{error}</p> : null}
      {responseFor ? <PreplanResponseView departmentId={departmentId} preplan={responseFor} onClose={() => setResponseFor(null)} /> : null}
    </section>
  );
}

function ReviewRequestForm({ departmentId, preplan, occupancyId, inspection, actor, onCancel, onError, onSaved }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!reason.trim()) { onError("Say what may have changed."); return; }
    setBusy(true);
    try {
      await openReviewTask(departmentId, {
        source: inspection?.id ? "inspection" : "manual",
        sourceId: inspection?.id || "",
        // Each request a person sends is its own task (a second concern from the same
        // inspection must not be folded into the first). Automatic tasks dedupe instead.
        fingerprint: `request-${Date.now().toString(36)}`,
        preplanId: preplan.id,
        occupancyId,
        reason: reason.trim(),
      }, actor);
      onSaved();
    } catch (error) {
      onError(error?.message || "Couldn't request a review.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="pal-form" onSubmit={submit}>
      <label>
        What may have changed?
        <textarea rows={3} maxLength={1000} value={reason} required placeholder="e.g. New mezzanine storage added in the warehouse; second exit door now blocked by racking."
          onChange={(event) => setReason(event.target.value)} />
      </label>
      <p className="fpe-muted">Preplan staff decide whether the preplan needs a new revision. This doesn&apos;t change the preplan itself.</p>
      <div className="spm-row">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Sending…" : "Request review"}</button>
      </div>
    </form>
  );
}

function LinkFindingForm({ departmentId, preplans, findingsVersion, occupancyId, inspection, actor, onCancel, onError, onSaved }) {
  const [preplanId, setPreplanId] = useState(preplans[0]?.id || "");
  const [violations, setViolations] = useState([]);
  const [violationId, setViolationId] = useState("");
  const [floors, setFloors] = useState([]);
  const [plans, setPlans] = useState([]);
  const [floorId, setFloorId] = useState("");
  const [objectId, setObjectId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const preplan = preplans.find((row) => row.id === preplanId);

  useEffect(() => {
    listViolations(departmentId, { inspectionId: inspection.id }).then(setViolations).catch(() => setViolations([]));
  }, [departmentId, inspection.id, findingsVersion]);

  useEffect(() => {
    let cancelled = false;
    // Link against the revision being worked on, else the published one.
    const revisionId = preplan?.currentRevisionId || preplan?.publishedRevisionId || "";
    Promise.all([listPreplanFloors(departmentId, preplanId), listFloorPlansForRevision(departmentId, revisionId)])
      .then(([floorRows, planRows]) => {
        if (cancelled) return;
        setFloors(floorRows);
        setPlans(planRows);
        setFloorId(floorRows[0]?.id || "");
        setObjectId("");
      })
      .catch(() => { if (!cancelled) { setFloors([]); setPlans([]); } });
    return () => { cancelled = true; };
  }, [departmentId, preplanId, preplan?.currentRevisionId, preplan?.publishedRevisionId]);

  const objects = useMemo(() => {
    const plan = plans.find((row) => row.floorId === floorId);
    return (plan?.objects || [])
      .filter((row) => row.verificationStatus !== "rejected" && row.type !== "dimension")
      .map((row) => ({ id: row.id, label: `${row.name || OBJECT_TYPES[row.type]?.label || row.type}${row.type === "symbol" ? ` (${row.symbolId})` : ""}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [plans, floorId]);

  const violationLabel = (row) => [row.codeCitation || row.sectionNumber, row.description || row.title].filter(Boolean).join(" · ").slice(0, 200) || row.id;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const violation = violations.find((row) => row.id === violationId);
      await linkFindingToObject(departmentId, {
        inspectionId: inspection.id,
        inspectionNumber: inspection.inspectionNumber || "",
        violationId,
        violationLabel: violation ? violationLabel(violation) : "",
        preplanId,
        occupancyId,
        buildingId: floors.find((row) => row.id === floorId)?.buildingId || "",
        floorId,
        objectId,
        objectLabel: objects.find((row) => row.id === objectId)?.label || "",
        note,
      }, actor);
      onSaved();
    } catch (error) {
      onError(error?.message || "Couldn't link the finding.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pal-form" onSubmit={submit}>
      <div className="pal-form-row">
        {preplans.length > 1 ? (
          <label>
            Preplan
            <select value={preplanId} onChange={(event) => setPreplanId(event.target.value)}>
              {preplans.map((row) => <option key={row.id} value={row.id}>{row.preplanNumber || row.id}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          Finding
          <select value={violationId} onChange={(event) => setViolationId(event.target.value)}>
            <option value="">The inspection as a whole</option>
            {violations.map((row) => <option key={row.id} value={row.id}>{violationLabel(row)}</option>)}
          </select>
        </label>
        <label>
          Floor
          <select value={floorId} onChange={(event) => { setFloorId(event.target.value); setObjectId(""); }} disabled={!floors.length}>
            {floors.length ? floors.map((row) => <option key={row.id} value={row.id}>{row.name}</option>) : <option value="">No floors drawn</option>}
          </select>
        </label>
        <label>
          Where on the floor plan
          <select value={objectId} onChange={(event) => setObjectId(event.target.value)} disabled={!objects.length}>
            <option value="">{objects.length ? "Whole floor" : "Nothing drawn on this floor"}</option>
            {objects.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </label>
      </div>
      <label>
        Note
        <input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
      </label>
      <p className="fpe-muted">A link is a reference for preplan staff. It doesn&apos;t change the floor plan or close the finding.</p>
      <div className="spm-row">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Link finding"}</button>
      </div>
    </form>
  );
}
