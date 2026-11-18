import { useMemo, useState } from "react";
import { Camera, CirclePlus } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, Section, StatusBadge, Table, downloadText, todayIso, Badge } from "./TrainingUi.jsx";
import { COMPLIANCE_STATUSES, REQUIREMENT_KINDS, REQUIREMENT_PERIODS, compliancePercent, memberStatus } from "../../lib/training/trainingCompliance.js";
import { DISCIPLINES, toCsv } from "../../lib/training/trainingReports.js";
import { EMS_LEVELS } from "../../lib/training/trainingCatalog.js";
import { saveComplianceSnapshot, saveRequirement, saveTrainingDoc, TRAINING_COLLECTIONS as C } from "../../lib/training/trainingService.js";
import { useDropdowns } from "../../context/DropdownContext.jsx";
import { friendlyError } from "../../lib/friendlyError.js";

function multi(value, onChange, options, label) {
  return (
    <select multiple size={Math.min(5, Math.max(2, options.length))} value={value || []} onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))} aria-label={label}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function RequirementEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const { getOptions } = useDropdowns();
  const [r, setR] = useState(() => ({ name: "", description: "", kind: "hours", period: "annual", minHours: 24, disciplines: [], courseId: "", equivalentCourseIds: [], skillId: "", credentialName: "", dueSoonDays: 30, rollingDays: 365, dueWithinDays: 90, fiscalStartMonth: 1, effectiveFrom: todayIso(), effectiveTo: "", standardIds: [], appliesTo: {}, active: true, ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p) => setR((x) => ({ ...x, ...p }));
  const ap = (p) => set({ appliesTo: { ...r.appliesTo, ...p } });
  const uniq = (arr) => [...new Set(arr.filter(Boolean).map(String))].sort();
  const ranks = uniq([...getOptions("ranks"), ...t.personnel.map((p) => p.rank)]);
  const stations = uniq([...getOptions("stations"), ...t.personnel.map((p) => p.station)]);
  const shifts = uniq([...getOptions("shifts"), ...t.personnel.map((p) => p.shift)]);
  const positions = uniq([...getOptions("personnelPositions"), ...t.personnel.map((p) => p.position)]);
  const divisions = uniq([...getOptions("divisions"), ...t.personnel.map((p) => p.division)]);
  const teams = uniq([...getOptions("personnelQualifiers"), ...t.personnel.flatMap((p) => p.qualifiers || [])]);
  const credentialNames = uniq(t.certifications.map((c) => c.type));
  async function save() {
    if (!r.name.trim()) { setError("Name the requirement."); return; }
    if (r.kind === "course" && !r.courseId) { setError("Choose the course."); return; }
    if (r.kind === "skill" && !r.skillId) { setError("Choose the skill."); return; }
    if (r.kind === "credential" && !r.credentialName) { setError("Choose the credential."); return; }
    setBusy(true);
    try { await saveRequirement(t.departmentId, { ...r, minHours: Number(r.minHours) || 0, dueSoonDays: Number(r.dueSoonDays) || 0 }, t.actor); onSaved(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial?.id ? `Edit ${r.name} (saves version ${(Number(initial.version) || 1) + 1})` : "New requirement"} onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <div className="trn-grid">
          <Field label="Name" wide><input value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Annual structural firefighting hours" /></Field>
          <Field label="Type"><select value={r.kind} onChange={(e) => set({ kind: e.target.value })}>{REQUIREMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></Field>
          {r.kind !== "credential" ? <Field label="Period"><select value={r.period} onChange={(e) => set({ period: e.target.value })}>{REQUIREMENT_PERIODS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></Field> : null}
          {r.kind !== "credential" && ["annual", "quarterly"].includes(r.period) ? <Field label="Fiscal year starts (month)"><input type="number" min="1" max="12" value={r.fiscalStartMonth} onChange={(e) => set({ fiscalStartMonth: Number(e.target.value) })} /></Field> : null}
          {r.period === "rolling" && r.kind !== "credential" ? <Field label="Window (days)"><input type="number" min="1" value={r.rollingDays} onChange={(e) => set({ rollingDays: Number(e.target.value) })} /></Field> : null}
          {r.period === "once" && r.kind !== "credential" ? <Field label="Due within (days of hire)"><input type="number" min="0" value={r.dueWithinDays} onChange={(e) => set({ dueWithinDays: Number(e.target.value) })} /></Field> : null}
          {r.kind === "hours" ? <><Field label="Minimum hours"><input type="number" min="0" step="0.5" value={r.minHours} onChange={(e) => set({ minHours: e.target.value })} /></Field><Field label="Counting disciplines" hint="None selected = all">{multi(r.disciplines, (v) => set({ disciplines: v }), DISCIPLINES, "Disciplines")}</Field></> : null}
          {r.kind === "course" ? <><Field label="Course"><select value={r.courseId} onChange={(e) => set({ courseId: e.target.value })}><option value="">Choose…</option>{t.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
            <Field label="Approved equivalents"><select multiple size={4} value={r.equivalentCourseIds} onChange={(e) => set({ equivalentCourseIds: [...e.target.selectedOptions].map((o) => o.value) })}>{t.courses.filter((c) => c.id !== r.courseId).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field></> : null}
          {r.kind === "skill" ? <Field label="Skill"><select value={r.skillId} onChange={(e) => set({ skillId: e.target.value })}><option value="">Choose…</option>{t.skills.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field> : null}
          {r.kind === "credential" ? <Field label="Credential (from Certifications)"><select value={r.credentialName} onChange={(e) => set({ credentialName: e.target.value })}><option value="">Choose…</option>{credentialNames.map((n) => <option key={n}>{n}</option>)}</select></Field> : null}
          <Field label="'Due soon' warning (days)"><input type="number" min="0" value={r.dueSoonDays} onChange={(e) => set({ dueSoonDays: e.target.value })} /></Field>
          <Field label="Effective from"><input type="date" value={r.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} /></Field>
          <Field label="Effective to"><input type="date" value={r.effectiveTo} onChange={(e) => set({ effectiveTo: e.target.value })} /></Field>
          <Field label="Standards / policy basis">{multi(r.standardIds, (v) => set({ standardIds: v }), t.standards.map((s) => s.id), "Standards")}</Field>
          <Field label="Description / policy note" wide><textarea rows={2} value={r.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        </div>
        <h4>Applies to (all criteria must match; leave a list empty for everyone)</h4>
        <div className="trn-grid">
          <Field label="Ranks">{multi(r.appliesTo.ranks, (v) => ap({ ranks: v }), ranks, "Ranks")}</Field>
          <Field label="Positions">{multi(r.appliesTo.positions, (v) => ap({ positions: v }), positions, "Positions")}</Field>
          <Field label="Stations">{multi(r.appliesTo.stations, (v) => ap({ stations: v }), stations, "Stations")}</Field>
          <Field label="Shifts">{multi(r.appliesTo.shifts, (v) => ap({ shifts: v }), shifts, "Shifts")}</Field>
          <Field label="Divisions">{multi(r.appliesTo.divisions, (v) => ap({ divisions: v }), divisions, "Divisions")}</Field>
          <Field label="EMS level">{multi(r.appliesTo.emsLevels, (v) => ap({ emsLevels: v }), EMS_LEVELS, "EMS levels")}</Field>
          <Field label="Specialty teams / qualifiers">{multi(r.appliesTo.specialtyTeams, (v) => ap({ specialtyTeams: v }), teams, "Specialty teams")}</Field>
        </div>
        <label className="trn-inline-label"><input type="checkbox" checked={r.active !== false} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}

function ExemptionEditor({ result, onClose }) {
  const t = useTraining();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!reason.trim()) { setError("Enter the reason (e.g. light duty, leave)."); return; }
    setBusy(true);
    try { await saveTrainingDoc(t.departmentId, C.exemptions, { personId: result.personId, ruleId: result.ruleId, ruleVersion: result.ruleVersion, reason, until, status: "active", approvedBy: t.actor.uid, approvedByName: t.actor.name }, t.actor, "EXM"); onClose(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title="Grant exemption" onClose={onClose}>
      <ErrorNote error={error} />
      <p>{result.ruleName} — {t.personnel.find((p) => String(p.id) === String(result.personId))?.name}</p>
      <Field label="Reason" wide><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Field label="Until (optional)"><input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} saveLabel="Grant" />
    </Modal>
  );
}

export default function TrainingCompliance({ compliance, focus }) {
  const t = useTraining();
  const [tab, setTab] = useState("members");
  const [status, setStatus] = useState(focus?.status || "");
  const [personId, setPersonId] = useState(focus?.personId || "");
  const [ruleId, setRuleId] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [exempting, setExempting] = useState(null);
  const [explain, setExplain] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { results, asOf, setAsOf } = compliance;
  const byPerson = useMemo(() => {
    const m = new Map();
    for (const r of results) { if (!m.has(r.personId)) m.set(r.personId, []); m.get(r.personId).push(r); }
    return m;
  }, [results]);
  const memberRows = t.personnel.map((p) => ({ person: p, results: (byPerson.get(String(p.id)) || []).filter((r) => r.status !== "not_applicable") }))
    .map((x) => ({ ...x, id: x.person.id, status: memberStatus(x.results) }))
    .filter((x) => (!status || x.results.some((r) => r.status === status || (status === "overdue" && r.status === "not_qualified"))) && (!personId || String(x.id) === String(personId))
      && (!q || [x.person.name, x.person.rank, x.person.station].join(" ").toLowerCase().includes(q.toLowerCase())));
  const detailRows = results.filter((r) => r.status !== "not_applicable" && (!status || r.status === status) && (!personId || String(r.personId) === String(personId)) && (!ruleId || r.ruleId === ruleId));
  const pct = compliancePercent(results);
  const name = (pid) => t.personnel.find((p) => String(p.id) === String(pid))?.name || pid;

  async function snapshot() {
    setError("");
    try { const id = await saveComplianceSnapshot(t.departmentId, { asOf, results }, t.actor); setNotice(`Snapshot ${id} saved. It keeps these results and rule versions permanently.`); } catch (e) { setError(friendlyError(e)); }
  }
  function exportCsv() {
    downloadText(`training-compliance-${asOf}.csv`, toCsv(detailRows.map((r) => ({ Member: name(r.personId), "Personnel ID": r.personId, Requirement: r.ruleName, "Rule version": r.ruleVersion, Status: COMPLIANCE_STATUSES[r.status]?.label, Required: r.required ?? "", Earned: r.earned ?? "", Pending: r.pending ?? "", "Period start": r.period?.start || "", "Period end": r.period?.end || "", Explanation: r.explanation }))));
  }

  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <ErrorNote error={error} onClose={() => setError("")} />
      <p className="trn-muted">Compliance is calculated from approved training records, approved skills evaluations, Forge Academy completions and the Certifications list, against your department's requirement rules. It is not a regulatory determination.</p>
      <div className="trn-toolbar">
        <div className="segmented-control">
          {[["members", "By member"], ["detail", "All results"], ["rules", `Requirements (${t.requirements.length})`], ["exemptions", "Exemptions"]].map(([id, l]) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{l}</button>)}
        </div>
        <div className="trn-actions">
          <label className="trn-inline-label">As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || todayIso())} /></label>
          <strong>{pct === null ? "—" : `${pct}% compliant`}</strong>
          {t.flags.canConfigure || t.flags.canApprove ? <button type="button" className="secondary-button" onClick={snapshot} disabled={!results.length}><Camera size={14} /> Save snapshot</button> : null}
          <button type="button" className="secondary-button" onClick={exportCsv} disabled={!detailRows.length}>Export CSV</button>
        </div>
      </div>
      {tab !== "rules" && tab !== "exemptions" ? (
        <div className="trn-filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" aria-label="Search members" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option>{Object.entries(COMPLIANCE_STATUSES).filter(([k]) => k !== "not_applicable").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Member"><option value="">All members</option>{t.personnel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {tab === "detail" ? <select value={ruleId} onChange={(e) => setRuleId(e.target.value)} aria-label="Requirement"><option value="">All requirements</option>{t.requirements.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select> : null}
        </div>
      ) : null}

      {!t.requirements.length && tab !== "rules" ? <EmptyState title="No requirements set up" action={t.flags.canConfigure ? <button type="button" className="primary-button" onClick={() => { setTab("rules"); setEditing({}); }}>Add a requirement</button> : null}>Requirements define what each member must complete (hours, courses, skills or current credentials) and for whom.</EmptyState> : null}

      {tab === "members" && t.requirements.length ? (
        <Section title="Members">
          <Table rows={memberRows} onRowClick={(x) => { setPersonId(String(x.id)); setTab("detail"); }}
            columns={[{ key: "name", label: "Member", render: (x) => x.person.name }, { key: "rank", label: "Rank", render: (x) => x.person.rank }, { key: "station", label: "Station", render: (x) => x.person.station },
              { key: "met", label: "Met", render: (x) => `${x.results.filter((r) => ["compliant", "exempt"].includes(r.status)).length} / ${x.results.length}` },
              { key: "status", label: "Overall", render: (x) => <StatusBadge kind="compliance" status={x.status} /> }]} />
        </Section>
      ) : null}
      {tab === "detail" && t.requirements.length ? (
        <Section title="Results">
          <Table rows={detailRows} rowKey={(r) => `${r.personId}|${r.ruleId}`} onRowClick={setExplain} empty="No results match."
            columns={[{ key: "p", label: "Member", render: (r) => name(r.personId) }, { key: "ruleName", label: "Requirement" },
              { key: "prog", label: "Progress", render: (r) => (r.required != null && r.unit === "hours" ? `${r.earned} / ${r.required} h${r.pending ? ` (+${r.pending} awaiting approval)` : ""}` : r.status === "compliant" ? "Done" : r.pending ? "Awaiting approval" : "—") },
              { key: "due", label: "Period", render: (r) => (r.period ? `${r.period.start} – ${r.period.end === "9999-12-31" ? "open" : r.period.end}` : "—") },
              { key: "status", label: "Status", render: (r) => <StatusBadge kind="compliance" status={r.status} /> }]} />
        </Section>
      ) : null}
      {tab === "rules" ? (
        <Section title="Requirement rules" actions={t.flags.canConfigure ? <button type="button" className="primary-button" onClick={() => setEditing({})}><CirclePlus size={14} /> New requirement</button> : null}>
          <Table rows={t.requirements} onRowClick={t.flags.canConfigure ? setEditing : undefined} empty="No requirements yet."
            columns={[{ key: "name", label: "Requirement" }, { key: "kind", label: "Type", render: (r) => REQUIREMENT_KINDS.find((k) => k.value === r.kind)?.label }, { key: "period", label: "Period", render: (r) => (r.kind === "credential" ? "Continuous" : REQUIREMENT_PERIODS.find((k) => k.value === r.period)?.label) },
              { key: "target", label: "Target", render: (r) => (r.kind === "hours" ? `${r.minHours} h${r.disciplines?.length ? ` (${r.disciplines.join(", ")})` : ""}` : r.kind === "course" ? t.courses.find((c) => c.id === r.courseId)?.title : r.kind === "skill" ? t.skills.find((s) => s.id === r.skillId)?.title : r.credentialName) },
              { key: "version", label: "Version" }, { key: "eff", label: "Effective", render: (r) => `${r.effectiveFrom || "—"}${r.effectiveTo ? ` → ${r.effectiveTo}` : ""}` },
              { key: "active", label: "", render: (r) => (r.active === false ? <Badge>Inactive</Badge> : <Badge tone="success">Active</Badge>) }]} />
        </Section>
      ) : null}
      {tab === "exemptions" ? (
        <Section title="Exemptions">
          <Table rows={t.exemptions} empty="No exemptions."
            columns={[{ key: "p", label: "Member", render: (x) => name(x.personId) }, { key: "r", label: "Requirement", render: (x) => t.requirements.find((r) => r.id === x.ruleId)?.name || x.ruleId }, { key: "reason", label: "Reason" }, { key: "until", label: "Until" }, { key: "approvedByName", label: "Approved by" },
              { key: "status", label: "Status", render: (x) => (x.status === "revoked" ? <Badge tone="critical">Revoked</Badge> : <Badge tone="info">Active</Badge>) },
              ...(t.flags.canConfigure ? [{ key: "x", label: "", render: (x) => (x.status !== "revoked" ? <button type="button" className="text-button" onClick={() => saveTrainingDoc(t.departmentId, C.exemptions, { ...x, status: "revoked", revokedAt: new Date().toISOString() }, t.actor).catch((e) => setError(friendlyError(e)))}>Revoke</button> : null) }] : [])]} />
        </Section>
      ) : null}

      {explain ? (
        <Modal title={`${explain.ruleName} — ${name(explain.personId)}`} onClose={() => setExplain(null)}>
          <p><StatusBadge kind="compliance" status={explain.status} /> {explain.explanation}</p>
          <p className="trn-muted">Rule version {explain.ruleVersion} · as of {explain.asOf}{explain.period ? ` · period ${explain.period.start} – ${explain.period.end}` : ""}</p>
          <h4>Evidence counted</h4>
          <Table rows={explain.evidence || []} rowKey={(e) => `${e.type}${e.id}`} empty="No verified evidence in this period."
            columns={[{ key: "type", label: "Type" }, { key: "title", label: "Item" }, { key: "date", label: "Date" }, { key: "hours", label: "Hours" }]} />
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setExplain(null)}>Close</button>
            {t.flags.canConfigure && explain.status !== "exempt" ? <button type="button" className="secondary-button" onClick={() => { setExempting(explain); setExplain(null); }}>Grant exemption</button> : null}
          </div>
        </Modal>
      ) : null}
      {editing ? <RequirementEditor initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice("Requirement saved; results recalculated."); }} /> : null}
      {exempting ? <ExemptionEditor result={exempting} onClose={() => setExempting(null)} /> : null}
    </div>
  );
}
