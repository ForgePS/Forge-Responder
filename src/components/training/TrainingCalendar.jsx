import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck, Download, UserPlus, XCircle } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { ConfirmButton, ErrorNote, Field, Modal, ModalActions, Notice, PersonPicker, Section, Table, Badge, downloadText, stationLabel, todayIso } from "./TrainingUi.jsx";
import { RecordEditor, personRow } from "./TrainingRecords.jsx";
import {
  cancelEnrollment, createSessions, enroll, notifyPersonnel, saveTrainingDoc, subscribeEnrollments, TRAINING_COLLECTIONS as C,
} from "../../lib/training/trainingService.js";
import { enrollmentStanding, instructorConflicts, missingPrerequisites, recurrenceDates, reservationProblems, sessionsToIcs } from "../../lib/training/trainingScheduling.js";
import { DISCIPLINES } from "../../lib/training/trainingReports.js";
import { friendlyError } from "../../lib/friendlyError.js";

const VIEWS = ["month", "week", "day", "list"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(`${s}T00:00:00`);
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };

function monthGrid(anchor) {
  const first = parse(`${anchor.slice(0, 7)}-01`);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return iso(d); });
}

function blankSession(t, date) {
  return {
    title: "", courseId: "", courseVersion: "", discipline: "Fire", description: "", date: date || todayIso(), startTime: "09:00", endTime: "11:00",
    location: "", stationId: "", shift: "", capacity: "", instructorIds: [], resourceIds: [], dutyStatus: "on-duty", mandatory: false,
    assignedIds: [], recurrence: "none", recurUntil: "", makeUpForSessionId: "",
  };
}

export function SessionEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const [s, setS] = useState(() => ({ ...blankSession(t, initial?.date), ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p) => setS((x) => ({ ...x, ...p }));
  const dates = s.id ? [s.date] : recurrenceDates(s.date, { pattern: s.recurrence, until: s.recurUntil, maxCount: 52 });
  const resProblems = reservationProblems({ ...s, id: s.id }, s.resourceIds, { resources: t.resources, reservations: t.reservations });
  const instConflicts = instructorConflicts(s, t.sessions);
  const course = t.courses.find((c) => c.id === s.courseId);
  const blocking = resProblems.filter((p) => p.kind === "conflict" || p.kind === "unavailable");

  async function save() {
    setError("");
    if (!s.title.trim()) { setError("Enter a session title."); return; }
    if (!s.date) { setError("Choose a date."); return; }
    if (blocking.length && !window.confirm(`${blocking.map((p) => p.message).join("\n")}\n\nSchedule anyway?`)) return;
    setBusy(true);
    try {
      const base = { ...s, capacity: s.capacity === "" ? "" : Number(s.capacity), instructorNames: s.instructorIds.map((id) => t.personnel.find((p) => String(p.id) === String(id))?.name || id) };
      let saved;
      if (s.id) {
        saved = [await saveTrainingDoc(t.departmentId, C.sessions, base, t.actor, "SES")];
      } else {
        saved = await createSessions(t.departmentId, dates.map((date) => ({ ...base, date })), t.actor);
      }
      // Reserve resources for each session.
      for (const ses of saved) {
        const removed = t.reservations.filter((r) => r.sessionId === ses.id && r.status !== "cancelled" && !s.resourceIds.includes(r.resourceId));
        for (const r of removed) await saveTrainingDoc(t.departmentId, C.reservations, { ...r, status: "cancelled" }, t.actor);
        for (const rid of s.resourceIds) {
          const existing = t.reservations.find((r) => r.sessionId === ses.id && r.resourceId === rid);
          await saveTrainingDoc(t.departmentId, C.reservations, { ...(existing || {}), resourceId: rid, sessionId: ses.id, title: ses.title, date: ses.date, startTime: ses.startTime, endTime: ses.endTime, status: "reserved" }, t.actor, "RSV");
        }
      }
      // Mandatory assignments: enroll as assigned, and notify.
      if (s.assignedIds.length) {
        for (const ses of saved) {
          for (const pid of s.assignedIds) {
            const person = t.personnel.find((p) => String(p.id) === String(pid));
            if (person) await enroll(t.departmentId, ses.id, person, t.actor, { assigned: true });
          }
        }
        await notifyPersonnel(t.departmentId, s.assignedIds, { title: "Training assigned", message: `${s.title} on ${saved.map((x) => x.date).join(", ")}${s.startTime ? ` at ${s.startTime}` : ""}`, recordId: saved[0].id });
      }
      onSaved?.(saved);
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the session."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={s.id ? "Edit session" : "Schedule training"} onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <div className="trn-grid">
          <Field label="Title" wide><input value={s.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Course">
            <select value={s.courseId} onChange={(e) => { const c = t.courses.find((x) => x.id === e.target.value); set({ courseId: e.target.value, courseVersion: c?.publishedVersion || "", title: s.title || c?.title || "", discipline: c?.discipline || s.discipline }); }}>
              <option value="">None</option>
              {t.courses.filter((c) => c.status === "published").map((c) => <option key={c.id} value={c.id}>{c.title} (v{c.publishedVersion})</option>)}
            </select>
          </Field>
          <Field label="Discipline"><select value={s.discipline} onChange={(e) => set({ discipline: e.target.value })}>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Start"><input type="time" value={s.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
          <Field label="End"><input type="time" value={s.endTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>
          {!s.id ? <Field label="Repeats"><select value={s.recurrence} onChange={(e) => set({ recurrence: e.target.value })}><option value="none">Does not repeat</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option></select></Field> : null}
          {!s.id && s.recurrence !== "none" ? <Field label="Until" hint={`${dates.length} session${dates.length === 1 ? "" : "s"}`}><input type="date" value={s.recurUntil} onChange={(e) => set({ recurUntil: e.target.value })} /></Field> : null}
          <Field label="Location"><input value={s.location} onChange={(e) => set({ location: e.target.value })} /></Field>
          <Field label="Station"><input value={s.stationId} onChange={(e) => set({ stationId: e.target.value })} /></Field>
          <Field label="Shift"><input value={s.shift} onChange={(e) => set({ shift: e.target.value })} /></Field>
          <Field label="Capacity" hint="Blank = no limit"><input type="number" min="0" value={s.capacity} onChange={(e) => set({ capacity: e.target.value })} /></Field>
          <Field label="Duty status"><select value={s.dutyStatus} onChange={(e) => set({ dutyStatus: e.target.value })}><option value="on-duty">On duty</option><option value="off-duty">Off duty</option><option value="either">Either</option></select></Field>
          <Field label="Make-up for session"><select value={s.makeUpForSessionId} onChange={(e) => set({ makeUpForSessionId: e.target.value })}><option value="">—</option>{t.sessions.filter((x) => x.id !== s.id).slice(-50).map((x) => <option key={x.id} value={x.id}>{x.date} {x.title}</option>)}</select></Field>
          <Field label="Description" wide><textarea rows={2} value={s.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Instructors" wide><PersonPicker personnel={t.personnel} value={s.instructorIds} onChange={(ids) => set({ instructorIds: ids })} label="Instructors" /></Field>
          {instConflicts.length ? <p className="trn-callout warning trn-field-wide">Instructor conflict: {instConflicts.map((x) => `${x.title} (${x.date} ${x.startTime}–${x.endTime})`).join("; ")}</p> : null}
          {t.resources.length ? (
            <Field label="Facilities, props & equipment" wide>
              <div className="trn-checks">{t.resources.map((r) => (
                <label key={r.id}><input type="checkbox" checked={s.resourceIds.includes(r.id)} onChange={(e) => set({ resourceIds: e.target.checked ? [...s.resourceIds, r.id] : s.resourceIds.filter((x) => x !== r.id) })} /> {r.name} <small className="trn-muted">{r.type}</small></label>
              ))}</div>
            </Field>
          ) : null}
          {resProblems.length ? <ul className="trn-callout warning trn-field-wide">{resProblems.map((p, i) => <li key={i}>{p.message}</li>)}</ul> : null}
          {!s.id ? <Field label="Assign as mandatory (members are notified)" wide><PersonPicker personnel={t.personnel} value={s.assignedIds} onChange={(ids) => set({ assignedIds: ids })} label="Assigned members" /></Field> : null}
          {course?.prerequisiteCourseIds?.length ? <p className="trn-muted trn-field-wide">Prerequisites are checked when members enroll.</p> : null}
        </div>
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} saveLabel={s.id ? "Save" : `Schedule${dates.length > 1 ? ` ${dates.length}` : ""}`} />
    </Modal>
  );
}

function SessionDetail({ session, onClose, onEdit, onRecord }) {
  const t = useTraining();
  const [enrollments, setEnrollments] = useState([]);
  const [error, setError] = useState("");
  const [assignIds, setAssignIds] = useState([]);
  useEffect(() => subscribeEnrollments(t.departmentId, session.id, setEnrollments, (e) => setError(friendlyError(e))), [t.departmentId, session.id]);
  const standing = enrollmentStanding(enrollments, session.capacity);
  const mine = enrollments.find((e) => String(e.personId) === String(t.myPersonId) && e.status !== "cancelled");
  const course = t.courses.find((c) => c.id === session.courseId);
  const me = t.personnel.find((p) => String(p.id) === String(t.myPersonId));
  const prereqMissing = course ? missingPrerequisites(course, t.myPersonId, { records: t.records }) : [];
  const cancelled = session.status === "cancelled";
  const past = session.date < todayIso();

  async function run(fn) { setError(""); try { await fn(); } catch (e) { setError(friendlyError(e)); } }

  return (
    <Modal title={session.title} onClose={onClose}>
      <ErrorNote error={error} onClose={() => setError("")} />
      <div className="cert-detail-grid">
        {[["Date", session.date], ["Time", `${session.startTime || ""}–${session.endTime || ""}`], ["Location", session.location || "—"], ["Discipline", session.discipline],
          ["Course", course ? `${course.title} v${session.courseVersion || course.publishedVersion}` : "—"], ["Instructors", (session.instructorNames || []).join(", ") || "—"],
          ["Duty", session.dutyStatus || "—"], ["Seats", session.capacity ? `${standing.enrolled.length} / ${session.capacity}` : `${standing.enrolled.length} enrolled`],
          ["Status", cancelled ? "Cancelled" : "Scheduled"]].map(([k, v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}
      </div>
      {session.description ? <p className="trn-pre">{session.description}</p> : null}
      <p className="trn-muted">Enrollment is not attendance. Attendance is confirmed on the training record after the class.</p>
      <Table rows={[...standing.enrolled.map((e) => ({ ...e, seat: "Enrolled" })), ...standing.waitlist.map((e, i) => ({ ...e, seat: `Waitlist #${i + 1}` }))]} rowKey={(e) => e.personId}
        empty="Nobody enrolled yet."
        columns={[{ key: "name", label: "Member" }, { key: "seat", label: "Seat" }, { key: "assigned", label: "Type", render: (e) => (e.assigned ? <Badge tone="info">Assigned</Badge> : "Self-enrolled") },
          ...(t.flags.canEdit ? [{ key: "x", label: "", render: (e) => <button type="button" className="text-button" onClick={(ev) => { ev.stopPropagation(); run(() => cancelEnrollment(t.departmentId, session.id, e.personId, t.actor)); }}>Remove</button> }] : [])]} />
      {t.flags.canEdit && !cancelled ? (
        <div className="trn-inline">
          <div className="trn-grow"><PersonPicker personnel={t.personnel} value={assignIds} onChange={setAssignIds} label="Enroll members" /></div>
          <button type="button" className="secondary-button" disabled={!assignIds.length} onClick={() => run(async () => {
            for (const id of assignIds) { const p = t.personnel.find((x) => String(x.id) === String(id)); if (p) await enroll(t.departmentId, session.id, p, t.actor, { assigned: true }); }
            await notifyPersonnel(t.departmentId, assignIds, { title: "Training assigned", message: `${session.title} on ${session.date} ${session.startTime || ""}`, recordId: session.id });
            setAssignIds([]);
          })}><UserPlus size={14} /> Assign</button>
        </div>
      ) : null}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        {!cancelled && !past && me && !mine ? (
          prereqMissing.length
            ? <span className="trn-muted">Prerequisites not met: {prereqMissing.map((id) => t.courses.find((c) => c.id === id)?.title || id).join(", ")}</span>
            : <button type="button" className="primary-button" onClick={() => run(() => enroll(t.departmentId, session.id, me, t.actor))}>{standing.full ? "Join waitlist" : "Enroll"}</button>
        ) : null}
        {mine && !mine.assigned && !past ? <button type="button" className="secondary-button" onClick={() => run(() => cancelEnrollment(t.departmentId, session.id, t.myPersonId, t.actor))}>Cancel my enrollment</button> : null}
        {t.flags.canEdit && !cancelled ? <button type="button" className="secondary-button" onClick={() => onEdit(session)}>Edit / reschedule</button> : null}
        {t.flags.canEdit && !cancelled ? <ConfirmButton className="secondary-button danger-button" confirm="Cancel this session? Enrolled members are notified." onConfirm={() => run(async () => {
          await saveTrainingDoc(t.departmentId, C.sessions, { ...session, status: "cancelled", cancelledAt: new Date().toISOString() }, t.actor);
          for (const r of t.reservations.filter((x) => x.sessionId === session.id)) await saveTrainingDoc(t.departmentId, C.reservations, { ...r, status: "cancelled" }, t.actor);
          await notifyPersonnel(t.departmentId, standing.enrolled.concat(standing.waitlist).map((e) => e.personId), { title: "Training cancelled", message: `${session.title} on ${session.date} was cancelled.`, recordId: session.id });
          onClose();
        })}><XCircle size={14} /> Cancel session</ConfirmButton> : null}
        {t.flags.canEdit && !cancelled ? <button type="button" className="primary-button" onClick={() => onRecord(session, standing.enrolled)}><ClipboardCheck size={14} /> Record attendance</button> : null}
      </div>
    </Modal>
  );
}

export default function TrainingCalendar({ focus }) {
  const t = useTraining();
  const [view, setView] = useState("month");
  const [anchor, setAnchor] = useState(todayIso());
  const [mineOnly, setMineOnly] = useState(Boolean(focus?.mine));
  const [station, setStation] = useState("");
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [recording, setRecording] = useState(null);
  const [notice, setNotice] = useState("");
  const [dragId, setDragId] = useState(null);

  const sessions = useMemo(() => t.sessions.filter((s) => {
    if (mineOnly && !(t.myEnrollments[s.id] && t.myEnrollments[s.id].status !== "cancelled") && !(s.instructorIds || []).includes(t.myPersonId)) return false;
    if (station && String(s.stationId) !== station) return false;
    return true;
  }), [t.sessions, t.myEnrollments, t.myPersonId, mineOnly, station]);
  const byDate = useMemo(() => {
    const m = new Map();
    for (const s of sessions) { if (!m.has(s.date)) m.set(s.date, []); m.get(s.date).push(s); }
    for (const list of m.values()) list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    return m;
  }, [sessions]);
  const stations = [...new Set(t.sessions.map((s) => s.stationId).filter(Boolean))].sort();

  const move = (dir) => {
    if (view === "month") { const d = parse(anchor); d.setMonth(d.getMonth() + dir, 1); setAnchor(iso(d)); }
    else setAnchor(addDays(anchor, dir * (view === "week" ? 7 : view === "day" ? 1 : 30)));
  };
  const weekStart = addDays(anchor, -parse(anchor).getDay());
  const days = view === "month" ? monthGrid(anchor) : view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [anchor];
  const title = view === "month" ? parse(anchor).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : view === "week" ? `Week of ${parse(weekStart).toLocaleDateString()}` : view === "day" ? parse(anchor).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Upcoming";

  async function reschedule(sessionId, date) {
    const s = t.sessions.find((x) => x.id === sessionId);
    if (!s || s.date === date || !t.flags.canEdit || s.status === "cancelled") return;
    const problems = reservationProblems({ ...s, date }, s.resourceIds || [], { resources: t.resources, reservations: t.reservations });
    if (problems.length && !window.confirm(`${problems.map((p) => p.message).join("\n")}\n\nMove anyway?`)) return;
    try {
      await saveTrainingDoc(t.departmentId, C.sessions, { ...s, date, rescheduledFrom: s.date }, t.actor);
      for (const r of t.reservations.filter((x) => x.sessionId === s.id && x.status !== "cancelled")) await saveTrainingDoc(t.departmentId, C.reservations, { ...r, date }, t.actor);
      setNotice(`${s.title} moved to ${date}.`);
    } catch (e) { setNotice(friendlyError(e)); }
  }

  const open = openId ? t.sessions.find((s) => s.id === openId) : null;
  const chip = (s) => (
    <button key={s.id} type="button" draggable={t.flags.canEdit && s.status !== "cancelled"} onDragStart={() => setDragId(s.id)} onClick={() => setOpenId(s.id)}
      className={`trn-chip${s.status === "cancelled" ? " cancelled" : ""}${t.myEnrollments[s.id] && t.myEnrollments[s.id].status !== "cancelled" ? " mine" : ""}`} title={`${s.startTime || ""} ${s.title}`}>
      <span>{s.startTime}</span> {s.title}
    </button>
  );

  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <div className="trn-toolbar">
        <div className="trn-actions">
          <button type="button" className="icon-button" aria-label="Previous" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
          <button type="button" className="secondary-button" onClick={() => setAnchor(todayIso())}>Today</button>
          <button type="button" className="icon-button" aria-label="Next" onClick={() => move(1)}><ChevronRight size={16} /></button>
          <strong className="trn-cal-title">{title}</strong>
        </div>
        <div className="trn-actions">
          <div className="segmented-control">{VIEWS.map((v) => <button key={v} type="button" className={view === v ? "active" : ""} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
          <label className="trn-inline-label"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My classes</label>
          {stations.length ? <select value={station} onChange={(e) => setStation(e.target.value)} aria-label="Station"><option value="">All stations</option>{stations.map((x) => <option key={x} value={x}>{stationLabel(x)}</option>)}</select> : null}
          <button type="button" className="secondary-button" onClick={() => downloadText(`training-calendar-${todayIso()}.ics`, sessionsToIcs(sessions.filter((s) => s.date >= todayIso()), { departmentName: t.departmentName, timezone: t.timezone }), "text/calendar")}><Download size={14} /> .ics</button>
          {t.flags.canEdit ? <button type="button" className="primary-button" onClick={() => setEditing({ date: anchor })}><CalendarPlus size={14} /> Schedule</button> : null}
        </div>
      </div>
      {view === "list" ? (
        <Section title="Upcoming sessions">
          <Table rows={sessions.filter((s) => s.date >= todayIso()).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))} onRowClick={(s) => setOpenId(s.id)} empty="Nothing scheduled."
            columns={[{ key: "date", label: "Date" }, { key: "time", label: "Time", render: (s) => `${s.startTime || ""}–${s.endTime || ""}` }, { key: "title", label: "Session" }, { key: "location", label: "Location" },
              { key: "dutyStatus", label: "Duty" }, { key: "status", label: "Status", render: (s) => (s.status === "cancelled" ? <Badge tone="critical">Cancelled</Badge> : <Badge tone="info">Scheduled</Badge>) }]} />
        </Section>
      ) : (
        <div className={`trn-cal trn-cal-${view}`} role="grid" aria-label={title}>
          {view !== "day" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="trn-cal-dow" role="columnheader">{d}</div>) : null}
          {days.map((d) => (
            <div key={d} role="gridcell" className={`trn-cal-day${d === todayIso() ? " today" : ""}${view === "month" && d.slice(0, 7) !== anchor.slice(0, 7) ? " other" : ""}`}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }} onDrop={() => { if (dragId) reschedule(dragId, d); setDragId(null); }}
              onDoubleClick={() => t.flags.canEdit && setEditing({ date: d })}>
              <button type="button" className="trn-cal-num" onClick={() => { setAnchor(d); setView("day"); }}>{Number(d.slice(8))}</button>
              {(byDate.get(d) || []).map(chip)}
            </div>
          ))}
        </div>
      )}
      {editing ? <SessionEditor initial={editing.id ? editing : { date: editing.date }} onClose={() => setEditing(null)} onSaved={(saved) => { setEditing(null); setNotice(`Scheduled ${saved.length} session${saved.length === 1 ? "" : "s"}.`); }} /> : null}
      {open && !editing && !recording ? <SessionDetail session={open} onClose={() => setOpenId(null)} onEdit={(s) => { setOpenId(null); setEditing(s); }} onRecord={(s, enrolled) => { setOpenId(null); setRecording({ s, enrolled }); }} /> : null}
      {recording ? (
        <RecordEditor title="Record attendance"
          initial={{
            title: recording.s.title, discipline: recording.s.discipline, courseId: recording.s.courseId || "", courseVersion: recording.s.courseVersion || "", sessionId: recording.s.id,
            date: recording.s.date <= todayIso() ? recording.s.date : todayIso(), startTime: recording.s.startTime, endTime: recording.s.endTime, location: recording.s.location, stationId: recording.s.stationId, shift: recording.s.shift,
            instructors: (recording.s.instructorIds || []).map((id, i) => ({ personId: id, name: (recording.s.instructorNames || [])[i] || id })),
            // Enrolled members are listed with attendance unmarked: enrollment is not attendance.
            participants: recording.enrolled.map((e) => { const p = t.personnel.find((x) => String(x.id) === String(e.personId)); return p ? personRow(p, "") : { personId: e.personId, name: e.name, attendance: "" }; }),
          }}
          onClose={() => setRecording(null)} onSaved={(r, submitted) => { setRecording(null); setNotice(`Attendance for ${r.title} ${submitted ? "submitted" : "saved as a draft"}.`); }} />
      ) : null}
    </div>
  );
}
