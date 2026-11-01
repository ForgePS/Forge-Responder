import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { testProgramRemovalMode } from "./configOpsLogic.js";
import { loadTenantListFromFirestore } from "../tenantListLoader.js";
import { LIST_KEYS } from "../tenantListKeys.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { createDefect } from "./fleetDefectService.js";
import { listFleetAssets } from "./fleetAssetService.js";
import { addCalendarInterval, daysBetween } from "./pmDefaults.js";
import { STARTER_TEST_PROGRAMS } from "./testDefaults.js";
import {
  FLEET_TEST_PROGRAMS_COLLECTION,
  FLEET_TESTS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeTestProgram(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled test program").trim(),
    programType: data.programType || "custom",
    standardReference: data.standardReference || "",
    edition: data.edition || "",
    intervalMonths: Number(data.intervalMonths) || 12,
    dueSoonDays: Number(data.dueSoonDays) || 30,
    createDefectOnFail: data.createDefectOnFail !== false,
    blockReturnToServiceOnFail: Boolean(data.blockReturnToServiceOnFail),
    certificateRequired: data.certificateRequired !== false,
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetTest(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    testNumber: data.testNumber || data.id || "",
    programId: data.programId || "",
    programName: data.programName || "",
    programType: data.programType || "",
    standardReference: data.standardReference || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || data.apparatus || "",
    section: data.section || "",
    testDate: data.testDate || data.lastTest || "",
    dueDate: data.dueDate || data.nextDue || "",
    nextDue: data.nextDue || data.dueDate || "",
    result: data.result || "pending",
    status: data.status || "current",
    tester: data.tester || "",
    testerQualification: data.testerQualification || "",
    vendorName: data.vendorName || "",
    measurements: data.measurements || "",
    exceptions: data.exceptions || "",
    notes: data.notes || "",
    certificateNumber: data.certificateNumber || "",
    certificateIssuer: data.certificateIssuer || "",
    certificateExpiresAt: data.certificateExpiresAt || "",
    defectId: data.defectId || "",
    legacyHoseTestId: data.legacyHoseTestId || "",
    migratedFromList: Boolean(data.migratedFromList),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listTestPrograms(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_TEST_PROGRAMS_COLLECTION);
  return rows
    .map((row) => normalizeTestProgram(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureTestProgramsSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listTestPrograms(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_TEST_PROGRAMS) {
    const record = normalizeTestProgram({ ...starter, departmentId, createdAt: stamp, updatedAt: stamp }, departmentId);
    await createRecord(departmentId, FLEET_TEST_PROGRAMS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_TEST_PROGRAMS_COLLECTION,
    summary: `Seeded ${created.length} test programs`,
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
export async function saveTestProgram(departmentId, record = {}, audit = {}) {
  const normalized = normalizeTestProgram(record, departmentId);
  if (!normalized.id) normalized.id = `testprog-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const prior = (await listTestPrograms(departmentId)).find((row) => row.id === normalized.id);
  const exists = Boolean(prior);
  // The type is fixed once saved: recorded tests and the hose-test import look
  // programs up by type.
  if (prior) normalized.programType = prior.programType;
  if (exists) await updateRecord(departmentId, FLEET_TEST_PROGRAMS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_TEST_PROGRAMS_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} test program ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * Remove a test program. If any recorded tests point at it (or it is the last
 * program), it is turned off instead, so test history keeps its program.
 * @param {string} departmentId
 * @param {string} programId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 * @returns {Promise<{ mode: "delete"|"deactivate", testCount: number, program?: object }>}
 */
export async function removeTestProgram(departmentId, programId, audit = {}) {
  if (!departmentId || !programId) throw new Error("A test program is required.");
  const [programs, tests] = await Promise.all([
    listTestPrograms(departmentId),
    listFleetTests(departmentId, { programId }),
  ]);
  const existing = programs.find((row) => row.id === programId);
  if (!existing) throw new Error("That test program no longer exists.");
  const mode = testProgramRemovalMode(tests.length, programs.length);
  let program;
  if (mode === "delete") {
    await deleteRecord(departmentId, FLEET_TEST_PROGRAMS_COLLECTION, programId);
  } else {
    program = { ...existing, active: false, updatedAt: nowIso() };
    await updateRecord(departmentId, FLEET_TEST_PROGRAMS_COLLECTION, programId, program);
  }
  await writeFleetAuditLog(departmentId, {
    action: mode === "delete" ? "delete" : "update",
    recordId: programId,
    summary: mode === "delete"
      ? `Removed test program ${existing.name}`
      : `Turned off test program ${existing.name} (${tests.length} recorded tests)`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return { mode, testCount: tests.length, program };
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, programId?: string, programType?: string }} [filters]
 */
export async function listFleetTests(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_TESTS_COLLECTION);
  let list = rows.map((row) => normalizeFleetTest(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.programId) list = list.filter((row) => row.programId === filters.programId);
  if (filters.programType) list = list.filter((row) => row.programType === filters.programType);
  return list.sort((a, b) => String(b.testDate || b.updatedAt).localeCompare(String(a.testDate || a.updatedAt)));
}

function mapLegacyHoseStatus(value = "") {
  const v = String(value || "").toLowerCase();
  if (v.includes("over")) return "overdue";
  if (v.includes("soon")) return "due_soon";
  if (v.includes("fail")) return "failed";
  return "current";
}

function mapLegacyHoseResult(value = "") {
  const v = String(value || "").toLowerCase();
  if (v.includes("fail")) return "fail";
  if (v.includes("pass") || v.includes("ok") || v.includes("good")) return "pass";
  return "pending";
}

/**
 * @param {object} item
 * @param {string} departmentId
 * @param {object[]} assets
 * @param {object} [hoseProgram]
 */
export function legacyHoseTestToFleet(item = {}, departmentId = "", assets = [], hoseProgram = null) {
  const id = String(item.id || `HOSE-${Date.now().toString(36)}`).trim();
  const unit = String(item.apparatus || item.unit || "").trim();
  const asset = assets.find((row) => (
    row.fleetNumber === unit
    || row.unitDesignation === unit
    || row.id === unit
  ));
  return normalizeFleetTest({
    id,
    testNumber: id,
    departmentId,
    legacyHoseTestId: id,
    programId: hoseProgram?.id || "test-hose",
    programName: hoseProgram?.name || "Hose annual test",
    programType: "hose",
    standardReference: hoseProgram?.standardReference || "NFPA 1962",
    fleetAssetId: asset?.id || "",
    fleetNumber: asset?.fleetNumber || unit,
    section: item.section || "",
    testDate: item.lastTest || "",
    dueDate: item.nextDue || "",
    nextDue: item.nextDue || "",
    result: mapLegacyHoseResult(item.result),
    status: mapLegacyHoseStatus(item.status),
    migratedFromList: true,
  }, departmentId);
}

/**
 * One-way migrate classic hose tests when fleetTests has no hose records.
 * @param {string} departmentId
 * @param {object[]} [legacyFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function migrateHoseTestsFromListIfEmpty(departmentId, legacyFallback = [], audit = {}) {
  if (!departmentId) return [];
  const existing = await listFleetTests(departmentId, { programType: "hose" });
  if (existing.length) return existing;

  let items = [];
  try {
    const pack = await loadTenantListFromFirestore(departmentId, LIST_KEYS.hoseTests);
    items = Array.isArray(pack?.items) ? pack.items : [];
  } catch {
    items = [];
  }
  if (!items.length && Array.isArray(legacyFallback)) items = legacyFallback;
  if (!items.length) return [];

  const [assets, programs] = await Promise.all([
    listFleetAssets(departmentId),
    ensureTestProgramsSeeded(departmentId, audit),
  ]);
  const hoseProgram = programs.find((row) => row.programType === "hose") || programs[0];
  const stamp = nowIso();
  const migrated = [];
  for (const item of items) {
    const record = legacyHoseTestToFleet(item, departmentId, assets, hoseProgram);
    record.createdAt = stamp;
    record.updatedAt = stamp;
    if (!record.id) continue;
    await createRecord(departmentId, FLEET_TESTS_COLLECTION, record.id, record);
    migrated.push(record);
  }

  if (migrated.length) {
    await writeFleetAuditLog(departmentId, {
      action: "migrate",
      recordId: FLEET_TESTS_COLLECTION,
      summary: `Migrated ${migrated.length} hose test(s) from classic list`,
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
    }).catch(() => null);
  }
  return migrated;
}

/**
 * @param {string} departmentId
 * @param {object[]} [legacyFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureFleetTests(departmentId, legacyFallback = [], audit = {}) {
  const existing = await listFleetTests(departmentId);
  if (existing.length) return existing;
  return migrateHoseTestsFromListIfEmpty(departmentId, legacyFallback, audit);
}

/**
 * Evaluate compliance status from next due / result.
 * @param {object} test
 * @param {object} [program]
 * @param {string} [now]
 */
export function evaluateTestCompliance(test = {}, program = {}, now = nowIso()) {
  if (String(test.result || "").toLowerCase() === "fail") {
    return { status: "failed", label: "Failed" };
  }
  const nextDue = test.nextDue || test.dueDate || test.certificateExpiresAt || "";
  if (!nextDue) {
    return { status: test.testDate ? "current" : "never_tested", label: test.testDate ? "Current" : "Never tested" };
  }
  const days = daysBetween(now, nextDue);
  const dueSoon = Number(program.dueSoonDays) || 30;
  if (days == null) return { status: "current", label: "Current" };
  if (days < 0) return { status: "overdue", label: `${Math.abs(days)} days overdue` };
  if (days <= dueSoon) return { status: "due_soon", label: `Due in ${days} days` };
  return { status: "current", label: `Due in ${days} days` };
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function recordFleetTest(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const programs = await ensureTestProgramsSeeded(departmentId, audit);
  const program = programs.find((row) => row.id === input.programId) || programs[0];
  if (!program) throw new Error("Test program not found");

  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === input.fleetAssetId);

  const stamp = nowIso();
  const testDate = input.testDate || stamp.slice(0, 10);
  const nextDue = input.nextDue
    || addCalendarInterval(`${testDate}T12:00:00.000Z`, "months", program.intervalMonths).slice(0, 10);

  const id = input.id || `TST-${Date.now().toString(36).toUpperCase()}`;
  let defectId = "";

  const result = input.result || "pass";
  if (result === "fail" && program.createDefectOnFail && asset?.id) {
    const defect = await createDefect(departmentId, {
      fleetAssetId: asset.id,
      severity: program.blockReturnToServiceOnFail ? "immediate_oos" : "high",
      categoryName: program.name,
      system: "Testing",
      description: `Failed ${program.name}${input.section ? ` — ${input.section}` : ""}`,
      source: "test",
    }, audit).catch(() => null);
    defectId = defect?.id || "";
  }

  const draft = normalizeFleetTest({
    ...input,
    id,
    testNumber: input.testNumber || id,
    departmentId,
    programId: program.id,
    programName: program.name,
    programType: program.programType,
    standardReference: program.standardReference,
    fleetAssetId: asset?.id || input.fleetAssetId || "",
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    testDate,
    dueDate: nextDue,
    nextDue,
    result,
    defectId,
    certificateExpiresAt: input.certificateExpiresAt || (program.certificateRequired ? nextDue : ""),
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  draft.status = evaluateTestCompliance(draft, program).status;
  await createRecord(departmentId, FLEET_TESTS_COLLECTION, id, draft);

  await writeFleetAuditLog(departmentId, {
    action: "test_record",
    recordId: id,
    summary: `Recorded ${program.name} for ${draft.fleetNumber || "unit"} — ${result}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return draft;
}

/**
 * @param {string} departmentId
 * @param {string} testId
 * @param {object} patch
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function updateFleetTest(departmentId, testId, patch = {}, audit = {}) {
  const existing = await getRecord(departmentId, FLEET_TESTS_COLLECTION, testId);
  if (!existing) throw new Error("Test record not found");
  const programs = await listTestPrograms(departmentId);
  const program = programs.find((row) => row.id === (patch.programId || existing.programId)) || {};
  const next = normalizeFleetTest({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  next.status = evaluateTestCompliance(next, program).status;
  await updateRecord(departmentId, FLEET_TESTS_COLLECTION, testId, next);
  await writeFleetAuditLog(departmentId, {
    action: "test_update",
    recordId: testId,
    summary: `Updated test ${next.testNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

/**
 * Latest test per asset+program for compliance board.
 * @param {string} departmentId
 * @param {object[]} [legacyHoseFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function buildTestComplianceBoard(departmentId, legacyHoseFallback = [], audit = {}) {
  const [programs, tests, assets] = await Promise.all([
    ensureTestProgramsSeeded(departmentId, audit),
    ensureFleetTests(departmentId, legacyHoseFallback, audit),
    listFleetAssets(departmentId),
  ]);

  const latestByKey = new Map();
  for (const test of tests) {
    const key = `${test.programId || test.programType}::${test.fleetAssetId || test.fleetNumber}::${test.section || ""}`;
    const current = latestByKey.get(key);
    if (!current || String(test.testDate) > String(current.testDate)) {
      latestByKey.set(key, test);
    }
  }

  const rows = [...latestByKey.values()].map((test) => {
    const program = programs.find((row) => row.id === test.programId) || {};
    const evaluation = evaluateTestCompliance(test, program);
    return {
      ...test,
      status: evaluation.status,
      complianceLabel: evaluation.label,
      certificateRequired: program.certificateRequired !== false,
      hasCertificate: Boolean(test.certificateNumber || test.certificateIssuer),
    };
  }).sort((a, b) => {
    const rank = { failed: 0, overdue: 1, due_soon: 2, never_tested: 3, current: 4 };
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
      || String(a.fleetNumber).localeCompare(String(b.fleetNumber));
  });

  const summary = {
    total: rows.length,
    current: rows.filter((row) => row.status === "current").length,
    dueSoon: rows.filter((row) => row.status === "due_soon").length,
    overdue: rows.filter((row) => row.status === "overdue").length,
    failed: rows.filter((row) => row.status === "failed").length,
    certificates: rows.filter((row) => row.hasCertificate).length,
    assetsCovered: new Set(rows.map((row) => row.fleetAssetId || row.fleetNumber).filter(Boolean)).size,
    programs: programs.filter((row) => row.active !== false).length,
    assetCount: assets.length,
  };

  // Only programs still in use are offered for new tests.
  return { rows, summary, programs: programs.filter((row) => row.active !== false) };
}
