// Fleet assets are the one source of a unit's status. The classic Apparatus list
// (still read by the Dashboard, Scheduling and the Apparatus page) shows that status
// through this overlay instead of keeping its own copy. No Firebase here.

function unitKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Classic label for a fleet asset's status ("In Service", "Out of Service", ...). */
export function classicStatusLabel(asset = {}) {
  const readiness = String(asset.readinessState || "");
  const status = String(asset.status || "");
  if (status === "decommissioned" || readiness === "decommissioned") return "Decommissioned";
  if (readiness === "out_of_service" || status === "out_of_service" || readiness === "in_shop") return "Out of Service";
  if (status === "reserve" || readiness === "reserve") return "Reserve";
  if (readiness === "maintenance_due") return "PM Due";
  return "In Service";
}

/** Fleet asset matching a classic apparatus record (legacy id first, then unit name). */
export function findFleetAssetForUnit(fleetAssets = [], unit = {}) {
  const list = Array.isArray(fleetAssets) ? fleetAssets : [];
  if (unit.id) {
    const byId = list.find((asset) => asset.legacyApparatusId === unit.id || asset.id === unit.id);
    if (byId) return byId;
  }
  const name = unitKey(unit.unit || unit.name);
  if (!name) return null;
  return list.find((asset) => [asset.unitDesignation, asset.fleetNumber, asset.name].some((value) => unitKey(value) === name)) || null;
}

/** The classic apparatus list with each unit's status taken from its fleet asset. */
export function applyFleetStatus(apparatus = [], fleetAssets = []) {
  if (!Array.isArray(fleetAssets) || !fleetAssets.length) return apparatus;
  return (Array.isArray(apparatus) ? apparatus : []).map((unit) => {
    const asset = findFleetAssetForUnit(fleetAssets, unit);
    if (!asset) return unit;
    const status = classicStatusLabel(asset);
    const restriction = asset.readinessState === "available_restricted" || asset.status === "restricted"
      ? (asset.activeRestriction || "Restricted")
      : "";
    if (unit.status === status && (unit.restriction || "") === restriction) return unit;
    return { ...unit, status, restriction, fleetAssetId: asset.id };
  });
}

/** What to do to a fleet asset when someone changes a unit's status on the classic page. */
export function fleetDecisionForClassicStatus(label = "") {
  const value = String(label || "").trim().toLowerCase();
  if (value === "out of service" || value === "pm due") return { decision: "out_of_service" };
  if (value === "in service") return { decision: "return_to_service" };
  if (value === "reserve") return { status: "reserve", readinessState: "reserve" };
  return null;
}

/** Classic units whose status changed between two versions of the list. */
export function changedUnitStatuses(before = [], after = []) {
  const previous = new Map((Array.isArray(before) ? before : []).map((unit) => [unit.id || unitKey(unit.unit), unit.status]));
  return (Array.isArray(after) ? after : []).filter((unit) => {
    const key = unit.id || unitKey(unit.unit);
    return previous.has(key) && previous.get(key) !== unit.status;
  });
}

/** Readiness that matches a status chosen on All Fleet Assets (so the Readiness Board agrees). */
export function readinessForFleetStatus(status = "") {
  return {
    in_service: "available",
    out_of_service: "out_of_service",
    restricted: "available_restricted",
    reserve: "reserve",
    decommissioned: "decommissioned",
  }[status] || "";
}
