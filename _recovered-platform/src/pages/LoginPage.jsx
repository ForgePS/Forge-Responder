import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { platformBrand } from "../data/platformBrand.js";
import { defaultDepartmentProfile } from "../data/defaultDepartment.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";

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
  const { profile } = useTenant();
  const { signIn, signUp, setAuthError } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const departmentLogoUrl = profile.logoUrl || defaultDepartmentProfile.logoUrl;

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
      <section className="auth-card auth-card-login">
        <div className="auth-forge-logo">
          <img src={platformBrand.logoUrl} alt={platformBrand.name} />
        </div>

        <div className="auth-department">
          <img src={departmentLogoUrl} alt={profile.name} />
          <div>
            <strong>{profile.name}</strong>
            <span>Department sign-in</span>
          </div>
        </div>

        <div className="auth-heading">
          <ShieldCheck size={22} />
          <div>
            <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
            <p>Access your department branch on the {platformBrand.name} platform.</p>
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
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@hornlake.org" required />
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
      </section>
    </div>
  );
}
