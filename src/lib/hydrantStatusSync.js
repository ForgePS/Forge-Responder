export const HYDRANT_FLOW_STANDARDS = [
  { code: "B", className: "Class AA", colorName: "Blue", gpm: "1500+ gpm", color: "#2563eb" },
  { code: "G", className: "Class A", colorName: "Green", gpm: "1000-1499 gpm", color: "#16a34a" },
  { code: "O", className: "Class B", colorName: "Orange", gpm: "500-999 gpm", color: "#f97316" },
  { code: "R", className: "Class C", colorName: "Red", gpm: "0-499 gpm", color: "#dc2626" },
];

export const HYDRANT_STATUS_OPTIONS = [
  "In Service",
  "Out of Service",
  "Needs Repair",
  "Private Hydrant (Do Not Test)",
];

export const HYDRANT_NFPA_CLASS_OPTIONS = [
  "Class AA",
  "Class A",
  "Class B",
  "Class C",
  "Out of Service",
  "Not Tested",
];

export const HYDRANT_FLOW_RESULT_OPTIONS = ["B", "G", "O", "R", "OOS", "UK"];

export function flowStandardForCode(code = "") {
  return HYDRANT_FLOW_STANDARDS.find((item) => item.code === String(code || "").trim().toUpperCase()) || null;
}

export function flowCodeForClass(className = "") {
  const standard = HYDRANT_FLOW_STANDARDS.find((item) => item.className === String(className || "").trim());
  if (standard) return standard.code;
  if (String(className || "").trim() === "Out of Service") return "OOS";
  return "UK";
}

export function nfpaClassForGpm(gpm) {
  const n = Number(gpm);
  if (!Number.isFinite(n) || n <= 0) return "Not Tested";
  if (n >= 1500) return "Class AA";
  if (n >= 1000) return "Class A";
  if (n >= 500) return "Class B";
  return "Class C";
}

export function flowCodeForGpm(gpm) {
  return flowCodeForClass(nfpaClassForGpm(gpm));
}

export function nfpaColorNameForClass(label = "") {
  const standard = HYDRANT_FLOW_STANDARDS.find((item) => item.className === String(label || "").trim());
  if (standard) return standard.colorName;
  if (String(label || "").trim() === "Out of Service") return "Black";
  return "Unknown";
}

export function nfpaColorForClass(label = "") {
  const standard = HYDRANT_FLOW_STANDARDS.find((item) => item.className === String(label || "").trim());
  if (standard) return standard.color;
  if (String(label || "").trim() === "Out of Service") return "#050505";
  return "#64748b";
}

export function isPrivateHydrantId(hydrantId = "") {
  return /P$/i.test(String(hydrantId || "").trim());
}

function isOutOfServiceStatus(status = "") {
  return /out of service/i.test(String(status || ""));
}

function isPrivateStatus(status = "") {
  return /private/i.test(String(status || ""));
}

function isNeedsRepairStatus(status = "") {
  return /needs repair/i.test(String(status || ""));
}

function isOutOfServiceClass(className = "") {
  return String(className || "").trim() === "Out of Service";
}

function isOosFlowResult(flowResult = "") {
  const upper = String(flowResult || "").trim().toUpperCase();
  return upper === "OOS" || /out of service/i.test(String(flowResult || ""));
}

function clearOutOfServiceMarkers(hydrant = {}, { gpm } = {}) {
  const next = { ...hydrant };
  const numericGpm = Number(gpm ?? next.flow_gpm);

  if (isOutOfServiceClass(next.nfpa_class)) {
    next.nfpa_class = Number.isFinite(numericGpm) && numericGpm > 0
      ? nfpaClassForGpm(numericGpm)
      : "Not Tested";
  }
  if (isOosFlowResult(next.flow_result)) {
    next.flow_result = Number.isFinite(numericGpm) && numericGpm > 0
      ? flowCodeForGpm(numericGpm)
      : "UK";
  }
  if (String(next.nfpa_color || "").trim() === "Black" && isOutOfServiceClass(hydrant.nfpa_class)) {
    next.nfpa_color = nfpaColorNameForClass(next.nfpa_class);
  }
  return next;
}

function serviceableStatusFromRecord(hydrant = {}) {
  if (isNeedsRepairStatus(hydrant.status)) return "Needs Repair";
  if (isOutOfServiceStatus(hydrant.status)) return "In Service";
  return String(hydrant.status || "").trim() || "In Service";
}

function isServiceableStatus(status = "") {
  return !isOutOfServiceStatus(status) && !isPrivateStatus(status);
}

function calculateHydrantFlowGpm(hydrant = {}) {
  const diameter = Number(hydrant.discharge_size || 2.5);
  const pitot = Number(hydrant.pitot_psi);
  if (!Number.isFinite(diameter) || !Number.isFinite(pitot) || pitot <= 0) return "";
  return Math.round(29.83 * 0.9 * diameter ** 2 * Math.sqrt(pitot));
}

function resolveNumericGpm(hydrant = {}, overrideGpm) {
  const candidates = [overrideGpm, hydrant?.flow_gpm];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return calculateHydrantFlowGpm(hydrant) || "";
}

/** Static inventory often stores flow class codes in flow_gpm (for example "B"). Normalize before display. */
export function normalizeHydrantFlowFields(hydrant = {}) {
  const next = { ...hydrant };
  const gpmText = String(next.flow_gpm ?? "").trim();
  const upper = gpmText.toUpperCase();

  if (gpmText && !Number.isFinite(Number(gpmText))) {
    if (/^OOS$/i.test(upper) || /out of service/i.test(gpmText)) {
      if (!next.flow_result || next.flow_result === "UK") next.flow_result = "OOS";
    } else if (/^[BGOR]$/.test(upper)) {
      if (!next.flow_result || next.flow_result === "UK") next.flow_result = upper;
    }
    next.flow_gpm = "";
  }

  const numericGpm = Number(next.flow_gpm);
  if (!Number.isFinite(numericGpm) || numericGpm <= 0) {
    const calculated = calculateHydrantFlowGpm(next);
    if (calculated) next.flow_gpm = calculated;
  }

  return next;
}

export function normalizeFlowResultCode(flowResult = "", nfpaClass = "", flowGpm = "") {
  const raw = String(flowResult || "").trim();
  const upper = raw.toUpperCase();
  if (nfpaClass === "Out of Service") return "OOS";
  if (!raw) {
    if (nfpaClass && nfpaClass !== "Not Tested") return flowCodeForClass(nfpaClass);
    return "UK";
  }
  if (upper === "OOS" || /out of service/i.test(raw)) return "OOS";
  const byCode = flowStandardForCode(upper);
  if (byCode) return byCode.code;
  const byClass = HYDRANT_FLOW_STANDARDS.find((item) => raw.includes(item.className) || nfpaClass === item.className);
  if (byClass) return byClass.code;
  const gpm = Number(String(flowGpm || raw).replace(/[^0-9.]/g, ""));
  if (Number.isFinite(gpm) && gpm > 0) return flowCodeForGpm(gpm);
  return "UK";
}

function outOfServiceRecord(base = {}) {
  return {
    ...base,
    status: "Out of Service",
    flow_result: "OOS",
    nfpa_class: "Out of Service",
    nfpa_color: "Black",
  };
}

function privateRecord(base = {}) {
  return {
    ...base,
    status: "Private Hydrant (Do Not Test)",
    flow_result: "UK",
    nfpa_class: "Not Tested",
    nfpa_color: "Unknown",
  };
}

function untestedRecord(base = {}, status = "In Service") {
  return {
    ...base,
    status,
    flow_result: "UK",
    nfpa_class: "Not Tested",
    nfpa_color: "Unknown",
  };
}

function flowRecordFromClass(base = {}, className = "", status = "In Service") {
  if (className === "Out of Service") return outOfServiceRecord(base);
  if (className === "Not Tested") return untestedRecord(base, status);
  const standard = flowStandardForCode(flowCodeForClass(className));
  if (!standard) return untestedRecord(base, status);
  return {
    ...base,
    status,
    flow_result: standard.code,
    nfpa_class: standard.className,
    nfpa_color: standard.colorName,
  };
}

function flowRecordFromGpm(base = {}, gpm, status = "In Service") {
  const n = Number(gpm);
  if (!Number.isFinite(n) || n <= 0) return base;
  return flowRecordFromClass({ ...base, flow_gpm: n }, nfpaClassForGpm(n), status);
}

/** Keep operational status, NFPA class, and flow code aligned. */
export function coupleHydrantStatusRecord(hydrant = {}, options = {}) {
  const { gpm } = options;
  let next = { ...hydrant };
  const rawStatus = String(next.status ?? "").trim();
  const status = rawStatus || "In Service";
  const effectiveGpm = resolveNumericGpm(next, gpm);
  let nfpaClass = String(next.nfpa_class || "").trim();
  let flowResult = normalizeFlowResultCode(next.flow_result, nfpaClass, effectiveGpm);

  if (isPrivateHydrantId(next.hydrant_id) || isPrivateStatus(status)) {
    return privateRecord(next);
  }

  if (isOutOfServiceStatus(status)) {
    return outOfServiceRecord(next);
  }

  if ((rawStatus === "In Service" || isNeedsRepairStatus(rawStatus))
    && (isOutOfServiceClass(nfpaClass) || flowResult === "OOS")) {
    next = clearOutOfServiceMarkers(next, { gpm: effectiveGpm });
    nfpaClass = String(next.nfpa_class || "").trim();
    flowResult = normalizeFlowResultCode(next.flow_result, nfpaClass, effectiveGpm);
  }

  if (isOutOfServiceClass(nfpaClass) || flowResult === "OOS") {
    return outOfServiceRecord(next);
  }

  if (isNeedsRepairStatus(status)) {
    if (effectiveGpm) return flowRecordFromGpm(next, effectiveGpm, "Needs Repair");
    if (nfpaClass && nfpaClass !== "Not Tested") return flowRecordFromClass(next, nfpaClass, "Needs Repair");
    const standard = flowStandardForCode(flowResult);
    if (standard) {
      return {
        ...next,
        status: "Needs Repair",
        flow_result: standard.code,
        nfpa_class: standard.className,
        nfpa_color: standard.colorName,
      };
    }
    return untestedRecord(next, "Needs Repair");
  }

  if (effectiveGpm) {
    return flowRecordFromGpm(next, effectiveGpm, "In Service");
  }

  if (nfpaClass && nfpaClass !== "Not Tested") {
    return flowRecordFromClass(next, nfpaClass, "In Service");
  }

  const standard = flowStandardForCode(flowResult);
  if (standard) {
    return {
      ...next,
      status: "In Service",
      flow_result: standard.code,
      nfpa_class: standard.className,
      nfpa_color: standard.colorName,
    };
  }

  return untestedRecord(next, "In Service");
}

export function reconcileHydrantStatus(hydrant = {}) {
  return coupleHydrantStatusRecord(normalizeHydrantFlowFields(hydrant));
}

export function syncHydrantStatusFields(hydrant = {}, options = {}) {
  const { gpm, changedField } = options;
  const normalized = normalizeHydrantFlowFields(hydrant);
  const effectiveGpm = resolveNumericGpm(normalized, gpm);
  const next = { ...normalized, flow_gpm: effectiveGpm || normalized.flow_gpm };

  if (changedField === "status") {
    const status = String(next.status || "").trim();
    if (isOutOfServiceStatus(status)) return outOfServiceRecord(next);
    if (isPrivateStatus(status)) return privateRecord(next);

    const cleared = clearOutOfServiceMarkers(next, { gpm: effectiveGpm });
    const targetStatus = isNeedsRepairStatus(status) ? "Needs Repair" : "In Service";
    return coupleHydrantStatusRecord({ ...cleared, status: targetStatus }, { gpm: effectiveGpm });
  }

  if (changedField === "nfpa_class") {
    const nfpaClass = String(next.nfpa_class || "").trim();
    if (nfpaClass === "Out of Service") return outOfServiceRecord(next);
    const status = serviceableStatusFromRecord(next);
    return coupleHydrantStatusRecord({
      ...clearOutOfServiceMarkers({ ...next, status, nfpa_class: nfpaClass }, { gpm: effectiveGpm }),
      status,
      nfpa_class: nfpaClass,
    }, { gpm: effectiveGpm });
  }

  if (changedField === "flow_result") {
    const flowResult = String(next.flow_result || "").trim().toUpperCase();
    if (flowResult === "OOS") return outOfServiceRecord(next);
    const standard = flowStandardForCode(flowResult);
    const status = serviceableStatusFromRecord(next);
    if (standard) {
      return coupleHydrantStatusRecord({
        ...clearOutOfServiceMarkers({ ...next, status }, { gpm: effectiveGpm }),
        status,
        flow_result: standard.code,
        nfpa_class: standard.className,
      }, { gpm: effectiveGpm });
    }
    return coupleHydrantStatusRecord({ ...clearOutOfServiceMarkers({ ...next, status }, { gpm: effectiveGpm }), status }, { gpm: effectiveGpm });
  }

  if (changedField === "flow_gpm") {
    const status = isNeedsRepairStatus(next.status) ? "Needs Repair" : (isServiceableStatus(next.status) ? next.status : "In Service");
    return coupleHydrantStatusRecord({ ...next, status }, { gpm: effectiveGpm });
  }

  return coupleHydrantStatusRecord(next, { gpm: effectiveGpm });
}

export function applyHydrantStatusChange(current = {}, field, value, options = {}) {
  return syncHydrantStatusFields({ ...current, [field]: value }, { ...options, changedField: field });
}

export function buildFlowTestStatusPatch(selected = {}, info = {}, form = {}, calculatedFlow = "") {
  return coupleHydrantStatusRecord(
    {
      ...selected,
      ...info,
      ...form,
      flow_gpm: calculatedFlow || selected.flow_gpm || form.flow_gpm,
    },
    { gpm: calculatedFlow || selected.flow_gpm || form.flow_gpm }
  );
}

export function inspectionStatusPatch(hydrant = {}, rows = []) {
  const needsRepair = rows.some((row) => String(row.repair_needed || "").toLowerCase() === "yes");
  if (needsRepair && !isOutOfServiceStatus(hydrant.status) && !isPrivateStatus(hydrant.status)) {
    return coupleHydrantStatusRecord({ ...hydrant, status: "Needs Repair" });
  }
  return coupleHydrantStatusRecord(hydrant);
}
