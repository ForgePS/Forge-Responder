import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext.jsx";
import { normalizeShiftRotation } from "../data/defaultShiftRotation.js";
import { normalizePayPeriod } from "../lib/payPeriods.js";
import { normalizeEmployeePortalRules } from "../lib/employeePortalRules.js";
import { normalizePayRules } from "../lib/payRules.js";
import { createDepartmentProfileTemplate, createDepartmentSettingsTemplate } from "../data/defaultDepartment.js";
import { resolveDepartmentProfileDefaults, resolveDepartmentSettingsDefaults } from "../data/tenants/index.js";
import { defaultPlatformConfig } from "../data/platformBrand.js";
import { resolveDepartmentLogoUrl, resolvePlatformLogoUrl } from "../lib/brandAssets.js";
import { getFirestoreDb, firebaseEnabled } from "../lib/firebaseClient.js";
import {
  applyPlatformToDepartmentProfile,
  applyPlatformToDepartmentSettings,
  resolveAvailableModules,
} from "../lib/platformInheritance.js";
import { loadPlatformConfig } from "../lib/platformService.js";
import {
  customerSubscriptionToLegacyTerm,
  getCustomerSubscription,
  isSubscriptionAccessAllowed,
} from "../lib/platformSubscriptionService.js";
import { activateDemoMode, isDemoModeActive } from "../lib/demoMode.js";
import { demoDepartmentProfile, demoDepartmentSettings, mapDemoDepartmentProfile } from "../data/demoDepartment.js";
import {
  isCreatorConsolePath,
  parseGatewayDepartmentId,
  persistGatewayContext,
  resolveActiveDepartmentId,
  shouldSyncGatewayUrl,
  syncGatewayUrl
} from "../lib/gatewayRouting.js";
import { resolveGatewayDepartmentId } from "../lib/gatewayService.js";
import { writeStoredWorkspaceId } from "../lib/creatorConsoleWorkspace.js";
import { DEFAULT_DEPARTMENT_ID, DEMO_DEPARTMENT_ID, PLATFORM_SCOPE_ID, isDemoDepartment, isPlatformScope } from "../lib/tenantPaths.js";
import { isHornLakeHydrantHost, hornLakeDepartmentId } from "../lib/hydrantAppRouting.js";

function mapPlatformProfile(config = defaultPlatformConfig) {
  return {
    ...createDepartmentProfileTemplate(PLATFORM_SCOPE_ID),
    id: PLATFORM_SCOPE_ID,
    name: config.name || defaultPlatformConfig.name,
    shortName: config.platformTitle || defaultPlatformConfig.platformTitle,
    displayTitle: config.platformTitle || defaultPlatformConfig.platformTitle,
    productTitle: config.platformTitle || defaultPlatformConfig.platformTitle,
    themeName: config.name || defaultPlatformConfig.name,
    branchLabel: config.platformLabel || defaultPlatformConfig.platformLabel,
    logoUrl: resolvePlatformLogoUrl(config.logoUrl || defaultPlatformConfig.logoUrl),
    status: config.status || "active"
  };
}

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { membership } = useAuth();
  const initialGatewayDepartmentId = typeof window !== "undefined" ? parseGatewayDepartmentId() : null;
  const [gatewayDepartmentId, setGatewayDepartmentId] = useState(initialGatewayDepartmentId);
  const [gatewayRecord, setGatewayRecord] = useState(null);
  const [gatewayReady, setGatewayReady] = useState(true);
  const [gatewayError, setGatewayError] = useState(false);
  const [departmentId, setDepartmentId] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_DEPARTMENT_ID;
    return resolveActiveDepartmentId();
  });

  useEffect(() => {
    if (isDemoModeActive()) {
      setDepartmentId(DEMO_DEPARTMENT_ID);
      return;
    }
    if (gatewayRecord?.departmentId) {
      setDepartmentId(gatewayRecord.departmentId);
      return;
    }
    if (isCreatorConsolePath()) return;
    if (membership?.departmentId && !membership?.isPlatformCreator) {
      setDepartmentId(membership.departmentId);
    }
  }, [gatewayRecord?.departmentId, membership?.departmentId, membership?.isPlatformCreator]);

  useEffect(() => {
    let cancelled = false;

    async function resolveFromPath() {
      if (isDemoModeActive()) {
        setGatewayReady(true);
        return;
      }

      if (isHornLakeHydrantHost(window.location.hostname)) {
        setGatewayDepartmentId(null);
        setGatewayRecord(null);
        setGatewayError(false);
        setDepartmentId(hornLakeDepartmentId());
        setGatewayReady(true);
        persistGatewayContext("", hornLakeDepartmentId());
        return;
      }

      const nextGatewayDepartmentId = parseGatewayDepartmentId();
      setGatewayDepartmentId(nextGatewayDepartmentId);

      if (!nextGatewayDepartmentId) {
        setGatewayRecord(null);
        setGatewayError(false);
        setGatewayReady(true);
        persistGatewayContext("", "");
        return;
      }

      setGatewayError(false);

      try {
        const record = await resolveGatewayDepartmentId(nextGatewayDepartmentId);
        if (cancelled) return;
        if (!record?.departmentId) {
          setGatewayRecord(null);
          setGatewayError(true);
          setGatewayReady(true);
          persistGatewayContext(nextGatewayDepartmentId, "");
          return;
        }
        if (isDemoDepartment(record.departmentId)) {
          activateDemoMode();
        }
        setGatewayRecord(record);
        setDepartmentId(record.departmentId);
        persistGatewayContext(record.gatewayId, record.departmentId);
        setGatewayReady(true);
      } catch (error) {
        console.error("Failed to resolve RMS gateway", error);
        if (!cancelled) {
          setGatewayRecord(null);
          setGatewayError(true);
          setGatewayReady(true);
        }
      }
    }

    resolveFromPath();
    window.addEventListener("popstate", resolveFromPath);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", resolveFromPath);
    };
  }, []);

  const [profile, setProfile] = useState(() => resolveDepartmentProfileDefaults(DEFAULT_DEPARTMENT_ID));
  const [settings, setSettings] = useState(() => resolveDepartmentSettingsDefaults(DEFAULT_DEPARTMENT_ID));
  const [platformConfig, setPlatformConfig] = useState(defaultPlatformConfig);
  const [ready, setReady] = useState(false);
  const [platformRefreshKey, setPlatformRefreshKey] = useState(0);
  const [departmentRefreshKey, setDepartmentRefreshKey] = useState(0);
  const initialTenantLoadDoneRef = useRef(false);

  const inPlatformScope = isPlatformScope(departmentId);

  useEffect(() => {
    try {
      writeStoredWorkspaceId(departmentId);
    } catch (error) {
      console.warn("Unable to persist active department", error);
    }
    if (shouldSyncGatewayUrl(departmentId)) {
      syncGatewayUrl(departmentId);
    }
  }, [departmentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlatform() {
      const firestoreDb = getFirestoreDb();
      if (!firebaseEnabled || !firestoreDb) return;

      try {
        const remotePlatform = await loadPlatformConfig();
        if (!cancelled) setPlatformConfig(remotePlatform);
      } catch (error) {
        console.error("Failed to load platform config", error);
      }
    }

    loadPlatform();
    return () => { cancelled = true; };
  }, [platformRefreshKey]);

  useEffect(() => {
    if (!inPlatformScope) return;
    setProfile(mapPlatformProfile(platformConfig));
    setSettings({ ...createDepartmentSettingsTemplate(PLATFORM_SCOPE_ID), departmentId: PLATFORM_SCOPE_ID });
  }, [inPlatformScope, platformConfig]);

  useEffect(() => {
    if (inPlatformScope || !departmentId) return;
    setProfile((current) => applyPlatformToDepartmentProfile(current, platformConfig, departmentId));
    setSettings((current) => applyPlatformToDepartmentSettings(current, platformConfig, departmentId));
  }, [platformConfig, departmentId, inPlatformScope]);

  useEffect(() => {
    let cancelled = false;

    async function loadTenant() {
      const firestoreDb = getFirestoreDb();

      try {
        if (inPlatformScope || !firebaseEnabled || !firestoreDb) {
          return;
        }

        if (isDemoDepartment(departmentId)) {
          const profileSnap = await getDoc(doc(firestoreDb, "departments", departmentId, "profile", "main"));
          const settingsSnap = await getDoc(doc(firestoreDb, "departments", departmentId, "settings", "main"));
          if (!cancelled) {
            const demoProfile = profileSnap.exists()
              ? mapDemoDepartmentProfile(profileSnap.data())
              : mapDemoDepartmentProfile();
            const demoSettings = settingsSnap.exists()
              ? { ...demoDepartmentSettings, ...settingsSnap.data(), departmentId }
              : { ...demoDepartmentSettings, departmentId };
            setProfile(applyPlatformToDepartmentProfile(demoProfile, platformConfig, departmentId));
            setSettings(applyPlatformToDepartmentSettings(demoSettings, platformConfig, departmentId));
          }
          return;
        }

        const profileSnap = await getDoc(doc(firestoreDb, "departments", departmentId, "profile", "main"));
        const settingsSnap = await getDoc(doc(firestoreDb, "departments", departmentId, "settings", "main"));
        const registrySnap = await getDoc(doc(firestoreDb, "platformDepartments", departmentId));

        const profileDefaults = resolveDepartmentProfileDefaults(departmentId);
        const settingsDefaults = resolveDepartmentSettingsDefaults(departmentId);
        const registryExists = registrySnap.exists() && registrySnap.data()?.status !== "disabled";
        const isKnownSeed = departmentId === DEFAULT_DEPARTMENT_ID || isDemoDepartment(departmentId);

        if (!cancelled && profileSnap.exists()) {
          const remoteProfile = profileSnap.data();
          const loadedProfile = {
            ...profileDefaults,
            ...remoteProfile,
            id: departmentId,
            logoUrl: resolveDepartmentLogoUrl(remoteProfile.logoUrl || profileDefaults.logoUrl)
          };
          setProfile(applyPlatformToDepartmentProfile(loadedProfile, platformConfig, departmentId));
        } else if (!cancelled && gatewayRecord?.departmentId === departmentId) {
          const gatewayProfile = {
            ...profileDefaults,
            id: departmentId,
            name: gatewayRecord.departmentName || profileDefaults.name,
            shortName: gatewayRecord.departmentShortName || gatewayRecord.departmentName || profileDefaults.shortName,
            displayTitle: gatewayRecord.departmentName || profileDefaults.displayTitle,
            logoUrl: gatewayRecord.logoUrl || profileDefaults.logoUrl
          };
          setProfile(applyPlatformToDepartmentProfile(gatewayProfile, platformConfig, departmentId));
        } else if (!cancelled && (registryExists || isKnownSeed)) {
          const seedProfile = { ...profileDefaults, id: departmentId };
          await setDoc(doc(firestoreDb, "departments", departmentId, "profile", "main"), seedProfile, { merge: true });
          setProfile(applyPlatformToDepartmentProfile(seedProfile, platformConfig, departmentId));
        } else if (!cancelled) {
          // Unknown gateway path — do not invent a "Fire Department" tenant.
          setProfile(applyPlatformToDepartmentProfile({ ...profileDefaults, id: departmentId }, platformConfig, departmentId));
        }

        if (!cancelled && settingsSnap.exists()) {
          const profileShifts = profileSnap.exists()
            ? profileSnap.data()?.shifts
            : profileDefaults.shifts;
          const mergedSettings = {
            ...settingsDefaults,
            ...settingsSnap.data(),
            departmentId,
            shiftRotation: normalizeShiftRotation(settingsSnap.data()?.shiftRotation, profileShifts),
            payPeriod: normalizePayPeriod(settingsSnap.data()?.payPeriod),
            employeePortalRules: normalizeEmployeePortalRules(settingsSnap.data()?.employeePortalRules),
            payRules: normalizePayRules(settingsSnap.data()?.payRules),
          };

          try {
            const saas = await getCustomerSubscription(departmentId);
            if (saas) {
              const legacy = customerSubscriptionToLegacyTerm(saas);
              mergedSettings.subscription = {
                ...(mergedSettings.subscription || {}),
                ...legacy,
              };
              mergedSettings.subscriptionAccessAllowed = isSubscriptionAccessAllowed(saas);
              mergedSettings.customerSubscription = saas;
            }
          } catch (error) {
            console.warn("Unable to load SaaS subscription for tenant", error);
          }

          if (!cancelled) {
            setSettings(applyPlatformToDepartmentSettings(
              mergedSettings,
              platformConfig,
              departmentId
            ));
          }
        } else if (!cancelled) {
          const seedSettings = { ...settingsDefaults, departmentId };
          await setDoc(doc(firestoreDb, "departments", departmentId, "settings", "main"), seedSettings, { merge: true });
          setSettings(applyPlatformToDepartmentSettings(seedSettings, platformConfig, departmentId));
        }
      } catch (error) {
        console.error("Failed to load tenant context", error);
      } finally {
        if (!cancelled) {
          setReady(true);
          initialTenantLoadDoneRef.current = true;
        }
      }
    }

    if (!initialTenantLoadDoneRef.current) {
      setReady(false);
    }
    loadTenant();
    return () => {
      cancelled = true;
    };
  }, [departmentId, inPlatformScope, gatewayRecord, departmentRefreshKey, platformConfig]);

  const refreshDepartment = useCallback(() => setDepartmentRefreshKey((value) => value + 1), []);
  const refreshPlatform = useCallback(() => setPlatformRefreshKey((value) => value + 1), []);

  const value = useMemo(
    () => ({
      departmentId,
      gatewayDepartmentId,
      gatewayRecord,
      gatewayReady,
      gatewayError,
      profile,
      settings,
      platformConfig,
      isPlatformScope: inPlatformScope,
      ready: ready && gatewayReady,
      setDepartmentId,
      refreshDepartment,
      refreshPlatform,
      isModuleEnabled: (moduleKey) => {
        if (inPlatformScope) return false;
        const available = resolveAvailableModules(platformConfig?.availableModules);
        if (!available.includes(moduleKey)) return false;
        return settings.enabledModules?.includes(moduleKey) ?? true;
      }
    }),
    [departmentId, gatewayDepartmentId, gatewayRecord, gatewayReady, gatewayError, profile, settings, platformConfig, inPlatformScope, ready, refreshDepartment]
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
