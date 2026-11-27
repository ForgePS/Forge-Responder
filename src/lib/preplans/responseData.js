/**
 * Everything the response view shows for one preplan, loaded from Firestore.
 * Shared by the online response view and the offline package builder, so an
 * offline copy holds exactly what responders see online.
 *
 * Two parts: the approved plan (revision, floor plans, site map), which never
 * changes once published, and the live part (alerts, impairments, hydrants),
 * which changes on its own. An offline update only re-reads the live part
 * unless a new revision was published.
 */
import { getPreplanRevision, listFireProtectionSystems, listFpsImpairments, listPreplanBuildings, listPreplanFiles } from "../inspections/index.js";
import { loadDepartmentHydrants } from "../hydrantTenantService.js";
import { alertFromImpairment, LIVE_REVISION_STATUSES } from "./alertModel.js";
import { listAlertsForPreplan } from "./alertService.js";
import { loadBuildingsWithFloors, loadSymbolCatalog } from "./floorPlanService.js";
import { getSiteMap } from "./siteMapService.js";

export class LiveDataError extends Error {
  constructor(failed) {
    super(`Couldn't read the current ${failed.join(" and ")}. Nothing was changed; try again.`);
    this.name = "LiveDataError";
    this.failed = failed;
  }
}

/**
 * Current alerts (including active fire protection impairments) and the department's hydrants.
 * A read that fails is never turned into an empty list: `failed` names what couldn't be read
 * ("alerts", "hydrants"), and that part comes back as null.
 */
export async function loadLiveResponseParts(departmentId, preplan) {
  const failed = new Set();
  const attempt = (promise, part) => Promise.resolve(promise).catch(() => { failed.add(part); return null; });
  const [alertRows, impairments, systems, hydrantRows] = await Promise.all([
    attempt(listAlertsForPreplan(departmentId, { preplanId: preplan.id, occupancyId: preplan.occupancyId }), "alerts"),
    preplan.occupancyId ? attempt(listFpsImpairments(departmentId, { activeOnly: true }), "alerts") : [],
    preplan.occupancyId ? attempt(listFireProtectionSystems(departmentId, { occupancyId: preplan.occupancyId }), "alerts") : [],
    // All hydrants: the map also shows unlinked ones near the site.
    attempt(loadDepartmentHydrants(departmentId), "hydrants"),
  ]);
  if (failed.has("alerts")) {
    return {
      alerts: null,
      hydrantRows: failed.has("hydrants") ? null : (Array.isArray(hydrantRows) ? hydrantRows : []),
      failed: [...failed],
    };
  }
  const systemById = new Map(systems.map((row) => [row.id, row]));
  const impairmentAlerts = impairments
    .filter((row) => row.occupancyId === preplan.occupancyId || systemById.has(row.systemId))
    .map((row) => alertFromImpairment(row, systemById.get(row.systemId)));
  return {
    alerts: [...impairmentAlerts, ...(alertRows || [])],
    hydrantRows: failed.has("hydrants") ? null : (Array.isArray(hydrantRows) ? hydrantRows : []),
    failed: [...failed],
  };
}

/**
 * Give each floor whose plan is drawn over a source drawing that drawing's
 * download URL (`backgroundUrl`), when the viewer may see it.
 */
async function attachBackgroundUrls(departmentId, preplanId, buildings, withRestricted) {
  const wanted = new Set();
  for (const building of buildings) for (const floor of building.floors) if (floor.plan?.background?.fileId) wanted.add(floor.plan.background.fileId);
  if (!wanted.size) return buildings;
  const files = await listPreplanFiles(departmentId, preplanId).catch(() => []);
  const urlById = new Map(files
    .filter((file) => wanted.has(file.id) && !file.deleted && file.downloadUrl && (withRestricted || !file.sensitive))
    .map((file) => [file.id, file.downloadUrl]));
  return buildings.map((building) => ({
    ...building,
    floors: building.floors.map((floor) => {
      const url = urlById.get(floor.plan?.background?.fileId);
      return url ? { ...floor, backgroundUrl: url } : floor;
    }),
  }));
}

/**
 * @param {string} departmentId
 * @param {object} preplan
 * @param {{withRestricted?: boolean}} [options] include restricted answers (the viewer may see them)
 * @returns {Promise<{revision:object|null, buildings:object[], catalog:object[], alerts:object[]|null, siteMap:object|null, hydrantRows:object[]|null, failed:string[]}>}
 * `alerts` / `hydrantRows` are null (and named in `failed`) when they couldn't be read.
 */
export async function loadResponseData(departmentId, preplan, options = {}) {
  const published = preplan.publishedRevisionId
    ? await getPreplanRevision(departmentId, preplan.publishedRevisionId, { withRestricted: Boolean(options.withRestricted) }).catch(() => null)
    : null;
  const [buildingRows, catalog, live] = await Promise.all([
    listPreplanBuildings(departmentId, preplan.id),
    loadSymbolCatalog(departmentId),
    loadLiveResponseParts(departmentId, preplan),
  ]);
  const isLive = LIVE_REVISION_STATUSES.has(published?.status);
  const [floorsByBuilding, siteMap] = isLive
    ? await Promise.all([
      loadBuildingsWithFloors(departmentId, preplan.id, published.id, buildingRows),
      getSiteMap(departmentId, published.id).catch(() => null),
    ])
    : [[], null];
  const buildings = await attachBackgroundUrls(departmentId, preplan.id, floorsByBuilding, Boolean(options.withRestricted));
  return { revision: published, buildings, catalog, siteMap, ...live };
}
