import { useMemo } from "react";
import { useTraining } from "./useTrainingData.js";
import { EmptyState, Kpi, Section, StatusBadge, Table, fmtHours, shiftLabel, stationLabel, todayIso } from "./TrainingUi.jsx";
import { DISCIPLINES, filterRecords, personHoursBy, summarize, transcriptFor, windows } from "../../lib/training/trainingReports.js";
import { compliancePercent } from "../../lib/training/trainingCompliance.js";
import { taskBookProgress } from "../../lib/training/trainingReports.js";

const DISCIPLINE_CARDS = ["Fire", "EMS", "HazMat", "Rescue", "Driver/Operator", "Officer Development", "Instructor"];

export default function TrainingDashboard({ go, compliance }) {
  const t = useTraining();
  const today = todayIso();
  const w = windows(today);
  const verified = useMemo(() => filterRecords(t.records, {}), [t.records]);
  const ytd = useMemo(() => filterRecords(t.records, { from: w.year.from, to: today }), [t.records, w.year.from, today]);
  const ytdSum = summarize(ytd);
  const counts = Object.fromEntries(Object.entries(w).map(([k, r]) => [k, summarize(filterRecords(t.records, r))]));
  const byDiscipline = Object.fromEntries(personHoursBy(ytd, (r) => r.discipline || "Other").map((x) => [x.key, x]));
  const pending = t.records.filter((r) => r.status === "submitted");
  const returned = t.records.filter((r) => r.status === "returned");
  const staleCutoff = new Date(Date.now() - (Number(t.settings.recordReminderDays) || 3) * 86400000).toISOString();
  const staleDrafts = t.records.filter((r) => r.status === "draft" && String(r.updatedAt || r.createdAt) < staleCutoff);
  const noDocs = t.records.filter((r) => ["submitted", "approved", "locked"].includes(r.status) && !(r.evidence || []).length);
  const upcoming = t.sessions.filter((s) => s.status !== "cancelled" && s.date >= today).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const certSoon = t.certifications.filter((c) => typeof c.days === "number" ? c.days <= 60 : ["Expired", "Due Soon"].includes(c.status));
  const overdue = compliance.results.filter((r) => r.status === "overdue" || r.status === "not_qualified");
  const dueSoon = compliance.results.filter((r) => r.status === "due_soon");
  const pct = compliancePercent(compliance.results);
  const evalsPending = t.evaluations.filter((e) => e.status === "submitted");
  const evalFails = t.evaluations.filter((e) => e.result === "fail");
  const ceePending = t.ceAwards.filter((a) => a.status === "pending");
  const requestsPending = t.requests.filter((r) => r.status === "submitted");
  const approvedCosts = t.requests.filter((r) => ["approved", "completed"].includes(r.status) && String(r.startDate || "").slice(0, 4) === today.slice(0, 4))
    .reduce((s, r) => s + (Number(r.costs?.tuition) || 0) + (Number(r.costs?.travel) || 0) + (Number(r.costs?.lodging) || 0) + (Number(r.costs?.meals) || 0), 0);
  const probation = t.taskBookAssignments.filter((a) => a.status !== "authorized" && a.status !== "withdrawn");
  const byStation = personHoursBy(ytd, (r) => stationLabel(r.stationId)).slice(0, 8);
  const byShift = personHoursBy(ytd, (r) => shiftLabel(r.shift)).slice(0, 8);

  const mine = transcriptFor(t.myPersonId, verified).filter((r) => r.date >= w.year.from);
  const myHours = mine.reduce((s, r) => s + r.creditedHours, 0);
  const myResults = compliance.results.filter((r) => String(r.personId) === String(t.myPersonId) && r.status !== "not_applicable");
  const myUpcoming = upcoming.filter((s) => t.myEnrollments[s.id] && t.myEnrollments[s.id].status !== "cancelled").slice(0, 5);

  const reviewer = t.flags.canReview || t.flags.canEdit;

  return (
    <div className="trn-page">
      {t.myPersonId ? (
        <Section title="My training">
          <div className="inspections-kpi-grid">
            <Kpi label="My hours this year" value={fmtHours(myHours)} hint="Approved records" onClick={() => go("reports", { report: "transcript", personId: t.myPersonId })} />
            <Kpi label="My requirements met" value={myResults.length ? `${myResults.filter((r) => ["compliant", "exempt"].includes(r.status)).length} / ${myResults.length}` : "—"} onClick={() => go("compliance", { personId: t.myPersonId })} />
            <Kpi label="My overdue items" value={myResults.filter((r) => ["overdue", "not_qualified"].includes(r.status)).length} tone={myResults.some((r) => r.status === "overdue") ? "critical" : undefined} onClick={() => go("compliance", { personId: t.myPersonId })} />
            <Kpi label="My upcoming classes" value={myUpcoming.length} onClick={() => go("calendar", { mine: true })} />
          </div>
        </Section>
      ) : <p className="trn-callout">Your login isn't linked to a personnel record, so your own training can't be shown. An administrator can link it in User Management.</p>}

      {reviewer ? (
        <>
          <Section title={`Department training — ${today.slice(0, 4)} to date`}>
            {!t.records.length ? <EmptyState title="No training records yet">Once officers log training and it's approved, totals appear here. Only approved records count toward hours and compliance.</EmptyState> : null}
            <div className="inspections-kpi-grid">
              <Kpi label="Training sessions" value={ytdSum.sessions} hint="Approved, this year" onClick={() => go("records", { filter: "approved", from: w.year.from, to: today })} />
              <Kpi label="Instructional hours" value={fmtHours(ytdSum.instructionalHours)} hint="Class time, once per session" onClick={() => go("reports", { report: "discipline" })} />
              <Kpi label="Personnel training hours" value={fmtHours(ytdSum.personHours)} hint="Person-hours" onClick={() => go("reports", { report: "discipline" })} />
              <Kpi label="Instructor hours" value={fmtHours(ytdSum.instructorHours)} onClick={() => go("reports", { report: "instructors" })} />
              <Kpi label="Members trained" value={ytdSum.uniqueAttendees} onClick={() => go("reports", { report: "member" })} />
              <Kpi label="Compliance" value={pct === null ? "—" : `${pct}%`} hint={pct === null ? "No requirements set up" : "Of applicable requirements"} tone={pct !== null && pct < 85 ? "warning" : undefined} onClick={() => go("compliance", {})} />
            </div>
            <div className="trn-period-strip">
              {Object.entries(w).map(([k, r]) => (
                <button key={k} type="button" className="trn-period" onClick={() => go("records", { filter: "approved", from: r.from, to: r.to })}>
                  <span>{r.label}</span><strong>{counts[k].sessions}</strong><small>{fmtHours(counts[k].personHours)} person-h</small>
                </button>
              ))}
            </div>
            <h4 className="trn-h4">Person-hours by discipline</h4>
            <div className="inspections-kpi-grid">
              {DISCIPLINE_CARDS.map((d) => <Kpi key={d} label={d} value={fmtHours(byDiscipline[d]?.personHours || 0)} hint={`${byDiscipline[d]?.sessions || 0} sessions`} onClick={() => go("records", { filter: "approved", discipline: d, from: w.year.from, to: today })} />)}
            </div>
          </Section>

          <Section title="Needs attention">
            <div className="inspections-kpi-grid">
              <Kpi label="Pending approvals" value={pending.length} tone={pending.length ? "warning" : undefined} onClick={() => go("records", { filter: "submitted" })} />
              <Kpi label="Returned records" value={returned.length} onClick={() => go("records", { filter: "returned" })} />
              <Kpi label="Unsubmitted drafts" value={staleDrafts.length} hint={`Older than ${Number(t.settings.recordReminderDays) || 3} days`} onClick={() => go("records", { filter: "draft" })} />
              <Kpi label="Missing documentation" value={noDocs.length} hint="No attachment" onClick={() => go("records", { filter: "noEvidence" })} />
              <Kpi label="Overdue / not qualified" value={overdue.length} tone={overdue.length ? "critical" : undefined} onClick={() => go("compliance", { status: "overdue" })} />
              <Kpi label="Due soon" value={dueSoon.length} onClick={() => go("compliance", { status: "due_soon" })} />
              <Kpi label="Certifications expiring ≤60 days" value={certSoon.length} onClick={() => go("certifications", {})} />
              <Kpi label="Evaluations to approve" value={evalsPending.length} onClick={() => go("skills", { tab: "evaluations" })} />
              <Kpi label="CE credit to review" value={ceePending.length} onClick={() => go("ce", {})} />
              <Kpi label="Training requests" value={requestsPending.length} onClick={() => go("requests", {})} />
            </div>
          </Section>

          <div className="trn-two">
            <Section title="Upcoming training">
              <Table rows={upcoming.slice(0, 8)} empty="Nothing scheduled." onRowClick={() => go("calendar", {})}
                columns={[{ key: "date", label: "Date" }, { key: "startTime", label: "Time" }, { key: "title", label: "Session" }, { key: "location", label: "Location" }]} />
            </Section>
            <Section title="Probationary & task book progress">
              <Table rows={probation.slice(0, 8)} empty="No open task books." onRowClick={() => go("taskbooks", {})}
                columns={[
                  { key: "personName", label: "Member" },
                  { key: "taskBookName", label: "Program" },
                  { key: "p", label: "Progress", render: (a) => `${taskBookProgress(a, t).percent}%` },
                  { key: "dueDate", label: "Due" },
                ]} />
            </Section>
            <Section title="Station comparison (person-hours, this year)">
              <Table rows={byStation} rowKey={(r) => r.key} empty="No station data on approved records."
                columns={[{ key: "key", label: "Station" }, { key: "sessions", label: "Sessions" }, { key: "personHours", label: "Person-h", render: (r) => fmtHours(r.personHours) }]} />
            </Section>
            <Section title="Shift comparison (person-hours, this year)">
              <Table rows={byShift} rowKey={(r) => r.key} empty="No shift data on approved records."
                columns={[{ key: "key", label: "Shift" }, { key: "sessions", label: "Sessions" }, { key: "personHours", label: "Person-h", render: (r) => fmtHours(r.personHours) }]} />
            </Section>
            <Section title="Skills evaluations">
              <div className="inspections-kpi-grid">
                <Kpi label="Passed" value={t.evaluations.filter((e) => e.result === "pass").length} onClick={() => go("skills", { tab: "evaluations" })} />
                <Kpi label="Unsuccessful" value={evalFails.length} tone={evalFails.length ? "warning" : undefined} onClick={() => go("skills", { tab: "evaluations" })} />
              </div>
            </Section>
            <Section title="External training costs">
              <div className="inspections-kpi-grid">
                <Kpi label={`Approved this year`} value={approvedCosts.toLocaleString(undefined, { style: "currency", currency: "USD" })} hint="From approved requests" onClick={() => go("reports", { report: "costs" })} />
              </div>
            </Section>
          </div>
        </>
      ) : null}

      {!reviewer && myUpcoming.length ? (
        <Section title="My upcoming classes">
          <Table rows={myUpcoming} columns={[{ key: "date", label: "Date" }, { key: "startTime", label: "Time" }, { key: "title", label: "Session" }, { key: "status", label: "Status", render: (s) => <StatusBadge status={s.status} /> }]} />
        </Section>
      ) : null}
    </div>
  );
}
