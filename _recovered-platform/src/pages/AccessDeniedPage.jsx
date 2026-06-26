import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { resolveDepartmentLogoUrl } from "../lib/brandAssets.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { canSelfRestoreMembership } from "../lib/membershipRecovery.js";

export default function AccessDeniedPage({ userId = "" }) {
  const { profile } = useTenant();
  const { user, signOut, recoverAccess, recoveryLoading } = useAuth();
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const authUid = userId || user?.uid || "";
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
            <h1>Access not assigned</h1>
            <p>
              Signed in as <strong>{user?.email}</strong>, but this account does not have access to{" "}
              <strong>{profile.shortName || profile.name}</strong> yet.
            </p>
          </div>
        </div>

        <p className="auth-help">
          Contact your department administrator or platform owner to request access, then sign in again.
        </p>
        {authUid && (
          <p className="auth-help auth-help-muted">
            Your account ID: <code>{authUid}</code>
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
