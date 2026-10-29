import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { getPublishedChecklistSnapshot } from "./fleetChecklistService.js";
import { getFleetAsset, saveFleetAsset } from "./fleetAssetService.js";
import { recordMeterReading } from "./fleetMeterService.js";
import { createDefectsFromCheckFailures } from "./fleetDefectService.js";
import { applyFleetStatusDecision } from "./fleetStatusControlService.js";
import { FLEET_CHECKS_COLLECTION } from "./paths.js";
import { checkProblems } from "./checkProgress.js";

function nowIso() {
  return new Date().toISOString();
}

function draftStorageKey(departmentId, checkId) {
  return `forge-fleet-check-draft:${departmentId}:${checkId}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetCheck(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    unitDesignation: data.unitDesignation || "",
    station: data.station || "",
    templateId: data.templateId || "",
    templateVersion: Number(data.templateVersion) || 0,
    templateSnapshot: data.templateSnapshot || null,
    status: data.status || "in_progress",
    result: data.result || "",
    readinessRecommendation: data.readinessRecommendation || "",
    answers: data.answers && typeof data.answers === "object" ? data.answers : {},
    failNotes: data.failNotes && typeof data.failNotes === "object" ? data.failNotes : {},
    failedItems: Array.isArray(data.failedItems) ? data.failedItems : [],
    meterReadings: Array.isArray(data.meterReadings) ? data.meterReadings : [],
    startedAt: data.startedAt || "",
    completedAt: data.completedAt || "",
    operatorId: data.operatorId || "",
    operatorName: data.operatorName || "",
    offlineDraft: Boolean(data.offlineDraft),
    createdDefectIds: Array.isArray(data.createdDefectIds) ? data.createdDefectIds : [],
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, openOnly?: boolean }} [filters]
 */
export async function listFleetChecks(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_CHECKS_COLLECTION);
  let list = rows.map((row) => normalizeFleetCheck(row, departmentId));
  if (filters.fleetAssetId) {
    list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  }
  if (filters.openOnly) {
    list = list.filter((row) => ["draft", "in_progress"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.startedAt).localeCompare(String(a.updatedAt || a.startedAt)));
}

/**
 * @param {string} departmentId
 * @param {string} checkId
 */
export async function getFleetCheck(departmentId, checkId) {
  const row = await getRecord(departmentId, FLEET_CHECKS_COLLECTION, checkId);
  return row ? normalizeFleetCheck(row, departmentId) : null;
}

/**
 * Persist an offline draft locally (survives refresh).
 * @param {string} departmentId
 * @param {object} check
 */
export function saveCheckOfflineDraft(departmentId, check = {}) {
  if (!departmentId || !check.id || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(draftStorageKey(departmentId, check.id), JSON.stringify({
      ...check,
      offlineDraft: true,
      updatedAt: nowIso(),
    }));
  } catch {
    // ignore quota
  }
}

/**
 * @param {string} departmentId
 * @param {string} checkId
 */
export function loadCheckOfflineDraft(departmentId, checkId) {
  if (!departmentId || !checkId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftStorageKey(departmentId, checkId));
    if (!raw) return null;
    return normalizeFleetCheck(JSON.parse(raw), departmentId);
  } catch {
    return null;
  }
}

/**
 * @param {string} departmentId
 * @param {string} checkId
 */
export function clearCheckOfflineDraft(departmentId, checkId) {
  if (!departmentId || !checkId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(draftStorageKey(departmentId, checkId));
  } catch {
    // ignore
  }
}

/**
 * Start a check from a published template snapshot.
 * @param {string} departmentId
 * @param {{ fleetAssetId: string, templateId: string }} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function startFleetCheck(departmentId, input = {}, audit = {}) {
  if (!departmentId || !input.fleetAssetId || !input.templateId) {
    throw new Error("departmentId, fleetAssetId, and templateId are required");
  }

  const [asset, snapshot] = await Promise.all([
    getFleetAsset(departmentId, input.fleetAssetId),
    getPublishedChecklistSnapshot(departmentId, input.templateId),
  ]);
  if (!asset) throw new Error("Fleet asset not found");
  if (!snapshot) throw new Error("No published checklist template found. Publish a template first.");

  const stamp = nowIso();
  const id = `CHK-${Date.now().toString(36).toUpperCase()}`;
  const check = normalizeFleetCheck({
    id,
    departmentId,
    fleetAssetId: asset.id,
    fleetNumber: asset.fleetNumber,
    unitDesignation: asset.unitDesignation,
    station: asset.station,
    templateId: snapshot.templateId,
    templateVersion: snapshot.version,
    templateSnapshot: snapshot,
    status: "in_progress",
    answers: {},
    failNotes: {},
    startedAt: stamp,
    operatorId: audit.actorUid || "",
    operatorName: audit.actorName || "Operator",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_CHECKS_COLLECTION, id, check);
  saveCheckOfflineDraft(departmentId, check);

  await writeFleetAuditLog(departmentId, {
    action: "check_start",
    recordId: id,
    summary: `Started ${snapshot.name} on ${asset.fleetNumber || asset.id}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return check;
}

/**
 * Save in-progress answers (Firestore + offline draft).
 * @param {string} departmentId
 * @param {string} checkId
 * @param {{ answers?: object, failNotes?: object }} payload
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetCheckDraft(departmentId, checkId, payload = {}, audit = {}) {
  const existing = await getFleetCheck(departmentId, checkId);
  if (!existing) throw new Error("Check not found");
  if (existing.status === "completed") throw new Error("Completed checks cannot be edited");

  const next = normalizeFleetCheck({
    ...existing,
    answers: payload.answers ?? existing.answers,
    failNotes: payload.failNotes ?? existing.failNotes,
    status: "in_progress",
    updatedAt: nowIso(),
  }, departmentId);

  await updateRecord(departmentId, FLEET_CHECKS_COLLECTION, checkId, next);
  saveCheckOfflineDraft(departmentId, next);
  return next;
}

function isFailAnswer(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "fail" || v === "no" || v === "failed" || v === "noncompliant";
}

/**
 * Evaluate failed items from template snapshot + answers.
 * @param {object} check
 */
export function evaluateCheckFailures(check = {}) {
  const sections = check.templateSnapshot?.sections || [];
  const failed = [];
  for (const section of sections) {
    for (const field of section.fields || []) {
      if (["heading", "instruction"].includes(field.type)) continue;
      const answer = check.answers?.[field.key];
      if (isFailAnswer(answer)) {
        failed.push({
          fieldKey: field.key,
          label: field.label,
          failAction: field.failAction || "continue",
          note: check.failNotes?.[field.key] || "",
          noteRequiredOnFail: Boolean(field.noteRequiredOnFail),
        });
      }
    }
  }
  return failed;
}

/**
 * Highest severity fail action among failed items.
 * @param {object[]} failedItems
 */
export function resolveFailResponseAction(failedItems = []) {
  if (failedItems.some((item) => item.failAction === "oos")) return "oos";
  if (failedItems.some((item) => item.failAction === "restrict")) return "restrict";
  return "continue";
}

/**
 * Complete a check: snapshot answers, meters, fail handling, update asset readiness.
 * @param {string} departmentId
 * @param {string} checkId
 * @param {{ answers?: object, failNotes?: object, result?: string }} payload
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function completeFleetCheck(departmentId, checkId, payload = {}, audit = {}) {
  const existing = await getFleetCheck(departmentId, checkId);
  if (!existing) throw new Error("Check not found");
  if (existing.status === "completed") return existing;

  const answers = payload.answers ?? existing.answers;
  const failNotes = payload.failNotes ?? existing.failNotes;
  const working = { ...existing, answers, failNotes };
  const { missing } = checkProblems(existing.templateSnapshot?.sections || [], answers, failNotes);
  if (missing.length) {
    throw new Error(`Answer the required item${missing.length === 1 ? "" : "s"} first: ${missing.map((field) => field.label).join(", ")}`);
  }
  const failedItems = evaluateCheckFailures(working);

  for (const item of failedItems) {
    if (item.noteRequiredOnFail && !String(item.note || "").trim()) {
      throw new Error(`Note required for failed item: ${item.label}`);
    }
  }

  const failAction = resolveFailResponseAction(failedItems);
  const readinessRecommendation = failAction === "oos"
    ? "out_of_service"
    : failAction === "restrict"
      ? "available_restricted"
      : "available";

  const stamp = nowIso();
  const meterReadings = [];
  const sections = existing.templateSnapshot?.sections || [];
  for (const section of sections) {
    for (const field of section.fields || []) {
      if (!["meter_reading", "fuel_level"].includes(field.type)) continue;
      const value = answers[field.key];
      if (value === undefined || value === null || value === "") continue;
      const meterType = field.type === "fuel_level"
        ? "fuel_level"
        : (field.meterType || field.key);
      const reading = await recordMeterReading(departmentId, {
        fleetAssetId: existing.fleetAssetId,
        checkId,
        meterType,
        value,
        source: "check",
      }, { ...audit, syncAsset: true });
      meterReadings.push(reading);
    }
  }

  const result = payload.result
    || (failedItems.length ? "Failed" : "Passed");

  const completed = normalizeFleetCheck({
    ...working,
    status: "completed",
    result,
    readinessRecommendation,
    failedItems,
    meterReadings: meterReadings.map((row) => ({
      id: row.id,
      meterType: row.meterType,
      value: row.value,
    })),
    completedAt: stamp,
    updatedAt: stamp,
    offlineDraft: false,
  }, departmentId);

  await updateRecord(departmentId, FLEET_CHECKS_COLLECTION, checkId, completed);
  clearCheckOfflineDraft(departmentId, checkId);

  const createdDefects = failedItems.length
    ? await createDefectsFromCheckFailures(departmentId, completed, failedItems, audit)
    : [];

  // Apply fail handling via status decision records (Phase 5).
  const asset = await getFleetAsset(departmentId, existing.fleetAssetId);
  if (asset) {
    await saveFleetAsset(departmentId, {
      ...asset,
      lastCheckAt: stamp,
      lastCheckId: checkId,
      lastCheckResult: result,
    }, audit);

    if (failAction === "oos" || failAction === "restrict") {
      await applyFleetStatusDecision(departmentId, {
        fleetAssetId: asset.id,
        decision: failAction === "oos" ? "out_of_service" : "restrict",
        basis: `Automated from check ${checkId}`,
        authority: "check_fail_rule",
        defectIds: createdDefects.map((row) => row.id),
        restriction: failAction === "restrict"
          ? `Restricted due to failed check items: ${failedItems.map((i) => i.label).join(", ")}`
          : "",
      }, audit);
    } else {
      await saveFleetAsset(departmentId, {
        ...(await getFleetAsset(departmentId, existing.fleetAssetId)),
        readinessState: readinessRecommendation,
        lastCheckAt: stamp,
        lastCheckId: checkId,
        lastCheckResult: result,
      }, audit);
    }
  }

  const withDefects = normalizeFleetCheck({
    ...completed,
    createdDefectIds: createdDefects.map((row) => row.id),
  }, departmentId);
  if (createdDefects.length) {
    await updateRecord(departmentId, FLEET_CHECKS_COLLECTION, checkId, withDefects);
  }

  await writeFleetAuditLog(departmentId, {
    action: "check_complete",
    recordId: checkId,
    summary: `Completed check on ${existing.fleetNumber || existing.fleetAssetId}: ${result} (${readinessRecommendation})`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
    after: { failedCount: failedItems.length, failAction, defectCount: createdDefects.length },
  }).catch(() => null);

  return withDefects;
}
