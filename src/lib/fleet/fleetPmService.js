import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { listFleetAssets } from "./fleetAssetService.js";
import { createFleetWorkOrder, listFleetWorkOrders } from "./fleetWorkOrderService.js";
import {
  STARTER_PM_PROGRAMS,
  addCalendarInterval,
  daysBetween,
  PM_TRIGGER_TYPES,
} from "./pmDefaults.js";
import {
  FLEET_PM_PROGRAMS_COLLECTION,
  FLEET_PM_SCHEDULES_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function parseNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizePmProgram(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled PM program").trim(),
    description: data.description || "",
    version: Number(data.version) || 1,
    triggerType: data.triggerType || "calendar_months",
    intervalValue: Number(data.intervalValue) || 12,
    graceValue: Number(data.graceValue) || 0,
    dueSoonValue: Number(data.dueSoonValue) || 0,
    priority: data.priority || "medium",
    estimatedHours: Number(data.estimatedHours) || 0,
    defaultShopId: data.defaultShopId || "",
    defaultVendorId: data.defaultVendorId || "",
    autoCreateWorkOrder: data.autoCreateWorkOrder !== false,
    applicableClassIds: Array.isArray(data.applicableClassIds) ? data.applicableClassIds : [],
    tasks: Array.isArray(data.tasks)
      ? data.tasks.map((task, index) => ({
        id: task.id || `task-${index + 1}`,
        description: task.description || "",
      }))
      : [],
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizePmSchedule(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    programId: data.programId || "",
    programName: data.programName || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    triggerType: data.triggerType || "calendar_months",
    intervalValue: Number(data.intervalValue) || 0,
    graceValue: Number(data.graceValue) || 0,
    dueSoonValue: Number(data.dueSoonValue) || 0,
    lastCompletedAt: data.lastCompletedAt || "",
    lastCompletedMeter: data.lastCompletedMeter ?? "",
    nextDueAt: data.nextDueAt || "",
    nextDueMeter: data.nextDueMeter ?? "",
    openWorkOrderId: data.openWorkOrderId || "",
    priority: data.priority || "medium",
    status: data.status || "ok",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listPmPrograms(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_PM_PROGRAMS_COLLECTION);
  return rows
    .map((row) => normalizePmProgram(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensurePmProgramsSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listPmPrograms(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_PM_PROGRAMS) {
    const record = normalizePmProgram({ ...starter, departmentId, createdAt: stamp, updatedAt: stamp }, departmentId);
    await createRecord(departmentId, FLEET_PM_PROGRAMS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_PM_PROGRAMS_COLLECTION,
    summary: `Seeded ${created.length} PM programs`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return created;
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function savePmProgram(departmentId, record = {}, audit = {}) {
  const normalized = normalizePmProgram(record, departmentId);
  if (!normalized.id) normalized.id = `pm-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listPmPrograms(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_PM_PROGRAMS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_PM_PROGRAMS_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} PM program ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, programId?: string, openOnly?: boolean }} [filters]
 */
export async function listPmSchedules(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_PM_SCHEDULES_COLLECTION);
  let list = rows.map((row) => normalizePmSchedule(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.programId) list = list.filter((row) => row.programId === filters.programId);
  if (filters.openOnly) list = list.filter((row) => row.active !== false);
  return list.sort((a, b) => String(a.fleetNumber).localeCompare(String(b.fleetNumber)));
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
 * @param {{ completedAt?: string, completedMeter?: number|string|null }} [basis]
 */
export function computeNextDue(program = {}, basis = {}) {
  const triggerType = program.triggerType || "calendar_months";
  const interval = Number(program.intervalValue) || 0;
  const completedAt = basis.completedAt || nowIso();
  const completedMeter = parseNumber(basis.completedMeter);

  if (triggerType === "calendar_days") {
    return {
      nextDueAt: addCalendarInterval(completedAt, "days", interval),
      nextDueMeter: "",
      lastCompletedAt: completedAt,
      lastCompletedMeter: completedMeter ?? "",
    };
  }
  if (triggerType === "calendar_months") {
    return {
      nextDueAt: addCalendarInterval(completedAt, "months", interval),
      nextDueMeter: "",
      lastCompletedAt: completedAt,
      lastCompletedMeter: completedMeter ?? "",
    };
  }
  if (["mileage", "engine_hours", "pump_hours"].includes(triggerType)) {
    const nextMeter = completedMeter == null ? "" : completedMeter + interval;
    return {
      nextDueAt: "",
      nextDueMeter: nextMeter,
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
 * @param {object} schedule
 * @param {object} [asset]
 * @param {string} [now]
 */
export function evaluatePmScheduleStatus(schedule = {}, asset = {}, now = nowIso()) {
  const triggerType = schedule.triggerType || "calendar_months";
  const grace = Number(schedule.graceValue) || 0;
  const dueSoon = Number(schedule.dueSoonValue) || 0;

  if (["mileage", "engine_hours", "pump_hours"].includes(triggerType)) {
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
 * Assign a PM program to an asset (idempotent by program+asset).
 * @param {string} departmentId
 * @param {{ programId: string, fleetAssetId: string, lastCompletedAt?: string, lastCompletedMeter?: number|string }} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function assignPmProgram(departmentId, input = {}, audit = {}) {
  if (!departmentId || !input.programId || !input.fleetAssetId) {
    throw new Error("departmentId, programId, and fleetAssetId are required");
  }
  const programs = await ensurePmProgramsSeeded(departmentId, audit);
  const program = programs.find((row) => row.id === input.programId)
    || normalizePmProgram(await getRecord(departmentId, FLEET_PM_PROGRAMS_COLLECTION, input.programId) || {}, departmentId);
  if (!program?.id) throw new Error("PM program not found");

  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === input.fleetAssetId);
  if (!asset) throw new Error("Fleet asset not found");

  const existing = (await listPmSchedules(departmentId, {
    fleetAssetId: input.fleetAssetId,
    programId: input.programId,
  }))[0];

  const meter = input.lastCompletedMeter ?? resolveAssetMeter(asset, program.triggerType);
  const due = computeNextDue(program, {
    completedAt: input.lastCompletedAt || nowIso(),
    completedMeter: meter,
  });

  const stamp = nowIso();
  const id = existing?.id || `PMS-${input.programId}-${input.fleetAssetId}`.slice(0, 80);
  const record = normalizePmSchedule({
    ...(existing || {}),
    id,
    departmentId,
    programId: program.id,
    programName: program.name,
    fleetAssetId: asset.id,
    fleetNumber: asset.fleetNumber,
    triggerType: program.triggerType,
    intervalValue: program.intervalValue,
    graceValue: program.graceValue,
    dueSoonValue: program.dueSoonValue,
    priority: program.priority,
    ...due,
    status: evaluatePmScheduleStatus({ ...due, triggerType: program.triggerType, graceValue: program.graceValue, dueSoonValue: program.dueSoonValue }, asset).status,
    active: true,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);

  if (existing) await updateRecord(departmentId, FLEET_PM_SCHEDULES_COLLECTION, id, record);
  else await createRecord(departmentId, FLEET_PM_SCHEDULES_COLLECTION, id, record);

  await writeFleetAuditLog(departmentId, {
    action: existing ? "pm_reassign" : "pm_assign",
    recordId: id,
    summary: `Assigned ${program.name} to ${asset.fleetNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

/**
 * Apply all active programs to matching assets (class filter or all).
 * Skips existing schedule pairs (no duplicates).
 * @param {string} departmentId
 * @param {{ programIds?: string[] }} [options]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function applyPmProgramsToFleet(departmentId, options = {}, audit = {}) {
  const programs = (await ensurePmProgramsSeeded(departmentId, audit))
    .filter((row) => row.active !== false)
    .filter((row) => !options.programIds?.length || options.programIds.includes(row.id));
  const assets = await listFleetAssets(departmentId);
  const existing = await listPmSchedules(departmentId);
  const existingKeys = new Set(existing.map((row) => `${row.programId}::${row.fleetAssetId}`));
  const created = [];

  for (const program of programs) {
    const eligible = assets.filter((asset) => {
      if (!program.applicableClassIds?.length) return true;
      return program.applicableClassIds.includes(asset.fleetClassId);
    });
    for (const asset of eligible) {
      const key = `${program.id}::${asset.id}`;
      if (existingKeys.has(key)) continue;
      const schedule = await assignPmProgram(departmentId, {
        programId: program.id,
        fleetAssetId: asset.id,
        lastCompletedAt: nowIso(),
        lastCompletedMeter: resolveAssetMeter(asset, program.triggerType),
      }, audit);
      created.push(schedule);
      existingKeys.add(key);
    }
  }
  return created;
}

/**
 * Build forecast rows with live status.
 * @param {string} departmentId
 */
export async function buildPmForecast(departmentId) {
  const [schedules, assets, programs] = await Promise.all([
    listPmSchedules(departmentId),
    listFleetAssets(departmentId),
    ensurePmProgramsSeeded(departmentId),
  ]);
  const assetById = Object.fromEntries(assets.map((row) => [row.id, row]));
  const programById = Object.fromEntries(programs.map((row) => [row.id, row]));

  const rows = schedules
    .filter((row) => row.active !== false)
    .map((schedule) => {
      const asset = assetById[schedule.fleetAssetId] || {};
      const evaluation = evaluatePmScheduleStatus(schedule, asset);
      return {
        ...schedule,
        programName: schedule.programName || programById[schedule.programId]?.name || schedule.programId,
        status: evaluation.status,
        remainingLabel: evaluation.label,
        remaining: evaluation.remaining,
        autoCreateWorkOrder: programById[schedule.programId]?.autoCreateWorkOrder !== false,
        estimatedHours: programById[schedule.programId]?.estimatedHours || 0,
        tasks: programById[schedule.programId]?.tasks || [],
      };
    })
    .sort((a, b) => {
      const rank = { overdue: 0, due_now: 1, due_soon: 2, ok: 3 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
        || String(a.fleetNumber).localeCompare(String(b.fleetNumber));
    });

  const summary = {
    total: rows.length,
    overdue: rows.filter((row) => row.status === "overdue").length,
    dueNow: rows.filter((row) => row.status === "due_now").length,
    dueSoon: rows.filter((row) => row.status === "due_soon").length,
    ok: rows.filter((row) => row.status === "ok").length,
    withOpenWo: rows.filter((row) => row.openWorkOrderId).length,
  };

  return { rows, summary };
}

/**
 * Generate a preventive work order for a schedule (deduped by openWorkOrderId / open WOs).
 * @param {string} departmentId
 * @param {string} scheduleId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function generatePmWorkOrder(departmentId, scheduleId, audit = {}) {
  const schedule = normalizePmSchedule(
    await getRecord(departmentId, FLEET_PM_SCHEDULES_COLLECTION, scheduleId) || {},
    departmentId
  );
  if (!schedule.id) throw new Error("PM schedule not found");

  if (schedule.openWorkOrderId) {
    const existingWo = (await listFleetWorkOrders(departmentId)).find((row) => row.id === schedule.openWorkOrderId);
    if (existingWo && !["closed", "cancelled", "completed"].includes(existingWo.status)) {
      return { workOrder: existingWo, schedule, deduped: true };
    }
  }

  const openDupes = (await listFleetWorkOrders(departmentId, {
    fleetAssetId: schedule.fleetAssetId,
    openOnly: true,
  })).filter((row) => (
    row.workOrderType === "preventive"
    && row.source === "pm"
    && String(row.complaint || "").includes(schedule.programName)
  ));
  if (openDupes.length) {
    const next = normalizePmSchedule({
      ...schedule,
      openWorkOrderId: openDupes[0].id,
      updatedAt: nowIso(),
    }, departmentId);
    await updateRecord(departmentId, FLEET_PM_SCHEDULES_COLLECTION, schedule.id, next);
    return { workOrder: openDupes[0], schedule: next, deduped: true };
  }

  const programs = await listPmPrograms(departmentId);
  const program = programs.find((row) => row.id === schedule.programId);

  const workOrder = await createFleetWorkOrder(departmentId, {
    fleetAssetId: schedule.fleetAssetId,
    workOrderType: "preventive",
    priority: schedule.priority || program?.priority || "medium",
    complaint: `PM due: ${schedule.programName}`,
    source: "pm",
    category: "PM",
    shopId: program?.defaultShopId || "",
    vendorId: program?.defaultVendorId || "",
    tasks: (program?.tasks || schedule.tasks || []).map((task, index) => ({
      id: task.id || `task-${index + 1}`,
      description: task.description || "",
      estimatedHours: 0,
      status: "open",
    })),
  }, audit);

  const next = normalizePmSchedule({
    ...schedule,
    openWorkOrderId: workOrder.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_PM_SCHEDULES_COLLECTION, schedule.id, next);

  await writeFleetAuditLog(departmentId, {
    action: "pm_wo_generate",
    recordId: schedule.id,
    summary: `Generated WO ${workOrder.workOrderNumber} for ${schedule.programName}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return { workOrder, schedule: next, deduped: false };
}

/**
 * Auto-generate WOs for overdue / due_now schedules with autoCreate enabled.
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function generateDuePmWorkOrders(departmentId, audit = {}) {
  const forecast = await buildPmForecast(departmentId);
  const targets = forecast.rows.filter((row) => (
    ["overdue", "due_now"].includes(row.status)
    && row.autoCreateWorkOrder
    && !row.openWorkOrderId
  ));
  const results = [];
  for (const row of targets) {
    results.push(await generatePmWorkOrder(departmentId, row.id, audit));
  }
  return results;
}

/**
 * Mark PM schedule complete and roll next due.
 * @param {string} departmentId
 * @param {string} scheduleId
 * @param {{ completedAt?: string, completedMeter?: number|string, closeWorkOrder?: boolean }} [input]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function completePmSchedule(departmentId, scheduleId, input = {}, audit = {}) {
  const schedule = normalizePmSchedule(
    await getRecord(departmentId, FLEET_PM_SCHEDULES_COLLECTION, scheduleId) || {},
    departmentId
  );
  if (!schedule.id) throw new Error("PM schedule not found");
  const program = (await listPmPrograms(departmentId)).find((row) => row.id === schedule.programId)
    || normalizePmProgram({
      triggerType: schedule.triggerType,
      intervalValue: schedule.intervalValue,
      graceValue: schedule.graceValue,
      dueSoonValue: schedule.dueSoonValue,
    }, departmentId);

  const asset = (await listFleetAssets(departmentId)).find((row) => row.id === schedule.fleetAssetId) || {};
  const meter = input.completedMeter ?? resolveAssetMeter(asset, schedule.triggerType);
  const due = computeNextDue(program, {
    completedAt: input.completedAt || nowIso(),
    completedMeter: meter,
  });
  const evaluation = evaluatePmScheduleStatus({
    ...schedule,
    ...due,
  }, asset);

  const next = normalizePmSchedule({
    ...schedule,
    ...due,
    status: evaluation.status,
    openWorkOrderId: "",
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_PM_SCHEDULES_COLLECTION, scheduleId, next);

  await writeFleetAuditLog(departmentId, {
    action: "pm_complete",
    recordId: scheduleId,
    summary: `Completed PM ${schedule.programName} on ${schedule.fleetNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return next;
}

export function getPmTriggerTypes() {
  return [...PM_TRIGGER_TYPES];
}
