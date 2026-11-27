/**
 * Fire service symbol catalog for interactive preplans.
 *
 * Every symbol has a shape AND a glyph (short text), so meaning never depends
 * on color alone. Departments can add their own symbols (preplanSymbolLibraries);
 * `mergeSymbolCatalog` folds those in. Starter ids from the older checklist
 * (STARTER_PREPLAN_SYMBOLS in inspections/preplanDefaults.js) are kept, so
 * existing symbol checklists still resolve.
 */

export const SYMBOL_CATEGORIES = Object.freeze([
  { id: "water", label: "Water supply" },
  { id: "fire_protection", label: "Fire protection" },
  { id: "access", label: "Access & life safety" },
  { id: "utilities", label: "Utilities" },
  { id: "hazards", label: "Documented hazards" },
  { id: "operations", label: "Operational planning" },
]);

/** Shapes the renderer knows: circle, square, triangle, diamond, hexagon, pentagon. */
export const SYMBOL_SHAPES = Object.freeze(["circle", "square", "triangle", "diamond", "hexagon", "pentagon"]);

/**
 * `critical: true` means the object must be verified before the plan can be
 * published (see validateForPublication in floorPlanModel.js).
 * `properties` lists the extra fields the inspector shows for that symbol.
 */
export const STARTER_SYMBOLS = Object.freeze([
  // Water supply
  { id: "hydrant", label: "Hydrant", category: "water", shape: "circle", glyph: "H", color: "#c62828", critical: true, properties: ["hydrantId", "flowGpm", "notes"] },
  { id: "fdc", label: "Fire department connection", category: "water", shape: "triangle", glyph: "FDC", color: "#c62828", critical: true, properties: ["connectionSize", "serves", "notes"] },
  { id: "water_tank", label: "Water tank", category: "water", shape: "hexagon", glyph: "WT", color: "#1565c0", properties: ["capacityGallons", "notes"] },
  { id: "drafting_site", label: "Drafting location", category: "water", shape: "pentagon", glyph: "DR", color: "#1565c0", properties: ["notes"] },
  { id: "fire_pump", label: "Fire pump", category: "water", shape: "square", glyph: "FP", color: "#c62828", critical: true, properties: ["ratedGpm", "notes"] },
  { id: "standpipe", label: "Standpipe", category: "water", shape: "square", glyph: "SP", color: "#c62828", critical: true, properties: ["class", "notes"] },
  { id: "sprinkler_riser", label: "Sprinkler riser", category: "water", shape: "circle", glyph: "R", color: "#c62828", critical: true, properties: ["zones", "notes"] },

  // Fire protection
  { id: "alarm_panel", label: "Fire alarm panel (FACP)", category: "fire_protection", shape: "square", glyph: "FACP", color: "#ad1457", critical: true, properties: ["panelModel", "notes"] },
  { id: "annunciator", label: "Annunciator panel", category: "fire_protection", shape: "square", glyph: "ANN", color: "#ad1457", properties: ["notes"] },
  { id: "sprinkler_valve", label: "Sprinkler control valve", category: "fire_protection", shape: "diamond", glyph: "CV", color: "#c62828", critical: true, properties: ["controls", "normalPosition", "notes"] },
  { id: "extinguisher", label: "Fire extinguisher", category: "fire_protection", shape: "circle", glyph: "FE", color: "#c62828", properties: ["type", "notes"] },
  { id: "fire_barrier", label: "Fire barrier / fire wall", category: "fire_protection", shape: "square", glyph: "FW", color: "#6d4c41", properties: ["ratingHours", "notes"] },
  { id: "suppression_system", label: "Special suppression system", category: "fire_protection", shape: "hexagon", glyph: "SUP", color: "#ad1457", properties: ["agent", "protects", "notes"] },

  // Access & life safety
  { id: "primary_entry", label: "Primary entrance", category: "access", shape: "triangle", glyph: "E1", color: "#2e7d32", properties: ["notes"] },
  { id: "secondary_entry", label: "Secondary entrance", category: "access", shape: "triangle", glyph: "E2", color: "#2e7d32", properties: ["notes"] },
  { id: "exit", label: "Exit", category: "access", shape: "triangle", glyph: "EX", color: "#2e7d32", properties: ["notes"] },
  { id: "knox", label: "Key box (Knox)", category: "access", shape: "square", glyph: "K", color: "#f9a825", critical: true, properties: ["contents", "notes"] },
  { id: "gate", label: "Gate", category: "access", shape: "pentagon", glyph: "G", color: "#5d4037", properties: ["accessMethod", "notes"] },
  { id: "stairwell", label: "Stairwell", category: "access", shape: "square", glyph: "ST", color: "#37474f", properties: ["servesFloors", "roofAccess", "notes"] },
  { id: "elevator", label: "Elevator", category: "access", shape: "square", glyph: "EL", color: "#37474f", properties: ["firefighterService", "notes"] },
  { id: "roof_access", label: "Roof access", category: "access", shape: "triangle", glyph: "RA", color: "#37474f", properties: ["method", "notes"] },
  { id: "assembly_area", label: "Assembly location", category: "access", shape: "circle", glyph: "AA", color: "#2e7d32", properties: ["notes"] },

  // Utilities
  { id: "electric_shutoff", label: "Electrical disconnect", category: "utilities", shape: "diamond", glyph: "E", color: "#f57f17", critical: true, properties: ["serves", "notes"] },
  { id: "electrical_room", label: "Electrical equipment / room", category: "utilities", shape: "square", glyph: "ER", color: "#f57f17", properties: ["notes"] },
  { id: "gas_shutoff", label: "Gas shutoff", category: "utilities", shape: "diamond", glyph: "G", color: "#f9a825", critical: true, properties: ["serves", "notes"] },
  { id: "water_shutoff", label: "Water shutoff", category: "utilities", shape: "diamond", glyph: "W", color: "#1565c0", critical: true, properties: ["serves", "notes"] },
  { id: "generator", label: "Generator", category: "utilities", shape: "hexagon", glyph: "GEN", color: "#f57f17", properties: ["fuel", "notes"] },
  { id: "solar", label: "Solar installation", category: "utilities", shape: "hexagon", glyph: "PV", color: "#f57f17", properties: ["disconnectLocation", "notes"] },
  { id: "battery_storage", label: "Battery energy storage", category: "utilities", shape: "hexagon", glyph: "BESS", color: "#f57f17", critical: true, properties: ["chemistry", "capacityKwh", "notes"] },

  // Documented hazards
  { id: "hazmat", label: "Hazardous materials", category: "hazards", shape: "diamond", glyph: "HM", color: "#e65100", critical: true, properties: ["material", "quantity", "sdsAvailable", "notes"] },
  { id: "compressed_gas", label: "Compressed gas", category: "hazards", shape: "diamond", glyph: "CG", color: "#e65100", critical: true, properties: ["gas", "quantity", "notes"] },
  { id: "special_hazard", label: "Special hazard", category: "hazards", shape: "triangle", glyph: "!", color: "#e65100", critical: true, properties: ["notes"] },
  { id: "truss", label: "Lightweight / truss construction", category: "hazards", shape: "triangle", glyph: "T", color: "#6d4c41", properties: ["notes"] },
  { id: "structural_concern", label: "Structural concern", category: "hazards", shape: "triangle", glyph: "SC", color: "#6d4c41", critical: true, properties: ["notes"] },
  { id: "warning", label: "Department warning", category: "hazards", shape: "triangle", glyph: "W!", color: "#e65100", properties: ["notes"] },

  // Operational planning
  { id: "staging", label: "Staging location", category: "operations", shape: "pentagon", glyph: "STG", color: "#283593", properties: ["notes"] },
  { id: "command", label: "Command location", category: "operations", shape: "pentagon", glyph: "CP", color: "#283593", properties: ["notes"] },
  { id: "apparatus_access", label: "Apparatus access", category: "operations", shape: "pentagon", glyph: "AP", color: "#283593", properties: ["notes"] },
  { id: "exposures", label: "Exposure concern", category: "operations", shape: "triangle", glyph: "EXP", color: "#283593", properties: ["notes"] },
]);

const STARTER_BY_ID = new Map(STARTER_SYMBOLS.map((row) => [row.id, row]));

/** Fallback for unknown ids (e.g. a custom symbol later removed): still renders, never crashes. */
export const UNKNOWN_SYMBOL = Object.freeze({
  id: "unknown",
  label: "Unknown symbol",
  category: "operations",
  shape: "circle",
  glyph: "?",
  color: "#616161",
  properties: ["notes"],
});

function cleanSymbol(raw = {}) {
  const id = String(raw.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 48);
  if (!id) return null;
  const category = SYMBOL_CATEGORIES.some((row) => row.id === raw.category) ? raw.category : "operations";
  const shape = SYMBOL_SHAPES.includes(raw.shape) ? raw.shape : "circle";
  const color = /^#[0-9a-f]{6}$/i.test(String(raw.color || "")) ? raw.color : "#616161";
  return {
    id,
    label: String(raw.label || id).slice(0, 80),
    category,
    shape,
    glyph: String(raw.glyph || "?").slice(0, 5),
    color,
    critical: Boolean(raw.critical),
    properties: Array.isArray(raw.properties) ? raw.properties.map(String).slice(0, 12) : ["notes"],
    custom: true,
  };
}

/**
 * Starter symbols plus a department's custom ones. A custom symbol may not
 * reuse a starter id (starter symbols stay consistent across departments).
 * @param {object[]} customSymbols
 */
export function mergeSymbolCatalog(customSymbols = []) {
  const merged = [...STARTER_SYMBOLS];
  const seen = new Set(merged.map((row) => row.id));
  for (const raw of Array.isArray(customSymbols) ? customSymbols : []) {
    const symbol = cleanSymbol(raw);
    if (!symbol || seen.has(symbol.id)) continue;
    seen.add(symbol.id);
    merged.push(symbol);
  }
  return merged;
}

/** @param {string} id @param {object[]} [catalog] */
export function findSymbol(id, catalog = STARTER_SYMBOLS) {
  if (!id) return UNKNOWN_SYMBOL;
  return catalog.find((row) => row.id === id) || STARTER_BY_ID.get(id) || UNKNOWN_SYMBOL;
}

/** Case-insensitive search over label, glyph and category label. */
export function searchSymbols(text = "", catalog = STARTER_SYMBOLS) {
  const needle = String(text || "").trim().toLowerCase();
  if (!needle) return catalog;
  const categoryLabels = Object.fromEntries(SYMBOL_CATEGORIES.map((row) => [row.id, row.label.toLowerCase()]));
  return catalog.filter((row) => (
    row.label.toLowerCase().includes(needle)
    || row.glyph.toLowerCase() === needle
    || (categoryLabels[row.category] || "").includes(needle)
  ));
}
