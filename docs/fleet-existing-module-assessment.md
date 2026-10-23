# Existing Apparatus / Fleet Module Assessment

**Date:** 2026-07-20  
**Purpose:** Phase 1 safety net for the Enterprise Fleet Module upgrade.  
**Spec:** Forge RMS Enterprise Fleet, Apparatus & Vehicle Operations Module.

## Persistence today

All live Fleet UI data uses **tenant list documents**, not first-class collections:

| Domain | `LIST_KEYS` | Firestore path |
|---|---|---|
| Apparatus | `apparatus` → `hlfd-rms-apparatus` | `departments/{id}/lists/hlfd-rms-apparatus` (`items[]`) |
| Work orders | `workOrders` → `hlfd-rms-work-orders` | `departments/{id}/lists/hlfd-rms-work-orders` |
| Assets | `assets` → `hlfd-rms-assets` | `departments/{id}/lists/hlfd-rms-assets` |
| Hose tests | `hoseTests` → `hlfd-rms-hose-tests` | `departments/{id}/lists/hlfd-rms-hose-tests` |

State wiring: `useTenantPersistentState` in `src/App.jsx` (localStorage cache + Firestore snapshot + seed fallbacks).

Legacy fallbacks (loader): top-level `rmsData/{listKey}`; apparatus may also appear under `departments/{id}/apparatus` subcollection (not the primary UI write path).

## UI routes (module switch in App.jsx)

| Nav | Permission | Implementation |
|---|---|---|
| Apparatus | `viewApparatus` / `editApparatus` | `ApparatusPage` in `App.jsx` |
| Maintenance | `viewApparatus` | `MaintenancePage` in `App.jsx` |
| Assets | `viewAssets` / `editAssets` | `AssetsPageConnected` in `SprintModulePages.jsx` |
| Hose Testing | `viewApparatus` | `HoseTestingPage` in `SprintModulePages.jsx` |

Supporting: `FleetRecordEditModal.jsx`, scheduling apparatus panels, employee portal `MaintenanceIssueForm` → `maintenanceIssueWorkflow.js`.

## Typical record shapes

**Apparatus:** `id`, `unit`, `type`, `station`, `year`, `mileage`, `engineHours`, `pumpHours`, `fuel`, `pmDue`, `status`, `operator`, `checks[]` — normalized by `normalizeApparatusRecord` in `apparatusSchema.js`.

**Work order:** `id`, `unit`, `issue`, `category`, `priority`, `opened`, `vendor`, `cost`, `status`.

**Asset:** `id`, `name`, `category`, `serial`, `location`, `assigned`, `inspection`, `value`, `status`.

**Hose test:** `id`, `apparatus`, `section`, `lastTest`, `nextDue`, `result`, `testedBy`, `status`.

## Cross-module references

- **Scheduling:** unit assignment via `canonicalApparatusUnitName`, crew slots (`apparatusCrewSlots.js`), roster boards.
- **Analytics:** apparatus + workOrders KPI inputs.
- **Admin / Creator Console:** module datasets for apparatus/assets lists.
- **Employee portal:** maintenance issue → work order record on the work-orders list.
- **NERIS / incidents:** unit designations referenced by string; no hard FK to apparatus list docs.

## Permissions (pre–Phase 2)

- `viewApparatus`, `editApparatus`, `viewAssets`, `editAssets`
- No separate maintenance / hose / fleet-dashboard / fleet-config keys

## Data quality notes

- Unit IDs sometimes derived from unit name (`APP-{unit}`); duplicates get suffix in `normalizeApparatusList`.
- Legacy rename map: `Brush 2` → `FD-2` in `LEGACY_APPARATUS_UNIT_NAMES`.
- Maintenance page includes hardcoded “Upcoming PM” / spend panels (not fully data-driven).
- Hose Testing is largely read-only UI.
- List docs store unbounded `items[]` arrays — migration to document-per-asset is required for scale.

## Migration posture (Phase 3)

- **Dry-run / apply** via Fleet Configuration Studio → Migration Center (`fleetMigrationService.js`).
- Retains apparatus `id` as `fleetAssets` id / `legacyApparatusId`.
- Writes `fleetAssetAliases` for legacy id + unit designation.
- Stores unmapped legacy fields on `migrationUnmapped`.
- Reconciliation report in `fleetMigrationReports` (duplicates, work-order unit refs).
- Classic list docs are **never deleted**; rollback removes batch-tagged fleet assets/aliases only.
- Cutover flags: `redirectApparatusToFleetAssets`, `legacyApparatusWritesLocked`.

## Feature flag

`fleetSettings.moduleV2Enabled` (default `true`) gates progressive Fleet V2 surfaces. Classic Apparatus / Assets / Maintenance / Hose Testing remain available regardless.
