import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

function getCallableFunctions() {
  return getFirebaseFunctions();
}

async function callGoogleApis(name, payload = {}) {
  const functions = getCallableFunctions();
  if (!functions) {
    throw new Error("Firebase Functions are not configured.");
  }
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data || {};
}

export function getGoogleApisStatus(departmentId = "") {
  return callGoogleApis("googleApisGetStatus", { departmentId });
}

export function getGoogleApisClientConfig(departmentId = "") {
  return callGoogleApis("googleApisGetClientConfig", { departmentId });
}

export function saveGoogleApisConfig({
  departmentId = "",
  mapsJsApiKey,
  geocodingApiKey,
  placesApiKey,
  youtubeDataApiKey,
  defaultMapCenter = "",
  defaultMapZoom,
  removeKeys = [],
} = {}) {
  return callGoogleApis("googleApisSave", {
    departmentId,
    mapsJsApiKey,
    geocodingApiKey,
    placesApiKey,
    youtubeDataApiKey,
    defaultMapCenter,
    defaultMapZoom,
    removeKeys,
  });
}

export function clearGoogleApisConfig(departmentId = "") {
  return callGoogleApis("googleApisClear", { departmentId });
}

let mapsLoaderPromise = null;

export function loadGoogleMapsScript(apiKey = "") {
  const key = String(apiKey || "").trim();
  if (!key) {
    return Promise.reject(new Error("Google Maps JavaScript API key is not configured."));
  }
  if (typeof window !== "undefined" && window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (mapsLoaderPromise) return mapsLoaderPromise;

  mapsLoaderPromise = new Promise((resolve, reject) => {
    const scriptId = "forge-google-maps-js";
    const existing = document.getElementById(scriptId);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google?.maps));
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps.")));
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    script.onload = () => resolve(window.google?.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(script);
  });

  return mapsLoaderPromise;
}

export async function ensureDepartmentGoogleMaps(departmentId = "") {
  const config = await getGoogleApisClientConfig(departmentId);
  if (!config.mapsJsApiKey) {
    throw new Error("Add a Maps JavaScript API key under Digital Dashboard → Integrations.");
  }
  await loadGoogleMapsScript(config.mapsJsApiKey);
  return config;
}
