import { useEffect } from "react";

/**
 * Marks non-production builds (VITE_ENVIRONMENT_LABEL, set in .env.staging) on
 * every screen and in the tab title, so staging is never mistaken for the real thing.
 */
const LABEL = String(import.meta.env.VITE_ENVIRONMENT_LABEL || "").trim();

export default function EnvironmentBadge() {
  useEffect(() => {
    if (!LABEL || typeof document === "undefined") return;
    const prefix = `[${LABEL}] `;
    if (!document.title.startsWith(prefix)) document.title = `${prefix}${document.title}`;
  }, []);

  if (!LABEL) return null;
  return (
    <div className="environment-badge" role="note" aria-label={`${LABEL} environment`}>
      {LABEL} · test data only
    </div>
  );
}
