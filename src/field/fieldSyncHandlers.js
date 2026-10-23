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
import { buildFlowTestStatusPatch, inspectionStatusPatch, nfpaColorNameForClass } from "../lib/hydrantStatusSync.js";
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
  const checklist = data.checklist.map((row) => ({
    item: row.item,
    result: row.result,
    notes: row.notes || "",
    repair_needed: row.result === "No" ? "Yes" : "No",
    photo_name: "",
    photo_url: "",
    photo_storage_path: "",
  }));
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
  const synced = buildFlowTestStatusPatch(hydrant, { status: hydrant.status || "In Service" }, { ...form, status: hydrant.status || "In Service" }, data.flowGpm);
  const test = {
    ...form,
    id,
    nfpa_class: synced.nfpa_class,
    nfpa_color: synced.nfpa_color || nfpaColorNameForClass(synced.nfpa_class),
    flow_gpm: data.flowGpm,
    flow_result: synced.flow_result,
    location_id: hydrant.location_id,
    hydrant_id: hydrant.hydrant_id,
    district: hydrant.district || "",
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
    const patch = buildFlowTestStatusPatch(current, { status: current.status || "In Service" }, { ...form, status: current.status || "In Service" }, data.flowGpm);
    return {
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

export const SYNC_HANDLERS = {
  truckCheck: syncTruckCheck,
  hoseTest: syncHoseTest,
  hydrantInspection: syncHydrantInspection,
  flowTest: syncFlowTest,
  hydrantDamage: syncHydrantDamage,
  damageForm: syncDamageForm,
  dailyLog: syncDailyLog,
  incident: syncIncident,
};
