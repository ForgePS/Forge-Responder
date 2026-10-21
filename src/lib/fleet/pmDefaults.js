/** Editable PM program defaults for Phase 7. */

export const PM_TRIGGER_TYPES = [
  { id: "calendar_days", label: "Calendar days", unit: "days" },
  { id: "calendar_months", label: "Calendar months", unit: "months" },
  { id: "mileage", label: "Mileage", unit: "miles" },
  { id: "engine_hours", label: "Engine hours", unit: "hours" },
  { id: "pump_hours", label: "Pump hours", unit: "hours" },
  { id: "manual", label: "Manual / fixed date", unit: "" },
];

export const PM_DUE_STATUSES = [
  { id: "ok", label: "Current", tone: "success" },
  { id: "due_soon", label: "Due soon", tone: "warning" },
  { id: "due_now", label: "Due now", tone: "warning" },
  { id: "overdue", label: "Overdue", tone: "critical" },
];

export const STARTER_PM_PROGRAMS = [
  {
    id: "pm-oil-filter",
    name: "Oil & filter service",
    description: "Engine oil and filter change",
    triggerType: "mileage",
    intervalValue: 5000,
    graceValue: 250,
    dueSoonValue: 500,
    priority: "medium",
    estimatedHours: 2,
    autoCreateWorkOrder: true,
    tasks: [
      { description: "Drain oil and replace filter" },
      { description: "Refill to spec and check for leaks" },
    ],
    applicableClassIds: [],
    active: true,
  },
  {
    id: "pm-annual-service",
    name: "Annual apparatus service",
    description: "Annual preventive service package",
    triggerType: "calendar_months",
    intervalValue: 12,
    graceValue: 14,
    dueSoonValue: 30,
    priority: "high",
    estimatedHours: 8,
    autoCreateWorkOrder: true,
    tasks: [
      { description: "Full annual inspection and service" },
      { description: "Lubricate chassis points" },
    ],
    applicableClassIds: [],
    active: true,
  },
  {
    id: "pm-pump-service",
    name: "Pump hours service",
    description: "Pump system service by engine pump hours",
    triggerType: "pump_hours",
    intervalValue: 200,
    graceValue: 10,
    dueSoonValue: 25,
    priority: "high",
    estimatedHours: 4,
    autoCreateWorkOrder: true,
    tasks: [{ description: "Pump packing, valves, and lubrication check" }],
    applicableClassIds: [],
    active: true,
  },
];

/**
 * Add calendar interval to an ISO date string.
 * @param {string} iso
 * @param {"days"|"months"} unit
 * @param {number} value
 */
export function addCalendarInterval(iso, unit, value) {
  const base = iso ? new Date(iso) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  const next = new Date(base.getTime());
  const amount = Number(value) || 0;
  if (unit === "months") next.setMonth(next.getMonth() + amount);
  else next.setDate(next.getDate() + amount);
  return next.toISOString();
}

/**
 * Days between two dates (signed: positive if a < b).
 * @param {string} fromIso
 * @param {string} toIso
 */
export function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}
