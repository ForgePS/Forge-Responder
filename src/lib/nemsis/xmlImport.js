/**
 * NEMSIS XML → Forge document (the inverse of xmlExport.js). Pure.
 *
 * Works on a minimal element tree so it runs anywhere:
 *   { name: string, attrs: Record<string,string>, children: Tree[], text: string }
 * Build the tree with elementTreeFromDom() in the browser (DOMParser) or any XML parser on the server.
 *
 * Values are kept as the exact text from the file (no number conversion), so import → export reproduces
 * the original document. Elements the schema does not know are reported, not silently dropped.
 */
import { DATASET_ROOTS } from "./schema.js";

/** @typedef {{ name: string, attrs: Record<string,string>, children: XmlTree[], text: string }} XmlTree */

const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const prefixOf = (name) => (name.includes(":") ? name.slice(0, name.indexOf(":")) : "");

/**
 * Prefixes bound to the XML Schema instance namespace in scope at `el`, resolved by namespace URI
 * (a file may use i:nil or any other prefix). "xsi" counts unless the document rebinds it.
 */
function xsiPrefixesAt(el, inherited) {
  let prefixes = inherited;
  for (const [k, v] of Object.entries(el.attrs ?? {})) {
    if (!k.startsWith("xmlns:")) continue;
    const p = k.slice(6);
    if (v === XSI && !prefixes.has(p)) prefixes = new Set(prefixes).add(p);
    else if (v !== XSI && prefixes.has(p)) (prefixes = new Set(prefixes)).delete(p);
  }
  return prefixes;
}

/** Namespace declarations and xsi:* attributes are XML plumbing, not NEMSIS data. */
const isIgnoredAttr = (name, xsi) => name === "xmlns" || name.startsWith("xmlns:") || xsi.has(prefixOf(name));
const isNil = (el, xsi) => Object.entries(el.attrs ?? {}).some(([k, v]) => xsi.has(prefixOf(k)) && localName(k) === "nil" && (v === "true" || v === "1"));

const localName = (name) => (name.includes(":") ? name.slice(name.indexOf(":") + 1) : name);

/**
 * @param {ReturnType<import("./schema.js").createNemsisSchema>} schema
 * @param {XmlTree} root  the EMSDataSet / DEMDataSet element
 * @returns {{ dataset: "EMSDataSet"|"DEMDataSet", doc: object, problems: { path: string, message: string }[] }}
 */
export function importNemsisTree(schema, root) {
  const dataset = localName(root.name);
  if (!DATASET_ROOTS[dataset]) throw new Error(`importNemsisTree: unsupported root element ${root.name}`);
  const problems = [];

  function readLeaf(node, el, path, inheritedXsi) {
    const xsi = xsiPrefixesAt(el, inheritedXsi);
    const attrs = {};
    let NV;
    let PN;
    for (const [k, v] of Object.entries(el.attrs ?? {})) {
      if (k === "NV") NV = v;
      else if (k === "PN") PN = v;
      else if (!isIgnoredAttr(k, xsi)) attrs[k] = v;
    }
    const nil = isNil(el, xsi);
    if (el.children?.length) problems.push({ path, message: `${node.n} should not contain child elements` });
    const value = nil ? undefined : el.text ?? "";
    const hasAttrs = Object.keys(attrs).length > 0;
    if (!NV && !PN && !hasAttrs) return value ?? "";
    const out = {};
    if (value !== undefined) out.value = value;
    if (NV) out.NV = NV;
    if (PN) out.PN = PN;
    if (hasAttrs) out.attrs = attrs;
    return out;
  }

  function readContainer(node, el, path, inheritedXsi) {
    const xsi = xsiPrefixesAt(el, inheritedXsi);
    const obj = {};
    const attrs = {};
    for (const [k, v] of Object.entries(el.attrs ?? {})) if (!isIgnoredAttr(k, xsi)) attrs[k] = v;
    if (Object.keys(attrs).length) obj.attrs = attrs;

    const childDefs = new Map(node.ch.map((c) => [c.n, c]));
    for (const child of el.children ?? []) {
      const name = localName(child.name);
      const def = childDefs.get(name);
      const childPath = `${path}.${name}`;
      if (!def) {
        problems.push({ path: childPath, message: `${name} is not part of ${node.n} in NEMSIS ${schema.version}` });
        continue;
      }
      const value = def.k === "l" ? readLeaf(def, child, childPath, xsi) : readContainer(def, child, childPath, xsi);
      const repeating = def.max === null || def.max > 1;
      if (repeating) (obj[name] ??= []).push(value);
      else if (name in obj) problems.push({ path: childPath, message: `${name} appears more than once` });
      else obj[name] = value;
    }
    return obj;
  }

  const doc = readContainer(schema.node(dataset), root, dataset, new Set(["xsi"]));
  return { dataset, doc, problems };
}

/** Split an imported EMSDataSet into its agency header and PCRs (the shape buildEmsDataSetXml takes). */
export function splitEmsDataSet(doc) {
  return (doc.Header ?? []).map((header) => ({
    agency: header.DemographicGroup,
    customConfiguration: header.eCustomConfiguration,
    reports: (header.PatientCareReport ?? []).map((pcr) => {
      const { attrs = {}, ...data } = pcr;
      const { UUID, ...rest } = attrs;
      return { uuid: UUID, data: Object.keys(rest).length ? { ...data, attrs: rest } : data };
    }),
  }));
}

/**
 * Browser helper: DOM Element (from DOMParser) → XmlTree. Comments and whitespace-only text are skipped.
 * @param {Element} el
 * @returns {XmlTree}
 */
export function elementTreeFromDom(el) {
  const attrs = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
  const children = [];
  let text = "";
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1) children.push(elementTreeFromDom(/** @type {Element} */ (n)));
    else if (n.nodeType === 3 || n.nodeType === 4) text += n.nodeValue;
  }
  return { name: el.tagName, attrs, children, text: children.length ? "" : text };
}
