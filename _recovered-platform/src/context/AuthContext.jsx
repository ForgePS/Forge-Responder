import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from "firebase/auth";
import { firebaseEnabled, getFirebaseAuth } from "../lib/firebaseClient.js";
import { DEFAULT_DEPARTMENT_ID } from "../lib/tenantPaths.js";
import { ensureMembershipForUser } from "../lib/departmentMembership.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [membership, setMembership] = useState(null);
  const [authLoading, setAuthLoading] = useState(firebaseEnabled);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [authError, setAuthError] = useState("");

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
        setMembershipLoading(false);
        return;
      }

      setMembershipLoading(true);
      try {
        const nextMembership = await ensureMembershipForUser(nextUser, DEFAULT_DEPARTMENT_ID);
        setMembership(nextMembership?.status === "active" ? nextMembership : null);
      } catch (error) {
        console.error("Failed to load department membership", error);
        setMembership(null);
      } finally {
        setMembershipLoading(false);
      }
    });

    return unsubscribe;
  }, []);

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

  const value = useMemo(
    () => ({
      user,
      membership,
      authLoading,
      membershipLoading,
      authError,
      setAuthError,
      signIn,
      signUp,
      signOut,
      authRequired: firebaseEnabled
    }),
    [user, membership, authLoading, membershipLoading, authError]
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
