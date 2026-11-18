/**
 * Sync the official NEMSIS v3 release into Forge.
 *
 *   node scripts/nemsis/sync-nemsis-schema.mjs                 # fetch from nemsis.org (default 3.5.1)
 *   node scripts/nemsis/sync-nemsis-schema.mjs --version 3.5.1
 *   node scripts/nemsis/sync-nemsis-schema.mjs --from <dir>    # use already-downloaded files
 *
 * Writes:
 *   src/data/nemsis/<version>/structure.json     XSD tree for EMSDataSet + DEMDataSet (sections, groups, elements)
 *   src/data/nemsis/<version>/types.json         resolved simple types (base, facets, enumerated codes)
 *   src/data/nemsis/<version>/elements.json      data dictionary metadata per dataset/element
 *   src/data/nemsis/<version>/enumerations.json  code → description per dataset/element
 *   src/data/nemsis/<version>/meta.json          version, source URLs, counts
 *   functions/nemsis/<version>/xsd/*.xsd         untouched official XSDs (server + tests)
 *   functions/nemsis/<version>/schematron/*.sch.xml  untouched official national Schematron
 *
 * The generated JSON is pure data; src/lib/nemsis/* reads it. Do not hand-edit generated files.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const VERSION = argValue("--version") || "3.5.1";
const FROM_DIR = argValue("--from");
const BASE_URL = `https://nemsis.org/media/nemsis_v3/release-${VERSION}`;

const SOURCES = {
  xsdZip: "XSDs/NEMSIS_XSDs.zip",
  details: "DataDictionary/Ancillary/DEMEMS/Combined_ElementDetails_Full.txt",
  enumerations: "DataDictionary/Ancillary/DEMEMS/Combined_ElementEnumerations.txt",
  attributes: "DataDictionary/Ancillary/DEMEMS/Combined_ElementAttributes.txt",
  emsSchematron: "Schematron/rules/EMSDataSet.sch.xml",
  demSchematron: "Schematron/rules/DEMDataSet.sch.xml",
};

const DATA_OUT = path.join(ROOT, "src", "data", "nemsis", VERSION);
const SERVER_OUT = path.join(ROOT, "functions", "nemsis", VERSION);
const DATASETS = ["EMSDataSet", "DEMDataSet"];

async function loadSource(relPath) {
  const name = path.basename(relPath);
  if (FROM_DIR) return fs.readFile(path.join(FROM_DIR, name));
  const res = await fetch(`${BASE_URL}/${relPath}`);
  if (!res.ok) throw new Error(`GET ${BASE_URL}/${relPath} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Pipe-delimited dictionary files: 'a'|'b'|'c'|   (values may contain apostrophes)
// ---------------------------------------------------------------------------
export function parseDictionaryTable(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    let s = line.trim();
    if (s.endsWith("|")) s = s.slice(0, -1);
    if (s.startsWith("'")) s = s.slice(1);
    if (s.endsWith("'")) s = s.slice(0, -1);
    return s.split("'|'");
  };
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

// ---------------------------------------------------------------------------
// XSD parsing (preserveOrder keeps sequence order exact)
// ---------------------------------------------------------------------------
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: false,
});

const tagOf = (node) => Object.keys(node).find((k) => k !== ":@");
const attrsOf = (node) => node[":@"] ?? {};
const kidsOf = (node) => (Array.isArray(node[tagOf(node)]) ? node[tagOf(node)] : []);
const childrenTagged = (node, tag) => kidsOf(node).filter((c) => tagOf(c) === tag);
const firstTagged = (node, tag) => childrenTagged(node, tag)[0];

function buildRegistry(xsdFiles) {
  const complexTypes = new Map();
  const simpleTypes = new Map();
  const globalElements = new Map();
  for (const text of xsdFiles.values()) {
    const doc = parser.parse(text);
    const schema = doc.find((n) => tagOf(n) === "xs:schema");
    for (const child of kidsOf(schema)) {
      const tag = tagOf(child);
      const name = attrsOf(child).name;
      if (!name) continue;
      if (tag === "xs:complexType") complexTypes.set(name, child);
      else if (tag === "xs:simpleType") simpleTypes.set(name, child);
      else if (tag === "xs:element") globalElements.set(name, child);
    }
  }
  return { complexTypes, simpleTypes, globalElements };
}

const FACETS = ["minLength", "maxLength", "length", "minInclusive", "maxInclusive", "minExclusive", "maxExclusive", "totalDigits", "fractionDigits"];

/** Resolve a named simple type into { base, enums?, patterns?, facets..., union? } (fully flattened). */
function resolveSimpleType(name, registry, cache) {
  if (cache.has(name)) return cache.get(name);
  if (name.startsWith("xs:")) return { base: name };
  const node = registry.simpleTypes.get(name);
  if (!node) throw new Error(`Unknown simple type ${name}`);
  const out = {};
  const restriction = firstTagged(node, "xs:restriction");
  const union = firstTagged(node, "xs:union");
  if (restriction) {
    const baseName = attrsOf(restriction).base;
    Object.assign(out, structuredClone(resolveSimpleType(baseName, registry, cache)));
    const enums = childrenTagged(restriction, "xs:enumeration").map((e) => String(attrsOf(e).value));
    if (enums.length) out.enums = enums;
    const patterns = childrenTagged(restriction, "xs:pattern").map((e) => String(attrsOf(e).value));
    if (patterns.length) out.patterns = [...(out.patterns ?? []), patterns.length === 1 ? patterns[0] : `(${patterns.join(")|(")})`];
    for (const facet of FACETS) {
      const f = firstTagged(restriction, `xs:${facet}`);
      if (f) out[facet] = String(attrsOf(f).value);
    }
  } else if (union) {
    out.union = String(attrsOf(union).memberTypes).trim().split(/\s+/);
  } else {
    throw new Error(`Simple type ${name} has neither restriction nor union`);
  }
  cache.set(name, out);
  return out;
}

/** Codes accepted by an NV/PN attribute declared as a union of NV.* / PN.* simple types. */
function attributeCodes(attrNode, registry, cache) {
  const simple = firstTagged(attrNode, "xs:simpleType");
  const typeName = attrsOf(attrNode).type;
  const memberNames = simple
    ? String(attrsOf(firstTagged(simple, "xs:union") ?? {}).memberTypes ?? "").trim().split(/\s+/).filter(Boolean)
    : typeName
      ? [typeName]
      : [];
  const codes = [];
  for (const m of memberNames) {
    const t = resolveSimpleType(m, registry, cache);
    if (t.enums) codes.push(...t.enums);
  }
  return codes;
}

function readAttributes(holder, registry, cache, usedTypes) {
  const out = [];
  for (const a of childrenTagged(holder, "xs:attribute")) {
    const at = attrsOf(a);
    const entry = { n: at.name, use: at.use || "optional" };
    if (at.type) {
      entry.type = at.type;
      usedTypes.add(at.type);
    }
    const codes = attributeCodes(a, registry, cache);
    if (codes.length) entry.codes = codes;
    out.push(entry);
  }
  return out;
}

const occurs = (v, dflt) => (v === undefined ? dflt : v === "unbounded" ? null : Number(v));

/** Turn one xs:element into a structure node. */
function buildNode(el, registry, cache, usedTypes) {
  const at = attrsOf(el);
  const node = { n: at.name, min: occurs(at.minOccurs, 1), max: occurs(at.maxOccurs, 1) };
  if (at.nillable === "true") node.nil = true;

  let complex = firstTagged(el, "xs:complexType");
  if (!complex && at.type && registry.complexTypes.has(at.type)) complex = registry.complexTypes.get(at.type);

  if (!complex) {
    // leaf with a named simple type
    node.k = "l";
    node.t = at.type;
    usedTypes.add(at.type);
    return node;
  }

  const seq = firstTagged(complex, "xs:sequence");
  if (seq) {
    node.k = "c";
    node.ch = childrenTagged(seq, "xs:element").map((c) => buildNode(c, registry, cache, usedTypes));
    const attrs = readAttributes(complex, registry, cache, usedTypes);
    if (attrs.length) node.a = attrs;
    return node;
  }

  const simpleContent = firstTagged(complex, "xs:simpleContent");
  const ext = simpleContent && (firstTagged(simpleContent, "xs:extension") || firstTagged(simpleContent, "xs:restriction"));
  if (!ext) throw new Error(`Element ${at.name}: unsupported complexType shape`);
  node.k = "l";
  node.t = attrsOf(ext).base;
  usedTypes.add(node.t);
  const attrs = readAttributes(ext, registry, cache, usedTypes);
  const nv = attrs.find((a) => a.n === "NV");
  const pn = attrs.find((a) => a.n === "PN");
  if (nv) node.nv = nv.codes ?? [];
  if (pn) node.pn = pn.codes ?? [];
  const rest = attrs.filter((a) => a.n !== "NV" && a.n !== "PN");
  if (rest.length) node.a = rest;
  return node;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`NEMSIS ${VERSION}: loading from ${FROM_DIR ?? BASE_URL}`);
  const raw = Object.fromEntries(
    await Promise.all(Object.entries(SOURCES).map(async ([k, p]) => [k, await loadSource(p)])),
  );

  // XSDs
  const zip = await JSZip.loadAsync(raw.xsdZip);
  const xsdFiles = new Map();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.endsWith(".xsd")) continue;
    xsdFiles.set(path.basename(entry.name), await entry.async("string"));
  }
  if (!xsdFiles.has("EMSDataSet_v3.xsd")) throw new Error("XSD zip is missing EMSDataSet_v3.xsd");

  const registry = buildRegistry(xsdFiles);
  const cache = new Map();
  const usedTypes = new Set();
  const structure = {};
  for (const ds of DATASETS) {
    const root = registry.globalElements.get(ds);
    if (!root) throw new Error(`No global element ${ds}`);
    structure[ds] = buildNode(root, registry, cache, usedTypes);
  }

  const types = {};
  for (const t of [...usedTypes].sort()) types[t] = resolveSimpleType(t, registry, cache);
  // NV/PN code names, for UI labels and export
  const notValues = {};
  for (const [name] of registry.simpleTypes) {
    if (/^(NV|PN)\./.test(name)) {
      const t = resolveSimpleType(name, registry, cache);
      if (t.enums?.length === 1) notValues[t.enums[0]] = name;
    }
  }

  // Dictionary
  const details = parseDictionaryTable(raw.details.toString("utf8"));
  const elements = Object.fromEntries(DATASETS.map((d) => [d, {}]));
  for (const r of details) {
    if (!elements[r.DatasetName]) continue;
    elements[r.DatasetName][r.ElementNumber] = {
      name: r.ElementName,
      national: r.National === "National",
      state: r.State === "State",
      usage: r.Usage, // Mandatory | Required | Recommended | Optional
      definition: r.Definition,
      v2: r.V2Number || undefined,
      dataType: r.DataType,
      minOccurs: r.MinOccurs,
      maxOccurs: r.MaxOccurs,
      nillable: r.IsNillable === "Nillable",
      nv: r.NV === "NV",
      pn: r.PN === "PN",
      pnNil: r.PNNill === "PNNill", // a PN may stand in for the value (nil + PN)
    };
  }
  const enumRows = parseDictionaryTable(raw.enumerations.toString("utf8"));
  const enumerations = Object.fromEntries(DATASETS.map((d) => [d, {}]));
  for (const r of enumRows) {
    const bucket = enumerations[r.DatasetName];
    if (!bucket) continue;
    (bucket[r.ElementNumber] ??= {})[r.Code] = r.CodeDescription;
  }

  // Cross-check: every leaf in the XSD tree should be in the dictionary
  const missing = [];
  const walk = (ds, n) => {
    if (n.k === "l" && /^[ed][A-Za-z]+\.\d+$/.test(n.n) && !elements[ds][n.n]) missing.push(`${ds}:${n.n}`);
    n.ch?.forEach((c) => walk(ds, c));
  };
  DATASETS.forEach((ds) => walk(ds, structure[ds]));
  if (missing.length) console.warn(`warning: ${missing.length} XSD leaves not in dictionary: ${missing.slice(0, 10).join(", ")}`);

  const meta = {
    version: VERSION,
    source: FROM_DIR ? `local:${path.basename(FROM_DIR)}` : BASE_URL,
    files: SOURCES,
    namespace: "http://www.nemsis.org",
    notValues,
    counts: Object.fromEntries(DATASETS.map((d) => [d, { elements: Object.keys(elements[d]).length, enumeratedElements: Object.keys(enumerations[d]).length }])),
    generatedBy: "scripts/nemsis/sync-nemsis-schema.mjs",
  };

  await fs.rm(DATA_OUT, { recursive: true, force: true });
  await fs.mkdir(DATA_OUT, { recursive: true });
  const writeJson = (name, value) => fs.writeFile(path.join(DATA_OUT, name), `${JSON.stringify(value)}\n`);
  await writeJson("structure.json", structure);
  await writeJson("types.json", types);
  await writeJson("elements.json", elements);
  await writeJson("enumerations.json", enumerations);
  await fs.writeFile(path.join(DATA_OUT, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

  await fs.rm(SERVER_OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(SERVER_OUT, "xsd"), { recursive: true });
  await fs.mkdir(path.join(SERVER_OUT, "schematron"), { recursive: true });
  for (const [name, text] of xsdFiles) await fs.writeFile(path.join(SERVER_OUT, "xsd", name), text);
  await fs.writeFile(path.join(SERVER_OUT, "schematron", "EMSDataSet.sch.xml"), raw.emsSchematron);
  await fs.writeFile(path.join(SERVER_OUT, "schematron", "DEMDataSet.sch.xml"), raw.demSchematron);

  console.log(`wrote ${path.relative(ROOT, DATA_OUT)} and ${path.relative(ROOT, SERVER_OUT)}`);
  console.log(JSON.stringify(meta.counts));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
