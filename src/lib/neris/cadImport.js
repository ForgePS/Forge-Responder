/**
 * Parse CAD dispatch payloads (JSON, CSV, XML, or key-value text) and map to NERIS workspace fields.
 */

/** @typedef {"paste" | "file-json" | "file-csv" | "file-xml"} CadImportSourceType */

/**
 * @typedef {{
 *   cad?: Record<string, unknown>,
 *   incidentAddress?: string,
 *   incidentDate?: string,
 *   incidentTypeSummary?: string,
 *   units?: Array<Record<string, unknown>>,
 *   raw?: Record<string, unknown>,
 * }} CadImportPayload
 */

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   value: string,
 *   target: string,
 * }} CadImportPreviewField
 */

const CAD_FIELD_ALIASES = {
  incidentNumber: [
    "incidentnumber", "incident_number", "incidentno", "incident_no", "incidentid", "incident_id",
    "callnumber", "call_number", "cadcallnumber", "cad_call_number", "dispatchid", "dispatch_id",
    "eventnumber", "event_number", "masterincidentnumber",
  ],
  cadCallNumber: [
    "cadcallnumber", "cad_call_number", "callid", "call_id", "callno", "call_no", "cadid", "cad_id",
    "incidentnumber", "incident_number",
  ],
  dispatchTime: [
    "dispatchtime", "dispatch_time", "dispatchedat", "dispatched_at", "alarmtime", "alarm_time",
    "calltime", "call_time", "createdat", "created_at", "timeofcall", "time_of_call",
  ],
  arrivalTime: [
    "arrivaltime", "arrival_time", "onscenetime", "on_scene_time", "atscenetime", "at_scene_time",
    "firstarrival", "first_arrival",
  ],
  clearTime: [
    "cleartime", "clear_time", "clearedat", "cleared_at", "closedtime", "closed_time", "endtime", "end_time",
  ],
  priority: ["priority", "callpriority", "call_priority", "dispatchpriority", "dispatch_priority"],
  alarmLevel: ["alarmlevel", "alarm_level", "alarms", "boxalarm", "box_alarm"],
  initialComments: [
    "initialcomments", "initial_comments", "comments", "comment", "narrative", "remarks", "notes",
    "problem", "nature", "calltype", "call_type", "incidenttype", "incident_type", "description",
    "dispatchnotes", "dispatch_notes",
  ],
  address: [
    "address", "incidentaddress", "incident_address", "location", "fulladdress", "full_address",
    "streetaddress", "street_address", "locationaddress", "location_address",
  ],
  incidentType: [
    "incidenttype", "incident_type", "calltype", "call_type", "type", "nature", "problem", "eventtype", "event_type",
  ],
};

const UNIT_FIELD_ALIASES = {
  unitId: ["unitid", "unit_id", "unit", "apparatus", "resource", "resourcename", "resource_name", "designation"],
  apparatusType: ["apparatustype", "apparatus_type", "type", "unittype", "unit_type"],
  dispatchTime: ["dispatchtime", "dispatch_time", "assignedtime", "assigned_time"],
  enrouteTime: ["enroutetime", "enroute_time", "respondingtime", "responding_time"],
  arrivalTime: ["arrivaltime", "arrival_time", "onscenetime", "on_scene_time"],
  clearTime: ["cleartime", "clear_time", "availabletime", "available_time"],
  station: ["station", "firestation", "fire_station", "home_station"],
};

/**
 * @param {string} raw
 * @param {string} [filename]
 */
export function parseCadPayload(raw, filename = "") {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { ok: false, errors: ["No CAD data provided."], payload: null };
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const errors = [];

  try {
    if (ext === "csv" || looksLikeCsv(trimmed)) {
      const payload = mapRawToCadPayload(parseCsv(trimmed));
      return validatePayload(payload, errors, "file-csv");
    }
    if (ext === "xml" || trimmed.startsWith("<")) {
      const payload = mapRawToCadPayload(parseXml(trimmed));
      return validatePayload(payload, errors, "file-xml");
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const payload = mapRawToCadPayload(JSON.parse(trimmed));
      return validatePayload(payload, errors, "file-json");
    }
    const payload = mapRawToCadPayload(parseStructuredText(trimmed));
    return validatePayload(payload, errors, "paste");
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : "Unable to parse CAD payload."],
      payload: null,
    };
  }
}

/**
 * @param {File} file
 * @returns {Promise<{ ok: boolean, errors: string[], payload: CadImportPayload | null, sourceType?: CadImportSourceType, filename?: string }>}
 */
export async function parseCadFile(file) {
  const text = await file.text();
  const result = parseCadPayload(text, file.name);
  return { ...result, filename: file.name };
}

/**
 * @param {CadImportPayload} payload
 * @returns {CadImportPreviewField[]}
 */
export function buildCadImportPreview(payload) {
  if (!payload) return [];
  const fields = [];

  const cad = payload.cad || {};
  const cadLabels = {
    incidentNumber: "Incident number",
    cadCallNumber: "CAD call number",
    dispatchTime: "Dispatch time",
    arrivalTime: "Arrival time",
    clearTime: "Clear time",
    priority: "Priority",
    alarmLevel: "Alarm level",
    initialComments: "Dispatch comments",
  };

  for (const [key, label] of Object.entries(cadLabels)) {
    const value = cad[key];
    if (value != null && String(value).trim()) {
      fields.push({ key, label, value: String(value), target: `workspace.cad.${key}` });
    }
  }

  if (payload.incidentAddress) {
    fields.push({
      key: "incidentAddress",
      label: "Incident address",
      value: payload.incidentAddress,
      target: "incidentAddress",
    });
  }
  if (payload.incidentDate) {
    fields.push({
      key: "incidentDate",
      label: "Incident date",
      value: payload.incidentDate,
      target: "incidentDate",
    });
  }
  if (payload.incidentTypeSummary) {
    fields.push({
      key: "incidentTypeSummary",
      label: "Incident type",
      value: payload.incidentTypeSummary,
      target: "incidentTypeSummary",
    });
  }

  (payload.units || []).forEach((unit, index) => {
    const unitId = unit.unitId || `Unit ${index + 1}`;
    for (const [field, val] of Object.entries(unit)) {
      if (!val || field === "source") continue;
      fields.push({
        key: `unit-${index}-${field}`,
        label: `${unitId} — ${humanize(field)}`,
        value: String(val),
        target: `workspace.units[${index}].${field}`,
      });
    }
  });

  return fields;
}

/**
 * Merge CAD import into a NERIS report.
 * @param {Record<string, unknown>} report
 * @param {CadImportPayload} payload
 * @param {{ sourceType: CadImportSourceType, filename?: string, pastedPreview?: string }} meta
 */
export function applyCadImport(report, payload, meta) {
  const workspace = { ...(report.workspace || {}) };
  const autoPopulateSources = { ...(report.autoPopulateSources || {}) };
  const cad = { ...(workspace.cad || {}), ...(payload.cad || {}) };
  workspace.cad = cad;

  for (const key of Object.keys(payload.cad || {})) {
    if (payload.cad?.[key] != null && String(payload.cad[key]).trim()) {
      autoPopulateSources[`workspace.cad.${key}`] = "cad-import";
    }
  }
  autoPopulateSources["workspace.cad"] = "cad-import";

  let units = [...(workspace.units || [])];
  if (payload.units?.length) {
    const imported = payload.units.map((unit) => ({
      ...unit,
      source: "cad-import",
    }));
    units = mergeUnits(units, imported);
    autoPopulateSources["workspace.units"] = "cad-import";
  }
  workspace.units = units;

  const patch = {
    workspace,
    autoPopulateSources,
    cadImportAudit: {
      sourceType: meta.sourceType,
      filename: meta.filename || null,
      importedAt: new Date().toISOString(),
      fieldCount: buildCadImportPreview(payload).length,
      preview: meta.pastedPreview?.slice(0, 500) || null,
    },
    completionPercentage: undefined,
  };

  if (payload.incidentAddress) {
    patch.incidentAddress = payload.incidentAddress;
    autoPopulateSources.incidentAddress = "cad-import";
  }
  if (payload.incidentDate) {
    patch.incidentDate = payload.incidentDate;
    autoPopulateSources.incidentDate = "cad-import";
  }
  if (payload.incidentTypeSummary) {
    patch.incidentTypeSummary = payload.incidentTypeSummary;
    autoPopulateSources.incidentTypeSummary = "cad-import";
  }

  const auditLog = [...(workspace.auditLog || [])];
  auditLog.push({
    action: "cad_import",
    sourceType: meta.sourceType,
    filename: meta.filename || null,
    timestamp: new Date().toISOString(),
    fields: buildCadImportPreview(payload).map((f) => f.target),
  });
  patch.workspace = { ...patch.workspace, auditLog };

  return { ...report, ...patch, autoPopulateSources };
}

/**
 * Refresh CAD-related fields from report metadata (no external connector required).
 * @param {Record<string, unknown>} report
 */
export function refreshCadInfo(report) {
  const workspace = { ...(report.workspace || {}) };
  const autoPopulateSources = { ...(report.autoPopulateSources || {}) };
  const existing = workspace.cad || {};

  workspace.cad = {
    ...existing,
    incidentNumber: existing.incidentNumber || report.reportNumber || "",
    cadCallNumber: existing.cadCallNumber || report.cadIncidentId || report.reportNumber || "",
    dispatchTime: existing.dispatchTime || "",
    priority: existing.priority || "Routine",
    alarmLevel: existing.alarmLevel || "1",
  };
  autoPopulateSources["workspace.cad"] = "cad";

  const auditLog = [...(workspace.auditLog || [])];
  auditLog.push({
    action: "cad_refresh",
    timestamp: new Date().toISOString(),
  });

  return {
    ...report,
    workspace: { ...workspace, auditLog },
    autoPopulateSources,
    completionPercentage: undefined,
  };
}

/** @param {string} text */
function looksLikeCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return false;
  const header = lines[0];
  return header.includes(",") && !header.trim().startsWith("{");
}

/** @param {string} text */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return {};
  const headers = splitCsvLine(lines[0]).map(normalizeKey);
  const row = splitCsvLine(lines[1] || "");
  const record = {};
  headers.forEach((header, i) => {
    record[header] = row[i]?.trim() || "";
  });

  const units = [];
  for (let i = 2; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
  if (!values.some(Boolean)) continue;
    const unitRow = {};
    headers.forEach((header, idx) => {
      unitRow[header] = values[idx]?.trim() || "";
    });
    if (pickAlias(unitRow, UNIT_FIELD_ALIASES.unitId)) {
      units.push(unitRow);
    }
  }

  if (units.length) record.units = units;
  return record;
}

/** @param {string} line */
function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.replace(/^"|"$/g, "").trim());
}

/** @param {string} text */
function parseXml(text) {
  if (typeof DOMParser === "undefined") {
    throw new Error("XML parsing is not available in this environment.");
  }
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Invalid XML document.");

  const record = {};
  const root = doc.documentElement;
  collectXmlFields(root, record, "");

  const unitNodes = [
    ...root.querySelectorAll("unit, Unit, apparatus, Apparatus, resource, Resource"),
  ];
  if (unitNodes.length) {
    record.units = unitNodes.map((node) => {
      const unit = {};
      collectXmlFields(node, unit, "");
      return unit;
    });
  }

  return record;
}

/**
 * @param {Element} node
 * @param {Record<string, string>} target
 * @param {string} prefix
 */
function collectXmlFields(node, target, prefix) {
  for (const child of node.children) {
    const key = normalizeKey(child.tagName);
    const value = child.textContent?.trim() || "";
    if (!value) continue;
    if (child.children.length) {
      collectXmlFields(child, target, `${prefix}${key}_`);
    } else {
      target[`${prefix}${key}`] = value;
    }
  }
}

/** @param {string} text */
function parseStructuredText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const record = {};
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (!match) continue;
      record[normalizeKey(match[1])] = match[2].trim();
    }
    if (!Object.keys(record).length) {
      throw new Error("Could not parse text. Paste JSON or key: value lines.");
    }
    return record;
  }
}

/**
 * @param {unknown} raw
 * @returns {CadImportPayload}
 */
function mapRawToCadPayload(raw) {
  const source = flattenRecord(raw);
  const cad = {
    incidentNumber: pickAlias(source, CAD_FIELD_ALIASES.incidentNumber),
    cadCallNumber: pickAlias(source, CAD_FIELD_ALIASES.cadCallNumber),
    dispatchTime: normalizeDateTime(pickAlias(source, CAD_FIELD_ALIASES.dispatchTime)),
    arrivalTime: normalizeDateTime(pickAlias(source, CAD_FIELD_ALIASES.arrivalTime)),
    clearTime: normalizeDateTime(pickAlias(source, CAD_FIELD_ALIASES.clearTime)),
    priority: pickAlias(source, CAD_FIELD_ALIASES.priority),
    alarmLevel: pickAlias(source, CAD_FIELD_ALIASES.alarmLevel),
    initialComments: pickAlias(source, CAD_FIELD_ALIASES.initialComments),
  };

  const incidentAddress = pickAlias(source, CAD_FIELD_ALIASES.address);
  const incidentTypeSummary = pickAlias(source, CAD_FIELD_ALIASES.incidentType);
  const dispatchTime = cad.dispatchTime;
  const incidentDate = dispatchTime ? dispatchTime.slice(0, 10) : undefined;

  let units = [];
  const rawUnits = source.units || source.resources || source.apparatus || source.assignedunits;
  if (Array.isArray(rawUnits)) {
    units = rawUnits.map((unit) => mapUnitRecord(flattenRecord(unit))).filter((u) => u.unitId);
  } else if (typeof rawUnits === "string" && rawUnits.trim()) {
    units = rawUnits.split(/[;,]/).map((part) => mapUnitRecord({ unit: part.trim() })).filter((u) => u.unitId);
  }

  return {
    cad: Object.fromEntries(Object.entries(cad).filter(([, v]) => v != null && String(v).trim())),
    incidentAddress: incidentAddress || undefined,
    incidentDate: incidentDate || undefined,
    incidentTypeSummary: incidentTypeSummary || undefined,
    units,
    raw: source,
  };
}

/** @param {Record<string, unknown>} source */
function mapUnitRecord(source) {
  return {
    unitId: pickAlias(source, UNIT_FIELD_ALIASES.unitId) || "",
    apparatusType: pickAlias(source, UNIT_FIELD_ALIASES.apparatusType) || "",
    station: pickAlias(source, UNIT_FIELD_ALIASES.station) || "",
    dispatchTime: normalizeDateTime(pickAlias(source, UNIT_FIELD_ALIASES.dispatchTime)) || "",
    enrouteTime: normalizeDateTime(pickAlias(source, UNIT_FIELD_ALIASES.enrouteTime)) || "",
    arrivalTime: normalizeDateTime(pickAlias(source, UNIT_FIELD_ALIASES.arrivalTime)) || "",
    clearTime: normalizeDateTime(pickAlias(source, UNIT_FIELD_ALIASES.clearTime)) || "",
  };
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function flattenRecord(value) {
  if (!value || typeof value !== "object") return {};
  if (Array.isArray(value)) {
    if (value.length === 1 && typeof value[0] === "object") return flattenRecord(value[0]);
    return { units: value };
  }

  const record = {};
  for (const [key, val] of Object.entries(value)) {
    const normKey = normalizeKey(key);
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = flattenRecord(val);
      for (const [nestedKey, nestedVal] of Object.entries(nested)) {
        record[nestedKey] = nestedVal;
        record[`${normKey}_${nestedKey}`] = nestedVal;
      }
    } else {
      record[normKey] = val;
    }
  }
  return record;
}

/** @param {Record<string, unknown>} source @param {string[]} aliases */
function pickAlias(source, aliases) {
  for (const alias of aliases) {
    const val = source[alias];
    if (val != null && String(val).trim()) return String(val).trim();
  }
  return "";
}

/** @param {string} value */
function normalizeDateTime(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 16);
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const iso = parsed.toISOString();
    return iso.slice(0, 16);
  }
  return trimmed;
}

/** @param {string} key */
function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** @param {string} key */
function humanize(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * @param {Array<Record<string, unknown>>} existing
 * @param {Array<Record<string, unknown>>} imported
 */
function mergeUnits(existing, imported) {
  if (!existing.length) return imported;
  const byId = new Map(existing.map((unit) => [String(unit.unitId).toLowerCase(), unit]));
  for (const unit of imported) {
    const key = String(unit.unitId).toLowerCase();
    if (byId.has(key)) {
      byId.set(key, { ...byId.get(key), ...unit, source: "cad-import" });
    } else {
      byId.set(key, unit);
    }
  }
  return [...byId.values()];
}

/**
 * @param {CadImportPayload | null} payload
 * @param {string[]} errors
 * @param {CadImportSourceType} sourceType
 */
function validatePayload(payload, errors, sourceType) {
  const preview = buildCadImportPreview(payload);
  if (!preview.length) {
    errors.push("No recognizable CAD fields were found. Check the payload format.");
    return { ok: false, errors, payload: null };
  }
  return { ok: true, errors: [], payload, sourceType };
}
