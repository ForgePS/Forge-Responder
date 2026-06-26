import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext.jsx";
import { defaultDepartmentProfile, defaultDepartmentSettings } from "../data/defaultDepartment.js";
import { defaultPlatformConfig } from "../data/platformBrand.js";
import { resolveDepartmentLogoUrl } from "../lib/brandAssets.js";
import { getFirestoreDb, firebaseEnabled } from "../lib/firebaseClient.js";
import { loadPlatformConfig } from "../lib/platformService.js";
import { DEFAULT_DEPARTMENT_ID, PLATFORM_SCOPE_ID, isPlatformScope } from "../lib/tenantPaths.js";

const ACTIVE_DEPARTMENT_KEY = "rms-active-department-id";

function mapPlatformProfile(config = defaultPlatformConfig) {
  return {
    ...defaultDepartmentProfile,
    id: PLATFORM_SCOPE_ID,
    name: config.name || defaultPlatformConfig.name,
    shortName: config.platformTitle || defaultPlatformConfig.platformTitle,
    displayTitle: config.platformTitle || defaultPlatformConfig.platformTitle,
    productTitle: config.platformTitle || defaultPlatformConfig.platformTitle,
    themeName: config.name || defaultPlatformConfig.name,
    branchLabel: config.platformLabel || defaultPlatformConfig.platformLabel,
    logoUrl: config.logoUrl || defaultPlatformConfig.logoUrl,
    status: config.status || "active"
  };
}

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { membership } = useAuth();
  const [departmentId, setDepartmentId] = useState(() => {
    try {
      return window.localStorage.getItem(ACTIVE_DEPARTMENT_KEY) || DEFAULT_DEPARTMENT_ID;
    } catch {
      return DEFAULT_DEPARTMENT_ID;
    }
  });

  useEffect(() => {
    if (membership?.departmentId && !membership?.isPlatformCreator) {
      setDepartmentId(membership.departmentId);
    }
  }, [membership?.departmentId, membership?.isPlatformCreator]);

  const [profile, setProfile] = useState(defaultDepartmentProfile);
  const [settings, setSettings] = useState(defaultDepartmentSettings);
  const [platformConfig, setPlatformConfig] = useState(defaultPlatformConfig);
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const inPlatformScope = isPlatformScope(departmentId);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_DEPARTMENT_KEY, departmentId);
    } catch (error) {
      console.warn("Unable to persist active department", error);
    }
  }, [departmentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTenant() {
      const firestoreDb = getFirestoreDb();
      if (!firebaseEnabled || !firestoreDb) {
        setReady(true);
        return;
      }

      try {
        const remotePlatform = await loadPlatformConfig();
        if (!cancelled) setPlatformConfig(remotePlatform);

        if (inPlatformScope) {
          if (!cancelled) {
            setProfile(mapPlatformProfile(remotePlatform));
            setSettings({ ...defaultDepartmentSettings, departmentId: PLATFORM_SCOPE_ID });
          }
          return;
        }

        const profileSnap = await getDoc(doc(firestoreDb, "departments", departmentId, "profile", "main"));
        const settingsSnap = await getDoc(doc(firestoreDb, "departments", departmentId, "settings", "main"));

        if (!cancelled && profileSnap.exists()) {
          const remoteProfile = profileSnap.data();
          setProfile({
            ...defaultDepartmentProfile,
            ...remoteProfile,
            id: departmentId,
            logoUrl: resolveDepartmentLogoUrl(remoteProfile.logoUrl || defaultDepartmentProfile.logoUrl)
          });
        } else if (!cancelled) {
          await setDoc(doc(firestoreDb, "departments", departmentId, "profile", "main"), defaultDepartmentProfile, { merge: true });
          setProfile({ ...defaultDepartmentProfile, id: departmentId });
        }

        if (!cancelled && settingsSnap.exists()) {
          setSettings({ ...defaultDepartmentSettings, ...settingsSnap.data(), departmentId });
        } else if (!cancelled) {
          await setDoc(doc(firestoreDb, "departments", departmentId, "settings", "main"), defaultDepartmentSettings, { merge: true });
        }
      } catch (error) {
        console.error("Failed to load tenant context", error);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    setReady(false);
    loadTenant();
    return () => {
      cancelled = true;
    };
  }, [departmentId, refreshKey, inPlatformScope]);

  const refreshDepartment = useCallback(() => setRefreshKey((value) => value + 1), []);
  const refreshPlatform = refreshDepartment;

  const value = useMemo(
    () => ({
      departmentId,
      profile,
      settings,
      platformConfig,
      isPlatformScope: inPlatformScope,
      ready,
      setDepartmentId,
      refreshDepartment,
      refreshPlatform,
      isModuleEnabled: (moduleKey) => inPlatformScope ? false : (settings.enabledModules?.includes(moduleKey) ?? true)
    }),
    [departmentId, profile, settings, platformConfig, inPlatformScope, ready, refreshDepartment]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return context;
}
