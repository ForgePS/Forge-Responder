import { useEffect, useState } from "react";
import { isForgeLogoUrl } from "../lib/brandAssets.js";
import forgeResponderLogo from "../assets/forge-responder-logo.png";
import { loadPublicPlatformBranding } from "../lib/platformService.js";

const CACHE_KEY = "forge-platform-brand";

function readCached() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Sign-in pages show the FORGE Responder logo (transparent) unless the platform
// settings name a different one.
function toBrand(data = {}) {
  const url = data?.logoUrl || "";
  const custom = url && !isForgeLogoUrl(url);
  return {
    logoUrl: custom ? url : forgeResponderLogo,
    name: data?.name || "FORGE Responder",
  };
}

/**
 * The platform logo and name for signed-out pages, as set in Creator Console →
 * Platform settings. Remembers the last one shown so the page doesn't flash the
 * built-in logo first; falls back to the built-in logo until one is saved.
 */
export function usePublicPlatformBrand() {
  const [brand, setBrand] = useState(() => toBrand(typeof window === "undefined" ? null : readCached()));

  useEffect(() => {
    let active = true;
    loadPublicPlatformBranding()
      .then((data) => {
        if (!active || !data) return;
        setBrand(toBrand(data));
        try {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify({ logoUrl: data.logoUrl || "", name: data.name || "" }));
        } catch {
          // Private mode or full storage: the logo still shows, just not remembered.
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return brand;
}
