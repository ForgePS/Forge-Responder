import { Map as MapIcon, Settings } from "lucide-react";
import { Panel } from "../shell/ui.jsx";
import { formatDuration } from "../../lib/heatZone/heatZoneFilters.js";
import { changeArrow, formatCount, formatPct } from "../../lib/heatZone/heatZoneUi.js";

/** districtComparison table; clicking a row filters to that district. */
export default function DistrictComparison({ rows = [], zones = [], selectedIds = [], showPrevious, viewAllDistricts = true, canManage, onSelectDistrict, onOpenSettings }) {
  const configured = zones.some((z) => z.kind === "district");
  const hasPrevious = showPrevious && rows.some((r) => r.previousCount !== null && r.previousCount !== undefined);

  return (
    <Panel title="District comparison" icon={MapIcon} action={<span className="hz-panel-hint">Select a row to filter to that district</span>}>
      {!configured && viewAllDistricts && (
        <div className="hz-inline-empty">
          <p>No districts are configured yet, so every call counts as “Outside configured districts”. District boundaries are set up in Settings.</p>
          {canManage && <button type="button" className="secondary-button hz-button" onClick={onOpenSettings}><Settings size={14} /> Open Settings</button>}
        </div>
      )}
      {!showPrevious && <p className="hz-panel-note">Previous-period comparison needs the “View Heat Zone history” permission.</p>}
      <div className="data-table-wrap">
        <table className="hz-table">
          <thead>
            <tr>
              <th>District</th>
              <th className="num">Calls</th>
              <th className="num">Share</th>
              {hasPrevious && <th className="num">Previous period</th>}
              {hasPrevious && <th className="num">Change</th>}
              <th className="num">High-priority</th>
              <th>Top classification</th>
              <th className="num">Avg response</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedIds.includes(row.id);
              const avg = row.averageResponse || {};
              return (
                <tr
                  key={row.id}
                  className={`hz-click-row${selected ? " selected" : ""}`}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => onSelectDistrict(row.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectDistrict(row.id); } }}
                >
                  <td>{row.name}</td>
                  <td className="num">{formatCount(row.count)}</td>
                  <td className="num">{Number.isFinite(row.share) ? `${row.share.toFixed(1)}%` : "—"}</td>
                  {hasPrevious && <td className="num">{row.previousCount === null ? "—" : formatCount(row.previousCount)}</td>}
                  {hasPrevious && (
                    <td className={`num ${row.changePct > 0 ? "hz-up" : row.changePct < 0 ? "hz-down" : ""}`}>
                      {Number.isFinite(row.changePct) ? `${changeArrow(row.changePct)} ${formatPct(row.changePct)}` : row.previousCount === 0 && row.count > 0 ? "New" : "—"}
                    </td>
                  )}
                  <td className="num">{formatCount(row.highPriorityCalls)}</td>
                  <td>{row.topClassification || "—"}</td>
                  <td className="num" title={avg.reliable ? `${avg.sampleSize} calls with times` : `Only ${avg.sampleSize || 0} calls with times`}>
                    {avg.reliable && Number.isFinite(avg.seconds) ? formatDuration(avg.seconds) : "Not enough data"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty-table">No incidents match these filters.</div>}
      </div>
    </Panel>
  );
}
