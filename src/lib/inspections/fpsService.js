import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { createViolation } from "./violationService.js";
import {
  FIRE_PROTECTION_SYSTEMS_COLLECTION,
  FPS_CONTRACTORS_COLLECTION,
  FPS_DEFICIENCIES_COLLECTION,
  FPS_IMPAIRMENTS_COLLECTION,
  FPS_TEST_REPORTS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "FPS") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

async function nextNumber(departmentId, collectionName, prefix) {
  const rows = await listRecords(departmentId, collectionName);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(rows.length + 1).padStart(4, "0")}`;
}

export function normalizeFireProtectionSystem(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    systemNumber: data.systemNumber || data.id || "",
    systemTypeId: data.systemTypeId || "sprinkler",
    name: String(data.name || "Untitled system").trim(),
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    manufacturer: data.manufacturer || "",
    model: data.model || "",
    serialNumber: data.serialNumber || "",
    installDate: data.installDate || "",
    designStandard: data.designStandard || "",
    coverageArea: data.coverageArea || "",
    monitoringProvider: data.monitoringProvider || "",
    serviceContractorId: data.serviceContractorId || "",
    serviceContractorName: data.serviceContractorName || "",
    status: data.status || "active",
    lastInspectionAt: data.lastInspectionAt || "",
    nextInspectionAt: data.nextInspectionAt || "",
    lastTestAt: data.lastTestAt || "",
    nextTestAt: data.nextTestAt || "",
    activeImpairmentId: data.activeImpairmentId || "",
    notes: data.notes || "",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeFpsTestReport(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    reportNumber: data.reportNumber || data.id || "",
    systemId: data.systemId || "",
    systemNumber: data.systemNumber || "",
    systemName: data.systemName || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    contractorId: data.contractorId || "",
    contractorName: data.contractorName || "",
    testedAt: data.testedAt || "",
    result: data.result || "pass",
    summary: data.summary || "",
    formNotes: data.formNotes || "",
    status: data.status || "submitted",
    reviewNotes: data.reviewNotes || "",
    reviewedBy: data.reviewedBy || "",
    reviewedByName: data.reviewedByName || "",
    reviewedAt: data.reviewedAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeFpsImpairment(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    impairmentNumber: data.impairmentNumber || data.id || "",
    systemId: data.systemId || "",
    systemNumber: data.systemNumber || "",
    systemName: data.systemName || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    status: data.status || "active",
    reason: data.reason || "",
    fireWatchRequired: Boolean(data.fireWatchRequired),
    startedAt: data.startedAt || "",
    expectedRestoreAt: data.expectedRestoreAt || "",
    restoredAt: data.restoredAt || "",
    notifiedParties: data.notifiedParties || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeFpsDeficiency(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    deficiencyNumber: data.deficiencyNumber || data.id || "",
    systemId: data.systemId || "",
    systemNumber: data.systemNumber || "",
    systemName: data.systemName || "",
    testReportId: data.testReportId || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    status: data.status || "open",
    severity: data.severity || "moderate",
    description: data.description || "",
    correctiveAction: data.correctiveAction || "",
    dueAt: data.dueAt || "",
    violationId: data.violationId || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeFpsContractor(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled contractor").trim(),
    licenseNumber: data.licenseNumber || "",
    licenseExpiresAt: data.licenseExpiresAt || "",
    contactName: data.contactName || "",
    phone: data.phone || "",
    email: data.email || "",
    specialties: Array.isArray(data.specialties) ? data.specialties.map(String) : [],
    status: data.status || "pending_verification",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

export async function listFireProtectionSystems(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FIRE_PROTECTION_SYSTEMS_COLLECTION);
  let list = rows.map((row) => normalizeFireProtectionSystem(row, departmentId));
  if (filters.occupancyId) list = list.filter((row) => row.occupancyId === filters.occupancyId);
  if (filters.status) list = list.filter((row) => row.status === filters.status);
  if (filters.impairedOnly) list = list.filter((row) => row.status === "impaired" || row.activeImpairmentId);
  return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function getFireProtectionSystem(departmentId, systemId) {
  if (!departmentId || !systemId) return null;
  const row = await getRecord(departmentId, FIRE_PROTECTION_SYSTEMS_COLLECTION, systemId);
  return row ? normalizeFireProtectionSystem(row, departmentId) : null;
}

export async function saveFireProtectionSystem(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const id = payload.id || newId("FPS");
  const existing = payload.id
    ? await getFireProtectionSystem(departmentId, id)
    : null;
  const stamp = nowIso();
  const record = normalizeFireProtectionSystem({
    ...(existing || {}),
    ...payload,
    id,
    departmentId,
    systemNumber: existing?.systemNumber || payload.systemNumber || await nextNumber(departmentId, FIRE_PROTECTION_SYSTEMS_COLLECTION, "FPS"),
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || audit.actorUid || "",
    createdByName: existing?.createdByName || audit.actorName || "",
  }, departmentId);

  if (existing?.id) {
    await updateRecord(departmentId, FIRE_PROTECTION_SYSTEMS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FIRE_PROTECTION_SYSTEMS_COLLECTION, id, record);
  }

  await writeInspectionAuditLog(departmentId, {
    action: existing ? "update" : "create",
    recordId: id,
    summary: `${existing ? "Updated" : "Created"} FPS ${record.systemNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function listFpsTestReports(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FPS_TEST_REPORTS_COLLECTION);
  let list = rows.map((row) => normalizeFpsTestReport(row, departmentId));
  if (filters.systemId) list = list.filter((row) => row.systemId === filters.systemId);
  if (filters.openOnly) list = list.filter((row) => ["submitted", "under_review"].includes(row.status));
  return list.sort((a, b) => String(b.testedAt || b.createdAt).localeCompare(String(a.testedAt || a.createdAt)));
}

export async function createFpsTestReport(departmentId, payload = {}, audit = {}) {
  const system = payload.systemId
    ? await getFireProtectionSystem(departmentId, payload.systemId)
    : null;
  const stamp = nowIso();
  const id = newId("FTR");
  const reportNumber = await nextNumber(departmentId, FPS_TEST_REPORTS_COLLECTION, "FTR");
  const record = normalizeFpsTestReport({
    id,
    departmentId,
    reportNumber,
    systemId: system?.id || payload.systemId || "",
    systemNumber: system?.systemNumber || "",
    systemName: system?.name || payload.systemName || "",
    occupancyId: system?.occupancyId || payload.occupancyId || "",
    occupancyName: system?.occupancyName || payload.occupancyName || "",
    contractorId: payload.contractorId || system?.serviceContractorId || "",
    contractorName: payload.contractorName || system?.serviceContractorName || "",
    testedAt: payload.testedAt || stamp.slice(0, 10),
    result: payload.result || "pass",
    summary: payload.summary || "",
    formNotes: payload.formNotes || "",
    status: payload.status || "submitted",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);

  await createRecord(departmentId, FPS_TEST_REPORTS_COLLECTION, id, record);

  if (system?.id) {
    await saveFireProtectionSystem(departmentId, {
      ...system,
      lastTestAt: record.testedAt,
      lastInspectionAt: record.testedAt,
      nextTestAt: payload.nextTestAt || "",
    }, audit);
  }

  await writeInspectionAuditLog(departmentId, {
    action: "create",
    recordId: id,
    summary: `FPS test report ${reportNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function reviewFpsTestReport(departmentId, reportId, payload = {}, audit = {}) {
  const existing = normalizeFpsTestReport(
    await getRecord(departmentId, FPS_TEST_REPORTS_COLLECTION, reportId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Test report not found.");
  const stamp = nowIso();
  const next = normalizeFpsTestReport({
    ...existing,
    status: payload.status || "accepted",
    reviewNotes: payload.reviewNotes || "",
    reviewedBy: audit.actorUid || "",
    reviewedByName: audit.actorName || "",
    reviewedAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, FPS_TEST_REPORTS_COLLECTION, reportId, next);
  return next;
}

export async function listFpsImpairments(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FPS_IMPAIRMENTS_COLLECTION);
  let list = rows.map((row) => normalizeFpsImpairment(row, departmentId));
  if (filters.systemId) list = list.filter((row) => row.systemId === filters.systemId);
  if (filters.activeOnly) list = list.filter((row) => row.status === "active" || row.status === "extended");
  return list.sort((a, b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
}

export async function createFpsImpairment(departmentId, payload = {}, audit = {}) {
  const system = payload.systemId
    ? await getFireProtectionSystem(departmentId, payload.systemId)
    : null;
  if (!system) throw new Error("System required.");

  const stamp = nowIso();
  const id = newId("IMP");
  const impairmentNumber = await nextNumber(departmentId, FPS_IMPAIRMENTS_COLLECTION, "IMP");
  const record = normalizeFpsImpairment({
    id,
    departmentId,
    impairmentNumber,
    systemId: system.id,
    systemNumber: system.systemNumber,
    systemName: system.name,
    occupancyId: system.occupancyId,
    occupancyName: system.occupancyName,
    status: "active",
    reason: payload.reason || "",
    fireWatchRequired: Boolean(payload.fireWatchRequired),
    startedAt: payload.startedAt || stamp.slice(0, 10),
    expectedRestoreAt: payload.expectedRestoreAt || "",
    notifiedParties: payload.notifiedParties || "",
    notes: payload.notes || "",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);

  await createRecord(departmentId, FPS_IMPAIRMENTS_COLLECTION, id, record);
  await saveFireProtectionSystem(departmentId, {
    ...system,
    status: "impaired",
    activeImpairmentId: id,
  }, audit);

  await writeInspectionAuditLog(departmentId, {
    action: "impair",
    recordId: id,
    summary: `Impairment ${impairmentNumber} on ${system.systemNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function restoreFpsImpairment(departmentId, impairmentId, notes = "", audit = {}) {
  const existing = normalizeFpsImpairment(
    await getRecord(departmentId, FPS_IMPAIRMENTS_COLLECTION, impairmentId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Impairment not found.");
  const stamp = nowIso();
  const next = normalizeFpsImpairment({
    ...existing,
    status: "restored",
    restoredAt: stamp,
    notes: [existing.notes, notes].filter(Boolean).join("\n"),
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, FPS_IMPAIRMENTS_COLLECTION, impairmentId, next);

  if (existing.systemId) {
    const system = await getFireProtectionSystem(departmentId, existing.systemId);
    if (system) {
      await saveFireProtectionSystem(departmentId, {
        ...system,
        status: "active",
        activeImpairmentId: "",
      }, audit);
    }
  }
  return next;
}

export async function listFpsDeficiencies(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FPS_DEFICIENCIES_COLLECTION);
  let list = rows.map((row) => normalizeFpsDeficiency(row, departmentId));
  if (filters.systemId) list = list.filter((row) => row.systemId === filters.systemId);
  if (filters.openOnly) {
    list = list.filter((row) => ["open", "under_repair"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function createFpsDeficiency(departmentId, payload = {}, audit = {}) {
  const system = payload.systemId
    ? await getFireProtectionSystem(departmentId, payload.systemId)
    : null;
  const stamp = nowIso();
  const id = newId("DEF");
  const deficiencyNumber = await nextNumber(departmentId, FPS_DEFICIENCIES_COLLECTION, "DEF");
  const record = normalizeFpsDeficiency({
    id,
    departmentId,
    deficiencyNumber,
    systemId: system?.id || payload.systemId || "",
    systemNumber: system?.systemNumber || "",
    systemName: system?.name || "",
    testReportId: payload.testReportId || "",
    occupancyId: system?.occupancyId || payload.occupancyId || "",
    occupancyName: system?.occupancyName || payload.occupancyName || "",
    address: system?.address || payload.address || "",
    status: "open",
    severity: payload.severity || "moderate",
    description: payload.description || "",
    correctiveAction: payload.correctiveAction || "",
    dueAt: payload.dueAt || "",
    notes: payload.notes || "",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);

  await createRecord(departmentId, FPS_DEFICIENCIES_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    action: "create",
    recordId: id,
    summary: `FPS deficiency ${deficiencyNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

/**
 * Convert an FPS deficiency into an inspections violation (Phase 5 linkage).
 */
export async function convertFpsDeficiencyToViolation(departmentId, deficiencyId, payload = {}, audit = {}) {
  const existing = normalizeFpsDeficiency(
    await getRecord(departmentId, FPS_DEFICIENCIES_COLLECTION, deficiencyId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Deficiency not found.");
  if (existing.violationId) throw new Error("Deficiency already converted.");

  const violation = await createViolation(departmentId, {
    name: payload.name || `FPS deficiency: ${existing.description || existing.deficiencyNumber}`,
    occupancyId: existing.occupancyId,
    occupancyName: existing.occupancyName,
    address: existing.address,
    description: existing.description,
    correctiveAction: existing.correctiveAction,
    severity: existing.severity || "moderate",
    dueAt: existing.dueAt,
    locationOnProperty: existing.systemName || existing.systemNumber || "",
  }, audit);

  const stamp = nowIso();
  const next = normalizeFpsDeficiency({
    ...existing,
    status: "converted_to_violation",
    violationId: violation.id,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, FPS_DEFICIENCIES_COLLECTION, deficiencyId, next);

  await writeInspectionAuditLog(departmentId, {
    action: "convert",
    recordId: deficiencyId,
    summary: `Converted ${existing.deficiencyNumber} → violation ${violation.id}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });

  return { deficiency: next, violation };
}

export async function listFpsContractors(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FPS_CONTRACTORS_COLLECTION);
  let list = rows.map((row) => normalizeFpsContractor(row, departmentId));
  if (filters.activeOnly) list = list.filter((row) => row.status === "active");
  return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function saveFpsContractor(departmentId, payload = {}, audit = {}) {
  const id = payload.id || newId("CTR");
  const existing = payload.id
    ? normalizeFpsContractor(await getRecord(departmentId, FPS_CONTRACTORS_COLLECTION, id) || {}, departmentId)
    : null;
  const stamp = nowIso();
  const record = normalizeFpsContractor({
    ...(existing?.id ? existing : {}),
    ...payload,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);

  if (existing?.id) {
    await updateRecord(departmentId, FPS_CONTRACTORS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FPS_CONTRACTORS_COLLECTION, id, record);
  }

  await writeInspectionAuditLog(departmentId, {
    action: existing?.id ? "update" : "create",
    recordId: id,
    summary: `FPS contractor ${record.name}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export function buildFpsBoardMetrics({
  systems = [],
  impairments = [],
  deficiencies = [],
  testReports = [],
  contractors = [],
} = {}) {
  return {
    systems: systems.length,
    impaired: systems.filter((row) => row.status === "impaired" || row.activeImpairmentId).length,
    activeImpairments: impairments.filter((row) => ["active", "extended"].includes(row.status)).length,
    openDeficiencies: deficiencies.filter((row) => ["open", "under_repair"].includes(row.status)).length,
    reportsPending: testReports.filter((row) => ["submitted", "under_review"].includes(row.status)).length,
    contractorsActive: contractors.filter((row) => row.status === "active").length,
  };
}

export async function loadFpsBoard(departmentId) {
  if (!departmentId) {
    return {
      systems: [],
      impairments: [],
      deficiencies: [],
      testReports: [],
      contractors: [],
      metrics: buildFpsBoardMetrics(),
    };
  }
  const [systems, impairments, deficiencies, testReports, contractors] = await Promise.all([
    listFireProtectionSystems(departmentId),
    listFpsImpairments(departmentId),
    listFpsDeficiencies(departmentId),
    listFpsTestReports(departmentId),
    listFpsContractors(departmentId),
  ]);
  return {
    systems,
    impairments,
    deficiencies,
    testReports,
    contractors,
    metrics: buildFpsBoardMetrics({
      systems,
      impairments,
      deficiencies,
      testReports,
      contractors,
    }),
  };
}
