import {
  buildPersonnelAccrualRecord,
  formatAccrualHours,
  normalizePersonnelAccruals,
  parseAccrualHours,
  PERSONNEL_ACCRUAL_TYPES,
} from "./personnelAccruals.js";
import { normalizePersonnelRecord } from "./personnelSchema.js";

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function parseLeaveHours(value = "") {
  return parseAccrualHours(value);
}

export function resolveLeaveAccrualType(leaveType = "") {
  const normalized = normalizeText(leaveType);
  if (normalized.includes("sick")) return "sick";
  if (normalized.includes("vac")) return "vacation";
  return null;
}

export function findPersonnelForLeaveRequest(personnel = [], request = {}) {
  if (request.personnelId) {
    const byId = personnel.find((person) => person.id === request.personnelId);
    if (byId) return byId;
  }

  const personName = normalizeText(request.person);
  if (!personName) return null;

  const exact = personnel.find((person) => normalizeText(person.name) === personName);
  if (exact) return exact;

  return personnel.find((person) => {
    const name = normalizeText(person.name);
    return name.includes(personName) || personName.includes(name);
  }) || null;
}

function accrualLabel(typeId = "") {
  return PERSONNEL_ACCRUAL_TYPES.find((item) => item.id === typeId)?.label || typeId;
}

function adjustPersonLeaveHours(person = {}, leaveRequest = {}, direction = 1) {
  const accrualType = resolveLeaveAccrualType(leaveRequest.type);
  if (!accrualType) {
    return { person, applied: false, reason: "unsupported-leave-type" };
  }

  const hours = parseLeaveHours(
    direction < 0
      ? (leaveRequest.accrualDeductedHours ?? leaveRequest.hours)
      : leaveRequest.hours
  );
  if (!hours) {
    return { person, applied: false, reason: "no-hours" };
  }

  const accruals = normalizePersonnelAccruals(person.accruals, person);
  const nextAccruals = accruals.map((row) => {
    if (row.type !== accrualType) return row;
    const nextUsed = Math.max(0, parseAccrualHours(row.used) + (hours * direction));
    return buildPersonnelAccrualRecord({
      ...row,
      used: nextUsed,
    });
  });

  return {
    person: normalizePersonnelRecord({ ...person, accruals: nextAccruals }),
    applied: true,
    accrualType,
    hours,
  };
}

export function deductLeaveHoursFromPerson(person = {}, leaveRequest = {}) {
  return adjustPersonLeaveHours(person, leaveRequest, 1);
}

export function restoreLeaveHoursToPerson(person = {}, leaveRequest = {}) {
  return adjustPersonLeaveHours(person, leaveRequest, -1);
}

export function processLeaveDecision(request = {}, status = "", personnel = []) {
  const leavePatch = { status };
  const wasApproved = request.status === "Approved";
  const willApprove = status === "Approved";
  const alreadyDeducted = Boolean(request.accrualDeducted);
  let nextPersonnel = personnel;
  let message = `Leave request ${status.toLowerCase()}.`;

  if (willApprove && !wasApproved && !alreadyDeducted) {
    const person = findPersonnelForLeaveRequest(personnel, request);
    const accrualType = resolveLeaveAccrualType(request.type);

    if (!person) {
      message = "Leave approved, but the member was not found in Personnel — accruals were not updated.";
      return { personnel: nextPersonnel, leavePatch, message, personnelChanged: false };
    }

    if (!accrualType) {
      message = `Leave approved. ${request.type || "This leave type"} does not deduct from sick or vacation balances.`;
      return { personnel: nextPersonnel, leavePatch, message, personnelChanged: false };
    }

    const result = deductLeaveHoursFromPerson(person, request);
    if (!result.applied) {
      message = "Leave approved, but no hours could be deducted — check the request hours.";
      return { personnel: nextPersonnel, leavePatch, message, personnelChanged: false };
    }

    nextPersonnel = personnel.map((item) => (
      item.id === result.person.id ? result.person : item
    ));
    Object.assign(leavePatch, {
      accrualDeducted: true,
      accrualDeductedHours: result.hours,
      accrualType: result.accrualType,
    });
    message = `Leave approved. ${formatAccrualHours(result.hours)} deducted from ${accrualLabel(result.accrualType)} balance.`;
    return { personnel: nextPersonnel, leavePatch, message, personnelChanged: true };
  }

  if (!willApprove && wasApproved && alreadyDeducted) {
    const person = findPersonnelForLeaveRequest(personnel, request);
    if (person) {
      const result = restoreLeaveHoursToPerson(person, request);
      if (result.applied) {
        nextPersonnel = personnel.map((item) => (
          item.id === result.person.id ? result.person : item
        ));
        leavePatch.accrualDeducted = false;
        leavePatch.accrualDeductedHours = 0;
        leavePatch.accrualType = "";
        message = `Leave request ${status.toLowerCase()}. ${formatAccrualHours(result.hours)} restored to ${accrualLabel(result.accrualType)} balance.`;
        return { personnel: nextPersonnel, leavePatch, message, personnelChanged: true };
      }
    }
  }

  return { personnel: nextPersonnel, leavePatch, message, personnelChanged: false };
}
