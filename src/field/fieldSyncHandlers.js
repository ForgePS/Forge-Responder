/**
 * How each kind of field record is written to the server. Every handler:
 *  - writes with ids fixed on the device (retries overwrite, never duplicate)
 *  - records finished steps with ctx.markStep so a retry resumes
 *  - throws FieldConflictError / FieldRejectedError when the crew must decide
 * Record shapes match what the desktop RMS pages write.
 */
import { doc, getDoc } from "firebase/firestore";
import { getFirestoreDb, uploadFirebaseFile } from "../lib/firebaseClient.js";
import { createRecord, getRecord, updateRecord } from "../lib/firestoreService.js";
import { readTenantListItem, upsertTenantListItem } from "../lib/tenantListStore.js";
import { LIST_KEYS } from "../lib/tenantListKeys.js";
import { safeFileName } from "../lib/storagePaths.js";
import { completeFleetCheck, normalizeFleetCheck } from "../lib/fleet/fleetCheckService.js";
import { FLEET_CHECKS_COLLECTION } from "../lib/fleet/paths.js";
import {
  hydrantFirebaseDocId,
  mergeHydrantUpdate,
  saveTenantHydrantCollectionRecord,
  saveTenantHydrantRecord,
} from "../lib/hydrantTenantService.js";
import { buildFlowTestStatusPatch, flowCodeForClass, inspectionStatusPatch, nfpaColorNameForClass } from "../lib/hydrantStatusSync.js";
import { createHydrantDamageReport } from "../lib/hydrantDamage/damageReportService.js";
import { HYDRANT_DAMAGE_REPORTS_COLLECTION } from "../lib/hydrantDamage/paths.js";
import {
  buildBattalionChiefRecipientTokens,
  buildMaintenanceIssueMessageBody,
  buildMaintenanceWorkOrderRecord,
  resolveAllBattalionChiefs,
} from "../lib/maintenanceIssueWorkflow.js";
import { sendInternalEmail } from "../lib/internalEmailService.js";
import { writeAuditLog } from "../lib/auditService.js";
import { normalizeDailyLogRecord } from "../lib/dailyLogSchema.js";
import { isDailyLogLocked, resolveAutoLockAt } from "../lib/dailyLogLock.js";
import { NERIS_FORM_MODULES } from "../lib/nerisSchema.js";
import { blobGet } from "./fieldDb.js";
import { FieldConflictError, FieldRejectedError } from "./fieldErrors.js";
import { threeWayMerge, isSameOrNewerDate } from "./fieldMerge.js";
import { refItems } from "./fieldRefData.js";
import { summarizeCheckoff } from "./checkoffModel.js";
import { CHECKOFFS_COLLECTION, PREPLAN_FIELD_UPDATES_COLLECTION } from "./fieldAdminService.js";
import {
  createPreplan,
  getPreplan,
  getPreplanRevision,
  registerPreplanFile,
  startPreplanRevision,
  updatePreplan,
  updatePreplanRevision,
} from "../lib/inspections/preplanService.js";
import { localDate } from "./fieldValidation.js";
import { completeInspection, getInspectionRecord, saveInspectionDraft } from "../lib/inspections/inspectionWorkflow.js";
import { createViolation } from "../lib/inspections/violationService.js";

function nowIso() {
  return new Date().toISOString();
}

function isPermissionError(error) {
  return String(error?.code || "").includes("permission-denied") || String(error?.code || "").includes("unauthorized");
}

/** Upload photos not yet uploaded; returns [{name, url, storagePath}]. */
async function uploadAttachments(record, ctx, folder) {
  const attachments = [...(record.attachments || [])];
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    if (attachment.uploaded?.downloadUrl) continue;
    const stored = await blobGet(attachment.id);
    if (!stored?.blob) {
      throw new FieldRejectedError(`Photo "${attachment.name}" is missing from this device. Remove it and send again.`);
    }
    const path = `departments/${ctx.departmentId}/${folder}/${record.localId}/${attachment.id}-${safeFileName(attachment.name || "photo.jpg")}`;
    const uploaded = await uploadFirebaseFile(path, stored.blob);
    attachments[index] = { ...attachment, uploaded: { storagePath: uploaded.storagePath, downloadUrl: uploaded.downloadUrl } };
    await ctx.setAttachments(attachments);
  }
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    url: attachment.uploaded.downloadUrl,
    storagePath: attachment.uploaded.storagePath,
  }));
}

/* ------------------------------- truck check ------------------------------ */

async function syncTruckCheck(record, ctx) {
  const data = record.data;
  const checkId = data.checkId;
  const existing = await getRecord(ctx.departmentId, FLEET_CHECKS_COLLECTION, checkId);
  if (existing?.status === "completed") {
    return { serverIds: { checkId } };
  }
  if (!ctx.steps.created || !existing) {
    const draft = normalizeFleetCheck({
      id: checkId,
      departmentId: ctx.departmentId,
      fleetAssetId: data.assetId,
      fleetNumber: data.fleetNumber,
      unitDesignation: data.unitDesignation,
      station: data.station,
      templateId: data.template.templateId,
      templateVersion: data.template.version,
      templateSnapshot: {
        templateId: data.template.templateId,
        versionId: data.template.versionId || "",
        version: data.template.version,
        name: data.template.name,
        checkType: data.template.checkType || "",
        sections: data.template.sections,
      },
      status: "in_progress",
      answers: data.answers,
      failNotes: data.failNotes,
      startedAt: data.startedAt,
      operatorId: ctx.uid,
      operatorName: data.operatorName || ctx.actor.actorName,
      offlineDraft: true,
      createdAt: data.startedAt,
      updatedAt: nowIso(),
    }, ctx.departmentId);
    await createRecord(ctx.departmentId, FLEET_CHECKS_COLLECTION, checkId, { ...draft, source: "field-app" });
    await ctx.markStep("created");
  }
  try {
    await completeFleetCheck(ctx.departmentId, checkId, {
      answers: data.answers,
      failNotes: data.failNotes,
      completedAt: data.completedAt,
    }, ctx.actor);
  } catch (error) {
    if (/note required|not found/i.test(error?.message || "")) throw new FieldRejectedError(error.message);
    throw error;
  }
  return { serverIds: { checkId } };
}

/* -------------------------------- hose test ------------------------------- */

async function syncHoseTest(record, ctx) {
  const data = record.data;
  const stamp = new Date(record.createdAt).getTime();
  const suffix = record.localId.slice(-4);
  const ids = [];
  for (let index = 0; index < data.hoseIds.length; index += 1) {
    const hoseId = data.hoseIds[index];
    const id = `${stamp}-${index}-${suffix}`;
    const known = refItems(ctx.refData, "hoseInventory").find((hose) => hose.hoseId.toUpperCase() === hoseId.toUpperCase());
    await saveTenantHydrantCollectionRecord(ctx.departmentId, "hoseTests", hydrantFirebaseDocId(id), {
      id,
      hoseId,
      apparatus: known?.apparatus || data.apparatus || "",
      diameter: known?.diameter || data.diameter || "",
      length: known?.length || data.length || "",
      pressure: data.pressure,
      result: data.result,
      testedBy: data.testedBy,
      notes: data.notes || "",
      testDate: data.testDate,
      shift: data.shift,
      created_at: record.savedAt || record.createdAt,
      source: "field-app",
    });
    ids.push(id);
  }
  return { serverIds: { hoseTestIds: ids } };
}

/* --------------------------------- hydrants ------------------------------- */

async function serverHydrant(ctx, hydrant) {
  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, "departments", ctx.departmentId, "hydrants", hydrantFirebaseDocId(hydrant.location_id, hydrant.hydrant_id)));
  return snap.exists() ? { ...hydrant, ...snap.data() } : hydrant;
}

/** Apply a hydrant summary patch unless the server already has a newer check. */
async function patchHydrantSummary(ctx, hydrant, buildPatch, checkedDate) {
  const current = await serverHydrant(ctx, hydrant);
  if (!isSameOrNewerDate(checkedDate, current.last_checked)) {
    return `hydrant summary kept (server has a newer check from ${current.last_checked})`;
  }
  await saveTenantHydrantRecord(ctx.departmentId, mergeHydrantUpdate(current, buildPatch(current)));
  return "";
}

async function syncHydrantInspection(record, ctx) {
  const data = record.data;
  const hydrant = data.hydrant;
  const photos = record.attachments?.length ? await uploadAttachments(record, ctx, "hydrant-inspections") : [];
  const inspectedAt = `${data.date}T12:00:00.000Z`;
  const id = hydrantFirebaseDocId("inspection", hydrant.location_id, hydrant.hydrant_id, inspectedAt);
  const photoById = new Map(photos.map((photo) => [photo.id, photo]));
  const checklist = data.checklist.map((row) => {
    const first = (row.photoIds || []).map((id) => photoById.get(id)).find(Boolean);
    return {
      item: row.item,
      result: row.result,
      notes: row.notes || "",
      repair_needed: row.repair_needed || (row.result === "No" ? "Yes" : "No"),
      photo_name: first?.name || "",
      photo_url: first?.url || "",
      photo_storage_path: first?.storagePath || "",
    };
  });
  const payload = {
    id,
    location_id: hydrant.location_id,
    hydrant_id: hydrant.hydrant_id,
    inspected_at: inspectedAt,
    tested_by: data.testedBy,
    shift: data.shift,
    checklist,
    notes: data.notes || "",
    photos,
    created_at: record.savedAt || record.createdAt,
    source: "field-app",
  };
  if (!ctx.steps.inspection) {
    await saveTenantHydrantCollectionRecord(ctx.departmentId, "hydrantInspections", id, payload);
    await saveTenantHydrantCollectionRecord(ctx.departmentId, "dailyActivity", hydrantFirebaseDocId("activity", id), { type: "Inspection", ...payload, id: `activity-${id}` });
    await ctx.markStep("inspection");
  }
  const warning = await patchHydrantSummary(ctx, hydrant, (current) => ({
    ...inspectionStatusPatch(current, checklist),
    last_checked: data.date,
    checked_year: data.date.slice(0, 4),
    checked_status: "Checked",
    checked_source: "Inspection",
    checked_by: data.testedBy,
    checked_shift: data.shift,
    edited_by: data.testedBy,
    edited_shift: data.shift,
    edited_date: data.date,
    edit_source: "Field inspection",
  }), data.date);
  return { serverIds: { inspectionId: id }, warnings: warning ? [warning] : [] };
}

async function syncFlowTest(record, ctx) {
  const data = record.data;
  const hydrant = data.hydrant;
  const testedAt = `${data.date}T12:00:00.000Z`;
  const id = hydrantFirebaseDocId("flow", hydrant.location_id, hydrant.hydrant_id, testedAt);
  const form = {
    discharge_size: data.dischargeSize,
    pitot_psi: data.pitotPsi,
    static_psi: data.staticPsi,
    residual_psi: data.residualPsi,
    notes: data.notes || "",
  };
  const info = data.info || {};
  const status = info.status || hydrant.status || "In Service";
  const [latitude, longitude] = String(info.gps || "").split(",").map((part) => part.trim());
  const withOverride = (patch) => (data.nfpaOverride
    ? { ...patch, nfpa_class: data.nfpaOverride, flow_result: flowCodeForClass(data.nfpaOverride), nfpa_color: nfpaColorNameForClass(data.nfpaOverride) }
    : patch);
  const synced = withOverride(buildFlowTestStatusPatch(hydrant, { status }, { ...form, status }, data.flowGpm));
  const test = {
    ...form,
    id,
    nfpa_class: synced.nfpa_class,
    nfpa_color: synced.nfpa_color || nfpaColorNameForClass(synced.nfpa_class),
    flow_gpm: data.flowGpm,
    flow_result: synced.flow_result,
    location_id: hydrant.location_id,
    hydrant_id: hydrant.hydrant_id,
    district: info.district ?? hydrant.district ?? "",
    tested_at: testedAt,
    tested_by: data.testedBy,
    shift: data.shift,
    created_at: record.savedAt || record.createdAt,
    status: synced.status,
    source: "field-app",
  };
  if (!ctx.steps.flowTest) {
    await saveTenantHydrantCollectionRecord(ctx.departmentId, "hydrantFlowTests", id, test);
    await saveTenantHydrantCollectionRecord(ctx.departmentId, "dailyActivity", hydrantFirebaseDocId("activity", id), { type: "Flow Test", ...test, id: `activity-${id}` });
    await ctx.markStep("flowTest");
  }
  const warning = await patchHydrantSummary(ctx, hydrant, (current) => {
    const nextStatus = info.status || current.status || "In Service";
    const patch = withOverride(buildFlowTestStatusPatch(current, { status: nextStatus }, { ...form, status: nextStatus }, data.flowGpm));
    return {
      ...(info.district !== undefined ? { district: info.district } : {}),
      ...(info.provider ? { provider: info.provider, water_assoc: info.provider } : {}),
      ...(latitude && longitude ? { latitude, lat: latitude, longitude, lon: longitude } : {}),
      status: patch.status,
      discharge_size: form.discharge_size,
      pitot_psi: form.pitot_psi,
      static_psi: form.static_psi,
      residual_psi: form.residual_psi,
      flow_gpm: data.flowGpm,
      flow_result: patch.flow_result,
      nfpa_class: patch.nfpa_class,
      nfpa_color: nfpaColorNameForClass(patch.nfpa_class),
      last_checked: data.date,
      checked_year: data.date.slice(0, 4),
      checked_status: "Checked",
      checked_source: "Flow Test",
      checked_by: data.testedBy,
      checked_shift: data.shift,
      edited_by: data.testedBy,
      edited_shift: data.shift,
      edited_date: data.date,
      edit_source: "Field flow test",
    };
  }, data.date);
  return { serverIds: { flowTestId: id }, warnings: warning ? [warning] : [] };
}

async function syncHydrantDamage(record, ctx) {
  const data = record.data;
  const photos = record.attachments?.length ? await uploadAttachments(record, ctx, "hydrant-damage") : [];
  const report = await createHydrantDamageReport(ctx.departmentId, {
    id: data.reportId,
    hydrant: data.hydrant,
    sourceType: "field",
    sourceRecordId: record.localId,
    severity: data.severity,
    operationalStatus: data.operationalStatus,
    damageCategoryIds: data.categoryIds,
    description: data.description,
    discoveredAt: data.discoveredAt,
    details: {
      leaking: Boolean(data.leaking),
      roadwayHazard: Boolean(data.roadwayHazard),
      publicSafetyHazard: Boolean(data.publicSafetyHazard),
      immediateActions: data.immediateActions || "",
    },
  }, ctx.actor);
  if (photos.length) {
    await updateRecord(ctx.departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, report.id, { fieldPhotos: photos });
  }
  return { serverIds: { reportId: report.id, reportNumber: report.reportNumber } };
}

/* -------------------------------- damage form ----------------------------- */

async function syncDamageForm(record, ctx) {
  const data = record.data;
  const caps = ctx.caps || {};
  const warnings = [];
  const photos = record.attachments?.length ? await uploadAttachments(record, ctx, "damage-forms") : [];
  const form = { date: data.date, location: data.location, equipment: data.equipment, damageDescription: data.description };
  const submittedBy = data.submittedBy || ctx.actor.actorName;
  const workOrderId = `WO-F${new Date(record.createdAt).getTime().toString(36).toUpperCase()}${record.localId.slice(-3).toUpperCase()}`;
  let wrote = Boolean(ctx.steps.workOrder || ctx.steps.damageForm);

  if (caps.maintenance && !ctx.steps.workOrder) {
    try {
      const workOrder = {
        ...buildMaintenanceWorkOrderRecord(form, submittedBy, 0),
        id: workOrderId,
        source: "field-app",
        submittedAt: record.savedAt || record.createdAt,
        photos,
      };
      await upsertTenantListItem(getFirestoreDb(), ctx.departmentId, LIST_KEYS.workOrders, workOrder, { userId: ctx.uid });
      await ctx.markStep("workOrder");
      wrote = true;
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      warnings.push("no work order (Maintenance not allowed)");
    }
  }

  if (!ctx.steps.damageForm) {
    try {
      const summary = String(data.description || "").trim();
      await createRecord(ctx.departmentId, "damageForms", `field-${record.localId}`, {
        source: "field-app",
        title: `Damage report — ${data.location || "Unspecified"}`,
        summary,
        submittedAt: record.savedAt || record.createdAt,
        submitterName: submittedBy,
        location: data.location || "",
        equipment: data.equipment || "",
        damageDescription: summary,
        workOrderId: caps.maintenance ? workOrderId : "",
        photos,
        answers: [
          { label: "Date", value: data.date || "" },
          { label: "Location", value: data.location || "" },
          { label: "Equipment", value: data.equipment || "" },
          { label: "Damage description", value: summary },
          { label: "Submitted by", value: submittedBy },
          { label: "Photos", value: photos.length ? `${photos.length} attached` : "" },
        ].filter((item) => item.value),
      });
      await ctx.markStep("damageForm");
      wrote = true;
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      warnings.push("not added to Damage Forms (not allowed)");
    }
  }

  if (!wrote) {
    throw new FieldRejectedError("The server refused this damage form: your department's plan or your role doesn't allow it.");
  }

  if (caps.internalEmail && !ctx.steps.email) {
    try {
      const personnel = refItems(ctx.refData, "personnel");
      const chiefs = resolveAllBattalionChiefs(personnel);
      await sendInternalEmail(ctx.departmentId, {
        id: `EM-F-${record.localId}`,
        subject: `Damage report — ${data.location}${data.equipment ? `: ${data.equipment}` : ""}`,
        body: buildMaintenanceIssueMessageBody(form, submittedBy).replace("from the employee portal", "from the field app")
          + (photos.length ? `\n\nPhotos:\n${photos.map((photo) => photo.url).join("\n")}` : ""),
        category: "maintenance",
        priority: "high",
        recipients: buildBattalionChiefRecipientTokens(personnel),
        recipientLabel: chiefs.length ? chiefs.map((chief) => chief.name).join(", ") : "command staff",
        fromUid: ctx.uid,
        fromName: submittedBy,
        fromEmail: ctx.snapshot?.email || "",
      });
      await ctx.markStep("email");
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      warnings.push("command staff email not sent");
    }
  }

  if (!ctx.steps.audit) {
    await writeAuditLog(ctx.departmentId, {
      action: "create",
      module: "Maintenance",
      recordId: workOrderId,
      summary: `Damage report submitted from the field app by ${submittedBy} for ${data.location}`,
      actorUid: ctx.uid,
      actorName: submittedBy,
    }).catch(() => null);
    await ctx.markStep("audit");
  }
  return { serverIds: { workOrderId, damageFormId: `field-${record.localId}` }, warnings };
}

/* --------------------------------- daily log ------------------------------ */

const DAILY_LOG_PATHS = ["crew", "notes"];

async function syncDailyLog(record, ctx) {
  const db = getFirestoreDb();
  const data = record.data;
  const shiftChangeTime = ctx.snapshot?.settings?.shiftChangeTime;
  const server = await readTenantListItem(db, ctx.departmentId, LIST_KEYS.dailyLogs, data.id);
  if (server && isDailyLogLocked(server, shiftChangeTime)) {
    throw new FieldRejectedError("This log is locked on the server. Ask an officer to unlock it, then send again.");
  }
  const { merged, conflicts } = threeWayMerge(record.base, data, server, DAILY_LOG_PATHS);
  if (conflicts.length) {
    throw new FieldConflictError("Someone else changed this log after you started editing.", {
      conflicts,
      server: server ? { crew: server.crew, notes: server.notes, updatedAt: server.updatedAt, updatedBy: server.updatedBy } : null,
      merged,
    });
  }
  const now = nowIso();
  const saved = normalizeDailyLogRecord({
    ...(server || {}),
    ...merged,
    id: data.id,
    date: data.date,
    shift: data.shift,
    apparatus: data.apparatus,
    autoLockAt: server?.autoLockAt || resolveAutoLockAt(data.date, shiftChangeTime),
    updatedAt: now,
    updatedBy: ctx.actor.actorName,
    createdAt: server?.createdAt || record.createdAt,
  });
  await upsertTenantListItem(db, ctx.departmentId, LIST_KEYS.dailyLogs, saved, { userId: ctx.uid });
  return { serverIds: { logId: saved.id }, base: { crew: saved.crew, notes: saved.notes, updatedAt: saved.updatedAt } };
}

/* --------------------------------- incidents ------------------------------ */

export const INCIDENT_PATHS = [
  "incidentDate",
  "incidentAddress",
  "incidentTypeSummary",
  "disciplines",
  "workspace.cad.incidentNumber",
  "workspace.cad.dispatchTime",
  "workspace.cad.arrivalTime",
  "workspace.cad.clearTime",
  "workspace.units",
  "workspace.personnel",
  "workspace.ems.patientCount",
  "workspace.ems.chiefComplaint",
  "workspace.narrative.body",
];

function emptyNerisReport(id, reportNumber, now) {
  return {
    id,
    reportNumber,
    incidentDate: "",
    incidentAddress: "",
    incidentTypeSummary: "",
    status: "Draft",
    disciplines: [],
    reviewStage: "author",
    locked: false,
    createdAt: now,
    updatedAt: now,
    workspace: {
      cad: {},
      location: {},
      units: [],
      personnel: [],
      weather: {},
      ems: {},
      rescue: {},
      wildland: {
        irwinIncidentId: "",
        externalSyncStatus: "not_connected",
        resourceSyncStatus: "not_connected",
        operationalPeriodSync: "not_connected",
      },
      casualties: {},
      propertyLoss: {},
      actions: [],
      narrative: {},
      attachments: [],
      approvals: [],
      auditLog: {},
      investigations: {},
    },
    autoPopulateSources: {},
    fieldOverrides: {},
    fieldInputOverrides: {},
    modules: Object.fromEntries(NERIS_FORM_MODULES.map((module) => [module.id, {}])),
  };
}

async function syncIncident(record, ctx) {
  const db = getFirestoreDb();
  const data = record.data;
  const server = await readTenantListItem(db, ctx.departmentId, LIST_KEYS.nerisFireReports, data.id);
  if (server?.locked) {
    throw new FieldRejectedError("This report is locked on the server (submitted or under review). Your field notes are kept here.");
  }
  const now = nowIso();
  const start = server || emptyNerisReport(data.id, data.reportNumber, record.createdAt);
  const { merged, conflicts } = threeWayMerge(record.base, data, server ? start : null, INCIDENT_PATHS);
  if (conflicts.length) {
    throw new FieldConflictError("Someone else changed this report after you started editing.", {
      conflicts,
      server: Object.fromEntries(conflicts.map((conflict) => [conflict.path, conflict.server])),
      merged,
    });
  }
  const base = server ? merged : { ...start, ...merged, workspace: { ...start.workspace, ...(merged.workspace || {}) } };
  const narrative = base.workspace?.narrative?.body || "";
  const saved = {
    ...base,
    id: data.id,
    reportNumber: server?.reportNumber || data.reportNumber,
    updatedAt: now,
    updatedBy: ctx.actor.actorName,
    fieldOrigin: server?.fieldOrigin || { createdBy: ctx.actor.actorName, createdAt: record.createdAt, app: "field" },
    modules: {
      ...(base.modules || {}),
      core_mod_incident: {
        ...(base.modules?.core_mod_incident || {}),
        ...(narrative ? { incident_narrative_outcome: narrative } : {}),
      },
    },
  };
  await upsertTenantListItem(db, ctx.departmentId, LIST_KEYS.nerisFireReports, saved, { userId: ctx.uid });
  const snapshotBase = {};
  for (const path of INCIDENT_PATHS) {
    const keys = path.split(".");
    let cursor = snapshotBase;
    let source = saved;
    keys.forEach((key, index) => {
      source = source == null ? undefined : source[key];
      if (index === keys.length - 1) cursor[key] = source;
      else cursor = cursor[key] = cursor[key] || {};
    });
  }
  return { serverIds: { reportId: saved.id, reportNumber: saved.reportNumber }, base: snapshotBase };
}

/* -------------------------------- check-offs ------------------------------ */

async function syncCheckoff(record, ctx) {
  const data = record.data;
  const list = data.list;
  const done = summarizeCheckoff(list, data.entries || {}, localDate(new Date(data.completedAt || record.savedAt)));
  const id = `CO-${record.localId}`;
  await createRecord(ctx.departmentId, CHECKOFFS_COLLECTION, id, {
    id,
    listId: list.id,
    listName: list.name,
    kind: list.kind,
    target: list.target,
    items: done.items,
    counts: done.counts,
    restock: done.restock,
    restockNeeded: done.restock.length > 0,
    result: done.result,
    notes: data.notes || "",
    shift: data.shift || "",
    performedBy: data.performedBy || ctx.actor.actorName,
    performedByUid: ctx.uid,
    performedAt: data.completedAt || record.savedAt,
    source: "field-app",
  });
  return { serverIds: { checkoffId: id } };
}

/* -------------------------------- inspections ----------------------------- */

const INSPECTION_EXTRA_PATHS = ["summary", "internalNotes", "result"];

async function syncInspection(record, ctx) {
  const data = record.data;
  const inspectionId = data.inspectionId;
  const server = await getInspectionRecord(ctx.departmentId, inspectionId);
  if (!server) throw new FieldRejectedError("This inspection no longer exists in the RMS.");
  const completedByUs = server.status === "completed" && server.completedBy === ctx.actor.actorName && ctx.steps.completed;
  if (server.lockedAt || server.status === "archived" || (server.status === "completed" && !completedByUs)) {
    if (!completedByUs) throw new FieldRejectedError("This inspection was completed or locked in the RMS. Your field entry is kept here.");
  }

  // Merge answers per item with what changed on the server since download.
  const answerKeys = [...new Set([...Object.keys(data.answers || {}), ...Object.keys(record.base?.answers || {})])];
  const paths = [...answerKeys.map((key) => `answers.${key}`), ...INSPECTION_EXTRA_PATHS];
  const serverView = { answers: server.answers || {}, summary: server.summary, internalNotes: server.internalNotes, result: server.result };
  const changedOnServer = record.base && String(server.updatedAt || "") !== String(record.base.updatedAt || "") && server.updatedBy !== ctx.actor.actorName;
  let merged = data;
  if (changedOnServer) {
    const result = threeWayMerge(record.base, data, serverView, paths);
    if (result.conflicts.length) {
      throw new FieldConflictError("Someone else changed this inspection after you started.", {
        conflicts: result.conflicts,
        server: Object.fromEntries(result.conflicts.map((conflict) => [conflict.path, conflict.server])),
        merged: result.merged,
      });
    }
    merged = { ...data, ...result.merged, answers: { ...(result.merged.answers || {}) } };
  }

  const photos = record.attachments?.length ? await uploadAttachments(record, ctx, `inspection-photos/${inspectionId}`) : [];

  if (!completedByUs) {
    const payload = {
      answers: merged.answers || {},
      summary: merged.summary || "",
      internalNotes: merged.internalNotes || "",
      result: merged.result || "",
      reinspectionRequired: Boolean(data.reinspectionRequired) || /reinspection/i.test(merged.result || ""),
      nextReinspectionAt: data.nextReinspectionAt || "",
    };
    if (data.finish) {
      await completeInspection(ctx.departmentId, inspectionId, payload, ctx.actor);
      await ctx.markStep("completed");
    } else {
      await saveInspectionDraft(ctx.departmentId, inspectionId, payload, ctx.actor);
    }
  }
  if (photos.length) {
    await updateRecord(ctx.departmentId, "inspections", inspectionId, { fieldPhotos: photos });
  }

  const violationIds = [];
  for (const violation of data.violations || []) {
    await createViolation(ctx.departmentId, {
      id: violation.id,
      inspectionId,
      catalogItemId: violation.catalogItemId || "",
      name: violation.name,
      codeCitation: violation.codeCitation || "",
      severity: violation.severity || "moderate",
      description: violation.description || "",
      correctiveAction: violation.correctiveAction || "",
      locationOnProperty: violation.locationOnProperty || "",
      evidence: photos.map((photo) => ({ type: "photo", url: photo.url, storagePath: photo.storagePath, name: photo.name, addedBy: ctx.actor.actorName })),
    }, ctx.actor);
    violationIds.push(violation.id);
  }

  const fresh = await getInspectionRecord(ctx.departmentId, inspectionId);
  return {
    serverIds: { inspectionId, violationIds },
    base: fresh ? { answers: fresh.answers || {}, summary: fresh.summary, internalNotes: fresh.internalNotes, result: fresh.result, updatedAt: fresh.updatedAt } : record.base,
    keepSteps: false,
  };
}

/* ------------------------------ pre-fire plans ---------------------------- */

const EDITABLE_REVISION_STATUSES = new Set(["draft", "returned", "in_progress", "rejected"]);

async function registerPlanPhotos(ctx, planId, photos) {
  for (const photo of photos) {
    await registerPreplanFile(ctx.departmentId, {
      id: `PPF-${photo.storagePath.split("/").pop().slice(0, 40).replace(/[^A-Za-z0-9-]/g, "")}`,
      preplanId: planId,
      category: "photo",
      fileName: photo.name,
      mimeType: "image/jpeg",
      storagePath: photo.storagePath,
      downloadUrl: photo.url,
      description: "Added from FORGE Field",
    }, ctx.actor);
  }
}

async function syncPlanUpdate(record, ctx) {
  const data = record.data;
  const photos = record.attachments?.length ? await uploadAttachments(record, ctx, "pre-fire-plans/field-updates") : [];
  const id = `PFU-${record.localId}`;
  await createRecord(ctx.departmentId, PREPLAN_FIELD_UPDATES_COLLECTION, id, {
    id,
    planSource: data.planSource,
    planId: data.planId,
    planName: data.planName,
    address: data.address,
    section: data.section || "",
    note: data.note,
    photos,
    status: "pending",
    submittedBy: data.submittedBy || ctx.actor.actorName,
    submittedByUid: ctx.uid,
    submittedAt: record.savedAt || record.createdAt,
    source: "field-app",
  });
  return { serverIds: { updateId: id } };
}

function legacyPlanRecord(data, photos, existingPhotos = []) {
  const plan = data.plan || {};
  return {
    id: data.planId,
    businessName: plan.businessName || plan.name || "",
    address: plan.address || "",
    address_key: String(plan.address || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    occupancyType: plan.occupancyType || "",
    contactName: plan.contactName || "",
    contactPhone: plan.contactPhone || "",
    hazards: plan.hazards || "",
    utilities: plan.utilities || "",
    fireProtection: plan.fireProtection || "",
    hydrants: plan.hydrants || "",
    notes: plan.notes || "",
    photos: [...existingPhotos, ...photos],
    updated_at: new Date().toISOString(),
    source: "field-app",
  };
}

async function syncPlanCreate(record, ctx) {
  const data = record.data;
  const photos = record.attachments?.length ? await uploadAttachments(record, ctx, `pre-fire-plans/${data.planId}`) : [];
  if (data.source === "legacy") {
    await saveTenantHydrantCollectionRecord(ctx.departmentId, "preFirePlans", data.planId, legacyPlanRecord(data, photos));
    return { serverIds: { planId: data.planId } };
  }
  if (!ctx.steps.created && !(await getPreplan(ctx.departmentId, data.planId))) {
    await createPreplan(ctx.departmentId, {
      id: data.planId,
      address: data.plan.address,
      occupancyName: data.plan.name,
      riskLevel: data.plan.riskLevel || "Moderate",
      responsibleStation: data.plan.station || "",
      sectionAnswers: data.sectionAnswers || {},
      notes: "Created in FORGE Field",
    }, ctx.actor);
    await updatePreplan(ctx.departmentId, data.planId, { facilityName: data.plan.name }, ctx.actor).catch(() => null);
  }
  await ctx.markStep("created");
  if (photos.length && !ctx.steps.photos) {
    await registerPlanPhotos(ctx, data.planId, photos);
    await ctx.markStep("photos");
  }
  return { serverIds: { planId: data.planId } };
}

async function syncPlanEdit(record, ctx) {
  const data = record.data;
  const photos = record.attachments?.length ? await uploadAttachments(record, ctx, `pre-fire-plans/${data.planId}`) : [];

  if (data.source === "legacy") {
    const rows = await getRecord(ctx.departmentId, "preFirePlans", data.planId);
    const paths = Object.keys(data.plan || {}).map((key) => `plan.${key}`);
    const serverView = rows ? { plan: Object.fromEntries(Object.keys(data.plan || {}).map((key) => [key, rows[key] || ""])) } : null;
    const { merged, conflicts } = threeWayMerge(record.base, data, serverView, paths);
    if (conflicts.length) {
      throw new FieldConflictError("Someone else changed this plan after you started.", { conflicts, server: Object.fromEntries(conflicts.map((c) => [c.path, c.server])), merged });
    }
    const next = { ...data, plan: { ...(data.plan || {}), ...(merged.plan || {}) } };
    await saveTenantHydrantCollectionRecord(ctx.departmentId, "preFirePlans", data.planId, legacyPlanRecord(next, photos, rows?.photos || []));
    return { serverIds: { planId: data.planId }, base: { plan: next.plan, updatedAt: new Date().toISOString() } };
  }

  const plan = await getPreplan(ctx.departmentId, data.planId);
  if (!plan) throw new FieldRejectedError("This pre-fire plan no longer exists in the RMS.");
  let revision = await getPreplanRevision(ctx.departmentId, plan.currentRevisionId);
  // Published plans get a new draft revision; it goes through approval in the RMS.
  if (!revision || !EDITABLE_REVISION_STATUSES.has(String(revision.status || "").toLowerCase())) {
    if (!ctx.steps.revisionId) {
      const started = await startPreplanRevision(ctx.departmentId, data.planId, ctx.actor);
      await ctx.markStep("revisionId", started?.revision?.id || started?.id || true);
    }
    const fresh = await getPreplan(ctx.departmentId, data.planId);
    revision = await getPreplanRevision(ctx.departmentId, fresh.currentRevisionId);
  }
  const answerKeys = [...new Set([...Object.keys(data.sectionAnswers || {}), ...Object.keys(record.base?.sectionAnswers || {})])];
  const paths = answerKeys.map((key) => `sectionAnswers.${key}`);
  const { merged, conflicts } = threeWayMerge(record.base, data, { sectionAnswers: revision?.sectionAnswers || {} }, paths);
  if (conflicts.length) {
    throw new FieldConflictError("Someone else changed this plan after you started.", { conflicts, server: Object.fromEntries(conflicts.map((c) => [c.path, c.server])), merged });
  }
  await updatePreplanRevision(ctx.departmentId, revision.id, { sectionAnswers: { ...(revision.sectionAnswers || {}), ...(merged.sectionAnswers || {}) } }, ctx.actor);
  const mainPatch = {};
  if (data.plan?.address && data.plan.address !== plan.address) mainPatch.address = data.plan.address;
  if (data.plan?.riskLevel && data.plan.riskLevel !== plan.riskLevel) mainPatch.riskLevel = data.plan.riskLevel;
  if (Object.keys(mainPatch).length) await updatePreplan(ctx.departmentId, data.planId, mainPatch, ctx.actor);
  if (photos.length && !ctx.steps.photos) {
    await registerPlanPhotos(ctx, data.planId, photos);
    await ctx.markStep("photos");
  }
  const saved = await getPreplanRevision(ctx.departmentId, revision.id);
  return {
    serverIds: { planId: data.planId, revisionId: revision.id },
    base: { plan: { address: data.plan?.address || "", riskLevel: data.plan?.riskLevel || "" }, sectionAnswers: saved?.sectionAnswers || {}, updatedAt: saved?.updatedAt || "" },
  };
}

/* ------------------------------- hydrant info ----------------------------- */

const HYDRANT_EDIT_PATHS = ["status", "district", "address", "gps", "provider", "hydrant_type", "issue", "notes"].map((key) => `fields.${key}`);

async function syncHydrantEdit(record, ctx) {
  const data = record.data;
  const current = await serverHydrant(ctx, data.hydrant);
  const serverFields = {
    status: current.status || "In Service",
    district: current.district || "",
    address: current.address || current.location || "",
    gps: (current.latitude ?? current.lat) && (current.longitude ?? current.lon) ? `${current.latitude ?? current.lat}, ${current.longitude ?? current.lon}` : "",
    provider: current.provider || current.water_assoc || "",
    hydrant_type: current.hydrant_type || "",
    issue: current.issue || "",
    notes: current.notes || "",
  };
  const { merged, conflicts } = threeWayMerge(record.base, data, { fields: serverFields }, HYDRANT_EDIT_PATHS);
  if (conflicts.length) {
    throw new FieldConflictError("Someone else changed this hydrant after you started.", { conflicts, server: Object.fromEntries(conflicts.map((c) => [c.path, c.server])), merged });
  }
  const fields = merged.fields || {};
  const [latitude, longitude] = String(fields.gps || "").split(",").map((part) => part.trim());
  const patch = {
    status: fields.status,
    district: fields.district,
    address: fields.address,
    location: fields.address,
    provider: fields.provider,
    water_assoc: fields.provider,
    hydrant_type: fields.hydrant_type,
    issue: fields.issue,
    notes: fields.notes,
    ...(latitude && longitude ? { latitude, lat: latitude, longitude, lon: longitude } : {}),
    edited_by: data.editedBy || ctx.actor.actorName,
    edited_shift: data.shift || "",
    edited_date: localDate(new Date(record.savedAt || Date.now())),
    edit_source: "Field hydrant info",
  };
  await saveTenantHydrantRecord(ctx.departmentId, mergeHydrantUpdate(current, patch));
  return { serverIds: { hydrantId: hydrantFirebaseDocId(data.hydrant.location_id, data.hydrant.hydrant_id) }, base: { fields } };
}

export const SYNC_HANDLERS = {
  hydrantEdit: syncHydrantEdit,
  planUpdate: syncPlanUpdate,
  planCreate: syncPlanCreate,
  planEdit: syncPlanEdit,
  checkoff: syncCheckoff,
  inspection: syncInspection,
  truckCheck: syncTruckCheck,
  hoseTest: syncHoseTest,
  hydrantInspection: syncHydrantInspection,
  flowTest: syncFlowTest,
  hydrantDamage: syncHydrantDamage,
  damageForm: syncDamageForm,
  dailyLog: syncDailyLog,
  incident: syncIncident,
};
