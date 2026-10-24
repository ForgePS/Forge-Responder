import { pendingForPerson } from "../lib/documentAcknowledgement.js";
import {
  formatDayId,
  parseDayId,
  resolveShiftRotation,
  shiftForDate,
  shiftShortLabel,
} from "../lib/shiftCalendar.js";

function trainingCompliancePercent(records = []) {
  if (!records.length) return 0;
  return Math.round(records.reduce((sum, record) => sum + Number(record.completion || 0), 0) / records.length);
}

export function buildDashboardStaffingRows({
  scheduleDays = [],
  liveDayMetrics = {},
  rotation = {},
  dayCount = 4,
  referenceDate = new Date(),
} = {}) {
  const resolvedRotation = resolveShiftRotation(rotation);
  const savedById = Object.fromEntries(
    (Array.isArray(scheduleDays) ? scheduleDays : [])
      .filter((day) => day && day.id)
      .map((day) => [day.id, day])
  );
  const rows = [];
  const cursor = parseDayId(formatDayId(referenceDate));

  for (let index = 0; index < dayCount; index += 1) {
    const id = formatDayId(cursor);
    const live = liveDayMetrics[id];
    const saved = savedById[id];
    const shift = shiftForDate(cursor, resolvedRotation);
    const dateLabel = cursor.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const staffed = live?.staffed ?? saved?.staffed ?? "—";
    const minimum = live?.minimum ?? saved?.minimum ?? "—";
    const status = live?.status ?? saved?.status ?? "—";

    rows.push([
      dateLabel,
      shiftShortLabel(shift) || shiftShortLabel(saved?.shift) || "—",
      staffed,
      minimum,
      status,
    ]);
    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
}

function parseMonthDay(value = "") {
  const match = String(value).match(/([A-Za-z]{3})\s+(\d{1,2})/);
  if (!match) return null;
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  return { month: months[match[1]], day: Number(match[2]) };
}

function isDueWithinDays(dateLabel, days = 30, reference = new Date(2026, 5, 10)) {
  const parsed = parseMonthDay(dateLabel);
  if (!parsed) return false;
  const due = new Date(reference.getFullYear(), parsed.month, parsed.day);
  if (due < reference) due.setFullYear(due.getFullYear() + 1);
  const diff = (due - reference) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

export function buildDashboardMetrics({
  personnel = [],
  certifications = [],
  training = [],
  apparatus = [],
  workOrders = [],
  assets = [],
  inspections = [],
  documents = [],
  scheduleDays = [],
  leaveRequests = [],
  shiftTrades = [],
  acknowledgementKeys: ackKeys = []
}) {
  const activePersonnel = personnel.filter((p) => p.status === "Active").length;
  const onDuty = personnel.filter((p) => p.status === "Active").length;
  const selectedDay = scheduleDays.find((day) => day.id === "2026-06-10") || scheduleDays[0] || {};
  const staffed = Number(selectedDay.staffed || onDuty);
  const minimum = Number(selectedDay.minimum || staffed);
  const staffingDeficit = Math.max(minimum - staffed, 0);
  const certsExpiring90 = certifications.filter((c) => Number(c.days) <= 90).length;
  const trainingCompliance = trainingCompliancePercent(training);
  const unitsAvailable = apparatus.filter((u) => u.status === "In Service").length;
  const unitsOos = apparatus.filter((u) => u.status === "Out of Service" || u.status === "PM Due").length;
  const inspectionsDue = inspections.filter((item) => /scheduled|overdue|pending|due/i.test(item.status)).length;
  const openTasks =
    workOrders.filter((w) => w.status !== "Complete").length +
    leaveRequests.filter((r) => r.status === "Pending").length +
    shiftTrades.filter((t) => /pending|awaiting/i.test(t.status || "")).length +
    pendingForPerson(documents, ackKeys).length +
    assets.filter((a) => a.status === "Inspection Due").length;
  const pendingAcknowledgements = pendingForPerson(documents, ackKeys).length;
  const assetInspectionsDue = assets.filter((a) => a.status === "Inspection Due" || isDueWithinDays(a.inspection, 30)).length;

  return {
    activePersonnel,
    onDuty,
    staffed,
    minimum,
    staffingDeficit,
    certsExpiring90,
    trainingCompliance,
    unitsAvailable,
    unitsOos,
    inspectionsDue,
    openTasks,
    pendingAcknowledgements,
    assetInspectionsDue,
    fleetReadiness: apparatus.map((unit) => [unit.unit, unit.status]),
    pendingTrades: shiftTrades.filter((t) => /pending|awaiting/i.test(t.status || "")),
    pendingLeave: leaveRequests.filter((r) => r.status === "Pending"),
    openWorkOrders: workOrders.filter((w) => !/Complete/.test(w.status)),
    overdueInspections: inspections.filter((i) => i.status === "Overdue"),
    expiringCerts: certifications.filter((c) => Number(c.days) <= 90 && Number(c.days) >= 0)
  };
}

export function exportCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
