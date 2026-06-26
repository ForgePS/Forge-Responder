import { ShieldCheck } from "lucide-react";
import { NAV_MODULE_MAP } from "../data/adminRegistry.js";

const ALWAYS_VISIBLE = new Set(["Creator Console", "Platform Admin"]);

export function filterNavByEnabledModules(navGroups = [], isModuleEnabled = () => true, options = {}) {
  const { isPlatformScope = false } = options;
  if (isPlatformScope) {
    if (!options.isCreator && !options.isPlatformCreator) return [];
    return [{ label: "FORGE RMS", items: [["Creator Console", ShieldCheck]] }];
  }

  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(([name]) => {
        if (ALWAYS_VISIBLE.has(name)) return Boolean(options.isCreator || options.isPlatformCreator);
        const moduleKey = NAV_MODULE_MAP[name];
        if (!moduleKey) return true;
        return isModuleEnabled(moduleKey);
      })
    }))
    .filter((group) => group.items.length > 0);
}
