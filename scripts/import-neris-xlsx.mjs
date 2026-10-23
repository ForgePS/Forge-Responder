/**
 * Import NERIS V1 official XLSX schemas into src/data/neris/modules.json and valueSets.json.
 *
 * Source files: src/data/neris/v1/core/*.xlsx and src/data/neris/v1/secondary/*.xlsx
 * Run: node scripts/import-neris-xlsx.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "src", "data", "neris");
const V1_CORE = path.join(OUT_DIR, "v1", "core");
const V1_SECONDARY = path.join(OUT_DIR, "v1", "secondary");

const MODULE_SHEET_RE = /^(core_mod_|mod_)/;
const TYPE_SHEET_RE = /^type_/;

const MODULE_WORKBOOKS = [
  { dir: V1_CORE, files: ["incident.xlsx", "dispatch.xlsx", "entity.xlsx", "shared.xlsx", "augmentation.xlsx"] },
  { dir: V1_SECONDARY, files: ["community_risk_reduction.xlsx", "health_and_safety.xlsx", "incident_analysis.xlsx"] },
];

const TYPE_FILE_WORKBOOKS = [
  { dir: V1_CORE, files: ["incident_type_files.xlsx", "shared_type_files.xlsx", "entity_type_files.xlsx"] },
  { dir: V1_SECONDARY, files: ["health_and_safety_type_files.xlsx", "incident_analysis_type_files.xlsx", "type_files_crr.xlsx"] },
];

function cellStr(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseBool(value) {
  const s = cellStr(value).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/** @param {import('xlsx').WorkSheet} sheet */
function sheetToRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

/** @param {import('xlsx').WorkSheet} sheet */
function parseModuleSheet(sheet, moduleId, sourceFile) {
  const rows = sheetToRows(sheet);
  const headerIdx = rows.findIndex((row) => cellStr(row[0]).toLowerCase() === "name");
  if (headerIdx < 0) return null;

  const headers = rows[headerIdx].map((h) => cellStr(h).toLowerCase());
  const fields = [];

  for (const row of rows.slice(headerIdx + 1)) {
    const name = cellStr(row[0]);
    if (!name || name.toLowerCase() === "name") continue;

    const properties = {};
    headers.forEach((header, i) => {
      if (!header || i === 0) return;
      const val = row[i];
      if (val === "" || val === undefined || val === null) return;
      if (typeof val === "boolean") {
        properties[header] = val ? "True" : "False";
      } else {
        properties[header] = cellStr(val);
      }
    });

    fields.push({ name, properties });
  }

  if (!fields.length) return null;
  return { id: moduleId, source: sourceFile, fields };
}

/** @param {import('xlsx').WorkSheet} sheet @param {string} setName */
function parseValueSetSheet(sheet, setName) {
  const rows = sheetToRows(sheet);
  const headerIdx = rows.findIndex((row) => cellStr(row[0]).toLowerCase() === "value");
  if (headerIdx < 0) return null;

  const headers = rows[headerIdx].map((h) => cellStr(h).toLowerCase());
  const valueIdx = 0;
  const activeIdx = headers.indexOf("active");
  const descIdxs = ["description_1", "description_2", "description_3"]
    .map((k) => headers.indexOf(k))
    .filter((i) => i >= 0);

  const options = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const value = cellStr(row[valueIdx]);
    if (!value) continue;
    if (activeIdx >= 0 && row[activeIdx] !== "" && !parseBool(row[activeIdx])) continue;

    const labelParts = descIdxs.map((i) => cellStr(row[i])).filter(Boolean);
    const label = labelParts.length ? labelParts.join(" — ") : value.replace(/_/g, " ").replace(/:/g, " — ");

    options.push({ value, label });
  }

  if (!options.length) return null;
  return { name: setName, options };
}

async function collectModules() {
  /** @type {Record<string, object>} */
  const modules = {};

  for (const { dir, files } of MODULE_WORKBOOKS) {
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        await fs.access(filePath);
      } catch {
        console.warn(`Skip missing workbook: ${filePath}`);
        continue;
      }

      const wb = XLSX.readFile(filePath);
      for (const sheetName of wb.SheetNames) {
        if (!MODULE_SHEET_RE.test(sheetName)) continue;
        const parsed = parseModuleSheet(wb.Sheets[sheetName], sheetName, `v1/${path.basename(dir)}/${file}#${sheetName}`);
        if (parsed) {
          modules[sheetName] = parsed;
          console.log(`  Module ${sheetName}: ${parsed.fields.length} fields (${file})`);
        }
      }
    }
  }

  return modules;
}

async function collectValueSets() {
  /** @type {Record<string, object>} */
  const valueSets = {};

  for (const { dir, files } of TYPE_FILE_WORKBOOKS) {
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        await fs.access(filePath);
      } catch {
        console.warn(`Skip missing type file: ${filePath}`);
        continue;
      }

      const wb = XLSX.readFile(filePath);
      for (const sheetName of wb.SheetNames) {
        if (!TYPE_SHEET_RE.test(sheetName)) continue;
        const parsed = parseValueSetSheet(wb.Sheets[sheetName], sheetName);
        if (parsed) {
          valueSets[sheetName] = parsed;
          console.log(`  Value set ${sheetName}: ${parsed.options.length} options (${file})`);
        }
      }
    }
  }

  return valueSets;
}

async function main() {
  console.log("Importing NERIS V1 XLSX schemas...\nModules:");
  const modules = await collectModules();
  console.log("\nValue sets:");
  const valueSets = await collectValueSets();

  await fs.mkdir(OUT_DIR, { recursive: true });

  const syncedAt = new Date().toISOString();
  const modulesOut = {
    syncedAt,
    source: "NERIS V1 XLSX (official Nov 2024)",
    moduleCount: Object.keys(modules).length,
    modules,
  };
  const valueSetsOut = {
    syncedAt,
    source: "NERIS V1 XLSX type files",
    valueSetCount: Object.keys(valueSets).length,
    valueSets,
  };

  await fs.writeFile(path.join(OUT_DIR, "modules.json"), JSON.stringify(modulesOut, null, 2));
  await fs.writeFile(path.join(OUT_DIR, "valueSets.json"), JSON.stringify(valueSetsOut, null, 2));

  console.log(`\nWrote ${Object.keys(modules).length} modules and ${Object.keys(valueSets).length} value sets.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
