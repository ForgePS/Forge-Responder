/**
 * EMS check-offs client. Checks themselves are Fleet checks (src/lib/fleet); every
 * EMS change goes through a Cloud Function (functions/lib/emsCheckoffs/service.js):
 * recording a finished check's results, sign-off, assignments and readiness rules.
 * Firestore rules let the browser read with a check-off permission.
 */
import { httpsCallable } from "firebase/functions";
import { collection, doc, documentId, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFirebaseFunctions, getFirestoreDb } from "../firebaseClient.js";

async function call(name, payload, timeout = 60000) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, name, { timeout })(payload);
  return result.data || {};
}

export const saveCheckoffAssignment = (departmentId, assignment) => call("emsCheckoffsSaveAssignment", { departmentId, assignment });
export const saveReadinessRules = (departmentId, rules) => call("emsCheckoffsSaveRules", { departmentId, rules });
export const recordCheckoffResults = (departmentId, checkId) => call("emsCheckoffsRecordResults", { departmentId, checkId }, 120000);
export const signOffCheckoff = (departmentId, checkId, decision, note) => call("emsCheckoffsSignOff", { departmentId, checkId, decision, note });

function tenantCollection(departmentId, name) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;
  return collection(db, "departments", departmentId, name);
}

const noop = () => () => {};

function watch(target, onChange, onError) {
  if (!target) return noop();
  return onSnapshot(target, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (error) => onError?.(error));
}

export const watchCheckoffAssignments = (departmentId, onChange, onError) =>
  watch(tenantCollection(departmentId, "emsCheckoffAssignments"), onChange, onError);

export function watchCheckoffResults(departmentId, onChange, onError, max = 300) {
  const target = tenantCollection(departmentId, "emsCheckoffResults");
  return target ? watch(query(target, orderBy("recordedAt", "desc"), limit(max)), onChange, onError) : noop();
}

/** Every check-off waiting for sign-off, however old: the history list stops at `max`. */
export function watchPendingCheckoffs(departmentId, onChange, onError) {
  const target = tenantCollection(departmentId, "emsCheckoffResults");
  return target ? watch(query(target, where("verification.status", "==", "pending")), onChange, onError) : noop();
}

/** Results for these check ids (for checks older than the history list), in batches of 30. */
export async function loadCheckoffResults(departmentId, checkIds = []) {
  const target = tenantCollection(departmentId, "emsCheckoffResults");
  const ids = [...new Set(checkIds.filter(Boolean))];
  if (!target || !ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 30) {
    out.push(...await rows(query(target, where(documentId(), "in", ids.slice(i, i + 30)))));
  }
  return out;
}

export function watchCheckoffSettings(departmentId, onChange, onError) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return noop();
  return onSnapshot(doc(db, "departments", departmentId, "emsCheckoffSettings", "main"),
    (snap) => onChange(snap.exists() ? snap.data() : null), (error) => onError?.(error));
}

async function rows(target) {
  const snap = await getDocs(target);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** EMS locations on a vehicle: linked to it, or inside one that is. */
export function vehicleLocationsFrom(locations = [], fleetAssetId = "") {
  const roots = new Set(locations.filter((l) => l.fleetAssetId === fleetAssetId).map((l) => l.id));
  return locations.filter((l) => l.active !== false
    && (roots.has(l.id) || (Array.isArray(l.ancestorIds) && l.ancestorIds.some((a) => roots.has(a)))));
}

/**
 * What an EMS check item lists for a vehicle, read when the check is opened:
 * equipment placed on it, and supplies with a par level at its EMS locations.
 * Each part is empty with a reason when the member can't read it.
 */
export async function loadUnitEmsRecords(departmentId, fleetAssetId, { equipment = true, supplies = true } = {}) {
  const out = { equipment: [], supplies: [], equipmentError: "", suppliesError: "" };
  if (!departmentId || !fleetAssetId) return out;
  if (equipment) {
    try {
      const list = await rows(query(tenantCollection(departmentId, "emsEquipment"), where("assignment.fleetAssetId", "==", fleetAssetId)));
      out.equipment = list
        .filter((e) => !["retired", "disposed"].includes(e.status))
        .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)));
    } catch (error) {
      out.equipmentError = /permission/i.test(error?.message || "") ? "You don't have access to EMS equipment." : "Couldn't load the unit's equipment.";
    }
  }
  if (supplies) {
    try {
      const locations = vehicleLocationsFrom(await rows(tenantCollection(departmentId, "emsInventoryLocations")), fleetAssetId);
      const byId = Object.fromEntries(locations.map((l) => [l.id, l]));
      const ids = locations.map((l) => l.id);
      const balances = [];
      for (let i = 0; i < ids.length; i += 30) {
        balances.push(...await rows(query(tenantCollection(departmentId, "emsInventoryBalances"), where("locationId", "in", ids.slice(i, i + 30)))));
      }
      const items = ids.length ? await rows(tenantCollection(departmentId, "emsInventoryItems")) : [];
      const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
      out.supplies = balances
        .filter((b) => b.par && itemsById[b.itemId])
        .map((b) => ({
          id: b.id,
          itemId: b.itemId,
          name: itemsById[b.itemId].name,
          unitOfMeasure: itemsById[b.itemId].unitOfMeasure || "each",
          locationId: b.locationId,
          locationName: byId[b.locationId]?.name || "",
          parMin: Number.isFinite(b.par?.min) ? b.par.min : null,
          parMax: Number.isFinite(b.par?.max) ? b.par.max : null,
          onHand: Number(b.onHand) || 0,
          earliestExpiration: b.earliestExpiration || "",
        }))
        .sort((a, b) => a.locationName.localeCompare(b.locationName) || a.name.localeCompare(b.name));
    } catch (error) {
      out.suppliesError = /permission/i.test(error?.message || "") ? "You don't have access to EMS supplies." : "Couldn't load the unit's supplies.";
    }
  }
  return out;
}

export { describeError, newRequestId } from "./emsInventoryService.js";
