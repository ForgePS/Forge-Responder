import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Badge, EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, Section, Table } from "./TrainingUi.jsx";
import { decideRequest, saveTrainingDoc, TRAINING_COLLECTIONS as C } from "../../lib/training/trainingService.js";
import { friendlyError } from "../../lib/friendlyError.js";

const TONE = { submitted: "warning", approved: "success", denied: "critical", completed: "info", cancelled: "neutral" };
export const requestTotal = (r) => ["tuition", "travel", "lodging", "meals", "other"].reduce((s, k) => s + (Number(r.costs?.[k]) || 0), 0);
const money = (n) => (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

function RequestForm({ onClose, onSaved }) {
  const t = useTraining();
  const [r, setR] = useState({ provider: "", title: "", kind: "Course", location: "", startDate: "", endDate: "", costs: { tuition: "", travel: "", lodging: "", meals: "", other: "" }, justification: "", expectedCredits: "", coverageNeeded: false, coverageNotes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p) => setR((x) => ({ ...x, ...p }));
  async function save() {
    if (!r.title.trim() || !r.provider.trim()) { setError("Enter the course title and provider."); return; }
    if (!r.startDate) { setError("Enter the start date."); return; }
    if (!r.justification.trim()) { setError("Explain how this training benefits the department."); return; }
    setBusy(true);
    try {
      await saveTrainingDoc(t.departmentId, C.requests, { ...r, costs: Object.fromEntries(Object.entries(r.costs).map(([k, v]) => [k, Number(v) || 0])), requesterUid: t.actor.uid, requesterName: t.actor.name, personId: t.myPersonId, status: "submitted", decisions: [] }, t.actor, "TRQ");
      onSaved();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title="Request outside training" onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <div className="trn-grid">
          <Field label="Course / event title" wide><input value={r.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Type"><select value={r.kind} onChange={(e) => set({ kind: e.target.value })}>{["Course", "Conference", "Academy", "Professional development", "Certification exam"].map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Provider"><input value={r.provider} onChange={(e) => set({ provider: e.target.value })} /></Field>
          <Field label="Location"><input value={r.location} onChange={(e) => set({ location: e.target.value })} /></Field>
          <Field label="Start"><input type="date" value={r.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
          <Field label="End"><input type="date" value={r.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
          {["tuition", "travel", "lodging", "meals", "other"].map((k) => <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} ($)`}><input type="number" min="0" step="0.01" value={r.costs[k]} onChange={(e) => set({ costs: { ...r.costs, [k]: e.target.value } })} /></Field>)}
          <Field label="Estimated total"><strong>{money(requestTotal({ costs: r.costs }))}</strong></Field>
          <Field label="Expected credits / certification"><input value={r.expectedCredits} onChange={(e) => set({ expectedCredits: e.target.value })} /></Field>
          <Field label="Justification" wide><textarea rows={3} value={r.justification} onChange={(e) => set({ justification: e.target.value })} /></Field>
          <label className="trn-inline-label trn-field-wide"><input type="checkbox" checked={r.coverageNeeded} onChange={(e) => set({ coverageNeeded: e.target.checked })} /> Needs duty coverage (scheduling will be asked to cover the shifts)</label>
          {r.coverageNeeded ? <Field label="Shifts affected" wide><input value={r.coverageNotes} onChange={(e) => set({ coverageNotes: e.target.value })} /></Field> : null}
        </div>
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} saveLabel="Submit request" />
    </Modal>
  );
}

function RequestView({ req, onClose }) {
  const t = useTraining();
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [completion, setCompletion] = useState({ hours: "", certificateUrl: "", reimbursement: "" });
  const mine = req.requesterUid === t.actor.uid;
  const decide = (d) => decideRequest(t.departmentId, req.id, d, t.actor, note).then(onClose).catch((e) => setError(friendlyError(e)));
  async function complete() {
    try {
      await saveTrainingDoc(t.departmentId, C.requests, { ...req, completion: { ...completion, recordedBy: t.actor.uid, recordedAt: new Date().toISOString() } }, t.actor);
      await decideRequest(t.departmentId, req.id, "completed", t.actor, "Completion recorded");
      onClose();
    } catch (e) { setError(friendlyError(e)); }
  }
  return (
    <Modal title={req.title} onClose={onClose}>
      <ErrorNote error={error} />
      <div className="cert-detail-grid">{[["Requested by", req.requesterName], ["Provider", req.provider], ["Type", req.kind], ["Location", req.location], ["Dates", `${req.startDate} – ${req.endDate || req.startDate}`], ["Total", money(requestTotal(req))], ["Tuition", money(req.costs?.tuition)], ["Travel", money(req.costs?.travel)], ["Lodging", money(req.costs?.lodging)], ["Meals", money(req.costs?.meals)], ["Expected credits", req.expectedCredits || "—"], ["Duty coverage", req.coverageNeeded ? req.coverageNotes || "Yes" : "No"], ["Status", req.status]].map(([k, v]) => <div key={k}><span>{k}</span><strong>{v || "—"}</strong></div>)}</div>
      <p className="trn-pre">{req.justification}</p>
      {(req.decisions || []).length ? <ol className="trn-list">{req.decisions.map((d, i) => <li key={i}><strong>{d.decision}</strong> by {d.byName} · {String(d.at).slice(0, 10)}{d.note ? ` — ${d.note}` : ""}</li>)}</ol> : null}
      {req.completion ? <p>Completed: {req.completion.hours} h {req.completion.certificateUrl ? <a href={req.completion.certificateUrl} target="_blank" rel="noreferrer">certificate</a> : null} {req.completion.reimbursement ? `· reimbursement ${money(req.completion.reimbursement)}` : ""}</p> : null}
      {t.flags.canApprove && !mine && req.status === "submitted" ? <Field label="Decision note" wide><input value={note} onChange={(e) => setNote(e.target.value)} /></Field> : null}
      {req.status === "approved" && t.flags.canApprove && !mine ? (
        <div className="trn-grid">
          <Field label="Hours attended"><input type="number" min="0" value={completion.hours} onChange={(e) => setCompletion({ ...completion, hours: e.target.value })} /></Field>
          <Field label="Certificate link"><input type="url" value={completion.certificateUrl} onChange={(e) => setCompletion({ ...completion, certificateUrl: e.target.value })} /></Field>
          <Field label="Reimbursed ($)"><input type="number" min="0" value={completion.reimbursement} onChange={(e) => setCompletion({ ...completion, reimbursement: e.target.value })} /></Field>
          <p className="trn-muted trn-field-wide">To count the hours, log an External training record and (for EMS) record CE credit for the approved amount.</p>
        </div>
      ) : null}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        {(mine || t.flags.canApprove) && ["submitted", "approved"].includes(req.status) ? <button type="button" className="secondary-button" onClick={() => decide("cancelled")}>Cancel request</button> : null}
        {t.flags.canApprove && !mine && req.status === "submitted" ? <><button type="button" className="secondary-button danger-button" onClick={() => decide("denied")}>Deny</button><button type="button" className="primary-button" onClick={() => decide("approved")}>Approve</button></> : null}
        {req.status === "approved" && t.flags.canApprove && !mine ? <button type="button" className="primary-button" onClick={complete}>Mark completed</button> : null}
      </div>
    </Modal>
  );
}

export default function TrainingRequests() {
  const t = useTraining();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("");
  const rows = t.requests.filter((r) => !status || r.status === status).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const open = openId ? t.requests.find((r) => r.id === openId) : null;
  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <div className="trn-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.keys(TONE).map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <button type="button" className="primary-button" onClick={() => setAdding(true)}><CirclePlus size={14} /> New request</button>
      </div>
      {t.requests.length ? (
        <Section title={t.flags.canApprove ? "Training requests" : "My requests"}>
          <Table rows={rows} onRowClick={(r) => setOpenId(r.id)} empty="No requests match."
            columns={[{ key: "createdAt", label: "Filed", render: (r) => String(r.createdAt).slice(0, 10) }, { key: "requesterName", label: "Member" }, { key: "title", label: "Training" }, { key: "provider", label: "Provider" }, { key: "startDate", label: "Starts" }, { key: "total", label: "Est. cost", render: (r) => money(requestTotal(r)) },
              { key: "status", label: "Status", render: (r) => <Badge tone={TONE[r.status]}>{r.status}</Badge> }]} />
        </Section>
      ) : <EmptyState title="No training requests">Members request outside courses, conferences and academies here; an approver decides.</EmptyState>}
      {adding ? <RequestForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice("Request submitted."); }} /> : null}
      {open ? <RequestView req={open} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
