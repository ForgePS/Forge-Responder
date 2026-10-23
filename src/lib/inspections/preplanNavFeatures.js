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

export function isPreplanNavLeafEnabled(leafName, features = {}) {
  const key = PREPLAN_NAV_FEATURE_MAP[leafName];
  if (!key) return true;
  return isPreplanFeatureEnabled(features, key);
}

export function filterNavGroupsByPreplanFeatures(navGroups = [], features = {}, options = {}) {
  const { isCreator = false } = options;
  if (isCreator) return navGroups;
  return navGroups
    .map((group) => {
      if (Array.isArray(group.tree)) {
        const tree = filterNavTree(group.tree, (leaf) => isPreplanNavLeafEnabled(leaf.name, features));
        return {
          ...group,
          tree,
          items: flattenNavLeaves(tree).map((leaf) => [leaf.name, leaf.icon, leaf.externalUrl]),
        };
      }
      if (Array.isArray(group.items)) {
        return {
          ...group,
          items: group.items.filter(([name]) => isPreplanNavLeafEnabled(name, features)),
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
