import { useState } from "react";
import { ExternalLink, RotateCcw } from "lucide-react";
import { leaveDemoToProduction } from "../lib/demoMode.js";
import { demoDepartmentProfile } from "../data/demoDepartment.js";
import { useAuth } from "../context/AuthContext.jsx";
import { resetDemoData } from "../lib/demoService.js";
import { DEMO_PERSONAS, getDemoPersona, setDemoPersona } from "../lib/demoPersona.js";

export default function DemoModeBanner() {
  const { user } = useAuth();
  const [resetting, setResetting] = useState(false);
  const persona = getDemoPersona();

  function switchPersona(id) {
    if (id === persona.id) return;
    setDemoPersona(id);
    // Back to the start so the new role lands on a page it can open.
    window.location.assign(window.location.pathname);
  }

  // Before a meeting: put every sample record back and clear what visitors added.
  async function handleReset() {
    if (resetting || !user) return;
    const ok = window.confirm(
      "Reset the demo to its sample data? Anything added or changed in the demo (reports, requests, checks) will be removed."
    );
    if (!ok) return;
    setResetting(true);
    try {
      await resetDemoData(user);
      window.location.reload();
    } catch (error) {
      console.error("Demo reset failed", error);
      window.alert("The demo couldn't be reset. Check your connection and try again.");
      setResetting(false);
    }
  }

  return (
    <div className="demo-mode-banner">
      <div>
        <strong>Demo / Training Mode</strong>
        <span>{demoDepartmentProfile.name} — sample data only. Changes stay in the demo sandbox.</span>
      </div>
      <div className="demo-mode-banner-actions">
        {user ? (
          <label className="demo-persona-switch">
            <span>Viewing as</span>
            <select value={persona.id} onChange={(event) => switchPersona(event.target.value)}>
              {DEMO_PERSONAS.map((option) => (
                <option key={option.id} value={option.id}>{option.label} · {option.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {user ? (
          <button className="secondary-button" type="button" onClick={handleReset} disabled={resetting}>
            <RotateCcw size={14} /> {resetting ? "Resetting…" : "Reset demo data"}
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={leaveDemoToProduction}>
          <ExternalLink size={14} /> Exit to production
        </button>
      </div>
    </div>
  );
}
