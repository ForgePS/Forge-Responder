import { Repeat } from "lucide-react";
import { Panel } from "../shell/ui.jsx";
import { formatInZone } from "../../lib/heatZone/heatZoneFilters.js";
import { districtLabel, formatCount } from "../../lib/heatZone/heatZoneUi.js";

/** Addresses with two or more calls in range. Mapped rows open the map there. */
export default function RepeatLocations({ rows = [], zones = [], timeZone, onFocus }) {
  return (
    <Panel title="Repeat locations" icon={Repeat} action={<span className="hz-panel-hint">Select a mapped location to view it on the map</span>}>
      <div className="data-table-wrap">
        <table className="hz-table">
          <thead>
            <tr>
              <th>Address</th>
              <th className="num">Calls</th>
              <th>Last call</th>
              <th>Top classifications</th>
              <th>District</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mapped = Number.isFinite(row.lat) && Number.isFinite(row.lng);
              const open = () => mapped && onFocus({ lat: row.lat, lng: row.lng });
              return (
                <tr
                  key={row.key}
                  className={mapped ? "hz-click-row" : ""}
                  tabIndex={mapped ? 0 : undefined}
                  title={mapped ? "Show on map" : "This address has no map location"}
                  onClick={open}
                  onKeyDown={(e) => { if (mapped && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
                >
                  <td className="hz-wrap">{row.address}{!mapped && <span className="hz-muted"> · not mapped</span>}</td>
                  <td className="num">{formatCount(row.count)}</td>
                  <td>{formatInZone(row.lastOccurredAt, timeZone)}</td>
                  <td className="hz-wrap">{(row.topClassifications || []).map((c) => `${c.name} (${c.count})`).join(", ") || "—"}</td>
                  <td>{districtLabel(zones, row.districtId)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty-table">No address had more than one call with these filters.</div>}
      </div>
    </Panel>
  );
}
