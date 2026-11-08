import { Crop, Moon, RotateCcw, X } from "lucide-react";
import {
  DATE_PRESETS,
  WEEKDAY_LABELS,
  activeFilterCount,
  crossesMidnight,
  presetRange,
  toggleValue,
} from "../../lib/heatZone/heatZoneFilters.js";
import { valueOptions, zoneOptions } from "../../lib/heatZone/heatZoneUi.js";
import MultiSelect from "./MultiSelect.jsx";

/**
 * Page-level filters shared by the map, cards and charts. Every change goes
 * through setFilters; the page debounces the refetch.
 */
export default function FilterBar({ filters, setFilters, today, zones = [], filterOptions = {}, historyLimited = false, rangeError = "", getViewport, onReset }) {
  const patch = (changes) => setFilters((prev) => ({ ...prev, ...changes }));
  const setList = (key) => (next) => patch({ [key]: next });
  const count = activeFilterCount(filters);
  const viewport = getViewport?.();

  function choosePreset(id) {
    if (id === "custom") patch({ preset: "custom" });
    else patch({ preset: id, ...presetRange(id, today) });
  }

  function toggleBounds() {
    if (filters.bounds) patch({ bounds: null });
    else if (viewport) patch({ bounds: viewport });
  }

  const lists = [
    { key: "districtIds", label: "District", options: zoneOptions(zones, "district", filters.districtIds) },
    { key: "zoneIds", label: "Response zone", options: zoneOptions(zones, "zone", filters.zoneIds), emptyText: "No response zones configured" },
    { key: "classifications", label: "Classification", options: valueOptions(filterOptions.classifications, filters.classifications) },
    { key: "priorities", label: "Priority", options: valueOptions(filterOptions.priorities, filters.priorities) },
    { key: "dispositions", label: "Disposition", options: valueOptions(filterOptions.dispositions, filters.dispositions) },
    { key: "statuses", label: "Status", options: valueOptions(filterOptions.statuses, filters.statuses) },
    { key: "unitTypes", label: "Unit type", options: valueOptions(filterOptions.unitTypes, filters.unitTypes) },
  ];

  return (
    <section className="hz-filter-bar" aria-label="Heat Zone filters">
      <div className="hz-filter-row">
        <div className="hz-filter-group" role="group" aria-label="Date range">
          <div className="hz-chip-set">
            {DATE_PRESETS.map((p) => (
              <button key={p.id} type="button" className={`hz-chip${filters.preset === p.id ? " active" : ""}`} aria-pressed={filters.preset === p.id} onClick={() => choosePreset(p.id)}>{p.label}</button>
            ))}
            <button type="button" className={`hz-chip${filters.preset === "custom" ? " active" : ""}`} aria-pressed={filters.preset === "custom"} onClick={() => choosePreset("custom")}>Custom</button>
          </div>
          <label className="hz-inline-field">
            <span>From</span>
            <input type="date" value={filters.from} max={today} onChange={(e) => patch({ from: e.target.value, preset: "custom" })} />
          </label>
          <label className="hz-inline-field">
            <span>To</span>
            <input type="date" value={filters.to} max={today} onChange={(e) => patch({ to: e.target.value, preset: "custom" })} />
          </label>
        </div>

        <div className="hz-filter-group" role="group" aria-label="Days of week">
          <div className="hz-chip-set">
            {WEEKDAY_LABELS.map((label, day) => {
              const on = filters.daysOfWeek.includes(day);
              return (
                <button key={label} type="button" className={`hz-chip compact${on ? " active" : ""}`} aria-pressed={on} onClick={() => patch({ daysOfWeek: toggleValue(filters.daysOfWeek, day).sort() })}>{label}</button>
              );
            })}
          </div>
        </div>

        <div className="hz-filter-group" role="group" aria-label="Time of day">
          <label className="hz-inline-field">
            <span>Time from</span>
            <input type="time" value={filters.timeStart} onChange={(e) => patch({ timeStart: e.target.value })} />
          </label>
          <label className="hz-inline-field">
            <span>to</span>
            <input type="time" value={filters.timeEnd} onChange={(e) => patch({ timeEnd: e.target.value })} />
          </label>
          {(filters.timeStart || filters.timeEnd) && (
            <button type="button" className="hz-icon-button" title="Clear time of day" aria-label="Clear time of day" onClick={() => patch({ timeStart: "", timeEnd: "" })}><X size={14} /></button>
          )}
        </div>
      </div>

      <div className="hz-filter-row">
        {lists.map((list) => (
          <MultiSelect key={list.key} label={list.label} options={list.options} value={filters[list.key]} onChange={setList(list.key)} emptyText={list.emptyText} />
        ))}
        <button
          type="button"
          className={`hz-chip${filters.bounds ? " active" : ""}`}
          aria-pressed={Boolean(filters.bounds)}
          disabled={!filters.bounds && !viewport}
          title={filters.bounds ? "Stop limiting results to the saved map area" : viewport ? "Only count incidents inside the current map view" : "Open the map to choose an area"}
          onClick={toggleBounds}
        >
          <Crop size={13} /> {filters.bounds ? "Map area only" : "Limit to map area"}
          {filters.bounds && <X size={12} aria-hidden="true" />}
        </button>
        <span className="hz-filter-spacer" />
        <span className="hz-filter-count" aria-live="polite">{count ? `${count} active filter${count === 1 ? "" : "s"}` : "No extra filters"}</span>
        <button type="button" className="secondary-button hz-button" onClick={onReset}><RotateCcw size={14} /> Reset filters</button>
      </div>

      {(crossesMidnight(filters) || historyLimited || rangeError) && (
        <div className="hz-filter-notes">
          {crossesMidnight(filters) && (
            <span className="hz-note"><Moon size={13} /> Crosses midnight: calls from {filters.timeStart} to midnight and from midnight until {filters.timeEnd}.</span>
          )}
          {historyLimited && <span className="hz-note">Your access is limited to the last 30 days, so the date range was shortened.</span>}
          {rangeError && <span className="hz-note is-error" role="alert">{rangeError}</span>}
        </div>
      )}
    </section>
  );
}
