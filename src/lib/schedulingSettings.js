import { canonicalApparatusUnitName } from "./apparatusSchema.js";
import { normalizeCrewSlotsByUnit } from "./apparatusCrewSlots.js";

export const DEFAULT_ROSTER_COMMAND_UNIT = "Battalion 1";

export const defaultSchedulingSettings = {
  displayApparatus: [
    DEFAULT_ROSTER_COMMAND_UNIT,
    "Engine 1",
    "Engine 2",
    "Engine 3",
    "Truck 3",
    "Rescue 1",
    "FD-2",
  ],
  crewSlotsByUnit: {},
};

export function normalizeSchedulingSettings(input = {}, availableUnits = []) {
  const fleetUnits = (Array.isArray(availableUnits) ? availableUnits : [])
    .map(String)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const fallback = fleetUnits.length
    ? [...new Set([DEFAULT_ROSTER_COMMAND_UNIT, ...fleetUnits])]
    : [...defaultSchedulingSettings.displayApparatus];

  const raw = Array.isArray(input?.displayApparatus) ? input.displayApparatus : fallback;
  const cleaned = [...new Set(
    raw.map(String).map((unit) => unit.trim()).filter(Boolean).map(canonicalApparatusUnitName),
  )];

  return {
    displayApparatus: cleaned.length ? cleaned : fallback,
    crewSlotsByUnit: normalizeCrewSlotsByUnit(input?.crewSlotsByUnit),
  };
}

export function updateSchedulingCrewSlots(settings = {}, unit = "", slots = [], availableUnits = []) {
  const normalized = normalizeSchedulingSettings(settings, availableUnits);
  const canonical = canonicalApparatusUnitName(unit);
  const cleanedSlots = (Array.isArray(slots) ? slots : [])
    .map((role) => String(role || "").trim())
    .filter(Boolean);
  const nextSlots = { ...normalized.crewSlotsByUnit };

  if (!cleanedSlots.length) {
    delete nextSlots[canonical];
  } else {
    nextSlots[canonical] = cleanedSlots;
  }

  return {
    ...normalized,
    crewSlotsByUnit: nextSlots,
  };
}

export function resolveSchedulingDisplayUnits(schedulingSettings = {}, apparatus = []) {
  const fleetUnits = (Array.isArray(apparatus) ? apparatus : [])
    .map((unit) => unit?.unit)
    .filter(Boolean);
  return normalizeSchedulingSettings(schedulingSettings, fleetUnits).displayApparatus;
}

export function buildSchedulingUnitOptions(apparatus = [], schedulingSettings = {}) {
  const fleetUnits = (Array.isArray(apparatus) ? apparatus : [])
    .map((unit) => unit?.unit)
    .filter(Boolean);
  const configured = resolveSchedulingDisplayUnits(schedulingSettings, apparatus);
  const extras = configured.filter((unit) => !fleetUnits.includes(unit));
  return [...new Set([...configured, ...extras, ...fleetUnits])];
}
