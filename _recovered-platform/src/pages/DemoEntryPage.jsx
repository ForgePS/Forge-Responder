import { useState } from "react";
import { PlayCircle, ShieldCheck } from "lucide-react";
import { resolvePlatformLogoUrl } from "../lib/brandAssets.js";
import { activateDemoMode, getDemoCredentials } from "../lib/demoMode.js";
import { defaultPlatformConfig } from "../data/platformBrand.js";
import { demoDepartmentProfile } from "../data/demoDepartment.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function DemoEntryPage() {
  const { signIn, user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { email, password } = getDemoCredentials();

  async function launchDemo() {
    setSubmitting(true);
    setError("");
    activateDemoMode();

    try {
      if (!user) {
        await signIn(email, password);
      }
      window.history.replaceState({}, "", "/");
      window.location.reload();
    } catch (launchError) {
      const code = launchError?.code || "";
      if (code === "auth/invalid-credential" || code === "auth/user-not-found") {
        setError("Demo account is not set up yet. Create Firebase Auth user demo@forge.demo (password ForgeDemo2026!) then run npm run seed:demo.");
      } else {
        setError(launchError?.message || "Unable to launch demo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen demo-entry-screen">
      <section className="demo-entry-card">
        <div className="demo-entry-brand">
          <img src={resolvePlatformLogoUrl(defaultPlatformConfig.logoUrl)} alt={defaultPlatformConfig.name} />
          <div>
            <p className="demo-entry-eyebrow">FORGE RMS Training Environment</p>
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
          <li>Safe sandbox — separate from production Horn Lake data</li>
          <li>Full RMS modules enabled for walkthroughs and classes</li>
          <li>Share this link: <code>{window.location.origin}/demo</code></li>
        </ul>

        {error && <div className="auth-error">{error}</div>}

        <button className="primary-button demo-entry-launch" type="button" onClick={launchDemo} disabled={submitting}>
          <PlayCircle size={16} /> {submitting ? "Launching..." : "Launch Demo RMS"}
        </button>

        <p className="auth-help demo-entry-credentials">
          Demo sign-in: <strong>{email}</strong> / <strong>{password}</strong>
        </p>
      </section>
    </div>
  );
}
