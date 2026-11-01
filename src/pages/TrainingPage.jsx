import { useState } from "react";
import { BookOpen, CalendarDays, Check, ShieldCheck, Trash2, X, CirclePlus } from "lucide-react";

import { Badge, Panel, trainingCompliancePercent, Modal } from "../components/shell/ui.jsx";
import { displayDate, todayIsoDate, uniqueRecordId } from "../lib/recordIds.js";
import { exportCsv } from "../utils/dashboardMetrics.js";

const TRAINING_CATEGORIES = ["Fire", "EMS CE", "Driver", "Officer"];
const blankTraining = () => ({ course: "", category: "Fire", date: todayIsoDate(), instructor: "", hours: "2", capacity: "12", notes: "" });

export default function TrainingPage({ query, records = [], setRecords, canEdit = false }) {
  const safeRecords = Array.isArray(records) ? records : [];
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(blankTraining);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const visibleRecords = safeRecords.filter((record) => {
    const matchesFilter = filter === "All" || record.category === filter || record.status === filter;
    const matchesQuery = Object.values(record).join(" ").toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });
  const averageCompletion = trainingCompliancePercent(safeRecords);
  const completedHours = safeRecords.filter((record) => record.status === "Complete").reduce((sum, record) => sum + Number(record.hours || 0), 0);
  const upcoming = safeRecords.filter((record) => ["Scheduled", "In Progress"].includes(record.status)).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 6);
  const complianceQueue = safeRecords.filter((record) => ["Overdue", "Needs Documentation", "Expired"].includes(record.status));

  function updateRecord(id, patch) {
    if (!canEdit || !setRecords) return;
    setRecords((current) => current.map((record) => record.id === id ? { ...record, ...patch, updated_at: new Date().toISOString() } : record));
  }

  function addTraining() {
    if (!canEdit || !setRecords) return;
    const course = form.course.trim();
    if (!course) { setFormError("Enter a class name."); return; }
    if (!form.date) { setFormError("Choose a start date."); return; }
    const next = {
      id: uniqueRecordId("TRN"),
      course,
      category: form.category,
      date: displayDate(form.date),
      endDate: displayDate(form.date),
      instructor: form.instructor.trim(),
      hours: Number(form.hours) || 0,
      attendees: 0,
      capacity: Number(form.capacity) || 0,
      completion: 0,
      expirationDate: "",
      status: "Scheduled",
      members: "All shifts",
      notes: form.notes.trim(),
      created_at: new Date().toISOString(),
    };
    setRecords((current) => [next, ...current]);
    setShowNew(false);
    setForm(blankTraining());
    setFormError("");
    setMessage(`${course} created`);
  }

  function deleteRecord(record) {
    if (!canEdit || !setRecords || !record) return;
    const label = record.course || record.id;
    if (!window.confirm(`Delete training record "${label}"? This cannot be undone.`)) return;
    setRecords((current) => current.filter((item) => item.id !== record.id));
    if (selected?.id === record.id) setSelected(null);
    setMessage(`Deleted ${label}`);
  }

  return <div className="module-page training-page">
    <section className="module-heading"><div><span className="module-icon"><BookOpen size={22} /></span><div><h1>Training</h1><p>Training events, attendance, hours, EMS CE, fire training, and department compliance tracking.</p></div></div><div className="heading-actions"><button className="secondary-button" disabled={!visibleRecords.length} onClick={() => exportCsv(`training-${todayIsoDate()}.csv`, visibleRecords.map((r) => ({ "Training event": r.course, Category: r.category, "Start date": r.date, "End date": r.endDate, Instructor: r.instructor, Hours: r.hours, Attendees: r.attendees, Capacity: r.capacity, "Completion %": r.completion, Status: r.status, Members: r.members, Notes: r.notes })))}>Export Training</button>{canEdit ? <button className="primary-button" onClick={() => setShowNew(true)}><CirclePlus size={14} /> Add Training</button> : null}</div></section>
    <section className="training-hero">
      <div><span>Training Hub</span><h2>Department Training Dashboard</h2><p className="muted">Manage upcoming classes, compliance items, and completion progress from one page.</p></div>
      <div className="training-score"><small>Average Completion</small><strong>{averageCompletion}%</strong></div>
    </section>
    <section className="training-summary">{[["Training Events", safeRecords.length, "info"], ["In Progress", safeRecords.filter((record) => record.status === "In Progress").length, "warning"], ["Overdue", safeRecords.filter((record) => record.status === "Overdue").length, "critical"], ["Completed Hours", completedHours, "success"], ["EMS CE Events", safeRecords.filter((record) => record.category === "EMS CE").length, "info"]].map(([label, value, tone]) => <div key={label} className={`fleet-stat stat-${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</section>
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "Fire", "EMS CE", "Driver", "Officer", "Scheduled", "In Progress", "Overdue", "Complete"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visibleRecords.length} training records shown</span></section>
    <section className="training-workspace">
      <Panel title="Active And Upcoming Classes" icon={CalendarDays} action={<span className="panel-count">{upcoming.length} scheduled</span>}>
        <div className="training-table"><div className="training-row training-head"><span>Class</span><span>Category</span><span>Date</span><span>Attendees</span><span>Completion</span><span>Status</span></div>{upcoming.map((record) => <div className="training-row" key={record.id}><button className="link-button" onClick={() => setSelected(record)}>{record.course}</button><span>{record.category}</span><span>{record.date}</span><span>{record.attendees} / {record.capacity}</span><span>{record.completion}%</span><Badge>{record.status}</Badge></div>)}</div>
      </Panel>
      <Panel title="Compliance Queue" icon={ShieldCheck} action={<span className="panel-count">{complianceQueue.length} need action</span>}>
        <div className="training-table">{complianceQueue.length ? complianceQueue.map((record) => <div className="training-row" key={record.id}><button className="link-button" onClick={() => setSelected(record)}>{record.course}</button><span>{record.category}</span><span>{record.endDate || record.date}</span><span>{record.members}</span><span>{record.completion}%</span><Badge>{record.status}</Badge></div>) : <p className="empty-table">No overdue or incomplete training items.</p>}</div>
      </Panel>
      <Panel title="All Training Records" icon={BookOpen} className="full-span">
        <div className="training-table wide"><div className="training-row training-head"><span>Training Event</span><span>Category</span><span>Instructor</span><span>Hours</span><span>Attendees</span><span>Completion</span><span>Status</span><span /></div>{visibleRecords.map((record) => <div className="training-row" key={record.id}><button className="link-button" onClick={() => setSelected(record)}>{record.course}</button><span>{record.category}</span><span>{record.instructor}</span><span>{record.hours}</span><span>{record.attendees} / {record.capacity}</span>{canEdit ? <select value={record.completion} onChange={(event) => updateRecord(record.id, { completion: Number(event.target.value), status: Number(event.target.value) >= 100 ? "Complete" : record.status })}>{[0, 25, 50, 75, 86, 100].map((value) => <option key={value} value={value}>{value}%</option>)}</select> : <span>{record.completion}%</span>}{canEdit ? <select value={record.status} onChange={(event) => updateRecord(record.id, { status: event.target.value })}>{["Scheduled", "In Progress", "Complete", "Overdue", "Needs Documentation", "Expired"].map((status) => <option key={status}>{status}</option>)}</select> : <Badge>{record.status}</Badge>}<div className="inline-actions"><button className="row-action" onClick={() => setSelected(record)}>Open</button>{canEdit ? <button type="button" className="icon-button danger-button" title="Delete training record" onClick={() => deleteRecord(record)}><Trash2 size={14} /></button> : null}</div></div>)}</div>
      </Panel>
    </section>
    {selected && <Modal title={selected.course} onClose={() => setSelected(null)}><div className="cert-detail-grid">{[["Training ID", selected.id], ["Category", selected.category], ["Instructor", selected.instructor], ["Start Date", selected.date], ["End Date", selected.endDate], ["Hours", selected.hours], ["Attendees", `${selected.attendees} / ${selected.capacity}`], ["Assigned Members", selected.members], ["Expiration", selected.expirationDate || "No expiration"], ["Status", selected.status], ["Notes", selected.notes]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setSelected(null)}>Close</button>{canEdit ? <button type="button" className="secondary-button danger-button" onClick={() => deleteRecord(selected)}><Trash2 size={14} /> Delete</button> : null}{canEdit ? <button className="primary-button" onClick={() => { updateRecord(selected.id, { status: "Complete", completion: 100 }); setSelected(null); setMessage(`${selected.course} marked complete`); }}><Check size={14} /> Mark Complete</button> : null}</div></Modal>}
    {showNew && canEdit && <Modal title="Add Training Event" onClose={() => setShowNew(false)}><div className="workflow-form">{formError && <p className="form-error" role="alert">{formError}</p>}<label><span>Class Name</span><input value={form.course} placeholder="e.g. Ladder operations" onChange={(e) => setForm({ ...form, course: e.target.value })} /></label><label><span>Category</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{TRAINING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label><span>Start Date</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label><span>Instructor</span><input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} /></label><label><span>Hours</span><input type="number" min="0" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></label><label><span>Capacity</span><input type="number" min="0" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label><label><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button><button className="primary-button" onClick={addTraining}><Check size={14} /> Create Event</button></div></Modal>}
  </div>;
}
