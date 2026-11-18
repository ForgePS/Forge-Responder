import { useEffect, useMemo, useState } from "react";
import { CirclePlus, FileUp, History, Lock, RotateCcw, Send, ShieldCheck, Trash2, Undo2, UserPlus, Users } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import {
  ConfirmButton, EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, PersonPicker, Section, StatusBadge, Table, downloadText, fmtHours, todayIso,
} from "./TrainingUi.jsx";
import { ATTENDANCE_STATUSES, creditedHoursFor, durationFromTimes, recordTotals } from "../../lib/training/trainingHours.js";
import { canAmend, canTransition, isEditable, isLiveFire, LIVE_FIRE_CHECKS, LIVE_FIRE_ROLES, liveFireProblems, statusLabel, submissionProblems } from "../../lib/training/trainingWorkflow.js";
import { DISCIPLINES, toCsv } from "../../lib/training/trainingReports.js";
import { RECORD_TYPES } from "../../lib/training/trainingCatalog.js";
import {
  amendRecord, clean, deleteDraftRecord, listAmendments, saveRecordDraft, saveTrainingDoc, transitionRecord, TRAINING_COLLECTIONS,
} from "../../lib/training/trainingService.js";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { safeFileName } from "../../lib/storagePaths.js";
import { friendlyError } from "../../lib/friendlyError.js";
import { uniqueRecordId } from "../../lib/recordIds.js";

const RECENT_KEY = "forge-training-recent-topics";

function readRecent() {
  try { return JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function pushRecent(entry) {
  try {
    const next = [entry, ...readRecent().filter((r) => r.title !== entry.title)].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage unavailable: recent list is a convenience only */ }
}

/** A fresh quick-entry record pre-filled from the officer's own assignment. */
function blankRecord(t, extra = {}) {
  return {
    title: "", description: "", discipline: "Fire", type: "Company drill", courseId: "", courseVersion: "",
    date: todayIso(), startTime: "", endTime: "", breakMinutes: 0, durationHours: "",
    timezone: t.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    location: "", stationId: t.me?.station || "", shift: t.me?.shift || "", unit: t.me?.unit || "",
    participants: [], instructors: t.actor.personId ? [{ personId: t.actor.personId, name: t.actor.name }] : [],
    objectives: "", skillsPerformed: "", standardsRef: "", notes: "", evidence: [],
    ...extra,
  };
}

export function personRow(p, attendance = "present") {
  return { personId: String(p.id), name: p.name || "", rank: p.rank || "", attendance, creditedHours: "" };
}

/** Live-fire documentation: roles and the department's safety checklist. Submission is blocked until complete. */
function LiveFirePanel({ value = {}, onChange, personnel }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const problems = liveFireProblems({ type: "Live fire", liveFire: value });
  return (
    <div className="trn-livefire">
      <h4>Live-fire documentation</h4>
      <p className="trn-muted">Department checklist; map each item to the live-fire standard your department has adopted. This record can't be submitted until every item is confirmed.</p>
      <div className="trn-grid">
        {LIVE_FIRE_ROLES.map(([key, label]) => (
          <Field key={key} label={label}><input list="trn-lf-people" value={value[key] || ""} onChange={(e) => set({ [key]: e.target.value })} /></Field>
        ))}
        <Field label="Burn site / prop"><input value={value.site || ""} onChange={(e) => set({ site: e.target.value })} /></Field>
        <Field label="Fuel type and load"><input value={value.fuel || ""} onChange={(e) => set({ fuel: e.target.value })} /></Field>
        <Field label="Weather"><input value={value.weather || ""} onChange={(e) => set({ weather: e.target.value })} /></Field>
        <Field label="Number of evolutions"><input type="number" min="0" value={value.evolutions || ""} onChange={(e) => set({ evolutions: e.target.value })} /></Field>
      </div>
      <datalist id="trn-lf-people">{personnel.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <div className="trn-checks">{LIVE_FIRE_CHECKS.map(([key, label]) => (
        <label key={key} className="trn-inline-label"><input type="checkbox" checked={Boolean(value.checks?.[key])} onChange={(e) => set({ checks: { ...(value.checks || {}), [key]: e.target.checked } })} /> {label}</label>
      ))}</div>
      <Field label="Injuries, near misses or exposures" wide><textarea rows={2} value={value.incidents || ""} onChange={(e) => set({ incidents: e.target.value })} placeholder="None, or describe and reference the incident report" /></Field>
      {problems.length ? <p className="trn-callout warning" role="status">{problems.join(" ")}</p> : <p className="trn-callout success">Live-fire documentation complete.</p>}
    </div>
  );
}

/** The record editor used by quick entry and full edits. */
export function RecordEditor({ initial, onClose, onSaved, onDutyIds = [], title = "Log training" }) {
  const t = useTraining();
  const [form, setForm] = useState(() => ({ ...blankRecord(t), ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(Boolean(initial?.id));
  const [ext, setExt] = useState({ name: "", agency: "" });
  const recent = useMemo(readRecent, []);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const totals = recordTotals(form);
  const fromTimes = durationFromTimes(form.startTime, form.endTime, form.breakMinutes);
  const publishedCourses = t.courses.filter((c) => c.status === "published");

  const selectedIds = form.participants.filter((p) => !String(p.personId).startsWith("EXT-")).map((p) => p.personId);
  function setParticipantIds(ids) {
    const keep = form.participants.filter((p) => ids.includes(p.personId) || String(p.personId).startsWith("EXT-"));
    const add = ids.filter((id) => !keep.some((p) => p.personId === id)).map((id) => {
      const person = t.personnel.find((p) => String(p.id) === String(id));
      return person ? personRow(person, "present") : null;
    }).filter(Boolean);
    set({ participants: [...keep, ...add] });
  }
  /** Adding the on-duty crew lists them with attendance unmarked: the officer confirms who was there. */
  function addOnDuty() {
    const add = onDutyIds.filter((id) => !form.participants.some((p) => p.personId === String(id))).map((id) => {
      const person = t.personnel.find((p) => String(p.id) === String(id));
      return person ? personRow(person, "") : null;
    }).filter(Boolean);
    set({ participants: [...form.participants, ...add] });
  }
  function updateParticipant(personId, patch) {
    set({ participants: form.participants.map((p) => (p.personId === personId ? { ...p, ...patch } : p)) });
  }
  function addExternal() {
    if (!ext.name.trim()) return;
    set({ participants: [...form.participants, { personId: uniqueRecordId("EXT"), name: ext.name.trim(), agency: ext.agency.trim(), external: true, attendance: "present", creditedHours: "" }] });
    setExt({ name: "", agency: "" });
  }
  function pickTopic(value) {
    const course = t.courses.find((c) => c.id === value);
    if (course) { set({ courseId: course.id, courseVersion: course.publishedVersion || "", title: course.title, discipline: course.discipline || form.discipline, durationHours: form.durationHours || course.estimatedHours || "" }); return; }
    const tpl = t.templates.find((x) => `tpl:${x.id}` === value);
    if (tpl) { set({ ...tpl.fields, courseId: tpl.fields?.courseId || "", title: tpl.fields?.title || tpl.name }); return; }
    const r = recent.find((x) => `recent:${x.title}` === value);
    if (r) set({ title: r.title, discipline: r.discipline || form.discipline, courseId: r.courseId || "", courseVersion: r.courseVersion || "", durationHours: r.durationHours || form.durationHours });
  }

  async function save(submit) {
    setError("");
    const record = { ...form, durationHours: form.durationHours === "" && fromTimes !== null ? fromTimes : form.durationHours };
    if (submit) {
      const problems = submissionProblems({ ...record, ...recordTotals(record) }, { requireEvidence: Boolean(t.settings.requireEvidence) });
      if (problems.length) { setError(problems.join(" ")); return; }
    } else if (!String(record.title).trim()) { setError("Enter the training topic."); return; }
    setBusy(true);
    try {
      const saved = await saveRecordDraft(t.departmentId, record, t.actor);
      pushRecent({ title: saved.title, discipline: saved.discipline, courseId: saved.courseId, courseVersion: saved.courseVersion, durationHours: saved.durationHours });
      const final = submit ? await transitionRecord(t.departmentId, saved.id, "submit", t.actor, { requireEvidence: Boolean(t.settings.requireEvidence) }) : saved;
      onSaved?.(final, submit);
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the training record."));
    } finally {
      setBusy(false);
    }
  }

  async function saveAsTemplate() {
    const name = window.prompt("Template name", form.title);
    if (!name) return;
    const fields = clean({ title: form.title, discipline: form.discipline, type: form.type, courseId: form.courseId, courseVersion: form.courseVersion, durationHours: form.durationHours, location: form.location, objectives: form.objectives, skillsPerformed: form.skillsPerformed, standardsRef: form.standardsRef });
    try { await saveTrainingDoc(t.departmentId, TRAINING_COLLECTIONS.templates, { name, fields }, t.actor, "TPL"); } catch (e) { setError(friendlyError(e, "Couldn't save the template.")); }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <div className="trn-grid">
          <Field label="Topic or course" wide>
            <div className="trn-inline">
              <input value={form.title} onChange={(e) => set({ title: e.target.value, courseId: form.courseId && e.target.value !== form.title ? "" : form.courseId })} placeholder="e.g. Ground ladder throws" autoFocus aria-label="Training topic" />
              <select value="" onChange={(e) => pickTopic(e.target.value)} aria-label="Pick a course, template or recent topic">
                <option value="">Pick…</option>
                {publishedCourses.length ? <optgroup label="Courses">{publishedCourses.map((c) => <option key={c.id} value={c.id}>{c.title} (v{c.publishedVersion})</option>)}</optgroup> : null}
                {t.templates.length ? <optgroup label="Templates">{t.templates.map((x) => <option key={x.id} value={`tpl:${x.id}`}>{x.name}</option>)}</optgroup> : null}
                {recent.length ? <optgroup label="Recently used">{recent.map((x) => <option key={x.title} value={`recent:${x.title}`}>{x.title}</option>)}</optgroup> : null}
              </select>
            </div>
            {form.courseId ? <small className="trn-muted">Linked to course version {form.courseVersion || "draft"}.</small> : null}
          </Field>
          <Field label="Discipline"><select value={form.discipline} onChange={(e) => set({ discipline: e.target.value })}>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Record type"><select value={form.type} onChange={(e) => set({ type: e.target.value })}>{RECORD_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={form.date} max={todayIso()} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Duration (hours)" hint={fromTimes !== null ? `From times: ${fmtHours(fromTimes)} h` : "Actual training time, excluding breaks"}>
            <input type="number" min="0" step="0.25" value={form.durationHours} onChange={(e) => set({ durationHours: e.target.value })} placeholder={fromTimes !== null ? String(fromTimes) : "2"} />
          </Field>
        </div>

        <div className="trn-subhead">
          <h4><Users size={15} /> Participants</h4>
          <div className="trn-actions">
            {onDutyIds.length ? <button type="button" className="secondary-button" onClick={addOnDuty} title="Adds today's on-duty roster with attendance unmarked">Add on-duty crew ({onDutyIds.length})</button> : null}
            {form.participants.some((p) => !p.attendance) ? <button type="button" className="secondary-button" onClick={() => set({ participants: form.participants.map((p) => (p.attendance ? p : { ...p, attendance: "present" })) })}>Mark unmarked present</button> : null}
          </div>
        </div>
        <PersonPicker personnel={t.personnel} value={selectedIds} onChange={setParticipantIds} label="Participants" />
        {form.participants.length ? (
          <div className="trn-roster">
            {form.participants.map((p) => (
              <div key={p.personId} className="trn-roster-row">
                <span>{p.name}{p.external ? <small className="trn-muted"> · {p.agency || "outside agency"}</small> : null}</span>
                <select value={p.attendance} onChange={(e) => updateParticipant(p.personId, { attendance: e.target.value })} aria-label={`Attendance for ${p.name}`} className={!p.attendance ? "trn-needs" : ""}>
                  <option value="">Mark…</option>
                  {ATTENDANCE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {p.attendance === "partial" ? <input type="number" min="0" step="0.25" value={p.creditedHours} onChange={(e) => updateParticipant(p.personId, { creditedHours: e.target.value })} aria-label={`Hours for ${p.name}`} placeholder="hrs" /> : <span className="trn-muted">{fmtHours(creditedHoursFor(p, form))} h</span>}
                <button type="button" className="icon-button" aria-label={`Remove ${p.name}`} onClick={() => set({ participants: form.participants.filter((x) => x.personId !== p.personId) })}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="trn-inline">
          <input value={ext.name} onChange={(e) => setExt({ ...ext, name: e.target.value })} placeholder="Off-roster / mutual-aid participant name" aria-label="Outside participant name" />
          <input value={ext.agency} onChange={(e) => setExt({ ...ext, agency: e.target.value })} placeholder="Agency" aria-label="Outside participant agency" />
          <button type="button" className="secondary-button" onClick={addExternal} disabled={!ext.name.trim()}><UserPlus size={14} /> Add</button>
        </div>

        <div className="trn-totals" aria-live="polite">
          <span><strong>{fmtHours(totals.instructionalHours)}</strong> instructional h</span>
          <span><strong>{totals.presentCount}</strong> attended</span>
          <span><strong>{fmtHours(totals.personHours)}</strong> person-hours</span>
          <span><strong>{fmtHours(totals.instructorHours)}</strong> instructor h</span>
        </div>

        {isLiveFire(form) ? <LiveFirePanel value={form.liveFire} onChange={(liveFire) => set({ liveFire })} personnel={t.personnel} /> : null}

        <Field label="Notes" wide><textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="What was covered, evolutions run, anything to follow up" /></Field>

        <button type="button" className="text-button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>{showMore ? "Hide details" : "More details (times, location, instructors, standards)"}</button>
        {showMore ? (
          <div className="trn-grid">
            <Field label="Start time"><input type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
            <Field label="End time"><input type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>
            <Field label="Break (minutes)"><input type="number" min="0" value={form.breakMinutes} onChange={(e) => set({ breakMinutes: e.target.value })} /></Field>
            <Field label="Location"><input value={form.location} onChange={(e) => set({ location: e.target.value })} /></Field>
            <Field label="Station"><input value={form.stationId} onChange={(e) => set({ stationId: e.target.value })} /></Field>
            <Field label="Shift"><input value={form.shift} onChange={(e) => set({ shift: e.target.value })} /></Field>
            <Field label="Unit / apparatus"><input value={form.unit} onChange={(e) => set({ unit: e.target.value })} /></Field>
            <Field label="Instructors" wide>
              <PersonPicker personnel={t.personnel} value={form.instructors.map((i) => i.personId)} onChange={(ids) => set({ instructors: ids.map((id) => ({ personId: id, name: t.personnel.find((p) => String(p.id) === String(id))?.name || id })) })} label="Instructors" />
            </Field>
            <Field label="Learning objectives" wide><textarea rows={2} value={form.objectives} onChange={(e) => set({ objectives: e.target.value })} /></Field>
            <Field label="Skills performed" wide><textarea rows={2} value={form.skillsPerformed} onChange={(e) => set({ skillsPerformed: e.target.value })} /></Field>
            <Field label="Standards / SOG references" wide hint="Your department's mapping, e.g. an adopted NFPA edition section or SOG number."><input value={form.standardsRef} onChange={(e) => set({ standardsRef: e.target.value })} /></Field>
            <Field label="Description" wide><textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          </div>
        ) : null}
      </div>
      <ModalActions onCancel={onClose} busy={busy}
        extra={<>
          <button type="button" className="text-button" onClick={saveAsTemplate} disabled={!form.title}>Save as template</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => save(false)}>Save draft</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => save(true)}><Send size={14} /> {busy ? "Saving…" : "Submit for approval"}</button>
        </>} />
    </Modal>
  );
}

/** Record detail: workflow, evidence, amendments, history. */
export function RecordDetail({ record, onClose, onEdit }) {
  const t = useTraining();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [amendments, setAmendments] = useState(null);
  const [amending, setAmending] = useState(false);
  const [amendDraft, setAmendDraft] = useState(null);
  const actor = t.actor;

  useEffect(() => {
    let live = true;
    if (record.amendmentCount) listAmendments(t.departmentId, record.id).then((a) => live && setAmendments(a)).catch(() => live && setAmendments([]));
    return () => { live = false; };
  }, [t.departmentId, record.id, record.amendmentCount]);

  async function act(action) {
    setError("");
    setBusy(action);
    try {
      await transitionRecord(t.departmentId, record.id, action, actor, { reason, requireEvidence: Boolean(t.settings.requireEvidence) });
      setReason("");
    } catch (e) { setError(friendlyError(e, "Couldn't update the record.")); } finally { setBusy(""); }
  }

  async function upload(file) {
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      const path = `departments/${t.departmentId}/training/${record.id}/${Date.now()}-${safeFileName(file.name)}`;
      const uploaded = await uploadFirebaseFile(path, file);
      const evidence = [...(record.evidence || []), { name: file.name, storagePath: uploaded.storagePath, url: uploaded.downloadUrl, contentType: uploaded.contentType, uploadedBy: actor.uid, uploadedAt: new Date().toISOString() }];
      if (isEditable(record)) await saveRecordDraft(t.departmentId, { ...record, evidence }, actor);
      else await amendRecord(t.departmentId, record.id, { evidence }, `Added evidence: ${file.name}`, actor);
    } catch (e) { setError(friendlyError(e, "Couldn't upload the file.")); } finally { setBusy(""); }
  }

  async function saveAmendment() {
    setBusy("amend");
    setError("");
    try {
      await amendRecord(t.departmentId, record.id, amendDraft.changes, amendDraft.reason, actor);
      setAmending(false);
    } catch (e) { setError(friendlyError(e, "Couldn't save the amendment.")); } finally { setBusy(""); }
  }

  const can = (a) => canTransition(record, a, actor).ok;
  const amendCheck = canAmend(record, actor);
  const evidenceAllowed = isEditable(record) ? t.flags.canEdit : amendCheck.ok;

  return (
    <Modal title={record.title || "Training record"} onClose={onClose}>
      <ErrorNote error={error} onClose={() => setError("")} />
      <div className="trn-detail-head">
        <StatusBadge status={record.status} />
        <span className="trn-muted">{record.id}</span>
        {record.courseId ? <span className="trn-muted">Course version {record.courseVersion || "—"}</span> : null}
      </div>
      {record.status === "returned" && record.returnReason ? <p className="trn-callout warning"><strong>Returned:</strong> {record.returnReason}</p> : null}
      <div className="cert-detail-grid">
        {[["Date", record.date], ["Discipline", record.discipline], ["Type", record.type], ["Time", [record.startTime, record.endTime].filter(Boolean).join("–") || "—"],
          ["Instructional hours", fmtHours(record.instructionalHours)], ["Attended", record.presentCount], ["Person-hours", fmtHours(record.personHours)], ["Instructor hours", fmtHours(record.instructorHours)],
          ["Location", record.location || "—"], ["Station / shift", [record.stationId, record.shift].filter(Boolean).join(" / ") || "—"], ["Unit", record.unit || "—"],
          ["Instructors", (record.instructors || []).map((i) => i.name).join(", ") || "—"], ["Entered by", record.createdByName || "—"],
          ["Approved by", record.approvedByName ? `${record.approvedByName} · ${String(record.approvedAt).slice(0, 10)}` : "—"]]
          .map(([k, v]) => <div key={k}><span>{k}</span><strong>{v ?? "—"}</strong></div>)}
      </div>
      {record.notes ? <p className="trn-pre">{record.notes}</p> : null}
      <Table
        columns={[
          { key: "name", label: "Participant", render: (p) => <>{p.name}{p.external ? <small className="trn-muted"> · {p.agency || "outside"}</small> : null}</> },
          { key: "attendance", label: "Attendance", render: (p) => ATTENDANCE_STATUSES.find((s) => s.value === p.attendance)?.label || "Not marked" },
          { key: "hours", label: "Credited h", render: (p) => fmtHours(creditedHoursFor(p, record)) },
        ]}
        rows={record.participants || []} rowKey={(p) => p.personId} empty="No participants." />

      <div className="trn-subhead"><h4><FileUp size={15} /> Supporting documentation</h4>
        {evidenceAllowed ? <label className="secondary-button trn-file"><input type="file" onChange={(e) => upload(e.target.files?.[0])} disabled={Boolean(busy)} />{busy === "upload" ? "Uploading…" : "Attach file"}</label> : null}
      </div>
      {(record.evidence || []).length ? <ul className="trn-list">{record.evidence.map((ev) => <li key={ev.storagePath}><a href={ev.url} target="_blank" rel="noreferrer">{ev.name}</a> <small className="trn-muted">{String(ev.uploadedAt).slice(0, 10)}</small></li>)}</ul> : <p className="trn-muted">No files attached.</p>}

      {(can("return") || can("reopen")) ? <Field label="Reason (required to return or reopen)" wide><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to be corrected" /></Field> : null}

      {amending ? <AmendForm record={record} onChange={setAmendDraft} /> : null}

      <details className="trn-history">
        <summary><History size={14} /> History ({(record.history || []).length}){record.amendmentCount ? ` · ${record.amendmentCount} amendment${record.amendmentCount === 1 ? "" : "s"}` : ""}</summary>
        <ol>{(record.history || []).map((h, i) => <li key={i}><strong>{h.action}</strong> by {h.byName || h.by} · {String(h.at).replace("T", " ").slice(0, 16)}{h.reason ? ` — ${h.reason}` : ""}</li>)}</ol>
        {amendments?.length ? <><h5>Amendments (original values kept)</h5><ol>{amendments.map((a) => <li key={a.id}><strong>{a.byName}</strong> · {String(a.at).slice(0, 16).replace("T", " ")} — {a.reason}<ul>{a.changes.map((c) => <li key={c.field}>{c.label}: <code>{JSON.stringify(c.from)}</code> → <code>{JSON.stringify(c.to)}</code></li>)}</ul></li>)}</ol></> : null}
      </details>

      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        {isEditable(record) && t.flags.canEdit && record.status === "draft" && (record.createdBy === actor.uid || t.flags.canApprove)
          ? <ConfirmButton className="secondary-button danger-button" confirm="Delete this draft? It hasn't been submitted, and this can't be undone." onConfirm={async () => { try { await deleteDraftRecord(t.departmentId, record.id, actor); onClose(); } catch (e) { setError(friendlyError(e)); } }}><Trash2 size={14} /> Delete draft</ConfirmButton> : null}
        {isEditable(record) && t.flags.canEdit ? <button type="button" className="secondary-button" onClick={() => onEdit(record)}>Edit</button> : null}
        {can("submit") ? <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => act("submit")}><Send size={14} /> Submit</button> : null}
        {can("return") ? <button type="button" className="secondary-button" disabled={Boolean(busy) || !reason.trim()} onClick={() => act("return")}><Undo2 size={14} /> Return for correction</button> : null}
        {can("approve") ? <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => act("approve")}><ShieldCheck size={14} /> Approve</button> : null}
        {record.status === "submitted" && t.flags.canApprove && !can("approve") ? <span className="trn-muted">Another approver must approve your own submission.</span> : null}
        {can("reopen") ? <button type="button" className="secondary-button" disabled={Boolean(busy) || !reason.trim()} onClick={() => act("reopen")}><RotateCcw size={14} /> Reopen</button> : null}
        {amendCheck.ok && !amending ? <button type="button" className="secondary-button" onClick={() => setAmending(true)}>Amend</button> : null}
        {amending ? <button type="button" className="primary-button" disabled={busy === "amend" || !amendDraft?.ready} onClick={saveAmendment}>Save amendment</button> : null}
        {can("lock") ? <ConfirmButton confirm="Lock this record? Locked records can't be amended or reopened." onConfirm={() => act("lock")}><Lock size={14} /> Lock</ConfirmButton> : null}
      </div>
    </Modal>
  );
}

/** Amendment form: edit a few fields and give a reason. Original values are kept by the service. */
function AmendForm({ record, onChange }) {
  const [v, setV] = useState({ title: record.title, date: record.date, durationHours: record.durationHours ?? record.instructionalHours, notes: record.notes || "", participants: record.participants || [], reason: "" });
  useEffect(() => {
    const changes = {};
    for (const k of ["title", "date", "notes"]) if (v[k] !== (record[k] ?? "")) changes[k] = v[k];
    if (Number(v.durationHours) !== Number(record.durationHours ?? record.instructionalHours)) changes.durationHours = Number(v.durationHours);
    if (JSON.stringify(v.participants) !== JSON.stringify(record.participants || [])) changes.participants = v.participants;
    onChange({ changes, reason: v.reason, ready: Boolean(v.reason.trim()) && Object.keys(changes).length > 0 });
  }, [v, record, onChange]);
  return (
    <div className="trn-amend">
      <h4>Amend approved record</h4>
      <div className="trn-grid">
        <Field label="Topic"><input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label="Duration (hours)"><input type="number" min="0" step="0.25" value={v.durationHours} onChange={(e) => setV({ ...v, durationHours: e.target.value })} /></Field>
        <Field label="Notes" wide><textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      </div>
      <div className="trn-roster">
        {v.participants.map((p) => (
          <div key={p.personId} className="trn-roster-row">
            <span>{p.name}</span>
            <select value={p.attendance} onChange={(e) => setV({ ...v, participants: v.participants.map((x) => (x.personId === p.personId ? { ...x, attendance: e.target.value } : x)) })} aria-label={`Attendance for ${p.name}`}>
              {ATTENDANCE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {p.attendance === "partial" ? <input type="number" min="0" step="0.25" value={p.creditedHours} aria-label={`Hours for ${p.name}`} onChange={(e) => setV({ ...v, participants: v.participants.map((x) => (x.personId === p.personId ? { ...x, creditedHours: e.target.value } : x)) })} /> : <span />}
          </div>
        ))}
      </div>
      <Field label="Reason for amendment (required)" wide><input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>
    </div>
  );
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "mine", label: "My entries" },
  { id: "draft", label: "Drafts" },
  { id: "submitted", label: "Awaiting approval" },
  { id: "returned", label: "Returned" },
  { id: "approved", label: "Approved" },
  { id: "locked", label: "Locked" },
  { id: "noEvidence", label: "Missing documentation" },
];

export default function TrainingRecords({ initialFilter = "all", focus = null, onDutyIds = [] }) {
  const t = useTraining();
  const [filter, setFilter] = useState(initialFilter);
  const [q, setQ] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [range, setRange] = useState({ from: focus?.from || "", to: focus?.to || "" });
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { setFilter(initialFilter); }, [initialFilter]);
  useEffect(() => { if (focus) { setRange({ from: focus.from || "", to: focus.to || "" }); setDiscipline(focus.discipline || ""); } }, [focus]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return t.records.filter((r) => {
      if (filter === "mine" && r.createdBy !== t.actor.uid) return false;
      if (["draft", "submitted", "returned", "approved", "locked"].includes(filter) && (r.status || "draft") !== filter) return false;
      if (filter === "noEvidence" && (r.evidence || []).length) return false;
      if (discipline && r.discipline !== discipline) return false;
      if (range.from && r.date < range.from) return false;
      if (range.to && r.date > range.to) return false;
      if (needle && ![r.title, r.discipline, r.location, r.stationId, r.shift, r.createdByName, ...(r.participants || []).map((p) => p.name)].join(" ").toLowerCase().includes(needle)) return false;
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }, [t.records, t.actor.uid, filter, discipline, range, q]);

  const open = openId ? t.records.find((r) => r.id === openId) : null;

  function exportCsv() {
    const lines = [];
    for (const r of rows) {
      for (const p of r.participants || []) {
        lines.push({ "Record ID": r.id, Date: r.date, Topic: r.title, Discipline: r.discipline, Status: statusLabel(r.status), "Course ID": r.courseId || "", "Course version": r.courseVersion || "",
          "Instructional hours": r.instructionalHours, Participant: p.name, "Personnel ID": p.external ? "" : p.personId, Agency: p.agency || "", Attendance: p.attendance, "Credited hours": creditedHoursFor(p, r),
          Station: r.stationId || "", Shift: r.shift || "", Instructors: (r.instructors || []).map((i) => i.name).join("; ") });
      }
    }
    downloadText(`training-records-${todayIso()}.csv`, toCsv(lines));
  }

  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <div className="trn-toolbar">
        <div className="segmented-control" role="tablist" aria-label="Record filter">
          {FILTERS.map((f) => <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? "active" : ""} onClick={() => setFilter(f.id)}>{f.label}{f.id === "submitted" ? ` (${t.records.filter((r) => r.status === "submitted").length})` : ""}</button>)}
        </div>
        <div className="trn-actions">
          <button type="button" className="secondary-button" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
          {t.flags.canEdit ? <button type="button" className="primary-button" onClick={() => setEditing({})}><CirclePlus size={14} /> Log training</button> : null}
        </div>
      </div>
      <div className="trn-filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topic, person, station…" aria-label="Search records" />
        <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} aria-label="Discipline"><option value="">All disciplines</option>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select>
        <label className="trn-inline-label">From <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="trn-inline-label">To <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <span className="trn-muted">{rows.length} record{rows.length === 1 ? "" : "s"}</span>
      </div>
      {!t.ready ? <div className="inspections-loading-state"><p>Loading training records…</p></div>
        : !t.records.length ? <EmptyState title="No training recorded yet" action={t.flags.canEdit ? <button type="button" className="primary-button" onClick={() => setEditing({})}><CirclePlus size={14} /> Log the first drill</button> : null}>Company officers log drills here: pick a topic, enter the time, confirm who was there, and submit.</EmptyState>
          : (
            <Section title="Training records">
              <Table onRowClick={(r) => setOpenId(r.id)} empty="No records match these filters."
                columns={[
                  { key: "date", label: "Date" },
                  { key: "title", label: "Topic", render: (r) => <button type="button" className="link-button" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>{r.title || "(untitled)"}</button> },
                  { key: "discipline", label: "Discipline" },
                  { key: "where", label: "Station / shift", render: (r) => [r.stationId, r.shift].filter(Boolean).join(" / ") || "—" },
                  { key: "h", label: "Hours", render: (r) => fmtHours(r.instructionalHours) },
                  { key: "n", label: "Attended", render: (r) => r.presentCount ?? 0 },
                  { key: "ph", label: "Person-h", render: (r) => fmtHours(r.personHours) },
                  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
                ]}
                rows={rows} />
            </Section>
          )}
      {editing ? <RecordEditor initial={editing.id ? editing : null} onDutyIds={onDutyIds} title={editing.id ? "Edit training record" : "Log training"}
        onClose={() => setEditing(null)} onSaved={(r, submitted) => { setEditing(null); setNotice(`${r.title} ${submitted ? "submitted for approval" : "saved as a draft"}.`); }} /> : null}
      {open && !editing ? <RecordDetail record={open} onClose={() => setOpenId(null)} onEdit={(r) => { setOpenId(null); setEditing(r); }} /> : null}
    </div>
  );
}
