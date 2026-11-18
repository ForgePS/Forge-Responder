import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Field, Kpi, Section, Table, downloadText, fmtHours, stationLabel, todayIso } from "./TrainingUi.jsx";
import { DISCIPLINES, filterRecords, instructorHoursByPerson, personHoursBy, summarize, toCsv, transcriptFor } from "../../lib/training/trainingReports.js";
import { creditedHoursFor, roundHours } from "../../lib/training/trainingHours.js";
import { requestTotal } from "./TrainingRequests.jsx";

const REPORTS = [
  ["discipline", "Hours by discipline"],
  ["station", "Hours by station"],
  ["shift", "Hours by shift"],
  ["rank", "Hours by rank"],
  ["member", "Hours by member"],
  ["transcript", "Member transcript"],
  ["instructors", "Instructor hours"],
  ["courses", "Course delivery"],
  ["compliance", "Compliance by requirement"],
  ["costs", "Outside training costs"],
  ["records", "Record register"],
];

function byParticipant(records, personnel, keyOf) {
  const out = new Map();
  for (const r of records) for (const p of r.participants || []) {
    const h = creditedHoursFor(p, r);
    if (!h) continue;
    const person = personnel.find((x) => String(x.id) === String(p.personId));
    const key = keyOf(p, person) || "Unassigned";
    const prev = out.get(key) || { key, members: new Set(), personHours: 0 };
    prev.members.add(String(p.personId));
    prev.personHours = roundHours(prev.personHours + h);
    out.set(key, prev);
  }
  return [...out.values()].map((x) => ({ key: x.key, members: x.members.size, personHours: x.personHours, avgPerMember: roundHours(x.personHours / x.members.size) })).sort((a, b) => b.personHours - a.personHours);
}

export default function TrainingReports({ compliance, focus = {} }) {
  const t = useTraining();
  const year = todayIso().slice(0, 4);
  const [report, setReport] = useState(() => (REPORTS.some(([id]) => id === focus.report) ? focus.report : "discipline"));
  const [f, setF] = useState({ from: `${year}-01-01`, to: todayIso(), discipline: "", station: "", shift: "", includePending: false, personId: focus.personId ? String(focus.personId) : "" });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const records = useMemo(() => filterRecords(t.records, { ...f, personId: "" }), [t.records, f]);
  const totals = summarize(records);
  const stations = [...new Set(t.records.map((r) => r.stationId).filter(Boolean))].sort();
  const shifts = [...new Set(t.records.map((r) => r.shift).filter(Boolean))].sort();
  const label = REPORTS.find(([id]) => id === report)?.[1];

  const { columns, rows } = useMemo(() => {
    const hcol = (key, l) => ({ key, label: l, render: (r) => fmtHours(r[key]) });
    switch (report) {
      case "discipline": return { columns: [{ key: "key", label: "Discipline" }, { key: "sessions", label: "Sessions" }, hcol("instructionalHours", "Instructional h"), hcol("personHours", "Person-hours")], rows: personHoursBy(records, (r) => r.discipline) };
      case "station": return { columns: [{ key: "key", label: "Station" }, { key: "sessions", label: "Sessions" }, hcol("instructionalHours", "Instructional h"), hcol("personHours", "Person-hours")], rows: personHoursBy(records, (r) => r.stationId) };
      case "shift": return { columns: [{ key: "key", label: "Shift" }, { key: "sessions", label: "Sessions" }, hcol("instructionalHours", "Instructional h"), hcol("personHours", "Person-hours")], rows: personHoursBy(records, (r) => r.shift) };
      case "rank": return { columns: [{ key: "key", label: "Rank" }, { key: "members", label: "Members trained" }, hcol("personHours", "Person-hours"), hcol("avgPerMember", "Avg per member")], rows: byParticipant(records, t.allPersonnel, (p, person) => person?.rank || p.rank) };
      case "member": return { columns: [{ key: "key", label: "Member" }, hcol("personHours", "Hours")], rows: byParticipant(records, t.allPersonnel, (p, person) => person?.name || p.name) };
      case "transcript": {
        if (!f.personId) return { columns: [], rows: [] };
        return { columns: [{ key: "date", label: "Date" }, { key: "title", label: "Training" }, { key: "discipline", label: "Discipline" }, { key: "courseVersion", label: "Course v" }, { key: "attendance", label: "Attendance" }, hcol("creditedHours", "Credited h"), { key: "status", label: "Status" }],
          rows: transcriptFor(f.personId, records).map((r) => ({ ...r, id: r.recordId })) };
      }
      case "instructors": return { columns: [{ key: "name", label: "Instructor" }, { key: "sessions", label: "Sessions taught" }, hcol("hours", "Instructor h")], rows: instructorHoursByPerson(records).map((r) => ({ ...r, id: r.personId || r.name })) };
      case "courses": {
        const m = new Map();
        for (const r of records) {
          const key = r.courseId || `topic:${r.title}`;
          const prev = m.get(key) || { id: key, title: r.title, version: r.courseVersion || "", sessions: 0, attendees: 0, personHours: 0 };
          prev.sessions += 1;
          prev.attendees += (r.participants || []).filter((p) => ["present", "partial"].includes(p.attendance)).length;
          prev.personHours = roundHours(prev.personHours + (r.participants || []).reduce((s, p) => s + creditedHoursFor(p, r), 0));
          m.set(key, prev);
        }
        return { columns: [{ key: "title", label: "Course / topic" }, { key: "version", label: "Version" }, { key: "sessions", label: "Sessions" }, { key: "attendees", label: "Attendances" }, hcol("personHours", "Person-hours")], rows: [...m.values()].sort((a, b) => b.personHours - a.personHours) };
      }
      case "compliance": {
        const m = new Map();
        for (const r of compliance.results) {
          const prev = m.get(r.ruleId) || { id: r.ruleId, name: r.ruleName, compliant: 0, due_soon: 0, overdue: 0, other: 0, total: 0 };
          prev.total += 1;
          if (r.status === "compliant" || r.status === "exempt") prev.compliant += 1;
          else if (r.status === "due_soon") prev.due_soon += 1;
          else if (["overdue", "not_qualified", "non_compliant"].includes(r.status)) prev.overdue += 1;
          else prev.other += 1;
          m.set(r.ruleId, prev);
        }
        return { columns: [{ key: "name", label: "Requirement" }, { key: "total", label: "Members" }, { key: "compliant", label: "Compliant / exempt" }, { key: "due_soon", label: "Due soon" }, { key: "overdue", label: "Overdue / not met" }, { key: "other", label: "Pending / other" }, { key: "pct", label: "%", render: (r) => `${r.total ? Math.round((r.compliant / r.total) * 100) : 0}%` }], rows: [...m.values()] };
      }
      case "costs": {
        const reqs = t.requests.filter((r) => ["approved", "completed"].includes(r.status) && (!f.from || String(r.startDate) >= f.from) && (!f.to || String(r.startDate) <= f.to));
        return { columns: [{ key: "startDate", label: "Date" }, { key: "requesterName", label: "Member" }, { key: "title", label: "Training" }, { key: "provider", label: "Provider" }, { key: "status", label: "Status" }, { key: "estimate", label: "Estimated", render: (r) => `$${r.estimate.toFixed(2)}` }, { key: "reimbursed", label: "Reimbursed", render: (r) => (r.reimbursed ? `$${r.reimbursed.toFixed(2)}` : "—") }],
          rows: reqs.map((r) => ({ ...r, estimate: requestTotal(r), reimbursed: Number(r.completion?.reimbursement) || 0 })) };
      }
      default: return { columns: [{ key: "date", label: "Date" }, { key: "title", label: "Training" }, { key: "discipline", label: "Discipline" }, { key: "stationId", label: "Station" }, { key: "shift", label: "Shift" }, { key: "status", label: "Status" }, hcol("instructionalHours", "Instructional h"), { key: "presentCount", label: "Attended" }, hcol("personHours", "Person-hours")],
        rows: records.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))) };
    }
  }, [report, records, f.personId, f.from, f.to, t.allPersonnel, t.requests, compliance.results]);

  const flat = rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, typeof r[c.key] === "number" ? r[c.key] : c.key === "pct" ? `${r.total ? Math.round((r.compliant / r.total) * 100) : 0}%` : r[c.key] ?? ""])));
  const fileBase = `training-${report}-${f.from || "all"}-${f.to || "now"}`;
  async function exportXlsx() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), label.slice(0, 31));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Report: label, From: f.from, To: f.to, Discipline: f.discipline || "All", Station: f.station || "All", Shift: f.shift || "All", "Includes unapproved": f.includePending ? "Yes" : "No", Generated: new Date().toISOString(), By: t.actor.name }]), "Parameters");
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  }

  return (
    <div className="trn-page trn-report">
      <div className="trn-toolbar trn-no-print">
        <Field label="Report"><select value={report} onChange={(e) => setReport(e.target.value)}>{REPORTS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Field>
        <Field label="From"><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
        <Field label="To"><input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
        <Field label="Discipline"><select value={f.discipline} onChange={(e) => set({ discipline: e.target.value })}><option value="">All</option>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Station"><select value={f.station} onChange={(e) => set({ station: e.target.value })}><option value="">All</option>{stations.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Shift"><select value={f.shift} onChange={(e) => set({ shift: e.target.value })}><option value="">All</option>{shifts.map((s) => <option key={s}>{s}</option>)}</select></Field>
        {report === "transcript" ? <Field label="Member"><select value={f.personId} onChange={(e) => set({ personId: e.target.value })}><option value="">Choose…</option>{t.allPersonnel.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field> : null}
        <label className="trn-inline-label"><input type="checkbox" checked={f.includePending} onChange={(e) => set({ includePending: e.target.checked })} /> Include unapproved</label>
      </div>
      <div className="trn-print-head"><h2>{label}</h2><p>{t.departmentName} · {f.from || "start"} to {f.to || "today"}{f.discipline ? ` · ${f.discipline}` : ""}{f.station ? ` · ${stationLabel(f.station)}` : ""}{f.shift ? ` · ${f.shift}` : ""} · {f.includePending ? "includes unapproved records" : "approved records only"}</p></div>
      <div className="inspections-kpi-grid">
        <Kpi label="Sessions" value={totals.sessions} />
        <Kpi label="Instructional hours" value={fmtHours(totals.instructionalHours)} />
        <Kpi label="Person-hours" value={fmtHours(totals.personHours)} />
        <Kpi label="Instructor hours" value={fmtHours(totals.instructorHours)} />
        <Kpi label="Members trained" value={totals.uniqueAttendees} />
      </div>
      <Section title={label} actions={<div className="trn-actions trn-no-print">
        <button type="button" className="secondary-button" disabled={!rows.length} onClick={() => downloadText(`${fileBase}.csv`, toCsv(flat))}><Download size={14} /> CSV</button>
        <button type="button" className="secondary-button" disabled={!rows.length} onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</button>
        <button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
      </div>}>
        {report === "transcript" && !f.personId ? <p className="trn-muted">Choose a member.</p> : <Table rows={rows} rowKey={(r) => r.id || r.key} columns={columns} empty="No data for these filters." />}
      </Section>
      <p className="trn-muted">Person-hours are each attendee's credited hours added together; instructional hours count each session once. Instructor hours are reported separately and never added to attendee totals.</p>
    </div>
  );
}
