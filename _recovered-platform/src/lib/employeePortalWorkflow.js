import { formatDayId, parseDayId, shiftForDate } from "./shiftCalendar.js";
import { defaultShiftRotation } from "../data/defaultShiftRotation.js";

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

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
  if (sorted.length === 1) {
    return formatDayId(parseDayId(sorted[0])).replace(/^0/, "");
  }
  const start = parseDayId(sorted[0]);
  const end = parseDayId(sorted[sorted.length - 1]);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`;
}

export function buildShiftTradeLabel(dayId = "", shift = "") {
  if (!dayId) return "";
  const date = parseDayId(dayId);
  const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return shift ? `${dateLabel} - ${shift}` : dateLabel;
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
