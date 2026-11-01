import { filterNavTree, flattenNavLeaves } from "../../data/preventionNav.js";
import { PREPLAN_FEATURE_KEYS } from "./preplanDefaults.js";
import {
  filterFeaturesByCreatorAllowlist,
  isPreplanFeatureEnabled,
  normalizePreplanFeatures,
} from "./preplanFeatures.js";

/** Map Prevention nav leaf names → preplanFeatures keys. */
export const PREPLAN_NAV_FEATURE_MAP = {
  "Preplan Dashboard": "dashboard",
  "Preplan Work Queue": "workQueue",
  "My Preplans": "workQueue",
  "Draft Preplans": "workQueue",
  "Awaiting Review": "reviewWorkflow",
  "Approved Preplans": "approvalWorkflow",
  "Preplan Reports": "reports",
  Templates: "templateBuilder",
  "Nearby Preplans": "mapIntegration",
  "Target Hazards": "dashboard",
  "Preplan Offline": "offlineAccess",
  "QR Scan": "qrCodes",
};

/**
 * Resolve effective features for nav/route gates (Creator allowlist ∩ tenant flags).
 */
export function resolveEffectivePreplanFeatures(tenantFeatures, creatorAllowlist = null) {
  return filterFeaturesByCreatorAllowlist(
    normalizePreplanFeatures(tenantFeatures),
    creatorAllowlist,
  );
}

/**
 * Menu items whose pages are not built yet. They are hidden for everyone
 * (creators included) whatever the department flags say, so nobody lands on a
 * placeholder screen. Remove a name here once its page is real.
 *  - Preplan Dashboard / Preplan Reports: only repeat the All Preplans table.
 *  - Nearby Preplans: no location, map or distance yet.
 *  - QR Scan: nothing scans or redeems a QR code yet.
 */
export const PREPLAN_NAV_NOT_BUILT = new Set([
  "Preplan Dashboard",
  "Preplan Reports",
  "Nearby Preplans",
  "QR Scan",
]);

export function isPreplanNavLeafEnabled(leafName, features = {}) {
  if (PREPLAN_NAV_NOT_BUILT.has(leafName)) return false;
  const key = PREPLAN_NAV_FEATURE_MAP[leafName];
  if (!key) return true;
  return isPreplanFeatureEnabled(features, key);
}

export function filterNavGroupsByPreplanFeatures(navGroups = [], features = {}, options = {}) {
  const { isCreator = false } = options;
  // Creators bypass department flags, but never see pages that aren't built.
  const isLeafShown = isCreator
    ? (name) => !PREPLAN_NAV_NOT_BUILT.has(name)
    : (name) => isPreplanNavLeafEnabled(name, features);
  return navGroups
    .map((group) => {
      if (Array.isArray(group.tree)) {
        const tree = filterNavTree(group.tree, (leaf) => isLeafShown(leaf.name));
        return {
          ...group,
          tree,
          items: flattenNavLeaves(tree).map((leaf) => [leaf.name, leaf.icon, leaf.externalUrl]),
        };
      }
      if (Array.isArray(group.items)) {
        return {
          ...group,
          items: group.items.filter(([name]) => isLeafShown(name)),
        };
      }
      return group;
    })
    .filter((group) => {
      if (Array.isArray(group.tree)) return group.tree.length > 0;
      if (Array.isArray(group.items)) return group.items.length > 0;
      return true;
    });
}

export { PREPLAN_FEATURE_KEYS };
