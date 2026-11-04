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
import { DEMO_PERSONAS, getDemoPersona, setDemoPersona } from "../lib/demoPersona.js";

export default function DemoEntryPage() {
  const { signIn, signOut, user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { email, password } = getDemoCredentials();
  const [personaId, setPersonaId] = useState(() => getDemoPersona().id);

  async function launchDemo() {
    setSubmitting(true);
    setError("");
    activateDemoMode();
    setDemoPersona(personaId);

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
        setError("The demo isn't available right now. Please try again shortly or contact FORGE Public Safety.");
      } else if (code === "permission-denied") {
        setError("The demo is getting ready. Wait a minute, then refresh the page and try again.");
      } else {
        setError("We couldn't open the demo. Please try again.");
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

        <fieldset className="demo-persona-picker">
          <legend>View the demo as</legend>
          <div className="demo-persona-options">
            {DEMO_PERSONAS.map((persona) => (
              <label key={persona.id} className={`demo-persona-option${personaId === persona.id ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="demo-persona"
                  value={persona.id}
                  checked={personaId === persona.id}
                  onChange={() => setPersonaId(persona.id)}
                />
                <strong>{persona.label}</strong>
                <span>{persona.name}</span>
                <small>{persona.description}</small>
              </label>
            ))}
          </div>
        </fieldset>

        {error && <div className="auth-error">{error}</div>}

        <button className="primary-button demo-entry-launch" type="button" onClick={launchDemo} disabled={submitting}>
          <PlayCircle size={16} /> {submitting ? "Launching…" : "Launch Demo RMS"}
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
