import { useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { getFirestoreDb, firebaseEnabled } from "../lib/firebaseClient.js";
import { departmentListPath, departmentListSegments, isPlatformScope } from "../lib/tenantPaths.js";
import { writeAuditLog } from "../lib/auditService.js";
import { restoreItemsFromFirestore, sanitizeItemsForFirestore } from "../lib/firestoreSanitize.js";
import { loadTenantListFromFirestore, resolveTenantListItems } from "../lib/tenantListLoader.js";
import { migrateTenantListItems, tenantListItemsChanged } from "../lib/dataMigrations.js";
import { withTenantListPayload } from "../lib/tenantRecord.js";

import { LIST_MODULE_NAMES } from "../lib/tenantListKeys.js";

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

    // Only this department's own data is ever loaded. (The old fallback to the
    // top-level rmsData collection copied Horn Lake's lists into other tenants.)
    async function resolveRemoteSnapshot(tenantSnap) {
      if (tenantSnap?.exists()) {
        const remoteItems = Array.isArray(tenantSnap.data()?.items) ? tenantSnap.data().items : [];
        return restoreItemsFromFirestore(remoteItems, listKey);
      }

      const loaded = await loadTenantListFromFirestore(storageDepartmentId, listKey);
      if (loaded.items.length) {
        return loaded.items;
      }

      return resolveTenantListItems({
        remoteItems: [],
        currentItems: itemsRef.current,
        fallbackItems: fallbackRef.current,
        listKey,
      });
    }

    function applyResolvedItems(nextItems, sourceLabel = "firebase") {
      if (cancelled) return;
      const migratedItems = migrateTenantListItems(nextItems, listKey);
      setItems(migratedItems);
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(migratedItems));
      } catch (error) {
        console.warn(`Local cache save failed for ${cacheKey}`, error);
      }
      loadedRef.current = true;
      setLoaded(true);
      console.log(`Synced ${departmentListPath(storageDepartmentId, listKey)} from ${sourceLabel}`, migratedItems.length);

      if (
        tenantListItemsChanged(nextItems, migratedItems)
        && firebaseEnabled
        && getFirestoreDb()
        && storageDepartmentId
        && user?.uid
      ) {
        const firestoreDb = getFirestoreDb();
        const payload = withTenantListPayload(
          sanitizeItemsForFirestore(migratedItems),
          { departmentId: storageDepartmentId, userId: user.uid },
        );
        setDoc(doc(firestoreDb, ...departmentListSegments(storageDepartmentId, listKey)), payload, { merge: true })
          .catch((error) => console.warn(`Failed to persist migrated ${listKey}`, error));
      }
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
        if (!remoteItems.length && nextItems.length && !tenantSnap.exists()) {
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

      if (JSON.stringify(normalizedItems) === JSON.stringify(current)) {
        return current;
      }

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
