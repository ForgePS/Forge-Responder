/**
 * Demo sandbox only: keep Fleet presentable. Automated tests and visitors leave
 * failed checks and defects on the demo units; the demo refresh clears them,
 * puts each unit back to its demo status, and records a passing check from this
 * morning on every unit that's in service.
 */
import { DEMO_LIST_SEEDS } from "../data/demoSeeds.js";
import { deleteRecord, listRecords, updateRecord } from "./firestoreService.js";
import { FLEET_ASSETS_COLLECTION, FLEET_CHECKS_COLLECTION, FLEET_DEFECTS_COLLECTION } from "./fleet/paths.js";
import { DEMO_DEPARTMENT_ID } from "./tenantPaths.js";

function demoStatus(status = "") {
  return /out of service/i.test(status) ? "out_of_service" : "in_service";
}

/** Today at 07:20 local (just after shift change), or yesterday's if it's before then. */
function morningCheckTime(now = new Date()) {
  const at = new Date(now);
  at.setHours(7, 20, 0, 0);
  if (at > now) at.setDate(at.getDate() - 1);
  return at.toISOString();
}

export async function refreshDemoFleetRecords(now = new Date()) {
  const departmentId = DEMO_DEPARTMENT_ID;
  const apparatus = DEMO_LIST_SEEDS["hlfd-rms-apparatus"] || [];
  const byUnit = new Map(apparatus.map((row) => [String(row.unit).toLowerCase(), row]));

  const [assets, checks, defects] = await Promise.all([
    listRecords(departmentId, FLEET_ASSETS_COLLECTION),
    listRecords(departmentId, FLEET_CHECKS_COLLECTION),
    listRecords(departmentId, FLEET_DEFECTS_COLLECTION),
  ]);

  const checkedAt = morningCheckTime(now);
  await Promise.all([
    ...checks.map((row) => deleteRecord(departmentId, FLEET_CHECKS_COLLECTION, row.id)),
    ...defects.map((row) => deleteRecord(departmentId, FLEET_DEFECTS_COLLECTION, row.id)),
    ...assets.map((asset) => {
      const seed = byUnit.get(String(asset.unitDesignation || asset.fleetNumber || "").toLowerCase());
      if (!seed) return null;
      const status = demoStatus(seed.status);
      return updateRecord(departmentId, FLEET_ASSETS_COLLECTION, asset.id, {
        status,
        lastCheckAt: status === "in_service" ? checkedAt : "",
        lastCheckResult: status === "in_service" ? "Passed" : "",
      });
    }).filter(Boolean),
  ]);
}
