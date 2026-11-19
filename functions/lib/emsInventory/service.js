/**
 * EMS Management: supply inventory (slice E1 of docs/ems/REPOSITORY_DISCOVERY.md).
 *
 * Data (all under departments/{departmentId}/, written by these Cloud Functions only;
 * browsers read through Firestore rules):
 *   emsSettings/main                     rotation policy, expiration warning days
 *   emsInventoryItems/{itemId}           supply catalog
 *   emsInventoryLocations/{locationId}   station > storage area > cabinet > shelf > bin, and vehicles
 *   emsInventoryBalances/{loc__item}     running balance per item per location, by lot (a projection of the ledger)
 *   emsInventoryTransactions/{id}        the ledger: append-only, never edited or deleted
 *   emsInventoryCounts/{countId}         physical counts: open -> submitted -> approved | rejected
 *   emsAuditEvents/{id}                  who did what, written in the same transaction as the change
 *
 * Every stock change is one Firestore transaction that reads the balances,
 * checks the rules (never below zero, expired stock never picked for use),
 * creates the ledger record and updates the balances together. The browser
 * sends a request id; the ledger record's id is built from it and created with
 * create(), so a retried request returns the first result instead of moving
 * stock twice. Corrections are new reversal records, never edits.
 *
 * The department id in a request only selects a department; membership,
 * permissions and the plan are checked here and every path is built from the
 * verified department.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { assertMemberPermission } = require("../access");
const logic = require("./logic");

const MODULE_KEY = "emsManagement";
const PERMISSIONS = Object.freeze({
  view: "viewEmsInventory",
  use: "useEmsSupplies",
  manage: "manageEmsInventory",
  approve: "approveEmsInventoryAdjustments",
  settings: "manageEmsSettings",
});
const MAX_COUNT_ROWS = 400;
const MAX_ADJUSTED_ITEMS = 150;

const text = (v, max = 200) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max));
const nowIso = () => new Date().toISOString();

const paths = {
  settings: (d) => `departments/${d}/emsSettings/main`,
  items: (d) => `departments/${d}/emsInventoryItems`,
  locations: (d) => `departments/${d}/emsInventoryLocations`,
  balances: (d) => `departments/${d}/emsInventoryBalances`,
  transactions: (d) => `departments/${d}/emsInventoryTransactions`,
  counts: (d) => `departments/${d}/emsInventoryCounts`,
  audit: (d) => `departments/${d}/emsAuditEvents`,
};

function cleanDepartmentId(value) {
  const id = text(value, 200);
  if (!id || id.length > 120 || id.includes("/") || id === "." || id === "..") {
    throw new HttpsError("invalid-argument", "departmentId is required.");
  }
  return id;
}

function cleanDocId(value, label) {
  const id = text(value, 200);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new HttpsError("invalid-argument", `${label} is required.`);
  return id;
}

/** Request ids come from the browser (crypto.randomUUID) and make retries safe. */
function cleanRequestId(value) {
  const id = text(value, 100);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new HttpsError("invalid-argument", "requestId is required.");
  return id;
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function ruleError(error) {
  if (error instanceof logic.InventoryRuleError) return new HttpsError("failed-precondition", error.message);
  return error;
}

/** Verify membership, one of the permissions, and that the plan includes EMS Management. */
async function resolveCaller(db, request, anyOf) {
  const departmentId = cleanDepartmentId(request.data?.departmentId);
  const permissions = await assertMemberPermission(db, departmentId, request.auth, anyOf,
    "You don't have permission to do that in EMS inventory.");
  const ent = await db.doc(`platformEntitlements/${departmentId}`).get();
  const modules = ent.data()?.modules;
  if (Array.isArray(modules) && !modules.includes(MODULE_KEY)) {
    throw new HttpsError("permission-denied", "EMS Management isn't included in your department's plan.");
  }
  return {
    departmentId,
    uid: request.auth.uid,
    name: text(request.auth.token?.name || request.auth.token?.email, 200) || request.auth.uid,
    permissions,
    can: (key) => permissions[PERMISSIONS[key]] === true,
  };
}

/** One audit event, written with the change it describes (pass the transaction). */
function auditEvent(db, tx, caller, { action, recordType, recordId, summary, details = null }) {
  const ref = db.collection(paths.audit(caller.departmentId)).doc();
  const data = {
    id: ref.id,
    action,
    recordType,
    recordId,
    summary: text(summary, 500),
    actorUid: caller.uid,
    actorName: caller.name,
    at: nowIso(),
    ...(details ? { details } : {}),
  };
  if (tx) tx.create(ref, data);
  else return ref.create(data);
  return null;
}

async function readSettings(db, departmentId, tx = null) {
  const ref = db.doc(paths.settings(departmentId));
  const snap = tx ? await tx.get(ref) : await ref.get();
  const stored = snap.exists ? snap.data() : {};
  return {
    rotationPolicy: logic.ROTATION_POLICIES.includes(stored.rotationPolicy) ? stored.rotationPolicy : logic.DEFAULT_SETTINGS.rotationPolicy,
    expirationWarningDays: Array.isArray(stored.expirationWarningDays) && stored.expirationWarningDays.length
      ? stored.expirationWarningDays
      : [...logic.DEFAULT_SETTINGS.expirationWarningDays],
  };
}

// ---------------------------------------------------------------- settings

async function saveSettings(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.settings]);
  const input = request.data?.settings || {};
  const rotationPolicy = text(input.rotationPolicy, 10);
  if (!logic.ROTATION_POLICIES.includes(rotationPolicy)) throw new HttpsError("invalid-argument", "Choose FEFO or FIFO.");
  const days = [...new Set((Array.isArray(input.expirationWarningDays) ? input.expirationWarningDays : []).map(Number))]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 730)
    .sort((a, b) => b - a);
  if (!days.length || days.length > 8) throw new HttpsError("invalid-argument", "Give one to eight warning days between 1 and 730.");
  const settings = { rotationPolicy, expirationWarningDays: days };
  await db.runTransaction(async (tx) => {
    const ref = db.doc(paths.settings(caller.departmentId));
    const before = await readSettings(db, caller.departmentId, tx);
    tx.set(ref, { ...settings, updatedAt: nowIso(), updatedBy: caller.uid, updatedByName: caller.name }, { merge: true });
    auditEvent(db, tx, caller, {
      action: "ems.settings.saved", recordType: "settings", recordId: "main",
      summary: `Stock rotation ${rotationPolicy.toUpperCase()}, expiration warnings at ${days.join(", ")} days`,
      details: { before, after: settings },
    });
  });
  return { settings };
}

// ---------------------------------------------------------------- catalog

function cleanItem(input = {}) {
  const name = text(input.name, 120);
  if (!name) throw new HttpsError("invalid-argument", "Give the item a name.");
  const category = text(input.category, 60);
  if (!category) throw new HttpsError("invalid-argument", "Choose a category.");
  const unitOfMeasure = text(input.unitOfMeasure, 30) || "each";
  const unitCost = input.unitCost === "" || input.unitCost === null || input.unitCost === undefined ? null : Number(input.unitCost);
  if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000)) {
    throw new HttpsError("invalid-argument", "Unit cost must be a number of zero or more.");
  }
  return {
    name,
    category,
    unitOfMeasure,
    description: text(input.description, 500),
    manufacturer: text(input.manufacturer, 120),
    manufacturerPartNumber: text(input.manufacturerPartNumber, 60),
    barcode: text(input.barcode, 60),
    vendorName: text(input.vendorName, 120),
    unitCost: unitCost === null ? null : Math.round(unitCost * 100) / 100,
    tracksLots: input.tracksLots === true,
    tracksExpiration: input.tracksExpiration === true,
    active: input.active !== false,
  };
}

async function saveItem(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const item = cleanItem(request.data?.item);
  const itemId = request.data?.item?.id ? cleanDocId(request.data.item.id, "Item") : newId("I");
  const ref = db.collection(paths.items(caller.departmentId)).doc(itemId);
  const at = nowIso();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (request.data?.item?.id && !snap.exists) throw new HttpsError("not-found", "That item wasn't found.");
    const before = snap.exists ? snap.data() : null;
    const record = snap.exists
      ? { ...item, updatedAt: at, updatedBy: caller.uid }
      : { id: itemId, itemClass: "supply", ...item, createdAt: at, createdBy: caller.uid, updatedAt: at, updatedBy: caller.uid };
    tx.set(ref, record, { merge: true });
    auditEvent(db, tx, caller, {
      action: before ? "ems.item.updated" : "ems.item.created", recordType: "item", recordId: itemId,
      summary: `${before ? "Updated" : "Added"} catalog item ${item.name}`,
      details: before ? { before: pick(before, Object.keys(item)), after: item } : { after: item },
    });
  });
  return { itemId };
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
}

// ---------------------------------------------------------------- locations

async function saveLocation(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const input = request.data?.location || {};
  const name = text(input.name, 120);
  if (!name) throw new HttpsError("invalid-argument", "Give the location a name.");
  const type = text(input.type, 20);
  if (!logic.LOCATION_TYPES.includes(type)) throw new HttpsError("invalid-argument", "Choose a location type.");
  const parentId = input.parentId ? cleanDocId(input.parentId, "Parent location") : "";
  const locationId = input.id ? cleanDocId(input.id, "Location") : newId("L");
  if (parentId === locationId) throw new HttpsError("invalid-argument", "A location can't be inside itself.");
  const fleetAssetId = type === "vehicle" && input.fleetAssetId ? cleanDocId(input.fleetAssetId, "Vehicle") : "";
  const active = input.active !== false;
  const col = db.collection(paths.locations(caller.departmentId));
  const ref = col.doc(locationId);
  const at = nowIso();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (input.id && !snap.exists) throw new HttpsError("not-found", "That location wasn't found.");
    // Walk up the parents: they must exist and must not loop back to this location.
    const ancestors = [];
    let cursor = parentId;
    while (cursor) {
      if (cursor === locationId || ancestors.includes(cursor)) throw new HttpsError("invalid-argument", "A location can't be inside itself.");
      if (ancestors.length > 8) throw new HttpsError("invalid-argument", "Locations can be nested at most eight levels deep.");
      const parent = await tx.get(col.doc(cursor));
      if (!parent.exists) throw new HttpsError("not-found", "The parent location wasn't found.");
      ancestors.push(cursor);
      cursor = parent.data().parentId || "";
    }
    let unitDesignation = text(input.unitDesignation, 60);
    if (fleetAssetId) {
      const asset = await tx.get(db.doc(`departments/${caller.departmentId}/fleetAssets/${fleetAssetId}`));
      if (!asset.exists) throw new HttpsError("not-found", "That vehicle isn't in Fleet.");
      unitDesignation = text(asset.data().unitDesignation || asset.data().fleetNumber || unitDesignation, 60);
    }
    const before = snap.exists ? snap.data() : null;
    if (before && before.active !== false && !active) {
      const stocked = await tx.get(db.collection(paths.balances(caller.departmentId)).where("locationId", "==", locationId));
      if (stocked.docs.some((d) => (d.data().onHand || 0) > 0)) {
        throw new HttpsError("failed-precondition", "Move or remove the stock at this location before turning it off.");
      }
    }
    const record = {
      name,
      type,
      parentId,
      ancestorIds: ancestors,
      stationName: text(input.stationName, 120),
      fleetAssetId,
      unitDesignation: type === "vehicle" ? unitDesignation : "",
      notes: text(input.notes, 500),
      active,
      updatedAt: at,
      updatedBy: caller.uid,
      ...(snap.exists ? {} : { id: locationId, createdAt: at, createdBy: caller.uid }),
    };
    tx.set(ref, record, { merge: true });
    auditEvent(db, tx, caller, {
      action: before ? "ems.location.updated" : "ems.location.created", recordType: "location", recordId: locationId,
      summary: `${before ? "Updated" : "Added"} location ${name}${active ? "" : " (turned off)"}`,
    });
  });
  return { locationId };
}

// ---------------------------------------------------------------- par levels

function parNumber(value, label) {
  if (value === "" || value === null || value === undefined) return null;
  const n = logic.wholeQuantity(value, { allowZero: true });
  if (n === null) throw new HttpsError("invalid-argument", `${label} must be a whole number of zero or more.`);
  return n;
}

async function setPar(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const locationId = cleanDocId(request.data?.locationId, "Location");
  const itemId = cleanDocId(request.data?.itemId, "Item");
  const input = request.data?.par;
  let par = null;
  if (input) {
    par = {
      min: parNumber(input.min, "Minimum"),
      max: parNumber(input.max, "Maximum"),
      reorderPoint: parNumber(input.reorderPoint, "Reorder point"),
      reorderQuantity: parNumber(input.reorderQuantity, "Reorder quantity"),
    };
    if (par.min !== null && par.max !== null && par.min > par.max) throw new HttpsError("invalid-argument", "Minimum can't be more than maximum.");
    if (Object.values(par).every((v) => v === null)) par = null;
  }
  const ref = db.collection(paths.balances(caller.departmentId)).doc(logic.balanceId(locationId, itemId));
  const at = nowIso();
  await db.runTransaction(async (tx) => {
    const [location, item, snap] = await Promise.all([
      tx.get(db.collection(paths.locations(caller.departmentId)).doc(locationId)),
      tx.get(db.collection(paths.items(caller.departmentId)).doc(itemId)),
      tx.get(ref),
    ]);
    if (!location.exists) throw new HttpsError("not-found", "That location wasn't found.");
    if (!item.exists) throw new HttpsError("not-found", "That item wasn't found.");
    const current = snap.exists ? snap.data() : { id: ref.id, itemId, locationId, onHand: 0, lots: [] };
    const next = { ...current, par, ...logic.balanceFlags(current.onHand || 0, par, current.lots || []), parUpdatedAt: at, parUpdatedBy: caller.uid };
    if (!snap.exists) next.updatedAt = at;
    tx.set(ref, next);
    auditEvent(db, tx, caller, {
      action: "ems.par.saved", recordType: "balance", recordId: ref.id,
      summary: par
        ? `Par for ${item.data().name} at ${location.data().name}: min ${par.min ?? "-"}, max ${par.max ?? "-"}, reorder at ${par.reorderPoint ?? "-"}`
        : `Cleared par for ${item.data().name} at ${location.data().name}`,
      details: { before: current.par || null, after: par },
    });
  });
  return { balanceId: ref.id };
}

// ---------------------------------------------------------------- transactions

/** Write the new balances for every location the lines touch. Reads must already be done. */
function writeBalances(tx, db, departmentId, itemId, balancesByLocation, lines, transactionId, at) {
  const written = {};
  for (const [locationId, group] of logic.linesByLocation(lines)) {
    const next = logic.applyLines(balancesByLocation[locationId], group, { itemId, locationId, transactionId, at });
    tx.set(db.collection(paths.balances(departmentId)).doc(logic.balanceId(locationId, itemId)), next);
    written[locationId] = next.onHand;
  }
  return written;
}

function ledgerRecord(caller, { id, type, item, quantity, fromLocationId = "", toLocationId = "", lines, at, ...rest }) {
  return {
    id,
    type,
    status: "posted",
    itemId: item.id,
    itemName: item.name,
    unitOfMeasure: item.unitOfMeasure || "each",
    quantity,
    fromLocationId,
    toLocationId,
    locationIds: [...new Set(lines.map((l) => l.locationId))],
    lines: lines.map((l) => ({ locationId: l.locationId, key: l.key, lot: l.lot || "", expiration: l.expiration || "", receivedAt: l.receivedAt || "", delta: l.delta })),
    createdAt: at,
    createdBy: caller.uid,
    createdByName: caller.name,
    departmentId: caller.departmentId,
    ...rest,
  };
}

async function postTransaction(db, request) {
  const data = request.data || {};
  const type = text(data.type, 30);
  const rule = logic.TRANSACTION_TYPES[type];
  if (!rule) throw new HttpsError("invalid-argument", "Choose what happened to the stock.");
  const anyOf = rule.access === "use" ? [PERMISSIONS.use, PERMISSIONS.manage] : [PERMISSIONS.manage];
  const caller = await resolveCaller(db, request, anyOf);
  const requestId = cleanRequestId(data.requestId);
  const itemId = cleanDocId(data.itemId, "Item");
  const quantity = logic.wholeQuantity(data.quantity);
  if (quantity === null) throw new HttpsError("invalid-argument", "Quantity must be a whole number of one or more.");
  const fromLocationId = rule.direction === "in" ? "" : cleanDocId(data.fromLocationId, "From location");
  const toLocationId = rule.direction === "out" ? "" : cleanDocId(data.toLocationId, "To location");
  if (fromLocationId && fromLocationId === toLocationId) throw new HttpsError("invalid-argument", "Choose two different locations.");
  const lot = text(data.lot, 60);
  const expiration = text(data.expiration, 10);
  if (expiration && !logic.isValidDate(expiration)) throw new HttpsError("invalid-argument", "Expiration must be a date (YYYY-MM-DD).");
  const chosenLot = data.lotKey ? text(data.lotKey, 32) : "";
  const reason = text(data.reason, 300);
  if (["waste", "damaged", "returnToVendor"].includes(type) && !reason) throw new HttpsError("invalid-argument", "Give a reason.");
  const unitCost = data.unitCost === undefined || data.unitCost === null || data.unitCost === "" ? null : Number(data.unitCost);
  if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) throw new HttpsError("invalid-argument", "Unit cost must be zero or more.");

  const d = caller.departmentId;
  const transactionId = `T-${requestId}`;
  const txRef = db.collection(paths.transactions(d)).doc(transactionId);
  const at = nowIso();
  const today = logic.isoDay();

  try {
    return await db.runTransaction(async (tx) => {
      const existing = await tx.get(txRef);
      if (existing.exists) {
        const prior = existing.data();
        if (prior.createdBy !== caller.uid || prior.type !== type || prior.itemId !== itemId) {
          throw new HttpsError("already-exists", "That request id was already used.");
        }
        return { transactionId, replayed: true, quantity: prior.quantity };
      }
      const locationIds = [fromLocationId, toLocationId].filter(Boolean);
      const [itemSnap, settings, ...locationSnaps] = await Promise.all([
        tx.get(db.collection(paths.items(d)).doc(itemId)),
        readSettings(db, d, tx),
        ...locationIds.map((id) => tx.get(db.collection(paths.locations(d)).doc(id))),
      ]);
      if (!itemSnap.exists) throw new HttpsError("not-found", "That item wasn't found.");
      const item = { id: itemSnap.id, ...itemSnap.data() };
      if (item.active === false && rule.direction !== "out") throw new HttpsError("failed-precondition", `${item.name} is turned off in the catalog.`);
      for (const snap of locationSnaps) {
        if (!snap.exists) throw new HttpsError("not-found", "That location wasn't found.");
      }
      const toSnap = toLocationId ? locationSnaps[locationIds.indexOf(toLocationId)] : null;
      if (toSnap && toSnap.data().active === false) throw new HttpsError("failed-precondition", `${toSnap.data().name} is turned off.`);
      if (type === "receive") {
        if (item.tracksLots && !lot) throw new HttpsError("invalid-argument", `${item.name} needs a lot number.`);
        if (item.tracksExpiration && !expiration) throw new HttpsError("invalid-argument", `${item.name} needs an expiration date.`);
      }

      const balanceSnaps = await Promise.all(locationIds.map((id) =>
        tx.get(db.collection(paths.balances(d)).doc(logic.balanceId(id, itemId)))));
      const balances = Object.fromEntries(locationIds.map((id, i) => [id, balanceSnaps[i].exists ? balanceSnaps[i].data() : null]));

      const lines = logic.linesFor(type, {
        quantity, fromLocationId, toLocationId, fromBalance: balances[fromLocationId],
        lot, expiration, lotKey: chosenLot, policy: settings.rotationPolicy, today, at,
      });
      const onHand = writeBalances(tx, db, d, itemId, balances, lines, transactionId, at);
      tx.create(txRef, ledgerRecord(caller, {
        id: transactionId, type, item, quantity, fromLocationId, toLocationId, lines, at,
        reason,
        note: text(data.note, 500),
        incidentNumber: text(data.incidentNumber, 40),
        unitCost: type === "receive" ? (unitCost ?? item.unitCost ?? null) : (item.unitCost ?? null),
        rotationPolicy: settings.rotationPolicy,
        requestId,
      }));
      const where = [fromLocationId, toLocationId].filter(Boolean)
        .map((id) => locationSnaps[locationIds.indexOf(id)].data().name).join(" → ");
      auditEvent(db, tx, caller, {
        action: `ems.inventory.${type}`, recordType: "transaction", recordId: transactionId,
        summary: `${rule.label}: ${quantity} ${item.unitOfMeasure || "each"} ${item.name} (${where})`,
      });
      return { transactionId, replayed: false, quantity, onHand, lines: lines.map((l) => ({ locationId: l.locationId, lot: l.lot, expiration: l.expiration, delta: l.delta })) };
    });
  } catch (error) {
    throw ruleError(error);
  }
}

async function reverseTransaction(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.approve]);
  const originalId = cleanDocId(request.data?.transactionId, "Transaction");
  const reason = text(request.data?.reason, 300);
  if (!reason) throw new HttpsError("invalid-argument", "Give a reason for the reversal.");
  const d = caller.departmentId;
  const originalRef = db.collection(paths.transactions(d)).doc(originalId);
  const reversalId = `REV-${originalId}`.slice(0, 140);
  const reversalRef = db.collection(paths.transactions(d)).doc(reversalId);
  const at = nowIso();
  try {
    return await db.runTransaction(async (tx) => {
      const [original, existing] = await Promise.all([tx.get(originalRef), tx.get(reversalRef)]);
      if (!original.exists) throw new HttpsError("not-found", "That transaction wasn't found.");
      const orig = original.data();
      if (orig.type === "reversal") throw new HttpsError("failed-precondition", "A reversal can't be reversed. Post a new transaction instead.");
      if (existing.exists) throw new HttpsError("already-exists", "That transaction was already reversed.");
      const lines = logic.reversedLines(orig.lines);
      const locationIds = [...new Set(lines.map((l) => l.locationId))];
      const snaps = await Promise.all(locationIds.map((id) => tx.get(db.collection(paths.balances(d)).doc(logic.balanceId(id, orig.itemId)))));
      const balances = Object.fromEntries(locationIds.map((id, i) => [id, snaps[i].exists ? snaps[i].data() : null]));
      writeBalances(tx, db, d, orig.itemId, balances, lines, reversalId, at);
      tx.create(reversalRef, ledgerRecord(caller, {
        id: reversalId, type: "reversal", item: { id: orig.itemId, name: orig.itemName, unitOfMeasure: orig.unitOfMeasure },
        quantity: orig.quantity, fromLocationId: orig.toLocationId || "", toLocationId: orig.fromLocationId || "", lines, at,
        reason, reversesTransactionId: originalId, reversesType: orig.type,
      }));
      auditEvent(db, tx, caller, {
        action: "ems.inventory.reversal", recordType: "transaction", recordId: reversalId,
        summary: `Reversed ${orig.type} of ${orig.quantity} ${orig.itemName}: ${reason}`,
      });
      return { transactionId: reversalId };
    });
  } catch (error) {
    throw ruleError(error);
  }
}

// ---------------------------------------------------------------- physical counts

async function startCount(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.use, PERMISSIONS.manage]);
  const requestId = cleanRequestId(request.data?.requestId);
  const locationId = cleanDocId(request.data?.locationId, "Location");
  const d = caller.departmentId;
  const countId = `C-${requestId}`;
  const ref = db.collection(paths.counts(d)).doc(countId);
  const [location, balances, itemsSnap] = await Promise.all([
    db.collection(paths.locations(d)).doc(locationId).get(),
    db.collection(paths.balances(d)).where("locationId", "==", locationId).get(),
    db.collection(paths.items(d)).get(),
  ]);
  if (!location.exists) throw new HttpsError("not-found", "That location wasn't found.");
  const items = Object.fromEntries(itemsSnap.docs.map((doc) => [doc.id, doc.data()]));
  const rows = [];
  for (const doc of balances.docs) {
    const balance = doc.data();
    const item = items[balance.itemId] || { name: balance.itemId };
    const lots = (balance.lots || []).filter((lot) => lot.quantity > 0);
    if (!lots.length && balance.par) {
      rows.push({ rowId: `${balance.itemId}-none`, itemId: balance.itemId, itemName: item.name, unitOfMeasure: item.unitOfMeasure || "each",
        key: logic.lotKey("", ""), lot: "", expiration: "", expected: 0, counted: null, reason: "", added: false });
    }
    for (const lot of lots) {
      rows.push({ rowId: `${balance.itemId}-${lot.key}`, itemId: balance.itemId, itemName: item.name, unitOfMeasure: item.unitOfMeasure || "each",
        key: lot.key, lot: lot.lot || "", expiration: lot.expiration || "", expected: lot.quantity, counted: null, reason: "", added: false });
    }
  }
  rows.sort((a, b) => a.itemName.localeCompare(b.itemName) || (a.expiration || "").localeCompare(b.expiration || ""));
  if (rows.length > MAX_COUNT_ROWS) throw new HttpsError("failed-precondition", `This location has more than ${MAX_COUNT_ROWS} lots. Count a smaller location (a cabinet or shelf).`);
  const at = nowIso();
  const count = {
    id: countId,
    locationId,
    locationName: location.data().name,
    status: "open",
    rows,
    expectedAt: at,
    createdAt: at,
    createdBy: caller.uid,
    createdByName: caller.name,
    updatedAt: at,
  };
  try {
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        if (existing.data().createdBy !== caller.uid) throw new HttpsError("already-exists", "That request id was already used.");
        return;
      }
      tx.create(ref, count);
      auditEvent(db, tx, caller, { action: "ems.count.started", recordType: "count", recordId: countId, summary: `Started a count of ${count.locationName} (${rows.length} lots)` });
    });
  } catch (error) {
    throw ruleError(error);
  }
  return { countId };
}

/** Apply counted values / reasons / found-stock rows from the browser to an open count. */
function mergeCountRows(rows, input = {}, items = {}) {
  const updates = Array.isArray(input.rows) ? input.rows : [];
  const byId = new Map(rows.map((row) => [row.rowId, { ...row }]));
  for (const u of updates) {
    const row = byId.get(text(u?.rowId, 200));
    if (!row) continue;
    if (u.counted === null || u.counted === "" || u.counted === undefined) row.counted = null;
    else {
      const n = logic.wholeQuantity(u.counted, { allowZero: true });
      if (n === null) throw new HttpsError("invalid-argument", `Count for ${row.itemName} must be a whole number of zero or more.`);
      row.counted = n;
    }
    row.reason = text(u.reason, 300);
  }
  for (const add of Array.isArray(input.addRows) ? input.addRows : []) {
    const itemId = cleanDocId(add?.itemId, "Item");
    const item = items[itemId];
    if (!item) throw new HttpsError("not-found", "That item wasn't found.");
    const lot = text(add.lot, 60);
    const expiration = text(add.expiration, 10);
    if (expiration && !logic.isValidDate(expiration)) throw new HttpsError("invalid-argument", "Expiration must be a date (YYYY-MM-DD).");
    const key = logic.lotKey(lot, expiration);
    const rowId = `${itemId}-${key}`;
    if (byId.has(rowId)) continue;
    byId.set(rowId, { rowId, itemId, itemName: item.name, unitOfMeasure: item.unitOfMeasure || "each", key, lot, expiration, expected: 0, counted: null, reason: "", added: true });
  }
  const merged = [...byId.values()];
  if (merged.length > MAX_COUNT_ROWS) throw new HttpsError("failed-precondition", `A count can have at most ${MAX_COUNT_ROWS} rows.`);
  return merged;
}

async function saveCount(db, request, { submit = false } = {}) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.use, PERMISSIONS.manage]);
  const countId = cleanDocId(request.data?.countId, "Count");
  const d = caller.departmentId;
  const ref = db.collection(paths.counts(d)).doc(countId);
  const needsItems = Array.isArray(request.data?.addRows) && request.data.addRows.length > 0;
  const itemsSnap = needsItems ? await db.collection(paths.items(d)).get() : null;
  const items = itemsSnap ? Object.fromEntries(itemsSnap.docs.map((doc) => [doc.id, doc.data()])) : {};
  const at = nowIso();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That count wasn't found.");
    const count = snap.data();
    if (count.status !== "open") throw new HttpsError("failed-precondition", "This count was already submitted.");
    const rows = mergeCountRows(count.rows || [], request.data || {}, items);
    const update = { rows, updatedAt: at, updatedBy: caller.uid };
    if (submit) {
      const problems = logic.countProblems(rows);
      if (problems.length) {
        const first = rows[problems[0].index];
        throw new HttpsError("failed-precondition",
          `${problems.length} row${problems.length === 1 ? "" : "s"} still ${problems[0].problem === "not counted" ? "need a count" : "need a reason for the difference"} (first: ${first.itemName}${first.lot ? ` lot ${first.lot}` : ""}).`);
      }
      Object.assign(update, { status: "submitted", submittedAt: at, submittedBy: caller.uid, submittedByName: caller.name,
        varianceRows: rows.filter((r) => r.counted !== r.expected).length });
      auditEvent(db, tx, caller, { action: "ems.count.submitted", recordType: "count", recordId: countId,
        summary: `Submitted the count of ${count.locationName}: ${update.varianceRows} row${update.varianceRows === 1 ? "" : "s"} differ` });
    }
    tx.update(ref, update);
    return { countId, status: update.status || count.status };
  });
}

const submitCount = (db, request) => saveCount(db, request, { submit: true });

/** Approvers may not approve or reject a count they started or submitted. */
function assertIndependentReviewer(caller, count) {
  if (count.createdBy === caller.uid || count.submittedBy === caller.uid) {
    throw new HttpsError("permission-denied", "Someone other than the person who did this count must review it.");
  }
}

async function approveCount(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.approve]);
  const countId = cleanDocId(request.data?.countId, "Count");
  const note = text(request.data?.note, 500);
  const d = caller.departmentId;
  const ref = db.collection(paths.counts(d)).doc(countId);
  const at = nowIso();
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "That count wasn't found.");
      const count = snap.data();
      if (count.status !== "submitted") throw new HttpsError("failed-precondition", "Only a submitted count can be approved.");
      assertIndependentReviewer(caller, count);
      const changed = (count.rows || []).filter((row) => row.counted !== row.expected);
      const byItem = new Map();
      for (const row of changed) {
        if (!byItem.has(row.itemId)) byItem.set(row.itemId, []);
        byItem.get(row.itemId).push(row);
      }
      if (byItem.size > MAX_ADJUSTED_ITEMS) throw new HttpsError("failed-precondition", `More than ${MAX_ADJUSTED_ITEMS} items differ. Recount in smaller locations.`);
      const itemIds = [...byItem.keys()];
      const balanceSnaps = await Promise.all(itemIds.map((itemId) =>
        tx.get(db.collection(paths.balances(d)).doc(logic.balanceId(count.locationId, itemId)))));
      const transactionIds = [];
      itemIds.forEach((itemId, i) => {
        const rows = byItem.get(itemId);
        // The difference found by the count is applied to today's balance, so
        // anything used or received since the count started is kept.
        const lines = rows.map((row) => ({ locationId: count.locationId, key: row.key, lot: row.lot, expiration: row.expiration, receivedAt: count.expectedAt, delta: row.counted - row.expected }));
        const transactionId = `ADJ-${countId}-${i + 1}`;
        try {
          writeBalances(tx, db, d, itemId, { [count.locationId]: balanceSnaps[i].exists ? balanceSnaps[i].data() : null }, lines, transactionId, at);
        } catch (error) {
          if (error instanceof logic.InventoryRuleError) {
            throw new HttpsError("failed-precondition", `${rows[0].itemName}: stock was used after this count started, so the count no longer adds up. Reject it and count again.`);
          }
          throw error;
        }
        const quantity = lines.reduce((sum, l) => sum + Math.abs(l.delta), 0);
        tx.create(db.collection(paths.transactions(d)).doc(transactionId), ledgerRecord(caller, {
          id: transactionId, type: "countAdjustment", item: { id: itemId, name: rows[0].itemName, unitOfMeasure: rows[0].unitOfMeasure },
          quantity, toLocationId: count.locationId, lines, at,
          countId, reason: rows.map((r) => r.reason).filter(Boolean).join("; ").slice(0, 500),
          countedBy: count.submittedBy, approvedBy: caller.uid,
        }));
        transactionIds.push(transactionId);
      });
      tx.update(ref, { status: "approved", reviewedAt: at, reviewedBy: caller.uid, reviewedByName: caller.name, reviewNote: note, adjustmentTransactionIds: transactionIds, updatedAt: at });
      auditEvent(db, tx, caller, { action: "ems.count.approved", recordType: "count", recordId: countId,
        summary: `Approved the count of ${count.locationName}: ${transactionIds.length} item${transactionIds.length === 1 ? "" : "s"} adjusted` });
      return { countId, adjustmentTransactionIds: transactionIds };
    });
  } catch (error) {
    throw ruleError(error);
  }
}

async function rejectCount(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.approve]);
  const countId = cleanDocId(request.data?.countId, "Count");
  const note = text(request.data?.note, 500);
  if (!note) throw new HttpsError("invalid-argument", "Say why the count is rejected.");
  const ref = db.collection(paths.counts(caller.departmentId)).doc(countId);
  const at = nowIso();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That count wasn't found.");
    const count = snap.data();
    if (count.status !== "submitted") throw new HttpsError("failed-precondition", "Only a submitted count can be rejected.");
    assertIndependentReviewer(caller, count);
    tx.update(ref, { status: "rejected", reviewedAt: at, reviewedBy: caller.uid, reviewedByName: caller.name, reviewNote: note, updatedAt: at });
    auditEvent(db, tx, caller, { action: "ems.count.rejected", recordType: "count", recordId: countId, summary: `Rejected the count of ${count.locationName}: ${note}` });
    return { countId };
  });
}

module.exports = {
  MODULE_KEY,
  PERMISSIONS,
  paths,
  saveSettings,
  saveItem,
  saveLocation,
  setPar,
  postTransaction,
  reverseTransaction,
  startCount,
  saveCount,
  submitCount,
  approveCount,
  rejectCount,
};
