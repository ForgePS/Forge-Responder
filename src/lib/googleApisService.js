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

export function saveGoogleApisConfig({ departmentId = "", removeKeys = [], ...fields } = {}) {
  const payload = { departmentId, removeKeys };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) payload[key] = value;
  }
  return callGoogleApis("googleApisSave", payload);
}

export function clearGoogleApisConfig(departmentId = "") {
  return callGoogleApis("googleApisClear", { departmentId });
}

let mapsLoaderPromise = null;

export function loadGoogleMapsScript(apiKey = "", libraries = "places,geometry") {
  const key = String(apiKey || "").trim();
  if (!key) {
    return Promise.reject(new Error("Google Maps JavaScript API key is not configured."));
  }
  if (typeof window !== "undefined" && window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  const libKey = String(libraries || "places,geometry");
  if (mapsLoaderPromise && mapsLoaderPromise.__libKey === libKey) {
    return mapsLoaderPromise;
  }

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=${encodeURIComponent(libKey)}`;
    script.onload = () => resolve(window.google?.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(script);
  });
  mapsLoaderPromise.__libKey = libKey;

  return mapsLoaderPromise;
}

export async function ensureDepartmentGoogleMaps(departmentId = "") {
  const config = await getGoogleApisClientConfig(departmentId);
  if (!config.mapsJsApiKey) {
    throw new Error("Add a Maps JavaScript API key under System Admin → Integrations & API Keys.");
  }
  await loadGoogleMapsScript(config.mapsJsApiKey, "places,geometry");
  return config;
}
