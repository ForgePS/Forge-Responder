import { Panel } from "../shell/ui.jsx";
import { formatCount } from "../../lib/heatZone/heatZoneUi.js";

/**
 * Horizontal CSS bars. rows = [{ key, label, count }]. When onSelect is given
 * each row is a button that applies that value as a filter.
 */
export function BarChart({ title, icon, rows = [], onSelect, isSelected, limit = 10, emptyText = "No calls in this range.", hint }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map((r) => r.count || 0));
  const hidden = rows.length - shown.length;
  return (
    <Panel title={title} icon={icon} className="hz-chart-panel" action={hint ? <span className="hz-panel-hint">{hint}</span> : null}>
      {!shown.length ? <p className="hz-chart-empty">{emptyText}</p> : (
        <ul className="hz-bars" aria-label={`${title}: ${shown.map((r) => `${r.label} ${r.count}`).join(", ")}`}>
          {shown.map((row) => {
            const selected = isSelected?.(row) || false;
            const content = (
              <>
                <span className="hz-bar-label" title={row.label}>{row.label}</span>
                <span className="hz-bar-track" aria-hidden="true"><span style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }} /></span>
                <strong className="hz-bar-value">{formatCount(row.count)}</strong>
              </>
            );
            return (
              <li key={String(row.key)}>
                {onSelect ? (
                  <button type="button" className={`hz-bar-row${selected ? " selected" : ""}`} aria-pressed={selected} onClick={() => onSelect(row)} title={selected ? `Remove ${row.label} filter` : `Filter to ${row.label}`}>{content}</button>
                ) : <div className="hz-bar-row">{content}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 && <p className="hz-chart-foot">+{hidden} more not shown</p>}
    </Panel>
  );
}

/**
 * Vertical columns for ordered categories (hour of day, weekday).
 * `tickEvery` thins the axis labels; every column keeps an aria-label.
 */
export function ColumnChart({ title, icon, rows = [], onSelect, isSelected, tickEvery = 1, hint }) {
  const max = Math.max(1, ...rows.map((r) => r.count || 0));
  const total = rows.reduce((sum, r) => sum + (r.count || 0), 0);
  return (
    <Panel title={title} icon={icon} className="hz-chart-panel" action={hint ? <span className="hz-panel-hint">{hint}</span> : null}>
      {!total ? <p className="hz-chart-empty">No calls in this range.</p> : (
        <div className="hz-columns" role="group" aria-label={title} style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((row, index) => {
            const selected = isSelected?.(row) || false;
            const pct = (row.count / max) * 100;
            const label = `${row.label}: ${formatCount(row.count)} call${row.count === 1 ? "" : "s"}`;
            const body = (
              <>
                <span className="hz-col-value">{row.count ? formatCount(row.count) : ""}</span>
                <span className="hz-col-track"><span style={{ height: `${row.count ? Math.max(3, pct) : 0}%` }} /></span>
                <span className="hz-col-tick" aria-hidden="true">{index % tickEvery === 0 ? row.label : ""}</span>
              </>
            );
            return onSelect ? (
              <button key={String(row.key)} type="button" className={`hz-col${selected ? " selected" : ""}`} aria-pressed={selected} aria-label={label} title={label} onClick={() => onSelect(row)}>{body}</button>
            ) : (
              <div key={String(row.key)} className="hz-col" role="img" aria-label={label} title={label}>{body}</div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
