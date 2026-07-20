import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from "firebase/auth";
import { firebaseEnabled, getFirebaseAuth } from "../lib/firebaseClient.js";
import { CREATOR_PERMISSIONS } from "../data/creatorPermissions.js";
import { ensureMembershipForUser } from "../lib/departmentMembership.js";
import {
  buildBootstrapMembership,
  buildBootstrapRolesMap,
  isPlatformBootstrapEmail
} from "../lib/platformBootstrap.js";
import {
  bootstrapPlatformAccess,
  canSelfRestoreMembership,
  membershipNeedsAdminRecovery,
  recoverMembershipAccess,
  resolveMembershipDepartmentId
} from "../lib/membershipRecovery.js";
import {
  canAccessAdminRms,
  getDefaultRolePermissions,
  normalizeRoleIds,
  isPlatformCreatorUser
} from "../lib/permissions.js";
import { mergeMembershipPermissions } from "../lib/userPermissions.js";
import {
  ensureCreatorDepartmentAccess,
  ensurePlatformConfig,
  loadPlatformCreator
} from "../lib/platformService.js";
import { loadRolesMap } from "../lib/roleService.js";
import { isDemoModeActive } from "../lib/demoMode.js";
import { ensureDemoAccess } from "../lib/demoService.js";
import { resolveActiveDepartmentId, shouldSyncGatewayUrl, syncGatewayUrl } from "../lib/gatewayRouting.js";
import { DEFAULT_DEPARTMENT_ID, DEMO_DEPARTMENT_ID, PLATFORM_SCOPE_ID, isDemoDepartment } from "../lib/tenantPaths.js";

const AuthContext = createContext(null);

function getActiveDepartmentId() {
  return resolveActiveDepartmentId();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [membership, setMembership] = useState(null);
  const [rolesById, setRolesById] = useState({});
  const [authLoading, setAuthLoading] = useState(firebaseEnabled);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  async function applyMembership(nextUser, departmentId, nextMembership, nextRoles, creatorActive) {
    let membershipRecord = nextMembership;
    let rolesMap = nextRoles;

    const needsRecovery = membershipNeedsAdminRecovery(
      nextUser,
      membershipRecord,
      rolesMap,
      creatorActive
    );

    if (needsRecovery) {
      const recovered = await recoverMembershipAccess(nextUser, departmentId);
      if (recovered?.status === "active") {
        membershipRecord = recovered;
        rolesMap = await loadRolesMap(departmentId);
      }
    }

    setRolesById(rolesMap);
    const activeMembership = membershipRecord?.status === "active" ? membershipRecord : null;
    setMembership(activeMembership);

    if (
      activeMembership?.departmentId
      && !isDemoModeActive()
      && !isDemoDepartment(activeMembership.departmentId)
      && shouldSyncGatewayUrl(activeMembership.departmentId)
    ) {
      syncGatewayUrl(activeMembership.departmentId);
    }

    return membershipRecord;
  }

  async function hydrateAccess(nextUser) {
    if (isDemoModeActive()) {
      const [nextMembership, nextRoles] = await Promise.all([
        ensureDemoAccess(nextUser),
        loadRolesMap(DEMO_DEPARTMENT_ID),
        ensurePlatformConfig()
      ]);
      setIsCreator(false);
      await applyMembership(nextUser, DEMO_DEPARTMENT_ID, nextMembership, nextRoles, false);
      return;
    }

    const activeDepartmentId = getActiveDepartmentId();
    const membershipDepartmentId = resolveMembershipDepartmentId(activeDepartmentId);
    const bootstrapEmail = isPlatformBootstrapEmail(nextUser.email);

    if (bootstrapEmail) {
      let bootstrapped = null;
      try {
        bootstrapped = await bootstrapPlatformAccess(nextUser, activeDepartmentId);
      } catch (error) {
        console.warn("Bootstrap Firestore sync failed; using client creator access", error);
      }

      const membershipRecord = bootstrapped?.status === "active"
        ? bootstrapped
        : buildBootstrapMembership(nextUser, membershipDepartmentId);

      let rolesMap = buildBootstrapRolesMap();
      try {
        const remoteRoles = await loadRolesMap(membershipDepartmentId);
        if (Object.keys(remoteRoles).length) rolesMap = remoteRoles;
      } catch (error) {
        console.warn("Using local creator role map for bootstrap access", error);
      }

      setIsCreator(true);
      setRolesById(rolesMap);
      setMembership(membershipRecord);
      try {
        await ensurePlatformConfig();
      } catch (error) {
        console.warn("Unable to preload platform config", error);
      }
      return;
    }

    const creator = await loadPlatformCreator(nextUser.uid);
    const creatorActive = String(creator?.status || "").toLowerCase() === "active";
    const departmentId = activeDepartmentId || DEFAULT_DEPARTMENT_ID;

    setIsCreator(creatorActive);
    if (creatorActive) {
      const [nextMembership, nextRoles] = await Promise.all([
        ensureCreatorDepartmentAccess(nextUser, departmentId),
        loadRolesMap(departmentId),
        ensurePlatformConfig()
      ]);
      await applyMembership(nextUser, departmentId, nextMembership, nextRoles, creatorActive);
      return;
    }

    const [nextMembership, nextRoles] = await Promise.all([
      ensureMembershipForUser(nextUser, departmentId),
      loadRolesMap(departmentId)
    ]);
    await applyMembership(nextUser, departmentId, nextMembership, nextRoles, creatorActive);
  }

  const recoverAccess = useCallback(async () => {
    if (!user?.uid) return false;
    setRecoveryLoading(true);
    try {
      const departmentId = getActiveDepartmentId();
      const membershipDepartmentId = resolveMembershipDepartmentId(departmentId);
      let recovered = null;
      try {
        recovered = await recoverMembershipAccess(user, departmentId);
      } catch (error) {
        console.warn("Membership recovery failed", error);
      }

      if (recovered?.status !== "active" && isPlatformBootstrapEmail(user.email)) {
        recovered = buildBootstrapMembership(user, membershipDepartmentId);
      }
      if (recovered?.status !== "active") return false;

      let nextRoles = buildBootstrapRolesMap();
      try {
        const remoteRoles = await loadRolesMap(membershipDepartmentId);
        if (Object.keys(remoteRoles).length) nextRoles = remoteRoles;
      } catch (error) {
        console.warn("Using local creator role map after recovery", error);
      }

      const creator = await loadPlatformCreator(user.uid);
      const creatorActive = String(creator?.status || "").toLowerCase() === "active"
        || Boolean(recovered?.isPlatformCreator)
        || isPlatformBootstrapEmail(user.email);
      setIsCreator(creatorActive);
      setRolesById(nextRoles);
      setMembership(recovered);
      try {
        window.sessionStorage.setItem("rms-app-view-pref", "admin");
        window.localStorage.removeItem("rms-app-view");
      } catch {
        // ignore
      }
      return true;
    } catch (error) {
      console.error("Failed to recover admin access", error);
      return false;
    } finally {
      setRecoveryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!firebaseEnabled || !auth) {
      setAuthLoading(false);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);

      if (!nextUser) {
        setMembership(null);
        setRolesById({});
        setIsCreator(false);
        setMembershipLoading(false);
        return;
      }

      setMembershipLoading(true);
      try {
        await hydrateAccess(nextUser);
      } catch (error) {
        console.error("Failed to load department membership", error);
        if (isDemoModeActive()) {
          try {
            const [nextMembership, nextRoles] = await Promise.all([
              ensureDemoAccess(nextUser),
              loadRolesMap(DEMO_DEPARTMENT_ID)
            ]);
            setIsCreator(false);
            setMembership(nextMembership);
            setRolesById(nextRoles);
            return;
          } catch (demoError) {
            console.error("Demo access recovery failed", demoError);
          }
        }
        if (isPlatformBootstrapEmail(nextUser.email)) {
          const membershipDepartmentId = resolveMembershipDepartmentId(getActiveDepartmentId());
          setIsCreator(true);
          setMembership(buildBootstrapMembership(nextUser, membershipDepartmentId));
          setRolesById(buildBootstrapRolesMap());
          return;
        }
        try {
          const creator = await loadPlatformCreator(nextUser.uid);
          if (String(creator?.status || "").toLowerCase() === "active") {
            setIsCreator(true);
            const recovered = await ensureCreatorDepartmentAccess(nextUser, getActiveDepartmentId());
            const recoveredRoles = await loadRolesMap(getActiveDepartmentId());
            setMembership(recovered);
            setRolesById(recoveredRoles);
            return;
          }
        } catch (recoveryError) {
          console.error("Creator access recovery failed", recoveryError);
        }
        setMembership(null);
        setRolesById({});
        setIsCreator(false);
      } finally {
        setMembershipLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.uid || !isCreator || membership?.status === "active") return undefined;

    let cancelled = false;
    (async () => {
      try {
        const recovered = await ensureCreatorDepartmentAccess(user, getActiveDepartmentId());
        if (!cancelled) setMembership(recovered);
      } catch (error) {
        console.error("Failed to recover creator membership", error);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid, isCreator, membership?.status]);

  async function signIn(email, password) {
    const auth = getFirebaseAuth();
    setAuthError("");
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signUp(email, password, displayName = "") {
    const auth = getFirebaseAuth();
    setAuthError("");
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName.trim()) {
      const { updateProfile } = await import("firebase/auth");
      await updateProfile(credential.user, { displayName: displayName.trim() });
    }
  }

  async function signOut() {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    setMembership(null);
  }

  const permissions = useMemo(() => {
    if (isPlatformCreatorUser(membership, { isPlatformCreator: isCreator })) {
      return { ...CREATOR_PERMISSIONS };
    }
    const merged = mergeMembershipPermissions(membership || {}, rolesById);
    if (user?.uid && !canAccessAdminRms(merged, isCreator) && canSelfRestoreMembership(user, membership)) {
      const roleIds = normalizeRoleIds(membership || {});
      const fallbackRoleId = roleIds.includes("creator") ? "creator" : "fireChief";
      return fallbackRoleId === "creator"
        ? { ...CREATOR_PERMISSIONS }
        : getDefaultRolePermissions("fireChief");
    }
    return merged;
  }, [membership, rolesById, isCreator, user]);

  async function switchCreatorDepartment(departmentId) {
    if (!user || !isCreator || !departmentId || departmentId === PLATFORM_SCOPE_ID) return;
    if (membership?.departmentId === departmentId && membership?.status === "active") return;
    try {
      const [nextMembership, nextRoles] = await Promise.all([
        ensureCreatorDepartmentAccess(user, departmentId),
        loadRolesMap(departmentId)
      ]);
      setRolesById(nextRoles);
      setMembership(nextMembership);
    } catch (error) {
      console.error("Failed to switch creator department", error);
    }
  }

  const patchMembership = useCallback((patch = {}) => {
    setMembership((current) => {
      if (!current) return current;
      const nextPreferences = patch.preferences
        ? { ...(current.preferences || {}), ...patch.preferences }
        : current.preferences;
      return {
        ...current,
        ...patch,
        preferences: nextPreferences,
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      membership,
      permissions,
      rolesById,
      isCreator,
      authLoading,
      membershipLoading,
      authError,
      setAuthError,
      signIn,
      signUp,
      signOut,
      switchCreatorDepartment,
      recoverAccess,
      recoveryLoading,
      patchMembership,
      authRequired: firebaseEnabled
    }),
    [user, membership, permissions, rolesById, isCreator, authLoading, membershipLoading, authError, recoveryLoading, patchMembership]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
