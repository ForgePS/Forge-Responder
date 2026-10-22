import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { isDemoModeActive } from "../lib/demoMode.js";
import { hasAuthenticatorApp, sessionHasSecondFactor, twoFactorRequirement } from "../lib/twoFactor.js";

/**
 * Two-factor status for the signed-in person:
 * { level: "required" | "grace" | "none", daysLeft?, deadline?,
 *   sessionOk: true/false (null while checking), enrolled, refresh }
 */
export function useTwoFactorStatus() {
  const { user, isCreator, membership } = useAuth();
  const { platformConfig, departmentId } = useTenant();
  const [sessionOk, setSessionOk] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setSessionOk(false);
      return undefined;
    }
    setSessionOk(null);
    sessionHasSecondFactor(user)
      .then((ok) => { if (!cancelled) setSessionOk(ok); })
      .catch(() => { if (!cancelled) setSessionOk(false); });
    return () => { cancelled = true; };
  }, [user?.uid, version]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const requirement = twoFactorRequirement({
    isCreator,
    membership,
    departmentId,
    demo: isDemoModeActive(),
    deadline: platformConfig?.mfaAdminDeadline,
  });

  return { ...requirement, sessionOk, enrolled: hasAuthenticatorApp(user), refresh };
}
