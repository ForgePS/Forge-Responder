/**
 * EMS analytics on the Patient Care Reports page (people who can read every report). Totals only; counts under five
 * show as "<5" (src/lib/pcr/pcrAnalytics.js). Built from the reports loaded on the page (the most recent 300).
 */
import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { pcrAnalytics, SMALL_CELL } from "../../lib/pcr/pcrAnalytics.js";

function Bars({ title, rows, total }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="nr-section">
      <header><div className="nr-section-title"><div><h3>{title}</h3></div></div></header>
      {rows.length ? (
        <ul className="pcr-bars">
          {rows.map((r) => (
            <li key={r.label}>
              <span className="pcr-bar-label">{r.label}</span>
              {/* Suppressed counts draw no bar length, so the size can't be read off the chart either. */}
              <span className="pcr-bar-track"><span className="pcr-bar" style={{ width: typeof r.shown === "number" ? `${(r.count / max) * 100}%` : "0%" }} /></span>
              <span className="pcr-bar-value">{r.shown}{typeof r.shown === "number" && total >= SMALL_CELL ? <small> {Math.round((r.count / total) * 100)}%</small> : null}</span>
            </li>
          ))}
        </ul>
      ) : <p className="nr-muted">Nothing charted yet.</p>}
    </section>
  );
}

const fmt = (v, unit) => (v === null || v === undefined ? "Not enough data" : `${Math.round(v * 10) / 10} ${unit}`);

export default function PcrAnalytics({ schema, reports, onClose }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const data = useMemo(() => pcrAnalytics(schema, reports, { from, to }), [schema, reports, from, to]);
  return (
    <div className="pcr-analytics">
      <section className="nr-hero">
        <div className="nr-hero-text">
          <span className="nr-hero-icon"><BarChart3 size={22} /></span>
          <div>
            <h1>EMS analytics</h1>
            <p>Totals from the {reports.length} most recent reports. No patient details are shown; counts under {SMALL_CELL} appear as &ldquo;&lt;{SMALL_CELL}&rdquo;.</p>
          </div>
        </div>
        <div className="nr-hero-actions">
          <label className="nr-field"><span className="nr-label">From</span><input type="date" className="nr-input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="nr-field"><span className="nr-label">To</span><input type="date" className="nr-input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="nr-btn nr-btn-ghost" onClick={onClose}><ArrowLeft size={16} /> Reports</button>
        </div>
      </section>

      <section className="nr-stats">
        <div className="nr-stat nr-stat-ready"><strong>{data.shownTotal}</strong><span>Reports</span></div>
        <div className="nr-stat"><strong>{data.transportRate === null ? "—" : `${data.transportRate}%`}</strong><span>Transported (of patient contacts)</span></div>
        <div className="nr-stat"><strong>{fmt(data.medianResponseMinutes, "min")}</strong><span>Median notified → on scene</span></div>
        <div className="nr-stat"><strong>{fmt(data.medianSceneMinutes, "min")}</strong><span>Median time on scene</span></div>
        <div className="nr-stat"><strong>{fmt(data.medianHoursToPost, "h")}</strong><span>Median time to post</span></div>
        <div className="nr-stat"><strong>{data.nemsisCheckFailRate === null ? "—" : `${data.nemsisCheckFailRate}%`}</strong><span>Posted with NEMSIS errors ({data.checkedCount} checked)</span></div>
      </section>

      <div className="pcr-analytics-grid">
        <Bars title="Report status" rows={data.byStatus} total={data.total} />
        <Bars title="Unit disposition" rows={data.byUnitDisposition} total={data.total} />
        <Bars title="Transport" rows={data.byTransport} total={data.total} />
        <Bars title="Primary impressions (ICD-10)" rows={data.topImpressions} total={data.total} />
        <Bars title="Medications given" rows={data.medications} total={0} />
        <Bars title="Procedures" rows={data.procedures} total={0} />
      </div>
    </div>
  );
}
