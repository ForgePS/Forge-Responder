import { useMemo, useState } from "react";
import { CirclePlus, ShieldCheck } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Badge, EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, Section, Table, downloadText, fmtHours, todayIso } from "./TrainingUi.jsx";
import { CE_COMPONENTS, CE_LEVELS, ceProgress, findDuplicateAward, nccpStarterTemplate } from "../../lib/training/trainingCe.js";
import { awardCeCredit, saveTrainingDoc, setCeAwardStatus, TRAINING_COLLECTIONS as C } from "../../lib/training/trainingService.js";
import { creditedHoursFor } from "../../lib/training/trainingHours.js";
import { toCsv } from "../../lib/training/trainingReports.js";
import { resolvePersonEmsLevel } from "../../lib/personnelEmsCredentials.js";
import { friendlyError } from "../../lib/friendlyError.js";

const STATUS_TONE = { pending: "warning", approved: "success", rejected: "critical", voided: "neutral" };

function levelOf(p) {
  try { return resolvePersonEmsLevel(p) || p.nrLevel || p.ems || ""; } catch { return p.nrLevel || p.ems || ""; }
}
function normalizeLevel(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("paramedic") || s === "p" || s.includes("nrp")) return "Paramedic";
  if (s.includes("aemt") || s.includes("advanced")) return "AEMT";
  if (s.includes("emr") || s.includes("responder")) return "EMR";
  if (s.includes("emt")) return "EMT";
  return "";
}

/** The member's current cycle: explicit cycle doc, else derived from the NR expiration on the profile. */
export function cycleFor(person, ruleSet) {
  const end = String(person?.nrExpiration || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const years = Number(ruleSet?.cycleYears) || 2;
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + 1);
  return { start: d.toISOString().slice(0, 10), end };
}

function AwardEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const selfOnly = !(t.flags.canEdit || t.flags.canApproveCe || t.flags.canApprove);
  const [a, setA] = useState(() => ({ personId: selfOnly ? t.myPersonId : "", component: "individual", topic: "", creditHours: "", date: todayIso(), courseTitle: "", provider: "", approvalNumber: "", accreditation: "", stateApproved: false, nationallyRecognized: false, distributive: false, recordId: "", documentUrl: "", ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p) => setA((x) => ({ ...x, ...p }));
  const person = t.personnel.find((p) => String(p.id) === String(a.personId));
  const record = t.records.find((r) => r.id === a.recordId);
  const participant = record?.participants?.find((p) => String(p.personId) === String(a.personId));
  const timeOnRecord = record && participant ? creditedHoursFor(participant, record) : null;
  const dup = findDuplicateAward({ ...a, personId: String(a.personId) }, t.ceAwards);
  async function save() {
    setError("");
    if (!person) { setError("Choose the member."); return; }
    if (!(Number(a.creditHours) > 0)) { setError("Enter the approved CE credit hours."); return; }
    if (!a.recordId && !a.courseTitle.trim()) { setError("Name the course or link a training record."); return; }
    if (timeOnRecord !== null && Number(a.creditHours) > timeOnRecord) { setError(`Credit can't exceed the ${timeOnRecord} h this member attended.`); return; }
    if (dup) { setError("This learning activity is already credited to this member. Duplicate credit isn't allowed."); return; }
    setBusy(true);
    try {
      await awardCeCredit(t.departmentId, { ...a, personId: String(person.id), personName: person.name, creditHours: Number(a.creditHours), courseTitle: a.courseTitle || record?.title || "", status: "pending" }, t.actor);
      onSaved();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  const linkable = t.records.filter((r) => ["approved", "locked"].includes(r.status) && (r.participants || []).some((p) => String(p.personId) === String(a.personId) && creditedHoursFor(p, r) > 0));
  return (
    <Modal title="Record CE credit" onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <p className="trn-muted">Enter the credit actually approved by the accrediting body or state. Training time is not converted to CE automatically, and a CE approver must review every entry.</p>
        <div className="trn-grid">
          <Field label="Member"><select value={a.personId} onChange={(e) => set({ personId: e.target.value })} disabled={selfOnly}><option value="">Choose…</option>{t.personnel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="From a department training record (optional)">
            <select value={a.recordId} onChange={(e) => { const r = t.records.find((x) => x.id === e.target.value); set({ recordId: e.target.value, courseTitle: r?.title || a.courseTitle, date: r?.date || a.date }); }}>
              <option value="">— outside / external education —</option>
              {linkable.map((r) => <option key={r.id} value={r.id}>{r.date} {r.title}</option>)}
            </select>
          </Field>
          {timeOnRecord !== null ? <p className="trn-muted trn-field-wide">Attended {timeOnRecord} h on that record (instructional time, not credit).</p> : null}
          <Field label="Course title"><input value={a.courseTitle} onChange={(e) => set({ courseTitle: e.target.value })} /></Field>
          <Field label="Completion date"><input type="date" value={a.date} max={todayIso()} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Approved credit hours"><input type="number" min="0" step="0.25" value={a.creditHours} onChange={(e) => set({ creditHours: e.target.value })} /></Field>
          <Field label="NCCP component"><select value={a.component} onChange={(e) => set({ component: e.target.value })}>{CE_COMPONENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
          <Field label="Topic (for topic requirements)"><input value={a.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="e.g. Airway, Cardiology" /></Field>
          <Field label="Provider"><input value={a.provider} onChange={(e) => set({ provider: e.target.value })} /></Field>
          <Field label="Course approval number"><input value={a.approvalNumber} onChange={(e) => set({ approvalNumber: e.target.value })} placeholder="e.g. CAPCE or state number" /></Field>
          <Field label="Accreditation"><input value={a.accreditation} onChange={(e) => set({ accreditation: e.target.value })} /></Field>
          <Field label="Supporting document link"><input type="url" value={a.documentUrl} onChange={(e) => set({ documentUrl: e.target.value })} placeholder="Certificate URL" /></Field>
        </div>
        <div className="trn-checks">
          <label><input type="checkbox" checked={a.stateApproved} onChange={(e) => set({ stateApproved: e.target.checked })} /> State-approved</label>
          <label><input type="checkbox" checked={a.nationallyRecognized} onChange={(e) => set({ nationallyRecognized: e.target.checked })} /> Nationally recognized</label>
          <label><input type="checkbox" checked={a.distributive} onChange={(e) => set({ distributive: e.target.checked })} /> Distributive (self-paced online)</label>
        </div>
        {dup ? <p className="trn-callout warning">Already credited to this member on {dup.date} ({dup.component}).</p> : null}
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} saveLabel="Submit for review" />
    </Modal>
  );
}

function RuleSetEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const [r, setR] = useState(() => ({ ...nccpStarterTemplate(), ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setLevel = (lvl, comp, hours) => setR((x) => {
    const levels = { ...x.levels };
    const L = { ...(levels[lvl] || { totalHours: 0, components: {} }) };
    if (comp === "total") L.totalHours = Number(hours);
    else L.components = { ...L.components, [comp]: { ...(L.components?.[comp] || {}), hours: Number(hours) } };
    levels[lvl] = L;
    return { ...x, levels };
  });
  async function save() {
    if (r.active && r.needsVerification) { setError("Mark the hour values as verified before activating this rule set."); return; }
    setBusy(true);
    try {
      const version = initial?.id ? (Number(initial.version) || 1) + 1 : 1;
      await saveTrainingDoc(t.departmentId, C.ceRuleSets, { ...r, version, verifiedBy: r.needsVerification ? "" : (r.verifiedBy || t.actor.uid), verifiedByName: r.needsVerification ? "" : (r.verifiedByName || t.actor.name) }, t.actor, "CER");
      onSaved();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial?.id ? `Edit ${r.name}` : "New CE rule set"} onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <p className="trn-callout warning">{r.verificationNote || "Enter the requirements from the National Registry and your state EMS office."}</p>
        <div className="trn-grid">
          <Field label="Name"><input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field>
          <Field label="Framework / source"><input value={r.framework} onChange={(e) => setR({ ...r, framework: e.target.value })} /></Field>
          <Field label="State (if state rules)"><input value={r.state || ""} onChange={(e) => setR({ ...r, state: e.target.value })} /></Field>
          <Field label="Cycle length (years)"><input type="number" min="1" value={r.cycleYears} onChange={(e) => setR({ ...r, cycleYears: Number(e.target.value) })} /></Field>
          <Field label="Effective from"><input type="date" value={r.effectiveFrom || ""} onChange={(e) => setR({ ...r, effectiveFrom: e.target.value })} /></Field>
          <Field label="Source reference"><input value={r.sourceUrl || ""} onChange={(e) => setR({ ...r, sourceUrl: e.target.value })} placeholder="Link to the published requirements" /></Field>
        </div>
        <table className="trn-table"><thead><tr><th>Level</th><th>Total</th>{CE_COMPONENTS.map((c) => <th key={c.value}>{c.label}</th>)}</tr></thead>
          <tbody>{CE_LEVELS.map((lvl) => <tr key={lvl}><td>{lvl}</td><td><input type="number" min="0" step="0.5" value={r.levels?.[lvl]?.totalHours ?? 0} onChange={(e) => setLevel(lvl, "total", e.target.value)} aria-label={`${lvl} total`} /></td>
            {CE_COMPONENTS.map((c) => <td key={c.value}><input type="number" min="0" step="0.5" value={r.levels?.[lvl]?.components?.[c.value]?.hours ?? 0} onChange={(e) => setLevel(lvl, c.value, e.target.value)} aria-label={`${lvl} ${c.label}`} /></td>)}</tr>)}</tbody></table>
        <div className="trn-checks">
          <label><input type="checkbox" checked={r.spillover} onChange={(e) => setR({ ...r, spillover: e.target.checked })} /> Extra hours flow national → local → individual</label>
          <label><input type="checkbox" checked={r.allowRepeatSources} onChange={(e) => setR({ ...r, allowRepeatSources: e.target.checked })} /> Allow repeating the same course in a cycle</label>
          <label><input type="checkbox" checked={!r.needsVerification} onChange={(e) => setR({ ...r, needsVerification: !e.target.checked })} /> I verified these values against the current published requirements</label>
          <label><input type="checkbox" checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} /> Active</label>
        </div>
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}

export default function TrainingCe() {
  const t = useTraining();
  const [tab, setTab] = useState("progress");
  const [adding, setAdding] = useState(false);
  const [ruleEdit, setRuleEdit] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [personId, setPersonId] = useState(t.flags.canReview ? "" : t.myPersonId);
  const ruleSet = t.ceRuleSets.find((r) => r.active) || null;
  const emsMembers = useMemo(() => t.personnel.map((p) => ({ p, level: normalizeLevel(levelOf(p)) })).filter((x) => x.level && (!personId || String(x.p.id) === String(personId))), [t.personnel, personId]);
  const rows = emsMembers.map(({ p, level }) => {
    const cycle = cycleFor(p, ruleSet);
    // Without known cycle dates every old award would count, so progress isn't calculated.
    const progress = ruleSet && cycle ? ceProgress({ ruleSet, level, awards: t.ceAwards.filter((a) => String(a.personId) === String(p.id)), cycle }) : null;
    return { id: p.id, p, level, cycle, progress };
  });
  const pending = t.ceAwards.filter((a) => a.status === "pending");

  function transcript(row) {
    downloadText(`ce-transcript-${row.p.name.replace(/\W+/g, "-")}.csv`, toCsv(t.ceAwards.filter((a) => String(a.personId) === String(row.id)).map((a) => ({ Member: row.p.name, Level: row.level, Date: a.date, Course: a.courseTitle, Component: a.component, Topic: a.topic, "Credit hours": a.creditHours, Provider: a.provider, "Approval #": a.approvalNumber, Status: a.status, "Reviewed by": a.reviewedByName || "" }))));
  }

  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <ErrorNote error={error} onClose={() => setError("")} />
      <div className="trn-toolbar">
        <div className="segmented-control">
          {[["progress", "Cycle progress"], ["awards", `Credit entries${pending.length ? ` (${pending.length} pending)` : ""}`], ["rules", "Rule sets"]].map(([id, l]) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{l}</button>)}
        </div>
        <div className="trn-actions">
          {t.flags.canReview ? <select value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Member"><option value="">All EMS members</option>{t.personnel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}
          {t.myPersonId || t.flags.canEdit ? <button type="button" className="primary-button" onClick={() => setAdding(true)}><CirclePlus size={14} /> Record CE credit</button> : null}
        </div>
      </div>
      {!ruleSet ? <p className="trn-callout warning">No active CE rule set. {t.flags.canConfigure || t.flags.canApproveCe ? "Create one under Rule sets, verify the hour values against the current NREMT and state requirements, then activate it." : "Ask your EMS training director to set one up."}</p>
        : ruleSet.needsVerification ? <p className="trn-callout warning">The active rule set is marked as not verified.</p> : null}

      {tab === "progress" ? (
        rows.length ? (
          <Section title={`Certification-cycle progress${ruleSet ? ` — ${ruleSet.name} v${ruleSet.version}` : ""}`}>
            <Table rows={rows}
              columns={[{ key: "n", label: "Member", render: (r) => r.p.name }, { key: "level", label: "Level" },
                { key: "cycle", label: "Cycle", render: (r) => (r.cycle ? `${r.cycle.start} – ${r.cycle.end}` : <span className="trn-muted">No NR expiration on profile</span>) },
                ...CE_COMPONENTS.map((c) => ({ key: c.value, label: c.label, render: (r) => { const x = r.progress?.components?.find((y) => y.component === c.value); return x ? `${fmtHours(x.earned)} / ${fmtHours(x.required)}` : "—"; } })),
                { key: "total", label: "Total", render: (r) => (r.progress?.ok ? `${fmtHours(r.progress.totalEarned)} / ${fmtHours(r.progress.totalRequired)}` : "—") },
                { key: "status", label: "Status", render: (r) => (!r.cycle ? <Badge tone="warning">Cycle unknown</Badge> : r.progress?.ok ? <Badge tone={r.progress.complete ? "success" : r.progress.totalEarned ? "info" : "warning"}>{r.progress.complete ? "Complete" : `${fmtHours(r.progress.totalMissing)} h missing`}</Badge> : "—") },
                { key: "x", label: "", render: (r) => <button type="button" className="text-button" onClick={() => transcript(r)}>Transcript</button> }]} />
          </Section>
        ) : <EmptyState title="No EMS-credentialed members found">CE tracking uses each member's EMS level from their personnel profile (EMS credentials or National Registry level).</EmptyState>
      ) : null}

      {tab === "awards" ? (
        <Section title="CE credit entries">
          <Table rows={t.ceAwards.filter((a) => !personId || String(a.personId) === String(personId)).sort((a, b) => String(b.date).localeCompare(String(a.date)))} empty="No CE credit recorded."
            columns={[{ key: "date", label: "Date" }, { key: "personName", label: "Member" }, { key: "courseTitle", label: "Course" }, { key: "component", label: "Component" }, { key: "creditHours", label: "Credit h" }, { key: "approvalNumber", label: "Approval #" }, { key: "createdByName", label: "Entered by" },
              { key: "status", label: "Status", render: (a) => <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge> },
              ...(t.flags.canApproveCe ? [{ key: "x", label: "", render: (a) => (a.status === "pending" ? <div className="trn-actions">
                {a.createdBy !== t.actor.uid ? <button type="button" className="secondary-button" onClick={() => setCeAwardStatus(t.departmentId, a.id, "approved", t.actor).catch((e) => setError(friendlyError(e)))}><ShieldCheck size={13} /> Approve</button> : <span className="trn-muted">Needs another approver</span>}
                <button type="button" className="text-button" onClick={() => { const n = window.prompt("Reason for rejecting"); if (n) setCeAwardStatus(t.departmentId, a.id, "rejected", t.actor, n).catch((e) => setError(friendlyError(e))); }}>Reject</button>
              </div> : a.status === "approved" ? <button type="button" className="text-button" onClick={() => { const n = window.prompt("Reason for voiding this credit"); if (n) setCeAwardStatus(t.departmentId, a.id, "voided", t.actor, n).catch((e) => setError(friendlyError(e))); }}>Void</button> : null) }] : [])]} />
        </Section>
      ) : null}

      {tab === "rules" ? (
        <Section title="CE rule sets" actions={t.flags.canConfigure || t.flags.canApproveCe ? <button type="button" className="primary-button" onClick={() => setRuleEdit({})}><CirclePlus size={14} /> New from NCCP template</button> : null}>
          <Table rows={t.ceRuleSets} onRowClick={t.flags.canConfigure || t.flags.canApproveCe ? setRuleEdit : undefined} empty="No rule sets."
            columns={[{ key: "name", label: "Rule set" }, { key: "framework", label: "Framework" }, { key: "state", label: "State" }, { key: "version", label: "Version" }, { key: "cycleYears", label: "Cycle (yrs)" },
              { key: "v", label: "Verified", render: (r) => (r.needsVerification ? <Badge tone="warning">Not verified</Badge> : <Badge tone="success">{r.verifiedByName || "Verified"}</Badge>) },
              { key: "active", label: "", render: (r) => (r.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) }]} />
        </Section>
      ) : null}
      {adding ? <AwardEditor onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice("CE credit submitted for review."); }} /> : null}
      {ruleEdit ? <RuleSetEditor initial={ruleEdit.id ? ruleEdit : null} onClose={() => setRuleEdit(null)} onSaved={() => { setRuleEdit(null); setNotice("Rule set saved."); }} /> : null}
    </div>
  );
}
