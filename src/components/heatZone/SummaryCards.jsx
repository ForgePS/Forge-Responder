import { formatDuration, formatHour } from "../../lib/heatZone/heatZoneFilters.js";
import { changeArrow, formatCount, formatDate, formatPct } from "../../lib/heatZone/heatZoneUi.js";

function Card({ label, value, sub, tone = "", title }) {
  return (
    <div className={`hz-card${tone ? ` is-${tone}` : ""}`} title={title}>
      <span className="hz-card-label">{label}</span>
      <strong className="hz-card-value">{value}</strong>
      {sub ? <small className="hz-card-sub">{sub}</small> : null}
    </div>
  );
}

/** Overview cards. Never shows an average response time the server marked unreliable. */
export default function SummaryCards({ summary, comparison }) {
  if (!summary) return null;
  const avg = summary.averageResponse || {};
  const change = comparison?.changePct;
  const previousRange = comparison ? `${formatDate(comparison.previousFrom)} – ${formatDate(comparison.previousTo)}` : "";
  let changeText = "";
  if (comparison) {
    changeText = Number.isFinite(change)
      ? `${changeArrow(change)} ${formatPct(change)} vs previous period (${formatCount(comparison.previousTotal)})`
      : `No calls in previous period`;
  }
  const totalSub = [summary.unmappedCalls > 0 ? `${formatCount(summary.unmappedCalls)} not mapped` : "", changeText].filter(Boolean);

  return (
    <section className="hz-cards" aria-label="Summary">
      <Card
        label="Total calls"
        value={formatCount(summary.totalCalls)}
        sub={totalSub.length ? totalSub.map((t, i) => <span key={i} className={i === totalSub.length - 1 && comparison && Number.isFinite(change) && change !== 0 ? (change > 0 ? "hz-up" : "hz-down") : ""}>{t}</span>) : null}
        title={comparison ? `Previous period: ${previousRange}` : undefined}
      />
      <Card
        label="Highest-activity district"
        value={summary.highestActivityDistrict?.name || "—"}
        sub={summary.highestActivityDistrict ? `${formatCount(summary.highestActivityDistrict.count)} calls` : "No calls"}
      />
      <Card
        label="Peak call hour"
        value={summary.peakHour ? formatHour(summary.peakHour.hour) : "—"}
        sub={summary.peakHour ? `${formatCount(summary.peakHour.count)} calls` : "No calls"}
      />
      <Card
        label="Most frequent classification"
        value={summary.topClassification?.name || "—"}
        sub={summary.topClassification ? `${formatCount(summary.topClassification.count)} calls` : "No calls"}
      />
      <Card
        label="High-priority calls"
        value={formatCount(summary.highPriorityCalls)}
        sub={summary.highPriorities?.length ? `Counts: ${summary.highPriorities.join(", ")}` : "No high priorities set"}
        tone={summary.highPriorityCalls ? "critical" : ""}
      />
      <Card
        label="Average response time"
        value={avg.reliable && Number.isFinite(avg.seconds) ? formatDuration(avg.seconds) : "Not enough data"}
        sub={avg.reliable
          ? `${formatCount(avg.sampleSize)} calls with dispatch and arrival times (${Math.round((avg.coverage || 0) * 100)}%)`
          : `Only ${formatCount(avg.sampleSize || 0)} call${avg.sampleSize === 1 ? "" : "s"} with dispatch and arrival times`}
        tone={avg.reliable ? "" : "muted"}
      />
    </section>
  );
}
