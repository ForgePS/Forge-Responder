/**
 * Install the service worker that keeps the field app working offline.
 * A new version installs in the background and waits; the crew taps
 * "Update" when ready (records are on the device, so nothing is lost).
 */

let waitingWorker = null;
let registering = null;
const updateListeners = new Set();

/** Called when a new version is installed and waiting (also right away if one already is). */
export function subscribeUpdateReady(listener) {
  updateListeners.add(listener);
  if (waitingWorker) listener();
  return () => updateListeners.delete(listener);
}

export function registerFieldServiceWorker() {
  if (!registering) registering = register();
  return registering;
}

async function register() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return null;
  const onUpdateReady = () => updateListeners.forEach((listener) => listener());
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const notify = (worker) => {
      waitingWorker = worker;
      onUpdateReady();
    };
    if (registration.waiting && navigator.serviceWorker.controller) notify(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // Only an update if a previous version is already in control.
        if (installing.state === "installed" && navigator.serviceWorker.controller) notify(installing);
      });
    });
    // Look for a new version whenever the app comes back to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) registration.update().catch(() => null);
    });
    return registration;
  } catch (error) {
    console.warn("Offline support could not be installed", error);
    return null;
  }
}

export function activateUpdate() {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

/** True once the app files are stored for offline use. */
export async function isOfflineReady() {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return Boolean(registration?.active);
}
