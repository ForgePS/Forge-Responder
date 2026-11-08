import { formatClock } from "../../lib/heatZone/heatZoneUi.js";

/**
 * state: "connecting" | "live" | "unavailable"; updating = a refetch is in flight.
 */
export default function LiveStatus({ state, updating, lastUpdated, timeZone }) {
  let tone = "idle";
  let text = "Connecting…";
  if (updating) { tone = "busy"; text = "Updating…"; }
  else if (state === "unavailable") { tone = "off"; text = "Live updates unavailable"; }
  else if (state === "live") { tone = "live"; text = lastUpdated ? `Live · updated ${formatClock(lastUpdated, timeZone)}` : "Live"; }
  else if (lastUpdated) { text = `Updated ${formatClock(lastUpdated, timeZone)}`; }
  return (
    <span className={`hz-live is-${tone}`} role="status" aria-live="polite" title={state === "unavailable" ? "The page will not refresh by itself. Change a filter to reload." : undefined}>
      <span className="hz-live-dot" aria-hidden="true" />
      {text}
    </span>
  );
}
