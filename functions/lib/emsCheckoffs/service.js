/**
 * EMS Management: check-offs and readiness (slice E3 of docs/ems/REPOSITORY_DISCOVERY.md).
 *
 * Check-offs run on the Fleet checklist engine: templates and versions in
 * fleetChecklistTemplates*, each run in fleetChecks (written by the browser as
 * Fleet does today). EMS adds, under departments/{departmentId}/ and written by
 * these Cloud Functions only:
 *   emsCheckoffAssignments/{id}   which checklist, on which vehicles, how often,
 *                                 and whether a supervisor must sign it off
 *   emsCheckoffSettings/main      the department's readiness rules
 *   emsCheckoffResults/{checkId}  what a finished check-off recorded: equipment
 *                                 answers (applied to the equipment's history),
 *                                 supply counts judged against par, and sign-off
 *
 * Recording a check's results is done by the person who did the check, once:
 * the result's id is the check id and equipment actions use request ids built
 * from the check and the equipment, so a retry records nothing twice. Supply
 * counts never change stock; they report shortages and counts that differ from
 * the ledger.
 */
const crypto = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { text, nowIso, cleanDocId, newId, resolveEmsCaller, auditEvent } = require("../emsCommon");
const { checkoffEquipmentAction } = require("../emsEquipment/service");
const logic = require("./logic");

const PERMISSIONS = Object.freeze({
  view: "viewEmsCheckoffs",
  run: "runEmsCheckoffs",
  signOff: "signOffEmsCheckoffs",
  manage: "manageEmsCheckoffs",
});

const paths = {
  assignments: (d) => `departments/${d}/emsCheckoffAssignments`,
  settings: (d) => `departments/${d}/emsCheckoffSettings/main`,
  results: (d) => `departments/${d}/emsCheckoffResults`,
  checks: (d) => `departments/${d}/fleetChecks`,
  templates: (d) => `departments/${d}/fleetChecklistTemplates`,
  fleetAssets: (d) => `departments/${d}/fleetAssets`,
  fleetClasses: (d) => `departments/${d}/fleetClasses`,
  equipment: (d) => `departments/${d}/emsEquipment`,
  locations: (d) => `departments/${d}/emsInventoryLocations`,
  balances: (d) => `departments/${d}/emsInventoryBalances`,
  items: (d) => `departments/${d}/emsInventoryItems`,
};

function resolveCaller(db, request, anyOf) {
  return resolveEmsCaller(db, request, anyOf, { named: PERMISSIONS, message: "You don't have permission to do that with EMS check-offs." });
}

function ruleError(error) {
  if (error instanceof logic.CheckoffRuleError) return new HttpsError("invalid-argument", error.message);
  return error;
}

const unitLabel = (a = {}, id = "") => text(a.unitDesignation || a.fleetNumber || a.name || id, 60);

function covers(assignment = {}, assetId, asset = {}) {
  if (assignment.active === false) return false;
  if (assignment.targetType === "vehicle") return assignment.targetId === assetId;
  if (assignment.targetType === "fleetClass") return Boolean(asset.fleetClassId) && assignment.targetId === asset.fleetClassId;
  if (assignment.targetType === "station") return Boolean(asset.station) && assignment.targetId === asset.station;
  return false;
}

// ---------------------------------------------------------------- assignments

async function saveAssignment(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const input = request.data?.assignment || {};
  const existingId = input.id ? cleanDocId(input.id, "Assignment") : "";
  const templateId = cleanDocId(input.templateId, "Checklist");
  const targetType = text(input.targetType, 20);
  if (!logic.TARGET_TYPES.includes(targetType)) throw new HttpsError("invalid-argument", "Choose which vehicles the check-off is for.");
  let frequency;
  try {
    frequency = logic.cleanFrequency(input.frequency);
  } catch (error) {
    throw ruleError(error);
  }
  const d = caller.departmentId;
  const template = await db.doc(`${paths.templates(d)}/${templateId}`).get();
  if (!template.exists || template.data().lifecycleStatus === "archived") throw new HttpsError("not-found", "That checklist wasn't found.");
  let targetId;
  let targetLabel;
  if (targetType === "vehicle") {
    targetId = cleanDocId(input.targetId, "Vehicle");
    const asset = await db.doc(`${paths.fleetAssets(d)}/${targetId}`).get();
    if (!asset.exists) throw new HttpsError("not-found", "That vehicle isn't in Fleet.");
    targetLabel = unitLabel(asset.data(), targetId);
  } else if (targetType === "fleetClass") {
    targetId = cleanDocId(input.targetId, "Fleet class");
    const fleetClass = await db.doc(`${paths.fleetClasses(d)}/${targetId}`).get();
    if (!fleetClass.exists) throw new HttpsError("not-found", "That fleet class wasn't found.");
    targetLabel = text(fleetClass.data().name || targetId, 80);
  } else {
    targetId = text(input.targetId, 120);
    if (!targetId) throw new HttpsError("invalid-argument", "Choose a station.");
    targetLabel = targetId;
  }

  const id = existingId || newId("CKA");
  const ref = db.doc(`${paths.assignments(d)}/${id}`);
  const at = nowIso();
  const fields = {
    templateId,
    templateName: text(template.data().name, 120),
    targetType,
    targetId,
    targetLabel,
    frequency,
    requiresSignOff: input.requiresSignOff === true,
    active: input.active !== false,
  };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (existingId && !snap.exists) throw new HttpsError("not-found", "That assignment wasn't found.");
    if (snap.exists) {
      tx.update(ref, { ...fields, version: (snap.data().version || 1) + 1, updatedAt: at, updatedBy: caller.uid });
    } else {
      tx.create(ref, { id, ...fields, version: 1, createdAt: at, createdBy: caller.uid, createdByName: caller.name, updatedAt: at, updatedBy: caller.uid });
    }
    auditEvent(db, tx, caller, {
      action: snap.exists ? "ems.checkoff.assignment.updated" : "ems.checkoff.assignment.created",
      recordType: "checkoffAssignment",
      recordId: id,
      summary: `${snap.exists ? "Updated" : "Assigned"} ${fields.templateName} to ${targetLabel}${fields.active ? "" : " (turned off)"}`,
      details: snap.exists ? { before: Object.fromEntries(Object.keys(fields).map((k) => [k, snap.data()[k] ?? null])), after: fields } : null,
    });
  });
  return { assignmentId: id };
}

// ---------------------------------------------------------------- readiness rules

async function saveReadinessRules(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  let rules;
  try {
    rules = logic.cleanReadinessRules(request.data?.rules || {});
  } catch (error) {
    throw ruleError(error);
  }
  const ref = db.doc(paths.settings(caller.departmentId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    tx.set(ref, { readinessRules: rules, updatedAt: nowIso(), updatedBy: caller.uid, updatedByName: caller.name });
    auditEvent(db, tx, caller, {
      action: "ems.checkoff.rules.saved", recordType: "checkoffSettings", recordId: "main",
      summary: "Saved the EMS readiness rules",
      details: { before: snap.exists ? snap.data().readinessRules || null : null, after: rules },
    });
  });
  return { rules };
}

// ---------------------------------------------------------------- recording a finished check-off

const equipmentRequestId = (checkId, equipmentId) =>
  `ck${crypto.createHash("sha256").update(`${checkId}|${equipmentId}`).digest("hex").slice(0, 40)}`;

/** Locations on the vehicle: linked to it, or inside one that is. */
async function vehicleLocations(db, departmentId, fleetAssetId) {
  const all = await db.collection(paths.locations(departmentId)).get();
  const rows = all.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const roots = new Set(rows.filter((l) => l.fleetAssetId === fleetAssetId).map((l) => l.id));
  return new Map(rows
    .filter((l) => roots.has(l.id) || (Array.isArray(l.ancestorIds) && l.ancestorIds.some((a) => roots.has(a))))
    .map((l) => [l.id, l]));
}

async function recordEquipment(db, caller, check, items) {
  const out = [];
  const label = text(check.templateSnapshot?.name || "check-off", 120);
  for (const item of items.filter((i) => i.type === "ems_equipment")) {
    for (const row of logic.equipmentRows(check.answers?.[item.key])) {
      const snap = await db.doc(`${paths.equipment(caller.departmentId)}/${row.equipmentId}`).get();
      const record = snap.exists ? snap.data() : null;
      const base = {
        equipmentId: row.equipmentId,
        name: text(record?.name || row.equipmentId, 120),
        assetNumber: text(record?.assetNumber, 60),
        category: text(record?.category, 80),
        state: row.state,
        outOfUse: row.outOfUse,
        note: row.note,
        itemKey: item.key,
      };
      if (!record || record.assignment?.fleetAssetId !== check.fleetAssetId) {
        out.push({ ...base, outcome: "skipped", message: "It isn't on this unit any more." });
        continue;
      }
      try {
        const done = await checkoffEquipmentAction(db, caller, {
          equipmentId: row.equipmentId,
          requestId: equipmentRequestId(check.id, row.equipmentId),
          state: row.state,
          outOfUse: row.outOfUse,
          note: row.note,
          checkLabel: `${label} (${check.id})`,
        });
        out.push({ ...base, outcome: "recorded", eventId: done.eventId, status: done.status });
      } catch (error) {
        if (!(error instanceof HttpsError) || !["failed-precondition", "not-found"].includes(error.code)) throw error;
        out.push({ ...base, outcome: "skipped", message: text(error.message, 300) });
      }
    }
  }
  return out;
}

async function judgeSupplies(db, departmentId, check, items) {
  const rows = items.filter((i) => i.type === "ems_supplies")
    .flatMap((item) => logic.supplyRows(check.answers?.[item.key]).map((row) => ({ ...row, itemKey: item.key })));
  if (!rows.length) return [];
  const locations = await vehicleLocations(db, departmentId, check.fleetAssetId);
  const out = [];
  for (const row of rows) {
    const [locationId, itemId] = row.balanceId.split("__");
    if (!locationId || !itemId || !locations.has(locationId)) continue;
    const [balance, item] = await Promise.all([
      db.doc(`${paths.balances(departmentId)}/${row.balanceId}`).get(),
      db.doc(`${paths.items(departmentId)}/${itemId}`).get(),
    ]);
    if (!balance.exists || !item.exists) continue;
    out.push({
      balanceId: row.balanceId,
      itemId,
      itemName: text(item.data().name, 120),
      locationId,
      locationName: text(locations.get(locationId).name, 120),
      count: row.count,
      expiredFound: row.expiredFound,
      note: row.note,
      itemKey: row.itemKey,
      ...logic.judgeSupply(row, balance.data()),
    });
  }
  return out;
}

async function recordResults(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.run, PERMISSIONS.signOff, PERMISSIONS.manage]);
  const d = caller.departmentId;
  const checkId = cleanDocId(request.data?.checkId, "Check");
  const resultRef = db.doc(`${paths.results(d)}/${checkId}`);
  const existing = await resultRef.get();
  if (existing.exists) return { recorded: true, replayed: true, result: existing.data() };

  const checkSnap = await db.doc(`${paths.checks(d)}/${checkId}`).get();
  if (!checkSnap.exists) throw new HttpsError("not-found", "That check wasn't found.");
  const check = { ...checkSnap.data(), id: checkId };
  if (check.status !== "completed") throw new HttpsError("failed-precondition", "Finish the check first.");
  if (check.operatorId !== caller.uid) {
    throw new HttpsError("permission-denied", "Only the person who did this check-off can record its results.");
  }
  const items = logic.emsItems(check.templateSnapshot);
  if (items.length && !caller.can("run") && !caller.can("manage")) {
    throw new HttpsError("permission-denied", "You don't have permission to record EMS check-offs.");
  }

  const fleetAssetId = cleanDocId(check.fleetAssetId, "Vehicle");
  const assetSnap = await db.doc(`${paths.fleetAssets(d)}/${fleetAssetId}`).get();
  const asset = assetSnap.exists ? assetSnap.data() : {};
  const assignments = (await db.collection(paths.assignments(d)).where("templateId", "==", String(check.templateId || "")).get())
    .docs.map((doc) => doc.data()).filter((a) => covers(a, fleetAssetId, asset));
  if (!items.length && !assignments.length) return { recorded: false, reason: "not_ems" };

  const equipment = await recordEquipment(db, caller, check, items);
  const supplies = await judgeSupplies(db, d, check, items);
  const requiresSignOff = assignments.some((a) => a.requiresSignOff === true);
  const at = nowIso();
  const result = {
    id: checkId,
    checkId,
    fleetAssetId,
    unitDesignation: unitLabel(asset, fleetAssetId),
    station: text(asset.station, 120),
    templateId: text(check.templateId, 120),
    templateName: text(check.templateSnapshot?.name, 120),
    templateVersion: Number(check.templateVersion) || 0,
    result: text(check.result, 20),
    failedCount: Array.isArray(check.failedItems) ? check.failedItems.length : 0,
    completedAt: text(check.completedAt, 40),
    operatorUid: caller.uid,
    operatorName: caller.name,
    recordedAt: at,
    assignmentIds: assignments.map((a) => a.id),
    equipment,
    supplies,
    problemCounts: {
      equipment: equipment.filter((e) => e.state !== "present").length,
      supplies: supplies.filter((s) => s.short || s.expiredFound).length,
      countsDiffer: supplies.filter((s) => s.countDiffers).length,
    },
    verification: requiresSignOff
      ? { status: "pending", by: "", byName: "", at: "", note: "" }
      : { status: "not_required", by: "", byName: "", at: "", note: "" },
  };
  const batch = db.batch();
  batch.create(resultRef, result);
  const problems = result.problemCounts.equipment + result.problemCounts.supplies;
  auditEvent(db, batch, caller, {
    action: "ems.checkoff.recorded", recordType: "checkoff", recordId: checkId,
    summary: `${result.templateName || "Check-off"} on ${result.unitDesignation}: ${result.result || "done"}`
      + `${problems ? `, ${problems} EMS problem${problems === 1 ? "" : "s"}` : ""}${requiresSignOff ? ", waiting for sign-off" : ""}`,
  });
  try {
    await batch.commit();
  } catch (error) {
    // Two tabs recording at once: the first one wins and both get its result.
    const after = await resultRef.get();
    if (after.exists) return { recorded: true, replayed: true, result: after.data() };
    throw error;
  }
  return { recorded: true, replayed: false, result };
}

// ---------------------------------------------------------------- sign-off

async function signOff(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.signOff]);
  const checkId = cleanDocId(request.data?.checkId, "Check");
  const decision = text(request.data?.decision, 20);
  if (!["verified", "returned"].includes(decision)) throw new HttpsError("invalid-argument", "Choose sign off or send back.");
  const note = text(request.data?.note, 1000);
  if (decision === "returned" && !note) throw new HttpsError("invalid-argument", "Say why it's being sent back.");
  const ref = db.doc(`${paths.results(caller.departmentId)}/${checkId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That check-off wasn't found.");
    const result = snap.data();
    if (result.verification?.status !== "pending") throw new HttpsError("failed-precondition", "That check-off isn't waiting for sign-off.");
    if (result.operatorUid === caller.uid) throw new HttpsError("permission-denied", "Someone else has to sign off a check-off you did.");
    const verification = { status: decision, by: caller.uid, byName: caller.name, at: nowIso(), note };
    tx.update(ref, { verification });
    auditEvent(db, tx, caller, {
      action: `ems.checkoff.${decision}`, recordType: "checkoff", recordId: checkId,
      summary: `${decision === "verified" ? "Signed off" : "Sent back"} ${result.templateName || "check-off"} on ${result.unitDesignation}${note ? `: ${note}` : ""}`,
    });
    return { checkId, verification };
  });
}

module.exports = {
  PERMISSIONS,
  paths,
  saveAssignment,
  saveReadinessRules,
  recordResults,
  signOff,
};
