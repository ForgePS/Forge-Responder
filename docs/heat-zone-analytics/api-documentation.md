# Heat Zone Analytics — API

All endpoints are Firebase **callable** Cloud Functions (`onCall`, region us-central1) defined in
`functions/index.js` with logic in `functions/lib/heatZone/service.js`. Client wrappers:
`src/lib/heatZone/heatZoneService.js`.

## Common behaviour

* **Authentication:** Firebase Auth required (`unauthenticated` otherwise).
* **Tenant:** every request carries `departmentId`. It only *selects* the department; the server
  verifies an active membership (`departments/{d}/users/{uid}`, `status: "active"`), an active
  subscription, and the permission keys below. A forged or foreign `departmentId` is rejected with
  `permission-denied` exactly like any non-member.
* **Module gate:** if `platformEntitlements/{d}.modules` exists and lacks `analytics` → `permission-denied`.
* **District scope:** members without `viewHeatZoneAllDistricts` (or `manageHeatZoneSettings`) only
  receive incidents in the districts assigned to them in `heatZoneAccess/{uid}`. No assignment = no data.
* **History:** without `viewHeatZoneHistory`, date ranges are clamped to the last 30 days
  (department-local) and comparisons are omitted; `filters.historyLimited` is `true` in responses.
* **Errors:** `HttpsError` codes `unauthenticated`, `invalid-argument`, `permission-denied`,
  `not-found`, `failed-precondition`. Messages are plain English, safe to show.

### Filters object (request)

```jsonc
{
  "from": "2026-10-01",          // department-local dates, inclusive. Default: last 30 days
  "to": "2026-10-31",
  "daysOfWeek": [1, 2, 3],       // 0 = Sunday … 6 = Saturday
  "timeStart": "22:00",          // HH:MM, department-local. start > end crosses midnight
  "timeEnd": "02:00",            //   (22:00–02:00 = 22:00–23:59 and 00:00–01:59)
  "districtIds": ["north-ab12c"],// "unassigned" = outside every configured district
  "zoneIds": [],                 // response zones
  "classifications": ["Fire"], "priorities": ["Emergency"], "dispositions": [], "statuses": [], "unitTypes": ["Engine"],
  "bounds": { "south": 32.3, "west": -89.5, "north": 32.4, "east": -89.4 } // geographic filter (applies to all stats)
}
```
Ranges are limited to 3 years. The server returns the normalised filters it actually applied.

## Endpoints

| Callable | Permission(s) | Purpose |
|---|---|---|
| `heatZoneDashboard` | `viewHeatZoneAnalytics` | Summary cards, charts, heat grid, comparisons, repeat locations |
| `heatZoneMarkers` | + `viewHeatZoneMarkers` + `viewNerisReports` | Clustered or paged incident markers for a viewport |
| `heatZoneIncident` | + `viewHeatZoneMarkers` + `viewNerisReports` | One incident's authorized detail (audited) |
| `heatZoneBoundaries` | `viewHeatZoneAnalytics` | District / response-zone geometry for the map |
| `heatZoneReport` | + `exportHeatZoneReports` (`comparison` also needs `viewHeatZoneHistory`) | Report data for CSV / XLSX / PDF (audited) |
| `heatZoneGetSettings` | + `manageHeatZoneSettings` | Zones, weights, member district assignments |
| `heatZoneSaveZones` | + `manageHeatZoneSettings` | Create/update a boundary or import GeoJSON; recalculates history |
| `heatZoneDeleteZone` | + `manageHeatZoneSettings` | Delete a boundary; recalculates history |
| `heatZoneSaveSettings` | + `manageHeatZoneSettings` | Priority weights, high-priority list |
| `heatZoneSetDistrictAccess` | + `manageHeatZoneSettings` | Assign districts to a member |
| `heatZoneRebuild` | + `manageHeatZoneSettings` | Recalculate every projection from the source reports |
| `heatZoneSaveGeocoding` | + `manageHeatZoneSettings` | Turn address geocoding on or off; recalculates |

### heatZoneDashboard

Request: `{ departmentId, filters, zoom?: number (map zoom, default 12), mode?: "raw" | "weighted" }`

Response:
```jsonc
{
  "department": { "id": "forge-demo", "name": "Riverside Fire & EMS", "timeZone": "America/Chicago" },
  "filters": { /* normalised filters + historyLimited */ },
  "capabilities": { "viewMarkers": true, "viewAllDistricts": true, "viewHistory": true,
                    "viewRepeatLocations": true, "exportReports": true, "manageSettings": false },
  "zones": [{ "id": "north-ab12c", "name": "North", "kind": "district" | "zone", "color": "#25a194", "active": true }],
  "summary": {
    "totalCalls": 412, "mappedCalls": 400, "unmappedCalls": 12,
    "highestActivityDistrict": { "id": "north-ab12c", "name": "North", "count": 190 } | null,
    "peakHour": { "hour": 17, "count": 38 } | null,
    "topClassification": { "name": "Medical", "count": 220 } | null,
    "highPriorityCalls": 260, "highPriorities": ["Emergency"],
    "averageResponse": { "seconds": 412 | null, "sampleSize": 380, "reliable": true, "coverage": 0.92 }
  },
  "charts": {
    "byHour":    [{ "key": 0, "label": "00:00", "count": 4 } /* 24 entries */],
    "byWeekday": [{ "key": 0, "label": "Sun", "count": 50 } /* 7 entries */],
    "byDistrict": [{ "key": "north-ab12c", "label": "North", "count": 190 }],
    "byClassification": [{ "key": "Medical", "label": "Medical", "count": 220 }],
    "byPriority": [{ "key": "Emergency", "label": "Emergency", "count": 260 }],
    "trend": { "bucket": "day" | "week" | "month", "points": [{ "key": "2026-10-01", "count": 12 }] }
  },
  "heat": { "cellSize": 0.0023, "mode": "raw", "maxValue": 14, "truncated": false,
            "cells": [{ "lat": 32.36, "lng": -89.47, "count": 14, "weighted": 30, "value": 14 }] },
  "filterOptions": { "classifications": [], "priorities": [], "dispositions": [], "statuses": [], "unitTypes": [] },
  "settings": { "priorityWeights": { "Emergency": 3 }, "highPriorities": ["Emergency"] },
  "comparison": { "previousFrom": "…", "previousTo": "…", "currentTotal": 412, "previousTotal": 380, "changePct": 8.4 } | null,
  "districtComparison": [{ "id": "…", "name": "North", "count": 190, "share": 46.1, "previousCount": 170 | null,
                           "changePct": 11.8 | null, "highPriorityCalls": 120, "topClassification": "Medical",
                           "averageResponse": { /* as above */ } }],
  "repeatLocations": [{ "key": "a:123 main st", "address": "123 Main St", "lat": 32.3, "lng": -89.4, "count": 5,
                        "lastOccurredAt": 1730000000000, "districtId": "…",
                        "topClassifications": [{ "name": "Medical", "count": 4 }] }] | null,
  "meta": { "version": 57, "generatedAt": 1730000000000, "truncated": false, "lastChange": { "type": "created", "at": 0 } },
  "cached": true // present when served from the per-instance cache
}
```
`averageResponse.seconds` is `null` (not reliable) when fewer than 5 incidents have both a dispatch and
an arrival time. `heat.cells` are pre-binned server-side for the given zoom; raw records never reach the browser.

### heatZoneMarkers

Request: `{ departmentId, filters, viewport: {south, west, north, east}, zoom, page?: 0, pageSize?: 200 (max 400) }`

Response when zoomed out (zoom < 14) with more than 60 visible incidents:
`{ "mode": "clusters", "total": 812, "clusters": [{ "lat", "lng", "count" }] }`

Otherwise: `{ "mode": "markers", "total", "page", "pageSize", "hasMore",
"markers": [{ "id", "lat", "lng", "occurredAt", "classification", "priority", "districtId" }] }` (newest first).

### heatZoneIncident

Request: `{ departmentId, id }` (marker id). Response: `{ id, reportNumber, occurredAt, localDate, timeZone,
address, lat, lng, classification, classificationDetail, priority, disposition, status, units[], unitTypes[],
stations[], responseSeconds, district: {id, name}, zones: [{id, name}] }`. Returns `not-found` for an id
outside the caller's department or district scope (no existence leak). Writes an audit log entry.

### heatZoneBoundaries

Request: `{ departmentId }` → `{ zones: [{ id, name, kind, color, active, bbox: [s, w, n, e], geometry }] }`
(GeoJSON Polygon/MultiPolygon). Districts outside a restricted caller's scope are omitted.

### heatZoneReport

Request: `{ departmentId, reportType: "geographic" | "district" | "hourly" | "daily" | "classification" | "comparison", filters, format: "csv" | "xlsx" | "pdf" }`

Response: `{ meta: { agencyName, departmentId, reportType, title, format, from, to, timeZone, filters: string[],
districtScope, totalCalls, generatedAt, generatedAtLocal, generatedBy, truncated }, columns: string[], rows: any[][], notes: string[] }`.
The browser renders CSV / XLSX (SheetJS) / printable PDF from this payload (`src/lib/heatZone/heatZoneExport.js`).
Each call writes `departments/{d}/auditLogs` (`action: "heat_zone_report_exported"`).

### Settings callables

* `heatZoneGetSettings { departmentId }` → `{ settings, timeZone, zones: [{id, name, kind, color, priority, active, bbox}], members: [{uid, email, name, role, districtIds}], meta }`
* `heatZoneSaveZones { departmentId, zone: { id?, name, kind, color?, priority?, active?, geometry | geoJson } }`
  or `{ departmentId, geoJson, kind, nameProperty? }` (FeatureCollection import, ≤ 200 features) →
  `{ saved: [{id, name}], rebuild: { projected, written, removed, skipped, rejected } }`
* `heatZoneDeleteZone { departmentId, zoneId }` → `{ deleted, rebuild }`
* `heatZoneSaveSettings { departmentId, settings: { priorityWeights: {Emergency: 3, …}, highPriorities: ["Emergency"] } }`
* `heatZoneSetDistrictAccess { departmentId, uid, districtIds: [] }` (ids must be existing districts or `"unassigned"`)
* `heatZoneRebuild { departmentId }` → `{ projected, written, removed, skipped, rejected, geocoding }`.
  `geocoding` = `{ enabled, googleConfigured, addresses, stored, lookedUp, found, notFound, imprecise, failed, waiting }`.
  At most 300 new addresses are looked up per recalculation; `waiting` says how many are left.
* `heatZoneSaveGeocoding { departmentId, enabled: boolean }` → `{ enabled, rebuild }`. Turning it on
  needs a Google Geocoding (or Maps JS) key in the department's Google APIs integration
  (`failed-precondition` otherwise). Audited as `heat_zone_geocoding_changed`.
* `heatZoneGetSettings` also returns `geocoding: { enabled, googleConfigured, geocodedAddresses }`.

## Live updates

`departments/{d}/heatZoneMeta/state` holds `{ version, zonesVersion, updatedAt, lastChange }`. The
browser listens with `onSnapshot` (`watchHeatZoneVersion`), which Firestore rules allow only for
members of that department with `viewHeatZoneAnalytics`. When `version` changes the page refetches.

## Triggers (not callable)

* `heatZoneOnReportItem` — `departments/{d}/lists/hlfd-rms-neris-fire-reports/items/{itemId}` (`retry: true`)
* `heatZoneOnReportList` — `departments/{d}/lists/hlfd-rms-neris-fire-reports` (legacy array storage)
