import * as XLSX from "xlsx";
import { createEmptyPersonnelRecord } from "./personnelSchema.js";
import { normalizePersonnelRecord } from "./firestoreSanitize.js";

export const PERSONNEL_IMPORT_HEADERS = [
  "Last Name",
  "First Name",
  "Position/Rank",
  "Apparatus",
  "Station",
];

const HEADER_ALIASES = {
  lastName: ["last name", "lastname", "last", "surname", "lname"],
  firstName: ["first name", "firstname", "first", "given name", "fname"],
  rank: ["position/rank", "position / rank", "position", "rank", "title", "position rank"],
  apparatus: ["apparatus", "unit", "apparatus assignment", "assigned apparatus", "assignment"],
  station: ["station", "fire station", "location", "assigned station"],
};

function normalizeHeader(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function cellValue(row = [], index) {
  if (index === undefined || index < 0) return "";
  const value = row[index];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function mapHeaders(headers = []) {
  const mapping = {};
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
      if (mapping[field] !== undefined) return;
      if (aliases.includes(normalized) || normalized === field) {
        mapping[field] = index;
      }
    });
  });
  return mapping;
}

function derivePosition(rank = "") {
  const normalized = normalizeText(rank);
  if (!normalized) return "";
  if (/chief|captain|lieutenant|officer/.test(normalized)) return "Officer";
  if (/driver|operator/.test(normalized)) return "Driver";
  if (/firefighter|ff\b/.test(normalized)) return "Firefighter";
  if (/paramedic|emt|medic/.test(normalized)) return "Medic";
  return rank;
}

function personMatchKey(firstName = "", lastName = "") {
  return `${normalizeText(lastName)}|${normalizeText(firstName)}`;
}

export function nextPersonnelIds(existingRecords = [], count = 1) {
  const numbers = (Array.isArray(existingRecords) ? existingRecords : [])
    .map((person) => person?.id)
    .filter((id) => /^HL-\d+$/i.test(String(id)))
    .map((id) => parseInt(String(id).split("-")[1], 10));
  let max = numbers.length ? Math.max(...numbers) : 100;

  return Array.from({ length: count }, () => {
    max += 1;
    return `HL-${String(max).padStart(3, "0")}`;
  });
}

export function parsePersonnelImportRows(rows = []) {
  if (!rows.length) {
    return { rows: [], errors: ["The file is empty."], headerMap: {} };
  }

  const headerRowIndex = rows.findIndex((row) => (
    Array.isArray(row) && row.some((cell) => normalizeHeader(cell))
  ));
  if (headerRowIndex < 0) {
    return { rows: [], errors: ["Could not find a header row."], headerMap: {} };
  }

  const headerMap = mapHeaders(rows[headerRowIndex]);
  const missing = ["lastName", "firstName"].filter((field) => headerMap[field] === undefined);
  if (missing.length) {
    return {
      rows: [],
      errors: ["Missing required columns: Last Name and First Name."],
      headerMap,
    };
  }

  const parsed = [];
  const errors = [];

  rows.slice(headerRowIndex + 1).forEach((row, offset) => {
    if (!Array.isArray(row)) return;
    const lastName = cellValue(row, headerMap.lastName);
    const firstName = cellValue(row, headerMap.firstName);
    if (!lastName && !firstName) return;

    const rank = cellValue(row, headerMap.rank);
    const apparatus = cellValue(row, headerMap.apparatus);
    const station = cellValue(row, headerMap.station);
    const warnings = [];

    if (!lastName) warnings.push("Missing last name");
    if (!firstName) warnings.push("Missing first name");
    if (!rank) warnings.push("Missing position/rank");
    if (!apparatus) warnings.push("Missing apparatus");
    if (!station) warnings.push("Missing station");

    parsed.push({
      rowNumber: headerRowIndex + offset + 2,
      lastName,
      firstName,
      rank,
      apparatus,
      station,
      warnings,
    });
  });

  if (!parsed.length) {
    errors.push("No personnel rows found below the header row.");
  }

  return { rows: parsed, errors, headerMap };
}

export async function parsePersonnelSpreadsheet(file) {
  if (!file) {
    return { rows: [], errors: ["No file selected."], headerMap: {} };
  }

  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  if (!["xlsx", "xls", "csv"].includes(extension)) {
    return {
      rows: [],
      errors: ["Unsupported file type. Upload .xlsx, .xls, or .csv."],
      headerMap: {},
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { rows: [], errors: ["The workbook has no sheets."], headerMap: {} };
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    return parsePersonnelImportRows(rows);
  } catch (error) {
    console.error("Failed to parse personnel spreadsheet", error);
    return { rows: [], errors: ["Could not read the spreadsheet. Check the file and try again."], headerMap: {} };
  }
}

export function buildPersonnelImportPreview(importRows = [], existingRecords = []) {
  const existingByKey = new Map(
    (Array.isArray(existingRecords) ? existingRecords : []).map((person) => [
      personMatchKey(person.firstName, person.lastName),
      person,
    ])
  );

  return importRows.map((row) => {
    const key = personMatchKey(row.firstName, row.lastName);
    const existing = existingByKey.get(key);
    return {
      ...row,
      action: existing ? "update" : "create",
      existingId: existing?.id || "",
      displayName: [row.firstName, row.lastName].filter(Boolean).join(" "),
    };
  });
}

export function buildPersonnelRecordsFromImport(previewRows = [], existingRecords = []) {
  const records = Array.isArray(existingRecords) ? [...existingRecords] : [];
  const existingByKey = new Map(
    records.map((person) => [personMatchKey(person.firstName, person.lastName), person])
  );

  const createCount = previewRows.filter((row) => row.action === "create").length;
  const newIds = nextPersonnelIds(records, createCount);
  let newIdIndex = 0;
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;

  previewRows.forEach((row) => {
    const key = personMatchKey(row.firstName, row.lastName);
    const match = row.existingId
      ? records.find((person) => person.id === row.existingId) || existingByKey.get(key)
      : existingByKey.get(key);
    const apparatus = row.apparatus || match?.unit || "Unassigned";

    const record = normalizePersonnelRecord(
      match
        ? {
          ...match,
          firstName: row.firstName || match.firstName,
          lastName: row.lastName || match.lastName,
          rank: row.rank || match.rank || "Firefighter",
          position: derivePosition(row.rank || match.rank) || match.position || "Firefighter",
          unit: apparatus,
          assignment: apparatus,
          station: row.station || match.station || "Unassigned",
          updated_at: now,
        }
        : createEmptyPersonnelRecord({
          id: newIds[newIdIndex],
          firstName: row.firstName,
          lastName: row.lastName,
          rank: row.rank || "Firefighter",
          position: derivePosition(row.rank) || "Firefighter",
          unit: apparatus,
          assignment: apparatus,
          station: row.station || "Unassigned",
          status: "Active",
          employmentType: "Full Time",
          ems: "EMT",
          driver: "Not Approved",
          shift: "Unassigned",
          created_at: now,
          updated_at: now,
        })
    );

    if (match) {
      updated += 1;
      const index = records.findIndex((person) => person.id === match.id);
      if (index >= 0) records[index] = record;
      existingByKey.set(key, record);
      return;
    }

    newIdIndex += 1;
    created += 1;
    records.unshift(record);
    existingByKey.set(key, record);
  });

  return { records, created, updated };
}

export function downloadPersonnelImportTemplate(filename = "personnel-import-template.xlsx") {
  const worksheet = XLSX.utils.aoa_to_sheet([
    PERSONNEL_IMPORT_HEADERS,
    ["Tutor", "Adam", "Captain", "Engine 3", "Station 3"],
    ["Casey", "Cole", "Firefighter", "Engine 1", "Station 1"],
  ]);
  worksheet["!cols"] = PERSONNEL_IMPORT_HEADERS.map(() => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Personnel");
  XLSX.writeFile(workbook, filename);
}
