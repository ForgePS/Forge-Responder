import { useMemo, useState } from "react";
import { CirclePlus, Trash2 } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Badge, ConfirmButton, EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, Section, Table, todayIso } from "./TrainingUi.jsx";
import SignatureField from "./SignatureField.jsx";
import { taskBookProgress } from "../../lib/training/trainingReports.js";
import { notifyPersonnel, saveTrainingDoc, TRAINING_COLLECTIONS as C } from "../../lib/training/trainingService.js";
import { friendlyError } from "../../lib/friendlyError.js";
import { uniqueRecordId } from "../../lib/recordIds.js";

export const PROGRAM_TYPES = ["Probationary firefighter", "Firefighter academy", "Driver/operator qualification", "Acting company officer", "Fire officer development", "EMS field training (FTO)", "Paramedic internship", "HazMat technician", "Rescue technician", "Instructor development", "Specialty team"];
const FTO_CATEGORIES = ["Patient assessment", "Clinical skills", "Communication", "Scene management", "Documentation", "Protocol knowledge", "Professionalism", "Driving / ambulance operations"];

function TemplateEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const [b, setB] = useState(() => ({ name: "", program: PROGRAM_TYPES[0], description: "", deadlineDays: 365, items: [], prerequisites: "", usesFtoReports: false, ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p) => setB((x) => ({ ...x, ...p }));
  const item = (i, p) => set({ items: b.items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  async function save() {
    if (!b.name.trim()) { setError("Name the task book."); return; }
    if (!b.items.length) { setError("Add at least one requirement."); return; }
    setBusy(true);
    try { await saveTrainingDoc(t.departmentId, C.taskBooks, { ...b, version: initial?.id ? (Number(initial.version) || 1) + 1 : 1 }, t.actor, "TB"); onSaved(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial?.id ? `Edit ${b.name}` : "New task book"} onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <div className="trn-grid">
          <Field label="Name" wide><input value={b.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Program"><select value={b.program} onChange={(e) => set({ program: e.target.value, usesFtoReports: /FTO|internship/i.test(e.target.value) || b.usesFtoReports })}>{PROGRAM_TYPES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Complete within (days)"><input type="number" min="1" value={b.deadlineDays} onChange={(e) => set({ deadlineDays: Number(e.target.value) })} /></Field>
          <Field label="Prerequisites" wide><input value={b.prerequisites} onChange={(e) => set({ prerequisites: e.target.value })} /></Field>
          <Field label="Description" wide><textarea rows={2} value={b.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <label className="trn-inline-label trn-field-wide"><input type="checkbox" checked={b.usesFtoReports} onChange={(e) => set({ usesFtoReports: e.target.checked })} /> Uses daily observation reports (EMS FTO / preceptor)</label>
        </div>
        <div className="trn-subhead"><h4>Requirements</h4><button type="button" className="secondary-button" onClick={() => set({ items: [...b.items, { id: uniqueRecordId("TBI"), type: "task", text: "", refId: "", required: true }] })}><CirclePlus size={14} /> Add</button></div>
        {b.items.map((x, i) => (
          <div key={x.id} className="trn-inline trn-step-row">
            <select value={x.type} onChange={(e) => item(i, { type: e.target.value, refId: "" })} aria-label="Requirement type"><option value="task">Task / checkoff</option><option value="course">Course</option><option value="skill">Skill evaluation</option><option value="assessment">Knowledge assessment</option></select>
            {x.type === "course" ? <select value={x.refId} onChange={(e) => item(i, { refId: e.target.value, text: x.text || t.courses.find((c) => c.id === e.target.value)?.title || "" })} aria-label="Course"><option value="">Course…</option>{t.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select> : null}
            {x.type === "skill" ? <select value={x.refId} onChange={(e) => item(i, { refId: e.target.value, text: x.text || t.skills.find((s) => s.id === e.target.value)?.title || "" })} aria-label="Skill"><option value="">Skill…</option>{t.skills.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select> : null}
            <input className="trn-grow" value={x.text} onChange={(e) => item(i, { text: e.target.value })} placeholder="Requirement" aria-label="Requirement text" />
            <label className="trn-inline-label"><input type="checkbox" checked={x.required !== false} onChange={(e) => item(i, { required: e.target.checked })} /> Required</label>
            <button type="button" className="icon-button" aria-label="Remove" onClick={() => set({ items: b.items.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}

function AssignmentView({ a, onClose }) {
  const t = useTraining();
  const [error, setError] = useState("");
  const [obs, setObs] = useState(null);
  const [finalSig, setFinalSig] = useState(null);
  const progress = taskBookProgress(a, t);
  const canSign = t.flags.canEvaluate || t.flags.canApprove;
  const authorized = a.status === "authorized";
  const save = (patch, msg) => saveTrainingDoc(t.departmentId, C.taskBookAssignments, { ...a, ...patch }, t.actor).catch((e) => setError(friendlyError(e, msg)));
  async function signoff(item) {
    const note = window.prompt(`Sign off "${item.text}" for ${a.personName}? Optional note:`, "");
    if (note === null) return;
    await save({ signoffs: { ...(a.signoffs || {}), [item.id]: { by: t.actor.uid, byName: t.actor.name, at: new Date().toISOString(), note } } });
  }
  async function failAttempt(item) {
    const note = window.prompt(`Record an unsuccessful attempt on "${item.text}". What needs remediation?`);
    if (!note) return;
    await save({ failedAttempts: [...(a.failedAttempts || []), { itemId: item.id, by: t.actor.uid, byName: t.actor.name, at: new Date().toISOString(), note }] });
  }
  return (
    <Modal title={`${a.taskBookName} — ${a.personName}`} onClose={onClose}>
      <ErrorNote error={error} />
      <div className="trn-progress" aria-label={`${progress.percent}% complete`}><div style={{ width: `${progress.percent}%` }} /></div>
      <p>{progress.done} of {progress.total} required items · due {a.dueDate || "—"} · <Badge tone={authorized ? "success" : "info"}>{authorized ? "Authorized" : a.status || "in progress"}</Badge></p>
      <ol className="trn-checklist">
        {progress.items.map(({ item, done, how }) => (
          <li key={item.id} className={done ? "done" : ""}>
            <span>{item.text}{item.required === false ? <small className="trn-muted"> (optional)</small> : null}<br /><small className="trn-muted">{done ? how : item.type === "course" ? "Completes when an approved record shows attendance" : item.type === "skill" ? "Completes with an approved passing evaluation" : "Needs evaluator sign-off"}</small>
              {(a.failedAttempts || []).filter((f) => f.itemId === item.id).map((f, i) => <small key={i} className="trn-tone-critical"><br />Unsuccessful {String(f.at).slice(0, 10)} ({f.byName}): {f.note}</small>)}</span>
            {!done && canSign && !authorized ? <div className="trn-actions"><button type="button" className="secondary-button" onClick={() => signoff(item)}>Sign off</button><button type="button" className="text-button" onClick={() => failAttempt(item)}>Unsuccessful</button></div> : null}
          </li>
        ))}
      </ol>
      {a.usesFtoReports ? (
        <>
          <div className="trn-subhead"><h4>Daily observation reports ({(a.observations || []).length})</h4>{canSign && !authorized ? <button type="button" className="secondary-button" onClick={() => setObs({ date: todayIso(), ratings: {}, narrative: "", recommendation: "continue" })}><CirclePlus size={14} /> New DOR</button> : null}</div>
          <Table rows={(a.observations || []).slice().reverse()} rowKey={(o) => o.id} empty="No observation reports."
            columns={[{ key: "date", label: "Date" }, { key: "byName", label: "FTO / preceptor" }, { key: "avg", label: "Avg rating", render: (o) => { const v = Object.values(o.ratings || {}).map(Number).filter(Boolean); return v.length ? (v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : "—"; } }, { key: "recommendation", label: "Recommendation" }, { key: "narrative", label: "Narrative" }]} />
        </>
      ) : null}
      {obs ? (
        <div className="trn-amend">
          <h4>Daily observation report</h4>
          <Field label="Date"><input type="date" value={obs.date} onChange={(e) => setObs({ ...obs, date: e.target.value })} /></Field>
          <table className="trn-table"><thead><tr><th>Category</th>{[1, 2, 3, 4, 5, 6, 7].map((n) => <th key={n}>{n}</th>)}<th>N/O</th></tr></thead>
            <tbody>{FTO_CATEGORIES.map((c) => <tr key={c}><td>{c}</td>{[1, 2, 3, 4, 5, 6, 7, ""].map((n) => <td key={n || "no"}><input type="radio" name={`r-${c}`} checked={String(obs.ratings[c] ?? "") === String(n)} onChange={() => setObs({ ...obs, ratings: { ...obs.ratings, [c]: n } })} aria-label={`${c} ${n || "not observed"}`} /></td>)}</tr>)}</tbody></table>
          <p className="trn-muted">1 = unacceptable, 4 = acceptable, 7 = superior. Use your department's scale definitions.</p>
          <Field label="Narrative feedback" wide><textarea rows={3} value={obs.narrative} onChange={(e) => setObs({ ...obs, narrative: e.target.value })} /></Field>
          <Field label="Recommendation"><select value={obs.recommendation} onChange={(e) => setObs({ ...obs, recommendation: e.target.value })}><option value="continue">Continue program</option><option value="remediate">Remediation needed</option><option value="extend">Extend program</option><option value="release">Ready for release</option></select></Field>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setObs(null)}>Cancel</button><button type="button" className="primary-button" onClick={async () => { await save({ observations: [...(a.observations || []), { ...obs, id: uniqueRecordId("DOR"), by: t.actor.uid, byName: t.actor.name, at: new Date().toISOString() }] }); setObs(null); }}>Save DOR</button></div>
        </div>
      ) : null}
      {(a.supervisorReviews || []).length ? <><h4>Supervisor reviews</h4><ul className="trn-list">{a.supervisorReviews.map((r, i) => <li key={i}>{String(r.at).slice(0, 10)} {r.byName}: {r.note}</li>)}</ul></> : null}
      {progress.readyForFinal && !authorized && t.flags.canApprove ? (
        <div className="trn-amend"><h4>Final authorization</h4><p className="trn-muted">All required items are complete. Final authorization is a supervisor decision; the software only records it.</p>
          <SignatureField label="Authorizing officer" signerName={t.actor.name} value={finalSig} onChange={setFinalSig} /></div>
      ) : null}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        {canSign && !authorized ? <button type="button" className="secondary-button" onClick={async () => { const note = window.prompt("Supervisor review note"); if (note) await save({ supervisorReviews: [...(a.supervisorReviews || []), { by: t.actor.uid, byName: t.actor.name, at: new Date().toISOString(), note }] }); }}>Add supervisor review</button> : null}
        {t.flags.canConfigure && !authorized ? <ConfirmButton className="secondary-button danger-button" confirm="Withdraw this task book assignment?" onConfirm={async () => { await save({ status: "withdrawn" }); onClose(); }}>Withdraw</ConfirmButton> : null}
        {progress.readyForFinal && !authorized && t.flags.canApprove ? <button type="button" className="primary-button" disabled={!finalSig} onClick={async () => { await save({ status: "authorized", authorizedBy: t.actor.uid, authorizedByName: t.actor.name, authorizedAt: new Date().toISOString(), finalSignature: finalSig }); onClose(); }}>Authorize</button> : null}
      </div>
    </Modal>
  );
}

export default function TrainingTaskBooks() {
  const t = useTraining();
  const [tab, setTab] = useState("assignments");
  const [editing, setEditing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [assignPid, setAssignPid] = useState("");
  const [evaluator, setEvaluator] = useState("");
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const rows = useMemo(() => t.taskBookAssignments.filter((a) => a.status !== "withdrawn").map((a) => ({ ...a, p: taskBookProgress(a, t) })), [t]);
  const open = openId ? t.taskBookAssignments.find((a) => a.id === openId) : null;
  async function assign() {
    const person = t.personnel.find((p) => String(p.id) === String(assignPid));
    if (!person) { setError("Choose the member."); return; }
    const due = new Date();
    due.setDate(due.getDate() + (Number(assigning.deadlineDays) || 365));
    try {
      await saveTrainingDoc(t.departmentId, C.taskBookAssignments, {
        taskBookId: assigning.id, taskBookName: assigning.name, taskBookVersion: assigning.version || 1, program: assigning.program, items: assigning.items, usesFtoReports: Boolean(assigning.usesFtoReports),
        personId: String(person.id), personName: person.name, evaluatorId: evaluator, evaluatorName: t.personnel.find((p) => String(p.id) === String(evaluator))?.name || "",
        assignedAt: new Date().toISOString(), dueDate: due.toISOString().slice(0, 10), status: "in_progress", signoffs: {}, observations: [],
      }, t.actor, "TBA");
      await notifyPersonnel(t.departmentId, [person.id], { title: "Task book assigned", message: `${assigning.name} — due ${due.toISOString().slice(0, 10)}` });
      setAssigning(null); setAssignPid(""); setEvaluator(""); setNotice("Task book assigned.");
    } catch (e) { setError(friendlyError(e)); }
  }
  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <ErrorNote error={error} onClose={() => setError("")} />
      <div className="trn-toolbar">
        <div className="segmented-control"><button type="button" className={tab === "assignments" ? "active" : ""} onClick={() => setTab("assignments")}>Assigned task books</button><button type="button" className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>Programs & templates</button></div>
        {tab === "templates" && (t.flags.canConfigure || t.flags.canApprove) ? <button type="button" className="primary-button" onClick={() => setEditing({})}><CirclePlus size={14} /> New task book</button> : null}
      </div>
      {tab === "assignments" ? (
        rows.length ? <Section title="In progress & completed">
          <Table rows={rows} onRowClick={(a) => setOpenId(a.id)}
            columns={[{ key: "personName", label: "Member" }, { key: "taskBookName", label: "Task book" }, { key: "program", label: "Program" }, { key: "evaluatorName", label: "Evaluator" },
              { key: "p", label: "Progress", render: (a) => <div className="trn-progress small"><div style={{ width: `${a.p.percent}%` }} /><span>{a.p.percent}%</span></div> },
              { key: "dueDate", label: "Due", render: (a) => <span className={a.status !== "authorized" && a.dueDate < todayIso() ? "trn-tone-critical" : ""}>{a.dueDate}</span> },
              { key: "status", label: "Status", render: (a) => <Badge tone={a.status === "authorized" ? "success" : "info"}>{a.status === "authorized" ? "Authorized" : "In progress"}</Badge> }]} />
        </Section> : <EmptyState title="No task books assigned">Create a program template, then assign it to a member.</EmptyState>
      ) : (
        t.taskBooks.length ? <Section title="Templates">
          <Table rows={t.taskBooks}
            columns={[{ key: "name", label: "Task book" }, { key: "program", label: "Program" }, { key: "items", label: "Items", render: (b) => b.items?.length || 0 }, { key: "deadlineDays", label: "Days" }, { key: "version", label: "v" },
              { key: "a", label: "", render: (b) => <div className="trn-actions">{t.flags.canEvaluate || t.flags.canApprove || t.flags.canConfigure ? <button type="button" className="secondary-button" onClick={() => setAssigning(b)}>Assign</button> : null}{t.flags.canConfigure || t.flags.canApprove ? <button type="button" className="text-button" onClick={() => setEditing(b)}>Edit</button> : null}</div> }]} />
        </Section> : <EmptyState title="No task book templates">Build probationary, driver/operator, acting officer, FTO and specialty programs from courses, skills and checkoffs.</EmptyState>
      )}
      {editing ? <TemplateEditor initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice("Task book saved."); }} /> : null}
      {assigning ? (
        <Modal title={`Assign ${assigning.name}`} onClose={() => setAssigning(null)}>
          <Field label="Member"><select value={assignPid} onChange={(e) => setAssignPid(e.target.value)}><option value="">Choose…</option>{t.personnel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Primary evaluator / FTO"><select value={evaluator} onChange={(e) => setEvaluator(e.target.value)}><option value="">—</option>{t.personnel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <ModalActions onCancel={() => setAssigning(null)} onSave={assign} saveLabel="Assign" />
        </Modal>
      ) : null}
      {open ? <AssignmentView a={open} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
