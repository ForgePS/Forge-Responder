/**
 * Demo sandbox only: the Prevention pages read the occupancies and
 * inspections collections, not the seeded lists, so the demo refresh
 * rewrites those collections from the demo seeds and removes anything else
 * (test runs, visitors' experiments) left in them.
 */
import { DEMO_LIST_SEEDS } from "../data/demoSeeds.js";
import { createRecord, deleteRecord, listRecords } from "./firestoreService.js";
import { listInspectionTypes } from "./inspections/inspectionConfigService.js";
import { normalizeInspectionWorkflowRecord } from "./inspections/inspectionWorkflow.js";
import { legacyListItemToOccupancy } from "./inspections/occupancyService.js";
import { INSPECTIONS_COLLECTION, OCCUPANCIES_COLLECTION } from "./inspections/paths.js";
import { DEMO_DEPARTMENT_ID } from "./tenantPaths.js";

const STATUS = {
  Scheduled: "scheduled",
  Overdue: "scheduled",
  "Pending Review": "awaiting_approval",
  Complete: "completed",
};

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** Build an inspection record (same shape createInspection writes) from a demo seed row. */
export function demoInspectionRecord(seed, { occupancy, inspectionType, now = new Date() } = {}) {
  const status = STATUS[seed.status] || "scheduled";
  const due = isoDate(seed.due);
  const done = status === "completed" || status === "awaiting_approval";
  const violations = Number(seed.violations) || 0;
  const number = String(seed.id).replace(/\D/g, "").padStart(4, "0");
  return normalizeInspectionWorkflowRecord({
    id: seed.id,
    inspectionNumber: `INS-${now.getFullYear()}-${number}`,
    inspectionTypeId: inspectionType?.id || "",
    inspectionTypeSnapshot: inspectionType
      ? { id: inspectionType.id, label: inspectionType.name, version: inspectionType.version || 1, category: inspectionType.category }
      : { id: "", label: seed.type },
    occupancyId: seed.occupancyId,
    occupancyName: seed.occupancy,
    address: occupancy?.address || "",
    occupancySnapshot: occupancy
      ? { id: occupancy.id, name: occupancy.name, address: occupancy.address, occupancyType: occupancy.occupancyType || occupancy.type, hazard: occupancy.hazard }
      : null,
    status,
    workflowStage: status,
    priority: String(seed.priority || "normal").toLowerCase(),
    riskLevel: occupancy?.hazard || "",
    assignedInspectorNames: seed.inspector ? [seed.inspector] : [],
    scheduledStart: status === "scheduled" ? due : "",
    dueAt: due,
    startedAt: done ? due : "",
    completedAt: done ? due : "",
    approvedAt: status === "completed" ? due : "",
    result: done ? (violations ? "Passed with conditions" : "Passed") : "",
    summary: done ? (violations ? `${violations} violation${violations === 1 ? "" : "s"} noted; reinspection scheduled.` : "No violations found.") : "",
    openViolationCount: status === "completed" ? 0 : violations,
    totalViolationCount: violations,
    reinspectionRequired: Boolean(violations) && status !== "completed",
    createdAt: isoDate(now),
    updatedAt: isoDate(now),
    createdBy: "Demo",
    updatedBy: "Demo",
  }, DEMO_DEPARTMENT_ID);
}

function pickType(types, label) {
  const want = String(label || "").toLowerCase();
  return types.find((type) => String(type.name || "").toLowerCase().includes(want))
    || types.find((type) => /annual|routine|general/i.test(type.name || ""))
    || types[0]
    || null;
}

/** Replace the demo department's occupancies and inspections with the demo seeds. */
export async function refreshDemoPreventionRecords() {
  const departmentId = DEMO_DEPARTMENT_ID;
  const occupancySeeds = DEMO_LIST_SEEDS["hlfd-rms-occupancies"] || [];
  const inspectionSeeds = DEMO_LIST_SEEDS["hlfd-rms-inspections"] || [];
  if (!occupancySeeds.length) return;

  const occupancies = occupancySeeds.map((item) => legacyListItemToOccupancy(item, departmentId));
  const occupancyIds = new Set(occupancies.map((row) => row.id));
  const [existingOccupancies, existingInspections, types] = await Promise.all([
    listRecords(departmentId, OCCUPANCIES_COLLECTION),
    listRecords(departmentId, INSPECTIONS_COLLECTION),
    listInspectionTypes(departmentId).catch(() => []),
  ]);

  const byId = new Map(occupancies.map((row) => [row.id, row]));
  const inspections = inspectionSeeds.map((seed) => demoInspectionRecord(seed, {
    occupancy: byId.get(seed.occupancyId),
    inspectionType: pickType(types, seed.type),
  }));
  const inspectionIds = new Set(inspections.map((row) => row.id));

  await Promise.all([
    ...occupancies.map((row) => createRecord(departmentId, OCCUPANCIES_COLLECTION, row.id, row)),
    ...inspections.map((row) => createRecord(departmentId, INSPECTIONS_COLLECTION, row.id, row)),
    ...existingOccupancies.filter((row) => !occupancyIds.has(row.id))
      .map((row) => deleteRecord(departmentId, OCCUPANCIES_COLLECTION, row.id)),
    ...existingInspections.filter((row) => !inspectionIds.has(row.id))
      .map((row) => deleteRecord(departmentId, INSPECTIONS_COLLECTION, row.id)),
  ]);
}
