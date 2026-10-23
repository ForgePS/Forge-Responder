import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { ADOPTED_CODE_PROFILES_COLLECTION } from "./paths.js";
import { normalizeAdoptedCodeProfile, nowIso } from "./types.js";

export async function listAdoptedCodeProfiles(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, ADOPTED_CODE_PROFILES_COLLECTION);
  return rows
    .map((row) => normalizeAdoptedCodeProfile(row, departmentId))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.jurisdictionName.localeCompare(b.jurisdictionName));
}

export async function getActiveAdoptedCodeProfile(departmentId) {
  const rows = await listAdoptedCodeProfiles(departmentId);
  return rows.find((row) => row.active) || null;
}

export async function getAdoptedCodeProfile(departmentId, profileId) {
  if (!departmentId || !profileId) return null;
  const row = await getRecord(departmentId, ADOPTED_CODE_PROFILES_COLLECTION, profileId);
  return row ? normalizeAdoptedCodeProfile(row, departmentId) : null;
}

/**
 * Save adopted-code profile. When active=true, deactivate other active profiles (history retained).
 */
export async function saveAdoptedCodeProfile(departmentId, profileId, input, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required.");
  if (!profileId) throw new Error("profileId is required.");

  const stamp = nowIso();
  const existing = await getAdoptedCodeProfile(departmentId, profileId);
  const next = normalizeAdoptedCodeProfile(
    {
      ...existing,
      ...input,
      id: profileId,
      departmentId,
      updatedAt: stamp,
      createdAt: existing?.createdAt || stamp,
    },
    departmentId,
  );

  if (next.active) {
    const others = await listAdoptedCodeProfiles(departmentId);
    for (const row of others) {
      if (row.id === profileId || !row.active) continue;
      const history = [
        ...(Array.isArray(row.history) ? row.history : []),
        {
          deactivatedAt: stamp,
          reason: "Replaced by new active adopted-code profile",
          replacedBy: profileId,
          actorUid: audit.actorUid || "",
        },
      ];
      await updateRecord(departmentId, ADOPTED_CODE_PROFILES_COLLECTION, row.id, {
        active: false,
        history,
        updatedAt: stamp,
      });
    }
  }

  if (existing) {
    await updateRecord(departmentId, ADOPTED_CODE_PROFILES_COLLECTION, profileId, next);
  } else {
    await createRecord(departmentId, ADOPTED_CODE_PROFILES_COLLECTION, profileId, next);
  }
  return next;
}
