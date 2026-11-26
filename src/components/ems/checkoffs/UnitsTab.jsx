import { useMemo, useState } from "react";
import { Play, RotateCcw, UploadCloud } from "lucide-react";
import { READINESS_STATUS_INFO, frequencyLabel, localDate } from "../../../lib/ems/checkoffLogic.js";
import { describeError, recordCheckoffResults } from "../../../lib/ems/emsCheckoffService.js";

const MAX_REASONS = 6;

function unitName(asset = {}) {
  return asset.unitDesignation || asset.fleetNumber || asset.name || asset.id;
}

function formatDay(day) {
  if (!day) return "";
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dueText(row) {
  if (row.openCheckId) return { label: "In progress", tone: "info" };
  if (row.state === "overdue") return { label: `Overdue since ${formatDay(row.nextDue)}`, tone: "critical" };
  if (row.state === "due") return { label: row.lastCheck ? "Due today" : "Due (never done)", tone: "warning" };
  return { label: `Done, next ${formatDay(row.nextDue)}`, tone: "success" };
}

/** Every EMS unit: readiness, why, and its check-offs with Start / Resume. */
export default function UnitsTab({
  departmentId, units, loading, unrecorded, assetsById, resultsByCheckId, canRun, canManage, onStart, onOpenResult, onRecorded, onError, onGoToAssignments,
}) {
  const [station, setStation] = useState("");
  const [only, setOnly] = useState("");
  const [recording, setRecording] = useState("");
  const stations = useMemo(() => [...new Set(units.map((u) => u.asset.station).filter(Boolean))].sort(), [units]);
  const shown = units.filter((u) => (!station || u.asset.station === station) && (!only || u.readiness.status === only
    || (only === "due" && u.scheduled.some((s) => s.state !== "done"))));

  async function record(check) {
    setRecording(check.id);
    try {
      const out = await recordCheckoffResults(departmentId, check.id);
      onRecorded(out.recorded ? "Check-off results recorded." : "That check isn't an EMS check-off; nothing to record.");
    } catch (error) {
      onError(describeError(error));
    } finally {
      setRecording("");
    }
  }

  return (
    <>
      {unrecorded.length ? (
        <section className="panel">
          <header><div><UploadCloud size={15} /><strong>Finish recording your check-offs</strong></div></header>
          <div className="panel-body">
            <p className="occupancy-muted ems-hint">These check-offs were saved, but their EMS results weren't recorded. Recording them updates the equipment and supply reports and sends them for sign-off.</p>
            <ul className="ems-due-list">
              {unrecorded.map((check) => (
                <li key={check.id}>
                  <span>
                    <strong>{unitName(assetsById[check.fleetAssetId] || check)} · {check.templateSnapshot?.name || "Check-off"}</strong>
                    <small>Finished {new Date(check.completedAt).toLocaleString()}</small>
                  </span>
                  <button type="button" className="secondary-button" disabled={recording === check.id} onClick={() => record(check)}>
                    <RotateCcw size={14} /> {recording === check.id ? "Recording…" : "Record results"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="cert-toolbar">
        <label className="config-field">
          <span>Station</span>
          <select value={station} onChange={(e) => setStation(e.target.value)}>
            <option value="">All stations</option>
            {stations.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="config-field">
          <span>Show</span>
          <select value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">All units</option>
            <option value="not_ready">Not ready</option>
            <option value="issues">Ready with issues</option>
            <option value="ready">Ready</option>
            <option value="due">With check-offs due</option>
          </select>
        </label>
      </section>

      {loading ? <p className="occupancy-muted">Loading units…</p> : null}
      {!loading && !units.length ? (
        <div className="empty-table">
          No EMS units yet. A vehicle shows here once a check-off is assigned to it, EMS equipment is placed on it, or it has an EMS supply location.
          {canManage ? <> <button type="button" className="link-button" onClick={onGoToAssignments}>Assign a check-off</button></> : null}
        </div>
      ) : null}

      <div className="ems-unit-grid">
        {shown.map(({ asset, scheduled, readiness, equipmentCount, supplyCount }) => {
          const info = READINESS_STATUS_INFO[readiness.status];
          return (
            <article key={asset.id} className={`ems-unit-card is-${readiness.status}`}>
              <div className="ems-unit-head">
                <div>
                  <h3>{unitName(asset)}</h3>
                  <small>{[asset.station, `${equipmentCount} equipment`, `${supplyCount} stocked supplies`].filter(Boolean).join(" · ")}</small>
                </div>
                <span className={`badge badge-${info.tone}`}>{info.label}</span>
              </div>
              {readiness.reasons.length ? (
                <ul className="ems-reasons">
                  {readiness.reasons.slice(0, MAX_REASONS).map((r, i) => (
                    <li key={`${r.rule}-${i}`} className={`is-${r.severity}`}>{r.message}</li>
                  ))}
                  {readiness.reasons.length > MAX_REASONS ? <li>and {readiness.reasons.length - MAX_REASONS} more</li> : null}
                </ul>
              ) : null}
              {scheduled.length ? (
                <ul className="ems-due-list">
                  {scheduled.map((row) => {
                    const due = dueText(row);
                    return (
                      <li key={row.assignment.id}>
                        <span>
                          <strong>{row.assignment.templateName}</strong>
                          <small>
                            {frequencyLabel(row.assignment.frequency)}
                            {row.assignment.requiresSignOff ? " · needs sign-off" : ""}
                            {row.lastCheck && resultsByCheckId[row.lastCheck.id] ? (
                              <> · last <button type="button" className="link-button" onClick={() => onOpenResult(row.lastCheck.id)}>{formatDay(localDate(row.lastCheck.completedAt))}</button></>
                            ) : row.lastCheck ? ` · last ${formatDay(localDate(row.lastCheck.completedAt))}` : null}
                          </small>
                        </span>
                        <span className={`badge badge-${due.tone}`}>{due.label}</span>
                        {canRun && (row.state !== "done" || row.openCheckId) ? (
                          <button type="button" className="primary-button" onClick={() => onStart(asset, row)}>
                            <Play size={14} /> {row.openCheckId ? "Resume" : "Start"}
                          </button>
                        ) : canRun ? (
                          <button type="button" className="secondary-button" onClick={() => onStart(asset, row)}>
                            <Play size={14} /> Do again
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="occupancy-muted">No check-offs assigned.</p>}
            </article>
          );
        })}
      </div>
    </>
  );
}
