import { DAMAGE_SEVERITIES } from "./defaults.js";
import { getSlaSnapshot } from "./slaHelpers.js";

const CLOSED = new Set(["closed", "cancelled", "duplicate", "verified"]);

function msBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

function averageMs(values = []) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "—";
  const hours = ms / 3_600_000;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/**
 * Build KPI / breakdown metrics for the damage reporting dashboard.
 * @param {object[]} reports
 * @param {number} [nowMs]
 */
export function buildHydrantDamageAnalytics(reports = [], nowMs = Date.now()) {
  const open = reports.filter((row) => !CLOSED.has(row.status));
  const critical = open.filter((row) => {
    const rank = DAMAGE_SEVERITIES.find((s) => s.id === row.severity)?.rank || 0;
    return rank >= 4 || row.severity === "immediate_hazard";
  });
  const outOfService = open.filter((row) =>
    ["out_of_service", "missing", "temporarily_unavailable"].includes(row.operationalStatus)
  );
  const leaks = open.filter((row) => row.leaking);
  const awaitingAck = open.filter((row) => ["sent", "awaiting_acknowledgment", "escalated"].includes(row.status));
  const ownership = open.filter((row) => row.status === "ownership_review_required");
  const deliveryFailures = reports.filter((row) => ["failed", "bounced", "rejected"].includes(row.emailStatus));
  const readyVerify = open.filter((row) =>
    ["ready_for_verification", "verification_scheduled", "repair_completed", "temporary_repair_completed"].includes(row.status)
  );

  let ackOverdue = 0;
  let repairOverdue = 0;
  let verificationOverdue = 0;
  let slaOnTrack = 0;
  let slaEvaluated = 0;

  for (const row of open) {
    const snap = getSlaSnapshot(row, nowMs);
    if (snap.paused) continue;
    slaEvaluated += 1;
    if (!snap.overdue) slaOnTrack += 1;
    if (snap.reasons.some((r) => /Acknowledgment/i.test(r))) ackOverdue += 1;
    if (snap.reasons.some((r) => /Repair/i.test(r))) repairOverdue += 1;
    if (snap.reasons.some((r) => /verification/i.test(r))) verificationOverdue += 1;
  }

  const ackTimes = reports
    .map((row) => msBetween(row.sentAt || row.createdAt, row.acknowledgedAt))
    .filter((v) => v !== null);
  const repairTimes = reports
    .map((row) => msBetween(row.sentAt || row.createdAt, row.repairCompletedAt || row.verifiedAt || row.closedAt))
    .filter((v) => v !== null);

  const byCompany = new Map();
  const byDistrict = new Map();
  const byHydrant = new Map();

  for (const row of reports) {
    const companyKey = row.waterCompanyId || row.waterCompanyName || "Unknown";
    const companyLabel = row.waterCompanyName || "Unknown company";
    if (!byCompany.has(companyKey)) {
      byCompany.set(companyKey, { id: companyKey, label: companyLabel, total: 0, open: 0, overdue: 0 });
    }
    const company = byCompany.get(companyKey);
    company.total += 1;
    if (!CLOSED.has(row.status)) company.open += 1;
    if (getSlaSnapshot(row, nowMs).overdue) company.overdue += 1;

    const districtKey = row.waterDistrictId || row.waterDistrictName || "Unassigned";
    const districtLabel = row.waterDistrictName || "Unassigned district";
    if (!byDistrict.has(districtKey)) {
      byDistrict.set(districtKey, { id: districtKey, label: districtLabel, total: 0, open: 0 });
    }
    const district = byDistrict.get(districtKey);
    district.total += 1;
    if (!CLOSED.has(row.status)) district.open += 1;

    const hydrantKey = row.hydrantId || row.hydrantLabel || "";
    if (hydrantKey) {
      byHydrant.set(hydrantKey, (byHydrant.get(hydrantKey) || 0) + 1);
    }
  }

  const repeatDamage = [...byHydrant.entries()]
    .filter(([, count]) => count >= 2)
    .map(([hydrantId, count]) => ({ hydrantId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const avgAckMs = averageMs(ackTimes);
  const avgRepairMs = averageMs(repairTimes);
  const slaCompliance = slaEvaluated ? Math.round((slaOnTrack / slaEvaluated) * 100) : null;

  return {
    kpis: {
      open: open.length,
      outOfService: outOfService.length,
      critical: critical.length,
      activeLeaks: leaks.length,
      awaitingAcknowledgment: awaitingAck.length,
      acknowledgmentOverdue: ackOverdue,
      repairOverdue: repairOverdue,
      readyForVerification: readyVerify.length,
      verificationOverdue: verificationOverdue,
      unknownOwnership: ownership.length,
      deliveryFailures: deliveryFailures.length,
      averageAcknowledgment: formatDuration(avgAckMs),
      averageRepair: formatDuration(avgRepairMs),
      slaCompliancePercent: slaCompliance,
      total: reports.length,
    },
    byCompany: [...byCompany.values()].sort((a, b) => b.open - a.open || b.total - a.total),
    byDistrict: [...byDistrict.values()].sort((a, b) => b.open - a.open || b.total - a.total),
    repeatDamage,
  };
}

/**
 * @param {object[]} reports
 * @returns {string} CSV text
 */
export function exportHydrantDamageReportsCsv(reports = []) {
  const headers = [
    "reportNumber",
    "hydrantId",
    "address",
    "waterCompany",
    "waterDistrict",
    "severity",
    "operationalStatus",
    "status",
    "emailStatus",
    "acknowledgmentDueAt",
    "repairTargetAt",
    "verificationDueAt",
    "sentAt",
    "acknowledgedAt",
    "verifiedAt",
    "utilityWorkOrderNumber",
    "leaking",
    "roadwayHazard",
  ];
  const escape = (value) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(",")];
  for (const row of reports) {
    lines.push([
      row.reportNumber,
      row.hydrantLabel || row.hydrantId,
      row.hydrantAddress,
      row.waterCompanyName,
      row.waterDistrictName,
      row.severityLabel || row.severity,
      row.operationalStatusLabel || row.operationalStatus,
      row.statusLabel || row.status,
      row.emailStatusLabel || row.emailStatus,
      row.acknowledgmentDueAt,
      row.repairTargetAt,
      row.verificationDueAt,
      row.sentAt,
      row.acknowledgedAt,
      row.verifiedAt,
      row.utilityWorkOrderNumber,
      row.leaking ? "yes" : "no",
      row.roadwayHazard ? "yes" : "no",
    ].map(escape).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Trigger a browser download for CSV content.
 * @param {string} csv
 * @param {string} [filename]
 */
export function downloadCsv(csv, filename = "hydrant-damage-reports.csv") {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
