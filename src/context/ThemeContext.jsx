import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useTenant } from "./TenantContext.jsx";
import { normalizeUiTheme, saveUserThemePreference } from "../lib/userPreferences.js";
import { isPlatformScope } from "../lib/tenantPaths.js";

export const THEMES = ["light", "dark"];

const ThemeContext = createContext(null);

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const normalized = normalizeUiTheme(theme);
  document.documentElement.setAttribute("data-theme", normalized);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", normalized === "dark" ? "#000000" : "#eef1f6");
  }
}

export function ThemeProvider({ children }) {
  const { user, membership, patchMembership } = useAuth();
  const { departmentId } = useTenant();
  const [theme, setThemeState] = useState("light");

  useEffect(() => {
    const preferred = membership?.preferences?.theme;
    if (preferred === "dark" || preferred === "light") {
      setThemeState(preferred);
      return;
    }
    if (!user?.uid) {
      setThemeState("light");
    }
  }, [user?.uid, membership?.preferences?.theme]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const persistTheme = useCallback(async (nextTheme) => {
    const normalized = normalizeUiTheme(nextTheme);
    setThemeState(normalized);

    const storageDepartmentId = membership?.departmentId
      || (departmentId && !isPlatformScope(departmentId) ? departmentId : null);

    if (!user?.uid || !storageDepartmentId) {
      return;
    }

    try {
      const preferences = await saveUserThemePreference(storageDepartmentId, user.uid, normalized);
      patchMembership?.({ preferences });
    } catch (error) {
      console.error("Failed to save theme preference", error);
    }
  }, [user?.uid, departmentId, membership?.departmentId, patchMembership]);

  const value = useMemo(() => ({
    theme,
    isDark: theme === "dark",
    setTheme: persistTheme,
    toggleTheme: () => persistTheme(theme === "dark" ? "light" : "dark"),
  }), [theme, persistTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
