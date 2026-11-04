/**
 * Field app theme. It uses the same look as the desktop app (FORGE Responder),
 * including each person's light/dark setting there. "Auto" follows that
 * setting (remembered on the device so it works offline); Light or Dark can be
 * picked on the Device screen instead.
 */

const KEY = "forge-field-theme";
const ACCOUNT_KEY = "forge-field-account-theme";

export function readThemePref() {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

function readAccountTheme() {
  try {
    const value = window.localStorage.getItem(ACCOUNT_KEY);
    return value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  // Same as the desktop app: the person's setting there, light by default.
  return readAccountTheme();
}

export function applyFieldTheme(pref) {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.setAttribute("data-field-theme", theme);
  // The desktop app's colours (tokens.css) switch on data-theme.
  root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#111827" : "#eef2f6");
  return theme;
}

export function saveThemePref(pref) {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    // ignore
  }
  return applyFieldTheme(pref);
}

/** Remember the person's desktop light/dark setting and use it when on Auto. */
export function rememberAccountTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  try {
    window.localStorage.setItem(ACCOUNT_KEY, theme);
  } catch {
    // ignore
  }
  applyFieldTheme(readThemePref());
}
