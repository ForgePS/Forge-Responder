import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { isOutOfServiceHydrant } from "../../lib/hydrantCompletionStats.js";

const CLOSED_REPORT_STATUSES = new Set(["closed", "verified", "cancelled"]);

/**
 * @param {object} hydrant
 * @returns {string}
 */
export function hydrantRecordKey(hydrant = {}) {
  return String(hydrant.location_id || hydrant.hydrant_id || hydrant.id || "").trim();
}

/**
 * @param {object[]} hydrants
 * @returns {object[]}
 */
export function listOutOfServiceHydrants(hydrants = []) {
  return (hydrants || [])
    .filter((row) => isOutOfServiceHydrant(row))
    .slice()
    .sort((a, b) => hydrantRecordKey(a).localeCompare(hydrantRecordKey(b), undefined, { numeric: true }));
}

/**
 * @param {object[]} reports
 * @param {string} hydrantKey
 * @returns {object|null}
 */
export function findOpenDamageReportForHydrant(reports = [], hydrantKey = "") {
  const key = String(hydrantKey || "").trim();
  if (!key) return null;
  return (reports || []).find((row) =>
    String(row.hydrantId || "").trim() === key
    && !CLOSED_REPORT_STATUSES.has(String(row.status || ""))
  ) || null;
}

/**
 * Selectable list of current out-of-service hydrants for damage reporting.
 *
 * @param {{
 *   hydrants?: object[],
 *   reports?: object[],
 *   selectedKey?: string,
 *   onSelect?: (hydrantKey: string, hydrant: object) => void,
 *   onIssueReport?: (hydrant: object) => void | Promise<void>,
 *   canCreate?: boolean,
 *   saving?: boolean,
 *   compact?: boolean,
 *   title?: string,
 * }} props
 */
export default function OutOfServiceHydrantList({
  hydrants = [],
  reports = [],
  selectedKey = "",
  onSelect,
  onIssueReport,
  canCreate = false,
  saving = false,
  compact = false,
  title = "Out of service hydrants",
} = {}) {
  const [search, setSearch] = useState("");

  const oosHydrants = useMemo(() => listOutOfServiceHydrants(hydrants), [hydrants]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return oosHydrants;
    return oosHydrants.filter((row) =>
      [
        hydrantRecordKey(row),
        row.address,
        row.full_address,
        row.district,
        row.provider,
        row.water_assoc,
        row.status,
        row.flow_result,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [oosHydrants, search]);

  return (
    <div className={`oos-hydrant-list${compact ? " compact" : ""}`}>
      <header className="oos-hydrant-list-header">
        <div>
          <strong>{title}</strong>
          <span className="occupancy-muted">
            {oosHydrants.length} out of service · from current inventory
          </span>
        </div>
        <label className="config-inline-search">
          <Search size={14} aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter OOS hydrants"
            aria-label="Filter out of service hydrants"
          />
        </label>
      </header>

      {!oosHydrants.length ? (
        <p className="occupancy-muted">
          No out-of-service hydrants in the current inventory. Mark hydrants Out of Service in Hydrant Testing to list them here.
        </p>
      ) : (
        <div className="oos-hydrant-list-body" role="list">
          {visible.map((row) => {
            const key = hydrantRecordKey(row);
            const openReport = findOpenDamageReportForHydrant(reports, key);
            const isSelected = selectedKey && selectedKey === key;
            const address = row.address || row.full_address || "No address";
            const utility = row.provider || row.water_assoc || row.district || "Utility unknown";
            return (
              <div
                key={key}
                role="listitem"
                className={`oos-hydrant-row${isSelected ? " selected" : ""}`}
              >
                <button
                  type="button"
                  className="oos-hydrant-row-main"
                  onClick={() => onSelect?.(key, row)}
                  aria-pressed={isSelected}
                >
                  <AlertTriangle size={15} aria-hidden />
                  <span>
                    <strong>{key}</strong>
                    <small>{address} · {utility}</small>
                    {openReport ? (
                      <small className="oos-hydrant-open-report">
                        Open report {openReport.reportNumber} ({openReport.statusLabel || openReport.status})
                      </small>
                    ) : null}
                  </span>
                </button>
                {canCreate && onIssueReport ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={saving}
                    onClick={() => onIssueReport(row)}
                    title={openReport ? "Create another damage report for this hydrant" : "Create damage report for this hydrant"}
                  >
                    {openReport ? "New report" : "Issue report"}
                  </button>
                ) : null}
              </div>
            );
          })}
          {!visible.length ? (
            <p className="occupancy-muted">No out-of-service hydrants match this filter.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
