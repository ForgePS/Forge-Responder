import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { sanitizeForFirestore } from "./firestoreSanitize.js";
import { ensureHydrantImportAccess } from "./hydrantImportAccess.js";
import { hydrantFirebaseDocId, loadStaticHydrants, mergeHydrantRecord, buildHydrantImportLookup, applyImportedHydrantUpdatesLocally, syncImportedActivityLocally, finalizeHydrantRecord } from "./hydrantTenantService.js";
import { parseCsvRows, compactHydrantImportFields, stripImportBom, expandPackedCsvRow } from "./hydrantImport.js";
import { inspectionStatusPatch, buildFlowTestStatusPatch } from "./hydrantStatusSync.js";

export const HYDRANT_ACTIVITY_TEMPLATE_HEADERS = [
  "record_type",
  "hydrant_id",
  "location_id",
  "district",
  "date",
  "time",
  "tested_by",
  "shift",
  "status",
  "discharge_size",
  "pitot_psi",
  "static_psi",
  "residual_psi",
  "flow_gpm",
  "flow_result",
  "nfpa_class",
  "notes",
  "repair_needed",
];

const FIELD_ALIASES = {
  record_type: ["record_type", "record type", "type", "activity_type", "activity type", "flow test", "flowtest"],
  hydrant_id: ["hydrant_id", "hydrant id", "hydrant"],
  location_id: ["location_id", "location id", "objectid", "arcgis_objectid"],
  district: ["district", "hydrant district", "zone"],
  date: ["date", "test date", "tested_date", "tested date", "inspected_date", "inspected date"],
  time: ["time", "test time", "tested_time", "tested time"],
  tested_by: ["tested_by", "tested by", "completed_by", "completed by", "checked_by", "checked by", "user"],
  shift: ["shift", "tested_shift", "tested shift"],
  status: ["status", "hydrant status"],
  discharge_size: ["discharge_size", "discharge size", "outlet size", "discharge"],
  pitot_psi: ["pitot_psi", "pitot psi", "pitot"],
  static_psi: ["static_psi", "static psi", "static"],
  residual_psi: ["residual_psi", "residual psi", "residual"],
  flow_gpm: ["flow_gpm", "flow gpm", "gpm", "calculated_gpm", "calculated gpm"],
  flow_result: ["flow_result", "flow result", "nfpa code", "class code"],
  nfpa_class: ["nfpa_class", "nfpa class", "class"],
  notes: ["notes", "note", "remarks", "activity", "inspection notes"],
  repair_needed: ["repair_needed", "repair needed", "repair"],
};

function clean(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resolveFieldKey(header) {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
      return field;
    }
  }
  return normalized.replace(/\s+/g, "_");
}

function nfpaClassForGpm(gpm) {
  const n = Number(gpm);
  if (!Number.isFinite(n) || n <= 0) return "Not Tested";
  if (n >= 1500) return "Class AA";
  if (n >= 1000) return "Class A";
  if (n >= 500) return "Class B";
  return "Class C";
}

function flowCodeForGpm(gpm) {
  const label = nfpaClassForGpm(gpm);
  if (label === "Class AA") return "B";
  if (label === "Class A") return "G";
  if (label === "Class B") return "O";
  if (label === "Class C") return "R";
  return "UK";
}

function nfpaColorNameForClass(className) {
  if (className === "Class AA") return "Blue";
  if (className === "Class A") return "Green";
  if (className === "Class B") return "Orange";
  if (className === "Class C") return "Red";
  return "";
}

function calculateFlowGpm(dischargeSize, pitotPsi) {
  const diameter = Number(dischargeSize);
  const pitot = Number(pitotPsi);
  if (!Number.isFinite(diameter) || !Number.isFinite(pitot) || pitot <= 0) return "";
  return Math.round(29.83 * 0.9 * diameter ** 2 * Math.sqrt(pitot));
}

function normalizeFlowResult(value, gpm) {
  const code = clean(value).toUpperCase();
  if (["B", "G", "O", "R", "OOS", "UK"].includes(code)) return code;
  if (code === "CLASS AA" || code === "AA") return "B";
  if (code === "CLASS A" || code === "A") return "G";
  if (code === "CLASS B") return "O";
  if (code === "CLASS C" || code === "C") return "R";
  return flowCodeForGpm(gpm);
}

function buildTimestamp(date, time) {
  const datePart = clean(date) || new Date().toISOString().slice(0, 10);
  const timePart = clean(time) || "12:00";
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(timePart) ? `${timePart}:00` : timePart;
  const parsed = new Date(`${datePart}T${normalizedTime}`);
  if (Number.isNaN(parsed.getTime())) {
    return `${datePart}T12:00:00.000Z`;
  }
  return parsed.toISOString();
}

function mapRow(values, headers) {
  const raw = {};
  headers.forEach((header, index) => {
    if (!header) return;
    raw[header] = clean(values[index]);
  });
  return raw;
}

function normalizeRecordType(value, mapped = {}) {
  const normalized = clean(value).toLowerCase();
  if (normalized.includes("flow")) return "flow";
  if (normalized.includes("inspect")) return "inspection";
  if (mapped.pitot_psi || mapped.static_psi || mapped.residual_psi || mapped.discharge_size) {
    return "flow";
  }
  if (mapped.repair_needed) return "inspection";
  return "";
}

function parseImportDate(dateValue = "", timeValue = "") {
  const datePart = clean(dateValue);
  const timePart = clean(timeValue) || "12:00";
  if (!datePart) return new Date().toISOString();

  const slashMatch = datePart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    const normalizedTime = /^\d{1,2}:\d{2}$/.test(timePart) ? `${timePart}:00` : timePart;
    const parsed = new Date(`${year}-${month}-${day}T${normalizedTime}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return buildTimestamp(datePart, timePart);
}

function mapActivityFields(raw = {}) {
  const mapped = {};
  Object.entries(raw || {}).forEach(([key, value]) => {
    const cleaned = clean(value);
    if (!cleaned) return;
    const field = resolveFieldKey(stripImportBom(key));
    if (!field) return;
    mapped[field] = cleaned;
  });
  return mapped;
}

const ACTIVITY_HEADER_HINTS = [
  "record type",
  "record_type",
  "hydrant id",
  "hydrant_id",
  "pitot psi",
  "pitot_psi",
  "flow gpm",
  "flow_gpm",
  "repair needed",
  "repair_needed",
];

const CONTACT_HEADER_HINTS = [
  "first name",
  "last name",
  "company name",
  "e mail address",
  "email address",
  "address line 1",
  "work phone",
  "home phone",
];

export function diagnoseActivityImportFormat(headers = [], fileName = "") {
  const normalized = headers
    .map((header) => normalizeHeader(stripImportBom(header)))
    .filter(Boolean);
  const hasActivityHeaders = normalized.some((header) => (
    ACTIVITY_HEADER_HINTS.some((hint) => header.includes(hint.replace(/_/g, " ")) || header === hint.replace(/_/g, " "))
  ));

  if (hasActivityHeaders) {
    return null;
  }

  const lowerName = String(fileName || "").toLowerCase();
  const looksLikeContacts = normalized.some((header) => (
    CONTACT_HEADER_HINTS.some((hint) => header.includes(hint))
  )) || /address|contact|office|email|outlook|phone book|senate/i.test(lowerName);

  if (looksLikeContacts) {
    return "This file looks like a contact or address list, not hydrant flow tests or inspections. Use your flow test spreadsheet, or download the activity import template from Sync / Import.";
  }

  return "This file is missing required columns such as record_type and hydrant_id. Download the activity import template from Sync / Import and match that header row.";
}

export function normalizeActivityRow(raw = {}, rowNumber = 0) {
  const mapped = mapActivityFields(raw);

  const recordType = normalizeRecordType(mapped.record_type, mapped);
  const hydrantId = mapped.hydrant_id;
  const locationId = mapped.location_id || hydrantId;
  if (!recordType) {
    return { error: "Missing or unsupported record_type. Use Flow Test or Inspection." };
  }
  if (!hydrantId && !locationId) {
    return { error: "Missing hydrant_id or location_id." };
  }

  const testedAt = parseImportDate(mapped.date, mapped.time);
  const dischargeSize = mapped.discharge_size || "2.5";
  const calculatedFlow = mapped.flow_gpm || calculateFlowGpm(dischargeSize, mapped.pitot_psi);
  const status = mapped.status || "In Service";
  const computedClass = status.toLowerCase().includes("out")
    ? "Out of Service"
    : (mapped.nfpa_class || nfpaClassForGpm(calculatedFlow));
  const flowCode = status.toLowerCase().includes("out")
    ? "OOS"
    : normalizeFlowResult(mapped.flow_result, calculatedFlow);
  const id = hydrantFirebaseDocId(
    recordType,
    locationId || hydrantId,
    hydrantId || locationId,
    testedAt
  );

  const base = {
    rowNumber,
    recordType,
    hydrant_id: hydrantId || locationId,
    location_id: locationId || hydrantId,
    district: mapped.district || "",
    tested_at: testedAt,
    tested_by: mapped.tested_by || "",
    shift: mapped.shift || "",
    notes: mapped.notes || "",
    created_at: new Date().toISOString(),
  };

  if (recordType === "flow") {
    return {
      record: {
        ...base,
        id,
        type: "Flow Test",
        status,
        discharge_size: dischargeSize,
        pitot_psi: mapped.pitot_psi || "",
        static_psi: mapped.static_psi || "",
        residual_psi: mapped.residual_psi || "",
        flow_gpm: calculatedFlow,
        flow_result: flowCode,
        nfpa_class: computedClass,
        nfpa_color: nfpaColorNameForClass(computedClass),
      },
    };
  }

  return {
    record: {
      ...base,
      id,
      type: "Inspection",
      status,
      repair_needed: /^yes$/i.test(mapped.repair_needed) ? "Yes" : "No",
      inspected_at: testedAt,
      checklist: [{
        item: "Bulk Import Summary",
        result: /^yes$/i.test(mapped.repair_needed) ? "No" : "Yes",
        notes: mapped.notes || "Imported inspection summary.",
        repair_needed: /^yes$/i.test(mapped.repair_needed) ? "Yes" : "No",
        photo_name: "",
      }],
    },
  };
}

export function parseHydrantActivityCsv(text = "", options = {}) {
  const fileName = options.fileName || "";
  const rows = parseCsvRows(stripImportBom(text)).map(expandPackedCsvRow);
  if (!rows.length) {
    return { records: [], errors: ["CSV file is empty."] };
  }

  const headerRow = expandPackedCsvRow(rows[0]);
  const headers = headerRow.map((header) => resolveFieldKey(stripImportBom(header)));
  const records = [];
  const errors = [];

  rows.slice(1).forEach((values, index) => {
    const normalized = normalizeActivityRow(mapRow(expandPackedCsvRow(values), headers), index + 2);
    if (normalized.error) {
      errors.push(`Row ${index + 2}: ${normalized.error}`);
      return;
    }
    records.push(normalized.record);
  });

  const hint = records.length ? null : diagnoseActivityImportFormat(headerRow, fileName);

  return { records, errors, hint, format: "csv" };
}

export function summarizeHydrantActivityImport(records = []) {
  const flowTests = records.filter((record) => record.recordType === "flow").length;
  const inspections = records.filter((record) => record.recordType === "inspection").length;
  const hydrants = new Set(records.map((record) => hydrantFirebaseDocId(record.location_id, record.hydrant_id)));
  return {
    total: records.length,
    flowTests,
    inspections,
    hydrants: hydrants.size,
  };
}

export function buildHydrantActivityImportTemplateCsv() {
  const samples = [
    {
      record_type: "Flow Test",
      hydrant_id: "HL 1000",
      location_id: "31467975",
      district: "1",
      date: "2026-06-15",
      time: "08:30",
      tested_by: "Jeremy Powell",
      shift: "A Shift",
      status: "In Service",
      discharge_size: "2.5",
      pitot_psi: "29",
      static_psi: "82",
      residual_psi: "61",
      flow_gpm: "1628",
      flow_result: "B",
      nfpa_class: "Class AA",
      notes: "Annual flow test",
      repair_needed: "",
    },
    {
      record_type: "Inspection",
      hydrant_id: "HL 1000",
      location_id: "31467975",
      district: "1",
      date: "2026-06-15",
      time: "09:15",
      tested_by: "Jeremy Powell",
      shift: "A Shift",
      status: "In Service",
      discharge_size: "",
      pitot_psi: "",
      static_psi: "",
      residual_psi: "",
      flow_gpm: "",
      flow_result: "",
      nfpa_class: "",
      notes: "Caps present; no leaks; area clear",
      repair_needed: "No",
    },
    {
      record_type: "Flow Test",
      hydrant_id: "HL 1008",
      location_id: "31467974",
      district: "1",
      date: "2026-06-16",
      time: "10:00",
      tested_by: "Adam Tutor",
      shift: "B Shift",
      status: "In Service",
      discharge_size: "2.5",
      pitot_psi: "22",
      static_psi: "75",
      residual_psi: "58",
      flow_gpm: "985",
      flow_result: "O",
      nfpa_class: "Class B",
      notes: "Good flow",
      repair_needed: "",
    },
    {
      record_type: "Inspection",
      hydrant_id: "HL 1086",
      location_id: "31468052",
      district: "3",
      date: "2026-06-16",
      time: "14:20",
      tested_by: "Stephen White",
      shift: "C Shift",
      status: "Needs Repair",
      discharge_size: "",
      pitot_psi: "",
      static_psi: "",
      residual_psi: "",
      flow_gpm: "",
      flow_result: "",
      nfpa_class: "",
      notes: "Operating nut stiff; follow-up needed",
      repair_needed: "Yes",
    },
  ];

  const headerLine = HYDRANT_ACTIVITY_TEMPLATE_HEADERS.join(",");
  const valueLines = samples.map((sample) => HYDRANT_ACTIVITY_TEMPLATE_HEADERS
    .map((header) => `"${String(sample[header] ?? "").replaceAll('"', '""')}"`)
    .join(","));
  return `${headerLine}\n${valueLines.join("\n")}\n`;
}

function buildHydrantPatch(record) {
  const checkedDate = record.tested_at.slice(0, 10);
  const checkedYear = record.tested_at.slice(0, 4);
  const patch = {
    location_id: record.location_id,
    hydrant_id: record.hydrant_id,
    last_checked: checkedDate,
    checked_year: checkedYear,
    checked_status: "Checked",
    checked_by: record.tested_by,
    checked_shift: record.shift,
    updated_at: new Date().toISOString(),
    import_source: "Hydrant activity CSV import",
  };

  if (clean(record.district)) patch.district = record.district;
  if (clean(record.status)) patch.status = record.status;

  if (record.recordType === "flow") {
    const numericGpm = Number(record.flow_gpm) || calculateFlowGpm(record.discharge_size, record.pitot_psi);
    const synced = buildFlowTestStatusPatch(
      {},
      { status: record.status || "In Service", notes: record.notes || "" },
      {
        discharge_size: record.discharge_size || "2.5",
        pitot_psi: record.pitot_psi || "",
        static_psi: record.static_psi || "",
        residual_psi: record.residual_psi || "",
        flow_result: record.flow_result || "",
        nfpa_class: record.nfpa_class || "",
        status: record.status || "In Service",
      },
      numericGpm
    );

    return compactHydrantImportFields({
      ...patch,
      checked_source: "Flow Test",
      discharge_size: record.discharge_size || "",
      pitot_psi: record.pitot_psi || "",
      static_psi: record.static_psi || "",
      residual_psi: record.residual_psi || "",
      flow_gpm: numericGpm || synced.flow_gpm || "",
      status: synced.status,
      flow_result: synced.flow_result,
      nfpa_class: synced.nfpa_class,
      nfpa_color: synced.nfpa_color,
      notes: record.notes || "",
    }, {
      alwaysInclude: ["location_id", "hydrant_id", "last_checked", "checked_year", "checked_status", "checked_by", "checked_shift", "checked_source"],
    });
  }

  const inspectionPatch = {
    ...patch,
    checked_source: "Inspection",
  };
  if (clean(record.notes)) inspectionPatch.notes = record.notes;

  const checklist = Array.isArray(record.checklist) ? record.checklist : [];
  const statusFields = inspectionStatusPatch(
    { ...inspectionPatch, status: record.status || inspectionPatch.status || "In Service" },
    checklist
  );

  return compactHydrantImportFields({
    ...inspectionPatch,
    ...statusFields,
  }, {
    alwaysInclude: ["location_id", "hydrant_id", "last_checked", "checked_year", "checked_status", "checked_by", "checked_shift", "checked_source"],
  });
}

const BATCH_SIZE = 150;
const WRITES_PER_RECORD = 3;
const MAX_BATCH_WRITES = 450;

export async function importHydrantActivityToTenant(departmentId, records = [], options = {}) {
  const { onProgress } = options;
  const db = getFirestoreDb();
  if (!db || !departmentId) {
    throw new Error("Firebase is not available for activity import.");
  }
  if (!records.length) {
    throw new Error("No activity records to import.");
  }

  await ensureHydrantImportAccess(departmentId);

  const [existingSnap, staticHydrants] = await Promise.all([
    getDocs(collection(db, "departments", departmentId, "hydrants")),
    loadStaticHydrants(departmentId),
  ]);
  const lookup = buildHydrantImportLookup(staticHydrants);
  existingSnap.docs.forEach((item) => {
    const data = item.data();
    lookup.registerHydrant(mergeHydrantRecord({}, { id: item.id, ...data }));
  });

  let imported = 0;
  const hydrantPatches = new Map();
  let batch = writeBatch(db);
  let batchWrites = 0;

  async function commitBatch(force = false) {
    if (!batchWrites) return;
    if (!force && batchWrites < MAX_BATCH_WRITES) return;
    await batch.commit();
    batch = writeBatch(db);
    batchWrites = 0;
  }

  for (const record of records) {
    const resolved = lookup.resolve(record);
    const existing = resolved.hydrant || {
      location_id: record.location_id,
      hydrant_id: record.hydrant_id,
    };
    const canonicalRecord = {
      ...record,
      location_id: existing.location_id || record.location_id,
      hydrant_id: existing.hydrant_id || record.hydrant_id,
    };
    const hydrantPatch = buildHydrantPatch(canonicalRecord);
    const mergedHydrant = finalizeHydrantRecord(existing, hydrantPatch);
    const hydrantDocId = hydrantFirebaseDocId(mergedHydrant.location_id, mergedHydrant.hydrant_id);
    const hydrantPayload = sanitizeForFirestore({
      ...mergedHydrant,
      departmentId,
    });

    batch.set(doc(db, "departments", departmentId, "hydrants", hydrantDocId), hydrantPayload, { merge: true });
    batchWrites += 1;

    if (record.recordType === "flow") {
      batch.set(doc(db, "departments", departmentId, "hydrantFlowTests", record.id), sanitizeForFirestore({
        ...canonicalRecord,
        departmentId,
      }), { merge: true });
    } else {
      batch.set(doc(db, "departments", departmentId, "hydrantInspections", record.id), sanitizeForFirestore({
        ...canonicalRecord,
        departmentId,
      }), { merge: true });
    }
    batchWrites += 1;

    batch.set(doc(db, "departments", departmentId, "dailyActivity", record.id), sanitizeForFirestore({
      ...canonicalRecord,
      departmentId,
    }), { merge: true });
    batchWrites += 1;

    hydrantPatches.set(hydrantDocId, mergedHydrant);
    lookup.registerHydrant(mergedHydrant);
    imported += 1;

    if (batchWrites + WRITES_PER_RECORD > MAX_BATCH_WRITES) {
      await commitBatch(true);
    }
    if (imported % BATCH_SIZE === 0 || imported === records.length) {
      onProgress?.({ imported, total: records.length });
    }
  }

  await commitBatch(true);

  const mergedHydrants = [...hydrantPatches.values()];
  applyImportedHydrantUpdatesLocally(departmentId, mergedHydrants);
  syncImportedActivityLocally(departmentId, records);

  return {
    imported,
    total: records.length,
    hydrantsUpdated: hydrantPatches.size,
    mergedHydrants,
  };
}

export async function parseHydrantActivityImportFile(file) {
  if (!file) {
    return { records: [], errors: ["No file selected."] };
  }
  const text = await file.text();
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".csv") || file.type.includes("csv") || file.type.includes("text")) {
    return parseHydrantActivityCsv(text, { fileName: file.name || "" });
  }
  return parseHydrantActivityCsv(text, { fileName: file.name || "" });
}
