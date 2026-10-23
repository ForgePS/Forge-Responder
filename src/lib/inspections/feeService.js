import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { getInspectionRecord } from "./inspectionWorkflow.js";
import {
  STARTER_FEE_SCHEDULES,
} from "./feeDefaults.js";
import {
  INSPECTION_FEE_ADJUSTMENTS_COLLECTION,
  INSPECTION_FEE_SCHEDULES_COLLECTION,
  INSPECTION_FEES_COLLECTION,
  INSPECTION_INVOICES_COLLECTION,
  INSPECTION_PAYMENTS_COLLECTION,
  OCCUPANCIES_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "FEE") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

async function nextNumber(departmentId, collectionName, prefix) {
  const rows = await listRecords(departmentId, collectionName);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(rows.length + 1).padStart(4, "0")}`;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function agingBucket(dueAt, balance) {
  if (!(Number(balance) > 0) || !dueAt) return "current";
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return "current";
  const days = Math.floor((Date.now() - due) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "current";
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

export function normalizeFeeSchedule(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    feeTypeId: data.feeTypeId || "custom",
    name: String(data.name || "Untitled fee").trim(),
    amount: money(data.amount),
    unit: data.unit || "flat",
    active: data.active !== false,
    description: data.description || "",
    glCode: data.glCode || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeInspectionFee(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const amount = money(data.amount);
  const paidAmount = money(data.paidAmount);
  const waivedAmount = money(data.waivedAmount);
  const balance = money(Math.max(0, amount - paidAmount - waivedAmount));
  let status = data.status || "open";
  if (status !== "void") {
    if (waivedAmount >= amount && amount > 0) status = "waived";
    else if (balance <= 0 && paidAmount > 0) status = "paid";
    else if (paidAmount > 0 && balance > 0) status = "partially_paid";
    else if (data.invoiceId && status === "open") status = "invoiced";
  }
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    feeNumber: data.feeNumber || data.id || "",
    scheduleId: data.scheduleId || "",
    feeTypeId: data.feeTypeId || "custom",
    name: String(data.name || "Fee").trim(),
    description: data.description || "",
    amount,
    paidAmount,
    waivedAmount,
    balance,
    status,
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    inspectionId: data.inspectionId || "",
    inspectionNumber: data.inspectionNumber || "",
    invoiceId: data.invoiceId || "",
    invoiceNumber: data.invoiceNumber || "",
    dueAt: data.dueAt || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeInvoice(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const totalAmount = money(data.totalAmount);
  const paidAmount = money(data.paidAmount);
  const waivedAmount = money(data.waivedAmount);
  const balance = money(Math.max(0, totalAmount - paidAmount - waivedAmount));
  let status = data.status || "draft";
  if (status !== "void") {
    if (balance <= 0 && (paidAmount > 0 || waivedAmount >= totalAmount)) status = "paid";
    else if (paidAmount > 0 && balance > 0) status = "partially_paid";
  }
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    invoiceNumber: data.invoiceNumber || data.id || "",
    status,
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    inspectionId: data.inspectionId || "",
    inspectionNumber: data.inspectionNumber || "",
    feeIds: Array.isArray(data.feeIds) ? data.feeIds.map(String) : [],
    totalAmount,
    paidAmount,
    waivedAmount,
    balance,
    issuedAt: data.issuedAt || "",
    dueAt: data.dueAt || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizePayment(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    paymentNumber: data.paymentNumber || data.id || "",
    status: data.status || "recorded",
    method: data.method || "cash",
    amount: money(data.amount),
    receivedAt: data.receivedAt || "",
    reference: data.reference || "",
    receiptNumber: data.receiptNumber || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    invoiceId: data.invoiceId || "",
    invoiceNumber: data.invoiceNumber || "",
    feeIds: Array.isArray(data.feeIds) ? data.feeIds.map(String) : [],
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeFeeAdjustment(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    adjustmentNumber: data.adjustmentNumber || data.id || "",
    adjustmentType: data.adjustmentType || "waiver",
    amount: money(data.amount),
    reason: data.reason || "",
    feeId: data.feeId || "",
    feeNumber: data.feeNumber || "",
    invoiceId: data.invoiceId || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export async function ensureFeeSchedulesSeeded(departmentId, actor = {}) {
  const existing = await listRecords(departmentId, INSPECTION_FEE_SCHEDULES_COLLECTION);
  if (existing.length) {
    return existing.map((row) => normalizeFeeSchedule(row, departmentId));
  }
  const stamp = nowIso();
  const created = [];
  for (const seed of STARTER_FEE_SCHEDULES) {
    const record = normalizeFeeSchedule({
      ...seed,
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: actor.actorUid || "",
      createdByName: actor.actorName || "",
    }, departmentId);
    await createRecord(departmentId, INSPECTION_FEE_SCHEDULES_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeInspectionAuditLog(departmentId, {
    action: "fee.schedule.seeded",
    entityType: "fee_schedule",
    entityId: "seed",
    summary: `Seeded ${created.length} fee schedule items`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return created;
}

export async function listFeeSchedules(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_FEE_SCHEDULES_COLLECTION);
  return rows
    .map((row) => normalizeFeeSchedule(row, departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveFeeSchedule(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("SCH");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_FEE_SCHEDULES_COLLECTION, id)
    : null;
  const stamp = nowIso();
  const record = normalizeFeeSchedule({
    ...existing,
    ...draft,
    id,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_FEE_SCHEDULES_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_FEE_SCHEDULES_COLLECTION, id, record);
  }
  await writeInspectionAuditLog(departmentId, {
    action: existing ? "fee.schedule.update" : "fee.schedule.create",
    entityType: "fee_schedule",
    entityId: id,
    summary: `${existing ? "Updated" : "Created"} fee schedule ${record.name}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return record;
}

export async function listInspectionFees(departmentId, filters = {}) {
  let rows = (await listRecords(departmentId, INSPECTION_FEES_COLLECTION))
    .map((row) => normalizeInspectionFee(row, departmentId));
  if (filters.occupancyId) rows = rows.filter((row) => row.occupancyId === filters.occupancyId);
  if (filters.inspectionId) rows = rows.filter((row) => row.inspectionId === filters.inspectionId);
  if (filters.status) rows = rows.filter((row) => row.status === filters.status);
  if (filters.openOnly) {
    rows = rows.filter((row) => ["open", "invoiced", "partially_paid"].includes(row.status) && row.balance > 0);
  }
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createInspectionFee(departmentId, input = {}, actor = {}) {
  const schedule = input.scheduleId
    ? normalizeFeeSchedule(
      await getRecord(departmentId, INSPECTION_FEE_SCHEDULES_COLLECTION, input.scheduleId) || {},
      departmentId
    )
    : null;

  let occupancyName = input.occupancyName || "";
  let address = input.address || "";
  let inspectionNumber = input.inspectionNumber || "";
  let occupancyId = input.occupancyId || "";

  if (input.inspectionId) {
    const inspection = await getInspectionRecord(departmentId, input.inspectionId);
    if (inspection) {
      occupancyId = occupancyId || inspection.occupancyId || "";
      occupancyName = occupancyName || inspection.occupancyName || "";
      address = address || inspection.address || "";
      inspectionNumber = inspectionNumber || inspection.inspectionNumber || "";
    }
  }
  if (occupancyId && !occupancyName) {
    const occupancy = await getRecord(departmentId, OCCUPANCIES_COLLECTION, occupancyId);
    if (occupancy) {
      occupancyName = occupancy.name || "";
      address = address || occupancy.address || "";
    }
  }

  const id = newId("FEE");
  const stamp = nowIso();
  const amount = money(input.amount != null ? input.amount : schedule?.amount || 0);
  const dueAt = input.dueAt
    || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const record = normalizeInspectionFee({
    id,
    feeNumber: await nextNumber(departmentId, INSPECTION_FEES_COLLECTION, "FEE"),
    scheduleId: schedule?.id || input.scheduleId || "",
    feeTypeId: input.feeTypeId || schedule?.feeTypeId || "custom",
    name: input.name || schedule?.name || "Fee",
    description: input.description || schedule?.description || "",
    amount,
    paidAmount: 0,
    waivedAmount: 0,
    status: "open",
    occupancyId,
    occupancyName,
    address,
    inspectionId: input.inspectionId || "",
    inspectionNumber,
    dueAt,
    notes: input.notes || "",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTION_FEES_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    action: "fee.create",
    entityType: "fee",
    entityId: id,
    summary: `Created fee ${record.feeNumber} (${formatAuditMoney(record.amount)})`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return record;
}

function formatAuditMoney(amount) {
  return `$${money(amount).toFixed(2)}`;
}

async function recalculateFeeStatus(departmentId, feeId) {
  const fee = normalizeInspectionFee(
    await getRecord(departmentId, INSPECTION_FEES_COLLECTION, feeId) || {},
    departmentId
  );
  if (!fee.id) return null;
  await updateRecord(departmentId, INSPECTION_FEES_COLLECTION, feeId, {
    paidAmount: fee.paidAmount,
    waivedAmount: fee.waivedAmount,
    balance: fee.balance,
    status: fee.status,
    updatedAt: nowIso(),
  });
  return normalizeInspectionFee(
    await getRecord(departmentId, INSPECTION_FEES_COLLECTION, feeId),
    departmentId
  );
}

async function recalculateInvoiceFromFees(departmentId, invoiceId) {
  const invoice = normalizeInvoice(
    await getRecord(departmentId, INSPECTION_INVOICES_COLLECTION, invoiceId) || {},
    departmentId
  );
  if (!invoice.id) return null;
  const fees = [];
  for (const feeId of invoice.feeIds) {
    const fee = await getRecord(departmentId, INSPECTION_FEES_COLLECTION, feeId);
    if (fee) fees.push(normalizeInspectionFee(fee, departmentId));
  }
  const totalAmount = money(fees.reduce((sum, row) => sum + row.amount, 0));
  const paidAmount = money(fees.reduce((sum, row) => sum + row.paidAmount, 0));
  const waivedAmount = money(fees.reduce((sum, row) => sum + row.waivedAmount, 0));
  const next = normalizeInvoice({
    ...invoice,
    totalAmount,
    paidAmount,
    waivedAmount,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_INVOICES_COLLECTION, invoiceId, next);
  return next;
}

export async function createInvoiceFromFees(departmentId, input = {}, actor = {}) {
  const feeIds = Array.isArray(input.feeIds) ? input.feeIds.filter(Boolean) : [];
  if (!feeIds.length) throw new Error("Select at least one fee to invoice.");

  const fees = [];
  for (const feeId of feeIds) {
    const fee = normalizeInspectionFee(
      await getRecord(departmentId, INSPECTION_FEES_COLLECTION, feeId) || {},
      departmentId
    );
    if (!fee.id) throw new Error(`Fee not found: ${feeId}`);
    if (fee.status === "void" || fee.status === "paid" || fee.status === "waived") {
      throw new Error(`Fee ${fee.feeNumber} cannot be invoiced (${fee.status}).`);
    }
    if (fee.invoiceId) throw new Error(`Fee ${fee.feeNumber} is already on an invoice.`);
    fees.push(fee);
  }

  const occupancyId = input.occupancyId || fees[0].occupancyId;
  if (fees.some((row) => row.occupancyId && row.occupancyId !== occupancyId)) {
    throw new Error("All fees on an invoice must belong to the same occupancy.");
  }

  const id = newId("INV");
  const stamp = nowIso();
  const totalAmount = money(fees.reduce((sum, row) => sum + row.amount, 0));
  const paidAmount = money(fees.reduce((sum, row) => sum + row.paidAmount, 0));
  const waivedAmount = money(fees.reduce((sum, row) => sum + row.waivedAmount, 0));
  const invoice = normalizeInvoice({
    id,
    invoiceNumber: await nextNumber(departmentId, INSPECTION_INVOICES_COLLECTION, "INV"),
    status: "issued",
    occupancyId,
    occupancyName: fees[0].occupancyName || input.occupancyName || "",
    address: fees[0].address || input.address || "",
    inspectionId: input.inspectionId || fees.find((row) => row.inspectionId)?.inspectionId || "",
    inspectionNumber: fees.find((row) => row.inspectionNumber)?.inspectionNumber || "",
    feeIds,
    totalAmount,
    paidAmount,
    waivedAmount,
    issuedAt: stamp.slice(0, 10),
    dueAt: input.dueAt || fees[0].dueAt || stamp.slice(0, 10),
    notes: input.notes || "",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTION_INVOICES_COLLECTION, id, invoice);

  for (const fee of fees) {
    await updateRecord(departmentId, INSPECTION_FEES_COLLECTION, fee.id, {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      status: fee.paidAmount > 0 ? "partially_paid" : "invoiced",
      updatedAt: stamp,
    });
  }

  await writeInspectionAuditLog(departmentId, {
    action: "fee.invoice.create",
    entityType: "invoice",
    entityId: id,
    summary: `Issued invoice ${invoice.invoiceNumber} for ${formatAuditMoney(totalAmount)}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return invoice;
}

export async function listInvoices(departmentId, filters = {}) {
  let rows = (await listRecords(departmentId, INSPECTION_INVOICES_COLLECTION))
    .map((row) => normalizeInvoice(row, departmentId));
  if (filters.occupancyId) rows = rows.filter((row) => row.occupancyId === filters.occupancyId);
  if (filters.openOnly) {
    rows = rows.filter((row) => ["issued", "partially_paid", "draft"].includes(row.status) && row.balance > 0);
  }
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function recordPayment(departmentId, input = {}, actor = {}) {
  const amount = money(input.amount);
  if (!(amount > 0)) throw new Error("Payment amount must be greater than zero.");

  let invoice = null;
  let fees = [];

  if (input.invoiceId) {
    invoice = normalizeInvoice(
      await getRecord(departmentId, INSPECTION_INVOICES_COLLECTION, input.invoiceId) || {},
      departmentId
    );
    if (!invoice.id) throw new Error("Invoice not found.");
    if (invoice.status === "void") throw new Error("Cannot pay a void invoice.");
    for (const feeId of invoice.feeIds) {
      const fee = normalizeInspectionFee(
        await getRecord(departmentId, INSPECTION_FEES_COLLECTION, feeId) || {},
        departmentId
      );
      if (fee.id && fee.balance > 0) fees.push(fee);
    }
  } else if (input.feeId) {
    const fee = normalizeInspectionFee(
      await getRecord(departmentId, INSPECTION_FEES_COLLECTION, input.feeId) || {},
      departmentId
    );
    if (!fee.id) throw new Error("Fee not found.");
    fees = [fee];
  } else {
    throw new Error("Select an invoice or fee to apply the payment.");
  }

  const openBalance = money(fees.reduce((sum, row) => sum + row.balance, 0));
  if (!(openBalance > 0)) throw new Error("Nothing left to pay on the selected items.");
  if (amount > openBalance + 0.001) {
    throw new Error(`Payment exceeds open balance of ${formatAuditMoney(openBalance)}.`);
  }

  let remaining = amount;
  const appliedFeeIds = [];
  for (const fee of fees) {
    if (remaining <= 0) break;
    const apply = money(Math.min(fee.balance, remaining));
    if (!(apply > 0)) continue;
    await updateRecord(departmentId, INSPECTION_FEES_COLLECTION, fee.id, {
      paidAmount: money(fee.paidAmount + apply),
      updatedAt: nowIso(),
    });
    await recalculateFeeStatus(departmentId, fee.id);
    appliedFeeIds.push(fee.id);
    remaining = money(remaining - apply);
  }

  const id = newId("PAY");
  const stamp = nowIso();
  const payment = normalizePayment({
    id,
    paymentNumber: await nextNumber(departmentId, INSPECTION_PAYMENTS_COLLECTION, "PAY"),
    status: "recorded",
    method: input.method || "cash",
    amount,
    receivedAt: input.receivedAt || stamp.slice(0, 10),
    reference: input.reference || "",
    receiptNumber: input.receiptNumber || `RCPT-${Date.now().toString(36).toUpperCase()}`,
    occupancyId: invoice?.occupancyId || fees[0]?.occupancyId || "",
    occupancyName: invoice?.occupancyName || fees[0]?.occupancyName || "",
    invoiceId: invoice?.id || fees[0]?.invoiceId || "",
    invoiceNumber: invoice?.invoiceNumber || fees[0]?.invoiceNumber || "",
    feeIds: appliedFeeIds,
    notes: input.notes || "",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTION_PAYMENTS_COLLECTION, id, payment);

  if (invoice?.id) {
    await recalculateInvoiceFromFees(departmentId, invoice.id);
  }

  await writeInspectionAuditLog(departmentId, {
    action: "fee.payment.record",
    entityType: "payment",
    entityId: id,
    summary: `Recorded payment ${payment.paymentNumber} for ${formatAuditMoney(amount)}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return payment;
}

export async function listPayments(departmentId, filters = {}) {
  let rows = (await listRecords(departmentId, INSPECTION_PAYMENTS_COLLECTION))
    .map((row) => normalizePayment(row, departmentId));
  if (filters.occupancyId) rows = rows.filter((row) => row.occupancyId === filters.occupancyId);
  if (filters.invoiceId) rows = rows.filter((row) => row.invoiceId === filters.invoiceId);
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function adjustInspectionFee(departmentId, feeId, input = {}, actor = {}) {
  const fee = normalizeInspectionFee(
    await getRecord(departmentId, INSPECTION_FEES_COLLECTION, feeId) || {},
    departmentId
  );
  if (!fee.id) throw new Error("Fee not found.");
  if (fee.status === "void") throw new Error("Cannot adjust a void fee.");

  const adjustmentType = input.adjustmentType || "waiver";
  let amount = money(input.amount);
  if (!(amount > 0) && (adjustmentType === "waiver" || adjustmentType === "write_off")) {
    amount = fee.balance;
  }
  if (!(amount > 0)) throw new Error("Adjustment amount must be greater than zero.");

  const stamp = nowIso();
  const patch = { updatedAt: stamp };

  if (adjustmentType === "waiver" || adjustmentType === "write_off" || adjustmentType === "reduction") {
    const waive = money(Math.min(amount, fee.balance));
    patch.waivedAmount = money(fee.waivedAmount + waive);
    amount = waive;
  } else if (adjustmentType === "increase") {
    patch.amount = money(fee.amount + amount);
  } else if (adjustmentType === "refund") {
    const refund = money(Math.min(amount, fee.paidAmount));
    patch.paidAmount = money(fee.paidAmount - refund);
    amount = refund;
  } else {
    throw new Error(`Unsupported adjustment type: ${adjustmentType}`);
  }

  await updateRecord(departmentId, INSPECTION_FEES_COLLECTION, feeId, patch);
  const updatedFee = await recalculateFeeStatus(departmentId, feeId);

  const id = newId("ADJ");
  const adjustment = normalizeFeeAdjustment({
    id,
    adjustmentNumber: await nextNumber(departmentId, INSPECTION_FEE_ADJUSTMENTS_COLLECTION, "ADJ"),
    adjustmentType,
    amount,
    reason: input.reason || "",
    feeId: fee.id,
    feeNumber: fee.feeNumber,
    invoiceId: fee.invoiceId,
    occupancyId: fee.occupancyId,
    occupancyName: fee.occupancyName,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
  }, departmentId);
  await createRecord(departmentId, INSPECTION_FEE_ADJUSTMENTS_COLLECTION, id, adjustment);

  if (fee.invoiceId) {
    await recalculateInvoiceFromFees(departmentId, fee.invoiceId);
  }

  await writeInspectionAuditLog(departmentId, {
    action: "fee.adjust",
    entityType: "fee_adjustment",
    entityId: id,
    summary: `${adjustmentType} ${formatAuditMoney(amount)} on ${fee.feeNumber}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });

  return { fee: updatedFee, adjustment };
}

export async function listFeeAdjustments(departmentId, filters = {}) {
  let rows = (await listRecords(departmentId, INSPECTION_FEE_ADJUSTMENTS_COLLECTION))
    .map((row) => normalizeFeeAdjustment(row, departmentId));
  if (filters.feeId) rows = rows.filter((row) => row.feeId === filters.feeId);
  if (filters.occupancyId) rows = rows.filter((row) => row.occupancyId === filters.occupancyId);
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createFeeFromInspection(departmentId, inspectionId, input = {}, actor = {}) {
  return createInspectionFee(departmentId, {
    ...input,
    inspectionId,
  }, actor);
}

export async function loadFeeBoard(departmentId) {
  const [schedules, fees, invoices, payments, adjustments] = await Promise.all([
    ensureFeeSchedulesSeeded(departmentId),
    listInspectionFees(departmentId),
    listInvoices(departmentId),
    listPayments(departmentId),
    listFeeAdjustments(departmentId),
  ]);

  const openFees = fees.filter((row) => row.balance > 0 && !["void", "waived", "paid"].includes(row.status));
  const outstanding = money(openFees.reduce((sum, row) => sum + row.balance, 0));
  const collected = money(
    payments.filter((row) => row.status === "recorded").reduce((sum, row) => sum + row.amount, 0)
  );
  const aging = { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
  for (const fee of openFees) {
    const bucket = agingBucket(fee.dueAt, fee.balance);
    aging[bucket] = money(aging[bucket] + fee.balance);
  }

  return {
    schedules,
    fees,
    invoices,
    payments,
    adjustments,
    metrics: {
      outstanding,
      collected,
      openFeeCount: openFees.length,
      openInvoiceCount: invoices.filter((row) => row.balance > 0 && row.status !== "void").length,
      aging,
    },
  };
}
