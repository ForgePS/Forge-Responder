/**
 * EMS check-offs (slice E3 of docs/ems/REPOSITORY_DISCOVERY.md), with no Firestore
 * access: the EMS checklist item types, how their answers are judged, check
 * assignment schedules and due dates, and the unit readiness rules.
 *
 * Check-offs run on the Fleet checklist engine (fleetChecklistTemplates,
 * fleetChecks). This file adds what EMS needs on top of it. The server repeats
 * the item rules and constants in functions/lib/emsCheckoffs/logic.js;
 * tests/unit/emsCheckoffs.test.mjs checks they match.
 */

export const CHECKOFFS_PAGE = "EMS Check-offs";

/** Item types that read the unit's EMS records while the check is done. */
export const EMS_ITEM_TYPES = ["ems_equipment", "ems_supplies"];

export const EQUIPMENT_STATES = ["present", "damaged", "missing"];
export const EQUIPMENT_STATE_LABELS = { present: "Present", damaged: "Damaged", missing: "Missing" };

export const FREQUENCY_KINDS = ["daily", "weekly", "monthly", "every_n_days"];
export const FREQUENCY_LABELS = { daily: "Every day", weekly: "Every week", monthly: "Every month", every_n_days: "Every few days" };
export const TARGET_TYPES = ["vehicle", "fleetClass", "station"];
export const TARGET_LABELS = { vehicle: "One vehicle", fleetClass: "Every vehicle in a fleet class", station: "Every vehicle at a station" };
export const TARGET_SHORT_LABELS = { vehicle: "Vehicle", fleetClass: "Fleet class", station: "Station" };

export const SEVERITIES = ["not_ready", "warning", "off"];
export const SEVERITY_LABELS = { not_ready: "Not ready", warning: "Warning", off: "Ignore" };

/** What each readiness rule looks at, and its default effect on a unit. */
export const READINESS_RULES = [
  { key: "checkOverdue", label: "An assigned check-off is overdue", defaultSeverity: "not_ready" },
  { key: "checkFailed", label: "The last check-off had failed items", defaultSeverity: "warning" },
  { key: "awaitingSignOff", label: "A check-off is waiting for sign-off", defaultSeverity: "warning" },
  { key: "signOffReturned", label: "A supervisor sent a check-off back", defaultSeverity: "not_ready" },
  { key: "equipmentOutOfUse", label: "Equipment on the unit is missing or out of use", defaultSeverity: "not_ready" },
  { key: "equipmentInspectionOverdue", label: "Equipment on the unit is overdue for inspection", defaultSeverity: "warning" },
  { key: "requiredEquipmentMissing", label: "A required equipment category has nothing usable on the unit", defaultSeverity: "not_ready" },
  { key: "suppliesOut", label: "A supply the unit stocks is out", defaultSeverity: "not_ready" },
  { key: "suppliesLow", label: "A supply is below its minimum", defaultSeverity: "warning" },
  { key: "suppliesExpired", label: "Expired stock is on the unit", defaultSeverity: "warning" },
];

export const DEFAULT_READINESS_RULES = Object.freeze({
  ...Object.fromEntries(READINESS_RULES.map((rule) => [rule.key, rule.defaultSeverity])),
  requiredEquipmentCategories: [],
});

export const VERIFICATION_LABELS = {
  not_required: "No sign-off needed",
  pending: "Waiting for sign-off",
  verified: "Signed off",
  returned: "Sent back",
};

const OUT_OF_USE_STATUSES = ["missing", "maintenance_required", "out_of_service"];
const CLOSED_STATUSES = ["retired", "disposed"];

export const isEmsItemType = (type) => EMS_ITEM_TYPES.includes(type);

export function templateHasEmsItems(snapshot = {}) {
  return (snapshot?.sections || []).some((section) => (section.fields || []).some((field) => isEmsItemType(field.type)));
}

// ---------------------------------------------------------------- item answers

/**
 * An EMS item's answer, as stored in check.answers[field.key]:
 *   { expected: [ids or rows the unit had when the check was done], rows: { id: {...} } }
 * Equipment rows: { state: present|damaged|missing, outOfUse, note }.
 * Supply rows:    { count, expiredFound, note }; expected rows carry the par minimum.
 */
function expectedIds(answer = {}) {
  return (Array.isArray(answer?.expected) ? answer.expected : []).map((row) => (typeof row === "string" ? row : row?.id)).filter(Boolean);
}

function hasCount(row) {
  return row && row.count !== "" && row.count !== null && row.count !== undefined && Number.isFinite(Number(row.count)) && Number(row.count) >= 0;
}

/** Every listed piece or supply has an answer (a unit with none listed counts as answered). */
export function emsItemAnswered(field = {}, answer) {
  if (!answer || typeof answer !== "object" || !Array.isArray(answer.expected)) return false;
  const rows = answer.rows || {};
  return expectedIds(answer).every((id) => (field.type === "ems_supplies"
    ? hasCount(rows[id])
    : EQUIPMENT_STATES.includes(rows[id]?.state)));
}

/** The problems an EMS item's answer reports: [{ id, name, problem }]. */
export function emsItemProblems(field = {}, answer) {
  if (!answer || typeof answer !== "object") return [];
  const rows = answer.rows || {};
  const expected = Array.isArray(answer.expected) ? answer.expected : [];
  const problems = [];
  for (const entry of expected) {
    const id = typeof entry === "string" ? entry : entry?.id;
    const name = (typeof entry === "object" && entry?.name) || id;
    const row = rows[id];
    if (!row) continue;
    if (field.type === "ems_equipment") {
      if (row.state === "missing") problems.push({ id, name, problem: "missing" });
      if (row.state === "damaged") problems.push({ id, name, problem: row.outOfUse ? "damaged_out_of_use" : "damaged" });
    } else if (field.type === "ems_supplies") {
      const parMin = Number(entry?.parMin);
      if (hasCount(row) && Number.isFinite(parMin) && parMin > 0 && Number(row.count) < parMin) {
        problems.push({ id, name, problem: Number(row.count) === 0 ? "out" : "short", count: Number(row.count), parMin });
      }
      if (row.expiredFound) problems.push({ id, name, problem: "expired" });
    }
  }
  return problems;
}

const PROBLEM_WORDS = {
  missing: "missing",
  damaged: "damaged",
  damaged_out_of_use: "damaged, out of use",
  out: "none left",
  short: "below minimum",
  expired: "expired stock found",
};

export function describeProblems(problems = []) {
  return problems.map((p) => {
    const extra = p.problem === "short" ? ` (${p.count} of ${p.parMin})` : "";
    return `${p.name}: ${PROBLEM_WORDS[p.problem] || p.problem}${extra}`;
  }).join("; ");
}

// ---------------------------------------------------------------- schedules

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The date in the browser's time zone, as YYYY-MM-DD. */
export function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(day, days) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(day, months) {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function frequencyLabel(frequency = {}) {
  if (frequency.kind === "every_n_days") return `Every ${frequency.days} days`;
  return FREQUENCY_LABELS[frequency.kind] || "Every day";
}

/** The day a check done on `doneOn` is next due. */
export function nextDueDate(doneOn, frequency = {}) {
  if (!ISO_DATE.test(String(doneOn || ""))) return "";
  if (frequency.kind === "monthly") return addMonths(doneOn, 1);
  const days = frequency.kind === "weekly" ? 7 : frequency.kind === "every_n_days" ? Number(frequency.days) || 1 : 1;
  return addDays(doneOn, days);
}

/**
 * Whether a scheduled check is done, due or overdue on `today`, from the local
 * date it was last finished. Never done = due. Due on its day; overdue after it.
 */
export function scheduleState(lastDoneOn, frequency = {}, today = localDate()) {
  if (!ISO_DATE.test(String(lastDoneOn || ""))) return { state: "due", nextDue: today };
  const nextDue = nextDueDate(lastDoneOn, frequency);
  if (today < nextDue) return { state: "done", nextDue };
  if (today === nextDue) return { state: "due", nextDue };
  return { state: "overdue", nextDue };
}

/** Does this assignment cover this vehicle? */
export function assignmentCovers(assignment = {}, asset = {}) {
  if (assignment.active === false) return false;
  if (assignment.targetType === "vehicle") return assignment.targetId === asset.id;
  if (assignment.targetType === "fleetClass") return Boolean(asset.fleetClassId) && assignment.targetId === asset.fleetClassId;
  if (assignment.targetType === "station") return Boolean(asset.station) && assignment.targetId === asset.station;
  return false;
}

/**
 * Each assignment that covers the vehicle, with its schedule state and the last
 * finished check of that checklist on the vehicle. `checks` are fleetChecks.
 */
export function unitAssignments(asset = {}, assignments = [], checks = [], today = localDate()) {
  return assignments.filter((a) => assignmentCovers(a, asset)).map((assignment) => {
    const done = checks
      .filter((c) => c.fleetAssetId === asset.id && c.templateId === assignment.templateId && c.status === "completed" && c.completedAt)
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    const open = checks.find((c) => c.fleetAssetId === asset.id && c.templateId === assignment.templateId && ["draft", "in_progress"].includes(c.status));
    const lastCheck = done[0] || null;
    const schedule = scheduleState(lastCheck ? localDate(lastCheck.completedAt) : "", assignment.frequency, today);
    return { assignment, lastCheck, openCheckId: open?.id || "", ...schedule };
  });
}

// ---------------------------------------------------------------- readiness

export function normalizeReadinessRules(raw = {}) {
  const rules = { ...DEFAULT_READINESS_RULES };
  for (const rule of READINESS_RULES) {
    if (SEVERITIES.includes(raw?.[rule.key])) rules[rule.key] = raw[rule.key];
  }
  rules.requiredEquipmentCategories = Array.isArray(raw?.requiredEquipmentCategories)
    ? [...new Set(raw.requiredEquipmentCategories.map((c) => String(c || "").trim()).filter(Boolean))]
    : [];
  return rules;
}

/**
 * A unit's EMS readiness from the rules:
 *   status "not_ready" when any reason is not_ready, "issues" when any is a warning, else "ready".
 * Inputs: the vehicle, its assignments from unitAssignments(), the check-off results
 * by check id, the equipment on it, the supply balances at its locations.
 */
export function evaluateUnitReadiness({
  asset = {},
  scheduled = [],
  resultsByCheckId = {},
  equipment = [],
  balances = [],
  rules: rawRules = {},
  today = localDate(),
} = {}) {
  const rules = normalizeReadinessRules(rawRules);
  const reasons = [];
  const add = (key, message) => {
    const severity = rules[key];
    if (severity && severity !== "off") reasons.push({ rule: key, severity, message });
  };

  const fleetState = String(asset.readinessState || asset.status || "").toLowerCase();
  if (fleetState === "out_of_service") {
    reasons.push({ rule: "fleetOutOfService", severity: "not_ready", message: "Fleet has the vehicle out of service" });
  }

  for (const row of scheduled) {
    const name = row.assignment.templateName || "Check-off";
    if (row.state === "overdue") add("checkOverdue", `${name} is overdue (was due ${row.nextDue})`);
    const result = row.lastCheck ? resultsByCheckId[row.lastCheck.id] : null;
    if (row.lastCheck?.result === "Failed") add("checkFailed", `Last ${name} had failed items`);
    if (result?.verification?.status === "pending") add("awaitingSignOff", `${name} is waiting for sign-off`);
    if (result?.verification?.status === "returned") add("signOffReturned", `${name} was sent back: ${result.verification.note || "no note"}`);
  }

  const active = equipment.filter((e) => !CLOSED_STATUSES.includes(e.status));
  for (const item of active) {
    if (OUT_OF_USE_STATUSES.includes(item.status)) {
      add("equipmentOutOfUse", `${item.name}${item.assetNumber ? ` (${item.assetNumber})` : ""} is ${item.status === "missing" ? "missing" : "out of use"}`);
    }
    const due = item.schedules?.nextInspectionDue;
    if (ISO_DATE.test(String(due || "")) && due < today && !OUT_OF_USE_STATUSES.includes(item.status)) {
      add("equipmentInspectionOverdue", `${item.name} inspection was due ${due}`);
    }
  }
  for (const category of rules.requiredEquipmentCategories) {
    const usable = active.some((e) => e.category === category && !OUT_OF_USE_STATUSES.includes(e.status));
    if (!usable) add("requiredEquipmentMissing", `No usable ${category} equipment`);
  }

  for (const balance of balances) {
    const name = balance.itemName || balance.itemId;
    const min = Number(balance.par?.min) || 0;
    if (balance.outOfStock || (min > 0 && (Number(balance.onHand) || 0) <= 0)) add("suppliesOut", `${name}: none left${min ? ` (minimum ${min})` : ""}`);
    else if (balance.lowStock) add("suppliesLow", `${name}: ${balance.onHand} on hand, minimum ${min}`);
    const expired = (balance.lots || []).some((lot) => lot.expiration && lot.expiration < today && Number(lot.quantity) > 0);
    if (expired) add("suppliesExpired", `${name}: expired stock`);
  }

  const status = reasons.some((r) => r.severity === "not_ready") ? "not_ready"
    : reasons.some((r) => r.severity === "warning") ? "issues" : "ready";
  return { status, reasons };
}

export const READINESS_STATUS_INFO = {
  ready: { label: "Ready", tone: "success" },
  issues: { label: "Ready with issues", tone: "warning" },
  not_ready: { label: "Not ready", tone: "critical" },
};
