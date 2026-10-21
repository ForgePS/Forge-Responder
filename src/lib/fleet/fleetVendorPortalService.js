import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { listFleetVendors, normalizeFleetVendor, ensureFleetVendorsSeeded } from "./fleetShopVendorService.js";
import { listFleetWorkOrders, normalizeFleetWorkOrder, updateFleetWorkOrder } from "./fleetWorkOrderService.js";
import { FLEET_VENDORS_COLLECTION, FLEET_WORK_ORDERS_COLLECTION } from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

export const VENDOR_PORTAL_ACTIONS = [
  { id: "accept", label: "Accept work", nextStatus: "scheduled" },
  { id: "reject", label: "Reject / return", nextStatus: "requested" },
  { id: "estimate", label: "Submit estimate", nextStatus: null },
  { id: "in_progress", label: "Mark in progress", nextStatus: "in_progress" },
  { id: "awaiting_parts", label: "Awaiting parts", nextStatus: "awaiting_parts" },
  { id: "ready", label: "Mark ready for QC", nextStatus: "ready_for_qc" },
  { id: "invoice", label: "Submit invoice note", nextStatus: null },
];

/**
 * Extend vendor profile with portal controls (backward compatible).
 */
export function normalizeVendorPortalProfile(raw = {}, departmentId = "") {
  const base = normalizeFleetVendor(raw, departmentId);
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    ...base,
    portalEnabled: data.portalEnabled !== false,
    portalScopes: Array.isArray(data.portalScopes) && data.portalScopes.length
      ? data.portalScopes
      : ["view_work", "accept_reject", "estimate", "status", "diagnosis", "parts", "labor", "invoice"],
    performanceScore: Number(data.performanceScore) || 0,
    responseHoursAvg: Number(data.responseHoursAvg) || 0,
    comebackRate: Number(data.comebackRate) || 0,
  };
}

export async function listPortalVendors(departmentId) {
  await ensureFleetVendorsSeeded(departmentId);
  return (await listFleetVendors(departmentId))
    .map((row) => normalizeVendorPortalProfile(row, departmentId))
    .filter((row) => row.active && row.portalEnabled);
}

export async function saveVendorPortalProfile(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id;
  if (!id) throw new Error("vendor id is required");
  const existing = normalizeVendorPortalProfile(
    await getRecord(departmentId, FLEET_VENDORS_COLLECTION, id) || {},
    departmentId
  );
  const record = normalizeVendorPortalProfile({
    ...existing,
    ...input,
    id,
    departmentId,
    updatedAt: stamp,
    createdAt: existing.createdAt || stamp,
  }, departmentId);
  await updateRecord(departmentId, FLEET_VENDORS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "vendor_portal_profile",
    recordId: id,
    summary: `Updated portal profile for ${record.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

/**
 * Work orders visible to a vendor (assigned by vendorId or vendorName).
 */
export async function listVendorPortalWorkOrders(departmentId, vendorId) {
  if (!departmentId || !vendorId) return [];
  const vendor = normalizeVendorPortalProfile(
    await getRecord(departmentId, FLEET_VENDORS_COLLECTION, vendorId) || {},
    departmentId
  );
  if (!vendor.id || !vendor.portalEnabled) return [];
  const all = await listFleetWorkOrders(departmentId);
  return all
    .filter((row) => row.vendorId === vendorId || (vendor.name && row.vendorName === vendor.name))
    .filter((row) => !["closed", "cancelled"].includes(row.status) || row.vendorId === vendorId)
    .map((row) => redactWorkOrderForVendor(row, vendor))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

function redactWorkOrderForVendor(workOrder, vendor) {
  const scopes = new Set(vendor.portalScopes || []);
  const row = { ...workOrder };
  if (!scopes.has("diagnosis")) {
    row.diagnosis = row.diagnosis ? "[restricted]" : "";
    row.cause = "";
  }
  if (!scopes.has("labor")) row.labor = [];
  if (!scopes.has("parts")) row.parts = [];
  if (!scopes.has("invoice")) {
    row.outsideCost = scopes.has("estimate") ? row.outsideCost : 0;
  }
  return row;
}

/**
 * Vendor portal action on an assigned work order.
 */
export async function applyVendorPortalAction(departmentId, vendorId, workOrderId, actionId, input = {}, audit = {}) {
  const vendor = normalizeVendorPortalProfile(
    await getRecord(departmentId, FLEET_VENDORS_COLLECTION, vendorId) || {},
    departmentId
  );
  if (!vendor.id || !vendor.portalEnabled) throw new Error("Vendor portal not enabled");

  const existing = normalizeFleetWorkOrder(
    await getRecord(departmentId, FLEET_WORK_ORDERS_COLLECTION, workOrderId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Work order not found");
  if (existing.vendorId !== vendorId && existing.vendorName !== vendor.name) {
    throw new Error("Work order is not assigned to this vendor");
  }

  const action = VENDOR_PORTAL_ACTIONS.find((row) => row.id === actionId);
  if (!action) throw new Error("Unknown portal action");

  const scopes = new Set(vendor.portalScopes || []);
  if (actionId === "accept" || actionId === "reject") {
    if (!scopes.has("accept_reject")) throw new Error("Accept/reject not allowed for this vendor");
  }
  if (actionId === "estimate" && !scopes.has("estimate")) throw new Error("Estimates not allowed");
  if (["in_progress", "awaiting_parts", "ready"].includes(actionId) && !scopes.has("status")) {
    throw new Error("Status updates not allowed");
  }
  if (actionId === "invoice" && !scopes.has("invoice")) throw new Error("Invoice notes not allowed");

  const patch = {
    vendorId: vendor.id,
    vendorName: vendor.name,
  };
  if (action.nextStatus) patch.status = action.nextStatus;
  if (input.estimatedCost != null && input.estimatedCost !== "") {
    patch.estimatedCost = Number(input.estimatedCost) || 0;
  }
  if (input.diagnosis && scopes.has("diagnosis")) patch.diagnosis = input.diagnosis;
  if (input.correction) patch.correction = input.correction;
  if (input.outsideCost != null && input.outsideCost !== "") {
    patch.outsideCost = Number(input.outsideCost) || 0;
  }
  if (Array.isArray(input.parts) && scopes.has("parts")) patch.parts = input.parts;
  if (Array.isArray(input.labor) && scopes.has("labor")) patch.labor = input.labor;
  if (input.invoiceNote) {
    patch.qcNotes = [existing.qcNotes, `Vendor invoice: ${input.invoiceNote}`].filter(Boolean).join("\n");
  }

  const next = await updateFleetWorkOrder(departmentId, workOrderId, patch, {
    ...audit,
    actorName: audit.actorName || `Vendor:${vendor.name}`,
  });

  await writeFleetAuditLog(departmentId, {
    action: "vendor_portal_action",
    recordId: workOrderId,
    summary: `Vendor ${vendor.name} · ${action.label} on ${existing.workOrderNumber || workOrderId}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || `Vendor:${vendor.name}`,
  }).catch(() => null);

  return next;
}

export async function buildVendorPortalBoard(departmentId, vendorId) {
  const vendors = await listPortalVendors(departmentId);
  const vendor = vendors.find((row) => row.id === vendorId) || vendors[0] || null;
  const workOrders = vendor ? await listVendorPortalWorkOrders(departmentId, vendor.id) : [];
  return {
    vendors,
    vendor,
    workOrders,
    summary: {
      vendors: vendors.length,
      openWork: workOrders.filter((row) => !["completed", "closed", "cancelled"].includes(row.status)).length,
      awaitingVendor: workOrders.filter((row) => row.status === "awaiting_vendor").length,
      readyForQc: workOrders.filter((row) => row.status === "ready_for_qc").length,
    },
    actions: VENDOR_PORTAL_ACTIONS,
  };
}

export function getVendorPortalActions() {
  return [...VENDOR_PORTAL_ACTIONS];
}
