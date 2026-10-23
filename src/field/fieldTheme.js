/** Field app theme: follow the phone, or force Sunlight (high-contrast light) / Dark. */

const KEY = "forge-field-theme";

export function readThemePref() {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyFieldTheme(pref) {
  const theme = resolveTheme(pref);
  document.documentElement.setAttribute("data-field-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0b0f14" : "#ffffff");
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
