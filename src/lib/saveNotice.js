/**
 * App-wide "your change wasn't saved" notices. Anything that saves in the
 * background calls notifySaveFailed; SaveFailedNotice (App root) shows it.
 */
const EVENT = "rms-save-failed";

function reasonFor(error) {
  const code = String(error?.code || "");
  if (code === "permission-denied" || code.endsWith("/permission-denied")) {
    return "Your department's plan may not include this, a plan limit may have been reached, or your access has changed. Ask your administrator.";
  }
  if (code === "unavailable" || code.endsWith("/unavailable")) {
    return "You appear to be offline. Check your connection and try again.";
  }
  if (code === "not-loaded") return "It was still loading. Wait a moment and make the change again.";
  return "Try again in a moment. If it keeps happening, contact your administrator.";
}

export function notifySaveFailed(what, error) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, {
    detail: { what: what || "your change", reason: reasonFor(error), at: Date.now() },
  }));
}

export function onSaveFailed(handler) {
  const listener = (event) => handler(event.detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
