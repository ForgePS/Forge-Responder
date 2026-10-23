/**
 * Phase 7 scaffold: migrate classic LIST_KEYS.preplans and hydrant-module
 * `preFirePlans` into enterprise `preplans` — never auto-delete sources.
 */

/**
 * @returns {{ ready: boolean, steps: string[], warnings: string[] }}
 */
export function getLegacyPreplanMigrationPlan() {
  return {
    ready: false,
    steps: [
      "Inventory classic tenant list preplans (LIST_KEYS.preplans).",
      "Inventory hydrant-module preFirePlans vault documents.",
      "Map fields onto normalizePreplanRecord + create a draft revision with frozen templateSnapshot.",
      "Link occupancyId / hydrantIds when resolvable; otherwise mark missingCriticalFields.",
      "Write migration audit (module: Preplans) per record; leave source docs intact.",
      "Tighten legacy public-read rules only after dual-read verification.",
    ],
    warnings: [
      "Do not auto-delete legacy stores.",
      "Hydrant preFirePlans may be public-readable today — treat as sensitive until rules tightened.",
      "Run on a single pilot department before fleet-wide migration.",
    ],
  };
}

/**
 * Dry-run stub — returns counts only; does not write.
 * @param {object} [inventory]
 */
export function dryRunLegacyPreplanMigration(inventory = {}) {
  const classic = Array.isArray(inventory.classicPreplans) ? inventory.classicPreplans.length : 0;
  const hydrantVault = Array.isArray(inventory.hydrantPreFirePlans) ? inventory.hydrantPreFirePlans.length : 0;
  return {
    classicCount: classic,
    hydrantVaultCount: hydrantVault,
    wouldCreate: classic + hydrantVault,
    wouldDelete: 0,
    plan: getLegacyPreplanMigrationPlan(),
  };
}
