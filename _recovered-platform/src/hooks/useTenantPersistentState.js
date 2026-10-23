import { useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { getFirestoreDb, firebaseEnabled } from "../lib/firebaseClient.js";
import { departmentListPath, departmentListSegments, isPlatformScope, legacyRmsDataPath } from "../lib/tenantPaths.js";
import { writeAuditLog } from "../lib/auditService.js";
import { restoreItemsFromFirestore, sanitizeItemsForFirestore } from "../lib/firestoreSanitize.js";
import { loadTenantListFromFirestore, resolveTenantListItems } from "../lib/tenantListLoader.js";
import { withTenantListPayload } from "../lib/tenantRecord.js";

const LIST_MODULE_NAMES = {
  "hlfd-rms-personnel": "Personnel",
  "hlfd-rms-certifications": "Certifications",
  "hlfd-rms-training": "Training",
  "hlfd-rms-apparatus": "Apparatus",
  "hlfd-rms-work-orders": "Maintenance",
  "hlfd-rms-assets": "Assets",
  "hlfd-rms-documents": "Documents",
  "hlfd-rms-occupancies": "Occupancies",
  "hlfd-rms-inspections": "Inspections",
  "hlfd-rms-preplans": "Preplans",
  "hlfd-rms-hose-tests": "Hose Testing",
  "hlfd-rms-schedule-days": "Scheduling",
  "hlfd-rms-roster": "Scheduling",
  "hlfd-rms-leave-requests": "Scheduling",
  "hlfd-rms-overtime-offers": "Scheduling",
  "hlfd-rms-shift-trades": "Shift Trades"
};

function normalizeDataset(value, fallback) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return fallback;
}

function localCacheKey(departmentId, listKey) {
  return `tenant:${departmentId}:${listKey}`;
}

function readInitialItems(cacheKey, listKey, fallback) {
  try {
    const cached = window.localStorage.getItem(cacheKey);
    if (cached) {
      const restored = restoreItemsFromFirestore(normalizeDataset(JSON.parse(cached), fallback), listKey);
      if (restored.length) return restored;
    }
  } catch (error) {
    console.warn(`Local cache read failed for ${cacheKey}`, error);
  }
  return restoreItemsFromFirestore(fallback, listKey);
}

export function useTenantPersistentState(departmentId, listKey, fallback) {
  const { user } = useAuth();
  const storageDepartmentId = isPlatformScope(departmentId) ? null : departmentId;
  const cacheKey = localCacheKey(departmentId, listKey);
  const loadedRef = useRef(false);
  const fallbackRef = useRef(fallback);
  const itemsRef = useRef([]);
  fallbackRef.current = fallback;

  const [items, setItems] = useState(() => readInitialItems(cacheKey, listKey, fallback));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    async function loadLegacyItems() {
      const firestoreDb = getFirestoreDb();
      if (!firestoreDb) return [];

      try {
        const legacySnap = await getDoc(doc(firestoreDb, "rmsData", listKey));
        if (legacySnap.exists()) {
          return normalizeDataset(legacySnap.data()?.items, []);
        }
      } catch (error) {
        console.error(`Legacy Firebase load failed for ${listKey}`, error);
      }
      return [];
    }

    async function resolveRemoteSnapshot(tenantSnap) {
      const remoteItems = tenantSnap?.exists()
        ? (Array.isArray(tenantSnap.data()?.items) ? tenantSnap.data().items : [])
        : [];

      if (remoteItems.length) {
        return resolveTenantListItems({
          remoteItems,
          currentItems: itemsRef.current,
          fallbackItems: fallbackRef.current,
          listKey,
        });
      }

      const legacyItems = await loadLegacyItems();
      if (legacyItems.length) {
        return resolveTenantListItems({
          legacyItems,
          currentItems: itemsRef.current,
          fallbackItems: fallbackRef.current,
          listKey,
        });
      }

      if (!tenantSnap?.exists()) {
        const loaded = await loadTenantListFromFirestore(storageDepartmentId, listKey);
        if (loaded.items.length) {
          return loaded.items;
        }
      }

      return resolveTenantListItems({
        remoteItems,
        legacyItems,
        currentItems: itemsRef.current,
        fallbackItems: fallbackRef.current,
        listKey,
      });
    }

    function applyResolvedItems(nextItems, sourceLabel = "firebase") {
      if (cancelled) return;
      setItems(nextItems);
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(nextItems));
      } catch (error) {
        console.warn(`Local cache save failed for ${cacheKey}`, error);
      }
      loadedRef.current = true;
      setLoaded(true);
      console.log(`Synced ${departmentListPath(storageDepartmentId, listKey)} from ${sourceLabel}`, nextItems.length);
    }

    async function healEmptyTenantDoc(nextItems) {
      const firestoreDb = getFirestoreDb();
      if (!firestoreDb || !storageDepartmentId || !user?.uid || !nextItems.length) return;

      try {
        const tenantRef = doc(firestoreDb, ...departmentListSegments(storageDepartmentId, listKey));
        const tenantSnap = await getDoc(tenantRef);
        const remoteItems = tenantSnap.exists() && Array.isArray(tenantSnap.data()?.items)
          ? tenantSnap.data().items
          : [];
        if (remoteItems.length) return;

        const payload = withTenantListPayload(
          sanitizeItemsForFirestore(nextItems),
          { departmentId: storageDepartmentId, userId: user.uid }
        );
        await setDoc(tenantRef, payload, { merge: true });
        console.log(`Restored empty ${departmentListPath(storageDepartmentId, listKey)} document`, nextItems.length);
      } catch (error) {
        console.warn(`Failed to heal empty tenant list ${listKey}`, error);
      }
    }

    const firestoreDb = getFirestoreDb();
    if (!firebaseEnabled || !firestoreDb || !storageDepartmentId) {
      loadedRef.current = true;
      setLoaded(true);
      return () => {};
    }

    setLoaded(false);
    loadedRef.current = false;

    const tenantRef = doc(firestoreDb, ...departmentListSegments(storageDepartmentId, listKey));
    unsubscribe = onSnapshot(tenantRef, async (tenantSnap) => {
      if (cancelled) return;

      try {
        const nextItems = await resolveRemoteSnapshot(tenantSnap);
        applyResolvedItems(nextItems, tenantSnap.exists() ? "firebase" : "fallback");

        const remoteItems = tenantSnap.exists() && Array.isArray(tenantSnap.data()?.items)
          ? tenantSnap.data().items
          : [];
        if (!remoteItems.length && nextItems.length) {
          await healEmptyTenantDoc(nextItems);
        }
      } catch (error) {
        console.error(`Failed to resolve tenant list ${listKey}`, error);
        if (!cancelled) {
          loadedRef.current = true;
          setLoaded(true);
        }
      }
    }, (error) => {
      console.error(`Firebase subscribe failed for ${listKey}`, error);
      if (!cancelled) {
        loadedRef.current = true;
        setLoaded(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [departmentId, storageDepartmentId, listKey, cacheKey, user?.uid]);

  const setPersistentItems = (updater) => {
    setItems((current) => {
      let nextItems;
      try {
        nextItems = typeof updater === "function" ? updater(current) : updater;
      } catch (error) {
        console.error(`Update failed for ${listKey}`, error);
        return current;
      }

      const safeItems = normalizeDataset(nextItems, current);
      const normalizedItems = restoreItemsFromFirestore(safeItems, listKey);

      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(normalizedItems));
      } catch (error) {
        console.error(`Local cache save failed for ${cacheKey}`, error);
      }

      const firestoreDb = getFirestoreDb();
      if (firebaseEnabled && firestoreDb && storageDepartmentId && user?.uid && loadedRef.current) {
        const firestoreItems = sanitizeItemsForFirestore(normalizedItems);
        const payload = withTenantListPayload(firestoreItems, { departmentId: storageDepartmentId, userId: user.uid });
        setDoc(doc(firestoreDb, ...departmentListSegments(storageDepartmentId, listKey)), payload, { merge: true })
          .then(() => {
            const moduleName = LIST_MODULE_NAMES[listKey];
            if (moduleName) {
              writeAuditLog(storageDepartmentId, {
                action: "update",
                module: moduleName,
                summary: `Saved ${moduleName} (${normalizedItems.length} records)`,
                actorUid: user.uid,
                actorName: user.displayName || user.email || "User"
              }).catch((error) => console.warn("Audit log write failed", error));
            }
          })
          .catch((error) => console.error(`Firebase save failed for ${listKey}`, error));
      } else if (!loadedRef.current) {
        console.warn(`Skipped Firebase save for ${listKey} until remote data finishes loading`);
      }

      return normalizedItems;
    });
  };

  return [items, setPersistentItems, loaded];
};
