/**
 * Building details for a NERIS report's Scene step (construction, sprinklers, fire
 * alarm, Knox Box, hazards, water supply, last inspection), gathered from what FORGE
 * already knows about the building:
 *
 *   1. the preplan's current answers (Preplans module),
 *   2. fire protection systems on file for the building,
 *   3. the occupancy record and its latest inspection,
 *   4. the classic preplan list (older departments and the demo).
 *
 * Pure functions (tested); buildingDetailsLoader.js reads the records from Firestore.
 */

const text = (value) => String(value ?? "").trim();
const known = (value) => {
  const t = text(value);
  return t && !/^unknown$/i.test(t) ? t : "";
};

/** Same matching the report auto-fill uses: address or building name inside the incident address. */
export function matchBuilding(address = "", occupancies = []) {
  const target = text(address).toLowerCase();
  if (!target) return null;
  return occupancies.find((occ) => {
    const occAddr = text(occ.address).toLowerCase();
    const occName = text(occ.name).toLowerCase();
    return (occAddr && (target.includes(occAddr) || occAddr.includes(target))) || (occName && target.includes(occName));
  }) || null;
}

function formatDay(value) {
  const t = text(value);
  if (!t) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T12:00:00` : t);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function describeSystems(systems, typeId) {
  const list = systems.filter((s) => s.systemTypeId === typeId && s.status !== "removed");
  if (!list.length) return "";
  return list.map((s) => {
    const impaired = s.status === "impaired" || s.activeImpairmentId;
    const monitored = typeId === "fire_alarm" && s.monitoringProvider ? `, monitored by ${s.monitoringProvider}` : "";
    return `${s.name}${s.coverageArea ? ` (${s.coverageArea})` : ""}${monitored}${impaired ? " — IMPAIRED" : ""}`;
  }).join("; ");
}

/** "Knox box at main office" in older preplan text -> "Present — at main office". */
function knoxFromText(value) {
  const match = /knox\s*box\s*([^,.;\n]*)/i.exec(text(value));
  if (!match) return "";
  const where = match[1].trim();
  return where ? `Present — ${where}` : "Present";
}

function lastInspectionSummary(inspections = []) {
  const done = inspections
    .filter((i) => i.completedAt || /complete|approved|passed/i.test(text(i.status)))
    .sort((a, b) => text(b.completedAt || b.dueAt || b.due).localeCompare(text(a.completedAt || a.dueAt || a.due)))[0];
  if (!done) return "";
  const when = formatDay(done.completedAt || done.dueAt || done.due);
  const result = text(done.result) || "Completed";
  const open = Number(done.openViolationCount) || 0;
  return `${result}${when ? ` on ${when}` : ""}${open ? ` · ${open} open violation${open === 1 ? "" : "s"}` : ""}`;
}

/**
 * @param {{
 *   occupancy?: Record<string, any> | null,
 *   answers?: Record<string, any>,
 *   revision?: Record<string, any> | null,
 *   systems?: Array<Record<string, any>>,
 *   inspections?: Array<Record<string, any>>,
 *   legacyPreplan?: Record<string, any> | null,
 * }} input
 * @returns {{ details: Record<string, string>, sources: Record<string, string> }}
 */
export function buildingDetailsFrom({ occupancy = null, answers = {}, revision = null, systems = [], inspections = [], legacyPreplan = null } = {}) {
  const details = {};
  const sources = {};
  const set = (key, candidates) => {
    for (const [value, source] of candidates) {
      const v = known(value);
      if (v) {
        details[key] = v;
        sources[key] = source;
        return;
      }
    }
  };

  const construction = [
    known(answers.constructionType),
    known(answers.roofConstruction) ? `${known(answers.roofConstruction)} roof` : "",
    known(answers.stories) ? `${known(answers.stories)} ${/^1$/.test(known(answers.stories)) ? "story" : "stories"}` : "",
  ].filter(Boolean).join(" · ");

  set("constructionType", [[construction, "preplan"], [occupancy?.constructionType, "occupancy"], [legacyPreplan?.constructionType, "preplan"]]);
  set("sprinklerStatus", [
    [answers.sprinkler, "preplan"],
    [describeSystems(systems, "sprinkler"), "fire protection systems"],
    [occupancy?.sprinkler, "occupancy"],
    [legacyPreplan?.sprinkler, "preplan"],
  ]);
  set("alarmStatus", [
    [answers.alarm, "preplan"],
    [describeSystems(systems, "fire_alarm"), "fire protection systems"],
    [occupancy?.alarm, "occupancy"],
    [legacyPreplan?.alarm, "preplan"],
  ]);
  set("knoxBox", [
    [answers.knoxBox, "preplan"],
    [occupancy?.knoxBox, "occupancy"],
    [legacyPreplan?.knoxBox, "preplan"],
    [knoxFromText(legacyPreplan?.hazards), "preplan"],
    [knoxFromText(legacyPreplan?.access), "preplan"],
  ]);
  set("hazards", [[revision?.hazards, "preplan"], [legacyPreplan?.hazards, "preplan"]]);
  set("waterSupply", [[answers.nearestHydrants, "preplan"], [revision?.waterSupply, "preplan"], [legacyPreplan?.waterSupply, "preplan"]]);
  set("access", [[revision?.accessPlan, "preplan"], [answers.primaryAccess, "preplan"], [legacyPreplan?.access, "preplan"]]);
  set("lastInspection", [[lastInspectionSummary(inspections), "inspections"]]);

  return { details, sources };
}

/**
 * Only fill fields that are blank or "Unknown", so nothing a member typed is replaced.
 * @returns {{ location: Record<string, any>, filled: string[] }}
 */
export function mergeBuildingDetails(location = {}, details = {}) {
  const next = { ...location };
  const filled = [];
  for (const [key, value] of Object.entries(details)) {
    if (!known(next[key])) {
      next[key] = value;
      filled.push(key);
    }
  }
  return { location: next, filled };
}
