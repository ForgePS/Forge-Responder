import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, CloudOff, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionsModuleLayout from "../components/inspections/InspectionsModuleLayout.jsx";
import FieldSurveyForm from "../components/preplans/FieldSurveyForm.jsx";
import PreplanResponseView from "../components/preplans/PreplanResponseView.jsx";
import SurveyReviewPanel from "../components/preplans/SurveyReviewPanel.jsx";
import { listRecords } from "../lib/firestoreService.js";
import { canConductPreplanSurveys, canEditPreplans, canViewPreplans, getPreplan, listPreplans } from "../lib/inspections/index.js";
import {
  SURVEY_STATUS_LABELS,
  canWorkOnSurvey,
  dueState,
  sortSurveys,
  surveyIsFor,
} from "../lib/preplans/surveyModel.js";
import { assignSurvey, cancelSurvey, getSurvey, listSurveys, surveysWithDeviceCopies } from "../lib/preplans/surveyService.js";
import { addDaysKey } from "../lib/preplans/localDate.js";
import "../theme/preplan-survey.css";

const OPEN_PREPLAN_KEY = "forge-open-preplan-id";
const OPEN_SURVEY_KEY = "forge-open-survey-id";
const ASSIGN_PREPLAN_KEY = "forge-survey-assign-preplan-id";

const TABS = [
  { id: "workQueue", label: "Preplan Work Queue", navName: "Preplan Work Queue" },
  { id: "all", label: "All Preplans", navName: "All Preplans" },
  { id: "surveys", label: "Field Surveys", navName: "Field Surveys" },
];

function takeSession(key) {
  try {
    const value = window.sessionStorage.getItem(key) || "";
    if (value) window.sessionStorage.removeItem(key);
    return value;
  } catch {
    return "";
  }
}

function formatDue(value) {
  if (!value) return "No due date";
  return new Date(`${value}T12:00:00`).toLocaleDateString();
}

function AssignForm({ departmentId, preplans, users, stations, shifts, presetPreplanId, actor, onAssigned, onCancel }) {
  const [preplanId, setPreplanId] = useState(presetPreplanId || "");
  const [station, setStation] = useState("");
  const [shift, setShift] = useState("");
  const [people, setPeople] = useState([]);
  const [dueDate, setDueDate] = useState(addDaysKey(30));
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preplan = preplans.find((row) => row.id === preplanId);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const chosen = users.filter((row) => people.includes(row.id)).map((row) => ({ uid: row.id, name: row.displayName || row.email || "Member" }));
      const survey = await assignSurvey(departmentId, preplan, { station, shift, users: chosen, dueDate, instructions }, actor);
      onAssigned(survey);
    } catch (saveError) {
      setError(saveError?.message || "Couldn't assign the survey.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header><div><ClipboardList size={15} /><strong>Assign a field survey</strong></div></header>
      <div className="panel-body">
        <div className="occupancy-form-grid">
          <label className="config-field wide">
            <span>Preplan</span>
            <select value={preplanId} onChange={(event) => setPreplanId(event.target.value)}>
              <option value="">Choose a preplan…</option>
              {preplans.map((row) => <option key={row.id} value={row.id}>{row.preplanNumber} · {row.facilityName || row.occupancyName} · {row.address}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Station</span>
            <select value={station} onChange={(event) => { setStation(event.target.value); if (!event.target.value) setShift(""); }}>
              <option value="">No station (named people only)</option>
              {stations.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Shift</span>
            <select value={shift} disabled={!station} onChange={(event) => setShift(event.target.value)}>
              <option value="">Any shift</option>
              {shifts.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Due</span>
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="config-field wide">
            <span>People (optional; anyone on the station and shift can take it otherwise)</span>
            <select multiple size={Math.min(6, Math.max(3, users.length))} value={people}
              onChange={(event) => setPeople([...event.target.selectedOptions].map((option) => option.value))}>
              {users.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.displayName || row.email}{row.assignedStation ? ` · ${row.assignedStation}` : ""}{row.assignedShift ? ` · ${row.assignedShift}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="config-field wide">
            <span>Instructions</span>
            <textarea rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Anything the crew should look at in particular" />
          </label>
        </div>
        <p className="occupancy-muted">
          The surveyor checks the preplan on site and proposes corrections. You review them; accepted corrections go into a new
          draft revision, so the approved plan stays in use until that revision is published.
        </p>
        {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
        <div className="occupancy-detail-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button" disabled={busy || !preplan || (!station && !people.length)} onClick={save}>
            {busy ? "Assigning…" : "Assign survey"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Field surveys: the crew's assigned surveys and the supervisors' review queue. */
export default function FieldSurveysPage({ onNavigate }) {
  const { departmentId, profile } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const canManage = canEditPreplans(permissions, isCreator);
  const canConduct = canConductPreplanSurveys(permissions, isCreator);
  const allowed = canViewPreplans(permissions, isCreator) || canConduct;
  const me = useMemo(() => ({
    uid: user?.uid || "",
    name: membership?.displayName || user?.displayName || user?.email || "",
    station: membership?.assignedStation || "",
    shift: membership?.assignedShift || "",
    canConduct,
  }), [user?.uid, user?.displayName, user?.email, membership?.displayName, membership?.assignedStation, membership?.assignedShift, canConduct]);
  const actor = { actorUid: me.uid || "system", actorName: me.name || "User" };

  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState(canManage && !canConduct ? "review" : "mine");
  const [openId, setOpenId] = useState(() => takeSession(OPEN_SURVEY_KEY));
  const [open, setOpen] = useState(null);
  const [assigning, setAssigning] = useState(() => (canManage ? takeSession(ASSIGN_PREPLAN_KEY) || "" : ""));
  const [preplans, setPreplans] = useState([]);
  const [users, setUsers] = useState([]);
  const [responseFor, setResponseFor] = useState(null);
  const pendingOnDevice = surveysWithDeviceCopies(departmentId);

  async function reload() {
    if (!departmentId || !allowed) { setLoading(false); return; }
    try {
      setSurveys(await listSurveys(departmentId));
    } catch (loadError) {
      setError(loadError?.message || "Couldn't load field surveys.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, [departmentId, allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openId || !departmentId) { setOpen(null); return; }
    getSurvey(departmentId, openId).then(setOpen).catch(() => setOpen(null));
  }, [departmentId, openId]);

  useEffect(() => {
    if (!assigning || !canManage) return;
    Promise.all([listPreplans(departmentId, { queue: "work" }), listRecords(departmentId, "users").catch(() => [])])
      .then(([rows, members]) => {
        setPreplans(rows);
        setUsers(members.filter((row) => (row.status || "active") === "active").sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email))));
      })
      .catch((loadError) => setError(loadError?.message || "Couldn't load preplans."));
  }, [assigning, canManage, departmentId]);

  const lists = useMemo(() => {
    const sorted = sortSurveys(surveys);
    return {
      mine: sorted.filter((row) => ["assigned", "in_progress", "returned"].includes(row.status) && surveyIsFor(row, me)),
      review: sorted.filter((row) => row.status === "submitted"),
      open: sorted.filter((row) => ["assigned", "in_progress", "returned"].includes(row.status)),
      closed: sorted.filter((row) => ["accepted", "cancelled"].includes(row.status)),
    };
  }, [surveys, me]);
  const tabs = [
    canConduct ? { id: "mine", label: `My surveys (${lists.mine.length})` } : null,
    canManage ? { id: "review", label: `Waiting for review (${lists.review.length})` } : null,
    { id: "open", label: `All open (${lists.open.length})` },
    { id: "closed", label: "Closed" },
  ].filter(Boolean);
  const shown = lists[view] || [];

  async function openPreplanResponse(survey) {
    const preplan = await getPreplan(departmentId, survey.preplanId).catch(() => null);
    if (preplan) setResponseFor(preplan);
  }

  function closeSurvey() {
    setOpenId("");
    setOpen(null);
    reload();
  }

  let body;
  if (open) {
    const working = canWorkOnSurvey(open, me);
    body = (
      <section className="panel psv-panel">
        <header>
          <div>
            <button type="button" className="secondary-button" onClick={closeSurvey}><ArrowLeft size={14} /> Surveys</button>
            <strong>{open.preplanNumber} · {open.facilityName}</strong>
            <small className="occupancy-muted"> {open.address}</small>
          </div>
          <span className={`psv-status is-${open.status}`}>{SURVEY_STATUS_LABELS[open.status]}</span>
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">
            Due {formatDue(open.dueDate)}
            {open.assignedStation ? ` · ${open.assignedStation}${open.assignedShift ? ` ${open.assignedShift}` : ""}` : ""}
            {open.assignedUserNames.length ? ` · ${open.assignedUserNames.join(", ")}` : ""}
            {open.assignedByName ? ` · assigned by ${open.assignedByName}` : ""}
          </p>
          {open.status === "submitted" || open.status === "accepted" ? (
            <SurveyReviewPanel
              departmentId={departmentId}
              survey={open}
              actor={actor}
              canReview={canManage}
              onDone={() => { setMessage("Survey review saved."); closeSurvey(); }}
              onOpenPreplan={() => { try { window.sessionStorage.setItem(OPEN_PREPLAN_KEY, open.preplanId); } catch { /* ignore */ } onNavigate?.("All Preplans"); }}
            />
          ) : (
            <FieldSurveyForm
              key={open.id}
              departmentId={departmentId}
              survey={open}
              me={me}
              onChanged={(saved) => { setSurveys((rows) => rows.map((row) => (row.id === saved.id ? saved : row))); if (saved.status === "submitted") setOpen(saved); }}
              onOpenResponse={() => openPreplanResponse(open)}
            />
          )}
          {!working && ["assigned", "in_progress", "returned"].includes(open.status) && canManage ? (
            <div className="occupancy-detail-actions">
              <button type="button" className="secondary-button" onClick={async () => {
                const reason = window.prompt("Why is this survey being cancelled?");
                if (!reason) return;
                try { await cancelSurvey(departmentId, open, reason, actor); setMessage("Survey cancelled."); closeSurvey(); } catch (cancelError) { setError(cancelError?.message || "Couldn't cancel."); }
              }}>Cancel survey</button>
            </div>
          ) : null}
        </div>
      </section>
    );
  } else if (assigning) {
    body = (
      <AssignForm
        departmentId={departmentId}
        preplans={preplans}
        users={users}
        stations={Array.isArray(profile?.stations) ? profile.stations.filter(Boolean) : []}
        shifts={Array.isArray(profile?.shifts) ? profile.shifts.filter(Boolean) : []}
        presetPreplanId={assigning === "new" ? "" : assigning}
        actor={actor}
        onCancel={() => setAssigning("")}
        onAssigned={(survey) => { setAssigning(""); setMessage(`Survey of ${survey.preplanNumber} assigned.`); reload(); }}
      />
    );
  } else {
    body = (
      <section className="panel">
        <header>
          <div className="psv-tabs" role="tablist">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} className={`psv-tab${view === tab.id ? " is-active" : ""}`} onClick={() => setView(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>
        </header>
        <div className="panel-body">
          {loading ? <p className="occupancy-muted">Loading…</p> : null}
          {!loading && !shown.length ? (
            <p className="occupancy-muted">
              {view === "mine"
                ? `Nothing assigned to you${me.station ? ` or ${me.station}${me.shift ? ` ${me.shift}` : ""}` : ""}.${!me.station ? " Your station isn't set on your Forge account, so station surveys won't show here." : ""}`
                : "No surveys here."}
            </p>
          ) : null}
          <ul className="psv-list">
            {shown.map((row) => {
              const due = dueState(row);
              return (
                <li key={row.id}>
                  <button type="button" className="psv-list-item" onClick={() => setOpenId(row.id)}>
                    <span>
                      <strong>{row.preplanNumber} · {row.facilityName}</strong>
                      <small>{row.address}</small>
                      <small>
                        {row.assignedStation ? `${row.assignedStation}${row.assignedShift ? ` ${row.assignedShift}` : ""}` : ""}
                        {row.assignedUserNames.length ? `${row.assignedStation ? " · " : ""}${row.assignedUserNames.join(", ")}` : ""}
                      </small>
                    </span>
                    <span className="psv-list-meta">
                      <span className={`psv-status is-${row.status}`}>{SURVEY_STATUS_LABELS[row.status]}</span>
                      <small className={due ? `psv-due is-${due}` : ""}>{due === "overdue" ? "Overdue · " : ""}Due {formatDue(row.dueDate)}</small>
                      {pendingOnDevice.includes(row.id) ? <small className="psv-due is-due_soon"><CloudOff size={12} /> Not sent yet</small> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <InspectionPermissionGate allowed={allowed} title="Field Surveys">
      <InspectionsModuleLayout
        title="Field Surveys"
        description="Preplan surveys assigned to stations, shifts and people, checked on site and reviewed by preplan staff."
        activeNavName="Field Surveys"
        onNavigate={onNavigate}
        tabs={TABS}
        actions={canManage && !assigning && !open ? (
          <button className="primary-button" type="button" onClick={() => setAssigning("new")}><Plus size={14} /> Assign survey</button>
        ) : null}
      >
        {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
        {message ? <p className="occupancy-message" role="status">{message}</p> : null}
        {body}
      </InspectionsModuleLayout>
      {responseFor ? <PreplanResponseView departmentId={departmentId} preplan={responseFor} onClose={() => setResponseFor(null)} /> : null}
    </InspectionPermissionGate>
  );
}
