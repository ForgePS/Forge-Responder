import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

async function callNeris(name, payload = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, name)(payload);
  return result.data || {};
}

export function getNerisConnection(departmentId = "") {
  return callNeris("nerisGetConnection", { departmentId });
}

export function saveNerisConnection(departmentId = "", nerisId = "") {
  return callNeris("nerisSaveConnection", { departmentId, nerisId });
}

export function testNerisConnection(departmentId = "") {
  return callNeris("nerisTestConnection", { departmentId });
}

export function removeNerisConnection(departmentId = "") {
  return callNeris("nerisRemoveConnection", { departmentId });
}

/** Same shape check as the server: two letters, five FIPS digits, then 3+ characters. */
export function normalizeNerisId(value = "") {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function isValidNerisId(value = "") {
  return /^[A-Z]{2}\d{5}[A-Z0-9]{3,}$/.test(normalizeNerisId(value));
}

export const NERIS_STATUS_LABELS = {
  not_set_up: { label: "Not set up", tone: "critical" },
  unchecked: { label: "Not checked yet", tone: "warning" },
  connected: { label: "Connected", tone: "success" },
  not_enrolled: { label: "Waiting for enrollment", tone: "warning" },
  not_found: { label: "NERIS ID not found", tone: "critical" },
  error: { label: "Couldn't check", tone: "critical" },
};

/** What sending would change in NERIS (nothing is sent). unitSettings: { [apparatusId]: { type, staffing } } */
export function previewNerisSync(departmentId = "", unitSettings = {}) {
  return callNeris("nerisSyncPreview", { departmentId, unitSettings });
}

/** Sends the selected department fields, stations and units to NERIS. */
export function applyNerisSync(departmentId = "", selection = {}, unitSettings = {}) {
  return callNeris("nerisSyncApply", { departmentId, selection, unitSettings });
}

export const NERIS_UNIT_TYPE_LABELS = {
  ENGINE_STRUCT: "Engine (structure)", ENGINE_WUI: "Engine (wildland)", LADDER_TALL: "Ladder / aerial",
  LADDER_TILLER: "Tiller", LADDER_QUINT: "Quint", LADDER_SMALL: "Ladder (small)", PLATFORM: "Platform / tower",
  PLATFORM_QUINT: "Platform quint", QUINT_TALL: "Quint (tall)", TENDER: "Tender / tanker", ALS_AMB: "ALS ambulance",
  BLS_AMB: "BLS ambulance", EMS_NOTRANS: "EMS (non-transport)", EMS_SUPV: "EMS supervisor",
  CHIEF_STAFF_COMMAND: "Chief / command", RESCUE_HEAVY: "Heavy rescue", RESCUE_MEDIUM: "Medium rescue",
  RESCUE_LIGHT: "Light rescue / squad", RESCUE_USAR: "USAR", RESCUE_WATER: "Water rescue", HAZMAT: "Hazmat",
  DECON: "Decon", BOAT: "Boat", BOAT_LARGE: "Fireboat (large)", SCBA: "Air / SCBA unit", REHAB: "Rehab",
  UTIL: "Utility", ARFF: "ARFF (airport)", FOAM: "Foam", INVEST: "Investigator", OTHER_GROUND: "Other ground unit",
  AIR_EMS: "Air ambulance", AIR_LIGHT: "Light aircraft", AIR_RECON: "Air recon", AIR_TANKER: "Air tanker",
  ATV_EMS: "ATV (EMS)", ATV_FIRE: "ATV (fire)", CREW: "Hand crew", CREW_TRANS: "Crew transport", DOZER: "Dozer",
  HELO_FIRE: "Helicopter (fire)", HELO_GENERAL: "Helicopter (general)", HELO_RESCUE: "Helicopter (rescue)",
  MAB: "Mobile ambulance bus", MOBILE_COMMS: "Mobile communications", MOBILE_ICP: "Mobile command post",
  POV: "Personal vehicle (POV)", UAS_FIRE: "Drone (fire)", UAS_RECON: "Drone (recon)",
};

export function nerisUnitTypeLabel(type = "") {
  return NERIS_UNIT_TYPE_LABELS[type] || type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
