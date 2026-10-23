/**
 * Reference data the field app needs offline (apparatus, checklists, hydrants,
 * personnel, recent logs and reports). Downloaded whenever the app is online
 * and kept on the device. Each part is refreshed on its own: if one part
 * fails, the previous copy of that part is kept.
 */
import { kvGet, kvSet } from "./fieldDb.js";
import { getFirestoreDb, loadFirebaseList } from "../lib/firebaseClient.js";
import { readTenantList } from "../lib/tenantListStore.js";
import { LIST_KEYS } from "../lib/tenantListKeys.js";
import { getPersonDisplayName } from "../lib/personnelSchema.js";
import { normalizeDailyLogRecord } from "../lib/dailyLogSchema.js";
import { restoreFromFirestore } from "../lib/firestoreSanitize.js";
import { ensureFleetAssets, legacyApparatusToFleetAsset, listFleetAssets } from "../lib/fleet/fleetAssetService.js";
import {
  ensureChecklistTemplatesSeeded,
  getPublishedChecklistSnapshot,
  listChecklistTemplates,
} from "../lib/fleet/fleetChecklistService.js";
import { loadDepartmentHydrants, loadTenantHydrantCollection } from "../lib/hydrantTenantService.js";

function refKey(departmentId) {
  return `ref:${departmentId}`;
}

export async function loadRefData(departmentId) {
  return (await kvGet(refKey(departmentId))) || { parts: {}, fetchedAt: "" };
}

function daysAgoIso(days) {
  const date = new Date(Date.now() - days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function unitLabel(asset = {}) {
  return String(asset.unitDesignation || asset.fleetNumber || asset.name || asset.id || "").trim();
}

function trimIncident(report = {}) {
  const workspace = report.workspace || {};
  return {
    id: report.id,
    reportNumber: report.reportNumber || "",
    incidentDate: report.incidentDate || "",
    incidentAddress: report.incidentAddress || "",
    incidentTypeSummary: report.incidentTypeSummary || "",
    status: report.status || "",
    locked: Boolean(report.locked),
    disciplines: report.disciplines || [],
    updatedAt: report.updatedAt || "",
    createdAt: report.createdAt || "",
    fieldOrigin: report.fieldOrigin || null,
    workspace: {
      cad: workspace.cad || {},
      units: workspace.units || [],
      personnel: workspace.personnel || [],
      ems: workspace.ems || {},
      narrative: workspace.narrative || {},
    },
  };
}

const PART_LOADERS = {
  async assets({ departmentId, caps, actor }) {
    let assets = await listFleetAssets(departmentId);
    if (!assets.length) {
      const legacy = await readTenantList(getFirestoreDb(), departmentId, LIST_KEYS.apparatus).catch(() => ({ items: [] }));
      if (caps.truckChecks) {
        assets = await ensureFleetAssets(departmentId, legacy.items || [], actor);
      } else {
        assets = (legacy.items || []).map((item) => legacyApparatusToFleetAsset(item, departmentId));
      }
    }
    return assets
      .filter((asset) => !/retired|disposed|sold/i.test(String(asset.status || asset.lifecycleStatus || "")))
      .map((asset) => ({
        id: asset.id,
        fleetNumber: asset.fleetNumber || "",
        unitDesignation: asset.unitDesignation || "",
        name: asset.name || "",
        type: asset.type || "",
        station: asset.station || "",
        status: asset.status || "",
        readinessState: asset.readinessState || "",
        lastCheckAt: asset.lastCheckAt || "",
        lastCheckResult: asset.lastCheckResult || "",
        label: unitLabel(asset),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  },

  async templates({ departmentId, caps, actor }) {
    if (!caps.truckChecks) return [];
    let templates = await listChecklistTemplates(departmentId);
    if (!templates.length) templates = await ensureChecklistTemplatesSeeded(departmentId, actor);
    const usable = templates.filter((row) => row.lifecycleStatus === "published" || row.currentVersion > 0 || row.sections?.length);
    const snapshots = [];
    for (const template of usable) {
      const snapshot = await getPublishedChecklistSnapshot(departmentId, template.id);
      if (snapshot?.sections?.length) {
        snapshots.push({ ...snapshot, appliesTo: template.appliesTo || template.assetTypes || [] });
      }
    }
    return snapshots;
  },

  async hydrants({ departmentId, caps }) {
    if (!caps.hydrants && !caps.hydrantDamage) return [];
    return loadDepartmentHydrants(departmentId);
  },

  async personnel({ departmentId }) {
    const list = await readTenantList(getFirestoreDb(), departmentId, LIST_KEYS.personnel);
    return (list.items || [])
      .map((item) => restoreFromFirestore(item))
      .filter((person) => !/inactive|terminated|retired/i.test(String(person.status || "")))
      .map((person) => ({
        id: String(person.id || ""),
        name: getPersonDisplayName(person),
        rank: person.rank || "",
        shift: person.shift || "",
        station: person.station || "",
      }))
      .filter((person) => person.name && person.name !== "Unknown")
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async legacyUnits({ departmentId }) {
    const list = await readTenantList(getFirestoreDb(), departmentId, LIST_KEYS.apparatus);
    return [...new Set((list.items || [])
      .map((item) => String(item.unit || item.name || item.label || item.id || "").trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  },

  async dailyLogs({ departmentId, caps }) {
    if (!caps.dailyLogView) return [];
    const list = await readTenantList(getFirestoreDb(), departmentId, LIST_KEYS.dailyLogs);
    const since = daysAgoIso(4);
    return (list.items || [])
      .map((item, index) => normalizeDailyLogRecord(item, index))
      .filter((log) => String(log.date) >= since)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },

  async incidents({ departmentId, caps }) {
    if (!caps.incidents) return [];
    const list = await readTenantList(getFirestoreDb(), departmentId, LIST_KEYS.nerisFireReports);
    const since = daysAgoIso(14);
    return (list.items || [])
      .map((item) => restoreFromFirestore(item))
      .filter((report) => !report.locked && (String(report.incidentDate) >= since || /draft/i.test(String(report.status || ""))))
      .map(trimIncident)
      .sort((a, b) => String(b.incidentDate || b.createdAt).localeCompare(String(a.incidentDate || a.createdAt)))
      .slice(0, 60);
  },

  async hoseInventory({ departmentId, caps }) {
    if (!caps.hoseTests) return [];
    let inventory = await loadTenantHydrantCollection(departmentId, "hoseInventory", []);
    if (!inventory.length) inventory = await loadFirebaseList("hoseInventory", []).catch(() => []);
    return (inventory || [])
      .filter((hose) => hose?.hoseId)
      .map((hose) => ({
        hoseId: String(hose.hoseId),
        apparatus: hose.apparatus || "",
        diameter: String(hose.diameter || "").replace(/"/g, "").trim(),
        length: hose.length || "",
      }));
  },

  async hoseTests({ departmentId, caps }) {
    if (!caps.hoseTests) return [];
    const year = String(new Date().getFullYear());
    const rows = await loadTenantHydrantCollection(departmentId, "hoseTests", []);
    return rows
      .filter((row) => String(row.testDate || "").startsWith(year))
      .map((row) => ({ hoseId: row.hoseId, testDate: row.testDate, result: row.result, apparatus: row.apparatus || "", diameter: row.diameter || "" }));
  },
};

/**
 * Refresh reference data from the server.
 * @returns {Promise<{ data: object, failed: string[] }>}
 */
export async function refreshRefData({ departmentId, caps, actor }) {
  const current = await loadRefData(departmentId);
  const parts = { ...(current.parts || {}) };
  const failed = [];
  for (const [name, loader] of Object.entries(PART_LOADERS)) {
    try {
      const items = await loader({ departmentId, caps, actor });
      parts[name] = { items, fetchedAt: new Date().toISOString() };
    } catch (error) {
      console.warn(`Field data "${name}" could not be refreshed`, error);
      failed.push(name);
    }
  }
  const data = { parts, fetchedAt: new Date().toISOString(), failed };
  await kvSet(refKey(departmentId), data);
  return { data, failed };
}

export function refItems(refData, name) {
  return refData?.parts?.[name]?.items || [];
}

/** Units for pickers: fleet assets first, then any extra names from the older apparatus list. */
export function unitOptions(refData) {
  const labels = refItems(refData, "assets").map((asset) => asset.label).filter(Boolean);
  const legacy = refItems(refData, "legacyUnits");
  return [...new Set([...labels, ...legacy])];
}

/* ---------- Recent picks (remembered per department on the device) ---------- */

function recentKey(departmentId) {
  return `recent:${departmentId}`;
}

export async function loadRecent(departmentId) {
  return (await kvGet(recentKey(departmentId))) || {};
}

export async function rememberRecent(departmentId, values = {}) {
  const current = await loadRecent(departmentId);
  const next = { ...current };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      next[key] = value;
      continue;
    }
    const listKey = `${key}List`;
    next[key] = value;
    next[listKey] = [value, ...(current[listKey] || []).filter((item) => item !== value)].slice(0, 6);
  }
  await kvSet(recentKey(departmentId), next);
  return next;
}
