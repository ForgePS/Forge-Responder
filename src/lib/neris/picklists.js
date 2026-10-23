/** Department-managed and NERIS-adjacent picklists for workspace sections. */

export const EMS_CHIEF_COMPLAINTS = [
  { value: "CHEST_PAIN", label: "Chest pain" },
  { value: "BREATHING_PROBLEM", label: "Breathing problem" },
  { value: "FALL", label: "Fall" },
  { value: "SEIZURE", label: "Seizure" },
  { value: "OVERDOSE", label: "Overdose" },
  { value: "STROKE_SYMPTOMS", label: "Stroke symptoms" },
  { value: "DIABETIC", label: "Diabetic problem" },
  { value: "SICK_PERSON", label: "Sick person" },
  { value: "TRAUMA", label: "Trauma" },
  { value: "UNKNOWN_MEDICAL", label: "Unknown medical" },
];

export const EMS_TREATMENTS = [
  { value: "ASSESSMENT_ONLY", label: "Assessment only" },
  { value: "OXYGEN", label: "Oxygen" },
  { value: "CPR", label: "CPR" },
  { value: "AED", label: "AED" },
  { value: "BLEEDING_CONTROL", label: "Bleeding control" },
  { value: "SPLINTING", label: "Splinting" },
  { value: "NALOXONE", label: "Naloxone assist" },
  { value: "LIFT_ASSIST", label: "Lift assist" },
  { value: "OTHER", label: "Other" },
];

export const EMS_DISPOSITIONS = [
  { value: "TRANSPORTED", label: "Transported by EMS" },
  { value: "REFUSED", label: "Refused care" },
  { value: "NO_PATIENT", label: "No patient found" },
  { value: "TREATED_RELEASED", label: "Treated and released" },
  { value: "TRANSFERRED_ALS", label: "Transferred to ALS" },
  { value: "CANCELLED", label: "Cancelled by EMS" },
];

export const INCIDENT_DISCIPLINES = [
  { value: "fire", label: "Fire suppression" },
  { value: "ems", label: "EMS first response" },
  { value: "rescue", label: "Rescue" },
  { value: "mva", label: "Vehicle accident" },
  { value: "hazmat", label: "HazMat" },
  { value: "wildland", label: "Wildland" },
  { value: "technical_rescue", label: "Technical rescue" },
  { value: "public_assist", label: "Public assist" },
  { value: "prevention", label: "Fire prevention" },
  { value: "investigation", label: "Investigation" },
  { value: "mutual_aid", label: "Mutual aid" },
];

export const WILDLAND_FUEL_TYPES = [
  { value: "GRASS", label: "Grass" },
  { value: "BRUSH", label: "Brush" },
  { value: "TIMBER", label: "Timber" },
  { value: "SLASH", label: "Slash" },
  { value: "MIXED", label: "Mixed fuels" },
];

export const ACTIONS_TAKEN = [
  { value: "SUPPRESSION", label: "Fire suppression" },
  { value: "VENTILATION", label: "Ventilation" },
  { value: "SEARCH", label: "Search" },
  { value: "RESCUE", label: "Rescue" },
  { value: "EMS_CARE", label: "EMS care" },
  { value: "HAZMAT_MITIGATION", label: "HazMat mitigation" },
  { value: "SALVAGE", label: "Salvage" },
  { value: "OVERHAUL", label: "Overhaul" },
  { value: "INVESTIGATION", label: "Investigation" },
  { value: "PUBLIC_ASSIST", label: "Public assist" },
  { value: "NO_ACTION", label: "No action taken" },
];

export const NARRATIVE_TEMPLATES = [
  { id: "cancelled_enroute", label: "Cancelled en route", discipline: "public_assist" },
  { id: "false_alarm", label: "False alarm", discipline: "fire" },
  { id: "ems_assist", label: "EMS assist", discipline: "ems" },
  { id: "mva", label: "Motor vehicle accident", discipline: "mva" },
  { id: "structure_fire", label: "Structure fire", discipline: "fire" },
  { id: "vehicle_fire", label: "Vehicle fire", discipline: "fire" },
  { id: "brush_fire", label: "Brush fire", discipline: "wildland" },
  { id: "public_service", label: "Public service", discipline: "public_assist" },
  { id: "hazmat", label: "HazMat", discipline: "hazmat" },
  { id: "fire_alarm", label: "Fire alarm", discipline: "fire" },
];

const FAVORITES_KEY = "neris-picklist-favorites";
const RECENT_KEY = "neris-picklist-recent";

/** @param {string} picklistId */
export function getFavoriteValues(picklistId) {
  try {
    const all = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || "{}");
    return all[picklistId] || [];
  } catch {
    return [];
  }
}

/** @param {string} picklistId @param {string} value */
export function toggleFavoriteValue(picklistId, value) {
  try {
    const all = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || "{}");
    const current = new Set(all[picklistId] || []);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    all[picklistId] = [...current];
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(all));
    return all[picklistId];
  } catch {
    return [];
  }
}

/** @param {string} picklistId @param {string} value */
export function recordRecentValue(picklistId, value) {
  if (!value) return;
  try {
    const all = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "{}");
    const current = (all[picklistId] || []).filter((v) => v !== value);
    all[picklistId] = [value, ...current].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** @param {string} picklistId */
export function getRecentValues(picklistId) {
  try {
    const all = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "{}");
    return all[picklistId] || [];
  } catch {
    return [];
  }
}

/**
 * Sort options with favorites and recent at top.
 * @param {Array<{value: string, label?: string}>} options
 * @param {string} picklistId
 */
export function sortPicklistOptions(options, picklistId) {
  const favorites = new Set(getFavoriteValues(picklistId));
  const recent = getRecentValues(picklistId);
  const recentSet = new Set(recent);

  const score = (opt) => {
    if (favorites.has(opt.value)) return 0;
    if (recentSet.has(opt.value)) return 1;
    return 2;
  };

  return [...options].sort((a, b) => {
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    if (score(a) === 1) return recent.indexOf(a.value) - recent.indexOf(b.value);
    return (a.label || a.value).localeCompare(b.label || b.value);
  });
}
