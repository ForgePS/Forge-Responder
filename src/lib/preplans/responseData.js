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
import { getPreplanRevision, listFireProtectionSystems, listFpsImpairments, listPreplanBuildings } from "../inspections/index.js";
import { loadDepartmentHydrants } from "../hydrantTenantService.js";
import { alertFromImpairment, LIVE_REVISION_STATUSES } from "./alertModel.js";
import { listAlertsForPreplan } from "./alertService.js";
import { loadBuildingsWithFloors, loadSymbolCatalog } from "./floorPlanService.js";
import { getSiteMap } from "./siteMapService.js";

/** Current alerts (including active fire protection impairments) and the department's hydrants. */
export async function loadLiveResponseParts(departmentId, preplan) {
  const [alertRows, impairments, systems, hydrantRows] = await Promise.all([
    listAlertsForPreplan(departmentId, { preplanId: preplan.id, occupancyId: preplan.occupancyId }).catch(() => []),
    preplan.occupancyId ? listFpsImpairments(departmentId, { activeOnly: true }).catch(() => []) : [],
    preplan.occupancyId ? listFireProtectionSystems(departmentId, { occupancyId: preplan.occupancyId }).catch(() => []) : [],
    // All hydrants: the map also shows unlinked ones near the site.
    loadDepartmentHydrants(departmentId).catch(() => []),
  ]);
  const systemById = new Map(systems.map((row) => [row.id, row]));
  const impairmentAlerts = impairments
    .filter((row) => row.occupancyId === preplan.occupancyId || systemById.has(row.systemId))
    .map((row) => alertFromImpairment(row, systemById.get(row.systemId)));
  return {
    alerts: [...impairmentAlerts, ...alertRows],
    hydrantRows: Array.isArray(hydrantRows) ? hydrantRows : [],
  };
}

/**
 * @param {string} departmentId
 * @param {object} preplan
 * @param {{withRestricted?: boolean}} [options] include restricted answers (the viewer may see them)
 * @returns {Promise<{revision:object|null, buildings:object[], catalog:object[], alerts:object[], siteMap:object|null, hydrantRows:object[]}>}
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
  const [buildings, siteMap] = isLive
    ? await Promise.all([
      loadBuildingsWithFloors(departmentId, preplan.id, published.id, buildingRows),
      getSiteMap(departmentId, published.id).catch(() => null),
    ])
    : [[], null];
  return { revision: published, buildings, catalog, siteMap, ...live };
}
