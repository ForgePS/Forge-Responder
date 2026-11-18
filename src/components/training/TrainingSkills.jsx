import { useMemo, useState } from "react";
import { CirclePlus, ClipboardCheck, FileUp, ShieldCheck, Trash2 } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Badge, EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, Section, Table, todayIso } from "./TrainingUi.jsx";
import SignatureField from "./SignatureField.jsx";
import { attemptStanding, blankSkillDefinition, canEvaluate, scoreAttempt } from "../../lib/training/trainingSkills.js";
import { DISCIPLINES } from "../../lib/training/trainingReports.js";
import { approveEvaluation, saveEvaluation, saveTrainingDoc, TRAINING_COLLECTIONS as C } from "../../lib/training/trainingService.js";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { safeFileName } from "../../lib/storagePaths.js";
import { friendlyError } from "../../lib/friendlyError.js";
import { uniqueRecordId } from "../../lib/recordIds.js";

export const SKILL_AREAS = ["Firefighter I", "Firefighter II", "Driver/operator", "Pump operator", "Aerial operator", "Fire officer", "Fire instructor", "Hazardous materials", "Technical rescue", "EMS practical", "Special operations", "Department qualification"];

function SkillEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const [s, setS] = useState(() => ({ ...blankSkillDefinition(), ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p) => setS((x) => ({ ...x, ...p }));
  async function save() {
    if (!s.title.trim()) { setError("Enter the skill title."); return; }
    if (!s.steps.length) { setError("Add at least one performance step."); return; }
    setBusy(true);
    try {
      // Editing the rubric bumps its version; past evaluations keep the rubric they used.
      const version = initial?.id ? (Number(initial.version) || 1) + (JSON.stringify(initial.steps) !== JSON.stringify(s.steps) || JSON.stringify(initial.criticalFailures) !== JSON.stringify(s.criticalFailures) || initial.passingPercent !== s.passingPercent ? 1 : 0) : 1;
      await saveTrainingDoc(t.departmentId, C.skills, { ...s, version }, t.actor, "SKL");
      onSaved();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  const step = (i, p) => set({ steps: s.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <Modal title={initial?.id ? `Edit ${s.title}` : "New skill"} onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <div className="trn-grid">
          <Field label="Skill title" wide><input value={s.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Skill ID"><input value={s.code} onChange={(e) => set({ code: e.target.value })} /></Field>
          <Field label="Area"><select value={s.area || ""} onChange={(e) => set({ area: e.target.value })}><option value="">—</option>{SKILL_AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Discipline"><select value={s.discipline} onChange={(e) => set({ discipline: e.target.value })}>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Standard reference" hint="Your mapping; no standard text is stored."><input value={s.standardRef} onChange={(e) => set({ standardRef: e.target.value })} /></Field>
          <Field label="Standard edition"><input value={s.standardEdition} onChange={(e) => set({ standardEdition: e.target.value })} /></Field>
          <Field label="Required equipment"><input value={s.equipment} onChange={(e) => set({ equipment: e.target.value })} /></Field>
          <Field label="Passing score (%)"><input type="number" min="0" max="100" value={s.passingPercent} onChange={(e) => set({ passingPercent: Number(e.target.value) })} /></Field>
          <Field label="Attempts before remediation"><input type="number" min="1" value={s.maxAttempts} onChange={(e) => set({ maxAttempts: Number(e.target.value) })} /></Field>
          <Field label="Evaluator qualification required" hint="Matched against the evaluator's certifications/qualifiers."><input value={s.evaluatorQualification || ""} onChange={(e) => set({ evaluatorQualification: e.target.value })} /></Field>
          <Field label="Requires medical-director review"><select value={s.medicalDirectorReview ? "yes" : "no"} onChange={(e) => set({ medicalDirectorReview: e.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select></Field>
        </div>
        <div className="trn-subhead"><h4>Performance steps</h4><button type="button" className="secondary-button" onClick={() => set({ steps: [...s.steps, { id: uniqueRecordId("ST"), text: "", points: 1, critical: false }] })}><CirclePlus size={14} /> Add step</button></div>
        {s.steps.map((x, i) => (
          <div key={x.id} className="trn-inline trn-step-row">
            <span className="trn-muted">{i + 1}.</span>
            <input className="trn-grow" value={x.text} onChange={(e) => step(i, { text: e.target.value })} placeholder="Performance criterion" aria-label={`Step ${i + 1}`} />
            <input type="number" min="1" value={x.points} onChange={(e) => step(i, { points: Number(e.target.value) })} aria-label="Points" className="trn-narrow" />
            <label className="trn-inline-label"><input type="checkbox" checked={x.critical} onChange={(e) => step(i, { critical: e.target.checked })} /> Critical</label>
            <button type="button" className="icon-button" aria-label="Remove step" onClick={() => set({ steps: s.steps.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
          </div>
        ))}
        <div className="trn-subhead"><h4>Critical failures (automatic fail)</h4><button type="button" className="secondary-button" onClick={() => set({ criticalFailures: [...s.criticalFailures, { id: uniqueRecordId("CF"), text: "" }] })}><CirclePlus size={14} /> Add</button></div>
        {s.criticalFailures.map((x, i) => (
          <div key={x.id} className="trn-inline">
            <input className="trn-grow" value={x.text} onChange={(e) => set({ criticalFailures: s.criticalFailures.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)) })} placeholder="e.g. Failed to maintain an airway" aria-label={`Critical failure ${i + 1}`} />
            <button type="button" className="icon-button" aria-label="Remove" onClick={() => set({ criticalFailures: s.criticalFailures.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}

/** Tablet-friendly evaluation checklist. */
export function EvaluationRunner({ skill, personId: initialPerson = "", onClose, onSaved, kind = "attempt" }) {
  const t = useTraining();
  const [personId, setPersonId] = useState(initialPerson);
  const [marks, setMarks] = useState({});
  const [failures, setFailures] = useState([]);
  const [comments, setComments] = useState("");
  const [remediation, setRemediation] = useState("");
  const [evidence, setEvidence] = useState([]);
  const [sigEval, setSigEval] = useState(null);
  const [sigCand, setSigCand] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authz = canEvaluate(t.actor, skill);
  const score = scoreAttempt(skill, marks, failures);
  const person = t.personnel.find((p) => String(p.id) === String(personId));
  const history = t.evaluations.filter((e) => e.skillId === skill.id && String(e.personId) === String(personId));
  const standing = attemptStanding(history, skill);

  async function upload(file) {
    if (!file) return;
    try {
      const up = await uploadFirebaseFile(`departments/${t.departmentId}/training/evaluations/${skill.id}/${Date.now()}-${safeFileName(file.name)}`, file);
      setEvidence((ev) => [...ev, { name: file.name, url: up.downloadUrl, storagePath: up.storagePath }]);
    } catch (e) { setError(friendlyError(e, "Upload failed.")); }
  }

  async function save() {
    setError("");
    if (!authz.ok) { setError(authz.reason); return; }
    if (!person) { setError("Choose the member being evaluated."); return; }
    if (kind === "attempt" && !score.complete) { setError("Mark every step done, missed, or N/A."); return; }
    if (kind === "attempt" && !standing.canAttempt && !standing.passed) { setError("This member has used all attempts; record remediation first."); return; }
    if (!sigEval) { setError("The evaluator must sign."); return; }
    setBusy(true);
    try {
      await saveEvaluation(t.departmentId, {
        kind, personId: String(person.id), personName: person.name, skillId: skill.id, skillTitle: skill.title, skillVersion: skill.version || 1,
        rubric: { steps: skill.steps, criticalFailures: skill.criticalFailures, passingPercent: skill.passingPercent },
        date: todayIso(), marks, criticalFailuresObserved: failures,
        result: kind === "remediation" ? "remediation" : score.result, percent: score.percent, reasons: score.reasons,
        remediationComplete: kind === "remediation", remediationPlan: remediation, comments, evidence,
        signatures: { evaluator: sigEval, candidate: sigCand }, status: "submitted",
        needsMedicalDirector: Boolean(skill.medicalDirectorReview),
      }, t.actor);
      onSaved(kind === "remediation" ? "Remediation recorded." : `Evaluation saved: ${score.result === "pass" ? "successful" : "unsuccessful"}. A second approver signs off the result.`);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title={`${kind === "remediation" ? "Remediation" : "Evaluate"}: ${skill.title}`} onClose={onClose}>
      <div className="trn-form trn-eval">
        <ErrorNote error={error || (!authz.ok ? authz.reason : "")} />
        <Field label="Member"><select value={personId} onChange={(e) => setPersonId(e.target.value)}><option value="">Choose…</option>{t.personnel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        {person ? <p className="trn-muted">Attempts since last remediation: {standing.attemptsUsed} of {standing.maxAttempts}{standing.passed ? " · already passed" : ""}{standing.remediationRequired ? " · remediation required" : ""}</p> : null}
        {kind === "attempt" ? (
          <>
            <ol className="trn-checklist">
              {skill.steps.map((st) => (
                <li key={st.id} className={st.critical ? "critical" : ""}>
                  <span>{st.text}{st.critical ? <Badge tone="critical">Critical</Badge> : null}<small className="trn-muted"> {st.points} pt</small></span>
                  <div className="trn-tri" role="radiogroup" aria-label={st.text}>
                    {[["done", "Done"], ["missed", "Missed"], ["na", "N/A"]].map(([v, l]) => (
                      <button key={v} type="button" role="radio" aria-checked={marks[st.id] === v} className={marks[st.id] === v ? `on ${v}` : ""} onClick={() => setMarks({ ...marks, [st.id]: v })}>{l}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            {skill.criticalFailures?.length ? (
              <fieldset className="trn-fieldset"><legend>Critical failures observed</legend>
                {skill.criticalFailures.map((f) => <label key={f.id} className="trn-inline-label"><input type="checkbox" checked={failures.includes(f.id)} onChange={(e) => setFailures(e.target.checked ? [...failures, f.id] : failures.filter((x) => x !== f.id))} /> {f.text}</label>)}
              </fieldset>
            ) : null}
            <div className={`trn-score ${score.result}`} aria-live="polite">
              <strong>{score.result === "incomplete" ? "Incomplete" : score.result === "pass" ? "Successful" : "Unsuccessful"}</strong>
              <span>{score.earned}/{score.possible} pts · {score.percent}% (pass {score.passingPercent}%)</span>
              {score.reasons.map((r) => <small key={r}>{r}</small>)}
            </div>
          </>
        ) : <Field label="Remediation completed" wide><textarea rows={3} value={remediation} onChange={(e) => setRemediation(e.target.value)} placeholder="What was reviewed and practiced" /></Field>}
        <Field label="Evaluator comments" wide><textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
        {kind === "attempt" && score.result === "fail" ? <Field label="Remediation plan" wide><textarea rows={2} value={remediation} onChange={(e) => setRemediation(e.target.value)} /></Field> : null}
        <div className="trn-inline"><label className="secondary-button trn-file"><input type="file" accept="image/*,video/*,.pdf" capture="environment" onChange={(e) => upload(e.target.files?.[0])} /><FileUp size={14} /> Photo / video evidence</label>{evidence.map((e) => <a key={e.storagePath} href={e.url} target="_blank" rel="noreferrer">{e.name}</a>)}</div>
        <SignatureField label="Evaluator signature" signerName={t.actor.name} value={sigEval} onChange={setSigEval} />
        <SignatureField label="Candidate signature (acknowledges result)" signerName={person?.name || ""} value={sigCand} onChange={setSigCand} />
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} disabled={!authz.ok} saveLabel="Save evaluation" />
    </Modal>
  );
}

function EvaluationView({ ev, onClose }) {
  const t = useTraining();
  const [error, setError] = useState("");
  const canApprove = t.flags.canApprove && ev.status === "submitted" && ev.evaluatorUid !== t.actor.uid;
  return (
    <Modal title={`${ev.skillTitle} — ${ev.personName}`} onClose={onClose}>
      <ErrorNote error={error} />
      <div className="cert-detail-grid">{[["Date", ev.date], ["Result", ev.result], ["Score", ev.percent != null ? `${ev.percent}%` : "—"], ["Rubric version", ev.skillVersion], ["Evaluator", ev.evaluatorName], ["Status", ev.status], ["Approved by", ev.approvedByName || "—"]].map(([k, v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
      {ev.needsMedicalDirector ? <p className="trn-callout">This skill requires medical-director review before it is relied on clinically.</p> : null}
      {(ev.reasons || []).length ? <ul className="trn-callout warning">{ev.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
      {ev.rubric?.steps ? <ol className="trn-list">{ev.rubric.steps.map((s) => <li key={s.id}>{s.text} — <strong>{ev.marks?.[s.id] || "—"}</strong>{s.critical ? " (critical)" : ""}</li>)}</ol> : null}
      {ev.comments ? <p className="trn-pre">{ev.comments}</p> : null}
      {ev.remediationPlan ? <p className="trn-pre"><strong>Remediation:</strong> {ev.remediationPlan}</p> : null}
      {(ev.evidence || []).map((e) => <a key={e.storagePath} href={e.url} target="_blank" rel="noreferrer">{e.name} </a>)}
      <div className="trn-two">{["evaluator", "candidate"].map((k) => ev.signatures?.[k]?.image ? <figure key={k} className="trn-sig-view"><img src={ev.signatures[k].image} alt={`${k} signature`} /><figcaption>{ev.signatures[k].name} · {String(ev.signatures[k].signedAt).slice(0, 16).replace("T", " ")}</figcaption></figure> : null)}</div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        {canApprove ? <button type="button" className="primary-button" onClick={async () => { try { await approveEvaluation(t.departmentId, ev.id, t.actor); onClose(); } catch (e) { setError(friendlyError(e)); } }}><ShieldCheck size={14} /> Approve result</button> : null}
        {ev.status === "submitted" && ev.evaluatorUid === t.actor.uid ? <span className="trn-muted">A different approver signs off this result.</span> : null}
      </div>
    </Modal>
  );
}

export default function TrainingSkills({ focus }) {
  const t = useTraining();
  const [tab, setTab] = useState(focus?.tab || "skills");
  const [editing, setEditing] = useState(null);
  const [running, setRunning] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [notice, setNotice] = useState("");
  const [area, setArea] = useState("");
  const skills = useMemo(() => t.skills.filter((s) => s.status !== "retired" && (!area || s.area === area)), [t.skills, area]);
  const evals = useMemo(() => t.evaluations.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))), [t.evaluations]);
  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <div className="trn-toolbar">
        <div className="segmented-control">
          <button type="button" className={tab === "skills" ? "active" : ""} onClick={() => setTab("skills")}>Skill sheets</button>
          <button type="button" className={tab === "evaluations" ? "active" : ""} onClick={() => setTab("evaluations")}>Evaluations ({t.evaluations.filter((e) => e.status === "submitted").length} to approve)</button>
        </div>
        {tab === "skills" ? <div className="trn-actions">
          <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area"><option value="">All areas</option>{SKILL_AREAS.map((a) => <option key={a}>{a}</option>)}</select>
          {t.flags.canConfigure || t.flags.canApprove ? <button type="button" className="primary-button" onClick={() => setEditing({})}><CirclePlus size={14} /> New skill</button> : null}
        </div> : null}
      </div>
      {tab === "skills" ? (
        !t.skills.length ? <EmptyState title="No skill sheets yet">Build a rubric with performance steps, critical steps and critical failures. Evaluators then run it on a tablet in the field.</EmptyState> : (
          <Section title="Skill sheets">
            <Table rows={skills} columns={[{ key: "title", label: "Skill" }, { key: "code", label: "ID" }, { key: "area", label: "Area" }, { key: "standardRef", label: "Standard" }, { key: "steps", label: "Steps", render: (s) => s.steps?.length || 0 }, { key: "version", label: "Rubric v" },
              { key: "a", label: "", render: (s) => <div className="trn-actions">
                {t.flags.canEvaluate ? <button type="button" className="secondary-button" onClick={() => setRunning({ skill: s, kind: "attempt" })}><ClipboardCheck size={14} /> Evaluate</button> : null}
                {t.flags.canEvaluate ? <button type="button" className="text-button" onClick={() => setRunning({ skill: s, kind: "remediation" })}>Remediation</button> : null}
                {t.flags.canConfigure || t.flags.canApprove ? <button type="button" className="text-button" onClick={() => setEditing(s)}>Edit</button> : null}
              </div> }]} />
          </Section>
        )
      ) : (
        <Section title="Evaluations">
          <Table rows={evals} onRowClick={setViewing} empty={t.flags.canReview ? "No evaluations yet." : "You have no evaluations on file."}
            columns={[{ key: "date", label: "Date" }, { key: "personName", label: "Member" }, { key: "skillTitle", label: "Skill" },
              { key: "result", label: "Result", render: (e) => <Badge tone={e.result === "pass" ? "success" : e.result === "fail" ? "critical" : "info"}>{e.result}</Badge> },
              { key: "percent", label: "Score", render: (e) => (e.percent != null && e.kind !== "remediation" ? `${e.percent}%` : "—") }, { key: "evaluatorName", label: "Evaluator" },
              { key: "status", label: "Status", render: (e) => <Badge tone={e.status === "approved" ? "success" : "warning"}>{e.status}</Badge> }]} />
        </Section>
      )}
      {editing ? <SkillEditor initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice("Skill saved."); }} /> : null}
      {running ? <EvaluationRunner skill={running.skill} kind={running.kind} onClose={() => setRunning(null)} onSaved={(m) => { setRunning(null); setNotice(m); }} /> : null}
      {viewing ? <EvaluationView ev={t.evaluations.find((e) => e.id === viewing.id) || viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
