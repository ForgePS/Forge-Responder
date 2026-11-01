import { HardHat } from "lucide-react";

/** Fallback for a menu item with no page of its own. */
export function ModulePage({ name }) {
  return <PlaceholderPage name={name} />;
}

export function PlaceholderPage({ name }) {
  return <div className="module-page"><section className="placeholder-page"><span><HardHat size={30} /></span><h1>{name}</h1><p>This page isn't available yet. Contact FORGE Public Safety if you need it.</p></section></div>;
}

export function ModuleNotIncluded({ name }) {
  return <div className="module-page"><section className="placeholder-page"><h1>{name}</h1><p>This module isn't included in your department's FORGE Responder plan. Contact FORGE Public Safety to add it.</p></section></div>;
}

export function AccessDeniedModule({ name }) {
  return <div className="module-page"><section className="placeholder-page"><h1>{name}</h1><p>Your role does not include permission to access this module.</p></section></div>;
}
