import { useCallback, useEffect, useState } from "react";
import { loadPersonnelPrivate } from "../lib/personnelPrivateService.js";

/**
 * One person's private details (personnelPrivate/{id}) for people allowed to see them.
 * status: "off" (not allowed / no person), "loading", "ready", "error".
 */
export function usePersonnelPrivate(departmentId, personnelId, enabled) {
  const [state, setState] = useState({ personnelId: "", status: "off", fields: {} });

  useEffect(() => {
    if (!enabled || !departmentId || !personnelId) {
      setState({ personnelId: personnelId || "", status: "off", fields: {} });
      return undefined;
    }
    let cancelled = false;
    setState({ personnelId, status: "loading", fields: {} });
    loadPersonnelPrivate(departmentId, personnelId)
      .then(({ fields }) => {
        if (!cancelled) setState({ personnelId, status: "ready", fields });
      })
      .catch((error) => {
        console.warn("Couldn't load private personnel details", error?.code || error);
        if (!cancelled) setState({ personnelId, status: "error", fields: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, personnelId, enabled]);

  /** After a save, keep the stored copy in step without reloading. */
  const applySaved = useCallback((patch = {}) => {
    setState((current) => {
      const fields = { ...current.fields };
      Object.entries(patch).forEach(([key, value]) => {
        if (value === "" || value === null || value === undefined) delete fields[key];
        else fields[key] = value;
      });
      return { ...current, fields };
    });
  }, []);

  return { ...state, applySaved };
}
