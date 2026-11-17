/**
 * NEMSIS structural validation (XSD level). Pure.
 *
 * Checks, against the generated schema: unknown elements, cardinality, missing required elements,
 * NV / PN usage, attributes, and value types (enumerations, patterns, lengths, ranges, digits, dates).
 *
 * This mirrors what the official XSD enforces, plus every national Schematron [ERROR] rule, so a document
 * with no blocking issues exports to XML that passes the XSD and the national Schematron errors.
 * Schematron warnings, state rules and runtime-loaded rules run on the server (functions/lib/nemsis/schematron.js).
 *
 * Severity:
 *   error   + blocking  – the XML would be rejected (XSD) or a Mandatory element is missing
 *   warning             – a Required element is empty; it will be exported as NV "Not Recorded"
 */
import { readLeaf, isEmptyLeaf, instancesOf, DATASET_ROOTS, NV, PN } from "./schema.js";

/** @typedef {{ path: string, element: string, severity: "error"|"warning", code: string, message: string, blocking: boolean, ruleId?: string }} NemsisIssue */

// ---------------------------------------------------------------------------
// National Schematron [ERROR] rules (3.5.1 CP2) enforced here too, so crews see them while charting.
// The server runs the full Schematron (functions/lib/nemsis/schematron.js); tests check both agree.
// ---------------------------------------------------------------------------

/** Elements where any pertinent negative accompanies a value (nemSch_e005–e007). */
const PN_WITH_VALUE = new Set(["eSituation.10", "eMedications.03", "eProcedures.03"]);
/** Elements where PN "Approximate" accompanies a value (nemSch_e004, e190–e192). */
const PN_APPROXIMATE_WITH_VALUE = new Set(["ePatient.15", "eSituation.01", "eSituation.18", "eArrest.14"]);
/**
 * How a pertinent negative must be used on an element, following the first-match rule order of the national
 * pattern nemSch_eNilNvPn: exempt elements first (no assertions), then the specific rules, then the catch-all.
 * @returns {"exempt"|"withValue"|"empty"}
 */
function pnUsage(element, pn, path) {
  if (element === "eCustomResults.01" || element === "eHistory.10" || /(^|\.)eExam\.AssessmentGroup(\[|\.)/.test(path)) return "exempt";
  if (PN_WITH_VALUE.has(element) || (pn === PN.Approximate && PN_APPROXIMATE_WITH_VALUE.has(element))) return "withValue";
  return "empty"; // nemSch_e003, e008, e188, e189
}

const CODE_TYPE = Object.freeze({ RxNorm: "9924003", SNOMED: "9924005" });
/** Medication code elements and their national rule ids (RxNorm with CodeType, SNOMED with CodeType, either). */
const MEDICATION_CODE_RULES = {
  "eMedications.03": ["nemSch_e143", "nemSch_e144", "nemSch_e145"],
  "dConfiguration.09": ["nemSch_d014", "nemSch_d015", "nemSch_d016"],
};
/** SNOMED medication codes the data dictionary allows (nemSch_e144/e145, d015/d016). */
const MEDICATION_SNOMED_CODES = new Set(["116762002", "116795008", "116861002", "116865006", "180208003", "33389009", "71493000"]);

const regexCache = new Map();
function xsdRegex(pattern) {
  if (!regexCache.has(pattern)) {
    let re = null;
    try {
      re = new RegExp(`^(?:${pattern})$`, "u");
    } catch {
      re = null; // pattern uses XSD-only syntax; skip rather than reject valid data
    }
    regexCache.set(pattern, re);
  }
  return regexCache.get(pattern);
}

const NUMERIC = new Set(["xs:integer", "xs:positiveInteger", "xs:decimal"]);

function isValidDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function compareTo(base, a, b) {
  if (NUMERIC.has(base)) return Number(a) - Number(b);
  if (base === "xs:dateTime") return Date.parse(a) - Date.parse(b);
  return a < b ? -1 : a > b ? 1 : 0; // xs:date: ISO strings compare lexically
}

/**
 * Check a raw value against a resolved simple type. Returns a message, or null when valid.
 * @param {object} type  entry of types.json
 * @param {unknown} raw
 */
export function checkSimpleValue(type, raw) {
  if (!type) return "unknown type";
  if (typeof raw === "object") return "must be a single text or number value";
  const base = type.base;
  const s = NUMERIC.has(base) || base === "xs:date" || base === "xs:dateTime" ? String(raw).trim() : String(raw);

  switch (base) {
    case "xs:integer":
      if (!/^[+-]?\d+$/.test(s)) return "must be a whole number";
      break;
    case "xs:positiveInteger":
      if (!/^\+?\d+$/.test(s) || Number(s) <= 0) return "must be a positive whole number";
      break;
    case "xs:decimal":
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return "must be a number";
      break;
    case "xs:date":
      if (!isValidDate(s)) return "must be a date (YYYY-MM-DD)";
      break;
    case "xs:dateTime": {
      const m = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}/.exec(s);
      if (!m || !isValidDate(m[1]) || Number.isNaN(Date.parse(s))) return "must be a date and time with UTC offset";
      break;
    }
    case "xs:base64Binary":
      if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(s)) return "must be base64 data";
      break;
    default:
      break;
  }

  if (type.enums && !type.enums.includes(s)) return `"${s}" is not an allowed code`;
  for (const p of type.patterns ?? []) {
    const re = xsdRegex(p);
    if (re && !re.test(s)) return "is not in the required format";
  }
  const len = [...s].length;
  if (type.length !== undefined && len !== Number(type.length)) return `must be exactly ${type.length} characters`;
  if (type.minLength !== undefined && len < Number(type.minLength)) return `must be at least ${type.minLength} characters`;
  if (type.maxLength !== undefined && len > Number(type.maxLength)) return `must be at most ${type.maxLength} characters`;
  if (type.minInclusive !== undefined && compareTo(base, s, type.minInclusive) < 0) return `must be at least ${type.minInclusive}`;
  if (type.maxInclusive !== undefined && compareTo(base, s, type.maxInclusive) > 0) return `must be at most ${type.maxInclusive}`;
  if (type.minExclusive !== undefined && compareTo(base, s, type.minExclusive) <= 0) return `must be greater than ${type.minExclusive}`;
  if (type.maxExclusive !== undefined && compareTo(base, s, type.maxExclusive) >= 0) return `must be less than ${type.maxExclusive}`;
  if (base === "xs:decimal") {
    const digits = s.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
    const [intPart, frac = ""] = digits.split(".");
    if (type.fractionDigits !== undefined && frac.replace(/0+$/, "").length > Number(type.fractionDigits)) {
      return `must have at most ${type.fractionDigits} decimal places`;
    }
    if (type.totalDigits !== undefined && (intPart + frac.replace(/0+$/, "")).replace(/^0+/, "").length > Number(type.totalDigits)) {
      return `must have at most ${type.totalDigits} digits`;
    }
  }
  return null;
}

/**
 * Validate a document fragment rooted at `rootName` within `dataset`.
 *
 * @param {ReturnType<import("./schema.js").createNemsisSchema>} schema
 * @param {"EMSDataSet"|"DEMDataSet"} dataset
 * @param {object} doc
 * @param {{ rootName?: string, now?: number }} [options]  root defaults to one PatientCareReport / DemographicReport;
 *   `now` (ms) is the clock for the "not in the future" rule
 * @returns {NemsisIssue[]}
 */
export function validateNemsis(schema, dataset, doc, options = {}) {
  const rootName = options.rootName ?? DATASET_ROOTS[dataset].at(-1);
  const now = options.now ?? Date.now();
  const root = schema.node(dataset, rootName);
  if (!root) throw new Error(`validateNemsis: unknown node ${dataset}/${rootName}`);
  /** @type {NemsisIssue[]} */
  const issues = [];

  const push = (path, element, severity, code, message, blocking = severity === "error", ruleId) =>
    issues.push({ path, element, severity, code, message, blocking, ...(ruleId ? { ruleId } : {}) });

  const label = (name) => {
    const el = schema.element(name, dataset);
    return el ? `${name} ${el.name}` : name;
  };

  function checkAttrs(node, attrs, path) {
    const allowed = new Map((node.a ?? []).map((a) => [a.n, a]));
    for (const [k, v] of Object.entries(attrs ?? {})) {
      const def = allowed.get(k);
      if (!def) {
        push(path, node.n, "error", "unknownAttribute", `${label(node.n)}: attribute "${k}" is not allowed`);
        continue;
      }
      if (v === undefined || v === null || v === "") continue;
      if (def.codes && !def.codes.includes(String(v))) {
        push(path, node.n, "error", "invalidAttribute", `${label(node.n)}: ${k} "${v}" is not an allowed code`);
      } else if (def.type) {
        const msg = checkSimpleValue(schema.type(def.type), v);
        if (msg) push(path, node.n, "error", "invalidAttribute", `${label(node.n)}: ${k} ${msg}`);
      }
    }
    for (const def of node.a ?? []) {
      if (def.use === "required" && (attrs?.[def.n] === undefined || attrs?.[def.n] === "")) {
        push(path, node.n, "error", "missingAttribute", `${label(node.n)}: attribute ${def.n} is required`);
      }
    }
  }

  function checkLeafValue(node, raw, path) {
    const v = readLeaf(raw);
    if (v.attrs) checkAttrs(node, v.attrs, path);
    if (v.NV) {
      if (!node.nv?.includes(v.NV)) {
        push(path, node.n, "error", "nvNotAllowed", `${label(node.n)}: this "not value" is not allowed here`);
      }
      const exempt = node.n === "eCustomResults.01";
      if (v.value !== undefined && !exempt) push(path, node.n, "error", "nvWithValue", `${label(node.n)}: has both a value and a "not value"`, true, "nemSch_e002");
      if (v.PN && !exempt) push(path, node.n, "error", "nvWithPn", `${label(node.n)}: has both a "not value" and a pertinent negative`);
    }
    if (v.PN) {
      const usage = pnUsage(node.n, v.PN, path);
      if (!node.pn?.includes(v.PN)) {
        push(path, node.n, "error", "pnNotAllowed", `${label(node.n)}: this pertinent negative is not allowed here`);
      } else if (usage === "withValue") {
        if (v.value === undefined) {
          push(path, node.n, "error", "pnNeedsValue", `${label(node.n)}: this pertinent negative needs a value with it`, true, "nemSch_e004-e007,e190-e192");
        }
      } else if (usage === "empty" && v.value !== undefined) {
        push(path, node.n, "error", "pnWithValue", `${label(node.n)}: with this pertinent negative the field must be left empty`, true, "nemSch_e003,e008,e188,e189");
      }
    }
    if (v.value !== undefined) {
      const msg = checkSimpleValue(schema.type(node.t), v.value);
      if (msg) push(path, node.n, "error", "invalidValue", `${label(node.n)} ${msg}`);
      else if (MEDICATION_CODE_RULES[node.n]) checkMedicationCode(node, v, path);
    }
  }

  // National Schematron nemSch_e143–e145 / d014–d016: RxNorm (2–7 digits) or one of the allowed SNOMED codes.
  function checkMedicationCode(node, v, path) {
    const [ruleRxNorm, ruleSnomed, ruleEither] = MEDICATION_CODE_RULES[node.n];
    const code = String(v.value).trim();
    const isRxNorm = /^[0-9]{2,7}$/.test(code);
    const isSnomed = MEDICATION_SNOMED_CODES.has(code);
    const codeType = v.attrs?.CodeType;
    if (codeType === CODE_TYPE.RxNorm && !isRxNorm) {
      push(path, node.n, "error", "nationalRule", `${label(node.n)} must be an RxNorm code of 2 to 7 digits`, true, ruleRxNorm);
    } else if (codeType === CODE_TYPE.SNOMED && !isSnomed) {
      push(path, node.n, "error", "nationalRule", `${label(node.n)} must be one of the SNOMED codes the data dictionary allows`, true, ruleSnomed);
    } else if (!isRxNorm && !isSnomed) {
      push(path, node.n, "error", "nationalRule", `${label(node.n)} must be an RxNorm code or an allowed SNOMED code`, true, ruleEither);
    }
  }

  // DEM national rules that look across elements: nemSch_d004, d005, d006.
  const demUuids = new Map();
  function checkDemContainer(node, obj, path) {
    if (dataset !== "DEMDataSet") return;
    const uuid = obj.attrs?.UUID;
    if (uuid) {
      if (demUuids.has(uuid)) {
        push(path, node.n, "error", "nationalRule", `${node.n}: UUID must be unique (also used at ${demUuids.get(uuid)})`, true, "nemSch_d005");
      } else demUuids.set(uuid, path);
    }
    if (node.n === "DemographicReport" && obj.attrs?.timeStamp) {
      const ts = Date.parse(obj.attrs.timeStamp);
      if (!Number.isNaN(ts) && ts >= now + 60 * 60 * 1000) {
        push(path, node.n, "error", "nationalRule", "The demographic report time stamp must not be in the future", true, "nemSch_d004");
      }
    }
    if (node.n === "dAgency.AgencyServiceGroup") {
      const state = readLeaf(obj["dAgency.05"]).value;
      instancesOf(obj, "dAgency.06").forEach((raw, i) => {
        const county = readLeaf(raw).value;
        if (state !== undefined && county !== undefined && String(county).slice(0, 2) !== String(state)) {
          push(`${path}.dAgency.06[${i}]`, "dAgency.06", "error", "nationalRule", `County ${county} is not in the service area state ${state}`, true, "nemSch_d006");
        }
      });
    }
  }

  function missing(node, path) {
    const el = schema.element(node.n, dataset);
    if (node.nil && node.nv?.includes(NV.NotRecorded)) {
      push(path, node.n, "warning", "notRecorded", `${label(node.n)} is empty; it will be reported as Not Recorded`);
    } else {
      push(path, node.n, "error", "required", `${label(node.n)} is required${el?.usage === "Mandatory" ? " (Mandatory)" : ""}`);
    }
  }

  function visitContainer(node, obj, path) {
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      push(path, node.n, "error", "shape", `${node.n} must be a group of fields`);
      return;
    }
    checkAttrs(node, obj.attrs, path);
    checkDemContainer(node, obj, path);
    const known = new Set(node.ch.map((c) => c.n));
    for (const key of Object.keys(obj)) {
      if (key !== "attrs" && !known.has(key)) {
        push(`${path}.${key}`, key, "error", "unknownElement", `${key} does not belong in ${node.n}`);
      }
    }
    for (const child of node.ch) visitChild(child, obj, `${path}.${child.n}`);
  }

  function visitChild(node, parent, path) {
    const repeating = node.max === null || node.max > 1;
    const raw = parent[node.n];
    if (!repeating && Array.isArray(raw)) {
      push(path, node.n, "error", "shape", `${label(node.n)} allows only one entry`);
      return;
    }
    if (repeating && raw !== undefined && raw !== null && !Array.isArray(raw)) {
      push(path, node.n, "error", "shape", `${label(node.n)} must be a list`);
      return;
    }
    let items = instancesOf(parent, node.n);
    if (node.k === "l") items = items.filter((x) => !isEmptyLeaf(x));
    if (node.max !== null && items.length > node.max) {
      push(path, node.n, "error", "tooMany", `${label(node.n)} allows at most ${node.max} entries`);
    }

    if (node.k === "l") {
      if (items.length < node.min) missing(node, path);
      items.forEach((item, i) => checkLeafValue(node, item, repeating ? `${path}[${i}]` : path));
      return;
    }

    if (items.length === 0) {
      // A required group that is absent: report what is missing inside it.
      if (node.min > 0) visitContainer(node, {}, repeating ? `${path}[0]` : path);
      return;
    }
    items.forEach((item, i) => visitContainer(node, item, repeating ? `${path}[${i}]` : path));
  }

  visitContainer(root, doc ?? {}, rootName);
  return issues;
}

/** Summary for UI badges: counts plus whether anything blocks export. */
export function summarizeNemsisIssues(issues) {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  return { errors, warnings, blocking: issues.some((i) => i.blocking), total: issues.length };
}
