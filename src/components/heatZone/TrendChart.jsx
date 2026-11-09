import { TrendingUp } from "lucide-react";
import { Panel } from "../shell/ui.jsx";
import { formatCount, trendLabel } from "../../lib/heatZone/heatZoneUi.js";

const W = 640;
const H = 200;
const PAD = { top: 14, right: 12, bottom: 28, left: 40 };

/** Inline SVG line + area of charts.trend ({ bucket, points: [{ key, count }] }). */
export default function TrendChart({ trend }) {
  const points = trend?.points || [];
  const bucket = trend?.bucket || "day";
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const peak = points.reduce((best, p) => (p.count > (best?.count ?? -1) ? p : best), null);
  const max = Math.max(1, ...points.map((p) => p.count));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => PAD.top + innerH - (v / max) * innerH;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${PAD.left},${PAD.top + innerH} ${line} ${x(points.length - 1).toFixed(1)},${PAD.top + innerH}` : "";
  const tickCount = Math.min(6, points.length);
  const ticks = tickCount <= 1 ? [0] : Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (points.length - 1)));
  const unit = { day: "day", week: "week", month: "month" }[bucket] || "period";

  return (
    <Panel title={`Call trend by ${unit}`} icon={TrendingUp} className="hz-chart-panel hz-trend-panel" action={peak && total ? <span className="hz-panel-hint">Peak {trendLabel(peak.key, bucket)} · {formatCount(peak.count)}</span> : null}>
      {!total ? <p className="hz-chart-empty">No calls in this range.</p> : (
        <svg className="hz-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Calls per ${unit}: ${formatCount(total)} total, peak ${peak ? `${trendLabel(peak.key, bucket, { long: true })} with ${peak.count}` : "none"}.`}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line className="hz-trend-grid" x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} />
              <text className="hz-trend-axis" x={PAD.left - 6} y={y(max * f) + 4} textAnchor="end">{formatCount(Math.round(max * f))}</text>
            </g>
          ))}
          {area && <polygon className="hz-trend-area" points={area} />}
          {points.length > 1 && <polyline className="hz-trend-line" points={line} />}
          {points.map((p, i) => (
            <circle key={p.key} className="hz-trend-dot" cx={x(i)} cy={y(p.count)} r={points.length > 60 ? 1.5 : 3}>
              <title>{`${trendLabel(p.key, bucket, { long: true })}: ${formatCount(p.count)} call${p.count === 1 ? "" : "s"}`}</title>
            </circle>
          ))}
          {ticks.map((i) => (
            <text key={i} className="hz-trend-axis" x={x(i)} y={H - 8} textAnchor={i === 0 && points.length > 1 ? "start" : i === points.length - 1 && points.length > 1 ? "end" : "middle"}>
              {trendLabel(points[i].key, bucket)}
            </text>
          ))}
        </svg>
      )}
    </Panel>
  );
}
