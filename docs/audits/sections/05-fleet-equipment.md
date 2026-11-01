## Fleet, apparatus, equipment and inventory

Scope: the Fleet menu (except Fleet Configuration Studio and Apparatus Check Setup) plus the classic Apparatus, Assets, Maintenance and Hose Testing pages. Fleet V2 data lives in about 70 `departments/{id}/fleet*` collections. The classic pages use list docs (`departments/{id}/lists/hlfd-rms-apparatus`, `-work-orders`, `-assets`, `-hose-tests`) through `useTenantPersistentState`.

### Inventory
| Page / feature | Where (file) | Status (1-7) | One-line note |
|---|---|---|---|
| Fleet Dashboard | src/pages/FleetDashboardPage.jsx | 2 | Real counts from `fleetAssets`. Only six KPI tiles and a single paragraph. "Export classic lists" button is jargon |
| Readiness Board | src/pages/FleetReadinessBoardPage.jsx, lib/fleet/fleetReadinessService.js | 2 | Real cards, checks and defect counts. No way to change status from the board; the score is an arbitrary formula |
| Fleet Defects | src/pages/FleetDefectsPage.jsx | 2 | Create, OOS/restrict/RTS and create-WO all persist. The reserve request picks a unit automatically. Raw enums appear in messages |
| Fleet Work Orders | src/pages/FleetWorkOrdersPage.jsx, fleetWorkOrderService.js | 3 | Board, labor, parts and QC persist. Completing a WO doesn't return the unit to service or close the defect/PM |
| PM Forecast | FleetPmForecastPage.jsx, fleetPmService.js | 2 | Real schedules and manual "generate due WOs". The "auto-create" flag needs someone to click a button. Completing a PM WO doesn't roll the schedule forward |
| Fleet Tests | FleetTestsPage.jsx, fleetTestService.js | 2 | Records tests. Hose tests are copied once from the classic list |
| Fuel & Energy | FleetFuelEnergyPage.jsx, fleetFuelService.js | 2 | Fuel and charging logs are real, with exception rules. Telematics is manual entry only |
| Telematics adapters | fleetTelematicsService.js:107, fuelDefaults.js:102 | 5 | Viewing seeds a "Generic API adapter", status "configured", 15-min poll. Nothing polls |
| Components & Warranty | FleetComponentsWarrantyPage.jsx | 2 | Tires, batteries, fluids, recalls, warranties and claims persist. Claim messages show raw status ids |
| Fleet Operations: assignments / transfers / swaps / checkouts / decon | FleetOperationsPage.jsx, fleetOperationsService.js | 2 | Records persist. A completed transfer sets `equipmentReconciled: true` without reconciling anything |
| Fleet Operations: Load plans | FleetOperationsPage.jsx:398-470 | 5 | "New plan" always uses the first unit and four hard-coded items. Items can't be edited. "Mark checked (full)" fills in the expected quantities |
| Accident & Risk | FleetAccidentRiskPage.jsx, fleetRiskService.js | 3 | Records persist. Sensitive fields are hidden only on screen. "Roadside / tow dispatched" message, but nothing is dispatched |
| Fleet Procurement | FleetProcurementPage.jsx | 2 | Requests, specs, builds, grants and insurance persist. Commissioning creates a fleet asset only (not a classic Apparatus unit) |
| Cost & Replacement | FleetCostReplacementPage.jsx, fleetCostReplacementService.js | 2 | Cost sync from WOs/fuel, scoring and capital plan are real. "Complete disposal" has no confirmation and auto-ticks every checklist item |
| Reporting: standard/custom reports, CSV | FleetReportingPage.jsx, fleetReportingService.js:341-551 | 1 | Real queries and real exports |
| Reporting: Automations | fleetReportingService.js:676 | 5 | "Executed notify/escalate/create_task" is only a log row. No notification or task is created, and nothing runs on a schedule |
| Reporting: Workflows | fleetReportingService.js:767 | 5 | Two "published" workflow diagrams are seeded on view. No engine runs them |
| Reporting: Integrations (NERIS/CAD/GL) | fleetReportingService.js:823, 875 | 5 | Seeded on view. "Test connection" always reports "OK" and sets status `connected`. Seeded GL codes `fuel=6100;pm=6200…` are made up |
| Vendor Portal | FleetVendorPortalPage.jsx, fleetVendorPortalService.js | 5 | Internal staff pick a "Vendor context" and act as the vendor. Outside vendors can't sign in |
| All Fleet Assets | FleetAssetsMasterPage.jsx | 3 | Create/edit persist. No delete or retire. Setting Status here doesn't clear `readinessState` |
| Fleet Hardening (creator-only) | FleetHardeningPage.jsx, fleetHardeningService.js | 7 | Developer release checklist with about 18 checks hard-coded to `pass`, an offline-queue debugger, a load-smoke runner and cutover flags |
| Classic Apparatus | src/pages/ApparatusPage.jsx | 2 | Persists to the list doc. This is what Dashboard and Scheduling read. Its "Readiness Checks" panel is a separate, static check list |
| Classic Maintenance | src/pages/MaintenancePage.jsx | 7 | Duplicates Fleet Work Orders. Its status dropdown isn't gated by `canEdit` in the handler |
| Classic Assets (equipment) | src/pages/SprintModulePages.jsx:429 | 3 | Flat list: no quantities, no delete, no history. "Check Out" toggles a string |
| Hose Testing | src/pages/HoseTestingPage.jsx | 2 | Works (add, record test, delete with confirm). Duplicates hose records in Fleet Tests |
| Equipment inventory (quantities, issue/return, transfers, transaction log) | — | 6 | Doesn't exist (see findings) |

### Findings
- **[Demo-blocker] Two apparatus systems that don't stay in sync.** The classic list → `fleetAssets` sync is one-way, add-only, and runs once when the collection is empty (`fleetAssetService.js:235`). After that it runs only from the apparatus-check pages (`:411`). Status, station, meters and decommissioning never flow back to the classic list. The command Dashboard (`src/utils/dashboardMetrics.js:93`) and Scheduling (`App.jsx:1112`) read only the classic list. So a unit put out of service from a failed check, defect or accident (`fleetStatusControlService.js:117`) shows OOS on the Readiness Board but "In Service" on the Dashboard and the Apparatus page. Disposal (`fleetCostReplacementService.js:950`) and procurement commissioning have the same gap. Fix: make `fleetAssets` the single source and have the Dashboard, Scheduling and Apparatus read it (or write status back to the list). Effort: M–L.
- **[Demo-blocker] Duplicate work-order systems.** Maintenance writes `hlfd-rms-work-orders`. Fleet Work Orders copies that list once (`fleetWorkOrderService.js:217`) and then diverges. The Apparatus page's "New Work Order" and "Service Timeline" use the classic list. Fix: hide Maintenance and point Apparatus at the Fleet WOs. Effort: M.
- **[High] Status field on All Fleet Assets contradicts the Readiness Board.** Changing Status saves `status` only. `deriveReadinessState` (`fleetReadinessService.js:11`) prefers the stored `readinessState`, so a unit set back to "In service" here still shows Out of Service on the board. The Dashboard counts by `status` and disagrees. Fix: set `readinessState`/`activeRestriction` together with status, or route the change through `applyFleetStatusDecision`. Effort: S.
- **[High] Completing a work order doesn't close the loop.** `transitionFleetWorkOrder`/`completeWorkOrderQc` (`fleetWorkOrderService.js:350,443`) don't return the unit to service, close the linked defect or advance the PM schedule (`completePmSchedule` is only on the PM page, `FleetPmForecastPage.jsx:277`). A defect's `oosRecommendation` is never `"immediate_oos"`, so `oosRequired` is never set from a defect (`FleetDefectsPage.jsx:309` vs `fleetDefectService.js:80`). Effort: M.
- **[High] Accident medical and legal notes are hidden only on screen.** `redactAccidentEvent` (`fleetRiskService.js:177`) runs in the browser, but rules let any member read `fleetAccidentEvents` (`firestore.rules:931`). Hardening still reports "sensitive_gated: pass". Fix: move sensitive fields to a separately ruled subcollection. Effort: M.
- **[High] Fake integrations and automations.** "Test connection" always succeeds and marks the adapter `connected` (`fleetReportingService.js:882`). Automations "Executed" only write a run log (`:676`). Workflows are diagrams with nothing executing them. Viewing seeds three integration adapters with made-up GL codes (`:823`) and a "Generic API adapter" telematics row (`fuelDefaults.js:102`). Fix: hide the Automations, Workflows and Integrations tabs, or label them "not connected". Effort: S.
- **[High] Any department member can write every fleet record.** All `fleet*` rules use `canWriteModule(…, "apparatus")` (`firestore.rules:761-1020`). The edit, status and sensitive permissions in `fleetPermissions.js` are UI-only. Members can also create `fleetAuditEvents`, so audit entries can be forged. The "legacy writes locked" cutover flag is client-only too (`App.jsx:1395`). Effort: M.
- **[High] No real equipment inventory.** Classic Assets (`SprintModulePages.jsx:429`) has one row per item: no quantity, no delete, no custody history, IDs `AST-${1400+length}` that can collide, and filter chips hard-coded to "Medical"/"PPE". "Check Out" is offered only to users who can't edit, and it sets `assigned: "Checked Out"` with no person or date. Summary tiles ignore the default "Available" status. Fleet load plans are the only quantity tracking, and they're demo-grade (see inventory table). Nothing covers consumables, stock levels, reorder, station transfers, an issue/return ledger, or SCBA/PPE serialised tracking. Effort: L.
- **[Medium] Vendor Portal is a role-play screen.** There's no external vendor sign-in or invite; staff choose "Vendor context" (`FleetVendorPortalPage.jsx:111`). Hide it for demo. Effort: L to make real.
- **[Medium] Pages write data when viewed.** Opening a Fleet page writes starter data: fleet classes, defect categories, the in-house shop, PM programs, test programs, replacement model, automations, workflows, integration adapters, telematics adapters, plus a migration of assets, WOs and hose tests. Any member viewing triggers these writes. Fix: seed in the department-creation flow. Effort: S–M.
- **[Medium] No delete or correction path, and no confirmations.** None of the 14 Fleet pages deletes a record (`deleteFleetAsset` is unused). "Complete disposal" decommissions a unit in one click and records title transferred, equipment removed and data removed as `true` (`FleetCostReplacementPage.jsx:641`). Effort: S–M.
- **[Medium] Meter history has no viewer.** Readings persist to `fleetMeterReadings` and update the asset (`fleetMeterService.js:54`). Nothing in the UI calls `listMeterReadings`, and there's no check against a reading lower than the last one, except in fuel exceptions. Effort: S.
- **[Medium] Classic Apparatus "Readiness Checks" are separate from real apparatus checks.** That panel shows the static `checks` array, and the "Complete" button edits it. Checks done in the employee app go to `fleetChecks` and never appear there. Effort: S (remove the panel).
- **[Low] The in-page Fleet tab bar shows "Fleet Hardening" to everyone.** `FleetModuleLayout.jsx:19` isn't creator-filtered, so non-creators who click it get Access Denied. The bar's 18 tabs also repeat the sidebar. Effort: S.
- **[Low] Raw enums and jargon on screen.** Examples: "Status decision applied: out_of_service" (`FleetDefectsPage.jsx:181`), "Claim X → under_review", "Fleet master collection", "classic lists", "Migrated hose tests". Effort: S.
- **[Low] Leftover dead code.** The hard-coded `kpis` array in `App.jsx:246` ("12 of 18", "6 OOS") is unused.

### Duplicates and obsolete code
- Apparatus vs All Fleet Assets; Maintenance vs Fleet Work Orders; Hose Testing vs Fleet Tests (hose); Apparatus "Readiness Checks" vs fleetChecks; Fleet Dashboard vs Readiness Board (same counts); the Fleet tab bar vs the sidebar.
- Cutover machinery (`fleetMigrationService.js`, the redirect/lock flags, `FleetMigrationPanel`) was built for a migration that never finished. With both systems live, these flags hide the sync problem.
- `fleetLoadSmoke.js`, `fleetOfflineQueue` conflict UI, `FLEET_PERMISSION_MATRIX` CSV and the Hardening checklist are developer tooling.
- `deleteFleetAsset`, `listMeterReadings` and `classicApparatusListExists` are unused. `LEGACY_SAMPLE_RECALLS` (`componentDefaults.js:73`) is kept only for cleanup.

### Recommended menu for a department demo
Keep visible: **Readiness Board, Fleet Defects, Fleet Work Orders, PM Forecast, All Fleet Assets, Apparatus Check Setup, Fleet Configuration Studio**, plus **Fleet Tests** (or classic Hose Testing, not both) and **Fuel & Energy** if fuel logs matter. Hide: Fleet Dashboard (merge into Readiness Board), Components & Warranty, Fleet Operations, Accident & Risk, Fleet Procurement, Cost & Replacement, Reporting & Automation, Vendor Portal, Fleet Hardening, classic Maintenance and classic Assets. Keep classic Apparatus only until the Dashboard and Scheduling read `fleetAssets`. For the demo, don't change unit status from Fleet pages unless both views are shown, because they will disagree.

### Quick wins (under an hour each)
- Filter "Fleet Hardening" out of `DEFAULT_TABS` for non-creators, and trim the tab list to match the demo menu.
- When Status changes on All Fleet Assets, also set `readinessState` and clear `activeRestriction`.
- Fix `immediate_oos` → `out_of_service` in `FleetDefectsPage.jsx:309` and `FleetWorkOrdersPage.jsx:120`.
- Hide the Automations, Workflows and Integrations tabs, and stop `testIntegrationAdapter` from claiming "connected".
- Add `window.confirm` to Complete disposal, and stop auto-checking title, equipment and data.
- Map status ids to labels in Defect and Claim messages. Change "Roadside / tow dispatched" to "Roadside call logged".
- Delete the unused `kpis` constant in App.jsx and the classic Apparatus "Readiness Checks" panel.
