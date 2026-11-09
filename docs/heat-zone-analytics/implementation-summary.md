# Heat Zone Analytics — Implementation Summary (Sprint 01)

Branch `feat/heat-zone-analytics`. Not yet deployed; see "Production readiness" below.

## What was built

| Area | Status | Where |
|---|---|---|
| Module in navigation (Reporting group, `?page=heat-zone-analytics`), permission-gated | Done, tested | `src/App.jsx`, `src/lib/permissions.js`, `src/data/adminRegistry.js` |
| Heat map (red→blue ramp, intensity slider, raw / weighted-by-priority density) | Done, browser-checked | `src/lib/heatZone/heatLayer.js`, `src/components/heatZone/HeatZoneMap.jsx` |
| District and response-zone boundaries, legend, toggles, fit / reset | Done, browser-checked | `HeatZoneMap.jsx`, `MapLegend.jsx` |
| Clustered markers + incident detail (scoped, audited) | Done, tested | `service.markers`, `service.incident`, `IncidentDetail.jsx` |
| Filters: dates, weekday, time of day (crosses midnight), district, response zone, classification, priority, disposition, status, unit type, map bounds | Done, tested | `analytics.normalizeFilters / filterRows`, `FilterBar.jsx` |
| Department time zone for display, UTC (epoch ms) storage | Done, tested | `functions/lib/heatZone/time.js` |
| Summary cards, hour / weekday / district / classification / priority charts, trend, period comparison, district comparison, repeat locations | Done, tested | `analytics.summarize / buildCharts / buildComparison / ...` |
| Near-real-time updates (Firestore trigger → projection → live version doc, typically 2–10 s) | Done, tested (emulator) | `heatZoneOnReportItem`, `heatZoneOnReportList`, `watchHeatZoneVersion` |
| Idempotent, retryable event processing | Done, tested | `service.syncReport` (event ledger + content hash in a transaction) |
| Reports: geographic, district, hourly, daily, classification, comparison; CSV / Excel / PDF (print) with agency, range, filters, time zone, generated-at/by | Done, tested | `service.report`, `src/lib/heatZone/heatZoneExport.js`, `ReportsPanel.jsx` |
| Settings: boundary import (GeoJSON) / delete, priority weights, district access per member, recalculate | Done, tested | `service.saveZones / deleteZone / saveSettings / setDistrictAccess / rebuild` |
| CAD import now keeps latitude / longitude | Done, tested | `src/lib/neris/cadImport.js` |
| 7 new permissions with role defaults | Done, tested | `creatorPermissions.js`, `defaultRoles.js`, `defaultRolePermissions.json` |
| Data migration (backfill) and dev-only sample boundaries | Done, run on emulator | `scripts/backfill-heat-zone.mjs`, `scripts/seed-heat-zone-dev.mjs` |

## Key decisions (details in architecture-discovery.md)

* **No new database.** Records come from the existing NERIS report list; `heatZoneCalls` is a
  derived, rebuildable projection in the same department path. No PostgreSQL/PostGIS was added.
* **All analytics run server-side** in callables that resolve the caller's department membership,
  permissions and district scope before reading anything. The browser can't read the projection.
* **"Patrol zone" is shown as "Response zone"**, since Forge is fire/EMS.
* **Disposition and call status are derived**, because the platform has no such fields (database-schema.md).

## New files

* `functions/lib/heatZone/`: `geo.js`, `time.js`, `projection.js`, `analytics.js`, `cache.js`, `service.js`
* `src/pages/HeatZoneAnalyticsPage.jsx`, `src/styles/heat-zone.css`
* `src/components/heatZone/` (16 components)
* `src/lib/heatZone/`: `heatZoneService.js`, `heatZoneFilters.js`, `heatLayer.js`, `heatZoneExport.js`, `heatZoneUi.js`
* `scripts/backfill-heat-zone.mjs`, `scripts/seed-heat-zone-dev.mjs`
* `tests/unit/heatZoneAnalytics.test.mjs`, `tests/functions/heatZone.test.mjs`
* `docs/heat-zone-analytics/` (8 documents)

## Modified files

`functions/index.js` (2 triggers + 11 callables appended), `firestore.rules`, `firestore.indexes.json`,
`functions/lib/defaultRolePermissions.json`, `package.json` (scripts), `src/App.jsx`,
`src/data/adminRegistry.js`, `src/data/creatorPermissions.js`, `src/data/defaultRoles.js`,
`src/lib/neris/cadImport.js`, `src/lib/permissions.js`, `tests/rules/firestore.rules.test.mjs`.
No existing feature's behaviour was changed apart from CAD imports also keeping coordinates.

## Production readiness

Code-complete and fully tested locally. **Not production-ready** until the three steps at the end of
known-limitations.md are done on staging and then production.
