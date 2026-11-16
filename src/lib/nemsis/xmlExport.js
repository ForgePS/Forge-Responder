/**
 * NEMSIS XML export. Pure: document objects (see schema.js for the shape) → XML text.
 *
 * Elements are written in XSD sequence order regardless of key order in the object.
 * With `fillNotRecorded` (default), empty required elements that allow NV are written as
 *   <eX.nn xsi:nil="true" NV="7701003"/>
 * which is how NEMSIS expects "not documented" to be reported. Required elements that do not
 * allow NV are left out; validateNemsis() reports them as blocking.
 */
import { readLeaf, isEmptyLeaf, instancesOf, NV } from "./schema.js";

const XSI = "http://www.w3.org/2001/XMLSchema-instance";

export function escapeXml(value) {
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attrText(attrs) {
  return Object.entries(attrs ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
}

/**
 * @param {ReturnType<import("./schema.js").createNemsisSchema>} schema
 * @param {"EMSDataSet"|"DEMDataSet"} dataset
 * @param {object} doc  full dataset document, e.g. { Header: [{ DemographicGroup, PatientCareReport: [...] }] }
 * @param {{ fillNotRecorded?: boolean, pretty?: boolean }} [options]
 */
export function toNemsisXml(schema, dataset, doc, options = {}) {
  const fill = options.fillNotRecorded !== false;
  const pretty = options.pretty !== false;
  const root = schema.node(dataset);
  const out = [];
  const pad = (depth) => (pretty ? "  ".repeat(depth) : "");
  const nl = pretty ? "\n" : "";

  function writeLeaf(node, raw, depth) {
    const v = readLeaf(raw);
    const attrs = attrText(v.attrs);
    if (v.value !== undefined) {
      const pn = v.PN ? ` PN="${escapeXml(v.PN)}"` : "";
      out.push(`${pad(depth)}<${node.n}${attrs}${pn}>${escapeXml(v.value)}</${node.n}>${nl}`);
    } else if (v.NV || v.PN) {
      const marker = v.NV ? ` NV="${escapeXml(v.NV)}"` : ` PN="${escapeXml(v.PN)}"`;
      out.push(`${pad(depth)}<${node.n}${attrs} xsi:nil="true"${marker}/>${nl}`);
    }
  }

  function writeChild(node, parent, depth) {
    let items = instancesOf(parent, node.n);
    if (node.k === "l") {
      items = items.filter((x) => !isEmptyLeaf(x));
      if (items.length === 0 && node.min > 0 && fill && node.nil && node.nv?.includes(NV.NotRecorded)) {
        items = [{ NV: NV.NotRecorded }];
      }
      items.forEach((item) => writeLeaf(node, item, depth));
      return;
    }
    if (items.length === 0 && node.min > 0 && fill) items = [{}];
    items.forEach((item) => writeContainer(node, item, depth));
  }

  function writeContainer(node, obj, depth, extraAttrs = "") {
    const body = out.length;
    out.push(""); // placeholder for the opening tag
    for (const child of node.ch) writeChild(child, obj ?? {}, depth + 1);
    const open = `${pad(depth)}<${node.n}${extraAttrs}${attrText(obj?.attrs)}`;
    if (out.length === body + 1) {
      out[body] = `${open}/>${nl}`;
    } else {
      out[body] = `${open}>${nl}`;
      out.push(`${pad(depth)}</${node.n}>${nl}`);
    }
  }

  out.push(`<?xml version="1.0" encoding="UTF-8"?>${nl}`);
  writeContainer(root, doc, 0, ` xmlns="${schema.namespace}" xmlns:xsi="${XSI}"`);
  return out.join("");
}

/**
 * Build an EMSDataSet XML file for one agency and one or more PCRs.
 * @param {object} schema
 * @param {{ agency: { "dAgency.01": string, "dAgency.02": string, "dAgency.04": string },
 *           reports: { uuid: string, data: object }[], customConfiguration?: object }} input
 * @param {object} [options]
 */
export function buildEmsDataSetXml(schema, { agency, reports, customConfiguration }, options) {
  const header = {
    DemographicGroup: agency,
    PatientCareReport: reports.map((r) => ({ ...r.data, attrs: { ...(r.data.attrs ?? {}), UUID: r.uuid } })),
  };
  if (customConfiguration) header.eCustomConfiguration = customConfiguration;
  return toNemsisXml(schema, "EMSDataSet", { Header: [header] }, options);
}

/**
 * Build a DEMDataSet XML file for one agency.
 * @param {object} schema
 * @param {{ report: object, timeStamp: string, customConfiguration?: object }} input
 */
export function buildDemDataSetXml(schema, { report, timeStamp, customConfiguration }, options) {
  const doc = { DemographicReport: [{ ...report, attrs: { ...(report.attrs ?? {}), timeStamp } }] };
  if (customConfiguration) doc.dCustomConfiguration = customConfiguration;
  return toNemsisXml(schema, "DEMDataSet", doc, options);
}
