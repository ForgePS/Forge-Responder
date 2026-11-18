import { useMemo, useState } from "react";
import { ClipboardPlus } from "lucide-react";
import { TrainingContext, useTrainingData } from "../components/training/useTrainingData.js";
import { ErrorNote, Notice, todayIso } from "../components/training/TrainingUi.jsx";
import TrainingDashboard from "../components/training/TrainingDashboard.jsx";
import TrainingCalendar from "../components/training/TrainingCalendar.jsx";
import TrainingRecords, { RecordEditor } from "../components/training/TrainingRecords.jsx";
import TrainingCourses from "../components/training/TrainingCourses.jsx";
import TrainingOnline from "../components/training/TrainingOnline.jsx";
import TrainingSkills from "../components/training/TrainingSkills.jsx";
import TrainingCertifications from "../components/training/TrainingCertifications.jsx";
import TrainingCe from "../components/training/TrainingCe.jsx";
import TrainingTaskBooks from "../components/training/TrainingTaskBooks.jsx";
import TrainingRequests from "../components/training/TrainingRequests.jsx";
import TrainingResources from "../components/training/TrainingResources.jsx";
import TrainingCompliance from "../components/training/TrainingCompliance.jsx";
import TrainingReports from "../components/training/TrainingReports.jsx";
import TrainingAdmin from "../components/training/TrainingAdmin.jsx";
import LegacyTrainingLog from "./LegacyTrainingLog.jsx";
import { buildEvidence, memberFromPersonnel } from "../lib/training/trainingEvidence.js";
import { evaluateCompliance } from "../lib/training/trainingCompliance.js";
import { resolvePersonEmsLevel } from "../lib/personnelEmsCredentials.js";
import { buildDayScheduleSnapshot } from "../lib/schedulingRoster.js";
import "../styles/training.css";

export const TRAINING_TABS = [
  ["dashboard", "Dashboard"],
  ["calendar", "Calendar"],
  ["records", "Records"],
  ["courses", "Courses & Lesson Plans"],
  ["online", "Online Learning"],
  ["skills", "Skills & Evaluations"],
  ["certifications", "Certifications & Qualifications"],
  ["ce", "EMS CE"],
  ["taskbooks", "Programs & Task Books"],
  ["requests", "Requests"],
  ["resources", "Facilities & Resources"],
  ["compliance", "Compliance"],
  ["reports", "Reports & Analytics"],
  ["admin", "Administration"],
];

/** Personnel on duty for the current duty day (for "add on-duty crew"; never marks attendance). */
function useOnDutyIds(scheduling, personnel) {
  return useMemo(() => {
    if (!scheduling?.dutyDayId) return [];
    try {
      const snap = buildDayScheduleSnapshot({ ...scheduling, dayId: scheduling.dutyDayId, personnel });
      return [...new Set((snap.roster || []).filter((r) => r.personnelId && !/leave/i.test(String(r.status || ""))).map((r) => String(r.personnelId)))];
    } catch (error) {
      console.warn("Training: couldn't build today's roster", error);
      return [];
    }
  }, [scheduling, personnel]);
}

function TrainingModule({ tab, setTab, focus, go, legacy, onNavigate, onDutyIds }) {
  const t = useTrainingData({ personnel: legacy.personnel, certifications: legacy.certifications, legacyTraining: legacy.records });
  const [asOf, setAsOf] = useState(todayIso());
  const [logging, setLogging] = useState(false);
  const [notice, setNotice] = useState("");

  const results = useMemo(() => {
    const rules = t.requirements.filter((r) => r.active !== false);
    if (!rules.length) return [];
    // Members without reviewer access only see their own evidence, so only their own status is computed.
    const people = t.flags.canReview || t.flags.canApprove ? t.personnel : t.personnel.filter((p) => String(p.id) === String(t.myPersonId));
    const members = people.map((p) => memberFromPersonnel(p, resolvePersonEmsLevel));
    const evidence = buildEvidence({ records: t.records, evaluations: t.evaluations, certifications: t.certifications, personnel: t.allPersonnel, legacyTraining: t.legacyTraining, exemptions: t.exemptions, courses: t.courses });
    return evaluateCompliance({ rules, members, evidence, asOf });
  }, [t.requirements, t.personnel, t.allPersonnel, t.records, t.evaluations, t.certifications, t.legacyTraining, t.exemptions, t.courses, t.flags, t.myPersonId, asOf]);
  const compliance = useMemo(() => ({ results, asOf, setAsOf }), [results, asOf]);

  if (!t.flags.canView) return <ErrorNote error="You don't have access to training. Ask your training officer for the View training permission." />;
  const loadErrors = Object.keys(t.errors || {});

  const legacyLog = <LegacyTrainingLog query={legacy.query || ""} records={legacy.records} setRecords={legacy.setRecords} canEdit={legacy.canEditLegacy} />;
  const body = {
    dashboard: <TrainingDashboard go={go} compliance={compliance} />,
    calendar: <TrainingCalendar focus={focus} />,
    records: <TrainingRecords initialFilter={focus?.filter || "all"} focus={focus} onDutyIds={onDutyIds} />,
    courses: <TrainingCourses />,
    online: <TrainingOnline onOpenAcademySettings={onNavigate ? () => onNavigate("Admin Console") : undefined} />,
    skills: <TrainingSkills focus={focus} />,
    certifications: <TrainingCertifications go={go} compliance={compliance} onOpenCertifications={onNavigate ? () => onNavigate("Certifications") : undefined} />,
    ce: <TrainingCe />,
    taskbooks: <TrainingTaskBooks />,
    requests: <TrainingRequests />,
    resources: <TrainingResources />,
    compliance: <TrainingCompliance compliance={compliance} focus={focus} />,
    reports: <TrainingReports compliance={compliance} focus={focus || {}} key={JSON.stringify(focus || {})} />,
    admin: <TrainingAdmin legacyLog={t.flags.canConfigure || legacy.canEditLegacy ? legacyLog : null} />,
  }[tab];

  return (
    <TrainingContext.Provider value={t}>
      <div className="inspections-module trn-module">
        <header className="inspections-module-header">
          <div>
            <h2 id="trn-title">Training</h2>
            <p>Records, scheduling, courses, skills, certifications, EMS CE, task books and compliance.</p>
          </div>
          {t.flags.canEdit ? <button type="button" className="primary-button" onClick={() => setLogging(true)}><ClipboardPlus size={15} /> Log training</button> : null}
        </header>
        <nav className="inspections-subnav trn-subnav" aria-label="Training module" aria-describedby="trn-title">
          {TRAINING_TABS.map(([id, label]) => (
            <button key={id} type="button" className={`inspections-subnav-item${tab === id ? " active" : ""}`} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <Notice message={notice} onClose={() => setNotice("")} />
        {loadErrors.length ? <ErrorNote error={`Some training data couldn't be loaded (${loadErrors.join(", ")}). What you see may be incomplete.`} /> : null}
        <div className="inspections-module-body" role="main" aria-labelledby="trn-title">{body}</div>
        {logging ? <RecordEditor onDutyIds={onDutyIds} onClose={() => setLogging(false)} onSaved={(_, submitted) => { setLogging(false); setNotice(submitted ? "Training submitted for approval." : "Draft saved."); }} /> : null}
      </div>
    </TrainingContext.Provider>
  );
}

export default function TrainingPage({ query = "", records = [], setRecords, canEdit = false, personnel = [], certifications = [], scheduling = null, onNavigate }) {
  const [tab, setTabState] = useState("dashboard");
  const [focus, setFocus] = useState(null);
  const setTab = (id) => { setTabState(id); setFocus(null); };
  const go = (id, f = {}) => { setTabState(id); setFocus(f); };
  const onDutyIds = useOnDutyIds(scheduling, personnel);
  const legacy = { query, records: Array.isArray(records) ? records : [], setRecords, canEditLegacy: canEdit, personnel, certifications };
  return <TrainingModule tab={tab} setTab={setTab} focus={focus} go={go} legacy={legacy} onNavigate={onNavigate} onDutyIds={onDutyIds} />;
}
