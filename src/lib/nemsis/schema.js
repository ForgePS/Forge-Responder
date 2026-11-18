/**
 * NEMSIS schema access. Pure: takes the generated bundle (see scripts/nemsis/sync-nemsis-schema.mjs)
 * so the same code runs in the browser (Vite JSON imports), Node tests and Cloud Functions.
 *
 * Document shape used everywhere in Forge (mirrors the XSD exactly):
 *   container, max 1      → object   { attrs?: {UUID: "..."}, "<child name>": ... }
 *   container, repeating  → array of those objects
 *   leaf, max 1           → value
 *   leaf, repeating       → array of values
 *   value                 → string | number | { value?, NV?, PN?, attrs? }
 * Element names are the NEMSIS ids (e.g. "eVitals.06", "eVitals.VitalGroup").
 */

/** @typedef {{ n: string, k: "c"|"l", min: number, max: number|null, nil?: true, t?: string,
 *   nv?: string[], pn?: string[], a?: {n: string, use: string, type?: string, codes?: string[]}[], ch?: SchemaNode[] }} SchemaNode */

export const NV = Object.freeze({ NotApplicable: "7701001", NotRecorded: "7701003", NotReporting: "7701005" });
export const PN = Object.freeze({
  ContraindicationNoted: "8801001",
  DeniedByOrder: "8801003",
  ExamFindingNotPresent: "8801005",
  MedicationAllergy: "8801007",
  MedicationAlreadyTaken: "8801009",
  NoKnownDrugAllergy: "8801013",
  NoneReported: "8801015",
  NotPerformedByEMS: "8801017",
  Refused: "8801019",
  Unresponsive: "8801021",
  UnableToComplete: "8801023",
  NotImmunized: "8801025",
  OrderCriteriaNotMet: "8801027",
  Approximate: "8801029",
  SymptomNotPresent: "8801031",
});

export const DATASET_ROOTS = Object.freeze({
  EMSDataSet: ["EMSDataSet", "Header", "PatientCareReport"],
  DEMDataSet: ["DEMDataSet", "DemographicReport"],
});

/**
 * @param {{ structure: object, types: object, elements: object, enumerations: object, meta: object }} bundle
 */
export function createNemsisSchema(bundle) {
  const { structure, types, elements, enumerations, meta } = bundle;
  if (!structure?.EMSDataSet || !types || !elements || !meta?.version) {
    throw new Error("createNemsisSchema: incomplete NEMSIS bundle");
  }

  /** @type {Record<string, Map<string, {node: SchemaNode, path: string[]}>>} */
  const index = {};
  for (const ds of Object.keys(structure)) {
    const map = new Map();
    const walk = (node, path) => {
      const here = [...path, node.n];
      if (!map.has(node.n)) map.set(node.n, { node, path: here });
      node.ch?.forEach((c) => walk(c, here));
    };
    walk(structure[ds], []);
    index[ds] = map;
  }

  const datasetOf = (name) => (name.startsWith("d") ? "DEMDataSet" : "EMSDataSet");

  return {
    version: meta.version,
    namespace: meta.namespace,
    meta,
    structure,
    types,

    /** Root SchemaNode of a dataset, or of a named node in it (e.g. "PatientCareReport"). */
    node(dataset, name = dataset) {
      return index[dataset]?.get(name)?.node ?? null;
    },

    /** Path of element names from the dataset root to `name`. */
    pathOf(dataset, name) {
      return index[dataset]?.get(name)?.path ?? null;
    },

    /** Data dictionary entry for an element (name, usage, national, definition, ...). */
    element(name, dataset = datasetOf(name)) {
      return elements[dataset]?.[name] ?? null;
    },

    /** Resolved simple type (base, enums, patterns, facets). */
    type(typeName) {
      return types[typeName] ?? null;
    },

    /** { code: description } for an enumerated element, or null. */
    codes(name, dataset = datasetOf(name)) {
      return enumerations[dataset]?.[name] ?? null;
    },

    /** Human label for a code of an element, falling back to NV/PN names. */
    codeLabel(name, code, dataset = datasetOf(name)) {
      const c = String(code);
      return enumerations[dataset]?.[name]?.[c] ?? meta.notValues?.[c] ?? null;
    },

    /** All element names (leaves) of a dataset, in document order. */
    leafNames(dataset) {
      return [...index[dataset].values()].filter((e) => e.node.k === "l").map((e) => e.node.n);
    },
  };
}

/** Normalise a stored leaf value into { value, NV, PN, attrs } (fields absent when unset). */
export function readLeaf(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out = {};
    if (raw.value !== undefined && raw.value !== null && raw.value !== "") out.value = raw.value;
    if (raw.NV) out.NV = String(raw.NV);
    if (raw.PN) out.PN = String(raw.PN);
    if (raw.attrs && Object.keys(raw.attrs).length) out.attrs = raw.attrs;
    return out;
  }
  if (raw === "") return {};
  return { value: raw };
}

/** True when a leaf carries nothing (no value, NV or PN). */
export function isEmptyLeaf(raw) {
  const v = readLeaf(raw);
  return v.value === undefined && !v.NV && !v.PN;
}

/** Instances of a node within its parent object, always as an array. */
export function instancesOf(parent, name) {
  const v = parent?.[name];
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}
