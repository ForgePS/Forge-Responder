import { useEffect, useState } from "react";
import { INACTIVE_DEPARTMENT_TEXT, useDepartmentStatus } from "../hooks/useDepartmentStatus.js";
import { ShieldAlert } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { resolveDepartmentLogoUrl } from "../lib/brandAssets.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import {
  buildDepartmentGatewayUrl,
  clearLoginTenantId,
  isCreatorConsolePath,
  persistGatewayContext,
} from "../lib/gatewayRouting.js";
import { isBrandedHydrantHost } from "../lib/hydrantAppRouting.js";
import { canSelfRestoreMembership } from "../lib/membershipRecovery.js";
import { loadPlatformCreator } from "../lib/platformService.js";
import { isPlatformScope } from "../lib/tenantPaths.js";
import { FORGE_CREATOR_CONSOLE_URL } from "../lib/platformUrls.js";
import { parseTenantSubdomain, platformOrigin } from "../lib/tenantDomains.js";

export default function AccessDeniedPage({ userId = "" }) {
  const { profile, departmentId, gatewayDepartmentId, setDepartmentId } = useTenant();
  const { user, membership, signOut, recoverAccess, recoveryLoading, inviteError } = useAuth();
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [platformCreatorRecoverable, setPlatformCreatorRecoverable] = useState(false);
  const [changingTenant, setChangingTenant] = useState(false);
  const authUid = userId || user?.uid || "";
  const creatorConsoleEntry = isCreatorConsolePath();
  const brandedHostLocked = isBrandedHydrantHost();
  const canChangeTenant = !creatorConsoleEntry && !brandedHostLocked;
  const portalDepartmentId = gatewayDepartmentId || (isPlatformScope(departmentId) ? null : departmentId);
  const canRecover = canSelfRestoreMembership(user || {}) || platformCreatorRecoverable;
  // A suspended or archived department refuses everyone, so say that rather than "not assigned".
  const departmentStatus = useDepartmentStatus(portalDepartmentId || membership?.departmentId || "");
  const inactive = !creatorConsoleEntry && INACTIVE_DEPARTMENT_TEXT[departmentStatus.reason];
  const departmentLabel = departmentStatus.name || profile.shortName || profile.name;

  useEffect(() => {
    let cancelled = false;
    async function checkPlatformCreator() {
      if (!user?.uid || canSelfRestoreMembership(user)) return;
      try {
        const creator = await loadPlatformCreator(user.uid);
        if (!cancelled && String(creator?.status || "").toLowerCase() === "active") {
          setPlatformCreatorRecoverable(true);
        }
      } catch {
        // Ignore lookup failures; Change tenant / Sign out remain available.
      }
    }
    checkPlatformCreator();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleRecoverAccess() {
    setRecoveryMessage("");
    const restored = await recoverAccess();
    if (restored) {
      setRecoveryMessage("Admin access restored. Loading your workspace...");
      return;
    }
    setRecoveryMessage("Could not restore access automatically. Use Change tenant, or contact your platform owner.");
  }

  async function handleChangeTenant() {
    if (!canChangeTenant || changingTenant) return;
    setChangingTenant(true);
    setRecoveryMessage("");
    clearLoginTenantId();
    persistGatewayContext("", "");
    setDepartmentId("");
    if (window.location.pathname.replace(/\/$/, "") !== "") {
      window.history.replaceState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    try {
      await signOut();
    } finally {
      setChangingTenant(false);
    }
    // On a department subdomain, pick another department on the platform host.
    if (parseTenantSubdomain()) window.location.assign(platformOrigin());
  }

  return (
    <div className="auth-screen">
      <div className="auth-theme-toggle-wrap">
        <ThemeToggle />
      </div>
      <section className="auth-card">
        <div className="auth-brand">
          <img src={resolveDepartmentLogoUrl(profile.logoUrl)} alt={profile.name} />
          <div>
            <strong>{profile.productTitle}</strong>
            <span>{profile.shortName || profile.name}</span>
          </div>
        </div>

        <div className="auth-heading">
          <ShieldAlert size={22} />
          <div>
            <h1>{inactive ? inactive.title : creatorConsoleEntry ? "Creator access not provisioned" : "Access not assigned"}</h1>
            {inactive ? (
              <p><strong>{departmentLabel}</strong> {inactive.body}</p>
            ) : (
              <p>
                Signed in as <strong>{user?.email}</strong>, but this account does not have access to{" "}
                <strong>{creatorConsoleEntry ? "FORGE Creator Console" : departmentLabel}</strong> yet.
              </p>
            )}
          </div>
        </div>

        {inviteError && <div className="auth-error" role="alert">{inviteError}</div>}

        <p className="auth-help">
          {inactive
            ? "If you think this is a mistake, ask your department administrator to contact FORGE Public Safety."
            : creatorConsoleEntry
            ? "Click Restore admin access below, or add your Account ID to platformCreators in Firebase Console."
            : canChangeTenant
              ? "If you selected the wrong tenant, use Change tenant below. Otherwise ask your department administrator to send you an invite link."
              : "Ask your department administrator to send you an invite link, then open it and sign in again."}
        </p>
        {creatorConsoleEntry && (
          <p className="auth-help auth-help-muted">
            Creator Console: <code>{FORGE_CREATOR_CONSOLE_URL}</code>
          </p>
        )}
        {portalDepartmentId && (
          <p className="auth-help auth-help-muted">
            Department portal: <code>{buildDepartmentGatewayUrl(portalDepartmentId)}</code>
          </p>
        )}
        {authUid && (
          <p className="auth-help auth-help-muted">
            Account ID: <code>{authUid}</code>
          </p>
        )}

        {canRecover && (
          <button
            className="primary-button auth-submit"
            type="button"
            onClick={handleRecoverAccess}
            disabled={recoveryLoading || changingTenant}
          >
            {recoveryLoading ? "Restoring access..." : "Restore admin access"}
          </button>
        )}

        {canChangeTenant && (
          <button
            className={`${canRecover ? "secondary-button" : "primary-button"} auth-submit`}
            type="button"
            onClick={handleChangeTenant}
            disabled={changingTenant || recoveryLoading}
          >
            {changingTenant ? "Switching tenant..." : "Change tenant"}
          </button>
        )}

        {recoveryMessage && <p className="auth-help">{recoveryMessage}</p>}

        <button
          className="secondary-button auth-submit"
          type="button"
          onClick={signOut}
          disabled={changingTenant}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
