import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { listOccupancyRecords, saveOccupancyRecord } from "./occupancyService.js";
import { createViolation, listViolations } from "./violationService.js";
import { getImportRecordTypes } from "./hardeningDefaults.js";
import { INSPECTION_IMPORT_BATCHES_COLLECTION } from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "IMP") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function normalizeHeader(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Minimal CSV parser supporting quoted fields.
 */
export function parseCsvText(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text || "").replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        i += 1;
      } else if (ch === "\"") {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);

  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((value) => normalizeHeader(value));
  const records = rows.slice(1).map((values, index) => {
    const record = { __row: index + 2 };
    headers.forEach((header, headerIndex) => {
      if (!header) return;
      record[header] = String(values[headerIndex] ?? "").trim();
    });
    return record;
  });
  return { headers, records };
}

export function suggestColumnMapping(headers = [], recordTypeId = "occupancies") {
  const type = getImportRecordTypes().find((row) => row.id === recordTypeId);
  const fields = [...(type?.requiredColumns || []), ...(type?.optionalColumns || [])];
  const mapping = {};
  for (const field of fields) {
    const match = headers.find((header) => header === field
      || header === field.replace(/([A-Z])/g, "_$1").toLowerCase()
      || header.replace(/_/g, "") === field.toLowerCase());
    if (match) mapping[field] = match;
  }
  // common aliases
  if (!mapping.name) mapping.name = headers.find((h) => ["occupancy", "business", "property"].includes(h)) || "";
  if (!mapping.address) mapping.address = headers.find((h) => ["street", "addr", "location"].includes(h)) || "";
  if (!mapping.externalId) mapping.externalId = headers.find((h) => ["id", "legacy_id", "source_id", "external_id"].includes(h)) || "";
  if (!mapping.description) mapping.description = headers.find((h) => ["violation", "notes", "summary"].includes(h)) || "";
  if (!mapping.codeCitation) mapping.codeCitation = headers.find((h) => ["code", "citation", "section"].includes(h)) || "";
  return mapping;
}

function mapRecord(raw, mapping = {}) {
  const out = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (!header) continue;
    out[field] = raw[header] ?? "";
  }
  out.__row = raw.__row;
  return out;
}

export function normalizeImportBatch(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    recordType: data.recordType || "occupancies",
    fileName: data.fileName || "",
    status: data.status || "preview",
    mapping: data.mapping && typeof data.mapping === "object" ? { ...data.mapping } : {},
    createdCount: Number(data.createdCount) || 0,
    updatedCount: Number(data.updatedCount) || 0,
    skippedCount: Number(data.skippedCount) || 0,
    errorCount: Number(data.errorCount) || 0,
    errors: Array.isArray(data.errors) ? data.errors : [],
    createdIds: Array.isArray(data.createdIds) ? data.createdIds : [],
    updatedIds: Array.isArray(data.updatedIds) ? data.updatedIds : [],
    reconciliation: data.reconciliation && typeof data.reconciliation === "object"
      ? { ...data.reconciliation }
      : {},
    rolledBack: Boolean(data.rolledBack),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function validateImportRows(recordTypeId, rows = [], mapping = {}) {
  const type = getImportRecordTypes().find((row) => row.id === recordTypeId);
  if (!type) throw new Error("Unknown import record type.");
  const errors = [];
  const preview = [];

  for (const raw of rows) {
    const mapped = mapRecord(raw, mapping);
    const rowErrors = [];
    for (const required of type.requiredColumns) {
      if (!String(mapped[required] || "").trim()) {
        rowErrors.push(`Missing required field: ${required}`);
      }
    }
    if (recordTypeId === "occupancies" && mapped.name && mapped.address) {
      preview.push(mapped);
    } else if (recordTypeId === "violations" && mapped.description) {
      preview.push(mapped);
    } else if (!rowErrors.length) {
      preview.push(mapped);
    }
    if (rowErrors.length) {
      errors.push({ row: mapped.__row, messages: rowErrors, record: mapped });
    }
  }

  return {
    validCount: preview.length,
    errorCount: errors.length,
    errors: errors.slice(0, 100),
    preview: preview.slice(0, 50),
    totalRows: rows.length,
  };
}

function occupancyKey(row = {}) {
  if (row.externalId) return `ext:${String(row.externalId).toLowerCase()}`;
  return `name:${String(row.name || "").toLowerCase()}|${String(row.address || "").toLowerCase()}`;
}

/**
 * Preview import without writing.
 */
export async function previewInspectionImport(departmentId, input = {}) {
  const recordType = input.recordType || "occupancies";
  const parsed = typeof input.csvText === "string"
    ? parseCsvText(input.csvText)
    : { headers: input.headers || [], records: input.records || [] };
  const mapping = input.mapping && Object.keys(input.mapping).length
    ? input.mapping
    : suggestColumnMapping(parsed.headers, recordType);
  const validation = validateImportRows(recordType, parsed.records, mapping);

  let duplicateHints = 0;
  if (recordType === "occupancies") {
    const existing = await listOccupancyRecords(departmentId);
    const keys = new Set(existing.map((row) => occupancyKey(row)));
    for (const row of validation.preview) {
      if (keys.has(occupancyKey(row))) duplicateHints += 1;
    }
  }

  return {
    headers: parsed.headers,
    mapping,
    validation,
    duplicateHints,
    recordType,
  };
}

/**
 * Commit CSV import and store reconciliation batch.
 */
export async function commitInspectionImport(departmentId, input = {}, actor = {}) {
  const recordType = input.recordType || "occupancies";
  const parsed = parseCsvText(input.csvText || "");
  const mapping = input.mapping || suggestColumnMapping(parsed.headers, recordType);
  const validation = validateImportRows(recordType, parsed.records, mapping);
  if (!validation.validCount) {
    throw new Error("No valid rows to import. Fix validation errors first.");
  }

  const stamp = nowIso();
  const batchId = newId("IMP");
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const errors = [...validation.errors];
  const createdIds = [];
  const updatedIds = [];

  if (recordType === "occupancies") {
    const existing = await listOccupancyRecords(departmentId);
    const byKey = new Map(existing.map((row) => [occupancyKey(row), row]));
    for (const raw of parsed.records) {
      const mapped = mapRecord(raw, mapping);
      if (!mapped.name || !mapped.address) {
        skippedCount += 1;
        continue;
      }
      try {
        const key = occupancyKey(mapped);
        const prior = byKey.get(key);
        if (prior && input.duplicateMode === "skip") {
          skippedCount += 1;
          continue;
        }
        const payload = {
          ...(prior || {}),
          id: prior?.id || "",
          name: mapped.name,
          address: mapped.address,
          city: mapped.city || prior?.city || "",
          state: mapped.state || prior?.state || "",
          zip: mapped.zip || prior?.zip || "",
          occupancyType: mapped.occupancyType || prior?.occupancyType || "Business",
          hazard: mapped.hazard || prior?.hazard || "Low",
          status: mapped.status || prior?.status || "Active",
          notes: mapped.externalId
            ? `${prior?.notes || ""}${prior?.notes ? "\n" : ""}externalId=${mapped.externalId}`.trim()
            : (prior?.notes || ""),
        };
        const saved = await saveOccupancyRecord(departmentId, payload, {
          ...actor,
          isNew: !prior,
        });
        if (prior) {
          updatedCount += 1;
          updatedIds.push(saved.id);
        } else {
          createdCount += 1;
          createdIds.push(saved.id);
          byKey.set(key, saved);
        }
      } catch (error) {
        errors.push({ row: mapped.__row, messages: [error?.message || "Import failed"], record: mapped });
      }
    }
  } else if (recordType === "violations") {
    const occupancies = await listOccupancyRecords(departmentId);
    const byName = new Map(occupancies.map((row) => [String(row.name || "").toLowerCase(), row]));
    for (const raw of parsed.records) {
      const mapped = mapRecord(raw, mapping);
      if (!mapped.description) {
        skippedCount += 1;
        continue;
      }
      try {
        const occupancy = mapped.occupancyId
          ? occupancies.find((row) => row.id === mapped.occupancyId)
          : byName.get(String(mapped.occupancyName || "").toLowerCase());
        if (!occupancy && input.requireOccupancy !== false) {
          errors.push({
            row: mapped.__row,
            messages: ["Occupancy not found for violation row"],
            record: mapped,
          });
          continue;
        }
        const created = await createViolation(departmentId, {
          name: mapped.description.slice(0, 120),
          description: mapped.description,
          codeCitation: mapped.codeCitation || "",
          severity: mapped.severity || "moderate",
          status: mapped.status || "open",
          dueAt: mapped.dueAt || "",
          occupancyId: occupancy?.id || mapped.occupancyId || "",
          occupancyName: occupancy?.name || mapped.occupancyName || "",
          address: occupancy?.address || "",
        }, actor);
        createdCount += 1;
        createdIds.push(created.id);
      } catch (error) {
        errors.push({ row: mapped.__row, messages: [error?.message || "Import failed"], record: mapped });
      }
    }
  } else {
    throw new Error(`Unsupported import type: ${recordType}`);
  }

  const batch = normalizeImportBatch({
    id: batchId,
    recordType,
    fileName: input.fileName || "import.csv",
    status: "committed",
    mapping,
    createdCount,
    updatedCount,
    skippedCount,
    errorCount: errors.length,
    errors: errors.slice(0, 100),
    createdIds: createdIds.slice(0, 500),
    updatedIds: updatedIds.slice(0, 500),
    reconciliation: {
      sourceRows: parsed.records.length,
      validRows: validation.validCount,
      createdCount,
      updatedCount,
      skippedCount,
      errorCount: errors.length,
      committedAt: stamp,
    },
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTION_IMPORT_BATCHES_COLLECTION, batchId, batch);
  await writeInspectionAuditLog(departmentId, {
    action: "import.commit",
    entityType: "import_batch",
    entityId: batchId,
    summary: `Imported ${recordType}: +${createdCount} ~${updatedCount} skip ${skippedCount} err ${errors.length}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });

  return batch;
}

export async function listInspectionImportBatches(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_IMPORT_BATCHES_COLLECTION);
  return rows
    .map((row) => normalizeImportBatch(row, departmentId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Soft rollback flag + notes. Does not delete created records automatically (safety).
 */
export async function markImportBatchRolledBack(departmentId, batchId, actor = {}) {
  const existing = normalizeImportBatch(
    await getRecord(departmentId, INSPECTION_IMPORT_BATCHES_COLLECTION, batchId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Import batch not found.");
  const stamp = nowIso();
  const next = normalizeImportBatch({
    ...existing,
    rolledBack: true,
    status: "rolled_back_flagged",
    updatedAt: stamp,
    reconciliation: {
      ...existing.reconciliation,
      rollbackFlaggedAt: stamp,
      rollbackNote: "Flagged for manual cleanup — automatic delete disabled for safety.",
    },
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_IMPORT_BATCHES_COLLECTION, batchId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "import.rollback_flag",
    entityType: "import_batch",
    entityId: batchId,
    summary: `Flagged import batch ${batchId} for rollback review`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return next;
}

export function buildOccupancyImportTemplateCsv() {
  const type = getImportRecordTypes().find((row) => row.id === "occupancies");
  return `${type.sampleHeaders}\nSample Business,123 Main St,Town,ST,00000,Business,Low,Active,LEGACY-001\n`;
}

export function buildViolationImportTemplateCsv() {
  const type = getImportRecordTypes().find((row) => row.id === "violations");
  return `${type.sampleHeaders}\nBlocked exit,Sample Business,IFC 1031.2,high,open,2026-08-01,VIO-LEGACY-1\n`;
}

export function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Lightweight data reconciliation snapshot across prevention collections. */
export async function runInspectionDataReconciliation(departmentId) {
  const [occupancies, inspections, violations] = await Promise.all([
    listOccupancyRecords(departmentId),
    listRecords(departmentId, "inspections"),
    listViolations(departmentId),
  ]);

  const occupancyIds = new Set(occupancies.map((row) => row.id));
  const orphanInspections = inspections.filter((row) => row.occupancyId && !occupancyIds.has(row.occupancyId));
  const orphanViolations = violations.filter((row) => row.occupancyId && !occupancyIds.has(row.occupancyId));
  const duplicateOccupancyKeys = [];
  const seen = new Map();
  for (const row of occupancies) {
    const key = occupancyKey(row);
    if (seen.has(key)) duplicateOccupancyKeys.push(key);
    else seen.set(key, row.id);
  }

  return {
    generatedAt: nowIso(),
    counts: {
      occupancies: occupancies.length,
      inspections: inspections.length,
      violations: violations.length,
    },
    issues: {
      orphanInspections: orphanInspections.length,
      orphanViolations: orphanViolations.length,
      duplicateOccupancyKeys: duplicateOccupancyKeys.length,
    },
    samples: {
      orphanInspectionIds: orphanInspections.slice(0, 10).map((row) => row.id),
      orphanViolationIds: orphanViolations.slice(0, 10).map((row) => row.id),
      duplicateKeys: duplicateOccupancyKeys.slice(0, 10),
    },
  };
}
