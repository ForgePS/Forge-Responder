import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import {
  CODE_SECTIONS_COLLECTION,
  CODE_SETS_COLLECTION,
  LOCAL_AMENDMENTS_COLLECTION,
} from "./paths.js";
import {
  STARTER_CODE_SECTIONS,
  STARTER_CODE_SET,
} from "./violationDefaults.js";

function nowIso() {
  return new Date().toISOString();
}

export function normalizeCodeSet(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled code set").trim(),
    publisher: data.publisher || "",
    edition: data.edition || "",
    effectiveDate: data.effectiveDate || "",
    expirationDate: data.expirationDate || "",
    jurisdiction: data.jurisdiction || "",
    adoptionOrdinance: data.adoptionOrdinance || "",
    adoptionDate: data.adoptionDate || "",
    sourceType: data.sourceType || "tenant_authored",
    authorizedLink: data.authorizedLink || "",
    notes: data.notes || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

export function normalizeCodeSection(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    codeSetId: data.codeSetId || "",
    chapter: data.chapter || "",
    section: data.section || "",
    subsection: data.subsection || "",
    title: data.title || "",
    shortInspectorSummary: data.shortInspectorSummary || "",
    tenantDescription: data.tenantDescription || "",
    authorizedExcerpt: data.authorizedExcerpt || "",
    sourceLink: data.sourceLink || "",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    defaultSeverity: data.defaultSeverity || "moderate",
    defaultCorrectionDays: Number.isFinite(Number(data.defaultCorrectionDays))
      ? Number(data.defaultCorrectionDays)
      : 14,
    defaultCorrectiveAction: data.defaultCorrectiveAction || "",
    localAmendmentId: data.localAmendmentId || "",
    codeNodeId: data.codeNodeId || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

export function normalizeLocalAmendment(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    codeSetId: data.codeSetId || "",
    codeSectionId: data.codeSectionId || "",
    codeNodeId: data.codeNodeId || "",
    title: data.title || "",
    ordinanceReference: data.ordinanceReference || "",
    summary: data.summary || "",
    effectiveDate: data.effectiveDate || "",
    expirationDate: data.expirationDate || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

export async function listCodeSets(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, CODE_SETS_COLLECTION);
  return rows.map((row) => normalizeCodeSet(row, departmentId));
}

export async function listCodeSections(departmentId, codeSetId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, CODE_SECTIONS_COLLECTION);
  return rows
    .map((row) => normalizeCodeSection(row, departmentId))
    .filter((row) => !codeSetId || row.codeSetId === codeSetId)
    .sort((a, b) => String(a.section).localeCompare(String(b.section), undefined, { numeric: true }));
}

export async function listLocalAmendments(departmentId, codeSetId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, LOCAL_AMENDMENTS_COLLECTION);
  return rows
    .map((row) => normalizeLocalAmendment(row, departmentId))
    .filter((row) => !codeSetId || row.codeSetId === codeSetId);
}

/**
 * Seed tenant-authored starter code library when empty.
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureCodeLibrarySeeded(departmentId, audit = {}) {
  if (!departmentId) return { codeSets: [], codeSections: [], amendments: [] };

  const existingSets = await listCodeSets(departmentId);
  if (existingSets.length) {
    const [codeSections, amendments] = await Promise.all([
      listCodeSections(departmentId),
      listLocalAmendments(departmentId),
    ]);
    return { codeSets: existingSets, codeSections, amendments };
  }

  const stamp = nowIso();
  const codeSet = normalizeCodeSet({
    ...STARTER_CODE_SET,
    departmentId,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, CODE_SETS_COLLECTION, codeSet.id, codeSet);

  const codeSections = [];
  for (const starter of STARTER_CODE_SECTIONS) {
    const section = normalizeCodeSection({
      ...starter,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, CODE_SECTIONS_COLLECTION, section.id, section);
    codeSections.push(section);
  }

  const amendment = normalizeLocalAmendment({
    id: "amd-egress-local",
    codeSetId: codeSet.id,
    codeSectionId: "sec-exits",
    title: "Local egress clearance reminder",
    ordinanceReference: "Local ordinance (configure)",
    summary: "Tenant may attach local amendment language here. Starter text is a placeholder only.",
    effectiveDate: stamp.slice(0, 10),
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, LOCAL_AMENDMENTS_COLLECTION, amendment.id, amendment);

  await writeInspectionAuditLog(departmentId, {
    action: "seed",
    recordId: "code-library",
    summary: "Seeded starter code library (tenant-authored summaries)",
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return { codeSets: [codeSet], codeSections, amendments: [amendment] };
}

export async function saveCodeSet(departmentId, record = {}, audit = {}) {
  const normalized = normalizeCodeSet(record, departmentId);
  if (!normalized.id) normalized.id = `codeset-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listCodeSets(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, CODE_SETS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, CODE_SETS_COLLECTION, normalized.id, normalized);
  await writeInspectionAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} code set ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

export async function saveCodeSection(departmentId, record = {}, audit = {}) {
  const normalized = normalizeCodeSection(record, departmentId);
  if (!normalized.id) normalized.id = `sec-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listCodeSections(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, CODE_SECTIONS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, CODE_SECTIONS_COLLECTION, normalized.id, normalized);
  await writeInspectionAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} code section ${normalized.section}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

export async function saveLocalAmendment(departmentId, record = {}, audit = {}) {
  const normalized = normalizeLocalAmendment(record, departmentId);
  if (!normalized.id) normalized.id = `amd-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listLocalAmendments(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, LOCAL_AMENDMENTS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, LOCAL_AMENDMENTS_COLLECTION, normalized.id, normalized);
  await writeInspectionAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} local amendment ${normalized.title}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

export function searchCodeSections(sections = [], query = "") {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return sections;
  return sections.filter((row) => {
    const haystack = [
      row.section,
      row.subsection,
      row.chapter,
      row.title,
      row.shortInspectorSummary,
      row.tenantDescription,
      ...(row.tags || []),
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}
