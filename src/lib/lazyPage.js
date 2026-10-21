import { lazy } from "react";

const RELOAD_KEY = "forge-chunk-reload-at";

/**
 * React.lazy for page modules, resilient to deploys: if a page's code file is
 * gone (the user's tab is running an older build), reload once to pick up the
 * new build instead of showing a broken page. A second failure within a minute
 * is thrown so an error boundary can show it, avoiding reload loops.
 */
export function lazyPage(factory) {
  return lazy(async () => {
    try {
      const module = await factory();
      try {
        window.sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        // ignore
      }
      return module;
    } catch (error) {
      let last = 0;
      try {
        last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
      } catch {
        // ignore
      }
      if (Date.now() - last > 60_000) {
        try {
          window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        } catch {
          // ignore
        }
        window.location.reload();
        return new Promise(() => {}); // never resolves; the page is reloading
      }
      throw error;
    }
  });
}
