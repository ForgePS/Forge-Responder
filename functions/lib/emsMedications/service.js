/**
 * EMS Management: medication recalls and lot holds (slice E4 of docs/ems/REPOSITORY_DISCOVERY.md).
 *
 * Medications are inventory items with itemClass "medication" (../emsInventory). This
 * module adds:
 *   emsMedicationRecalls/{recallId}   a recall: which medications, which lots (none = every
 *                                     lot), reason, class, source, reference; open -> closed
 *   emsLotHolds/{itemId__lotKey}      a lot on hold everywhere in the department, because of
 *                                     one or more open recalls and/or a manual hold
 *
 * Held stock stays on hand but can't be used (the ledger refuses it), and it doesn't count
 * toward par. It leaves through Returned to vendor, Wasted, Removed: damaged or expired.
 * A lot received later while an open recall covers it is held when received
 * (emsInventory/service.js postTransaction).
 *
 * Every change rewrites the affected balances' hold flags in the same transaction and
 * writes an audit event.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { text, nowIso, cleanDocId, newId, auditEvent } = require("../emsCommon");
const logic = require("../emsInventory/logic");
const inventory = require("../emsInventory/service");

const { paths, PERMISSIONS } = inventory;
const MAX_RECALL_ITEMS = 10;
const MAX_RECALL_LOTS = 50;
const MAX_WRITES = 400;

function resolveCaller(db, request) {
  return inventory.resolveCaller(db, request, [PERMISSIONS.medManage, PERMISSIONS.manage]);
}

function cleanLotNumbers(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) throw new HttpsError("invalid-argument", "Lot numbers must be a list.");
  const lots = [...new Set(values.map((v) => text(v, 60)).filter(Boolean))];
  if (lots.length > MAX_RECALL_LOTS) throw new HttpsError("invalid-argument", `List at most ${MAX_RECALL_LOTS} lot numbers.`);
  return lots;
}

/** Every balance of these items, and the active holds on them, read in the transaction. */
async function readItemsStock(tx, db, departmentId, itemIds) {
  const [balanceSnaps, holdSnaps] = await Promise.all([
    Promise.all(itemIds.map((id) => tx.get(db.collection(paths.balances(departmentId)).where("itemId", "==", id)))),
    Promise.all(itemIds.map((id) => tx.get(db.collection(paths.holds(departmentId)).where("itemId", "==", id).where("status", "==", "active")))),
  ]);
  const stock = new Map();
  itemIds.forEach((id, i) => {
    stock.set(id, {
      balances: balanceSnaps[i].docs.map((doc) => ({ ref: doc.ref, data: doc.data() })),
      holds: new Map(holdSnaps[i].docs.map((doc) => [doc.id, doc.data()])),
    });
  });
  return stock;
}

/** Rewrite each balance of the item whose hold flags change. Returns how many were written. */
function writeHoldFlags(tx, itemStock, heldKeys, at) {
  let written = 0;
  for (const { ref, data } of itemStock.balances) {
    const next = logic.withHolds(data, heldKeys);
    const changed = (data.lots || []).some((lot) => Boolean(lot.held) !== heldKeys.has(lot.key))
      || (data.heldQuantity || 0) !== next.heldQuantity;
    if (!changed) continue;
    tx.set(ref, { ...next, updatedAt: at });
    written += 1;
  }
  return written;
}

/** Lots of an item in stock anywhere, by lot key: { key, lot, expiration, onHand, locations }. */
function lotsOnHand(itemStock) {
  const lots = new Map();
  for (const { data } of itemStock.balances) {
    for (const lot of data.lots || []) {
      if (!(lot.quantity > 0)) continue;
      const entry = lots.get(lot.key) || { key: lot.key, lot: lot.lot || "", expiration: lot.expiration || "", onHand: 0, locations: [] };
      entry.onHand += lot.quantity;
      entry.locations.push({ locationId: data.locationId, quantity: lot.quantity });
      lots.set(lot.key, entry);
    }
  }
  return lots;
}

function activeHoldKeys(holds) {
  return new Set([...holds.values()].filter((h) => h.status === "active").map((h) => h.key));
}

function holdIsNeeded(hold) {
  return (hold.recallIds || []).length > 0 || Boolean(hold.manual);
}

// ---------------------------------------------------------------- recalls

async function createRecall(db, request) {
  const caller = await resolveCaller(db, request);
  const input = request.data?.recall || {};
  const itemIds = [...new Set((Array.isArray(input.itemIds) ? input.itemIds : []).map((id) => cleanDocId(id, "Medication")))];
  if (!itemIds.length) throw new HttpsError("invalid-argument", "Choose the recalled medication.");
  if (itemIds.length > MAX_RECALL_ITEMS) throw new HttpsError("invalid-argument", `A recall can list at most ${MAX_RECALL_ITEMS} medications.`);
  const lotNumbers = cleanLotNumbers(input.lotNumbers);
  const reason = text(input.reason, 500);
  if (!reason) throw new HttpsError("invalid-argument", "Say why it was recalled.");
  const recallClass = text(input.recallClass, 4);
  if (!logic.RECALL_CLASSES.includes(recallClass)) throw new HttpsError("invalid-argument", "Recall class must be I, II, III or not given.");
  const issuedOn = text(input.issuedOn, 10);
  if (issuedOn && !logic.isValidDate(issuedOn)) throw new HttpsError("invalid-argument", "Issued on must be a date (YYYY-MM-DD).");
  const fields = {
    reason,
    recallClass,
    issuedOn,
    source: text(input.source, 120),
    reference: text(input.reference, 80),
    note: text(input.note, 1000),
  };
  const d = caller.departmentId;
  const recallId = newId("RC");
  const recallRef = db.collection(paths.recalls(d)).doc(recallId);
  const at = nowIso();

  return db.runTransaction(async (tx) => {
    const itemSnaps = await Promise.all(itemIds.map((id) => tx.get(db.collection(paths.items(d)).doc(id))));
    const items = itemSnaps.map((snap) => {
      if (!snap.exists) throw new HttpsError("not-found", "That medication wasn't found.");
      const item = { id: snap.id, ...snap.data() };
      if (item.itemClass !== "medication") throw new HttpsError("failed-precondition", `${item.name} isn't a medication.`);
      inventory.assertItemAccess(caller, item, "manage");
      return item;
    });
    const stock = await readItemsStock(tx, db, d, itemIds);
    const recall = { id: recallId, status: "open", itemIds, lotNumbers };

    // Find the lots on hand that the recall covers, then read their hold documents.
    const affected = [];
    for (const item of items) {
      for (const lot of lotsOnHand(stock.get(item.id)).values()) {
        if (logic.recallCovers(recall, item.id, lot.lot)) affected.push({ item, lot });
      }
    }
    const holdRefs = affected.map(({ item, lot }) => db.collection(paths.holds(d)).doc(logic.holdId(item.id, lot.key)));
    const holdSnaps = await Promise.all(holdRefs.map((ref) => tx.get(ref)));

    let writes = 2 + affected.length;
    affected.forEach(({ item, lot }, i) => {
      const before = holdSnaps[i].exists && holdSnaps[i].data().status === "active" ? holdSnaps[i].data() : null;
      const hold = {
        id: holdRefs[i].id, itemId: item.id, itemName: item.name, key: lot.key, lot: lot.lot, expiration: lot.expiration,
        status: "active",
        recallIds: [...new Set([...(before?.recallIds || []), recallId])],
        manual: before?.manual || null,
        placedAt: before?.placedAt || at,
        placedBy: before?.placedBy || caller.uid,
        updatedAt: at,
      };
      tx.set(holdRefs[i], hold);
      stock.get(item.id).holds.set(holdRefs[i].id, hold);
    });
    for (const item of items) {
      const itemStock = stock.get(item.id);
      writes += writeHoldFlags(tx, itemStock, activeHoldKeys(itemStock.holds), at);
    }
    if (writes > MAX_WRITES) throw new HttpsError("failed-precondition", "This recall touches too much stock at once. Split it by medication.");

    const affectedLots = affected.map(({ item, lot }) => ({
      itemId: item.id, itemName: item.name, key: lot.key, lot: lot.lot, expiration: lot.expiration,
      onHandAtRecall: lot.onHand, locations: lot.locations.slice(0, 50),
    }));
    tx.create(recallRef, {
      ...recall,
      ...fields,
      itemNames: items.map((i) => i.name),
      affectedLots,
      heldQuantityAtRecall: affected.reduce((sum, a) => sum + a.lot.onHand, 0),
      createdAt: at,
      createdBy: caller.uid,
      createdByName: caller.name,
      updatedAt: at,
    });
    auditEvent(db, tx, caller, {
      action: "ems.recall.created", recordType: "recall", recordId: recallId,
      summary: `Recall${fields.reference ? ` ${fields.reference}` : ""}: ${items.map((i) => i.name).join(", ")}${lotNumbers.length ? ` lots ${lotNumbers.join(", ")}` : " (every lot)"}. ${affected.length} lot${affected.length === 1 ? "" : "s"} on hand put on hold`,
    });
    return { recallId, heldLots: affected.length, heldQuantity: affected.reduce((sum, a) => sum + a.lot.onHand, 0) };
  });
}

async function closeRecall(db, request) {
  const caller = await resolveCaller(db, request);
  const recallId = cleanDocId(request.data?.recallId, "Recall");
  const outcome = text(request.data?.outcome, 20);
  if (!["completed", "withdrawn"].includes(outcome)) throw new HttpsError("invalid-argument", "Choose how the recall ended.");
  const note = text(request.data?.note, 500);
  if (outcome === "withdrawn" && !note) throw new HttpsError("invalid-argument", "Say why the recall was withdrawn.");
  const d = caller.departmentId;
  const ref = db.collection(paths.recalls(d)).doc(recallId);
  const at = nowIso();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That recall wasn't found.");
    const recall = snap.data();
    if (recall.status !== "open") throw new HttpsError("failed-precondition", "That recall is already closed.");
    const itemSnaps = await Promise.all(recall.itemIds.map((id) => tx.get(db.collection(paths.items(d)).doc(id))));
    for (const itemSnap of itemSnaps) {
      if (itemSnap.exists) inventory.assertItemAccess(caller, itemSnap.data(), "manage");
    }
    const stock = await readItemsStock(tx, db, d, recall.itemIds);

    const ours = [];
    for (const itemId of recall.itemIds) {
      for (const [id, hold] of stock.get(itemId).holds) {
        if ((hold.recallIds || []).includes(recallId)) ours.push({ itemId, id, hold });
      }
    }
    if (outcome === "completed") {
      const remaining = [];
      for (const { itemId, hold } of ours) {
        const lot = lotsOnHand(stock.get(itemId)).get(hold.key);
        if (lot?.onHand) remaining.push(`${hold.itemName} lot ${hold.lot || "(no lot)"}: ${lot.onHand}`);
      }
      if (remaining.length) {
        throw new HttpsError("failed-precondition", `Recalled stock is still on hand (${remaining.slice(0, 5).join("; ")}${remaining.length > 5 ? "; …" : ""}). Return it to the vendor or waste it first, or close the recall as withdrawn.`);
      }
    }

    let writes = 2;
    let released = 0;
    for (const { itemId, id, hold } of ours) {
      const recallIds = hold.recallIds.filter((r) => r !== recallId);
      const next = { ...hold, recallIds, updatedAt: at };
      if (!holdIsNeeded(next)) {
        Object.assign(next, { status: "released", releasedAt: at, releasedBy: caller.uid, releaseNote: `Recall ${outcome}` });
        released += 1;
      }
      tx.set(db.collection(paths.holds(d)).doc(id), next);
      stock.get(itemId).holds.set(id, next);
      writes += 1;
    }
    for (const itemId of recall.itemIds) {
      const itemStock = stock.get(itemId);
      writes += writeHoldFlags(tx, itemStock, activeHoldKeys(itemStock.holds), at);
    }
    if (writes > MAX_WRITES) throw new HttpsError("failed-precondition", "This recall touches too much stock to close at once.");

    tx.update(ref, { status: "closed", outcome, closeNote: note, closedAt: at, closedBy: caller.uid, closedByName: caller.name, updatedAt: at });
    auditEvent(db, tx, caller, {
      action: `ems.recall.${outcome}`, recordType: "recall", recordId: recallId,
      summary: `Closed recall${recall.reference ? ` ${recall.reference}` : ""} as ${outcome}${note ? `: ${note}` : ""}`,
    });
    return { recallId, outcome, releasedHolds: released };
  });
}

// ---------------------------------------------------------------- manual holds

async function placeHold(db, request) {
  const caller = await resolveCaller(db, request);
  const itemId = cleanDocId(request.data?.itemId, "Item");
  const key = text(request.data?.lotKey, 32);
  if (!key) throw new HttpsError("invalid-argument", "Choose the lot.");
  const reason = text(request.data?.reason, 300);
  if (!reason) throw new HttpsError("invalid-argument", "Say why the lot is on hold.");
  const d = caller.departmentId;
  const holdRef = db.collection(paths.holds(d)).doc(logic.holdId(itemId, key));
  const at = nowIso();

  return db.runTransaction(async (tx) => {
    const [itemSnap, holdSnap] = await Promise.all([tx.get(db.collection(paths.items(d)).doc(itemId)), tx.get(holdRef)]);
    if (!itemSnap.exists) throw new HttpsError("not-found", "That item wasn't found.");
    const item = { id: itemSnap.id, ...itemSnap.data() };
    inventory.assertItemAccess(caller, item, "manage");
    const stock = await readItemsStock(tx, db, d, [itemId]);
    const lot = lotsOnHand(stock.get(itemId)).get(key);
    if (!lot) throw new HttpsError("failed-precondition", "That lot isn't in stock anywhere.");
    const before = holdSnap.exists && holdSnap.data().status === "active" ? holdSnap.data() : null;
    if (before?.manual) throw new HttpsError("already-exists", "That lot is already on hold.");
    const hold = {
      id: holdRef.id, itemId, itemName: item.name, key, lot: lot.lot, expiration: lot.expiration,
      status: "active",
      recallIds: before?.recallIds || [],
      manual: { reason, by: caller.uid, byName: caller.name, at },
      placedAt: before?.placedAt || at,
      placedBy: before?.placedBy || caller.uid,
      updatedAt: at,
    };
    tx.set(holdRef, hold);
    stock.get(itemId).holds.set(holdRef.id, hold);
    writeHoldFlags(tx, stock.get(itemId), activeHoldKeys(stock.get(itemId).holds), at);
    auditEvent(db, tx, caller, {
      action: "ems.hold.placed", recordType: "hold", recordId: holdRef.id,
      summary: `Put ${item.name} lot ${lot.lot || "(no lot)"} on hold (${lot.onHand} on hand): ${reason}`,
    });
    return { holdId: holdRef.id, heldQuantity: lot.onHand };
  });
}

async function releaseHold(db, request) {
  const caller = await resolveCaller(db, request);
  const holdId = cleanDocId(request.data?.holdId, "Hold");
  const note = text(request.data?.note, 300);
  if (!note) throw new HttpsError("invalid-argument", "Say why the hold is released.");
  const d = caller.departmentId;
  const holdRef = db.collection(paths.holds(d)).doc(holdId);
  const at = nowIso();

  return db.runTransaction(async (tx) => {
    const holdSnap = await tx.get(holdRef);
    if (!holdSnap.exists || holdSnap.data().status !== "active") throw new HttpsError("not-found", "That hold isn't active.");
    const hold = holdSnap.data();
    if ((hold.recallIds || []).length) {
      throw new HttpsError("failed-precondition", "An open recall covers this lot. Close the recall to release it.");
    }
    const itemSnap = await tx.get(db.collection(paths.items(d)).doc(hold.itemId));
    inventory.assertItemAccess(caller, itemSnap.exists ? itemSnap.data() : { itemClass: "medication" }, "manage");
    const stock = await readItemsStock(tx, db, d, [hold.itemId]);
    const next = { ...hold, manual: null, status: "released", releasedAt: at, releasedBy: caller.uid, releaseNote: note, updatedAt: at };
    tx.set(holdRef, next);
    stock.get(hold.itemId).holds.set(holdId, next);
    writeHoldFlags(tx, stock.get(hold.itemId), activeHoldKeys(stock.get(hold.itemId).holds), at);
    auditEvent(db, tx, caller, {
      action: "ems.hold.released", recordType: "hold", recordId: holdId,
      summary: `Released the hold on ${hold.itemName} lot ${hold.lot || "(no lot)"}: ${note}`,
    });
    return { holdId };
  });
}

module.exports = {
  createRecall,
  closeRecall,
  placeHold,
  releaseHold,
};
