# Existing Inspections / Prevention Module Assessment

**Date:** 2026-07-20  
**Purpose:** Phase 1 gap-fill for the Enterprise Inspections & Code Enforcement Module (v2 + Preplans).  
**Spec:** Forge_RMS_Enterprise_Inspections_Module_Cursor_Spec_v2_Preplans_Added.md

## What already exists (enterprise)

| Surface | Path | Persistence |
|---|---|---|
| Inspections Dashboard / Work Queue / All / My | `InspectionsModulePages.jsx` | `departments/{id}/inspections` |
| Occupancies master | `OccupanciesMasterPage.jsx` | `departments/{id}/occupancies` (+ legacy list migrate) |
| Configuration Studio | `InspectionConfigStudioPage.jsx` | types, templates, versions, settings |
| Open Violations | `ViolationsPage.jsx` | `violations` + `violationCatalog` |
| Codes | Config Studio panel | `codeSets`, `codeSections`, `localAmendments` |
| Audit | `inspectionAudit.js` | `inspectionAuditEvents` |

Package: `src/lib/inspections/*`. Rules under `departments/{departmentId}` for the collections above.

## Classic / stub surfaces still in nav

| Nav | Status |
|---|---|
| Inspection Queue | Sprint stub (`InspectionsPage` in `SprintModulePages.jsx`) over list docs |
| Preplans | **Read-only sprint table** over `LIST_KEYS.preplans` — no Firestore service |
| Hydrants | Mature standalone module (keep; out of Phase 2A scope) |

## Preplans gap (Phase 2A target)

- No `preplanService.js`
- No department `match /preplans` (or related) in `firestore.rules`
- `preplans` may appear in tenant path lists but is unused as first-class docs
- Top-level legacy `preFirePlans` exists separately — do not destroy; enterprise preplans use department collections

## Permissions today

`viewInspections`, `editInspections`, `manageInspectionConfig`, `viewInspectionDashboard`, `assignInspections`, `conductInspections`, `approveInspections`, `viewViolations`, `editViolations`

**Phase 1 adds:** `viewPreplans`, `editPreplans`, `createPreplans`, `approvePreplans`, `managePreplanConfig` (with backward-compatible fallbacks from `viewInspections` / `editInspections`).

## Phase 2A status

Enterprise preplans vertical slice: `preplanService`, work queue / wizard / detail, Config Studio preplan panel, inspection + occupancy create actions, local offline draft queue. Floor-plan CAD deferred.

## Adaptations vs spec

| Spec | Forge RMS |
|---|---|
| TypeScript | JSX + JSDoc |
| `tenants/{id}` | `departments/{id}` |
| Full floor-plan CAD in 2A | Deferred; MVP uses structured tactical fields + symbol checklist |
| Rebuild Phases 1–5 | **Do not** — reuse existing inspections package |

## Migration posture for Preplans

- One-way optional import from classic `lists/...preplans` items into `preplans` when empty
- Preserve occupancy name linkage via occupancy search / create-from-occupancy
- Classic list docs not deleted
