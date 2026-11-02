/** Reads a building's records from Firestore for the NERIS Scene step. Never throws. */
import { listOccupancyRecords } from "../inspections/occupancyService.js";
import { getPreplanRevision, listPreplans } from "../inspections/preplanService.js";
import { listFireProtectionSystems } from "../inspections/fpsService.js";
import { listInspectionRecords } from "../inspections/inspectionRecords.js";
import { buildingDetailsFrom, matchBuilding } from "./buildingDetails.js";

/**
 * @param {string} departmentId
 * @param {string} address incident address
 * @param {{ occupancies?: any[], preplans?: any[] }} lists classic lists already loaded by the app
 */
export async function loadBuildingDetails(departmentId, address, lists = {}) {
  const quiet = (promise, fallback) => promise.catch(() => fallback);
  const records = departmentId ? await quiet(listOccupancyRecords(departmentId), []) : [];
  const occupancy = matchBuilding(address, records) || matchBuilding(address, lists.occupancies || []);
  if (!occupancy) return { occupancy: null, details: {}, sources: {} };

  const legacyPreplan = (lists.preplans || []).find((p) => p.occupancyId === occupancy.id) || null;
  const [preplans, systems, inspections] = departmentId
    ? await Promise.all([
      quiet(listPreplans(departmentId, { occupancyId: occupancy.id, openOnly: true }), []),
      quiet(listFireProtectionSystems(departmentId, { occupancyId: occupancy.id }), []),
      quiet(listInspectionRecords(departmentId), []),
    ])
    : [[], [], []];

  const preplan = preplans[0] || null;
  const revisionId = preplan?.publishedRevisionId || preplan?.currentRevisionId;
  const revision = revisionId ? await quiet(getPreplanRevision(departmentId, revisionId), null) : null;

  const { details, sources } = buildingDetailsFrom({
    occupancy,
    answers: revision?.sectionAnswers || {},
    revision,
    systems,
    inspections: inspections.filter((i) => i.occupancyId === occupancy.id),
    legacyPreplan,
  });
  return { occupancy, preplan, details, sources };
}
