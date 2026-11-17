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

const XSI_NIL = "xsi:nil";
const IGNORED_ATTR = (name) => name === "xmlns" || name.startsWith("xmlns:") || name.startsWith("xsi:");

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

  function readLeaf(node, el, path) {
    const attrs = {};
    let NV;
    let PN;
    for (const [k, v] of Object.entries(el.attrs ?? {})) {
      if (k === "NV") NV = v;
      else if (k === "PN") PN = v;
      else if (!IGNORED_ATTR(k)) attrs[k] = v;
    }
    const nil = el.attrs?.[XSI_NIL] === "true";
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

  function readContainer(node, el, path) {
    const obj = {};
    const attrs = {};
    for (const [k, v] of Object.entries(el.attrs ?? {})) if (!IGNORED_ATTR(k)) attrs[k] = v;
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
      const value = def.k === "l" ? readLeaf(def, child, childPath) : readContainer(def, child, childPath);
      const repeating = def.max === null || def.max > 1;
      if (repeating) (obj[name] ??= []).push(value);
      else if (name in obj) problems.push({ path: childPath, message: `${name} appears more than once` });
      else obj[name] = value;
    }
    return obj;
  }

  const doc = readContainer(schema.node(dataset), root, dataset);
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
