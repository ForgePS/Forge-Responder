/**
 * Runs the NEMSIS national Schematron (business rules), plus any runtime-loaded state or compliance-test
 * Schematron, against a NEMSIS XML document.
 *
 * National rules are compiled ahead of time by scripts/nemsis/compile-nemsis-schematron.mjs into SaxonJS
 * stylesheets (functions/nemsis/<version>/schematron/compiled/*.sef.json.gz). State and test rules must be
 * loaded at runtime (NEMSIS compliance requirement), so compileSchematron() runs the same ISO pipeline in-process.
 *
 * Result findings mirror NEMSIS SVRL + nemsisDiagnostic:
 *   { id, source, kind: "assert"|"report", severity: "error"|"warning", message, test, location,
 *     record: { uuid, pcrNumber }, elements: [{ location, value, nv, pn }], missing: [{ name, parentLocation }] }
 * NEMSIS "[ERROR]" means the record must not be finalized or accepted; "[WARNING]" means accept and report.
 *
 * Contains PHI when given a PCR: never log the input XML or finding values.
 */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const SaxonJS = require("saxon-js");

const NEMSIS_DIR = path.join(__dirname, "..", "..", "nemsis");
const ISO_DIR = path.join(NEMSIS_DIR, "iso-schematron-xslt2");
const DATASETS = new Set(["EMSDataSet", "DEMDataSet"]);
const stylesheetCache = new Map();

function stylesheetText(version, dataset) {
  const key = `${version}/${dataset}`;
  if (!stylesheetCache.has(key)) {
    const file = path.join(NEMSIS_DIR, version, "schematron", "compiled", `${dataset}.sef.json.gz`);
    stylesheetCache.set(key, zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
  }
  return stylesheetCache.get(key);
}

// XPath 3.1 over the SVRL result → one JSON string (avoids a DOM walk and an XML parser dependency).
const EXTRACT_SVRL = `
serialize(map{
  'schemaVersion': string(/svrl:schematron-output/@schemaVersion),
  'title': string(/svrl:schematron-output/@title),
  'findings': array{
    for $f in //(svrl:failed-assert | svrl:successful-report)
    return let $d := $f/svrl:diagnostic-reference/nem:nemsisDiagnostic
    return map{
      'kind': if (local-name($f) = 'failed-assert') then 'assert' else 'report',
      'id': string($f/@id),
      'role': string($f/@role),
      'test': string($f/@test),
      'location': string($f/@location),
      'message': normalize-space(string($f/svrl:text)),
      'uuid': string(($d/nem:record/nem:UUID)[1]),
      'pcrNumber': string(($d/nem:record/nem:eRecord.01)[1]),
      'elements': array{
        for $e in $d/nem:elements/nem:element
        return map{ 'location': string($e/@location), 'value': string($e), 'nv': string($e/@NV), 'pn': string($e/@PN) }
      },
      'missing': array{
        for $m in $d/nem:elementsMissing/nem:element
        return map{ 'name': string($m/@name), 'parentLocation': string($m/@parentLocation) }
      }
    }
  }
}, map{ 'method': 'json' })`;

const SVRL_NAMESPACES = {
  svrl: "http://purl.oclc.org/dsdl/svrl",
  nem: "http://www.nemsis.org",
};

/**
 * "/*:EMSDataSet[namespace-uri()='http://www.nemsis.org'][1]/*:Header[...][1]/..." → "/EMSDataSet[1]/Header[1]/..."
 */
function simplifyLocation(location) {
  return String(location || "").replace(/\*:([A-Za-z0-9._]+)\[namespace-uri\(\)='[^']*'\]/g, "$1");
}

function severityOf(role) {
  return /ERROR/i.test(role) ? "error" : "warning";
}

function toFindings(parsed, source) {
  return parsed.findings.map((f) => ({
    id: f.id,
    source,
    kind: f.kind,
    severity: severityOf(f.role),
    message: f.message,
    test: f.test,
    location: simplifyLocation(f.location),
    record: { uuid: f.uuid || null, pcrNumber: f.pcrNumber || null },
    elements: f.elements.map((e) => ({
      location: simplifyLocation(e.location),
      value: e.value,
      nv: e.nv || null,
      pn: e.pn || null,
    })),
    missing: f.missing.map((m) => ({ name: m.name, parentLocation: simplifyLocation(m.parentLocation) })),
  }));
}

function processingError(dataset, err) {
  // Malformed XML or a runtime XPath error. Keep the message generic: it can echo document content.
  const e = new Error(`NEMSIS Schematron could not process the ${dataset} document`);
  e.code = err && err.code === "FODC0002" ? "malformed-xml" : "schematron-failed";
  return e;
}

// ---------------------------------------------------------------------------
// Runtime-loaded Schematron (state rules, compliance test rules)
// ---------------------------------------------------------------------------

const isoUri = (file) => pathToFileURL(path.join(ISO_DIR, file)).href;
const compiledCache = new Map();
const MAX_COMPILED = 50;

const TRANSFORM_TO_TEXT =
  'transform(map{"stylesheet-location": $xsl, "source-node": parse-xml($src), "delivery-format": "serialized"})?output';
const TRANSFORM_TO_TEXT_ALLOW_FOREIGN =
  'transform(map{"stylesheet-location": $xsl, "source-node": parse-xml($src), "delivery-format": "serialized",' +
  ' "stylesheet-params": map{QName("", "allow-foreign"): "true"}})?output';
const RUN_COMPILED_XSL =
  'transform(map{"stylesheet-text": $xsl, "source-node": parse-xml($src), "delivery-format": "serialized"})?output';

/**
 * Compile Schematron source into an SVRL-producing XSLT, cached by content hash.
 * Same steps as the NEMSIS kit's CompileSchematron.bat: include, abstract expand, SVRL for XSLT 2.
 * @param {string} schText
 * @returns {{ hash: string, xsl: string, dataset: string|null, schemaVersion: string|null, title: string|null }}
 */
function compileSchematron(schText) {
  const text = String(schText);
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  if (compiledCache.has(hash)) return compiledCache.get(hash);
  try {
    let doc = text;
    if (/<(\w+:)?include\b/.test(doc)) {
      doc = SaxonJS.XPath.evaluate(TRANSFORM_TO_TEXT, null, { params: { xsl: isoUri("iso_dsdl_include.xsl"), src: doc } });
    }
    doc = SaxonJS.XPath.evaluate(TRANSFORM_TO_TEXT, null, { params: { xsl: isoUri("iso_abstract_expand.xsl"), src: doc } });
    const xsl = SaxonJS.XPath.evaluate(TRANSFORM_TO_TEXT_ALLOW_FOREIGN, null, {
      params: { xsl: isoUri("iso_svrl_for_xslt2.xsl"), src: doc },
    });
    const head = /<(?:\w+:)?schema\b[^>]*>/.exec(text)?.[0] ?? "";
    const compiled = {
      hash,
      xsl,
      dataset: /\bid="(EMSDataSet|DEMDataSet)"/.exec(head)?.[1] ?? null,
      schemaVersion: /\bschemaVersion="([^"]*)"/.exec(head)?.[1] ?? null,
      title: /<(?:\w+:)?title>([\s\S]*?)<\//.exec(text)?.[1]?.trim() ?? null,
    };
    if (compiledCache.size >= MAX_COMPILED) compiledCache.delete(compiledCache.keys().next().value);
    compiledCache.set(hash, compiled);
    return compiled;
  } catch (err) {
    const e = new Error(`Schematron file could not be compiled: ${err && err.message ? String(err.message).slice(0, 200) : "unknown error"}`);
    e.code = "schematron-compile-failed";
    throw e;
  }
}

/**
 * Run the national Schematron plus any runtime-loaded Schematron files for the same dataset.
 *
 * @param {string} xml  NEMSIS EMSDataSet or DEMDataSet document
 * @param {{ dataset?: "EMSDataSet"|"DEMDataSet", version?: string,
 *           extraSchematron?: { id: string, text: string }[] }} [options]
 *   dataset defaults to the root element; extra files whose sch:schema/@id names the other dataset are skipped
 * @returns {Promise<{ ok: boolean, dataset: string, schemaVersion: string,
 *   sources: { id: string, schemaVersion: string|null, title: string|null }[],
 *   findings: object[], errorCount: number, warningCount: number }>}
 */
async function runNemsisSchematron(xml, options = {}) {
  const version = options.version || "3.5.1";
  const source = String(xml);
  const dataset = options.dataset || (/<(?:\w+:)?(EMSDataSet|DEMDataSet)[\s>]/.exec(source) || [])[1];
  if (!DATASETS.has(dataset)) {
    throw new Error("runNemsisSchematron: document is not an EMSDataSet or DEMDataSet");
  }

  let svrl;
  try {
    const result = await SaxonJS.transform(
      { stylesheetText: stylesheetText(version, dataset), sourceText: source, destination: "document" },
      "async",
    );
    svrl = result.principalResult;
  } catch (err) {
    throw processingError(dataset, err);
  }
  const national = JSON.parse(SaxonJS.XPath.evaluate(EXTRACT_SVRL, svrl, { namespaceContext: SVRL_NAMESPACES }));
  const findings = toFindings(national, "national");
  const sources = [{ id: "national", schemaVersion: national.schemaVersion, title: national.title }];

  for (const extra of options.extraSchematron || []) {
    const compiled = compileSchematron(extra.text);
    if (compiled.dataset && compiled.dataset !== dataset) continue;
    let parsed;
    try {
      const svrlText = SaxonJS.XPath.evaluate(RUN_COMPILED_XSL, null, { params: { xsl: compiled.xsl, src: source } });
      const doc = SaxonJS.XPath.evaluate("parse-xml($s)", null, { params: { s: svrlText } });
      parsed = JSON.parse(SaxonJS.XPath.evaluate(EXTRACT_SVRL, doc, { namespaceContext: SVRL_NAMESPACES }));
    } catch (err) {
      throw processingError(dataset, err);
    }
    findings.push(...toFindings(parsed, extra.id));
    sources.push({ id: extra.id, schemaVersion: compiled.schemaVersion, title: compiled.title });
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  return {
    ok: errorCount === 0,
    dataset,
    schemaVersion: national.schemaVersion,
    sources,
    findings,
    errorCount,
    warningCount: findings.length - errorCount,
  };
}

module.exports = { runNemsisSchematron, compileSchematron, simplifyLocation };
