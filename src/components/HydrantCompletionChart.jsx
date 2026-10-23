import { useMemo } from "react";
import { buildHydrantCompletionByDistrict, currentHydrantYear } from "../lib/hydrantCompletionStats.js";

function districtLabel(district = "") {
  if (district === "City Total") return district;
  if (district === "Unassigned") return "Unassigned";
  return `District ${district}`;
}

function CompletionRow({ row, emphasized = false }) {
  return (
    <div className={`hydrant-completion-row${emphasized ? " is-total" : ""}`}>
      <span className="hydrant-completion-label">{districtLabel(row.district)}</span>
      <div className="hydrant-completion-bar" aria-hidden="true">
        {row.completedWidth > 0 && (
          <i className="complete" style={{ width: `${row.completedWidth}%` }} />
        )}
        {row.dueWidth > 0 && (
          <i className="due" style={{ width: `${row.dueWidth}%` }} />
        )}
      </div>
      <strong className="hydrant-completion-percent">{row.percentComplete}%</strong>
    </div>
  );
}

export default function HydrantCompletionChart({
  hydrants = [],
  year = currentHydrantYear(),
  loading = false,
}) {
  const summary = useMemo(
    () => buildHydrantCompletionByDistrict(hydrants, year),
    [hydrants, year]
  );

  if (loading) {
    return (
      <div className="hydrant-completion-chart">
        <p className="hydrant-completion-empty">Loading hydrant completion...</p>
      </div>
    );
  }

  if (!summary.cityTotal.total) {
    return (
      <div className="hydrant-completion-chart">
        <p className="hydrant-completion-empty">No hydrant inventory is available for this department.</p>
      </div>
    );
  }

  return (
    <div className="hydrant-completion-chart">
      <div className="hydrant-completion-head">
        <strong>{summary.year} Annual Testing</strong>
        <span>
          {summary.cityTotal.completed} of {summary.cityTotal.testable} testable hydrants complete
        </span>
      </div>

      <div className="hydrant-completion-rows">
        {summary.districts.map((row) => (
          <CompletionRow key={row.district} row={row} />
        ))}
        <CompletionRow row={summary.cityTotal} emphasized />
      </div>

      <div className="hydrant-completion-legend">
        <span><i className="complete" />Complete ({summary.cityTotal.completed})</span>
        <span><i className="due" />Due ({summary.cityTotal.due})</span>
        <span><i className="oos" />Out of Service ({summary.cityTotal.outOfService})</span>
        <span><i className="private" />Private ({summary.cityTotal.private})</span>
      </div>

      <div className="hydrant-completion-foot">
        {summary.districts.map((row) => (
          <span key={row.district}>
            {districtLabel(row.district)}: {row.completed}/{row.testable}
          </span>
        ))}
      </div>
    </div>
  );
}
