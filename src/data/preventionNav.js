import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  DollarSign,
  Droplets,
  FileBarChart2,
  FileCheck2,
  FileText,
  Flame,
  Gavel,
  LayoutList,
  Mail,
  Map,
  Settings2,
  ShieldCheck,
  UserRound,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Nested Prevention sidebar hierarchy.
 * Leaf nodes use `name` as the App route key. Optional `label` overrides display text.
 * Branch nodes use `id` + `label` and are expand/collapse only (no navigation).
 */
export const PREVENTION_NAV_TREE = [
  {
    id: "prevention-overview",
    label: "Overview",
    icon: ClipboardCheck,
    children: [
      { name: "Prevention Dashboard", icon: ClipboardCheck },
      { name: "Prevention Work Queue", icon: LayoutList },
    ],
  },
  {
    id: "prevention-inspections",
    label: "Inspections",
    icon: ClipboardCheck,
    children: [
      { name: "Inspections Dashboard", icon: ClipboardCheck },
      { name: "Work Queue", icon: LayoutList },
      { name: "All Inspections", icon: FileCheck2 },
      { name: "My Inspections", icon: UserRound },
      { name: "Occupancies", icon: Archive },
      { name: "Fire Protection Systems", icon: Flame },
      { name: "Inspection Reports", icon: FileBarChart2 },
      { name: "Offline & Sync", icon: Wifi },
    ],
  },
  {
    id: "prevention-code-enforcement",
    label: "Code Enforcement",
    icon: Gavel,
    children: [
      { name: "Open Violations", icon: AlertTriangle },
      { name: "Notices & Certificates", icon: FileText },
      { name: "Enforcement Cases", icon: Gavel },
      { name: "Fees & Payments", icon: DollarSign },
      {
        id: "prevention-code-library",
        label: "Code Library",
        icon: BookOpen,
        children: [
          { name: "Search Codes", icon: BookOpen },
          { name: "Browse Codes", icon: BookOpen },
          { name: "Frequently Used", icon: BookOpen },
          { name: "Saved Sections", icon: BookOpen },
          { name: "Local Amendments", icon: FileText },
          { name: "Adopted Codes", icon: Settings2 },
          { name: "Code Administration", icon: Settings2 },
        ],
      },
    ],
  },
  {
    id: "prevention-preplans",
    label: "Preplans",
    icon: ShieldCheck,
    children: [
      { name: "Preplan Dashboard", icon: LayoutList },
      { name: "New Preplan", icon: ShieldCheck },
      { name: "Preplan Work Queue", icon: LayoutList },
      { name: "All Preplans", icon: FileCheck2 },
      { name: "My Preplans", icon: UserRound },
      { name: "Draft Preplans", icon: FileText },
      { name: "Awaiting Review", icon: ClipboardCheck },
      { name: "Approved Preplans", icon: FileCheck2 },
      { name: "Templates", icon: Settings2 },
      { name: "Preplan Reports", icon: FileBarChart2 },
      { name: "Nearby Preplans", icon: LayoutList },
      { name: "Target Hazards", icon: ShieldCheck },
      { name: "Preplan Offline", icon: LayoutList },
      { name: "QR Scan", icon: LayoutList },
    ],
  },
  {
    id: "prevention-hydrants",
    label: "Hydrants",
    icon: Activity,
    children: [
      { name: "Hydrant Overview", icon: Activity },
      {
        id: "prevention-damage-reports",
        label: "Damage Reports",
        icon: AlertTriangle,
        children: [
          { name: "Open Damage Reports", label: "Open Reports", icon: AlertTriangle },
          { name: "Awaiting Water Company", icon: Mail },
          { name: "Repairs in Progress", icon: Wrench },
          { name: "Ready for Verification", icon: ClipboardCheck },
          { name: "Overdue Repairs", icon: AlertTriangle },
          { name: "Closed Reports", icon: FileCheck2 },
        ],
      },
      {
        id: "prevention-water-utilities",
        label: "Water Utilities",
        icon: Droplets,
        children: [
          { name: "Water Company Directory", icon: Droplets },
          { name: "Water Districts", icon: Map },
        ],
      },
      { name: "Damage Analytics", icon: BarChart3 },
    ],
  },
  {
    id: "prevention-administration",
    label: "Administration",
    icon: Settings2,
    children: [
      { name: "Configuration Studio", icon: Settings2 },
      { name: "Automation & Integrations", icon: Zap },
      { name: "Import & Data Quality", icon: ShieldCheck },
    ],
  },
];

/** Map renamed / overview aliases to the underlying module page key when needed. */
export const PREVENTION_ROUTE_ALIASES = {
  "Prevention Dashboard": "Inspections Dashboard",
  "Prevention Work Queue": "Work Queue",
  "Hydrant Overview": "Hydrants",
  "Enforcement Cases": "Enforcement Cases",
  "Import & Data Quality": "Import & Data Quality",
};

/**
 * @param {object} node
 * @returns {boolean}
 */
export function isNavBranch(node) {
  return Boolean(node && Array.isArray(node.children));
}

/**
 * @param {object} node
 * @returns {string}
 */
export function navNodeKey(node) {
  if (!node) return "";
  if (isNavBranch(node)) return `branch:${node.id || node.label}`;
  return `leaf:${node.name}`;
}

/**
 * @param {object} node
 * @returns {string}
 */
export function navNodeLabel(node) {
  if (!node) return "";
  if (isNavBranch(node)) return node.label || node.id || "";
  return node.label || node.name || "";
}

/**
 * @param {object[]} tree
 * @returns {object[]}
 */
export function flattenNavLeaves(tree = []) {
  const leaves = [];
  function walk(nodes) {
    for (const node of nodes || []) {
      if (isNavBranch(node)) walk(node.children);
      else if (node?.name) leaves.push(node);
    }
  }
  walk(tree);
  return leaves;
}

/**
 * @param {object[]} tree
 * @param {string} routeName
 * @returns {string[]} branch ids from root to parent of the active leaf
 */
export function findActiveNavBranchIds(tree = [], routeName = "") {
  if (!routeName) return [];
  /** @type {string[]} */
  let found = [];
  function walk(nodes, trail) {
    for (const node of nodes || []) {
      if (isNavBranch(node)) {
        const nextTrail = [...trail, node.id];
        if (walk(node.children, nextTrail)) return true;
      } else if (node.name === routeName) {
        found = trail;
        return true;
      }
    }
    return false;
  }
  walk(tree, []);
  return found;
}

/**
 * @param {object[]} tree
 * @param {string} routeName
 * @returns {boolean}
 */
export function navTreeContainsRoute(tree = [], routeName = "") {
  return flattenNavLeaves(tree).some((leaf) => leaf.name === routeName);
}

/**
 * Recursively keep branches that still have at least one visible leaf.
 * @param {object[]} tree
 * @param {(leaf: object) => boolean} leafVisible
 */
export function filterNavTree(tree = [], leafVisible = () => true) {
  return (tree || [])
    .map((node) => {
      if (isNavBranch(node)) {
        const children = filterNavTree(node.children, leafVisible);
        if (!children.length) return null;
        return { ...node, children };
      }
      return leafVisible(node) ? node : null;
    })
    .filter(Boolean);
}
