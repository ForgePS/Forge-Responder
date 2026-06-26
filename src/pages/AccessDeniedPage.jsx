import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { resolveDepartmentLogoUrl } from "../lib/brandAssets.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { isCreatorConsolePath } from "../lib/gatewayRouting.js";
import { buildDepartmentGatewayUrl } from "../lib/gatewayRouting.js";
import { canSelfRestoreMembership } from "../lib/membershipRecovery.js";
import { isPlatformScope } from "../lib/tenantPaths.js";
import { FORGE_CREATOR_CONSOLE_URL } from "../lib/platformUrls.js";

export default function AccessDeniedPage({ userId = "" }) {
  const { profile, departmentId, gatewayDepartmentId } = useTenant();
  const { user, signOut, recoverAccess, recoveryLoading } = useAuth();
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const authUid = userId || user?.uid || "";
  const creatorConsoleEntry = isCreatorConsolePath();
  const portalDepartmentId = gatewayDepartmentId || (isPlatformScope(departmentId) ? null : departmentId);
  const canRecover = canSelfRestoreMembership(user || {});

  async function handleRecoverAccess() {
    setRecoveryMessage("");
    const restored = await recoverAccess();
    if (restored) {
      setRecoveryMessage("Admin access restored. Loading your workspace...");
      return;
    }
    setRecoveryMessage("Could not restore access automatically. Use Firebase Console or contact your platform owner.");
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
            <h1>{creatorConsoleEntry ? "Creator access not provisioned" : "Access not assigned"}</h1>
            <p>
              Signed in as <strong>{user?.email}</strong>, but this account does not have access to{" "}
              <strong>{creatorConsoleEntry ? "FORGE Creator Console" : (profile.shortName || profile.name)}</strong> yet.
            </p>
          </div>
        </div>

        <p className="auth-help">
          {creatorConsoleEntry
            ? "Click Restore admin access below, or add your Account ID to platformCreators in Firebase Console."
            : "Contact your department administrator or platform owner to request access, then sign in again."}
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
            disabled={recoveryLoading}
          >
            {recoveryLoading ? "Restoring access..." : "Restore admin access"}
          </button>
        )}

        {recoveryMessage && <p className="auth-help">{recoveryMessage}</p>}

        <button className="secondary-button auth-submit" type="button" onClick={signOut}>
          Sign out
        </button>
      </section>
    </div>
  );
}
