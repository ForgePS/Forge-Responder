/**
 * EMS equipment rules with no Firestore access (slice E2 of docs/ems/REPOSITORY_DISCOVERY.md):
 * statuses and which moves between them are allowed, inspection / calibration /
 * maintenance due dates, scan lookup keys, and mapping rows of the classic
 * Assets list (lists/hlfd-rms-assets) onto equipment records.
 *
 * The browser's display helpers (src/lib/ems/equipmentDisplay.js) repeat the
 * constants; tests/unit/emsEquipment.test.mjs checks they match.
 */

class EquipmentRuleError extends Error {}

/** Stored statuses. "Inspection due" is not stored: it is worked out from the due date. */
const STATUSES = [
  "available", "assigned", "in_service", "maintenance_required", "out_of_service", "missing", "retired", "disposed",
];
/** Statuses a manager may set directly (the others come from actions: transfer, report, maintenance). */
const MANUAL_STATUSES = ["available", "in_service", "out_of_service", "retired", "disposed"];
/** Equipment in these statuses can't be moved, inspected or reported on until it is reactivated. */
const CLOSED_STATUSES = ["retired", "disposed"];
/** Holds that end with "found" or "maintenance complete", returning the item to where it was. */
const HOLD_STATUSES = ["maintenance_required", "out_of_service", "missing"];
const REASON_REQUIRED_STATUSES = ["out_of_service", "retired", "disposed"];
const CONDITIONS = ["new", "good", "fair", "poor", "damaged"];
const PROBLEM_KINDS = ["damaged", "maintenance", "missing"];
const INSPECTION_KINDS = ["inspection", "calibration"];

const DEFAULT_EQUIPMENT_CATEGORIES = [
  "Cardiac Monitoring", "Defibrillation", "Airway Management", "Ventilation", "Suction", "Trauma",
  "Patient Movement", "Diagnostic", "Oxygen Delivery", "Immobilization", "Rescue", "PPE", "Communication",
  "General EMS Equipment", "Specialty Equipment",
];

/** Days ahead that count as "due soon" for inspections, calibration, maintenance, warranty and replacement. */
const DUE_SOON_DAYS = 30;

const isoDate = (date = new Date()) => date.toISOString().slice(0, 10);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value) {
  if (!ISO_DATE.test(String(value || ""))) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && isoDate(new Date(time)) === value;
}

function addDays(date, days) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return isoDate(new Date(time + days * 86_400_000));
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "overdue" (on or before today), "soon" (within DUE_SOON_DAYS) or "" for a due date. */
function dueState(date, today = isoDate(), soonDays = DUE_SOON_DAYS) {
  if (!isIsoDate(date)) return "";
  const days = daysBetween(today, date);
  if (days <= 0) return "overdue";
  if (days <= soonDays) return "soon";
  return "";
}

/** Lookup key for asset numbers, serials and barcodes: letters and digits only, upper case. */
function lookupKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 80);
}

/** Where a piece of equipment is: a Fleet vehicle, an inventory storage location, a station, or nothing. */
function isOnVehicle(assignment) {
  return Boolean(assignment?.fleetAssetId);
}

/**
 * Status after a move. Equipment placed on a vehicle is Assigned; equipment at a
 * station or storage location (or nowhere) is Available. In Service stays In
 * Service while it moves between vehicles, and holds (maintenance, out of
 * service) stay as they are so broken equipment can go to the repair shop.
 */
function statusAfterTransfer(current, toAssignment) {
  if (CLOSED_STATUSES.includes(current)) throw new EquipmentRuleError("Retired or disposed equipment can't be moved. Reactivate it first.");
  if (current === "missing") throw new EquipmentRuleError("This equipment is reported missing. Verify it where it was found instead.");
  if (current === "maintenance_required" || current === "out_of_service") return current;
  if (isOnVehicle(toAssignment)) return current === "in_service" ? "in_service" : "assigned";
  return "available";
}

/** Status when a hold ends (found, maintenance complete, back in service). */
function statusAfterHold(previous, assignment) {
  if (previous === "in_service" && isOnVehicle(assignment)) return "in_service";
  return isOnVehicle(assignment) ? "assigned" : "available";
}

/** Whether a manager may set `next` from `current` (reasons are checked separately). */
function assertManualStatus(current, next) {
  if (!MANUAL_STATUSES.includes(next)) throw new EquipmentRuleError("Choose a status.");
  if (current === next) throw new EquipmentRuleError("The equipment already has that status.");
  if (current === "disposed") throw new EquipmentRuleError("Disposed equipment is final and can't change status.");
  if (next === "disposed" && current !== "retired") throw new EquipmentRuleError("Retire the equipment before disposing of it.");
  if (current === "missing" && next !== "retired") {
    throw new EquipmentRuleError("Missing equipment is found by verifying it, or retired if it won't be found.");
  }
}

/** Next due date after work done on `doneOn`, or null when there is no interval. */
function nextDue(doneOn, intervalDays) {
  const days = Number(intervalDays);
  if (!isIsoDate(doneOn) || !Number.isInteger(days) || days < 1) return null;
  return addDays(doneOn, days);
}

/** Due flags for one record, for badges, filters and the dashboard. */
function equipmentFlags(record = {}, today = isoDate()) {
  const s = record.schedules || {};
  const active = !CLOSED_STATUSES.includes(record.status);
  return {
    inspection: active ? dueState(s.nextInspectionDue, today) : "",
    calibration: active ? dueState(s.nextCalibrationDue, today) : "",
    maintenance: active ? dueState(s.nextMaintenanceDue, today) : "",
    warranty: active ? dueState(record.warrantyExpiration, today) : "",
    replacement: active ? dueState(record.replacementDate, today) : "",
  };
}

/** The status shown to people: stored status, or "inspection_due" when an active item's inspection is overdue. */
function displayStatus(record = {}, today = isoDate()) {
  if (["available", "assigned", "in_service"].includes(record.status)
    && equipmentFlags(record, today).inspection === "overdue") return "inspection_due";
  return record.status || "available";
}

// ---------------------------------------------------------------- classic Assets list

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Dates the classic list holds: "Dec 18, 2026", "December 18, 2026", "2026-12-18", "12/18/2026". */
function parseLegacyDate(value) {
  const textValue = String(value || "").trim();
  if (!textValue) return null;
  if (isIsoDate(textValue.slice(0, 10))) return textValue.slice(0, 10);
  const pad = (n) => String(n).padStart(2, "0");
  let match = textValue.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase());
    const date = `${match[3]}-${pad(month + 1)}-${pad(match[2])}`;
    return month >= 0 && isIsoDate(date) ? date : null;
  }
  match = textValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const date = `${match[3]}-${pad(match[1])}-${pad(match[2])}`;
    return isIsoDate(date) ? date : null;
  }
  return null;
}

/** "$9,800" -> 9800; anything unreadable -> null. */
function parseMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
  const cleaned = String(value).replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100) / 100;
}

const LEGACY_STATUS = {
  available: "available",
  inservice: "in_service",
  inspectiondue: "in_service",
  outforrepair: "maintenance_required",
  repair: "maintenance_required",
  maintenancerequired: "maintenance_required",
  outofservice: "out_of_service",
  oos: "out_of_service",
  missing: "missing",
  lost: "missing",
  retired: "retired",
  disposed: "disposed",
  surplus: "retired",
  assigned: "assigned",
};

/**
 * One classic Assets row -> an equipment record (without ids or audit fields)
 * and plain-language warnings about anything that didn't map cleanly.
 * `vehicles` are Fleet assets ({ id, unitDesignation, fleetNumber, name }),
 * `stations` are the department's station names.
 */
function mapLegacyAsset(row = {}, { vehicles = [], stations = [] } = {}) {
  const warnings = [];
  const notes = [];
  const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const name = clean(row.name, 120) || clean(row.id, 120) || "Unnamed equipment";
  if (!clean(row.name)) warnings.push("No name in the old list; used the asset number.");

  const assignment = { stationName: "", fleetAssetId: "", unitDesignation: "", locationId: "", locationName: "" };
  const where = clean(row.location, 120);
  if (where) {
    const key = where.toLowerCase();
    const vehicle = vehicles.find((v) => [v.unitDesignation, v.fleetNumber, v.name]
      .some((label) => String(label || "").trim().toLowerCase() === key));
    const station = stations.find((s) => String(s).trim().toLowerCase() === key);
    if (vehicle) {
      assignment.fleetAssetId = vehicle.id;
      assignment.unitDesignation = clean(vehicle.unitDesignation || vehicle.fleetNumber || vehicle.name, 60);
      assignment.stationName = clean(vehicle.station || vehicle.homeStation || vehicle.stationName, 120);
    } else if (station) {
      assignment.stationName = clean(station, 120);
    } else {
      notes.push(`Location in the old list: ${where}`);
      warnings.push(`"${where}" isn't a Fleet vehicle or station; kept as a note.`);
    }
  }
  const assigned = clean(row.assigned, 120);
  if (assigned && !/^(unassigned|none|n\/a|-)$/i.test(assigned)) notes.push(`Assigned to (old list): ${assigned}`);

  const rawStatus = clean(row.status, 60);
  let status = LEGACY_STATUS[rawStatus.toLowerCase().replace(/[^a-z]/g, "")] || "";
  if (!status) {
    status = "available";
    if (rawStatus) {
      warnings.push(`Status "${rawStatus}" isn't one of the equipment statuses; set to Available.`);
      notes.push(`Status in the old list: ${rawStatus}`);
    }
  }
  if (status === "available" && isOnVehicle(assignment)) status = "assigned";
  if (status === "assigned" && !isOnVehicle(assignment)) status = "available";

  const nextInspectionDue = parseLegacyDate(row.inspection);
  if (clean(row.inspection) && !nextInspectionDue) {
    warnings.push(`Inspection date "${clean(row.inspection, 40)}" couldn't be read; kept as a note.`);
    notes.push(`Inspection in the old list: ${clean(row.inspection, 40)}`);
  }
  const purchasePrice = parseMoney(row.value);
  if (clean(row.value) && purchasePrice === null) {
    warnings.push(`Value "${clean(row.value, 40)}" isn't a dollar amount; kept as a note.`);
    notes.push(`Value in the old list: ${clean(row.value, 40)}`);
  }

  const serialNumber = clean(row.serial, 80);
  return {
    record: {
      assetNumber: clean(row.id, 60),
      name,
      description: "",
      category: clean(row.category, 60) || "General EMS Equipment",
      manufacturer: "",
      model: "",
      serialNumber,
      barcode: "",
      purchaseDate: null,
      purchasePrice,
      vendorName: "",
      warrantyExpiration: null,
      replacementDate: null,
      condition: status === "maintenance_required" ? "poor" : "good",
      status,
      assignment,
      schedules: {
        inspectionIntervalDays: null,
        nextInspectionDue,
        lastInspectionAt: null,
        calibrationIntervalDays: null,
        nextCalibrationDue: null,
        lastCalibrationAt: null,
        maintenanceIntervalDays: null,
        nextMaintenanceDue: null,
        lastMaintenanceAt: null,
      },
      notes: notes.join("\n").slice(0, 2000),
    },
    warnings,
  };
}

module.exports = {
  EquipmentRuleError,
  STATUSES,
  MANUAL_STATUSES,
  CLOSED_STATUSES,
  HOLD_STATUSES,
  REASON_REQUIRED_STATUSES,
  CONDITIONS,
  PROBLEM_KINDS,
  INSPECTION_KINDS,
  DEFAULT_EQUIPMENT_CATEGORIES,
  DUE_SOON_DAYS,
  isoDate,
  isIsoDate,
  addDays,
  dueState,
  lookupKey,
  isOnVehicle,
  statusAfterTransfer,
  statusAfterHold,
  assertManualStatus,
  nextDue,
  equipmentFlags,
  displayStatus,
  parseLegacyDate,
  parseMoney,
  mapLegacyAsset,
};
