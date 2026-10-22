import { useEffect, useRef, useState } from "react";
import { getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { getFirestoreDb, firebaseEnabled } from "../lib/firebaseClient.js";
import { departmentListPath, isPlatformScope } from "../lib/tenantPaths.js";
import { writeAuditLog } from "../lib/auditService.js";
import { restoreItemsFromFirestore, sanitizeItemsForFirestore } from "../lib/firestoreSanitize.js";
import { loadTenantListFromFirestore, resolveTenantListItems } from "../lib/tenantListLoader.js";
import { migrateTenantListItems, tenantListItemsChanged } from "../lib/dataMigrations.js";
import { withTenantListPayload } from "../lib/tenantRecord.js";
import { ensureItemIds, entriesFromRecords, isItemsStorage, itemsFromRecords, planListWrites } from "../lib/listItemsPlan.js";
import { commitListPlan, itemsHeaderPayload, listHeaderRef, listItemsQuery, recordsFromSnapshot } from "../lib/tenantListStore.js";

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

/**
 * A department list kept in Firestore and mirrored in local state.
 * Lists stored per item (header { storage: "items" }) save only the items that
 * changed; older lists stored as one array record keep working as before until
 * they are migrated. A list that doesn't exist yet is created per item.
 */
export function useTenantPersistentState(departmentId, listKey, fallback) {
  const { user } = useAuth();
  const storageDepartmentId = isPlatformScope(departmentId) ? null : departmentId;
  const cacheKey = localCacheKey(departmentId, listKey);
  const loadedRef = useRef(false);
  const fallbackRef = useRef(fallback);
  const itemsRef = useRef([]);
  // "unknown" until the header is read; then "array", "items" or "missing".
  const modeRef = useRef("unknown");
  // Per-item lists: what the server holds (id -> order + content), to diff saves against.
  const entriesRef = useRef(new Map());
  const userRef = useRef(user);
  fallbackRef.current = fallback;
  userRef.current = user;

  const [items, setItems] = useState(() => readInitialItems(cacheKey, listKey, fallback));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  /** Save the whole list in whichever format it uses. */
  async function persistItems(normalizedItems) {
    const firestoreDb = getFirestoreDb();
    const uid = userRef.current?.uid;
    if (!firebaseEnabled || !firestoreDb || !storageDepartmentId || !uid) return false;
    const firestoreItems = sanitizeItemsForFirestore(normalizedItems);

    if (modeRef.current === "items" || modeRef.current === "missing") {
      const plan = planListWrites(entriesRef.current, firestoreItems);
      entriesRef.current = plan.entries;
      await commitListPlan(firestoreDb, storageDepartmentId, listKey, plan);
      if (modeRef.current === "missing") {
        // First save of a brand-new list: mark it as per-item from the start.
        await setDoc(
          listHeaderRef(firestoreDb, storageDepartmentId, listKey),
          itemsHeaderPayload({ departmentId: storageDepartmentId, userId: uid, itemCount: firestoreItems.length }),
          { merge: true },
        );
      }
      return true;
    }

    const payload = withTenantListPayload(firestoreItems, { departmentId: storageDepartmentId, userId: uid });
    await setDoc(listHeaderRef(firestoreDb, storageDepartmentId, listKey), payload, { merge: true });
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    let unsubscribeHeader = () => {};
    let unsubscribeItems = null;
    modeRef.current = "unknown";
    entriesRef.current = new Map();

    // Only this department's own data is ever loaded. (The old fallback to the
    // top-level rmsData collection copied Horn Lake's lists into other tenants.)
    async function resolveArraySnapshot(tenantSnap) {
      if (tenantSnap?.exists()) {
        const remoteItems = Array.isArray(tenantSnap.data()?.items) ? tenantSnap.data().items : [];
        return restoreItemsFromFirestore(remoteItems, listKey);
      }

      const loadedList = await loadTenantListFromFirestore(storageDepartmentId, listKey);
      if (loadedList.items.length) {
        return loadedList.items;
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
      const { items: withIds } = ensureItemIds(migratedItems);
      setItems(withIds);
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(withIds));
      } catch (error) {
        console.warn(`Local cache save failed for ${cacheKey}`, error);
      }
      loadedRef.current = true;
      setLoaded(true);
      console.log(`Synced ${departmentListPath(storageDepartmentId, listKey)} from ${sourceLabel}`, withIds.length);

      // Data fixes applied on load (renamed units, missing ids) are saved back.
      if (tenantListItemsChanged(nextItems, withIds) && modeRef.current !== "missing") {
        persistItems(withIds).catch((error) => console.warn(`Failed to persist migrated ${listKey}`, error));
      }
    }

    function startItemsListener(firestoreDb) {
      if (unsubscribeItems) return;
      unsubscribeItems = onSnapshot(listItemsQuery(firestoreDb, storageDepartmentId, listKey), (querySnap) => {
        if (cancelled) return;
        const records = recordsFromSnapshot(querySnap);
        entriesRef.current = entriesFromRecords(records);
        applyResolvedItems(restoreItemsFromFirestore(itemsFromRecords(records), listKey), "firebase (per item)");
      }, (error) => {
        console.error(`Firebase subscribe failed for ${listKey} items`, error);
        if (!cancelled) {
          loadedRef.current = true;
          setLoaded(true);
        }
      });
    }

    function stopItemsListener() {
      if (unsubscribeItems) unsubscribeItems();
      unsubscribeItems = null;
    }

    async function healEmptyTenantDoc(nextItems) {
      const firestoreDb = getFirestoreDb();
      if (!firestoreDb || !storageDepartmentId || !userRef.current?.uid || !nextItems.length) return;

      try {
        const tenantSnap = await getDoc(listHeaderRef(firestoreDb, storageDepartmentId, listKey));
        if (tenantSnap.exists()) return;
        await persistItems(nextItems);
        console.log(`Created ${departmentListPath(storageDepartmentId, listKey)}`, nextItems.length);
      } catch (error) {
        console.warn(`Failed to create tenant list ${listKey}`, error);
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

    unsubscribeHeader = onSnapshot(listHeaderRef(firestoreDb, storageDepartmentId, listKey), async (headerSnap) => {
      if (cancelled) return;
      const header = headerSnap.exists() ? headerSnap.data() : null;

      if (isItemsStorage(header)) {
        if (modeRef.current !== "items") {
          modeRef.current = "items";
          startItemsListener(firestoreDb);
        }
        return;
      }

      stopItemsListener();
      modeRef.current = headerSnap.exists() ? "array" : "missing";
      try {
        const nextItems = await resolveArraySnapshot(headerSnap);
        applyResolvedItems(nextItems, headerSnap.exists() ? "firebase" : "fallback");
        if (!headerSnap.exists() && nextItems.length) {
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
      unsubscribeHeader();
      stopItemsListener();
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
      // Every item gets a unique id so it can be stored as its own record.
      const { items: normalizedItems } = ensureItemIds(restoreItemsFromFirestore(safeItems, listKey));

      if (JSON.stringify(normalizedItems) === JSON.stringify(current)) {
        return current;
      }

      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(normalizedItems));
      } catch (error) {
        console.error(`Local cache save failed for ${cacheKey}`, error);
      }

      if (loadedRef.current) {
        persistItems(normalizedItems)
          .then((saved) => {
            const moduleName = LIST_MODULE_NAMES[listKey];
            const actor = userRef.current;
            if (saved && moduleName && actor?.uid) {
              writeAuditLog(storageDepartmentId, {
                action: "update",
                module: moduleName,
                summary: `Saved ${moduleName} (${normalizedItems.length} records)`,
                actorUid: actor.uid,
                actorName: actor.displayName || actor.email || "User"
              }).catch((error) => console.warn("Audit log write failed", error));
            }
          })
          .catch((error) => console.error(`Firebase save failed for ${listKey}`, error));
      } else {
        console.warn(`Skipped Firebase save for ${listKey} until remote data finishes loading`);
      }

      return normalizedItems;
    });
  };

  return [items, setPersistentItems, loaded];
};
