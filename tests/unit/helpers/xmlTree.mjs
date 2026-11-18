// Node-side XML → XmlTree (the shape src/lib/nemsis/xmlImport.js takes), plus a canonical form for comparing files.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  commentPropName: "#comment",
});

const tagOf = (n) => Object.keys(n).find((k) => k !== ":@");

function toTree(node) {
  const name = tagOf(node);
  const attrs = { ...(node[":@"] ?? {}) };
  const children = [];
  let text = "";
  for (const c of node[name] ?? []) {
    const t = tagOf(c);
    if (t === "#text") text += c["#text"];
    else if (t === "#comment" || t.startsWith("?")) continue;
    else children.push(toTree(c));
  }
  return { name, attrs, children, text: children.length ? "" : text };
}

/** Parse XML text into the XmlTree of its root element. */
export function parseXmlTree(xml) {
  const nodes = parser.parse(xml);
  const root = nodes.find((n) => {
    const t = tagOf(n);
    return t !== "?xml" && t !== "#comment" && t !== "#text";
  });
  return toTree(root);
}

/** Root-level attributes that are about the file, not the data (namespaces, schemaLocation). */
const FILE_ATTRS = (k) => k === "xmlns" || k.startsWith("xmlns:") || k === "xsi:schemaLocation";

/** Canonical JSON-able form: sorted attributes, no namespace declarations, exact leaf text. */
export function canonical(tree) {
  const attrs = Object.fromEntries(Object.entries(tree.attrs).filter(([k]) => !FILE_ATTRS(k)).sort(([a], [b]) => a.localeCompare(b)));
  const out = { name: tree.name };
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (tree.children.length) out.children = tree.children.map(canonical);
  else if (tree.text !== "") out.text = tree.text;
  return out;
}

/** First difference between two canonical trees, as a readable path, or null. */
export function firstDifference(a, b, path = "") {
  const here = `${path}/${a?.name ?? b?.name}`;
  if (!a || !b) return `${here}: ${a ? "missing in export" : "extra in export"}`;
  if (a.name !== b.name) return `${path}: element ${a.name} vs ${b.name}`;
  if (JSON.stringify(a.attrs ?? {}) !== JSON.stringify(b.attrs ?? {})) return `${here}: attributes ${JSON.stringify(a.attrs)} vs ${JSON.stringify(b.attrs)}`;
  if ((a.text ?? "") !== (b.text ?? "")) return `${here}: text ${JSON.stringify(a.text)} vs ${JSON.stringify(b.text)}`;
  const ac = a.children ?? [];
  const bc = b.children ?? [];
  for (let i = 0; i < Math.max(ac.length, bc.length); i++) {
    const d = firstDifference(ac[i], bc[i], `${here}[${i}]`);
    if (d) return d;
  }
  return null;
}
