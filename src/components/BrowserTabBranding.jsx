import { useEffect, useState } from "react";
import { useTenant } from "../context/TenantContext.jsx";
import { defaultPlatformConfig } from "../data/platformBrand.js";
import { loadPublicPlatformBranding } from "../lib/platformService.js";
import {
  TAB_BRANDING_CACHE_KEY,
  applyTabBranding,
  resolveTabBranding,
} from "../lib/browserTabBranding.js";

const LABEL = String(import.meta.env.VITE_ENVIRONMENT_LABEL || "").trim();
const PREFIX = LABEL ? `[${LABEL}] ` : "";

function readCached() {
  try {
    const raw = window.localStorage.getItem(TAB_BRANDING_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the browser tab's title and icon in line with Creator Console ->
 * Platform settings -> Browser tab. Signed out it uses the public branding;
 * signed in, the platform settings (which update right after a creator saves).
 */
export default function BrowserTabBranding() {
  const { platformConfig } = useTenant();
  const [publicBrand, setPublicBrand] = useState(null);

  useEffect(() => {
    let active = true;
    loadPublicPlatformBranding()
      .then((data) => { if (active && data) setPublicBrand(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // The tenant starts with the built-in defaults until the saved settings load.
  const loadedConfig = platformConfig && platformConfig !== defaultPlatformConfig ? platformConfig : null;
  const source = loadedConfig || publicBrand || (typeof window === "undefined" ? null : readCached());
  const { title, faviconUrl } = resolveTabBranding(source || {});

  useEffect(() => {
    if (typeof document === "undefined") return;
    applyTabBranding(document, { title, faviconUrl }, PREFIX);
    if (!source) return;
    try {
      window.localStorage.setItem(TAB_BRANDING_CACHE_KEY, JSON.stringify({ browserTitle: title, faviconUrl }));
    } catch {
      // Private mode or full storage: the tab is still right, just not remembered.
    }
  }, [title, faviconUrl, source]);

  return null;
}
