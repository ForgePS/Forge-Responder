import { canonicalApparatusUnitName } from "./apparatusSchema.js";

export const CREW_SLOT_ROLE_SUGGESTIONS = [
  "Battalion Chief",
  "Lieutenant",
  "Captain",
  "Driver",
  "Firefighter",
  "Paramedic",
  "EMT/Driver",
  "EMT",
  "Officer",
];

export const STANDARD_APPARATUS_CREW_ROLES = ["Lieutenant", "Driver", "Firefighter", "Firefighter"];
export const AMBULANCE_CREW_ROLES = ["Paramedic", "EMT/Driver"];
export const BATTALION_CREW_ROLES = ["Battalion Chief"];

export function isBattalionUnit(unit = "") {
  return /^battalion\s/i.test(String(unit || "").trim());
}

export function isAmbulanceUnit(unit = "", apparatusRecord = null) {
  if (apparatusRecord) {
    const type = String(apparatusRecord.type || "").trim();
    if (/^ambulance$/i.test(type)) return true;
  }
  const name = String(unit || "").trim();
  return /^(ambulance|medic)\s/i.test(name);
}

export function findApparatusRecord(apparatus = [], unit = "") {
  const canonical = canonicalApparatusUnitName(unit);
  return (Array.isArray(apparatus) ? apparatus : []).find(
    (entry) => canonicalApparatusUnitName(entry?.unit) === canonical
  ) || null;
}

export function getDefaultApparatusCrewSlotRoles(unit = "", apparatusRecord = null) {
  if (isBattalionUnit(unit)) return [...BATTALION_CREW_ROLES];
  if (isAmbulanceUnit(unit, apparatusRecord)) return [...AMBULANCE_CREW_ROLES];
  return [...STANDARD_APPARATUS_CREW_ROLES];
}

export function normalizeCrewSlotsByUnit(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  return Object.entries(raw).reduce((acc, [unit, roles]) => {
    const canonical = canonicalApparatusUnitName(unit);
    const slots = (Array.isArray(roles) ? roles : [])
      .map((role) => String(role || "").trim())
      .filter(Boolean);
    if (slots.length) acc[canonical] = slots;
    return acc;
  }, {});
}

export function resolveConfiguredCrewSlotRoles(unit = "", schedulingSettings = {}) {
  const canonical = canonicalApparatusUnitName(unit);
  const byUnit = schedulingSettings?.crewSlotsByUnit || {};
  const configured = byUnit[canonical] || byUnit[unit];
  if (!Array.isArray(configured)) return null;
  const slots = configured.map((role) => String(role || "").trim()).filter(Boolean);
  return slots.length ? slots : null;
}

export function resolveApparatusCrewSlotRoles(
  unit = "",
  { apparatusRecord = null, schedulingSettings = null } = {}
) {
  const configured = schedulingSettings
    ? resolveConfiguredCrewSlotRoles(unit, schedulingSettings)
    : null;
  if (configured) return configured;
  return getDefaultApparatusCrewSlotRoles(unit, apparatusRecord);
}

export function hasCustomCrewSlotConfig(unit = "", schedulingSettings = {}) {
  return Boolean(resolveConfiguredCrewSlotRoles(unit, schedulingSettings)?.length);
}
