import { HEAT_STOPS } from "../../lib/heatZone/heatLayer.js";

const gradient = `linear-gradient(90deg, ${HEAT_STOPS.map((s) => `rgb(${s.color.join(",")}) ${Math.round(s.at * 100)}%`).join(", ")})`;
const MAX_SWATCHES = 6;

function Swatches({ zones, dashed }) {
  const shown = zones.slice(0, MAX_SWATCHES);
  return (
    <ul className="hz-legend-swatches">
      {shown.map((z) => (
        <li key={z.id}><span className={`hz-swatch${dashed ? " dashed" : ""}`} style={{ borderColor: z.color }} aria-hidden="true" />{z.name}</li>
      ))}
      {zones.length > shown.length && <li className="hz-muted">+{zones.length - shown.length} more</li>}
    </ul>
  );
}

/** Heat ramp (Low → High) plus swatches for whatever boundary layers are on. */
export default function MapLegend({ mode, heatOn, boundaries = [], showDistricts, showZones, showMarkers, highPriorities = [] }) {
  const active = (boundaries || []).filter((z) => z.active !== false);
  const districts = showDistricts ? active.filter((z) => z.kind === "district") : [];
  const zones = showZones ? active.filter((z) => z.kind === "zone") : [];
  if (!heatOn && !districts.length && !zones.length && !showMarkers) return null;
  return (
    <div className="hz-legend" aria-label="Map legend">
      {heatOn && (
        <div className="hz-legend-block">
          <strong>{mode === "weighted" ? "Call density · weighted by priority" : "Call density · raw count"}</strong>
          <span className="hz-legend-ramp" style={{ background: gradient }} aria-hidden="true" />
          <span className="hz-legend-scale"><span>Low</span><span>High</span></span>
        </div>
      )}
      {showMarkers && (
        <div className="hz-legend-block">
          <strong>Incidents</strong>
          <ul className="hz-legend-swatches">
            <li><span className="hz-dot is-high" aria-hidden="true" />{highPriorities.length ? highPriorities.join(", ") : "High priority"}</li>
            <li><span className="hz-dot" aria-hidden="true" />Other priorities</li>
          </ul>
        </div>
      )}
      {districts.length > 0 && <div className="hz-legend-block"><strong>Districts</strong><Swatches zones={districts} /></div>}
      {zones.length > 0 && <div className="hz-legend-block"><strong>Response zones</strong><Swatches zones={zones} dashed /></div>}
    </div>
  );
}
