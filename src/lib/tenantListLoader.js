import { doc, getDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { restoreItemsFromFirestore } from "./firestoreSanitize.js";
import { listRecords } from "./firestoreService.js";
import { departmentListSegments } from "./tenantPaths.js";

const SUBCOLLECTION_FALLBACKS = {
  "hlfd-rms-personnel": "personnel",
  "hlfd-rms-apparatus": "apparatus",
};

function normalizeItems(items = [], listKey = "") {
  return restoreItemsFromFirestore(Array.isArray(items) ? items : [], listKey);
}

export async function loadTenantListFromFirestore(departmentId, listKey) {
  if (!departmentId || !listKey) {
    return { items: [], source: "missing" };
  }

  const db = getFirestoreDb();
  if (!db) {
    return { items: [], source: "offline" };
  }

  let tenantExists = false;
  let tenantEmpty = false;

  try {
    const tenantSnap = await getDoc(doc(db, ...departmentListSegments(departmentId, listKey)));
    if (tenantSnap.exists()) {
      tenantExists = true;
      const items = Array.isArray(tenantSnap.data()?.items) ? tenantSnap.data().items : [];
      if (items.length) {
        return { items: normalizeItems(items, listKey), source: "tenant" };
      }
      tenantEmpty = true;
    }
  } catch (error) {
    console.error(`Failed to load tenant list ${listKey}`, error);
  }

  // No fallback to the legacy top-level rmsData collection: it holds Horn Lake's
  // data and must never be loaded into (or copied to) another department.

  const subcollection = SUBCOLLECTION_FALLBACKS[listKey];
  if (subcollection) {
    try {
      const records = await listRecords(departmentId, subcollection);
      if (records.length) {
        return { items: normalizeItems(records, listKey), source: "subcollection" };
      }
    } catch (error) {
      console.error(`Failed to load ${subcollection} subcollection for ${listKey}`, error);
    }
  }

  if (tenantExists && tenantEmpty) {
    return { items: [], source: "tenant-empty" };
  }

  return { items: [], source: "missing" };
}

export function resolveTenantListItems({
  remoteItems = [],
  currentItems = [],
  fallbackItems = [],
  listKey = "",
}) {
  const normalizedRemote = normalizeItems(remoteItems, listKey);
  if (normalizedRemote.length) return normalizedRemote;

  const normalizedCurrent = normalizeItems(currentItems, listKey);
  if (normalizedCurrent.length) return normalizedCurrent;

  return normalizeItems(fallbackItems, listKey);
}
