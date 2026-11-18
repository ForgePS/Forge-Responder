import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Badge, EmptyState, ErrorNote, Section, Table } from "./TrainingUi.jsx";
import { listMyAcademyTraining } from "../../lib/academyIntegrations.js";
import { friendlyError } from "../../lib/friendlyError.js";

/**
 * Online learning is delivered by Forge Academy (the department's connected LMS),
 * which owns enrollment, content and exam grading on its server. This tab shows a
 * member's Academy enrollments and the completions the Academy sync has written
 * back, and how they count toward requirements. Exams are never graded in the browser.
 */
export default function TrainingOnline({ onOpenAcademySettings }) {
  const t = useTraining();
  const [mine, setMine] = useState({ loading: false, rows: [], message: "" });
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const me = t.me;

  async function load() {
    if (!me?.id) { setMine({ loading: false, rows: [], message: "Your login isn't linked to a personnel record." }); return; }
    if (!me.forgePersonId) { setMine({ loading: false, rows: [], message: "Your personnel record isn't linked to a Forge Academy student yet. An administrator links it under Settings → Academy." }); return; }
    setMine((m) => ({ ...m, loading: true }));
    setError("");
    try {
      const result = await listMyAcademyTraining(t.departmentId, { personnelId: me.id, forgePersonId: me.forgePersonId });
      setMine({ loading: false, rows: Array.isArray(result?.training) ? result.training : [], message: result?.message || "" });
    } catch (e) {
      setMine({ loading: false, rows: [], message: "" });
      setError(friendlyError(e, "Couldn't reach Forge Academy."));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [t.departmentId, me?.id, me?.forgePersonId]);

  const synced = useMemo(() => t.legacyTraining.filter((i) => i && (i.source === "forge_academy" || i.registrationId)), [t.legacyTraining]);
  const visibleSynced = (t.flags.canReview ? synced : synced.filter((i) => String(i.personnelId) === String(t.myPersonId)))
    .filter((i) => !q || [i.course, i.members, i.courseNumber].join(" ").toLowerCase().includes(q.toLowerCase()));
  const completed = visibleSynced.filter((i) => /complete/i.test(String(i.status || "")));
  const courseRules = t.requirements.filter((r) => r.kind === "course" && r.active !== false);

  return (
    <div className="trn-page">
      <p className="trn-muted">Online courses, quizzes and exams run in Forge Academy, which grades them on its server. Completed Academy courses count toward course requirements here automatically once they sync.</p>
      <ErrorNote error={error} onClose={() => setError("")} />
      <Section title="My Academy courses" actions={<button type="button" className="secondary-button" onClick={load} disabled={mine.loading}><RefreshCw size={14} /> {mine.loading ? "Loading…" : "Refresh"}</button>}>
        {mine.rows.length ? (
          <Table rows={mine.rows}
            columns={[{ key: "course", label: "Course" }, { key: "courseNumber", label: "Number" }, { key: "date", label: "Starts" }, { key: "endDate", label: "Ends" },
              { key: "completion", label: "Progress", render: (r) => <div className="trn-progress small"><div style={{ width: `${Math.min(100, Number(r.completion) || 0)}%` }} /><span>{Number(r.completion) || 0}%</span></div> },
              { key: "status", label: "Status", render: (r) => <Badge tone={/complete/i.test(r.status) ? "success" : "info"}>{r.status}</Badge> }]} />
        ) : <p className="trn-muted">{mine.loading ? "Loading…" : mine.message || "No Academy enrollments."}</p>}
      </Section>
      <Section title={t.flags.canReview ? "Academy completions (department)" : "My synced completions"}
        actions={<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search Academy completions" />}>
        {visibleSynced.length ? (
          <Table rows={visibleSynced}
            columns={[{ key: "members", label: "Member" }, { key: "course", label: "Course" }, { key: "courseNumber", label: "Number" }, { key: "endDate", label: "Completed", render: (i) => i.endDate || i.date || "—" }, { key: "hours", label: "Hours", render: (i) => i.hours || "—" },
              { key: "status", label: "Status", render: (i) => <Badge tone={/complete/i.test(i.status) ? "success" : "info"}>{i.status}</Badge> },
              { key: "linked", label: "Counts toward", render: (i) => courseRules.filter((r) => String(r.courseId) === String(i.courseNumber || i.classId)).map((r) => r.name).join(", ") || "—" }]} />
        ) : <EmptyState title="No Academy activity yet">{t.flags.canConfigure ? "Connect Forge Academy and link members to see online completions here." : "Your completed online courses will appear here."}</EmptyState>}
        {completed.length && t.flags.canReview ? <p className="trn-muted">{completed.length} completion{completed.length === 1 ? "" : "s"} available as evidence. To count one toward a course requirement, set the requirement's course to the Academy course number.</p> : null}
      </Section>
      {t.flags.canConfigure && onOpenAcademySettings ? <button type="button" className="secondary-button" onClick={onOpenAcademySettings}><ExternalLink size={14} /> Academy connection settings</button> : null}
    </div>
  );
}
