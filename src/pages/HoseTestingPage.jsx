import { useMemo, useState } from "react";
import { Check, CirclePlus, Gauge, Trash2, X } from "lucide-react";
import { Badge, FleetSummary, Panel, Modal } from "../components/shell/ui.jsx";
import { displayDate, todayIsoDate, uniqueRecordId } from "../lib/recordIds.js";
import { exportCsv } from "../utils/dashboardMetrics.js";

const DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const t = Date.parse(String(value || ""));
  return Number.isNaN(t) ? null : t;
}

/** Current / Due Soon (30 days) / Overdue / Out of Service, from the record's dates and result. */
export function hoseStatus(record = {}) {
  if (/fail/i.test(record.result || "")) return "Out of Service";
  const due = parseDate(record.nextDue);
  if (!due) return record.lastTest ? "Current" : "Not Tested";
  const days = (due - Date.now()) / DAY;
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due Soon";
  return "Current";
}

function addYearIso(iso) {
  const d = new Date(`${iso}T12:00:00`);
  d.setFullYear(d.getFullYear() + 1);
  return todayIsoDate(d);
}

const blankSection = { apparatus: "", section: "", length: "", diameter: "" };

/** Hose sections by apparatus, with annual service tests (NFPA 1962). */
export default function HoseTestingPage({ records = [], setRecords, query = "", apparatus = [], canEdit = false }) {
  const [adding, setAdding] = useState(false);
  const [section, setSection] = useState(blankSection);
  const [testing, setTesting] = useState(null);
  const [test, setTest] = useState({ date: todayIsoDate(), result: "Pass", testedBy: "", notes: "" });
  const [filter, setFilter] = useState("All");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const withStatus = useMemo(() => records.map((r) => ({ ...r, status: hoseStatus(r) })), [records]);
  const visible = withStatus
    .filter((r) => filter === "All" || r.status === filter)
    .filter((r) => Object.values(r).join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => String(a.apparatus).localeCompare(String(b.apparatus)) || String(a.section).localeCompare(String(b.section)));
  const count = (s) => withStatus.filter((r) => r.status === s).length;
  const unitNames = [...new Set(apparatus.map((u) => u.unit).filter(Boolean))];

  function addSection() {
    if (!section.apparatus.trim() || !section.section.trim()) { setError("Enter the apparatus and the hose section."); return; }
    setRecords((current) => [{
      id: uniqueRecordId("HT"),
      apparatus: section.apparatus.trim(),
      section: section.section.trim(),
      length: section.length.trim(),
      diameter: section.diameter.trim(),
      lastTest: "",
      nextDue: "",
      result: "",
      testedBy: "",
      tests: [],
      created_at: new Date().toISOString(),
    }, ...current]);
    setMessage(`Added ${section.section.trim()} on ${section.apparatus.trim()}`);
    setSection(blankSection);
    setAdding(false);
    setError("");
  }

  function recordTest() {
    if (!testing || !test.date) return;
    const entry = { date: test.date, result: test.result, testedBy: test.testedBy.trim(), notes: test.notes.trim(), recordedAt: new Date().toISOString() };
    setRecords((current) => current.map((r) => (r.id === testing.id ? {
      ...r,
      lastTest: displayDate(test.date),
      nextDue: test.result === "Pass" ? displayDate(addYearIso(test.date)) : r.nextDue,
      result: test.result,
      testedBy: entry.testedBy,
      tests: [entry, ...(r.tests || [])],
      updated_at: new Date().toISOString(),
    } : r)));
    setMessage(`${testing.section} on ${testing.apparatus}: ${test.result === "Pass" ? "passed, next test due in a year" : "failed — marked out of service"}`);
    setTesting(null);
  }

  function remove(record) {
    if (!window.confirm(`Delete ${record.section} on ${record.apparatus} and its test history?`)) return;
    setRecords((current) => current.filter((r) => r.id !== record.id));
  }

  return (
    <div className="module-page">
      <section className="module-heading">
        <div><span className="module-icon"><Gauge size={22} /></span><div><h1>Hose Testing</h1><p>Hose sections by apparatus, annual service tests, and failures.</p></div></div>
        <div className="heading-actions">
          <button type="button" className="secondary-button" disabled={!visible.length} onClick={() => exportCsv(`hose-tests-${todayIsoDate()}.csv`, visible.map((r) => ({ Apparatus: r.apparatus, Section: r.section, Length: r.length, Diameter: r.diameter, "Last test": r.lastTest, "Next due": r.nextDue, Result: r.result, "Tested by": r.testedBy, Status: r.status })))}>Export</button>
          {canEdit ? <button type="button" className="primary-button" onClick={() => setAdding(true)}><CirclePlus size={14} /> Add Hose Section</button> : null}
        </div>
      </section>
      <FleetSummary items={[["Sections", records.length, "info"], ["Current", count("Current"), "success"], ["Due Soon", count("Due Soon"), "warning"], ["Overdue", count("Overdue"), "critical"], ["Out of Service", count("Out of Service"), "critical"]]} />
      {message ? <div className="success-banner">{message}<button type="button" onClick={() => setMessage("")}><X size={13} /></button></div> : null}
      <section className="cert-toolbar"><div className="segmented-control">{["All", "Current", "Due Soon", "Overdue", "Out of Service", "Not Tested"].map((s) => <button key={s} type="button" className={filter === s ? "active" : ""} onClick={() => setFilter(s)}>{s}</button>)}</div><span>{visible.length} sections shown</span></section>
      <Panel title="Hose Test Records" icon={Gauge}>
        <div className="work-order-table">
          <div className="work-order-row work-order-head"><span>Apparatus</span><span>Section</span><span>Last Test</span><span>Next Due</span><span>Result</span><span>Status</span><span /></div>
          {visible.map((item) => (
            <div className="work-order-row" key={item.id}>
              <strong>{item.apparatus}</strong>
              <span>{item.section}{item.length ? ` · ${item.length}` : ""}</span>
              <span>{item.lastTest || "—"}</span>
              <span>{item.nextDue || "—"}</span>
              <span>{item.result || "—"}</span>
              <Badge>{item.status}</Badge>
              {canEdit ? (
                <div className="inline-actions">
                  <button type="button" className="row-action" onClick={() => { setTesting(item); setTest({ date: todayIsoDate(), result: "Pass", testedBy: "", notes: "" }); }}>Record test</button>
                  <button type="button" className="icon-button danger-button" title="Delete" onClick={() => remove(item)}><Trash2 size={14} /></button>
                </div>
              ) : <span />}
            </div>
          ))}
          {!visible.length ? <p className="empty-table">{records.length ? "No sections match." : "No hose sections yet."}</p> : null}
        </div>
      </Panel>

      {adding ? (
        <Modal title="Add hose section" onClose={() => setAdding(false)}>
          <div className="workflow-form">
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <label><span>Apparatus</span>
              <input list="hose-units" value={section.apparatus} onChange={(e) => setSection({ ...section, apparatus: e.target.value })} placeholder="e.g. Engine 1" />
              <datalist id="hose-units">{unitNames.map((u) => <option key={u} value={u} />)}</datalist>
            </label>
            <label><span>Section / ID</span><input value={section.section} onChange={(e) => setSection({ ...section, section: e.target.value })} placeholder={'e.g. Crosslay 1 - 1¾"'} /></label>
            <label><span>Length</span><input value={section.length} onChange={(e) => setSection({ ...section, length: e.target.value })} placeholder="e.g. 200 ft" /></label>
            <label><span>Diameter</span><input value={section.diameter} onChange={(e) => setSection({ ...section, diameter: e.target.value })} placeholder={'e.g. 1¾"'} /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAdding(false)}>Cancel</button><button type="button" className="primary-button" onClick={addSection}><Check size={14} /> Add Section</button></div>
        </Modal>
      ) : null}

      {testing ? (
        <Modal title={`Record test — ${testing.section} (${testing.apparatus})`} onClose={() => setTesting(null)}>
          <div className="workflow-form">
            <label><span>Test date</span><input type="date" value={test.date} onChange={(e) => setTest({ ...test, date: e.target.value })} /></label>
            <label><span>Result</span><select value={test.result} onChange={(e) => setTest({ ...test, result: e.target.value })}><option>Pass</option><option>Fail</option></select></label>
            <label><span>Tested by</span><input value={test.testedBy} onChange={(e) => setTest({ ...test, testedBy: e.target.value })} /></label>
            <label className="wide-field"><span>Notes</span><textarea value={test.notes} onChange={(e) => setTest({ ...test, notes: e.target.value })} /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setTesting(null)}>Cancel</button><button type="button" className="primary-button" disabled={!test.date} onClick={recordTest}><Check size={14} /> Save Test</button></div>
        </Modal>
      ) : null}
    </div>
  );
}
