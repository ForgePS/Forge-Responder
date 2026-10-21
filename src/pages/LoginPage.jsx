import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { resolveDepartmentLogoUrl } from "../lib/brandAssets.js";
import { platformBrand } from "../data/platformBrand.js";
import {
  buildDepartmentGatewayUrl,
  clearLoginTenantId,
  hasLockedLoginTenant,
  isCreatorConsolePath,
  isInvalidGatewaySlug,
  normalizeGatewayDepartmentId,
  persistGatewayContext,
  readLoginTenantId,
  RESERVED_GATEWAY_PATHS,
  syncGatewayUrl,
  writeLoginTenantId
} from "../lib/gatewayRouting.js";
import {
  FORGE_PUBLIC_WEBSITE_HOST,
  FORGE_PUBLIC_WEBSITE_URL,
  FORGE_RMS_APP_HOST
} from "../lib/platformUrls.js";
import { defaultDepartmentProfile } from "../data/defaultDepartment.js";
import { isBrandedHydrantHost } from "../lib/hydrantAppRouting.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { clearPendingInviteToken, inviteErrorMessage, previewInvite, readPendingInviteToken } from "../lib/inviteService.js";
import { parseTenantSubdomain, platformOrigin, tenantOrigin, useTenantSubdomains } from "../lib/tenantDomains.js";

const INVITE_REASON_TEXT = {
  not_found: "This invite link is not valid.",
  expired: "This invite has expired. Ask your administrator for a new one.",
  accepted: "This invite has already been used. Sign in to continue.",
  revoked: "This invite was cancelled. Ask your administrator for a new one.",
};

/** Shows who the invite link is for, and nudges new users to create an account. */
function useInvitePreview(setMode) {
  const [invite, setInvite] = useState(null);
  useEffect(() => {
    const token = readPendingInviteToken();
    if (!token) return undefined;
    let cancelled = false;
    previewInvite(token)
      .then((result) => {
        if (cancelled) return;
        setInvite(result);
        if (result?.valid) setMode("signup");
        // A dead link (not found / expired / used / cancelled) is shown once, then forgotten.
        else clearPendingInviteToken();
      })
      .catch((error) => !cancelled && setInvite({ valid: false, error: inviteErrorMessage(error) }));
    return () => { cancelled = true; };
  }, [setMode]);
  return invite;
}

function authErrorMessage(error) {
  const code = error?.code || "";
  if (code === "auth/configuration-not-found") {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "rms-dashboard-7562e";
    return `Email/Password sign-in is not enabled yet. Open Firebase Console → ${projectId} → Authentication → Sign-in method → enable Email/Password → Save, then try again.`;
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Invalid email or password.";
  }
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/weak-password") return "Password must be at least 6 characters.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  return error?.message || "Authentication failed.";
}

function validateTenantId(value) {
  const tenantId = normalizeGatewayDepartmentId(value);
  if (!tenantId) return { ok: false, message: "Enter your tenant ID." };
  if (isInvalidGatewaySlug(tenantId) || RESERVED_GATEWAY_PATHS.has(tenantId)) {
    return { ok: false, message: "Enter a valid tenant ID." };
  }
  return { ok: true, tenantId };
}

export default function LoginPage() {
  const { profile, gatewayDepartmentId, gatewayRecord, departmentId, setDepartmentId } = useTenant();
  const { signIn, signUp, setAuthError, inviteError } = useAuth();
  const [mode, setMode] = useState("signin");
  const invite = useInvitePreview(setMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tenantDraft, setTenantDraft] = useState(() => readLoginTenantId() || "");
  const [tenantLocked, setTenantLocked] = useState(() => hasLockedLoginTenant());

  const creatorConsoleEntry = isCreatorConsolePath();
  const brandedHostLocked = isBrandedHydrantHost();
  const canChangeTenant = !creatorConsoleEntry && !brandedHostLocked;
  const activeTenantId = readLoginTenantId() || gatewayDepartmentId || departmentId;
  const displayNameLabel = gatewayRecord?.departmentShortName
    || gatewayRecord?.departmentName
    || profile.shortName
    || profile.name;
  const displayLogoUrl = resolveDepartmentLogoUrl(
    gatewayRecord?.logoUrl || profile.logoUrl || defaultDepartmentProfile.logoUrl
  );

  useEffect(() => {
    if (creatorConsoleEntry || brandedHostLocked) {
      setTenantLocked(true);
      return;
    }
    if (gatewayDepartmentId) {
      writeLoginTenantId(gatewayDepartmentId);
      setTenantDraft(gatewayDepartmentId);
      setTenantLocked(true);
    }
  }, [creatorConsoleEntry, gatewayDepartmentId, brandedHostLocked]);

  function handleConfirmTenant(event) {
    event.preventDefault();
    setError("");
    const validation = validateTenantId(tenantDraft);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    // On forgeresponder.com each department has its own subdomain: go there.
    if (useTenantSubdomains()) {
      window.location.assign(tenantOrigin(validation.tenantId));
      return;
    }

    writeLoginTenantId(validation.tenantId);
    persistGatewayContext(validation.tenantId, validation.tenantId);
    setDepartmentId(validation.tenantId);
    syncGatewayUrl(validation.tenantId);
    setTenantDraft(validation.tenantId);
    setTenantLocked(true);
  }

  function handleChangeTenant() {
    if (!canChangeTenant) return;
    // On a department subdomain, the tenant picker lives on the platform host.
    if (parseTenantSubdomain()) {
      window.location.assign(platformOrigin());
      return;
    }
    clearLoginTenantId();
    persistGatewayContext("", "");
    setTenantDraft("");
    setTenantLocked(false);
    setError("");
    setAuthError("");
    if (window.location.pathname.replace(/\/$/, "") !== "") {
      window.history.replaceState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setAuthError("");

    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName);
      }
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen auth-screen-login">
      <div className="auth-theme-toggle-wrap">
        <ThemeToggle />
      </div>
      <section className="auth-card auth-card-login">
        <div className="auth-forge-logo">
          <img className="forge-logo-knockout" src={platformBrand.logoUrl} alt={platformBrand.name} />
        </div>

        {!creatorConsoleEntry && tenantLocked && (
          <div className="auth-department">
            <img src={displayLogoUrl} alt={displayNameLabel} />
            <div className="auth-department-copy">
              <strong>{displayNameLabel}</strong>
              <span className="auth-tenant-id">{activeTenantId}</span>
              {canChangeTenant && (
                <button className="text-button auth-change-tenant" type="button" onClick={handleChangeTenant}>
                  Change tenant
                </button>
              )}
            </div>
          </div>
        )}

        <div className="auth-heading">
          <ShieldCheck size={22} />
          <div>
            <h1>
              {creatorConsoleEntry
                ? "Creator Console sign in"
                : !tenantLocked
                  ? "Select your tenant"
                  : (mode === "signin" ? "Sign in" : "Create account")}
            </h1>
            <p className="auth-portal-label">
              {creatorConsoleEntry
                ? "FORGE RMS · Platform creator access required"
                : !tenantLocked
                  ? "Enter your department tenant ID to continue"
                  : `FORGE RMS · ${gatewayDepartmentId ? buildDepartmentGatewayUrl(gatewayDepartmentId).replace(/^https?:\/\//, "") : FORGE_RMS_APP_HOST}`}
            </p>
          </div>
        </div>

        {invite?.valid && (
          <div className="auth-help auth-invite-banner" role="status">
            You've been invited to <strong>{invite.departmentName}</strong>. Create an account
            (or sign in) with <strong>{invite.emailHint}</strong> to accept.
          </div>
        )}
        {invite && !invite.valid && (
          <div className="auth-error" role="alert">
            {invite.error || INVITE_REASON_TEXT[invite.reason] || INVITE_REASON_TEXT.not_found}
          </div>
        )}
        {inviteError && <div className="auth-error" role="alert">{inviteError}</div>}

        {!creatorConsoleEntry && !tenantLocked ? (
          <form className="auth-form" onSubmit={handleConfirmTenant}>
            <label>
              <span>Tenant ID</span>
              <input
                value={tenantDraft}
                onChange={(event) => setTenantDraft(event.target.value)}
                placeholder="your-department-id"
                autoComplete="organization"
                autoFocus
                required
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="primary-button auth-submit" type="submit">
              Continue
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label>
                <span>Display name</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Jeremy Powell" />
              </label>
            )}
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={creatorConsoleEntry ? "admin@forgepublicsafety.com" : "you@department.org"}
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 6 characters" required />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="primary-button auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>
        )}

        {!creatorConsoleEntry && tenantLocked && (
          <button
            className="text-button auth-toggle"
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
            }}
          >
            {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        )}

        <p className="auth-help auth-website-link">
          Company website:{" "}
          <a href={FORGE_PUBLIC_WEBSITE_URL} target="_blank" rel="noreferrer">
            {FORGE_PUBLIC_WEBSITE_HOST}
          </a>
          {tenantLocked && gatewayDepartmentId && (
            <>
              {" · "}
              Department portal: <code>{buildDepartmentGatewayUrl(gatewayDepartmentId)}</code>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
