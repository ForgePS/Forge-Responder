import { formatDayId, isPlatoonWorkDay, parseDayId, resolveNextPlatoonWorkDay, resolveShiftRotation, shiftForDate } from "./shiftCalendar.js";
import { defaultShiftRotation } from "../data/defaultShiftRotation.js";
import { normalizeEmployeePortalRules } from "./employeePortalRules.js";

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function stripDayTime(dayId = "") {
  const date = parseDayId(dayId);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export const VACATION_MAX_ADVANCE_DAYS = normalizeEmployeePortalRules().vacationMaxAdvanceDays;
export const SHIFT_TRADE_MAX_ADVANCE_MONTHS = normalizeEmployeePortalRules().shiftTradeMaxAdvanceMonths;

export const LEAVE_START_TIME_OPTIONS = Array.from({ length: 24 }, (_, index) => {
  const hour = (7 + index) % 24;
  return `${String(hour).padStart(2, "0")}00`;
});

export function formatTimeLabel(value = "") {
  const digits = String(value || "").replace(/\D/g, "").padStart(4, "0");
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function calculateEndTime(startTime = "0700", totalHours = 0) {
  const digits = String(startTime || "").replace(/\D/g, "").padStart(4, "0");
  const startMinutes = (parseInt(digits.slice(0, 2), 10) * 60) + parseInt(digits.slice(2), 10);
  const addedMinutes = Math.round(parseFloat(totalHours || 0) * 60);
  const endMinutes = startMinutes + addedMinutes;
  const wraps = endMinutes >= (24 * 60);
  const normalized = ((endMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mm = String(normalized % 60).padStart(2, "0");
  return {
    time: `${hh}${mm}`,
    label: `${hh}:${mm}${wraps ? " (next day)" : ""}`,
    nextDay: wraps,
  };
}

export function formatSelectedDatesLabel(selectedDates = []) {
  if (!selectedDates.length) return "";
  const sorted = [...selectedDates].sort();
  const labels = sorted.map((dayId) => (
    parseDayId(dayId).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  ));

  if (labels.length === 1) return labels[0];

  const allConsecutive = sorted.every((dayId, index) => {
    if (index === 0) return true;
    const previous = parseDayId(sorted[index - 1]);
    previous.setDate(previous.getDate() + 1);
    return formatDayId(previous) === dayId;
  });

  if (allConsecutive) {
    return `${labels[0]}-${labels[labels.length - 1]}`;
  }

  return labels.join(", ");
}

export function buildShiftTradeLabel(dayId = "", shift = "") {
  if (!dayId) return "";
  const date = parseDayId(dayId);
  const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return shift ? `${dateLabel} - ${shift}` : dateLabel;
}

export function isLieutenantRank(person = {}) {
  const rank = normalizeText(person.rank);
  return rank.includes("lieutenant") || /\blt\.?\b/.test(rank);
}

export function isLineMemberRole(person = {}) {
  const rank = normalizeText(person.rank);
  const position = normalizeText(person.position);
  const ems = normalizeText(person.ems);
  const driver = normalizeText(person.driver);

  if (rank.includes("firefighter")) return true;
  if (position.includes("driver") || driver.includes("approved") || driver.includes("trainee")) return true;
  if (ems.includes("paramedic")) return true;
  if (position.includes("emt") && position.includes("driver")) return true;
  if (position.includes("emt/driver")) return true;
  return false;
}

export function shouldShowOfficerBox(person = {}) {
  return isLineMemberRole(person);
}

export function resolveOfficerName(person = {}) {
  return String(person.supervisor || person.officer || "").trim();
}

export function findPersonnelByName(personnel = [], name = "") {
  const target = normalizeText(name);
  if (!target) return null;
  return personnel.find((person) => normalizeText(person.name) === target)
    || personnel.find((person) => {
      const personName = normalizeText(person.name);
      return personName.includes(target) || target.includes(personName);
    })
    || null;
}

export function resolveShiftBattalionChief(personnel = [], shift = "") {
  const normalizedShift = normalizeText(shift);
  if (!normalizedShift) return null;

  return personnel.find((person) => (
    normalizeText(person.rank).includes("battalion chief")
    && normalizeText(person.shift) === normalizedShift
  )) || personnel.find((person) => normalizeText(person.rank).includes("battalion chief")) || null;
}

export function requiresOfficerApprovalForLeave(person = {}, leaveType = "") {
  if (isLieutenantRank(person)) return false;
  return isLineMemberRole(person) && normalizeText(leaveType).includes("vacation");
}

export function requiresDirectBattalionApproval(leaveType = "") {
  const normalized = normalizeText(leaveType);
  return normalized.includes("sick") || normalized.includes("military");
}

export function buildLeaveApprovalMeta(person = {}, personnel = [], leaveType = "") {
  const officerName = resolveOfficerName(person);
  const officer = findPersonnelByName(personnel, officerName);
  const battalionChief = resolveShiftBattalionChief(personnel, person.shift);

  if (requiresOfficerApprovalForLeave(person, leaveType)) {
    return {
      approvalRoute: "officer-then-battalion",
      approvalStage: "officer",
      status: "Pending Officer Approval",
      assignedOfficer: officerName || "Not assigned",
      assignedOfficerId: officer?.id || "",
      assignedBattalionChief: battalionChief?.name || `${person.shift || "Shift"} Battalion Chief`,
      assignedBattalionChiefId: battalionChief?.id || "",
    };
  }

  if (requiresDirectBattalionApproval(leaveType)) {
    return {
      approvalRoute: "direct-battalion",
      approvalStage: "battalionChief",
      status: "Pending Battalion Chief",
      assignedOfficer: "",
      assignedOfficerId: "",
      assignedBattalionChief: battalionChief?.name || `${person.shift || "Shift"} Battalion Chief`,
      assignedBattalionChiefId: battalionChief?.id || "",
    };
  }

  return {
    approvalRoute: "battalion",
    approvalStage: "battalionChief",
    status: "Pending Battalion Chief",
    assignedOfficer: officerName || "",
    assignedOfficerId: officer?.id || "",
    assignedBattalionChief: battalionChief?.name || `${person.shift || "Shift"} Battalion Chief`,
    assignedBattalionChiefId: battalionChief?.id || "",
  };
}

export function isLeavePending(request = {}) {
  return /pending/i.test(String(request.status || ""));
}

export function resolveLeaveStatusBucket(request = {}) {
  const status = String(request.status || "").trim();
  if (/^approved$/i.test(status)) return "Approved";
  if (/^denied$/i.test(status)) return "Denied";
  if (isLeavePending(request)) return "Pending";
  return "Other";
}

export function leaveStatusDetail(item = {}) {
  if (item.approvalStage === "officer") {
    return `${item.status} · ${item.assignedOfficer || "Officer"}`;
  }
  if (item.approvalStage === "battalionChief") {
    return `${item.status} · ${item.assignedBattalionChief || "Battalion Chief"}`;
  }
  return item.status || "—";
}

export function matchesLeaveEmployeeSearch(request = {}, query = "") {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return true;
  const person = String(request.person || "").toLowerCase();
  const personnelId = String(request.personnelId || "").toLowerCase();
  return person.includes(normalized) || personnelId.includes(normalized);
}

export function isLeaveFinalApproval(request = {}, decision = "") {
  if (decision === "Denied") return true;
  if (request.approvalStage === "officer") return false;
  return true;
}

export function advanceLeaveApproval(request = {}, decision = "Approved") {
  if (decision === "Denied") {
    return {
      leavePatch: {
        status: "Denied",
        approvalStage: "complete",
        deniedAt: new Date().toISOString(),
      },
      isFinal: true,
      message: "Leave request denied.",
    };
  }

  if (request.approvalStage === "officer") {
    return {
      leavePatch: {
        status: "Pending Battalion Chief",
        approvalStage: "battalionChief",
        officerApprovedAt: new Date().toISOString(),
      },
      isFinal: false,
      message: `Officer approved. Sent to ${request.assignedBattalionChief || "Battalion Chief"} for final approval.`,
    };
  }

  return {
    leavePatch: {
      status: "Approved",
      approvalStage: "complete",
      battalionApprovedAt: new Date().toISOString(),
    },
    isFinal: true,
    message: "Leave request fully approved.",
  };
}

export function shiftLabelForDay(dayId = "", rotation = defaultShiftRotation) {
  if (!dayId) return "";
  return shiftForDate(parseDayId(dayId), rotation);
}

export function isEmployeeShiftWorkDay(dayId = "", employeeShift = "", rotation = defaultShiftRotation) {
  if (!dayId || !employeeShift) return false;
  return isPlatoonWorkDay(parseDayId(dayId), employeeShift, rotation);
}

export function isOppositeShiftWorkDay(dayId = "", employeeShift = "", rotation = defaultShiftRotation) {
  if (!dayId || !employeeShift) return false;
  const resolved = resolveShiftRotation(rotation);
  const dayShift = shiftForDate(parseDayId(dayId), resolved);
  return normalizeText(dayShift) !== normalizeText(employeeShift);
}

export function isActiveLeaveRequest(request = {}) {
  const status = String(request.status || "");
  if (/denied|cancelled/i.test(status)) return false;
  return /approved|pending|officer|battalion/i.test(status);
}

export function buildLeaveCountByDay(leaveRequests = []) {
  const counts = {};
  (Array.isArray(leaveRequests) ? leaveRequests : []).forEach((request) => {
    if (!isActiveLeaveRequest(request)) return;
    const dayIds = Array.isArray(request.selectedDates) ? request.selectedDates : [];
    dayIds.forEach((dayId) => {
      if (!dayId) return;
      counts[dayId] = (counts[dayId] || 0) + 1;
    });
  });
  return counts;
}

export function resolveDayOffCount(dayId = "", leaveCountByDay = {}, scheduleLeave = 0) {
  const fromRequests = leaveCountByDay[dayId];
  if (typeof fromRequests === "number" && fromRequests > 0) return fromRequests;
  return Math.max(0, parseInt(scheduleLeave, 10) || 0);
}

export function addCalendarMonths(date, months = 0) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function isDayWithinRange(dayId = "", minDateId = "", maxDateId = "") {
  if (!dayId) return false;
  const dayTime = stripDayTime(dayId);
  if (minDateId && dayTime < stripDayTime(minDateId)) return false;
  if (maxDateId && dayTime > stripDayTime(maxDateId)) return false;
  return true;
}

export function filterDayIdsInRange(dayIds = [], minDateId = "", maxDateId = "") {
  return dayIds.filter((dayId) => isDayWithinRange(dayId, minDateId, maxDateId));
}

export function formatDayIdLabel(dayId = "") {
  if (!dayId) return "";
  return parseDayId(dayId).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatSelectableDateRange(minDateId = "", maxDateId = "") {
  if (minDateId && maxDateId) {
    return `${formatDayIdLabel(minDateId)} – ${formatDayIdLabel(maxDateId)}`;
  }
  if (maxDateId) return `through ${formatDayIdLabel(maxDateId)}`;
  if (minDateId) return `starting ${formatDayIdLabel(minDateId)}`;
  return "";
}

export function resolveEarliestWorkDate(
  person = {},
  rotation = defaultShiftRotation,
  fromDate = new Date()
) {
  const shift = normalizeText(person.shift || "");
  const resolved = resolveShiftRotation(rotation);
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());

  if (!shift) return formatDayId(start);

  const nextDayId = resolveNextPlatoonWorkDay(person.shift || "", resolved, start, { includeToday: true });
  return nextDayId || formatDayId(start);
}

export function buildShiftTradeDateWindow(
  person = {},
  rotation = defaultShiftRotation,
  fromDate = new Date(),
  rules = {}
) {
  const { shiftTradeMaxAdvanceMonths } = normalizeEmployeePortalRules(rules);
  const earliestWorkDate = resolveEarliestWorkDate(person, rotation, fromDate);
  const maxDate = formatDayId(
    addCalendarMonths(parseDayId(earliestWorkDate), shiftTradeMaxAdvanceMonths)
  );

  return {
    minDate: earliestWorkDate,
    maxDate,
    earliestWorkDate,
    maxAdvanceMonths: shiftTradeMaxAdvanceMonths,
  };
}

export function buildVacationDateWindow(fromDate = new Date(), rules = {}) {
  const { vacationMaxAdvanceDays } = normalizeEmployeePortalRules(rules);
  const minDate = formatDayId(fromDate);
  const end = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  end.setDate(end.getDate() + vacationMaxAdvanceDays);
  return {
    minDate,
    maxDate: formatDayId(end),
    maxAdvanceDays: vacationMaxAdvanceDays,
  };
}

export function isVacationLeaveType(leaveType = "") {
  return normalizeText(leaveType).includes("vacation");
}

export function validateSelectedDatesInRange(selectedDates = [], minDateId = "", maxDateId = "") {
  const invalidDates = selectedDates.filter(
    (dayId) => !isDayWithinRange(dayId, minDateId, maxDateId)
  );
  return {
    valid: invalidDates.length === 0,
    invalidDates,
  };
}

export function resolveAffectedBattalionChiefs(personnel = [], giveShift = "", receiveShift = "") {
  const chiefs = [];
  const seen = new Set();

  [giveShift, receiveShift].forEach((shift) => {
    const chief = resolveShiftBattalionChief(personnel, shift);
    if (!chief) return;
    const key = chief.id || chief.name;
    if (seen.has(key)) return;
    seen.add(key);
    chiefs.push({
      personnelId: chief.id || "",
      name: chief.name,
      shift: chief.shift || shift,
    });
  });

  return chiefs;
}

export function buildShiftTradeApprovalMeta(
  personnel = [],
  tradeForm = {},
  rotation = defaultShiftRotation
) {
  const coveragePerson = findPersonnelByName(personnel, tradeForm.coverage);
  const giveShift = tradeForm.giveShift || shiftLabelForDay(tradeForm.giveDayId, rotation);
  const receiveShift = tradeForm.receiveShift || shiftLabelForDay(tradeForm.receiveDayId, rotation);

  return {
    approvalStage: "coverageMember",
    status: "Awaiting Member",
    assignedCoverageMember: coveragePerson?.name || tradeForm.coverage,
    coveragePersonnelId: coveragePerson?.id || "",
    assignedBattalionChiefs: resolveAffectedBattalionChiefs(personnel, giveShift, receiveShift),
    battalionApprovals: [],
  };
}

export function buildShiftTradeApprovalHint(tradeForm = {}) {
  if (!tradeForm.coverage) {
    return "Select the member you are trading with. They must approve before the request goes to the affected Battalion Chiefs.";
  }
  return `${tradeForm.coverage} must approve first. Then both Battalion Chiefs for the shifts involved will review the trade.`;
}

export function inferShiftTradeStage(trade = {}) {
  if (trade.approvalStage && trade.approvalStage !== "complete") return trade.approvalStage;
  if (/awaiting member/i.test(trade.status || "")) return "coverageMember";
  if (/pending battalion|pending review/i.test(trade.status || "")) return "battalionChief";
  if (/approved|denied/i.test(trade.status || "")) return "complete";
  return "coverageMember";
}

export function isShiftTradePending(trade = {}) {
  return /pending|awaiting/i.test(trade.status || "") && inferShiftTradeStage(trade) !== "complete";
}

function matchesCoverageMember(trade, myPerson, membership) {
  const coverageId = trade.coveragePersonnelId || "";
  const personId = myPerson?.id || membership?.personnelId || "";
  if (coverageId && personId && coverageId === personId) return true;

  const coverageName = trade.assignedCoverageMember || trade.coverage || "";
  const personName = myPerson?.name || membership?.displayName || "";
  return normalizeText(coverageName) === normalizeText(personName);
}

function battalionChiefAlreadyApproved(trade, person) {
  const approvals = Array.isArray(trade.battalionApprovals) ? trade.battalionApprovals : [];
  return approvals.some((entry) => (
    (person?.id && entry.personnelId === person.id)
    || normalizeText(entry.name) === normalizeText(person?.name)
  ));
}

function isAssignedBattalionChief(trade, person) {
  const chiefs = trade.assignedBattalionChiefs || [];
  return chiefs.some((chief) => (
    (person?.id && chief.personnelId === person.id)
    || normalizeText(chief.name) === normalizeText(person?.name)
  ));
}

export function getPendingBattalionChiefs(trade = {}) {
  const required = trade.assignedBattalionChiefs || [];
  const approvals = Array.isArray(trade.battalionApprovals) ? trade.battalionApprovals : [];
  return required.filter((chief) => !approvals.some((entry) => (
    (chief.personnelId && entry.personnelId === chief.personnelId)
    || normalizeText(entry.name) === normalizeText(chief.name)
    || (chief.shift && normalizeText(entry.shift) === normalizeText(chief.shift))
  )));
}

export function resolveShiftTradeActionRole(trade = {}, myPerson = null, membership = {}) {
  if (!isShiftTradePending(trade) || (!myPerson && !membership?.displayName)) return null;
  const stage = inferShiftTradeStage(trade);

  if (stage === "coverageMember") {
    return matchesCoverageMember(trade, myPerson, membership) ? "coverageMember" : null;
  }

  if (stage === "battalionChief") {
    if (!myPerson || battalionChiefAlreadyApproved(trade, myPerson)) return null;
    return isAssignedBattalionChief(trade, myPerson) ? "battalionChief" : null;
  }

  return null;
}

export function shiftTradeStatusDetail(trade = {}) {
  const stage = inferShiftTradeStage(trade);
  if (stage === "coverageMember") {
    return `${trade.status} · ${trade.assignedCoverageMember || trade.coverage || "Coverage member"}`;
  }
  if (stage === "battalionChief") {
    const pending = getPendingBattalionChiefs(trade);
    if (pending.length) {
      return `${trade.status} · ${pending.map((chief) => chief.name).join(" & ")}`;
    }
    const chiefs = trade.assignedBattalionChiefs || [];
    if (chiefs.length) {
      return `${trade.status} · ${chiefs.map((chief) => chief.name).join(" & ")}`;
    }
  }
  return trade.status || "";
}

export function advanceShiftTradeApproval(trade = {}, decision = "Approved", approver = {}) {
  const stage = inferShiftTradeStage(trade);

  if (decision === "Denied") {
    return {
      tradePatch: {
        status: "Denied",
        approvalStage: "complete",
        deniedAt: new Date().toISOString(),
        deniedBy: approver.name || "",
      },
      isFinal: true,
      message: "Shift trade denied.",
    };
  }

  if (stage === "coverageMember") {
    const chiefs = trade.assignedBattalionChiefs || [];
    const chiefLabel = chiefs.map((chief) => chief.name).join(" and ") || "Battalion Chiefs";
    return {
      tradePatch: {
        status: "Pending Battalion Chief",
        approvalStage: "battalionChief",
        coverageApprovedAt: new Date().toISOString(),
        coverageApprovedBy: approver.name || trade.assignedCoverageMember || trade.coverage || "",
      },
      isFinal: false,
      message: `Coverage member approved. Sent to ${chiefLabel} for final approval.`,
    };
  }

  if (stage === "battalionChief") {
    const required = trade.assignedBattalionChiefs || [];
    if (!required.length) {
      return {
        tradePatch: {
          status: "Approved",
          approvalStage: "complete",
          approvedAt: new Date().toISOString(),
        },
        isFinal: true,
        message: "Shift trade approved.",
      };
    }

    const chiefEntry = {
      personnelId: approver.personnelId || approver.id || "",
      name: approver.name || "",
      shift: approver.shift || "",
      approvedAt: new Date().toISOString(),
    };
    const nextApprovals = [
      ...(Array.isArray(trade.battalionApprovals) ? trade.battalionApprovals : []),
      chiefEntry,
    ];
    const pending = getPendingBattalionChiefs({ ...trade, battalionApprovals: nextApprovals });

    if (pending.length) {
      return {
        tradePatch: {
          battalionApprovals: nextApprovals,
          status: "Pending Battalion Chief",
          approvalStage: "battalionChief",
        },
        isFinal: false,
        message: `Approved. Awaiting ${pending.map((chief) => chief.name).join(" and ")}.`,
      };
    }

    return {
      tradePatch: {
        status: "Approved",
        approvalStage: "complete",
        battalionApprovals: nextApprovals,
        approvedAt: new Date().toISOString(),
      },
      isFinal: true,
      message: "Shift trade fully approved.",
    };
  }

  return {
    tradePatch: {
      status: "Approved",
      approvalStage: "complete",
      approvedAt: new Date().toISOString(),
    },
    isFinal: true,
    message: "Shift trade approved.",
  };
}
