/**
 * ePCR charting model. Pure.
 *
 * A patient care report is stored as the NEMSIS PatientCareReport document itself (see schema.js for the shape),
 * so charting, validation, XML export and Schematron all work on the same object with no mapping layer to drift.
 * This module adds what a charting screen needs on top of that:
 *
 *   - PCR_SECTIONS: the plain-English sections crews chart in (Dispatch, Times, Patient, Vitals, ...)
 *   - sectionLayout(): every NEMSIS field in a section as input descriptors (label, kind, code options, NV/PN),
 *     including repeating groups (vitals rows, medications, procedures, ...)
 *   - getLeaf / setLeaf / group rows: read and immutably update fields addressed by element id plus the row index
 *     of each repeating group on the way, e.g. setLeaf(schema, pcr, "eVitals.06", 142, { "eVitals.VitalGroup": 2 })
 *   - newPcr(): a new report prefilled from agency, unit, crew and CAD
 *   - postCheck(): the gate for posting (finalizing) a report: blocking issues from validateNemsis
 */
import { readLeaf, isEmptyLeaf, instancesOf, NV } from "./schema.js";
import { validateNemsis, summarizeNemsisIssues } from "./validation.js";
import { buildEmsDataSetXml } from "./xmlExport.js";

const DATASET = "EMSDataSet";
const PCR_ROOT = "PatientCareReport";
const ROOT_DEPTH = 3; // EMSDataSet / Header / PatientCareReport

export const SOFTWARE = Object.freeze({ creator: "Forge Public Safety", name: "Forge Responder ePCR" });

/** Charting sections in the order crews work a call. `containers` are the NEMSIS sections each one covers. */
export const PCR_SECTIONS = Object.freeze([
  { id: "dispatch", label: "Dispatch", containers: ["eDispatch"] },
  { id: "response", label: "Response", containers: ["eResponse"] },
  { id: "crew", label: "Crew", containers: ["eCrew"] },
  { id: "times", label: "Times", containers: ["eTimes"] },
  { id: "scene", label: "Scene", containers: ["eScene"] },
  { id: "patient", label: "Patient", containers: ["ePatient"] },
  { id: "situation", label: "Situation", containers: ["eSituation"] },
  { id: "injury", label: "Injury", containers: ["eInjury"] },
  { id: "arrest", label: "Cardiac arrest", containers: ["eArrest"] },
  { id: "history", label: "History", containers: ["eHistory"] },
  { id: "vitals", label: "Vitals", containers: ["eVitals"] },
  { id: "exam", label: "Assessment", containers: ["eExam"] },
  { id: "labs", label: "Labs and ECG", containers: ["eLabs"] },
  { id: "protocols", label: "Protocols", containers: ["eProtocols"] },
  { id: "medications", label: "Medications", containers: ["eMedications"] },
  { id: "procedures", label: "Procedures", containers: ["eProcedures"] },
  { id: "airway", label: "Airway", containers: ["eAirway"] },
  { id: "devices", label: "Devices", containers: ["eDevice"] },
  { id: "disposition", label: "Disposition", containers: ["eDisposition"] },
  { id: "narrative", label: "Narrative", containers: ["eNarrative"] },
  { id: "payment", label: "Billing", containers: ["ePayment"] },
  { id: "other", label: "Signatures and files", containers: ["eOther"] },
  { id: "outcome", label: "Hospital outcome", containers: ["eOutcome"] },
  { id: "record", label: "Report", containers: ["eRecord", "eCustomResults"] },
]);

const SECTION_BY_CONTAINER = new Map(PCR_SECTIONS.flatMap((s) => s.containers.map((c) => [c, s.id])));

/** Names for groups (the data dictionary only names leaves). Anything missing is derived from the id. */
const GROUP_LABELS = {
  "eRecord.SoftwareApplicationGroup": "Software",
  "eResponse.AgencyGroup": "Agency",
  "eResponse.ServiceGroup": "Service requested",
  "eCrew.CrewGroup": "Crew member",
  "ePatient.PatientNameGroup": "Name",
  "ePatient.AgeGroup": "Age",
  "ePayment.CertificateGroup": "Certificate of medical necessity",
  "ePayment.InsuranceGroup": "Insurance",
  "ePayment.ClosestRelativeGroup": "Closest relative or guardian",
  "ePayment.EmployerGroup": "Employer",
  "ePayment.SupplyItemGroup": "Supply used",
  "eScene.ResponderGroup": "Other responder",
  "eScene.IncidentAddressGroup": "Incident address",
  "eSituation.PatientComplaintGroup": "Complaint",
  "eSituation.WorkRelatedGroup": "Work related",
  "eInjury.CollisionGroup": "Vehicle collision",
  "eInjury.SeatGroup": "Seat",
  "eHistory.PractitionerGroup": "Practitioner",
  "eHistory.ImmunizationsGroup": "Immunization",
  "eHistory.CurrentMedsGroup": "Current medication",
  "eVitals.VitalGroup": "Vital signs",
  "eVitals.CardiacRhythmGroup": "Cardiac rhythm",
  "eVitals.BloodPressureGroup": "Blood pressure",
  "eVitals.HeartRateGroup": "Heart rate",
  "eVitals.GlasgowScoreGroup": "Glasgow Coma Scale",
  "eVitals.TemperatureGroup": "Temperature",
  "eVitals.PainScaleGroup": "Pain",
  "eVitals.StrokeScaleGroup": "Stroke scale",
  "eLabs.LabGroup": "Lab or ECG",
  "eLabs.LabResultGroup": "Result",
  "eLabs.LabImageGroup": "Image",
  "eLabs.WaveformGraphicGroup": "Waveform",
  "eExam.AssessmentGroup": "Assessment",
  "eExam.AbdomenGroup": "Abdomen",
  "eExam.SpineGroup": "Spine",
  "eExam.ExtremityGroup": "Extremity",
  "eExam.EyeGroup": "Eye",
  "eExam.LungGroup": "Lungs",
  "eExam.ChestGroup": "Chest",
  "eProtocols.ProtocolGroup": "Protocol",
  "eMedications.MedicationGroup": "Medication",
  "eMedications.DosageGroup": "Dose",
  "eProcedures.ProcedureGroup": "Procedure",
  "eAirway.ConfirmationGroup": "Airway confirmation",
  "eDevice.DeviceGroup": "Device event",
  "eDisposition.DestinationGroup": "Destination",
  "eDisposition.IncidentDispositionGroup": "Incident disposition",
  "eDisposition.HospitalTeamActivationGroup": "Hospital team activation",
  "eOutcome.ExternalDataGroup": "External record",
  "eOutcome.EmergencyDepartmentProceduresGroup": "ED procedure",
  "eOutcome.HospitalProceduresGroup": "Hospital procedure",
  "eOther.EMSCrewMemberGroup": "Crew member exposure",
  "eOther.FileGroup": "File",
  "eOther.SignatureGroup": "Signature",
  "eCustomResults.ResultsGroup": "State custom element",
};

const USAGE_RANK = { Mandatory: 0, Required: 1, Recommended: 2, Optional: 3 };
/** Shown by default: Mandatory/Required, plus national elements (the rest sit behind "More fields"). */
const isEssential = (field) => USAGE_RANK[field.usage] <= 1 || field.national;

export function groupLabel(name) {
  if (GROUP_LABELS[name]) return GROUP_LABELS[name];
  const tail = name.includes(".") ? name.slice(name.indexOf(".") + 1) : name;
  const words = tail.replace(/Group$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

const isRepeating = (node) => node.max === null || node.max > 1;

/** Element names from PatientCareReport down to `name` (exclusive of PatientCareReport). */
function pcrPath(schema, name) {
  const path = schema.pathOf(DATASET, name);
  if (!path || path[ROOT_DEPTH - 1] !== PCR_ROOT) throw new Error(`pcrModel: ${name} is not part of a PatientCareReport`);
  return path.slice(ROOT_DEPTH);
}

/** The section a validation issue path (e.g. "PatientCareReport.eVitals.eVitals.VitalGroup[0].eVitals.06") belongs to. */
export function sectionForPath(path) {
  const container = String(path).split(".")[1]?.replace(/\[\d+\]$/, "");
  return SECTION_BY_CONTAINER.get(container) ?? "record";
}

export function sectionForElement(schema, name) {
  return SECTION_BY_CONTAINER.get(pcrPath(schema, name)[0]) ?? "record";
}

// ---------------------------------------------------------------------------
// Field descriptors
// ---------------------------------------------------------------------------

function inputKind(type, repeating) {
  if (type?.enums) return repeating ? "multiselect" : "select";
  switch (type?.base) {
    case "xs:dateTime":
      return "datetime";
    case "xs:date":
      return "date";
    case "xs:integer":
    case "xs:positiveInteger":
    case "xs:decimal":
      return "number";
    case "xs:base64Binary":
      return "file";
    default:
      return Number(type?.maxLength) > 255 ? "textarea" : "text";
  }
}

/** NEMSIS lists not-values and pertinent negatives by name ("NV.NotRecorded"); show them as words ("Not Recorded"). */
function plainCodeLabel(text) {
  const m = /^(?:NV|PN)\.([A-Za-z]+)$/.exec(String(text));
  return m ? m[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2") : text;
}

/**
 * Everything a screen needs to render one NEMSIS field.
 * @returns {{ el: string, label: string, definition: string, usage: string, national: boolean, required: boolean,
 *   kind: string, repeating: boolean, options: {code: string, label: string}[]|null, nv: {code,label}[], pn: {code,label}[],
 *   min?: string, max?: string, maxLength?: number, attrs: object[] }}
 */
export function fieldInput(schema, name) {
  const node = schema.node(DATASET, name);
  if (!node || node.k !== "l") throw new Error(`pcrModel: ${name} is not a NEMSIS field`);
  const info = schema.element(name, DATASET) ?? {};
  const type = schema.type(node.t);
  const repeating = isRepeating(node);
  const codes = schema.codes(name, DATASET);
  const label = (code) => ({ code, label: plainCodeLabel(schema.codeLabel(name, code, DATASET) ?? code) });
  return {
    el: name,
    label: info.name ?? name,
    definition: info.definition ?? "",
    usage: info.usage ?? "Optional",
    national: Boolean(info.national),
    required: node.min > 0,
    kind: inputKind(type, repeating),
    repeating,
    options: type?.enums ? type.enums.map((code) => ({ code, label: codes?.[code] ?? code })) : null,
    nv: (node.nv ?? []).map(label),
    pn: (node.pn ?? []).map(label),
    ...(type?.minInclusive !== undefined && type.base !== "xs:dateTime" ? { min: type.minInclusive } : {}),
    ...(type?.maxInclusive !== undefined && type.base !== "xs:dateTime" ? { max: type.maxInclusive } : {}),
    ...(type?.maxLength !== undefined ? { maxLength: Number(type.maxLength) } : {}),
    attrs: node.a ?? [],
  };
}

/**
 * The layout of one charting section: a tree of
 *   { type: "field", field }                         a single NEMSIS field
 *   { type: "group", name, label, repeating, required, children }   a NEMSIS group (rows when repeating)
 * `essential` marks Mandatory/Required/national fields (shown by default; the rest sit behind "More fields").
 */
export function sectionLayout(schema, sectionId) {
  const section = PCR_SECTIONS.find((s) => s.id === sectionId);
  if (!section) throw new Error(`pcrModel: unknown section ${sectionId}`);
  const build = (node) => {
    if (node.k === "l") {
      const field = fieldInput(schema, node.n);
      return { type: "field", field, essential: isEssential(field) };
    }
    const children = node.ch.map(build);
    return {
      type: "group",
      name: node.n,
      label: groupLabel(node.n),
      repeating: isRepeating(node),
      required: node.min > 0,
      essential: children.some((c) => c.essential),
      children,
    };
  };
  return section.containers
    .map((name) => schema.node(DATASET, name))
    .filter(Boolean)
    .flatMap((container) => container.ch.map(build));
}

/** Every leaf in a section (flattened), e.g. for completion counts. */
export function sectionFields(schema, sectionId) {
  const out = [];
  const walk = (items) => items.forEach((item) => (item.type === "field" ? out.push(item.field) : walk(item.children)));
  walk(sectionLayout(schema, sectionId));
  return out;
}

// ---------------------------------------------------------------------------
// Reading and updating a PCR
// ---------------------------------------------------------------------------

/**
 * Walk from the PCR to the container that holds `name`, picking row `at[group] ?? 0` of each repeating group.
 * With `create`, missing containers are created (returns a new PCR with copies along the path).
 */
function locate(schema, pcr, name, at, create) {
  const names = pcrPath(schema, name);
  const root = create ? { ...(pcr ?? {}) } : pcr ?? {};
  let parent = root;
  for (const containerName of names.slice(0, -1)) {
    const node = schema.node(DATASET, containerName);
    if (isRepeating(node)) {
      const index = at?.[containerName] ?? 0;
      const rows = instancesOf(parent, containerName);
      if (!rows[index] && !create) return { root, parent: null };
      if (create) {
        const copy = [...rows];
        while (copy.length <= index) copy.push({});
        copy[index] = { ...copy[index] };
        parent[containerName] = copy;
        parent = copy[index];
      } else parent = rows[index];
    } else {
      const child = parent[containerName];
      if (!child && !create) return { root, parent: null };
      if (create) parent[containerName] = { ...(child ?? {}) };
      parent = parent[containerName];
    }
  }
  return { root, parent, leaf: names.at(-1) };
}

/**
 * The validation issue path of a field (as validateNemsis reports it), e.g.
 * fieldPath(schema, "eVitals.06", { "eVitals.VitalGroup": 2 }) → "PatientCareReport.eVitals.eVitals.VitalGroup[2].eVitals.BloodPressureGroup.eVitals.06".
 * Repeating fields get "[i]" per value in issues; match those with startsWith(fieldPath(...)).
 */
export function fieldPath(schema, name, at = {}) {
  const parts = [PCR_ROOT];
  const names = pcrPath(schema, name);
  names.forEach((n, i) => {
    const node = schema.node(DATASET, n);
    const last = i === names.length - 1;
    parts.push(!last && isRepeating(node) ? `${n}[${at?.[n] ?? 0}]` : n);
  });
  return parts.join(".");
}

/**
 * Merge a change into a stored leaf and return its simplest stored form: a plain value when there is nothing
 * else, otherwise { value?, NV?, PN?, attrs? }; undefined when empty. Pass `undefined` in the patch to clear a part.
 */
export function composeLeaf(previous, patch) {
  const next = { ...readLeaf(previous), ...patch };
  if (next.attrs) {
    next.attrs = Object.fromEntries(Object.entries(next.attrs).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    if (!Object.keys(next.attrs).length) delete next.attrs;
  }
  for (const key of ["value", "NV", "PN"]) {
    if (next[key] === undefined || next[key] === null || next[key] === "") delete next[key];
  }
  const keys = Object.keys(next);
  if (!keys.length) return undefined;
  if (keys.length === 1 && keys[0] === "value") return next.value;
  return next;
}

/** Raw stored value of a field (value, array of values, or {value, NV, PN, attrs}); undefined when unset. */
export function getLeaf(schema, pcr, name, at = {}) {
  const { parent, leaf } = locate(schema, pcr, name, at, false);
  return parent ? parent[leaf ?? name] : undefined;
}

/** Plain value of a single field (ignores NV/PN), or undefined. */
export function getValue(schema, pcr, name, at = {}) {
  return readLeaf(getLeaf(schema, pcr, name, at)).value;
}

/**
 * Set a field and return the new PCR (the input is not changed). Empty values ("" / null / undefined / [] /
 * a leaf with nothing in it) remove the field. Repeating fields take an array.
 */
export function setLeaf(schema, pcr, name, value, at = {}) {
  const { root, parent, leaf } = locate(schema, pcr, name, at, true);
  const empty = value === undefined || value === null || (Array.isArray(value) ? value.every(isEmptyLeaf) : isEmptyLeaf(value));
  if (empty) delete parent[leaf];
  else parent[leaf] = Array.isArray(value) ? value.filter((v) => !isEmptyLeaf(v)) : value;
  return root;
}

/** Set a "not value" (NV) on a field, e.g. Not Applicable. Clears the value. */
export function setNotValue(schema, pcr, name, nv, at = {}) {
  return setLeaf(schema, pcr, name, nv ? { NV: nv } : undefined, at);
}

/** Rows of a repeating group (inside the rows of its parent groups picked by `at`). */
export function groupRows(schema, pcr, group, at = {}) {
  const node = schema.node(DATASET, group);
  if (!node || node.k !== "c") throw new Error(`pcrModel: ${group} is not a NEMSIS group`);
  const names = pcrPath(schema, group);
  let parent = pcr ?? {};
  for (const containerName of names.slice(0, -1)) {
    const n = schema.node(DATASET, containerName);
    parent = isRepeating(n) ? instancesOf(parent, containerName)[at?.[containerName] ?? 0] : parent[containerName];
    if (!parent) return [];
  }
  return instancesOf(parent, group);
}

function replaceRows(schema, pcr, group, rows, at) {
  const names = pcrPath(schema, group);
  const root = { ...(pcr ?? {}) };
  let parent = root;
  for (const containerName of names.slice(0, -1)) {
    const n = schema.node(DATASET, containerName);
    if (isRepeating(n)) {
      const index = at?.[containerName] ?? 0;
      const copy = [...instancesOf(parent, containerName)];
      while (copy.length <= index) copy.push({});
      copy[index] = { ...copy[index] };
      parent[containerName] = copy;
      parent = copy[index];
    } else {
      parent[containerName] = { ...(parent[containerName] ?? {}) };
      parent = parent[containerName];
    }
  }
  if (rows.length) parent[group] = rows;
  else delete parent[group];
  return root;
}

/** Append a row to a repeating group. Returns { pcr, index }. */
export function addGroupRow(schema, pcr, group, row = {}, at = {}) {
  const rows = [...groupRows(schema, pcr, group, at), row];
  return { pcr: replaceRows(schema, pcr, group, rows, at), index: rows.length - 1 };
}

/** Remove one row of a repeating group. */
export function removeGroupRow(schema, pcr, group, index, at = {}) {
  const rows = groupRows(schema, pcr, group, at).filter((_, i) => i !== index);
  return replaceRows(schema, pcr, group, rows, at);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const pad = (n) => String(Math.abs(Math.trunc(n))).padStart(2, "0");

/** NEMSIS date/time with the device's UTC offset, to the second: 2026-11-17T14:03:00-06:00. */
export function nemsisDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

/** NEMSIS date/time → value for <input type="datetime-local"> (device time). */
export function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** <input type="datetime-local"> value → NEMSIS date/time with offset. */
export function fromLocalInput(value) {
  if (!value) return "";
  const withSeconds = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  return nemsisDateTime(new Date(withSeconds));
}

// ---------------------------------------------------------------------------
// New report, summary, posting
// ---------------------------------------------------------------------------

/**
 * A new PCR prefilled with what is known before patient contact.
 * @param {object} schema
 * @param {{ uuid: string, number: string, softwareVersion: string,
 *   agency: { number: string, name?: string },
 *   unit?: { vehicleNumber?: string, callSign?: string },
 *   incidentNumber?: string, responseNumber?: string,
 *   crew?: { id: string, level?: string, roles?: string[] }[],
 *   cad?: { id?: string, notified?: string, enRoute?: string, onScene?: string, dispatchReason?: string } }} input
 */
export function newPcr(schema, input) {
  if (!input?.uuid) throw new Error("newPcr: uuid is required (PatientCareReport/@UUID, fixed on the device)");
  let pcr = { attrs: { UUID: input.uuid } };
  const set = (name, value, at) => {
    if (value !== undefined && value !== null && value !== "") pcr = setLeaf(schema, pcr, name, value, at);
  };
  set("eRecord.01", input.number);
  set("eRecord.02", SOFTWARE.creator);
  set("eRecord.03", SOFTWARE.name);
  set("eRecord.04", input.softwareVersion);
  set("eResponse.01", input.agency?.number);
  set("eResponse.02", input.agency?.name);
  set("eResponse.03", input.incidentNumber);
  set("eResponse.04", input.responseNumber);
  set("eResponse.13", input.unit?.vehicleNumber);
  set("eResponse.14", input.unit?.callSign);
  set("eDispatch.01", input.cad?.dispatchReason);
  set("eDispatch.04", input.cad?.id);
  set("eTimes.03", input.cad?.notified);
  set("eTimes.05", input.cad?.enRoute);
  set("eTimes.06", input.cad?.onScene);
  (input.crew ?? []).forEach((member, index) => {
    const at = { "eCrew.CrewGroup": index };
    set("eCrew.01", member.id, at);
    set("eCrew.02", member.level, at);
    if (member.roles?.length) set("eCrew.03", member.roles, at);
  });
  return pcr;
}

/** Short description for lists: patient, age, impression, date. Contains PHI; for on-device and RMS lists only. */
export function pcrSummary(schema, pcr) {
  const v = (name) => getValue(schema, pcr, name);
  const name = [v("ePatient.03"), v("ePatient.02")].filter(Boolean).join(" ");
  const age = v("ePatient.15");
  const units = v("ePatient.16");
  const unitLabel = units ? (schema.codeLabel("ePatient.16", units) ?? "").toLowerCase() : "";
  const impressionCode = v("eSituation.11");
  return {
    number: v("eRecord.01") ?? "",
    patient: name || "Unknown patient",
    age: age !== undefined ? `${age}${unitLabel ? ` ${unitLabel}` : ""}` : "",
    impression: impressionCode ?? "",
    complaint: v("eSituation.04") ?? "",
    notified: v("eTimes.03") ?? "",
    unit: v("eResponse.14") ?? v("eResponse.13") ?? "",
  };
}

/** Validation issues grouped by charting section id. */
export function issuesBySection(issues) {
  const out = {};
  for (const issue of issues) (out[sectionForPath(issue.path)] ??= []).push(issue);
  return out;
}

/**
 * Can this report be posted (finalized)? NEMSIS: a record with [ERROR] issues must not be finalized.
 * Server-side Schematron (national + state) runs again when the report is posted.
 */
export function postCheck(schema, pcr, options = {}) {
  const issues = validateNemsis(schema, DATASET, pcr, { rootName: PCR_ROOT, now: options.now });
  const summary = summarizeNemsisIssues(issues);
  return {
    ok: !summary.blocking,
    summary,
    issues,
    blocking: issues.filter((i) => i.blocking),
    warnings: issues.filter((i) => !i.blocking),
    bySection: issuesBySection(issues),
  };
}

/** EMSDataSet XML for one PCR. The UUID comes from the PCR (attrs.UUID) unless given. */
export function pcrXml(schema, { agency, uuid, pcr }, options) {
  const id = uuid ?? pcr?.attrs?.UUID;
  if (!id) throw new Error("pcrXml: the report has no UUID");
  return buildEmsDataSetXml(schema, { agency, reports: [{ uuid: id, data: pcr }] }, options);
}

/** Plain text for one stored field: code labels, "Not recorded" style not-values, pertinent negatives. */
export function leafText(field, raw) {
  const label = (list, code) => list?.find((o) => o.code === String(code))?.label ?? String(code);
  const one = (item) => {
    const leaf = readLeaf(item);
    const parts = [];
    if (leaf.value !== undefined) {
      if (field.kind === "file") parts.push("Attached file");
      else parts.push(field.options ? label(field.options, leaf.value) : String(leaf.value));
    }
    if (leaf.NV) parts.push(label(field.nv, leaf.NV));
    if (leaf.PN) parts.push(label(field.pn, leaf.PN));
    return parts.join(" — ");
  };
  return (Array.isArray(raw) ? raw : [raw]).filter((item) => !isEmptyLeaf(item)).map(one).filter(Boolean);
}

/**
 * The filled-in part of a section for read-only review: fields with their text, and repeating groups with one
 * entry per row. Empty fields and groups are left out.
 * @returns {({type: "field", el: string, label: string, kind: string, values: string[]}
 *   | {type: "group", name: string, label: string, rows: object[][]})[]}
 */
export function sectionReadout(schema, pcr, sectionId) {
  const walk = (items, at) => items.flatMap((item) => {
    if (item.type === "field") {
      const values = leafText(item.field, getLeaf(schema, pcr, item.el ?? item.field.el, at));
      return values.length ? [{ type: "field", el: item.field.el, label: item.field.label, kind: item.field.kind, values }] : [];
    }
    if (item.repeating) {
      const rows = groupRows(schema, pcr, item.name, at)
        .map((_, index) => walk(item.children, { ...at, [item.name]: index }))
        .filter((row) => row.length);
      return rows.length ? [{ type: "group", name: item.name, label: item.label, rows }] : [];
    }
    const inner = walk(item.children, at);
    return inner.length ? [{ type: "group", name: item.name, label: item.label, rows: [inner] }] : [];
  });
  return walk(sectionLayout(schema, sectionId), {});
}

/** Essential fields filled in vs total, per section (for progress chips). */
export function sectionProgress(schema, pcr) {
  const out = {};
  for (const section of PCR_SECTIONS) {
    const essential = sectionFields(schema, section.id).filter(isEssential);
    const filled = essential.filter((f) => {
      const raw = getAnyLeaf(schema, pcr, f.el);
      return raw.some((x) => !isEmptyLeaf(x));
    });
    out[section.id] = { filled: filled.length, total: essential.length };
  }
  return out;
}

/** All stored instances of a field across every row of its groups (flattened). */
function getAnyLeaf(schema, pcr, name) {
  let level = [pcr ?? {}];
  for (const containerName of pcrPath(schema, name)) {
    level = level.flatMap((parent) => instancesOf(parent, containerName));
  }
  return level;
}

export { NV };
