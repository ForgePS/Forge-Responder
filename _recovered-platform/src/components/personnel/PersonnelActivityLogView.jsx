import { useMemo, useState } from "react";
import {
  ACTIVITY_LOG_CATEGORIES,
  formatActivityLogDate,
  groupActivityLogByCategory,
  normalizeActivityLog,
  sortActivityLogEntries,
} from "../../lib/personnelActivityLog.js";

const FILTER_OPTIONS = ["All", ...ACTIVITY_LOG_CATEGORIES];

export default function PersonnelActivityLogView({ entries = [] }) {
  const [filter, setFilter] = useState("All");
  const normalizedEntries = useMemo(() => normalizeActivityLog(entries), [entries]);

  const filteredEntries = useMemo(() => {
    if (filter === "All") return sortActivityLogEntries(normalizedEntries);
    return sortActivityLogEntries(
      normalizedEntries.filter((entry) => entry.category === filter)
    );
  }, [filter, normalizedEntries]);

  const groupedEntries = useMemo(
    () => groupActivityLogByCategory(normalizedEntries),
    [normalizedEntries]
  );

  const showGrouped = filter === "All";

  return (
    <div className="personnel-activity-log">
      <div className="personnel-activity-log-filters segmented-control">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={filter === option ? "active" : ""}
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      {!normalizedEntries.length ? (
        <div className="personnel-empty-section">
          No approved vacation, sick, military leave, or shift trades recorded yet.
        </div>
      ) : showGrouped ? (
        <div className="personnel-activity-log-groups">
          {ACTIVITY_LOG_CATEGORIES.map((category) => {
            const rows = groupedEntries[category] || [];
            if (!rows.length) return null;
            return (
              <section key={category} className="personnel-activity-log-group">
                <header>
                  <strong>{category}</strong>
                  <span>{rows.length} record{rows.length === 1 ? "" : "s"}</span>
                </header>
                <div className="personnel-activity-log-list">
                  {rows.map((entry) => (
                    <ActivityLogRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="personnel-activity-log-list">
          {filteredEntries.length ? filteredEntries.map((entry) => (
            <ActivityLogRow key={entry.id} entry={entry} />
          )) : (
            <div className="personnel-empty-section">No {filter.toLowerCase()} records on file.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityLogRow({ entry }) {
  return (
    <div className="personnel-activity-log-row">
      <div className="personnel-activity-log-row-main">
        <strong>{entry.summary || entry.category}</strong>
        <span>{formatActivityLogDate(entry.approvedAt)}</span>
      </div>
      <div className="personnel-activity-log-row-meta">
        <span className="badge badge-neutral">{entry.category}</span>
        {entry.dates ? <span>{entry.dates}</span> : null}
        {entry.totalHours ? <span>{entry.totalHours}</span> : null}
      </div>
    </div>
  );
}
