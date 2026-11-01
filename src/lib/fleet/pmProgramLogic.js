/**
 * Pure (firebase-free) helpers for maintenance schedules (preventive maintenance programs).
 * Kept separate from fleetPmService.js so they can be unit tested in Node.
 */
import { addCalendarInterval, daysBetween } from "./pmDefaults.js";

export const METER_TRIGGERS = ["mileage", "engine_hours", "pump_hours"];

/** Plain-language wording for each trigger. `warnUnit` is the unit used for "warn ahead" / "overdue after". */
const TRIGGER_WORDING = {
  calendar_months: { label: "Months (calendar)", unit: "months", unitOne: "month", warnUnit: "days" },
  calendar_days: { label: "Days (calendar)", unit: "days", unitOne: "day", warnUnit: "days" },
  mileage: { label: "Miles driven", unit: "miles", unitOne: "mile", warnUnit: "miles" },
  engine_hours: { label: "Engine hours", unit: "engine hours", unitOne: "engine hour", warnUnit: "engine hours" },
  pump_hours: { label: "Pump hours", unit: "pump hours", unitOne: "pump hour", warnUnit: "pump hours" },
  manual: { label: "Set date by hand", unit: "", unitOne: "", warnUnit: "days" },
};

/**
 * @param {string} triggerType
 */
export function triggerWording(triggerType) {
  return TRIGGER_WORDING[triggerType] || TRIGGER_WORDING.calendar_months;
}

/**
 * Trigger options for a picker. "manual" is only offered when the program already uses it,
 * because the builder has no way to set a fixed date.
 * @param {string} [currentTrigger]
 */
export function triggerOptions(currentTrigger = "") {
  return Object.entries(TRIGGER_WORDING)
    .filter(([id]) => id !== "manual" || currentTrigger === "manual")
    .map(([id, row]) => ({ id, label: row.label }));
}

function formatNumber(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-US");
}

/**
 * "Every 12 months", "Every 5,000 miles", "Every 1 engine hour".
 * @param {{ triggerType?: string, intervalValue?: number }} program
 */
export function describeInterval(program = {}) {
  const wording = triggerWording(program.triggerType);
  if (program.triggerType === "manual") return "Date set by hand";
  const value = Number(program.intervalValue) || 0;
  return `Every ${formatNumber(value)} ${value === 1 ? wording.unitOne : wording.unit}`;
}

/**
 * @param {number|string} value
 * @param {string} unit
 */
export function describeAmount(value, unit) {
  const n = Number(value) || 0;
  if (!n) return "";
  const singular = unit.endsWith("s") && n === 1 ? unit.slice(0, -1) : unit;
  return `${formatNumber(n)} ${singular}`;
}

/**
 * Does this program apply to the given unit? Empty class list = all vehicle types.
 * @param {{ applicableClassIds?: string[] }} program
 * @param {{ fleetClassId?: string }} asset
 */
export function programAppliesToAsset(program = {}, asset = {}) {
  const ids = Array.isArray(program.applicableClassIds) ? program.applicableClassIds : [];
  if (!ids.length) return true;
  return ids.includes(asset.fleetClassId);
}

export function parseNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve current meter value for a trigger type from an asset.
 * @param {object} asset
 * @param {string} triggerType
 */
export function resolveAssetMeter(asset = {}, triggerType = "") {
  if (triggerType === "mileage") return parseNumber(asset.mileage);
  if (triggerType === "engine_hours") return parseNumber(asset.engineHours);
  if (triggerType === "pump_hours") return parseNumber(asset.pumpHours);
  return null;
}

/**
 * Compute next due fields after a completion (or initial baseline).
 * @param {object} program
 * @param {{ completedAt?: string, completedMeter?: number|string|null, nextDueAt?: string, nextDueMeter?: number|string }} [basis]
 */
export function computeNextDue(program = {}, basis = {}) {
  const triggerType = program.triggerType || "calendar_months";
  const interval = Number(program.intervalValue) || 0;
  const completedAt = basis.completedAt || new Date().toISOString();
  const completedMeter = parseNumber(basis.completedMeter);

  if (triggerType === "calendar_days" || triggerType === "calendar_months") {
    return {
      nextDueAt: addCalendarInterval(completedAt, triggerType === "calendar_days" ? "days" : "months", interval),
      nextDueMeter: "",
      lastCompletedAt: completedAt,
      lastCompletedMeter: completedMeter ?? "",
    };
  }
  if (METER_TRIGGERS.includes(triggerType)) {
    return {
      nextDueAt: "",
      nextDueMeter: completedMeter == null ? "" : completedMeter + interval,
      lastCompletedAt: completedAt,
      lastCompletedMeter: completedMeter ?? "",
    };
  }
  return {
    nextDueAt: basis.nextDueAt || "",
    nextDueMeter: basis.nextDueMeter ?? "",
    lastCompletedAt: completedAt,
    lastCompletedMeter: completedMeter ?? "",
  };
}

/**
 * Evaluate schedule due status against asset meters / calendar.
 * Calendar triggers measure "warn ahead" and "overdue after" in days.
 * @param {object} schedule
 * @param {object} [asset]
 * @param {string} [now]
 */
export function evaluatePmScheduleStatus(schedule = {}, asset = {}, now = new Date().toISOString()) {
  const triggerType = schedule.triggerType || "calendar_months";
  const grace = Number(schedule.graceValue) || 0;
  const dueSoon = Number(schedule.dueSoonValue) || 0;

  if (METER_TRIGGERS.includes(triggerType)) {
    const current = resolveAssetMeter(asset, triggerType);
    const due = parseNumber(schedule.nextDueMeter);
    if (current == null || due == null) {
      return { status: "ok", remaining: null, label: "No meter baseline" };
    }
    const remaining = due - current;
    if (remaining < -grace) return { status: "overdue", remaining, label: `${Math.abs(remaining)} over` };
    if (remaining <= 0) return { status: "due_now", remaining, label: "Due now" };
    if (dueSoon > 0 && remaining <= dueSoon) {
      return { status: "due_soon", remaining, label: `${remaining} remaining` };
    }
    return { status: "ok", remaining, label: `${remaining} remaining` };
  }

  if (!schedule.nextDueAt) {
    return { status: "ok", remaining: null, label: "No due date" };
  }
  const days = daysBetween(now, schedule.nextDueAt);
  if (days == null) return { status: "ok", remaining: null, label: "Invalid due date" };
  if (days < -grace) return { status: "overdue", remaining: days, label: `${Math.abs(days)} days overdue` };
  if (days <= 0) return { status: "due_now", remaining: days, label: "Due now" };
  if (dueSoon > 0 && days <= dueSoon) {
    return { status: "due_soon", remaining: days, label: `Due in ${days} days` };
  }
  return { status: "ok", remaining: days, label: `Due in ${days} days` };
}

/**
 * Work out how an existing schedule must change after its program was edited.
 * Keeps the last-completed date (history); only recalculates the next due point
 * from it. Returns null when nothing needs to change (idempotent).
 *
 * @param {object} program  normalized program (with active/archived flags)
 * @param {object} schedule normalized schedule
 * @param {object} [asset]  the unit (for class eligibility and meter baseline); null if the unit no longer exists
 * @param {string} [now]
 */
export function buildScheduleSyncPatch(program = {}, schedule = {}, asset = null, now = new Date().toISOString()) {
  const inUse = program.active !== false && !program.archived;
  const eligible = asset ? programAppliesToAsset(program, asset) : false;
  const shouldBeActive = inUse && eligible;

  const patch = {
    programName: program.name || schedule.programName || "",
    triggerType: program.triggerType || "calendar_months",
    intervalValue: Number(program.intervalValue) || 0,
    graceValue: Number(program.graceValue) || 0,
    dueSoonValue: Number(program.dueSoonValue) || 0,
    priority: program.priority || "medium",
    active: shouldBeActive,
  };

  const triggerChanged = patch.triggerType !== schedule.triggerType;
  const intervalChanged = patch.intervalValue !== (Number(schedule.intervalValue) || 0);

  if (triggerChanged || intervalChanged) {
    const isMeter = METER_TRIGGERS.includes(patch.triggerType);
    // Meter baseline: keep the recorded reading if the meter type is unchanged,
    // otherwise start from the unit's current reading for the new meter.
    let baselineMeter = null;
    if (isMeter) {
      baselineMeter = triggerChanged
        ? resolveAssetMeter(asset || {}, patch.triggerType)
        : parseNumber(schedule.lastCompletedMeter);
    }
    const due = computeNextDue(patch, {
      completedAt: schedule.lastCompletedAt || now,
      completedMeter: baselineMeter,
      nextDueAt: schedule.nextDueAt,
      nextDueMeter: schedule.nextDueMeter,
    });
    patch.nextDueAt = due.nextDueAt;
    patch.nextDueMeter = due.nextDueMeter;
    if (triggerChanged) patch.lastCompletedMeter = due.lastCompletedMeter;
    // lastCompletedAt is intentionally left untouched.
  }

  const merged = { ...schedule, ...patch };
  patch.status = shouldBeActive ? evaluatePmScheduleStatus(merged, asset || {}, now).status : schedule.status;

  const changed = Object.keys(patch).some((key) => {
    const before = schedule[key];
    const after = patch[key];
    return String(before ?? "") !== String(after ?? "");
  });
  return changed ? patch : null;
}

/**
 * Split a program's estimated hours across its tasks so the work order total matches.
 * @param {number|string} totalHours
 * @param {number} taskCount
 * @returns {number[]}
 */
export function distributeHours(totalHours, taskCount) {
  const total = Math.max(0, Number(totalHours) || 0);
  const count = Math.max(0, Math.floor(Number(taskCount) || 0));
  if (!count) return [];
  const each = Math.floor((total / count) * 100) / 100;
  const result = Array.from({ length: count }, () => each);
  result[count - 1] = Math.round((total - each * (count - 1)) * 100) / 100;
  return result;
}

/**
 * Validate a draft before saving. Returns a plain-language problem, or "" if OK.
 * @param {object} draft
 */
export function validatePmDraft(draft = {}) {
  if (!String(draft.name || "").trim()) return "Give the maintenance schedule a name.";
  if (draft.triggerType !== "manual" && !(Number(draft.intervalValue) > 0)) {
    return "\"How often\" must be more than zero.";
  }
  if (Number(draft.dueSoonValue) < 0 || Number(draft.graceValue) < 0) {
    return "\"Warn ahead by\" and \"Overdue after\" can't be negative.";
  }
  if (Number(draft.estimatedHours) < 0) return "Estimated hours can't be negative.";
  return "";
}
