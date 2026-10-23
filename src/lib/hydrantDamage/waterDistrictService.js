import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeHydrantDamageAudit } from "./audit.js";
import { getRecordLatLng, parseDistrictGeometry, pointInGeometry } from "./geo.js";
import {
  HYDRANT_OWNERSHIP_REVIEW_COLLECTION,
  WATER_DISTRICTS_COLLECTION,
} from "./paths.js";
import { getWaterCompany, listWaterCompanies } from "./waterCompanyService.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeWaterDistrict(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const geometry = data.geometry && typeof data.geometry === "object" ? data.geometry : null;
  const previousVersions = Array.isArray(data.previousVersions)
    ? data.previousVersions.slice(0, 20)
    : [];
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    waterCompanyId: data.waterCompanyId || "",
    name: String(data.name || "").trim(),
    code: String(data.code || "").trim(),
    jurisdiction: String(data.jurisdiction || "").trim(),
    geometry,
    geometryType: geometry?.type || "",
    priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : 100,
    effectiveFrom: data.effectiveFrom || "",
    effectiveTo: data.effectiveTo || "",
    active: data.active !== false,
    published: data.published !== false,
    version: Number(data.version) || 1,
    previousVersions,
    routineContactGroupId: data.routineContactGroupId || "routine",
    emergencyContactGroupId: data.emergencyContactGroupId || "emergency",
    escalationGroupId: data.escalationGroupId || "escalation",
    acknowledgmentSlaMinutes: Number(data.acknowledgmentSlaMinutes) || 0,
    notes: String(data.notes || "").trim(),
    createdAt: data.createdAt || "",
    createdBy: data.createdBy || "",
    updatedAt: data.updatedAt || "",
    updatedBy: data.updatedBy || "",
    publishedAt: data.publishedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeOwnershipReview(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    hydrantId: data.hydrantId || "",
    hydrantLabel: data.hydrantLabel || "",
    hydrantAddress: data.hydrantAddress || "",
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    reportId: data.reportId || "",
    status: data.status || "open",
    reason: data.reason || "unknown",
    candidates: Array.isArray(data.candidates) ? data.candidates : [],
    resolvedWaterCompanyId: data.resolvedWaterCompanyId || "",
    resolvedWaterDistrictId: data.resolvedWaterDistrictId || "",
    resolutionNotes: String(data.resolutionNotes || "").trim(),
    createdAt: data.createdAt || "",
    createdBy: data.createdBy || "",
    updatedAt: data.updatedAt || "",
    updatedBy: data.updatedBy || "",
    resolvedAt: data.resolvedAt || "",
    resolvedBy: data.resolvedBy || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listWaterDistricts(departmentId) {
  const rows = await listRecords(departmentId, WATER_DISTRICTS_COLLECTION);
  return rows
    .map((row) => normalizeWaterDistrict(row, departmentId))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

/**
 * @param {string} departmentId
 * @param {string} districtId
 */
export async function getWaterDistrict(departmentId, districtId) {
  if (!districtId) return null;
  const row = await getRecord(departmentId, WATER_DISTRICTS_COLLECTION, districtId);
  return row ? normalizeWaterDistrict(row, departmentId) : null;
}

/**
 * @param {string} departmentId
 * @param {object} draft
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function saveWaterDistrict(departmentId, draft = {}, actor = {}) {
  const existingId = draft.id || "";
  const previous = existingId ? await getWaterDistrict(departmentId, existingId) : null;
  const parsed = draft.geometryJson !== undefined
    ? parseDistrictGeometry(draft.geometryJson)
    : draft.geometry
      ? parseDistrictGeometry(draft.geometry)
      : previous?.geometry
        ? { ok: true, geometry: previous.geometry }
        : { ok: false, error: "Geometry is required." };

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  if (!String(draft.name || "").trim()) {
    throw new Error("District name is required.");
  }
  if (!draft.waterCompanyId) {
    throw new Error("Water company is required.");
  }

  const id = existingId || newId("WD");
  const geometryChanged = previous?.geometry
    ? JSON.stringify(previous.geometry) !== JSON.stringify(parsed.geometry)
    : true;
  const bumpVersion = Boolean(previous) && geometryChanged;
  const previousVersions = previous
    ? [
        ...(bumpVersion
          ? [{
              version: previous.version,
              geometry: previous.geometry,
              publishedAt: previous.publishedAt || previous.updatedAt || nowIso(),
            }]
          : []),
        ...(previous.previousVersions || []),
      ].slice(0, 20)
    : [];

  const next = normalizeWaterDistrict({
    ...previous,
    ...draft,
    id,
    geometry: parsed.geometry,
    geometryJson: undefined,
    version: bumpVersion ? (previous.version || 1) + 1 : (previous?.version || 1),
    previousVersions,
    publishedAt: draft.published === false ? (previous?.publishedAt || "") : (previous?.publishedAt || nowIso()),
    createdAt: previous?.createdAt || nowIso(),
    createdBy: previous?.createdBy || actor.actorUid || "system",
    updatedAt: nowIso(),
    updatedBy: actor.actorUid || "system",
  }, departmentId);

  if (previous) {
    await updateRecord(departmentId, WATER_DISTRICTS_COLLECTION, id, next);
  } else {
    await createRecord(departmentId, WATER_DISTRICTS_COLLECTION, id, next);
  }

  await writeHydrantDamageAudit(departmentId, {
    action: previous ? "water_district.updated" : "water_district.created",
    entityType: "waterDistrict",
    entityId: id,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    before: previous,
    after: next,
  });
  return next;
}

/**
 * Restore a prior geometry as a new published version.
 * @param {string} departmentId
 * @param {string} districtId
 * @param {number} version
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function restoreWaterDistrictVersion(departmentId, districtId, version, actor = {}) {
  const district = await getWaterDistrict(departmentId, districtId);
  if (!district) throw new Error("District not found.");
  const snapshot = (district.previousVersions || []).find((row) => Number(row.version) === Number(version));
  if (!snapshot?.geometry) throw new Error("Version snapshot not found.");
  return saveWaterDistrict(departmentId, {
    ...district,
    geometry: snapshot.geometry,
    notes: `${district.notes || ""}\nRestored geometry from v${version}`.trim(),
  }, actor);
}

/**
 * @param {object} district
 * @param {string} [asOfIso]
 */
export function isDistrictEffective(district, asOfIso = nowIso()) {
  if (!district || district.active === false || district.published === false) return false;
  if (!district.geometry) return false;
  const t = new Date(asOfIso).getTime();
  if (district.effectiveFrom && new Date(district.effectiveFrom).getTime() > t) return false;
  if (district.effectiveTo && new Date(district.effectiveTo).getTime() < t) return false;
  return true;
}

/**
 * Find all published districts containing the point.
 * @param {object[]} districts
 * @param {number} lat
 * @param {number} lng
 * @param {string} [asOfIso]
 */
export function matchDistrictsAtPoint(districts = [], lat, lng, asOfIso = nowIso()) {
  return districts
    .filter((row) => isDistrictEffective(row, asOfIso))
    .filter((row) => pointInGeometry(lng, lat, row.geometry))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

/**
 * @param {string} departmentId
 * @param {object} hydrant
 * @param {{ districts?: object[], companies?: object[] }} [cache]
 */
export async function resolveOwnershipForHydrant(departmentId, hydrant = {}, cache = {}) {
  const companies = cache.companies || await listWaterCompanies(departmentId);
  const districts = cache.districts || await listWaterDistricts(departmentId);
  const companyById = new Map(companies.map((row) => [row.id, row]));

  if (hydrant.waterCompanyId) {
    const direct = companyById.get(hydrant.waterCompanyId) || await getWaterCompany(departmentId, hydrant.waterCompanyId);
    if (direct?.active !== false) {
      return {
        company: direct,
        district: null,
        candidates: [{
          waterCompanyId: direct.id,
          waterCompanyName: direct.legalName,
          waterDistrictId: "",
          waterDistrictName: "",
          source: "direct_assignment",
          confidence: 1,
        }],
        source: "direct_assignment",
        confidence: 1,
        requiresConfirmation: false,
        reason: "",
      };
    }
  }

  const coords = getRecordLatLng(hydrant);
  if (coords) {
    const matches = matchDistrictsAtPoint(districts, coords.lat, coords.lng);
    if (matches.length === 1) {
      const district = matches[0];
      const company = companyById.get(district.waterCompanyId) || null;
      return {
        company,
        district,
        candidates: [{
          waterCompanyId: district.waterCompanyId,
          waterCompanyName: company?.legalName || "",
          waterDistrictId: district.id,
          waterDistrictName: district.name,
          source: "district_polygon",
          confidence: 0.9,
          priority: district.priority,
        }],
        source: "district_polygon",
        confidence: company ? 0.9 : 0.4,
        requiresConfirmation: !company,
        reason: company ? "" : "district_missing_company",
      };
    }
    if (matches.length > 1) {
      const candidates = matches.map((district) => {
        const company = companyById.get(district.waterCompanyId) || null;
        return {
          waterCompanyId: district.waterCompanyId,
          waterCompanyName: company?.legalName || "",
          waterDistrictId: district.id,
          waterDistrictName: district.name,
          source: "district_polygon",
          confidence: 0.75,
          priority: district.priority,
        };
      });
      return {
        company: null,
        district: null,
        candidates,
        source: "district_conflict",
        confidence: 0.5,
        requiresConfirmation: true,
        reason: "overlapping_districts",
      };
    }
  }

  const waterSystemId = String(hydrant.water_system_id || hydrant.waterSystemId || "").trim().toLowerCase();
  if (waterSystemId) {
    const byCode = districts.find((row) => isDistrictEffective(row) && String(row.code || "").trim().toLowerCase() === waterSystemId);
    if (byCode) {
      const company = companyById.get(byCode.waterCompanyId) || null;
      return {
        company,
        district: byCode,
        candidates: [{
          waterCompanyId: byCode.waterCompanyId,
          waterCompanyName: company?.legalName || "",
          waterDistrictId: byCode.id,
          waterDistrictName: byCode.name,
          source: "water_system_id",
          confidence: 0.8,
        }],
        source: "water_system_id",
        confidence: company ? 0.8 : 0.4,
        requiresConfirmation: !company,
        reason: company ? "" : "district_missing_company",
      };
    }
  }

  const needle = String(hydrant.provider || hydrant.water_assoc || "").trim().toLowerCase();
  if (needle) {
    const match = companies.find((row) => {
      if (row.active === false) return false;
      const names = [row.legalName, row.dba].map((v) => String(v || "").trim().toLowerCase()).filter(Boolean);
      return names.some((name) => name === needle || name.includes(needle) || needle.includes(name));
    });
    if (match) {
      return {
        company: match,
        district: null,
        candidates: [{
          waterCompanyId: match.id,
          waterCompanyName: match.legalName,
          waterDistrictId: "",
          waterDistrictName: "",
          source: "provider_name_match",
          confidence: 0.7,
        }],
        source: "provider_name_match",
        confidence: 0.7,
        requiresConfirmation: false,
        reason: "",
      };
    }
  }

  return {
    company: null,
    district: null,
    candidates: [],
    source: "unknown",
    confidence: 0,
    requiresConfirmation: true,
    reason: coords ? "no_district_match" : "missing_coordinates",
  };
}

/**
 * @param {string} departmentId
 */
export async function listOwnershipReviews(departmentId) {
  const rows = await listRecords(departmentId, HYDRANT_OWNERSHIP_REVIEW_COLLECTION);
  return rows
    .map((row) => normalizeOwnershipReview(row, departmentId))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function enqueueOwnershipReview(departmentId, input = {}, actor = {}) {
  const hydrantId = input.hydrantId || "";
  const open = (await listOwnershipReviews(departmentId)).find(
    (row) => row.status === "open" && row.hydrantId === hydrantId && (!input.reportId || row.reportId === input.reportId)
  );
  if (open) {
    const next = normalizeOwnershipReview({
      ...open,
      ...input,
      id: open.id,
      updatedAt: nowIso(),
      updatedBy: actor.actorUid || "system",
    }, departmentId);
    await updateRecord(departmentId, HYDRANT_OWNERSHIP_REVIEW_COLLECTION, open.id, next);
    return next;
  }

  const id = newId("OWN");
  const draft = normalizeOwnershipReview({
    id,
    ...input,
    status: "open",
    createdAt: nowIso(),
    createdBy: actor.actorUid || "system",
    updatedAt: nowIso(),
    updatedBy: actor.actorUid || "system",
  }, departmentId);
  await createRecord(departmentId, HYDRANT_OWNERSHIP_REVIEW_COLLECTION, id, draft);
  await writeHydrantDamageAudit(departmentId, {
    action: "ownership_review.enqueued",
    entityType: "hydrantOwnershipReview",
    entityId: id,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: draft,
  });
  return draft;
}

/**
 * @param {string} departmentId
 * @param {string} reviewId
 * @param {{ waterCompanyId: string, waterDistrictId?: string, notes?: string }} resolution
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function resolveOwnershipReview(departmentId, reviewId, resolution = {}, actor = {}) {
  const previous = await getRecord(departmentId, HYDRANT_OWNERSHIP_REVIEW_COLLECTION, reviewId);
  if (!previous) throw new Error("Ownership review not found.");
  if (!resolution.waterCompanyId) throw new Error("Select a water company to resolve ownership.");
  const next = normalizeOwnershipReview({
    ...previous,
    status: "resolved",
    resolvedWaterCompanyId: resolution.waterCompanyId,
    resolvedWaterDistrictId: resolution.waterDistrictId || "",
    resolutionNotes: resolution.notes || "",
    resolvedAt: nowIso(),
    resolvedBy: actor.actorUid || "system",
    updatedAt: nowIso(),
    updatedBy: actor.actorUid || "system",
  }, departmentId);
  await updateRecord(departmentId, HYDRANT_OWNERSHIP_REVIEW_COLLECTION, reviewId, next);
  await writeHydrantDamageAudit(departmentId, {
    action: "ownership_review.resolved",
    entityType: "hydrantOwnershipReview",
    entityId: reviewId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    before: previous,
    after: next,
  });
  return next;
}

/**
 * Count hydrants that fall in a district (client-side preview).
 * @param {object} district
 * @param {object[]} hydrants
 */
export function previewHydrantsInDistrict(district, hydrants = []) {
  if (!district?.geometry) return [];
  return hydrants.filter((row) => {
    const coords = getRecordLatLng(row);
    if (!coords) return false;
    return pointInGeometry(coords.lng, coords.lat, district.geometry);
  });
}
