/**
 * Customizable hydrant inspection + flow-test export.
 * Joins activity records to hydrant master fields for water dept / district filters.
 */

import { loadTenantHydrantCollection } from "./hydrantTenantService.js";
import {
  flowStandardForCode,
  nfpaClassForGpm,
  nfpaColorForClass,
  nfpaColorNameForClass,
} from "./hydrantStatusSync.js";

export const HYDRANT_DETAIL_EXPORT_COLUMNS = [
  { id: "record_type", label: "Record type", default: true },
  { id: "hydrant_id", label: "Hydrant ID", default: true },
  { id: "location_id", label: "Location ID", default: true },
  { id: "gps_location", label: "GPS Location", default: true },
  { id: "district", label: "District", default: true },
  { id: "water_department", label: "Water department", default: true },
  { id: "provider", label: "Provider", default: false },
  { id: "water_assoc", label: "Water association", default: false },
  { id: "date", label: "Date", default: true },
  { id: "time", label: "Time", default: true },
  { id: "tested_by", label: "User / tested by", default: true },
  { id: "shift", label: "Shift", default: true },
  { id: "status", label: "Status", default: true },
  { id: "discharge_size", label: "Discharge size", default: true },
  { id: "pitot_psi", label: "Pitot PSI", default: true },
  { id: "static_psi", label: "Static PSI", default: true },
  { id: "residual_psi", label: "Residual PSI", default: true },
  { id: "flow_gpm", label: "Flow GPM", default: true },
  { id: "flow_result", label: "Flow result", default: true },
  { id: "nfpa_class", label: "Flow Class", default: true },
  { id: "nfpa_color", label: "Flow Color", default: true },
  { id: "inspection_summary", label: "Inspection summary", default: true },
  { id: "checklist_details", label: "Checklist details", default: true },
  { id: "repair_needed", label: "Repair needed", default: true },
  { id: "notes", label: "Notes", default: true },
  { id: "record_id", label: "Record ID", default: false },
];

/** Print/PDF always includes these fields (even if a column was unchecked in the UI). */
const PDF_REQUIRED_COLUMN_IDS = [
  "hydrant_id",
  "gps_location",
  "nfpa_class",
  "nfpa_color",
];

function clean(value) {
  if (value == null) return "";
  return String(value).trim();
}

/** Ensure Horn Lake hydrant IDs show the HL prefix in exports/PDF. */
export function formatHydrantIdForReport(raw = "") {
  const value = clean(raw);
  if (!value) return "";
  if (/^HL[\s-]*/i.test(value)) {
    const rest = value.replace(/^HL[\s-]*/i, "").trim();
    return rest ? `HL ${rest}` : "HL";
  }
  return `HL ${value}`;
}

function formatGpsLocation(hydrant = {}, row = {}) {
  const lat = clean(hydrant.latitude ?? hydrant.lat ?? row.latitude ?? row.lat);
  const lon = clean(hydrant.longitude ?? hydrant.lon ?? row.longitude ?? row.lon);
  if (lat && lon) return `${lat}, ${lon}`;
  const gps = clean(hydrant.gps || row.gps);
  if (gps) return gps;
  return "";
}

function resolveFlowClassAndColor(row = {}, hydrant = null) {
  let flowClass = clean(row.nfpa_class || hydrant?.nfpa_class);
  const flowResult = clean(row.flow_result || hydrant?.flow_result);
  const flowGpm = clean(row.flow_gpm || hydrant?.flow_gpm);

  if (!flowClass || flowClass === "Not Tested") {
    const fromCode = flowStandardForCode(flowResult);
    if (fromCode?.className) flowClass = fromCode.className;
  }
  if ((!flowClass || flowClass === "Not Tested") && flowGpm) {
    const fromGpm = nfpaClassForGpm(flowGpm);
    if (fromGpm && fromGpm !== "Not Tested") flowClass = fromGpm;
  }

  let flowColor = clean(row.nfpa_color || hydrant?.nfpa_color);
  if (!flowColor || flowColor === "Unknown") {
    flowColor = nfpaColorNameForClass(flowClass);
  }
  if ((!flowColor || flowColor === "Unknown") && flowResult) {
    const fromCode = flowStandardForCode(flowResult);
    if (fromCode?.colorName) flowColor = fromCode.colorName;
  }

  return {
    nfpa_class: flowClass,
    nfpa_color: flowColor === "Unknown" && !flowClass ? "" : flowColor,
  };
}

function activityStamp(row = {}) {
  return clean(row.tested_at || row.inspected_at || row.created_at || row.date);
}

function activityDate(row = {}) {
  return activityStamp(row).slice(0, 10);
}

function activityTime(row = {}) {
  const stamp = activityStamp(row);
  if (!stamp) return "";
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) {
    const timePart = stamp.includes("T") ? stamp.slice(11, 19) : "";
    return timePart || stamp;
  }
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hydrantKey(row = {}) {
  const locationId = clean(row.location_id);
  const hydrantId = clean(row.hydrant_id);
  if (locationId && hydrantId) return `${locationId}::${hydrantId}`;
  return hydrantId || locationId || clean(row.id);
}

function waterDepartmentLabel(hydrant = {}) {
  return clean(hydrant.provider || hydrant.water_assoc || hydrant.waterCompanyName || "");
}

function buildHydrantIndex(hydrants = []) {
  const byPair = new Map();
  const byHydrantId = new Map();
  for (const hydrant of hydrants) {
    const key = hydrantKey(hydrant);
    if (key) byPair.set(key, hydrant);
    const id = clean(hydrant.hydrant_id);
    if (id && !byHydrantId.has(id)) byHydrantId.set(id, hydrant);
  }
  return { byPair, byHydrantId };
}

function resolveHydrant(row, index) {
  const key = hydrantKey(row);
  return index.byPair.get(key)
    || index.byHydrantId.get(clean(row.hydrant_id))
    || null;
}

function detectRecordType(row = {}) {
  const explicit = clean(row.type || row.record_type).toLowerCase();
  if (explicit.includes("flow")) return "Flow Test";
  if (explicit.includes("inspection")) return "Inspection";
  if (row.pitot_psi != null || row.static_psi != null || row.residual_psi != null || row.flow_gpm != null || row.discharge_size) {
    return "Flow Test";
  }
  if (Array.isArray(row.checklist) || row.inspected_at) return "Inspection";
  return clean(row.type) || "Activity";
}

function formatChecklist(checklist = []) {
  if (!Array.isArray(checklist) || !checklist.length) return "";
  return checklist.map((item) => {
    const parts = [
      clean(item.item) || "Item",
      clean(item.result) || "—",
    ];
    if (clean(item.notes)) parts.push(`notes: ${clean(item.notes)}`);
    if (clean(item.repair_needed) && clean(item.repair_needed).toLowerCase() !== "no") {
      parts.push(`repair: ${clean(item.repair_needed)}`);
    }
    if (clean(item.photo_name) || clean(item.photo_url)) {
      parts.push(`photo: ${clean(item.photo_name) || "attached"}`);
    }
    return parts.join(" | ");
  }).join(" || ");
}

function inspectionSummary(checklist = []) {
  if (!Array.isArray(checklist) || !checklist.length) return "";
  const counts = { Yes: 0, No: 0, "N/A": 0, other: 0 };
  let repairs = 0;
  for (const item of checklist) {
    const result = clean(item.result) || "other";
    if (Object.prototype.hasOwnProperty.call(counts, result)) counts[result] += 1;
    else counts.other += 1;
    if (clean(item.repair_needed).toLowerCase() === "yes") repairs += 1;
  }
  return `Yes ${counts.Yes}, No ${counts.No}, N/A ${counts["N/A"]}${repairs ? `, repairs ${repairs}` : ""}`;
}

function repairNeededFromChecklist(checklist = []) {
  if (!Array.isArray(checklist)) return clean(checklist) || "";
  const flagged = checklist
    .filter((item) => clean(item.repair_needed).toLowerCase() === "yes")
    .map((item) => clean(item.item))
    .filter(Boolean);
  return flagged.length ? flagged.join("; ") : "No";
}

function normalizeActivityRecord(row = {}, hydrant = null) {
  const recordType = detectRecordType(row);
  const checklist = Array.isArray(row.checklist) ? row.checklist : [];
  const flowMeta = resolveFlowClassAndColor(row, hydrant);
  const rawHydrantId = clean(row.hydrant_id || hydrant?.hydrant_id || row.location_id || hydrant?.location_id);
  return {
    id: clean(row.id),
    record_type: recordType,
    hydrant_id: formatHydrantIdForReport(rawHydrantId),
    location_id: clean(row.location_id || hydrant?.location_id),
    gps_location: formatGpsLocation(hydrant || {}, row),
    district: clean(row.district || hydrant?.district || "Unassigned") || "Unassigned",
    water_department: waterDepartmentLabel(hydrant || row),
    provider: clean(hydrant?.provider || row.provider),
    water_assoc: clean(hydrant?.water_assoc || row.water_assoc),
    date: activityDate(row),
    time: activityTime(row),
    tested_by: clean(row.tested_by || row.checked_by || row.user),
    shift: clean(row.shift || row.checked_shift),
    status: clean(row.status || row.checked_status || hydrant?.status),
    discharge_size: clean(row.discharge_size || hydrant?.discharge_size),
    pitot_psi: clean(row.pitot_psi),
    static_psi: clean(row.static_psi),
    residual_psi: clean(row.residual_psi),
    flow_gpm: clean(row.flow_gpm || hydrant?.flow_gpm),
    flow_result: clean(row.flow_result || hydrant?.flow_result),
    nfpa_class: flowMeta.nfpa_class,
    nfpa_color: flowMeta.nfpa_color,
    inspection_summary: recordType === "Inspection" ? inspectionSummary(checklist) : "",
    checklist_details: recordType === "Inspection" ? formatChecklist(checklist) : "",
    repair_needed: recordType === "Inspection"
      ? repairNeededFromChecklist(checklist)
      : clean(row.repair_needed),
    notes: clean(row.notes || row.generalNotes),
    record_id: clean(row.id),
    _stamp: activityStamp(row),
  };
}

function mergeById(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      if (!item) continue;
      const id = clean(item.id) || `${detectRecordType(item)}-${hydrantKey(item)}-${activityStamp(item)}`;
      map.set(id, { ...item, id });
    }
  }
  return [...map.values()];
}

/**
 * Load inspections + flow tests (+ optional daily activity) and normalize with hydrant joins.
 */
export async function loadHydrantDetailExportRows({
  departmentId,
  hydrants = [],
  localInspections = [],
  localFlowTests = [],
  localActivity = [],
  includeDailyActivity = false,
} = {}) {
  const [cloudInspections, cloudFlowTests, cloudActivity] = await Promise.all([
    loadTenantHydrantCollection(departmentId, "hydrantInspections", []),
    loadTenantHydrantCollection(departmentId, "hydrantFlowTests", []),
    includeDailyActivity
      ? loadTenantHydrantCollection(departmentId, "dailyActivity", [])
      : Promise.resolve([]),
  ]);

  const inspections = mergeById(localInspections, cloudInspections);
  const flowTests = mergeById(localFlowTests, cloudFlowTests);
  const activity = includeDailyActivity ? mergeById(localActivity, cloudActivity) : [];

  // Prefer dedicated inspection/flow collections; only keep daily activity rows that are not already covered.
  const covered = new Set([
    ...inspections.map((row) => `${detectRecordType(row)}::${hydrantKey(row)}::${activityDate(row)}`),
    ...flowTests.map((row) => `${detectRecordType(row)}::${hydrantKey(row)}::${activityDate(row)}`),
  ]);
  const extraActivity = activity.filter((row) => {
    const key = `${detectRecordType(row)}::${hydrantKey(row)}::${activityDate(row)}`;
    return !covered.has(key);
  });

  const index = buildHydrantIndex(hydrants);
  const combined = [...inspections, ...flowTests, ...extraActivity]
    .map((row) => normalizeActivityRecord(row, resolveHydrant(row, index)))
    .sort((a, b) => String(b._stamp).localeCompare(String(a._stamp)));

  return combined;
}

export function collectHydrantExportFilterOptions(rows = [], hydrants = []) {
  const waterDepartments = new Set();
  const districts = new Set();
  const shifts = new Set();
  const users = new Set();

  for (const hydrant of hydrants) {
    const water = waterDepartmentLabel(hydrant);
    if (water) waterDepartments.add(water);
    if (clean(hydrant.district)) districts.add(clean(hydrant.district));
  }
  for (const row of rows) {
    if (row.water_department) waterDepartments.add(row.water_department);
    if (row.district) districts.add(row.district);
    if (row.shift) shifts.add(row.shift);
    if (row.tested_by) users.add(row.tested_by);
  }

  const sortAlpha = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return {
    waterDepartments: [...waterDepartments].sort(sortAlpha),
    districts: [...districts].sort(sortAlpha),
    shifts: [...shifts].sort(sortAlpha),
    users: [...users].sort(sortAlpha),
  };
}

/**
 * @param {object[]} rows
 * @param {{
 *   waterDepartment?: string,
 *   district?: string,
 *   shift?: string,
 *   user?: string,
 *   dateFrom?: string,
 *   dateTo?: string,
 *   recordTypes?: string[],
 * }} filters
 */
export function filterHydrantDetailExportRows(rows = [], filters = {}) {
  const waterDepartment = clean(filters.waterDepartment);
  const district = clean(filters.district);
  const shift = clean(filters.shift);
  const user = clean(filters.user);
  const dateFrom = clean(filters.dateFrom);
  const dateTo = clean(filters.dateTo);
  const recordTypes = Array.isArray(filters.recordTypes)
    ? filters.recordTypes.map((value) => clean(value).toLowerCase()).filter(Boolean)
    : [];

  return rows.filter((row) => {
    if (waterDepartment && waterDepartment !== "All" && row.water_department !== waterDepartment) return false;
    if (district && district !== "All Districts" && district !== "All") {
      if (district === "Unassigned") {
        if (row.district && row.district !== "Unassigned") return false;
      } else if (row.district !== district) {
        return false;
      }
    }
    if (shift && row.shift !== shift) return false;
    if (user && row.tested_by !== user) return false;
    if (dateFrom && row.date && row.date < dateFrom) return false;
    if (dateTo && row.date && row.date > dateTo) return false;
    if (recordTypes.length) {
      const type = clean(row.record_type).toLowerCase();
      const match = recordTypes.some((wanted) => type.includes(wanted) || wanted.includes(type));
      if (!match) return false;
    }
    return true;
  });
}

export function selectedHydrantExportColumns(columnIds = null) {
  const legacyMap = { address: "gps_location" };
  let ids = columnIds;
  if (Array.isArray(columnIds) && columnIds.length) {
    ids = columnIds.map((id) => legacyMap[id] || id);
  }
  if (!Array.isArray(ids) || !ids.length) {
    return HYDRANT_DETAIL_EXPORT_COLUMNS.filter((column) => column.default);
  }
  const wanted = new Set(ids);
  return HYDRANT_DETAIL_EXPORT_COLUMNS.filter((column) => wanted.has(column.id));
}

function columnsForPrintReport(columnIds = null) {
  const selected = selectedHydrantExportColumns(columnIds).filter((column) => (
    !["checklist_details", "record_id"].includes(column.id)
  ));
  const byId = new Map(selected.map((column) => [column.id, column]));
  for (const id of PDF_REQUIRED_COLUMN_IDS) {
    if (!byId.has(id)) {
      const column = HYDRANT_DETAIL_EXPORT_COLUMNS.find((item) => item.id === id);
      if (column) byId.set(id, column);
    }
  }
  // Keep table order from the master column list.
  return HYDRANT_DETAIL_EXPORT_COLUMNS.filter((column) => byId.has(column.id));
}

function csvEscape(value) {
  const printable = value && typeof value === "object" ? JSON.stringify(value) : value;
  return `"${String(printable ?? "").replaceAll('"', '""')}"`;
}

export function hydrantDetailRowsToCsv(rows = [], columnIds = null) {
  const columns = selectedHydrantExportColumns(columnIds);
  const headers = columns.map((column) => column.label);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column.id])).join(",")),
  ];
  return lines.join("\n");
}

export function downloadHydrantDetailCsv(filename, rows = [], columnIds = null) {
  const blob = new Blob([hydrantDetailRowsToCsv(rows, columnIds)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Flatten the department hydrant list into CSV-ready rows (browser export).
 * Drops embedded photo/file data so the CSV stays small and readable.
 */
export function hydrantsToCsvRows(hydrants = []) {
  return (hydrants || []).filter(Boolean).map((hydrant) => {
    const row = {};
    Object.entries(hydrant).forEach(([key, value]) => {
      if (/photo|file_?data|image/i.test(key)) return;
      if (typeof value === "string" && value.startsWith("data:")) return;
      row[key] = value;
    });
    return row;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Open a printable HTML report (browser Save as PDF).
 */
export function openHydrantDetailPrintReport({
  rows = [],
  filters = {},
  departmentName = "Department",
  columnIds = null,
} = {}) {
  const columns = columnsForPrintReport(columnIds);
  const filterSummary = [
    filters.waterDepartment && filters.waterDepartment !== "All" ? `Water dept: ${filters.waterDepartment}` : null,
    filters.district && filters.district !== "All Districts" && filters.district !== "All" ? `District: ${filters.district}` : null,
    filters.shift ? `Shift: ${filters.shift}` : null,
    filters.user ? `User: ${filters.user}` : null,
    filters.dateFrom || filters.dateTo
      ? `Dates: ${filters.dateFrom || "…"} → ${filters.dateTo || "…"}`
      : null,
    filters.recordTypes?.length ? `Types: ${filters.recordTypes.join(", ")}` : null,
  ].filter(Boolean).join(" · ") || "All records";

  const tableHead = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const tableBody = rows.length
    ? rows.map((row) => `
        <tr>
          ${columns.map((column) => {
            if (column.id === "nfpa_color") {
              const colorName = clean(row.nfpa_color) || "—";
              const swatch = nfpaColorForClass(row.nfpa_class);
              return `<td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:2px;background:${escapeHtml(swatch)};border:1px solid #999;flex:0 0 auto;"></span>${escapeHtml(colorName)}</span></td>`;
            }
            return `<td>${escapeHtml(row[column.id])}</td>`;
          }).join("")}
        </tr>
        ${row.checklist_details ? `<tr class="detail-row"><td colspan="${columns.length}"><strong>Checklist:</strong> ${escapeHtml(row.checklist_details)}</td></tr>` : ""}
      `).join("")
    : `<tr><td colspan="${columns.length}">No matching inspection or flow-test records.</td></tr>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(departmentName)} Hydrant Inspection & Flow Test Report</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { color: #444; margin-bottom: 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .detail-row td { background: #fafafa; font-size: 10px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(departmentName)} — Hydrant Inspection & Flow Test Report</h1>
  <div class="meta">
    <div>${escapeHtml(filterSummary)}</div>
    <div>${rows.length} record(s) · Generated ${escapeHtml(new Date().toLocaleString())}</div>
  </div>
  <table>
    <thead><tr>${tableHead}</tr></thead>
    <tbody>${tableBody}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  // Avoid noopener — it can return null / a blank tab when we need a printable window.
  const popup = window.open(url, "_blank", "width=1200,height=900");
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error("Pop-up blocked. Allow pop-ups to print the report.");
  }
  popup.focus();
  const triggerPrint = () => {
    try {
      popup.print();
    } catch {
      /* user can still use browser print from the open report */
    }
  };
  // Blob pages fire load when content is ready; also fall back if already complete.
  try {
    if (popup.document?.readyState === "complete") {
      setTimeout(triggerPrint, 150);
    } else {
      popup.addEventListener("load", () => setTimeout(triggerPrint, 150), { once: true });
      setTimeout(triggerPrint, 800);
    }
  } catch {
    setTimeout(triggerPrint, 500);
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export function buildHydrantDetailExportFilename(filters = {}) {
  const parts = ["hydrant-detail-report"];
  if (filters.dateFrom) parts.push(filters.dateFrom);
  if (filters.dateTo && filters.dateTo !== filters.dateFrom) parts.push(filters.dateTo);
  if (filters.district && !/^all/i.test(filters.district)) {
    parts.push(`d${String(filters.district).replace(/\s+/g, "")}`);
  }
  if (filters.shift) parts.push(String(filters.shift).replace(/\s+/g, ""));
  return `${parts.join("-").toLowerCase()}.csv`;
}
