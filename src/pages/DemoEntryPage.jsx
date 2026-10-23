import { useState } from "react";
import { PlayCircle, ShieldCheck } from "lucide-react";
import { resolvePlatformLogoUrl } from "../lib/brandAssets.js";
import { activateDemoMode, getDemoCredentials, getDemoGatewayPath } from "../lib/demoMode.js";
import {
  FORGE_PUBLIC_WEBSITE_HOST,
  FORGE_PUBLIC_WEBSITE_URL,
  FORGE_RMS_APP_HOST,
  resolvePublicDemoUrl
} from "../lib/platformUrls.js";
import { defaultPlatformConfig } from "../data/platformBrand.js";
import { demoDepartmentProfile } from "../data/demoDepartment.js";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function DemoEntryPage() {
  const { signIn, signOut, user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { email, password } = getDemoCredentials();

  async function launchDemo() {
    setSubmitting(true);
    setError("");
    activateDemoMode();

    try {
      const usingDemoAccount = user?.email?.toLowerCase() === email.toLowerCase();
      if (user && !usingDemoAccount) {
        await signOut();
      }
      if (!usingDemoAccount) {
        await signIn(email, password);
      }
      window.location.replace(getDemoGatewayPath());
    } catch (launchError) {
      const code = launchError?.code || "";
      if (code === "auth/invalid-credential" || code === "auth/user-not-found") {
        setError("Demo account is not set up yet. Create Firebase Auth user demo@forge.demo (password ForgeDemo2026!) then run npm run seed:demo.");
      } else if (code === "permission-denied") {
        setError("Demo sandbox permissions are updating. Wait one minute, hard refresh, and try Launch Demo RMS again.");
      } else {
        setError(launchError?.message || "Unable to launch demo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen demo-entry-screen">
      <div className="auth-theme-toggle-wrap">
        <ThemeToggle />
      </div>
      <section className="demo-entry-card">
        <div className="demo-entry-brand">
          <img src={resolvePlatformLogoUrl(defaultPlatformConfig.logoUrl)} alt={defaultPlatformConfig.name} />
          <div>
            <p className="demo-entry-eyebrow">FORGE RMS Training · {FORGE_RMS_APP_HOST}</p>
            <h1>Live Demo Model</h1>
            <p className="demo-entry-tagline">{defaultPlatformConfig.tagline}</p>
          </div>
        </div>

        <div className="demo-entry-department">
          <ShieldCheck size={18} />
          <div>
            <strong>{demoDepartmentProfile.name}</strong>
            <span>Sample department with personnel, fleet, certifications, scheduling, prevention, and admin data.</span>
          </div>
        </div>

        <ul className="demo-entry-list">
          <li>Safe sandbox — separate from real department data</li>
          <li>Full RMS modules enabled for walkthroughs and classes</li>
          <li>Share this link: <code>{resolvePublicDemoUrl()}</code></li>
        </ul>

        {error && <div className="auth-error">{error}</div>}

        <button className="primary-button demo-entry-launch" type="button" onClick={launchDemo} disabled={submitting}>
          <PlayCircle size={16} /> {submitting ? "Launching..." : "Launch Demo RMS"}
        </button>

        <p className="auth-help demo-entry-credentials">
          Demo sign-in: <strong>{email}</strong> / <strong>{password}</strong>
        </p>

        <p className="auth-help auth-website-link">
          Company website:{" "}
          <a href={FORGE_PUBLIC_WEBSITE_URL} target="_blank" rel="noreferrer">
            {FORGE_PUBLIC_WEBSITE_HOST}
          </a>
        </p>
      </section>
    </div>
  );
}
