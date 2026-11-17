/**
 * Runs the NEMSIS national Schematron (business rules) against a NEMSIS XML document.
 *
 * The official .sch files are compiled ahead of time by scripts/nemsis/compile-nemsis-schematron.mjs into
 * SaxonJS stylesheets (functions/nemsis/<version>/schematron/compiled/*.sef.json.gz). This module only runs them.
 *
 * Result findings mirror NEMSIS SVRL + nemsisDiagnostic:
 *   { id, kind: "assert"|"report", severity: "error"|"warning", message, test, location,
 *     record: { uuid, pcrNumber }, elements: [{ location, value, nv, pn }], missing: [{ name, parentLocation }] }
 * NEMSIS "[ERROR]" means the state/national system should reject the record; "[WARNING]" means accept and report.
 *
 * Contains PHI when given a PCR: never log the input XML or finding values.
 */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const SaxonJS = require("saxon-js");

const NEMSIS_DIR = path.join(__dirname, "..", "..", "nemsis");
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

/**
 * @param {string} xml  NEMSIS EMSDataSet or DEMDataSet document
 * @param {{ dataset?: "EMSDataSet"|"DEMDataSet", version?: string }} [options]  dataset defaults to the root element
 * @returns {Promise<{ ok: boolean, dataset: string, schemaVersion: string, findings: object[], errorCount: number, warningCount: number }>}
 */
async function runNemsisSchematron(xml, options = {}) {
  const version = options.version || "3.5.1";
  const dataset = options.dataset || (/<(?:\w+:)?(EMSDataSet|DEMDataSet)[\s>]/.exec(String(xml)) || [])[1];
  if (!DATASETS.has(dataset)) {
    throw new Error("runNemsisSchematron: document is not an EMSDataSet or DEMDataSet");
  }

  let svrl;
  try {
    const result = await SaxonJS.transform(
      { stylesheetText: stylesheetText(version, dataset), sourceText: String(xml), destination: "document" },
      "async",
    );
    svrl = result.principalResult;
  } catch (err) {
    // Malformed XML or a runtime XPath error. Keep the message generic: it can echo document content.
    const e = new Error(`NEMSIS Schematron could not process the ${dataset} document`);
    e.code = err && err.code === "FODC0002" ? "malformed-xml" : "schematron-failed";
    throw e;
  }

  const parsed = JSON.parse(SaxonJS.XPath.evaluate(EXTRACT_SVRL, svrl, { namespaceContext: SVRL_NAMESPACES }));
  const findings = parsed.findings.map((f) => ({
    id: f.id,
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
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return {
    ok: errorCount === 0,
    dataset,
    schemaVersion: parsed.schemaVersion,
    findings,
    errorCount,
    warningCount: findings.length - errorCount,
  };
}

module.exports = { runNemsisSchematron, simplifyLocation };
