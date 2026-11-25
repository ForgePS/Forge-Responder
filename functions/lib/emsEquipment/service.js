/**
 * EMS Management: equipment (slice E2 of docs/ems/REPOSITORY_DISCOVERY.md).
 *
 * Data (all under departments/{departmentId}/, written by these Cloud Functions only;
 * browsers read through Firestore rules):
 *   emsEquipment/{equipmentId}         one serialized piece of equipment: details, where it is,
 *                                      status, schedules, photos and documents
 *   emsEquipmentEvents/{eventId}       its history: every registration, move, status change,
 *                                      verification, inspection, problem and repair (append-only)
 *   emsEquipmentMigrations/{batchId}   imports from the classic Assets list, for review and rollback
 *   emsAuditEvents/{id}                the EMS audit trail (shared with supply inventory)
 *
 * Every action is one Firestore transaction that reads the record, checks the
 * move is allowed, writes the record, its history event and the audit event
 * together. The browser sends a request id per action; the history event's id
 * is built from it and created with create(), so a retried request returns the
 * first result instead of acting twice.
 *
 * The department id in a request only selects a department; membership,
 * permissions and the plan are checked here and every path is built from the
 * verified department.
 */
const crypto = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { readListItems } = require("../listStore");
const {
  text, nowIso, cleanDocId, cleanRequestId, newId, resolveEmsCaller, auditEvent,
} = require("../emsCommon");
const logic = require("./logic");

const PERMISSIONS = Object.freeze({
  view: "viewEmsEquipment",
  check: "checkEmsEquipment",
  transfer: "transferEmsEquipment",
  manage: "manageEmsEquipment",
});
const LEGACY_ASSETS_LIST = "hlfd-rms-assets";
const MAX_FILES = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_MIGRATION_ROWS = 400;
const MIGRATION_PARALLEL = 10;
const ALREADY_IMPORTED = "Already imported.";

const paths = {
  equipment: (d) => `departments/${d}/emsEquipment`,
  events: (d) => `departments/${d}/emsEquipmentEvents`,
  migrations: (d) => `departments/${d}/emsEquipmentMigrations`,
  locations: (d) => `departments/${d}/emsInventoryLocations`,
  fleetAssets: (d) => `departments/${d}/fleetAssets`,
  filePrefix: (d, equipmentId) => `departments/${d}/emsEquipment/${equipmentId}/`,
};

function resolveCaller(db, request, anyOf) {
  return resolveEmsCaller(db, request, anyOf, { named: PERMISSIONS, message: "You don't have permission to do that with EMS equipment." });
}

function ruleError(error) {
  if (error instanceof logic.EquipmentRuleError) return new HttpsError("failed-precondition", error.message);
  return error;
}

const optionalDate = (value, label) => {
  const v = text(value, 10);
  if (!v) return null;
  if (!logic.isIsoDate(v)) throw new HttpsError("invalid-argument", `${label} must be a date.`);
  return v;
};

const optionalInterval = (value, label) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 3650) throw new HttpsError("invalid-argument", `${label} must be a whole number of days from 1 to 3650.`);
  return n;
};

const optionalMoney = (value, label) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpsError("invalid-argument", `${label} must be a dollar amount of zero or more.`);
  return Math.round(n * 100) / 100;
};

const EMPTY_SCHEDULES = Object.freeze({
  inspectionIntervalDays: null, nextInspectionDue: null, lastInspectionAt: null,
  calibrationIntervalDays: null, nextCalibrationDue: null, lastCalibrationAt: null,
  maintenanceIntervalDays: null, nextMaintenanceDue: null, lastMaintenanceAt: null,
});

/** Details a manager edits. Status and location change only through the actions below. */
function cleanDetails(input = {}) {
  const name = text(input.name, 120);
  if (!name) throw new HttpsError("invalid-argument", "Give the equipment a name.");
  const category = text(input.category, 60);
  if (!category) throw new HttpsError("invalid-argument", "Choose a category.");
  const condition = text(input.condition, 20) || "good";
  if (!logic.CONDITIONS.includes(condition)) throw new HttpsError("invalid-argument", "Choose a condition.");
  return {
    assetNumber: text(input.assetNumber, 60),
    name,
    description: text(input.description, 1000),
    category,
    manufacturer: text(input.manufacturer, 120),
    model: text(input.model, 120),
    serialNumber: text(input.serialNumber, 80),
    barcode: text(input.barcode, 80),
    purchaseDate: optionalDate(input.purchaseDate, "Purchase date"),
    purchasePrice: optionalMoney(input.purchasePrice, "Purchase price"),
    vendorName: text(input.vendorName, 120),
    warrantyExpiration: optionalDate(input.warrantyExpiration, "Warranty expiration"),
    replacementDate: optionalDate(input.replacementDate, "Replacement date"),
    condition,
    notes: text(input.notes, 2000),
  };
}

/** Schedule intervals and next due dates a manager sets. "Last done" dates come from recorded work. */
function cleanSchedules(input = {}, current = EMPTY_SCHEDULES) {
  return {
    ...EMPTY_SCHEDULES,
    ...current,
    inspectionIntervalDays: optionalInterval(input.inspectionIntervalDays, "Inspection interval"),
    nextInspectionDue: optionalDate(input.nextInspectionDue, "Next inspection"),
    calibrationIntervalDays: optionalInterval(input.calibrationIntervalDays, "Calibration interval"),
    nextCalibrationDue: optionalDate(input.nextCalibrationDue, "Next calibration"),
    maintenanceIntervalDays: optionalInterval(input.maintenanceIntervalDays, "Maintenance interval"),
    nextMaintenanceDue: optionalDate(input.nextMaintenanceDue, "Next maintenance"),
  };
}

/** Lookup keys kept on the record so a scan finds it by asset number, serial or barcode. */
function lookupFields(details) {
  return {
    assetNumberKey: logic.lookupKey(details.assetNumber),
    serialKey: logic.lookupKey(details.serialNumber),
    barcodeKey: logic.lookupKey(details.barcode),
  };
}

/** Refuse an asset number another record in the department already uses. */
async function assertUniqueAssetNumber(db, tx, departmentId, assetNumberKey, equipmentId) {
  if (!assetNumberKey) return;
  const clash = await tx.get(db.collection(paths.equipment(departmentId)).where("assetNumberKey", "==", assetNumberKey).limit(2));
  if (clash.docs.some((d) => d.id !== equipmentId)) {
    throw new HttpsError("already-exists", "Another piece of equipment already has that equipment ID.");
  }
}

/**
 * Where equipment goes: a Fleet vehicle, an inventory storage location, and/or
 * a station. Every id is checked in this department and the labels are copied
 * from the real records, never trusted from the browser.
 */
async function resolveAssignment(db, tx, departmentId, input = {}) {
  const assignment = { stationName: text(input.stationName, 120), fleetAssetId: "", unitDesignation: "", locationId: "", locationName: "" };
  if (input.fleetAssetId) {
    const id = cleanDocId(input.fleetAssetId, "Vehicle");
    const asset = await tx.get(db.doc(`${paths.fleetAssets(departmentId)}/${id}`));
    if (!asset.exists) throw new HttpsError("not-found", "That vehicle isn't in Fleet.");
    const a = asset.data();
    assignment.fleetAssetId = id;
    assignment.unitDesignation = text(a.unitDesignation || a.fleetNumber || a.name || id, 60);
    if (!assignment.stationName) assignment.stationName = text(a.station || a.homeStation || a.stationName, 120);
  }
  if (input.locationId) {
    const id = cleanDocId(input.locationId, "Storage location");
    const location = await tx.get(db.doc(`${paths.locations(departmentId)}/${id}`));
    if (!location.exists || location.data().active === false) throw new HttpsError("not-found", "That storage location wasn't found.");
    const l = location.data();
    assignment.locationId = id;
    assignment.locationName = text(l.name, 120);
    if (!assignment.stationName) assignment.stationName = text(l.stationName, 120);
  }
  return assignment;
}

const EMPTY_ASSIGNMENT = Object.freeze({ stationName: "", fleetAssetId: "", unitDesignation: "", locationId: "", locationName: "" });

function describeAssignment(a = {}) {
  return [a.unitDesignation, a.locationName, a.stationName].filter(Boolean).join(" · ") || "Unassigned";
}

function sameAssignment(a = {}, b = {}) {
  return ["stationName", "fleetAssetId", "locationId"].every((k) => (a[k] || "") === (b[k] || ""));
}

/**
 * Run one action on one record, once per request id. `act(record, at)` returns
 * { update, event, summary, audit? }: the record fields to change, the history
 * event (type and details) and the audit summary. Everything is written in one
 * transaction; a retry of the same request id returns the first result.
 */
async function applyAction(db, caller, request, act) {
  const requestId = cleanRequestId(request.data?.requestId);
  const equipmentId = cleanDocId(request.data?.equipmentId, "Equipment");
  const ref = db.doc(`${paths.equipment(caller.departmentId)}/${equipmentId}`);
  const eventRef = db.doc(`${paths.events(caller.departmentId)}/E-${requestId}`);
  const replay = (snap) => {
    const event = snap.data();
    if (event.equipmentId !== equipmentId || event.actorUid !== caller.uid) {
      throw new HttpsError("already-exists", "That request id was already used for something else.");
    }
    return { equipmentId, eventId: snap.id, status: event.toStatus || "", replayed: true };
  };
  try {
    return await db.runTransaction(async (tx) => {
      const [snap, prior] = await Promise.all([tx.get(ref), tx.get(eventRef)]);
      if (prior.exists) return replay(prior);
      if (!snap.exists) throw new HttpsError("not-found", "That equipment wasn't found.");
      const record = snap.data();
      const at = nowIso();
      const result = await act(record, at, tx);
      const update = { ...result.update, version: (record.version || 1) + 1, updatedAt: at, updatedBy: caller.uid };
      tx.update(ref, update);
      const toStatus = update.status || record.status;
      // Details first, so nothing in them can overwrite the event's own fields.
      tx.create(eventRef, {
        ...result.event.details,
        id: eventRef.id,
        equipmentId,
        equipmentName: record.name,
        assetNumber: record.assetNumber || "",
        requestId,
        type: result.event.type,
        fromStatus: record.status,
        toStatus,
        at,
        actorUid: caller.uid,
        actorName: caller.name,
      });
      auditEvent(db, tx, caller, {
        action: `ems.equipment.${result.event.type}`, recordType: "equipment", recordId: equipmentId,
        summary: `${record.name}${record.assetNumber ? ` (${record.assetNumber})` : ""}: ${result.summary}`,
        details: result.audit || null,
      });
      return { equipmentId, eventId: eventRef.id, status: toStatus, replayed: false };
    });
  } catch (error) {
    // A retry that raced the first attempt: if the first one committed, return it.
    if (!(error instanceof HttpsError) && !(error instanceof logic.EquipmentRuleError)) {
      const after = await eventRef.get().catch(() => null);
      if (after?.exists) return replay(after);
    }
    throw ruleError(error);
  }
}

function assertOpen(record, what) {
  if (logic.CLOSED_STATUSES.includes(record.status)) {
    throw new HttpsError("failed-precondition", `Retired or disposed equipment can't be ${what}.`);
  }
}

const STATUS_LABEL = {
  available: "Available", assigned: "Assigned", in_service: "In service", maintenance_required: "Maintenance required",
  out_of_service: "Out of service", missing: "Missing", retired: "Retired", disposed: "Disposed",
};

// ---------------------------------------------------------------- register / edit

async function saveEquipment(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const input = request.data?.equipment || {};
  const details = cleanDetails(input);
  const existingId = input.id ? cleanDocId(input.id, "Equipment") : "";
  const equipmentId = existingId || newId("EQ");
  if (!details.assetNumber) details.assetNumber = equipmentId;
  const ref = db.doc(`${paths.equipment(caller.departmentId)}/${equipmentId}`);
  const at = nowIso();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (existingId && !snap.exists) throw new HttpsError("not-found", "That equipment wasn't found.");
    const keys = lookupFields(details);
    await assertUniqueAssetNumber(db, tx, caller.departmentId, keys.assetNumberKey, equipmentId);
    const before = snap.exists ? snap.data() : null;
    const schedules = cleanSchedules(input.schedules || {}, before?.schedules || EMPTY_SCHEDULES);
    if (before) {
      tx.update(ref, { ...details, ...keys, schedules, version: (before.version || 1) + 1, updatedAt: at, updatedBy: caller.uid });
      const changed = Object.keys(details).filter((k) => JSON.stringify(details[k]) !== JSON.stringify(before[k] ?? null));
      tx.create(db.collection(paths.events(caller.departmentId)).doc(), {
        equipmentId, equipmentName: details.name, assetNumber: details.assetNumber, type: "updated",
        fromStatus: before.status, toStatus: before.status, at, actorUid: caller.uid, actorName: caller.name,
        changedFields: changed,
      });
      auditEvent(db, tx, caller, {
        action: "ems.equipment.updated", recordType: "equipment", recordId: equipmentId,
        summary: `Updated ${details.name} (${details.assetNumber})${changed.length ? `: ${changed.join(", ")}` : ""}`,
        details: { before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])), after: Object.fromEntries(changed.map((k) => [k, details[k]])) },
      });
      return;
    }
    // New equipment: optionally placed somewhere, and Available / Assigned / In service.
    const assignment = await resolveAssignment(db, tx, caller.departmentId, input.assignment || {});
    let status = logic.isOnVehicle(assignment) ? "assigned" : "available";
    if (input.status === "in_service") status = "in_service";
    tx.create(ref, {
      id: equipmentId,
      ...details,
      ...keys,
      schedules,
      status,
      assignment,
      statusBeforeHold: null,
      statusBeforeMissing: null,
      missingReport: null,
      openProblem: null,
      photos: [],
      documents: [],
      lastVerifiedAt: null,
      lastVerifiedBy: "",
      lastVerifiedByName: "",
      migration: null,
      version: 1,
      createdAt: at,
      createdBy: caller.uid,
      createdByName: caller.name,
      updatedAt: at,
      updatedBy: caller.uid,
    });
    tx.create(db.collection(paths.events(caller.departmentId)).doc(), {
      equipmentId, equipmentName: details.name, assetNumber: details.assetNumber, type: "registered",
      fromStatus: "", toStatus: status, at, actorUid: caller.uid, actorName: caller.name, to: assignment,
    });
    auditEvent(db, tx, caller, {
      action: "ems.equipment.registered", recordType: "equipment", recordId: equipmentId,
      summary: `Registered ${details.name} (${details.assetNumber}) at ${describeAssignment(assignment)}`,
    });
  });
  return { equipmentId };
}

// ---------------------------------------------------------------- transfer

async function transferEquipment(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.transfer, PERMISSIONS.manage]);
  const reason = text(request.data?.reason, 300);
  return applyAction(db, caller, request, async (record, at, tx) => {
    const to = await resolveAssignment(db, tx, caller.departmentId, request.data?.to || {});
    const from = record.assignment || EMPTY_ASSIGNMENT;
    if (sameAssignment(from, to)) throw new HttpsError("failed-precondition", "The equipment is already there.");
    const status = logic.statusAfterTransfer(record.status, to);
    return {
      update: { assignment: to, status },
      event: { type: "transferred", details: { from, to, reason } },
      summary: `moved from ${describeAssignment(from)} to ${describeAssignment(to)}${reason ? ` (${reason})` : ""}`,
      audit: { from, to },
    };
  });
}

// ---------------------------------------------------------------- verify presence

async function verifyEquipment(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.check, PERMISSIONS.manage]);
  const note = text(request.data?.note, 500);
  return applyAction(db, caller, request, async (record, at) => {
    assertOpen(record, "verified");
    const found = record.status === "missing";
    const update = { lastVerifiedAt: at, lastVerifiedBy: caller.uid, lastVerifiedByName: caller.name };
    if (found) {
      // Back to what it was before it went missing; a repair hold stays a repair hold.
      const before = record.statusBeforeMissing || "";
      update.status = ["maintenance_required", "out_of_service"].includes(before)
        ? before
        : logic.statusAfterHold(before, record.assignment);
      update.statusBeforeMissing = null;
      update.missingReport = null;
    }
    return {
      update,
      event: { type: found ? "found" : "verified", details: { note, place: describeAssignment(record.assignment) } },
      summary: found ? `found at ${describeAssignment(record.assignment)}` : `verified present at ${describeAssignment(record.assignment)}`,
    };
  });
}

// ---------------------------------------------------------------- problems and maintenance requests

async function reportProblem(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.check, PERMISSIONS.manage]);
  const kind = text(request.data?.kind, 20);
  if (!logic.PROBLEM_KINDS.includes(kind)) throw new HttpsError("invalid-argument", "Choose what's wrong.");
  const description = text(request.data?.description, 1000);
  if (!description) throw new HttpsError("invalid-argument", "Describe the problem.");
  const takeOutOfService = request.data?.takeOutOfService === true;
  return applyAction(db, caller, request, async (record, at) => {
    assertOpen(record, "reported");
    if (record.status === "missing") {
      throw new HttpsError("failed-precondition", kind === "missing" ? "It's already reported missing." : "It's reported missing. Verify it where it was found first.");
    }
    const problem = { kind, description, reportedAt: at, reportedBy: caller.uid, reportedByName: caller.name };
    let update;
    let next = record.status;
    if (kind === "missing") {
      next = "missing";
      update = { status: next, statusBeforeMissing: record.status, missingReport: problem };
    } else {
      update = { openProblem: problem };
      if (takeOutOfService || kind === "maintenance") next = "maintenance_required";
      if (next !== record.status) {
        update.status = next;
        if (!logic.HOLD_STATUSES.includes(record.status)) update.statusBeforeHold = record.status;
      }
      if (kind === "damaged" && takeOutOfService) update.condition = "damaged";
    }
    const label = { damaged: "deficiency reported", maintenance: "maintenance requested", missing: "reported missing" }[kind];
    return {
      update,
      event: { type: kind === "missing" ? "reported_missing" : kind === "maintenance" ? "maintenance_requested" : "problem_reported", details: { description, takeOutOfService } },
      summary: `${label}: ${description}${next !== record.status ? ` (now ${STATUS_LABEL[next]})` : ""}`,
    };
  });
}

// ---------------------------------------------------------------- inspection and calibration

async function recordInspection(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.check, PERMISSIONS.manage]);
  const kind = text(request.data?.kind, 20) || "inspection";
  if (!logic.INSPECTION_KINDS.includes(kind)) throw new HttpsError("invalid-argument", "Choose inspection or calibration.");
  const result = text(request.data?.result, 10);
  if (!["pass", "fail"].includes(result)) throw new HttpsError("invalid-argument", "Choose pass or fail.");
  const notes = text(request.data?.notes, 1000);
  if (result === "fail" && !notes) throw new HttpsError("invalid-argument", "Say what failed.");
  return applyAction(db, caller, request, async (record, at) => {
    assertOpen(record, "inspected");
    if (record.status === "missing") throw new HttpsError("failed-precondition", "Missing equipment can't be inspected. Verify it first.");
    const today = logic.isoDate(new Date(at));
    const s = { ...EMPTY_SCHEDULES, ...(record.schedules || {}) };
    const update = {};
    if (kind === "inspection") {
      update.schedules = { ...s, lastInspectionAt: at, nextInspectionDue: result === "pass" ? logic.nextDue(today, s.inspectionIntervalDays) || s.nextInspectionDue : s.nextInspectionDue };
    } else {
      update.schedules = { ...s, lastCalibrationAt: at, nextCalibrationDue: result === "pass" ? logic.nextDue(today, s.calibrationIntervalDays) || s.nextCalibrationDue : s.nextCalibrationDue };
    }
    // Passing an inspection also proves it's there.
    update.lastVerifiedAt = at;
    update.lastVerifiedBy = caller.uid;
    update.lastVerifiedByName = caller.name;
    if (result === "fail") {
      update.openProblem = { kind: "maintenance", description: `Failed ${kind}: ${notes}`, reportedAt: at, reportedBy: caller.uid, reportedByName: caller.name };
      if (record.status !== "maintenance_required") {
        update.status = "maintenance_required";
        if (!logic.HOLD_STATUSES.includes(record.status)) update.statusBeforeHold = record.status;
      }
    }
    const next = kind === "inspection" ? update.schedules.nextInspectionDue : update.schedules.nextCalibrationDue;
    return {
      update,
      event: { type: kind === "inspection" ? "inspected" : "calibrated", details: { result, notes, nextDue: next || null } },
      summary: `${kind} ${result === "pass" ? "passed" : "failed"}${notes ? `: ${notes}` : ""}${next && result === "pass" ? `; next due ${next}` : ""}`,
    };
  });
}

// ---------------------------------------------------------------- maintenance complete

async function completeMaintenance(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const notes = text(request.data?.notes, 1000);
  if (!notes) throw new HttpsError("invalid-argument", "Say what was done.");
  const cost = optionalMoney(request.data?.cost, "Cost");
  const vendorName = text(request.data?.vendorName, 120);
  const returnToService = request.data?.returnToService !== false;
  return applyAction(db, caller, request, async (record, at) => {
    assertOpen(record, "maintained");
    if (record.status === "missing") throw new HttpsError("failed-precondition", "Missing equipment can't be maintained. Verify it first.");
    const today = logic.isoDate(new Date(at));
    const s = { ...EMPTY_SCHEDULES, ...(record.schedules || {}) };
    const update = {
      schedules: { ...s, lastMaintenanceAt: at, nextMaintenanceDue: logic.nextDue(today, s.maintenanceIntervalDays) || s.nextMaintenanceDue },
    };
    if (returnToService) {
      update.openProblem = null;
      if (["maintenance_required", "out_of_service"].includes(record.status)) {
        update.status = logic.statusAfterHold(record.statusBeforeHold, record.assignment);
        update.statusBeforeHold = null;
      }
      if (record.condition === "damaged") update.condition = "good";
    }
    return {
      update,
      event: { type: "maintenance_completed", details: { notes, cost, vendorName, returnToService } },
      summary: `maintenance done: ${notes}${update.status ? ` (now ${STATUS_LABEL[update.status]})` : ""}`,
    };
  });
}

// ---------------------------------------------------------------- status (in service, out of service, retire, dispose)

async function setStatus(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const next = text(request.data?.status, 30);
  const reason = text(request.data?.reason, 500);
  return applyAction(db, caller, request, async (record) => {
    logic.assertManualStatus(record.status, next);
    if (logic.REASON_REQUIRED_STATUSES.includes(next) && !reason) throw new HttpsError("invalid-argument", "Give a reason.");
    if (record.status === "retired" && next !== "disposed" && !reason) throw new HttpsError("invalid-argument", "Give a reason for bringing it back.");
    const update = { status: next };
    if (next === "available" && logic.isOnVehicle(record.assignment)) update.status = "assigned";
    if (next === "out_of_service" && !logic.HOLD_STATUSES.includes(record.status)) update.statusBeforeHold = record.status;
    if (["available", "in_service"].includes(next)) {
      update.statusBeforeHold = null;
      update.openProblem = null;
    }
    if (next === "retired") update.retiredAt = nowIso();
    if (next === "disposed") update.disposedAt = nowIso();
    const type = next === "retired" ? "retired" : next === "disposed" ? "disposed" : "status_changed";
    return {
      update,
      event: { type, details: { reason } },
      summary: `${STATUS_LABEL[record.status]} → ${STATUS_LABEL[update.status]}${reason ? ` (${reason})` : ""}`,
    };
  });
}

// ---------------------------------------------------------------- photos and documents

/**
 * The browser uploads the file to departments/{d}/emsEquipment/{id}/... (storage
 * rules let members upload there) and then records it here. The server checks
 * the file is really in this record's folder before listing it.
 */
async function addFile(db, bucket, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const kind = request.data?.kind === "photo" ? "photo" : "document";
  const path = text(request.data?.path, 500);
  const name = text(request.data?.name, 160) || path.split("/").pop();
  return applyAction(db, caller, request, async (record) => {
    const prefix = paths.filePrefix(caller.departmentId, record.id);
    if (!path.startsWith(prefix) || path.includes("..") || path.length <= prefix.length) {
      throw new HttpsError("invalid-argument", "That file isn't in this equipment's folder.");
    }
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError("not-found", "The upload wasn't found. Try again.");
    const [meta] = await file.getMetadata();
    const size = Number(meta.size) || 0;
    if (size > MAX_FILE_BYTES) throw new HttpsError("invalid-argument", "Files must be under 25 MB.");
    const contentType = text(meta.contentType, 100);
    if (kind === "photo" && !/^image\//.test(contentType)) throw new HttpsError("invalid-argument", "Photos must be images.");
    const field = kind === "photo" ? "photos" : "documents";
    const list = Array.isArray(record[field]) ? record[field] : [];
    if (list.some((f) => f.path === path)) throw new HttpsError("already-exists", "That file is already listed.");
    if (list.length >= MAX_FILES) throw new HttpsError("failed-precondition", `Keep at most ${MAX_FILES} ${field} per piece of equipment.`);
    const entry = { path, name, contentType, size, addedAt: nowIso(), addedBy: caller.uid, addedByName: caller.name };
    return {
      update: { [field]: [...list, entry] },
      event: { type: "file_added", details: { kind, name } },
      summary: `added ${kind} ${name}`,
    };
  });
}

async function removeFile(db, bucket, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const path = text(request.data?.path, 500);
  const result = await applyAction(db, caller, request, async (record) => {
    const field = (record.photos || []).some((f) => f.path === path) ? "photos" : "documents";
    const list = record[field] || [];
    const entry = list.find((f) => f.path === path);
    if (!entry) throw new HttpsError("not-found", "That file isn't listed on this equipment.");
    return {
      update: { [field]: list.filter((f) => f.path !== path) },
      event: { type: "file_removed", details: { kind: field === "photos" ? "photo" : "document", name: entry.name } },
      summary: `removed ${field === "photos" ? "photo" : "document"} ${entry.name}`,
    };
  });
  if (!result.replayed) await bucket.file(path).delete().catch(() => null);
  return result;
}

// ---------------------------------------------------------------- import from the classic Assets list

/** The equipment id for an imported row: fixed by the row's id, so a row can only be imported once. */
function importedEquipmentId(sourceId) {
  return `EQ-L${crypto.createHash("sha256").update(String(sourceId)).digest("hex").slice(0, 20).toUpperCase()}`;
}

function isAlreadyExists(error) {
  return error?.code === 6 || error?.code === "already-exists" || /ALREADY_EXISTS/.test(String(error?.message || ""));
}

function cleanStations(value) {
  return (Array.isArray(value) ? value : []).map((s) => text(s, 120)).filter(Boolean).slice(0, 100);
}

/**
 * Read the classic list, map each row, and mark rows already imported (by
 * source id) or whose asset number is already used. Nothing is written.
 */
async function planMigration(db, caller, stations) {
  const [rows, vehiclesSnap, existingSnap] = await Promise.all([
    readListItems(db, caller.departmentId, LEGACY_ASSETS_LIST),
    db.collection(paths.fleetAssets(caller.departmentId)).get(),
    db.collection(paths.equipment(caller.departmentId)).select("assetNumberKey", "migration").get(),
  ]);
  const vehicles = vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const imported = new Set(existingSnap.docs.map((d) => d.data().migration?.sourceId).filter(Boolean));
  const usedNumbers = new Set(existingSnap.docs.map((d) => d.data().assetNumberKey).filter(Boolean));
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const sourceId = text(row?.id, 120) || `row-${index + 1}`;
    const { record, warnings } = logic.mapLegacyAsset(row || {}, { vehicles, stations });
    const key = logic.lookupKey(record.assetNumber);
    let skip = "";
    if (imported.has(sourceId)) skip = ALREADY_IMPORTED;
    else if (key && (usedNumbers.has(key) || seen.has(key))) skip = "Another piece of equipment already has this equipment ID.";
    if (key) seen.add(key);
    return { sourceId, source: row, record, warnings, skip };
  });
}

async function previewMigration(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const plan = await planMigration(db, caller, cleanStations(request.data?.stations));
  // Rows already imported are counted, not listed, so a long list is worked
  // through in rounds: each preview shows the next rows still to import.
  const remaining = plan.filter((row) => row.skip !== ALREADY_IMPORTED);
  return {
    totalRows: plan.length,
    alreadyImportedCount: plan.length - remaining.length,
    remainingCount: remaining.length,
    rows: remaining.slice(0, MAX_MIGRATION_ROWS).map(({ sourceId, source, record, warnings, skip }) => ({
      sourceId,
      source: { name: text(source?.name, 120), category: text(source?.category, 60), location: text(source?.location, 120), status: text(source?.status, 60) },
      record: { assetNumber: record.assetNumber, name: record.name, category: record.category, status: record.status, where: describeAssignment(record.assignment), nextInspectionDue: record.schedules.nextInspectionDue },
      warnings,
      skip,
    })),
  };
}

/**
 * Create equipment records for the chosen rows. The classic list is never
 * changed. Every record is tagged with the batch id so the import can be
 * rolled back; a report of what was created and skipped is kept.
 */
async function applyMigration(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const chosen = new Set((Array.isArray(request.data?.sourceIds) ? request.data.sourceIds : []).map((s) => text(s, 120)));
  if (!chosen.size) throw new HttpsError("invalid-argument", "Choose at least one row to import.");
  if (chosen.size > MAX_MIGRATION_ROWS) throw new HttpsError("invalid-argument", `Import at most ${MAX_MIGRATION_ROWS} rows at a time.`);
  const plan = await planMigration(db, caller, cleanStations(request.data?.stations));
  const batchId = newId("MIG");
  const at = nowIso();
  const created = [];
  const skipped = [];
  const toCreate = [];
  for (const row of plan) {
    if (!chosen.has(row.sourceId)) continue;
    if (row.skip) skipped.push({ sourceId: row.sourceId, reason: row.skip });
    else toCreate.push(row);
  }
  // Each record's id comes from its source row, and each is created in its own
  // transaction with its import event. Two imports running at once therefore
  // can't both create the same row: the second finds it exists and skips it.
  const importOne = async (row) => {
    const ref = db.doc(`${paths.equipment(caller.departmentId)}/${importedEquipmentId(row.sourceId)}`);
    const record = { ...row.record, assetNumber: row.record.assetNumber || ref.id };
    let skip = "";
    try {
      await db.runTransaction(async (tx) => {
        skip = "";
        if ((await tx.get(ref)).exists) { skip = ALREADY_IMPORTED; return; }
        const key = logic.lookupKey(record.assetNumber);
        if (key && !(await tx.get(db.collection(paths.equipment(caller.departmentId)).where("assetNumberKey", "==", key).limit(1))).empty) {
          skip = "Another piece of equipment already has this equipment ID.";
          return;
        }
        tx.create(ref, {
          id: ref.id,
          ...record,
          ...lookupFields(record),
          statusBeforeHold: null,
          statusBeforeMissing: null,
          missingReport: null,
          openProblem: null,
          photos: [],
          documents: [],
          lastVerifiedAt: null,
          lastVerifiedBy: "",
          lastVerifiedByName: "",
          migration: { batchId, sourceListKey: LEGACY_ASSETS_LIST, sourceId: row.sourceId, warnings: row.warnings },
          version: 1,
          createdAt: at,
          createdBy: caller.uid,
          createdByName: caller.name,
          updatedAt: at,
          updatedBy: caller.uid,
        });
        tx.create(db.doc(`${paths.events(caller.departmentId)}/MIG-${batchId}-${ref.id}`), {
          equipmentId: ref.id, equipmentName: record.name, assetNumber: record.assetNumber, type: "imported",
          fromStatus: "", toStatus: record.status, at, actorUid: caller.uid, actorName: caller.name,
          to: record.assignment, batchId, sourceId: row.sourceId, warnings: row.warnings,
        });
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      skip = ALREADY_IMPORTED;
    }
    if (skip) skipped.push({ sourceId: row.sourceId, reason: skip });
    else created.push({ sourceId: row.sourceId, equipmentId: ref.id, name: record.name, warnings: row.warnings });
  };
  for (let i = 0; i < toCreate.length; i += MIGRATION_PARALLEL) {
    await Promise.all(toCreate.slice(i, i + MIGRATION_PARALLEL).map(importOne));
  }
  const report = {
    id: batchId, status: "applied", sourceListKey: LEGACY_ASSETS_LIST, createdAt: at, createdBy: caller.uid, createdByName: caller.name,
    createdCount: created.length, skippedCount: skipped.length, created, skipped,
  };
  await db.doc(`${paths.migrations(caller.departmentId)}/${batchId}`).create(report);
  await auditEvent(db, null, caller, {
    action: "ems.equipment.imported", recordType: "migration", recordId: batchId,
    summary: `Imported ${created.length} item${created.length === 1 ? "" : "s"} from the classic Assets list${skipped.length ? `, skipped ${skipped.length}` : ""}`,
  });
  return { batchId, createdCount: created.length, skippedCount: skipped.length, skipped };
}

/**
 * Undo an import: delete the records it created that nobody has changed since
 * (version 1), with their import event. Records someone has moved, inspected
 * or edited are kept and listed, so no recorded work is lost.
 */
async function rollbackMigration(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const batchId = cleanDocId(request.data?.batchId, "Import");
  const reportRef = db.doc(`${paths.migrations(caller.departmentId)}/${batchId}`);
  const report = await reportRef.get();
  if (!report.exists) throw new HttpsError("not-found", "That import wasn't found.");
  if (report.data().status === "rolled_back") throw new HttpsError("failed-precondition", "That import was already rolled back.");
  const records = await db.collection(paths.equipment(caller.departmentId)).where("migration.batchId", "==", batchId).get();
  const removed = [];
  const kept = [];
  for (const doc of records.docs) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (!snap.exists) return;
      const data = snap.data();
      if ((data.version || 1) > 1) {
        kept.push({ equipmentId: doc.id, name: data.name, reason: "Changed since the import." });
        return;
      }
      tx.delete(doc.ref);
      tx.delete(db.doc(`${paths.events(caller.departmentId)}/MIG-${batchId}-${doc.id}`));
      removed.push({ equipmentId: doc.id, name: data.name });
    });
  }
  const at = nowIso();
  await reportRef.update({ status: kept.length ? "partly_rolled_back" : "rolled_back", rolledBackAt: at, rolledBackBy: caller.uid, rolledBackByName: caller.name, removedCount: removed.length, kept });
  await auditEvent(db, null, caller, {
    action: "ems.equipment.import_rolled_back", recordType: "migration", recordId: batchId,
    summary: `Rolled back import ${batchId}: removed ${removed.length}${kept.length ? `, kept ${kept.length} changed since` : ""}`,
  });
  return { batchId, removedCount: removed.length, kept };
}

module.exports = {
  PERMISSIONS,
  paths,
  LEGACY_ASSETS_LIST,
  saveEquipment,
  transferEquipment,
  verifyEquipment,
  reportProblem,
  recordInspection,
  completeMaintenance,
  setStatus,
  addFile,
  removeFile,
  previewMigration,
  applyMigration,
  rollbackMigration,
};
