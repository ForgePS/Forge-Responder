import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { resolveDepartmentLogoUrl } from "../lib/brandAssets.js";
import { platformBrand } from "../data/platformBrand.js";
import { buildDepartmentGatewayUrl } from "../lib/gatewayRouting.js";
import { isCreatorConsolePath } from "../lib/gatewayRouting.js";
import {
  FORGE_PUBLIC_WEBSITE_HOST,
  FORGE_PUBLIC_WEBSITE_URL,
  FORGE_RMS_APP_HOST
} from "../lib/platformUrls.js";
import { defaultDepartmentProfile } from "../data/defaultDepartment.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";

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

export default function LoginPage() {
  const { profile, gatewayDepartmentId } = useTenant();
  const { signIn, signUp, setAuthError } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const creatorConsoleEntry = isCreatorConsolePath();
  const departmentLogoUrl = resolveDepartmentLogoUrl(profile.logoUrl || defaultDepartmentProfile.logoUrl);

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

        {!creatorConsoleEntry && (
          <div className="auth-department">
            <img src={departmentLogoUrl} alt={profile.name} />
            <div>
              <strong>{profile.shortName || profile.name}</strong>
            </div>
          </div>
        )}

        <div className="auth-heading">
          <ShieldCheck size={22} />
          <div>
            <h1>
              {creatorConsoleEntry
                ? "Creator Console sign in"
                : (mode === "signin" ? "Sign in" : "Create account")}
            </h1>
            <p className="auth-portal-label">
              {creatorConsoleEntry
                ? "FORGE RMS · Platform creator access required"
                : `FORGE RMS · ${gatewayDepartmentId ? buildDepartmentGatewayUrl(gatewayDepartmentId).replace(/^https?:\/\//, "") : FORGE_RMS_APP_HOST}`}
            </p>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              <span>Display name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Jeremy Powell" />
            </label>
          )}
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={creatorConsoleEntry ? "admin@forgepublicsafety.com" : "you@hornlake.org"} required />
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

        {!creatorConsoleEntry && (
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
          {gatewayDepartmentId && (
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
