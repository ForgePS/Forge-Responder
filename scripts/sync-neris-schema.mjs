/**
 * Sync NERIS schemas into src/data/neris/.
 *
 * Prefers local NERIS V1 XLSX files when present (scripts/import-neris-xlsx.mjs).
 * Falls back to ulfsri/neris-framework GitHub YAML/CSV.
 *
 * Run: node scripts/sync-neris-schema.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "src", "data", "neris");
const V1_CORE_DIR = path.join(OUT_DIR, "v1", "core");
const RAW_BASE = "https://raw.githubusercontent.com/ulfsri/neris-framework/main";

async function hasLocalV1Schemas() {
  try {
    const entries = await fs.readdir(V1_CORE_DIR);
    return entries.some((name) => name.endsWith(".xlsx"));
  } catch {
    return false;
  }
}

function runImportScript() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "import-neris-xlsx.mjs")], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`import-neris-xlsx exited ${code}`))));
  });
}

const MODULE_FILES = [
  { id: "core_mod_incident", url: `${RAW_BASE}/core_schemas/modules/yml/incident/core_mod_incident.yml` },
  { id: "mod_fire", url: `${RAW_BASE}/core_schemas/modules/yml/incident/mod_fire.yml` },
  { id: "mod_hazard", url: `${RAW_BASE}/core_schemas/modules/yml/incident/mod_hazard.yml` },
];

const VALUE_SET_FILES = [
  "type_incident",
  "type_water_supply",
  "type_fire_invest_need",
  "type_fire_invest",
  "type_fire_condition_arrival",
  "type_fire_bldg_damage",
  "type_room",
  "type_fire_cause_in",
  "type_fire_cause_out",
  "type_aid",
  "type_aid_direction",
  "type_special_modifier",
  "type_displace_cause",
  "type_noaction",
  "type_suppress_appliance",
];

function parseNerisModuleYaml(text) {
  const fields = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fieldMatch = line.match(/^([a-z0-9_]+):\s*$/i);
    if (fieldMatch) {
      current = { name: fieldMatch[1], properties: {} };
      fields.push(current);
      continue;
    }
    const propMatch = line.match(/^ ([a-z_]+):\s*(.*)$/i);
    if (propMatch && current) {
      let value = propMatch[2].trim();
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }
      current.properties[propMatch[1]] = value;
    }
  }

  return fields;
}

function parseValueSetCsv(text, name) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { name, options: [] };

  const header = lines[0].split(",").map((item) => item.trim().toLowerCase());
  const valueIdx = header.findIndex((col) => col === "value" || col === "code" || col === "id");
  const labelIdx = header.findIndex((col) => col === "label" || col === "description" || col === "name");

  const options = lines.slice(1).map((line) => {
    const cells = line.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
    const value = cells[valueIdx >= 0 ? valueIdx : 0] || "";
    const label = cells[labelIdx >= 0 ? labelIdx : 1] || value;
    return { value, label };
  }).filter((item) => item.value);

  return { name, options };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  if (await hasLocalV1Schemas()) {
    console.log("Local NERIS V1 XLSX schemas found — importing from vendor files...\n");
    await runImportScript();
    return;
  }

  console.log("No local V1 XLSX — syncing from GitHub neris-framework...\n");

  const modules = {};
  for (const file of MODULE_FILES) {
    const yaml = await fetchText(file.url);
    modules[file.id] = {
      id: file.id,
      source: file.url,
      fields: parseNerisModuleYaml(yaml),
    };
    console.log(`Synced module ${file.id} (${modules[file.id].fields.length} fields)`);
  }

  const valueSets = {};
  for (const name of VALUE_SET_FILES) {
    const url = `${RAW_BASE}/core_schemas/value_sets/csv/${name}.csv`;
    try {
      const csv = await fetchText(url);
      valueSets[name] = parseValueSetCsv(csv, name);
      console.log(`Synced value set ${name} (${valueSets[name].options.length} options)`);
    } catch (error) {
      console.warn(`Skipped value set ${name}:`, error.message);
    }
  }

  await fs.writeFile(
    path.join(OUT_DIR, "modules.json"),
    JSON.stringify({ syncedAt: new Date().toISOString(), modules }, null, 2),
  );
  await fs.writeFile(
    path.join(OUT_DIR, "valueSets.json"),
    JSON.stringify({ syncedAt: new Date().toISOString(), valueSets }, null, 2),
  );

  console.log(`\nWrote ${path.join("src", "data", "neris", "modules.json")}`);
  console.log(`Wrote ${path.join("src", "data", "neris", "valueSets.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
