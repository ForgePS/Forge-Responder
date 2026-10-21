# Fleet Module — Migration Report (Phase 15)

## Approach

- One-way import: classic Apparatus list → `fleetAssets`
- Aliases retain `legacyApparatusId` for incident / deep-link continuity
- Classic modules remain available until cutover flags are set
- Hose tests migrate into Fleet Tests when empty

## Operator steps

1. Configuration Studio → Migration Center
2. Dry-run / export classic lists if needed
3. Run import; review report counts (created / updated / skipped)
4. Reconcile unmapped fields stored on assets
5. Run Fleet Hardening checks
6. Optional: lock legacy writes + redirect Apparatus nav

## Rollback

Disable cutover flags; classic lists remain. Do not bulk-delete fleetAssets without an export.
