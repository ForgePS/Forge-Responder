/**
 * Offline draft queue for hydrant damage reports.
 * Email is never sent from an offline client — sync creates/updates drafts only.
 */

const STORAGE_KEY = "forge-hydrant-damage-offline-drafts-v1";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 100)));
}

function newLocalId() {
  return `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {string} departmentId
 */
export function listOfflineDamageDrafts(departmentId) {
  return readAll()
    .filter((row) => row.departmentId === departmentId && row.status !== "synced")
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

/**
 * @param {string} departmentId
 * @param {object} draft
 * @param {{ localId?: string }} [options]
 */
export function saveOfflineDamageDraft(departmentId, draft = {}, options = {}) {
  const all = readAll();
  const localId = options.localId || draft.localId || newLocalId();
  const existing = all.find((row) => row.localId === localId);
  const next = {
    localId,
    departmentId,
    status: "queued",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    discoveredAt: draft.discoveredAt || existing?.discoveredAt || new Date().toISOString(),
    payload: {
      ...draft,
      localId,
      offlineQueued: true,
      internalNotes: draft.internalNotes || "",
    },
  };
  const rest = all.filter((row) => row.localId !== localId);
  writeAll([next, ...rest]);
  return next;
}

/**
 * @param {string} localId
 */
export function removeOfflineDamageDraft(localId) {
  writeAll(readAll().filter((row) => row.localId !== localId));
}

/**
 * @param {string} localId
 * @param {"queued"|"syncing"|"synced"|"failed"} status
 * @param {string} [error]
 */
export function markOfflineDamageDraftStatus(localId, status, error = "") {
  const all = readAll();
  const next = all.map((row) => (
    row.localId === localId
      ? { ...row, status, error, updatedAt: new Date().toISOString() }
      : row
  ));
  writeAll(next.filter((row) => row.status !== "synced" || Date.now() - new Date(row.updatedAt).getTime() < 86_400_000));
}

export function isBrowserOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * Sync queued offline drafts once each. Does not send email.
 *
 * @param {string} departmentId
 * @param {{
 *   createReport: Function,
 *   updateReport: Function,
 * }} handlers
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function syncOfflineDamageDrafts(departmentId, handlers = {}, actor = {}) {
  const queued = listOfflineDamageDrafts(departmentId).filter((row) => row.status === "queued" || row.status === "failed");
  const results = [];
  for (const row of queued) {
    markOfflineDamageDraftStatus(row.localId, "syncing");
    try {
      const payload = row.payload || {};
      let report;
      if (payload.id && !String(payload.id).startsWith("offline-")) {
        report = await handlers.updateReport(departmentId, payload.id, {
          ...payload,
          discoveredAt: row.discoveredAt || payload.discoveredAt,
          _reason: "offline_sync",
        }, actor);
      } else {
        report = await handlers.createReport(departmentId, {
          hydrant: {
            location_id: payload.hydrantId,
            hydrant_id: payload.hydrantId,
            address: payload.hydrantAddress,
            provider: payload.waterCompanyName,
            waterCompanyId: payload.waterCompanyId,
            latitude: payload.latitude,
            longitude: payload.longitude,
          },
          description: payload.description || "",
          severity: payload.severity || "moderate",
          operationalStatus: payload.operationalStatus,
          damageCategoryIds: payload.damageCategoryIds || [],
          sourceType: "offline_sync",
        }, actor);
        if (report?.id) {
          await handlers.updateReport(departmentId, report.id, {
            suspectedCause: payload.suspectedCause || "",
            immediateActions: payload.immediateActions || "",
            utilityFacingNotes: payload.utilityFacingNotes || "",
            internalNotes: payload.internalNotes || "",
            leaking: Boolean(payload.leaking),
            roadwayHazard: Boolean(payload.roadwayHazard),
            publicSafetyHazard: Boolean(payload.publicSafetyHazard),
            wizardStep: payload.wizardStep || 1,
            discoveredAt: row.discoveredAt || payload.discoveredAt,
            _reason: "offline_sync_details",
          }, actor);
        }
      }
      markOfflineDamageDraftStatus(row.localId, "synced");
      removeOfflineDamageDraft(row.localId);
      results.push({ ok: true, localId: row.localId, reportId: report?.id });
    } catch (error) {
      markOfflineDamageDraftStatus(row.localId, "failed", error?.message || "Sync failed");
      results.push({ ok: false, localId: row.localId, error: error?.message || "Sync failed" });
    }
  }
  return {
    attempted: queued.length,
    succeeded: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}
