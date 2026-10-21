import { ShieldCheck } from "lucide-react";
import { NAV_MODULE_MAP } from "../data/adminRegistry.js";
import {
  filterNavGroupsByModules,
  filterNavTree,
  flattenNavLeaves,
  groupHasNavTree,
} from "./navTree.js";

const ALWAYS_VISIBLE = new Set(["Creator Console", "Platform Admin"]);

/** Code Library leaves — hidden when department library module is off (except admin for creators). */
export const CODE_LIBRARY_NAV_NAMES = new Set([
  "Search Codes",
  "Browse Codes",
  "Frequently Used",
  "Saved Sections",
  "Local Amendments",
  "Adopted Codes",
  "Code Administration",
]);

/**
 * Hide Code Library nav when Creator has not enabled the module for the tenant.
 * Creators still see Code Administration so they can enable it.
 */
export function filterNavByCodeLibraryAccess(navGroups = [], access = null, options = {}) {
  const moduleOn = Boolean(access?.moduleEnabled);
  if (moduleOn) return navGroups;
  const keepAdmin = Boolean(options.isCreator || options.isPlatformCreator);

  return navGroups
    .map((group) => {
      const leafVisible = (name) => {
        if (!CODE_LIBRARY_NAV_NAMES.has(name)) return true;
        return keepAdmin && name === "Code Administration";
      };
      if (groupHasNavTree(group)) {
        const tree = filterNavTree(group.tree, (leaf) => leafVisible(leaf.name));
        return {
          ...group,
          tree,
          items: flattenNavLeaves(tree).map((leaf) => [leaf.name, leaf.icon, leaf.externalUrl]),
        };
      }
      return {
        ...group,
        items: (group.items || []).filter(([name]) => leafVisible(name)),
      };
    })
    .filter((group) => {
      if (groupHasNavTree(group)) return (group.tree || []).length > 0;
      return (group.items || []).length > 0;
    });
}

export function filterNavByEnabledModules(navGroups = [], isModuleEnabled = () => true, options = {}) {
  const { isPlatformScope = false } = options;
  if (isPlatformScope) {
    if (!options.isCreator && !options.isPlatformCreator) return [];
    return [{ label: "FORGE RMS", items: [["Creator Console", ShieldCheck]] }];
  }

  return filterNavGroupsByModules(navGroups, isModuleEnabled, NAV_MODULE_MAP, {
    isCreator: options.isCreator,
    isPlatformCreator: options.isPlatformCreator,
  });
}

export { ALWAYS_VISIBLE };
