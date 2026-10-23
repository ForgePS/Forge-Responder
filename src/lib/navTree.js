import { flattenNavLeaves, filterNavTree, isNavBranch } from "../data/preventionNav.js";

/**
 * @param {object} group
 * @returns {boolean}
 */
export function groupHasNavTree(group) {
  return Boolean(group && Array.isArray(group.tree));
}

/**
 * Flat item tuples for legacy consumers: [name, Icon, externalUrl?]
 * @param {object} group
 * @returns {Array}
 */
export function groupNavLeavesAsItems(group) {
  if (groupHasNavTree(group)) {
    return flattenNavLeaves(group.tree).map((leaf) => [leaf.name, leaf.icon, leaf.externalUrl]);
  }
  return Array.isArray(group?.items) ? group.items : [];
}

/**
 * @param {object[]} navGroups
 * @param {(name: string, permissions: object, options: object) => boolean} canAccess
 * @param {object} permissions
 * @param {object} [options]
 */
export function filterNavGroupsTree(navGroups = [], canAccess, permissions = {}, options = {}) {
  return navGroups
    .map((group) => {
      if (groupHasNavTree(group)) {
        const tree = filterNavTree(group.tree, (leaf) => canAccess(leaf.name, permissions, options));
        return { ...group, tree, items: flattenNavLeaves(tree).map((leaf) => [leaf.name, leaf.icon, leaf.externalUrl]) };
      }
      return {
        ...group,
        items: (group.items || []).filter(([name]) => canAccess(name, permissions, options)),
      };
    })
    .filter((group) => {
      if (groupHasNavTree(group)) return (group.tree || []).length > 0;
      return (group.items || []).length > 0;
    });
}

/**
 * @param {object[]} navGroups
 * @param {(moduleKey: string) => boolean} isModuleEnabled
 * @param {Record<string, string>} moduleMap
 * @param {object} [options]
 */
export function filterNavGroupsByModules(navGroups = [], isModuleEnabled = () => true, moduleMap = {}, options = {}) {
  const alwaysVisible = new Set(["Creator Console", "Platform Admin"]);
  return navGroups
    .map((group) => {
      const leafVisible = (name) => {
        if (alwaysVisible.has(name)) return Boolean(options.isCreator || options.isPlatformCreator);
        const moduleKey = moduleMap[name];
        if (!moduleKey) return true;
        return isModuleEnabled(moduleKey);
      };
      if (groupHasNavTree(group)) {
        const tree = filterNavTree(group.tree, (leaf) => leafVisible(leaf.name));
        return { ...group, tree, items: flattenNavLeaves(tree).map((leaf) => [leaf.name, leaf.icon, leaf.externalUrl]) };
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

/**
 * @param {object} group
 * @param {string} routeName
 */
export function groupContainsRoute(group, routeName) {
  if (!routeName) return false;
  if (groupHasNavTree(group)) {
    return flattenNavLeaves(group.tree).some((leaf) => leaf.name === routeName);
  }
  return (group.items || []).some(([name]) => name === routeName);
}

export { isNavBranch, flattenNavLeaves, filterNavTree };
