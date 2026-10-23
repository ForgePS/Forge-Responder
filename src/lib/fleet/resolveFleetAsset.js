import { getRecord, listRecords } from "../firestoreService.js";
import { listDepartmentApparatus } from "../apparatusService.js";
import { canonicalApparatusUnitName, normalizeApparatusRecord } from "../apparatusSchema.js";
import { FLEET_ASSETS_COLLECTION, FLEET_ASSET_ALIASES_COLLECTION } from "./paths.js";
import {
  legacyApparatusToFleetAsset,
  normalizeFleetAssetRecord,
} from "./fleetAssetService.js";

/**
 * Map a legacy apparatus list item into the shared resolve shape.
 * @param {object} apparatus
 * @param {string} departmentId
 */
export function legacyApparatusToResolvedAsset(apparatus = {}, departmentId = "") {
  const asset = legacyApparatusToFleetAsset(apparatus, departmentId);
  return {
    ...asset,
    source: "legacy_apparatus",
    raw: normalizeApparatusRecord(apparatus),
  };
}

/**
 * Resolve a fleet asset by id, unit designation, or alias.
 * Prefers `fleetAssets`, then aliases, then classic apparatus list.
 *
 * @param {string} departmentId
 * @param {string} reference - fleet asset id, legacy apparatus id, or unit name
 * @param {{ apparatusFallback?: object[] }} [options]
 */
export async function resolveFleetAsset(departmentId, reference = "", options = {}) {
  const needle = String(reference || "").trim();
  if (!departmentId || !needle) return null;

  const canonical = canonicalApparatusUnitName(needle);

  try {
    const byId = await getRecord(departmentId, FLEET_ASSETS_COLLECTION, needle);
    if (byId) {
      return {
        ...normalizeFleetAssetRecord(byId, departmentId),
        source: "fleet_assets",
      };
    }
  } catch (error) {
    console.warn("resolveFleetAsset fleetAssets lookup failed", error);
  }

  try {
    const assets = await listRecords(departmentId, FLEET_ASSETS_COLLECTION);
    const match = assets.find((row) => {
      const unit = canonicalApparatusUnitName(row.unitDesignation || row.fleetNumber || row.name || "");
      return (
        row.id === needle
        || row.legacyApparatusId === needle
        || unit === canonical
        || String(row.fleetNumber || "").trim() === needle
      );
    });
    if (match) {
      return {
        ...normalizeFleetAssetRecord(match, departmentId),
        source: "fleet_assets",
      };
    }
  } catch (error) {
    console.warn("resolveFleetAsset fleetAssets scan failed", error);
  }

  try {
    const aliases = await listRecords(departmentId, FLEET_ASSET_ALIASES_COLLECTION);
    const alias = aliases.find((row) => (
      row.id === needle
      || row.legacyId === needle
      || row.alias === needle
      || canonicalApparatusUnitName(row.alias || "") === canonical
    ));
    if (alias?.fleetAssetId) {
      const asset = await getRecord(departmentId, FLEET_ASSETS_COLLECTION, alias.fleetAssetId);
      if (asset) {
        return {
          ...normalizeFleetAssetRecord(asset, departmentId),
          source: "fleet_alias",
          aliasId: alias.id,
        };
      }
    }
  } catch (error) {
    console.warn("resolveFleetAsset alias lookup failed", error);
  }

  let apparatusList = Array.isArray(options.apparatusFallback) ? options.apparatusFallback : null;
  if (!apparatusList) {
    try {
      apparatusList = await listDepartmentApparatus(departmentId);
    } catch (error) {
      console.warn("resolveFleetAsset apparatus list failed", error);
      apparatusList = [];
    }
  }

  const legacy = (apparatusList || []).find((row) => {
    const normalized = normalizeApparatusRecord(row);
    const unit = canonicalApparatusUnitName(normalized.unit || "");
    return (
      normalized.id === needle
      || unit === canonical
      || String(normalized.unit || "").trim() === needle
    );
  });

  if (legacy) {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[fleet] resolveFleetAsset fell back to legacy apparatus list", {
        departmentId,
        reference: needle,
      });
    }
    return legacyApparatusToResolvedAsset(legacy, departmentId);
  }

  return null;
}
