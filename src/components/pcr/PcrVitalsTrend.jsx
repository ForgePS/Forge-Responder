/**
 * Vital sign trend for the Vitals step: one small line per vital across the charted sets, and a table of every set
 * with values outside the usual range marked (informational; nothing is changed). Read-only.
 */
import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { TREND_VITALS, vitalFlags, vitalTrend } from "../../lib/pcr/pcrQuality.js";
import { clockTime } from "../../lib/nemsis/pcrNarrativeFacts.js";

const W = 320;
const H = 44;
const PAD = 6;

function Spark({ points, label }) {
  const nums = points.map((p) => p.v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => [PAD + (points.length > 1 ? i * step : (W - PAD * 2) / 2), H - PAD - ((p.v - min) / span) * (H - PAD * 2)]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${nums.join(", ")}`} preserveAspectRatio="none">
      {xy.length > 1 ? <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--nr-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill={points[i].flag ? "var(--nr-warn)" : "var(--nr-accent)"} />)}
    </svg>
  );
}

export default function PcrVitalsTrend({ schema, pcr }) {
  const rows = useMemo(() => vitalTrend(schema, pcr), [schema, pcr]);
  const flags = useMemo(() => vitalFlags(schema, pcr), [schema, pcr]);
  if (!rows.length) return null;
  const flagged = new Set(flags.map((f) => `${f.row}:${f.el}`));
  const series = TREND_VITALS.map((v) => ({ ...v, points: rows.filter((r) => r.values[v.el] !== undefined).map((r) => ({ v: r.values[v.el], flag: flagged.has(`${r.row}:${v.el}`) })) }))
    .filter((s) => s.points.length);

  return (
    <section className="nr-section">
      <header>
        <div className="nr-section-title">
          <span className="nr-section-icon"><TrendingUp size={16} /></span>
          <div>
            <h3>Trend</h3>
            <p>{rows.length} set{rows.length === 1 ? "" : "s"} charted. Values outside the usual range are marked to double-check; they aren&apos;t changed.</p>
          </div>
        </div>
      </header>
      <div className="pcr-trend">
        {rows.length > 1 ? (
          <div className="nr-grid">
            {series.map((s) => (
              <div key={s.el} className="nr-field">
                <span className="nr-label">{s.name} <span className="pcr-el">{s.points.map((p) => p.v).join(" → ")}</span></span>
                <Spark points={s.points} label={s.name} />
              </div>
            ))}
          </div>
        ) : null}
        <div className="pcr-trend-scroll">
          <table>
            <thead>
              <tr><th scope="col">Time</th>{series.map((s) => <th key={s.el} scope="col">{s.name}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row}>
                  <td>{clockTime(r.time) || `Set ${r.row + 1}`}</td>
                  {series.map((s) => {
                    const flag = flagged.has(`${r.row}:${s.el}`);
                    return <td key={s.el} className={flag ? "flag" : undefined}>{r.values[s.el] ?? "—"}{flag ? <span> (check)</span> : null}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
