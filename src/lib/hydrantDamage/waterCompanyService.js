import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeHydrantDamageAudit } from "./audit.js";
import { WATER_CONTACT_TYPES, WATER_UTILITY_TYPES } from "./defaults.js";
import {
  WATER_COMPANIES_COLLECTION,
  WATER_COMPANY_CONTACTS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeWaterCompany(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const utilityType = data.utilityType || "municipal";
  const typeMeta = WATER_UTILITY_TYPES.find((row) => row.id === utilityType);
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    legalName: String(data.legalName || data.name || "").trim(),
    dba: String(data.dba || "").trim(),
    utilityType,
    utilityTypeLabel: typeMeta?.label || utilityType,
    parentOrganization: String(data.parentOrganization || "").trim(),
    mainAddress: String(data.mainAddress || "").trim(),
    mainPhone: String(data.mainPhone || "").trim(),
    emergencyPhone: String(data.emergencyPhone || "").trim(),
    afterHoursPhone: String(data.afterHoursPhone || "").trim(),
    generalEmail: String(data.generalEmail || "").trim(),
    damageReportEmail: String(data.damageReportEmail || "").trim(),
    emergencyEmail: String(data.emergencyEmail || "").trim(),
    maintenanceEmail: String(data.maintenanceEmail || "").trim(),
    engineeringEmail: String(data.engineeringEmail || "").trim(),
    gisEmail: String(data.gisEmail || "").trim(),
    preferredCommunicationMethod: data.preferredCommunicationMethod || "email",
    businessHours: String(data.businessHours || "").trim(),
    acknowledgmentSlaMinutes: Number(data.acknowledgmentSlaMinutes) || 240,
    emergencyResponseSlaMinutes: Number(data.emergencyResponseSlaMinutes) || 60,
    normalRepairSlaHours: Number(data.normalRepairSlaHours) || 72,
    preferredSubjectFormat: String(data.preferredSubjectFormat || "Hydrant Damage Report {reportNumber} — {hydrantId}").trim(),
    portalEnabled: Boolean(data.portalEnabled),
    active: data.active !== false,
    lastVerifiedAt: data.lastVerifiedAt || "",
    internalNotes: String(data.internalNotes || "").trim(),
    createdAt: data.createdAt || "",
    createdBy: data.createdBy || "",
    updatedAt: data.updatedAt || "",
    updatedBy: data.updatedBy || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeWaterCompanyContact(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const contactType = data.contactType || "primary";
  const typeMeta = WATER_CONTACT_TYPES.find((row) => row.id === contactType);
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    waterCompanyId: data.waterCompanyId || "",
    name: String(data.name || "").trim(),
    title: String(data.title || "").trim(),
    department: String(data.department || "").trim(),
    email: String(data.email || "").trim(),
    phone: String(data.phone || "").trim(),
    mobile: String(data.mobile || "").trim(),
    afterHoursPhone: String(data.afterHoursPhone || "").trim(),
    contactType,
    contactTypeLabel: typeMeta?.label || contactType,
    receivesRoutineReports: data.receivesRoutineReports !== false,
    receivesUrgentReports: Boolean(data.receivesUrgentReports),
    receivesOutOfServiceReports: Boolean(data.receivesOutOfServiceReports),
    receivesEscalation: Boolean(data.receivesEscalation),
    receivesRepairVerification: Boolean(data.receivesRepairVerification),
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listWaterCompanies(departmentId) {
  const rows = await listRecords(departmentId, WATER_COMPANIES_COLLECTION);
  return rows
    .map((row) => normalizeWaterCompany(row, departmentId))
    .sort((a, b) => a.legalName.localeCompare(b.legalName));
}

/**
 * @param {string} departmentId
 * @param {string} companyId
 */
export async function getWaterCompany(departmentId, companyId) {
  if (!companyId) return null;
  const row = await getRecord(departmentId, WATER_COMPANIES_COLLECTION, companyId);
  return row ? normalizeWaterCompany(row, departmentId) : null;
}

/**
 * @param {string} departmentId
 * @param {object} draft
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function saveWaterCompany(departmentId, draft = {}, actor = {}) {
  const existingId = draft.id || "";
  const id = existingId || newId("WC");
  const previous = existingId ? await getWaterCompany(departmentId, existingId) : null;
  const normalized = normalizeWaterCompany({
    ...draft,
    id,
    createdAt: previous?.createdAt || nowIso(),
    createdBy: previous?.createdBy || actor.actorUid || "system",
    updatedBy: actor.actorUid || "system",
  }, departmentId);
  if (!normalized.legalName) {
    throw new Error("Water company legal name is required.");
  }
  await createRecord(departmentId, WATER_COMPANIES_COLLECTION, id, normalized);
  await writeHydrantDamageAudit(departmentId, {
    action: previous ? "water_company.updated" : "water_company.created",
    entityType: "waterCompany",
    entityId: id,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    before: previous,
    after: normalized,
  });
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {string} [waterCompanyId]
 */
export async function listWaterCompanyContacts(departmentId, waterCompanyId = "") {
  const rows = await listRecords(departmentId, WATER_COMPANY_CONTACTS_COLLECTION);
  return rows
    .map((row) => normalizeWaterCompanyContact(row, departmentId))
    .filter((row) => !waterCompanyId || row.waterCompanyId === waterCompanyId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {string} departmentId
 * @param {object} draft
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function saveWaterCompanyContact(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("WCC");
  const normalized = normalizeWaterCompanyContact({
    ...draft,
    id,
    updatedAt: nowIso(),
    createdAt: draft.createdAt || nowIso(),
  }, departmentId);
  if (!normalized.waterCompanyId) {
    throw new Error("Contact must belong to a water company.");
  }
  if (!normalized.name && !normalized.email) {
    throw new Error("Contact requires a name or email.");
  }
  await createRecord(departmentId, WATER_COMPANY_CONTACTS_COLLECTION, id, normalized);
  await writeHydrantDamageAudit(departmentId, {
    action: draft.id ? "water_company_contact.updated" : "water_company_contact.created",
    entityType: "waterCompanyContact",
    entityId: id,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: normalized,
  });
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {string} contactId
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function deactivateWaterCompanyContact(departmentId, contactId, actor = {}) {
  const current = await getRecord(departmentId, WATER_COMPANY_CONTACTS_COLLECTION, contactId);
  if (!current) return null;
  const next = normalizeWaterCompanyContact({ ...current, active: false }, departmentId);
  await updateRecord(departmentId, WATER_COMPANY_CONTACTS_COLLECTION, contactId, next);
  await writeHydrantDamageAudit(departmentId, {
    action: "water_company_contact.deactivated",
    entityType: "waterCompanyContact",
    entityId: contactId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: next,
  });
  return next;
}
