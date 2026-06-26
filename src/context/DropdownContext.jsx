import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getActiveOptions, loadDropdownsMap } from "../lib/dropdownService.js";
import { useTenant } from "./TenantContext.jsx";

const DropdownContext = createContext(null);

export function DropdownProvider({ children }) {
  const { departmentId, ready } = useTenant();
  const [dropdowns, setDropdowns] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!ready || !departmentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const map = await loadDropdownsMap(departmentId);
        if (!cancelled) setDropdowns(map);
      } catch (error) {
        console.warn("Failed to load dropdown definitions", error);
        if (!cancelled) setDropdowns({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [departmentId, ready]);

  const value = useMemo(
    () => ({
      dropdowns,
      loading,
      getOptions: (dropdownId, currentValue = "") => {
        const dropdown = dropdowns[dropdownId];
        return getActiveOptions(dropdown, currentValue);
      },
      refreshDropdowns: async () => {
        const map = await loadDropdownsMap(departmentId);
        setDropdowns(map);
        return map;
      }
    }),
    [dropdowns, loading, departmentId]
  );

  return <DropdownContext.Provider value={value}>{children}</DropdownContext.Provider>;
}

export function useDropdowns() {
  const context = useContext(DropdownContext);
  if (!context) throw new Error("useDropdowns must be used within DropdownProvider");
  return context;
}
