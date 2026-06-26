import { NAV_MODULE_MAP } from "../data/adminRegistry.js";

const ALWAYS_VISIBLE = new Set(["Creator Console", "Platform Admin"]);

export function filterNavByEnabledModules(navGroups = [], isModuleEnabled = () => true, options = {}) {
  const { isPlatformScope = false } = options;
  if (isPlatformScope) {
    return [{ label: "FORGE RMS", items: [["Platform Admin", "Platform Admin"]] }];
  }

  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(([name]) => {
        if (ALWAYS_VISIBLE.has(name)) return options.isCreator ?? false;
        const moduleKey = NAV_MODULE_MAP[name];
        if (!moduleKey) return true;
        return isModuleEnabled(moduleKey);
      })
    }))
    .filter((group) => group.items.length > 0);
}
