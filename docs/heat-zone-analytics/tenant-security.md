# Heat Zone Analytics — Tenant Security

Tenant = department. Isolation is enforced in four independent layers; any one of them alone blocks
cross-department access.

## 1. Server-side identity and tenant verification

* Every callable runs `resolveCaller()` (`functions/lib/heatZone/service.js`):
  1. Firebase Auth uid required.
  2. `departmentId` from the request is validated as an id and treated as a **selector only**.
  3. `assertMemberPermission()` (existing `functions/lib/access.js`) requires an *active* membership
     doc `departments/{d}/users/{uid}`, an active subscription/department, and the
     `viewHeatZoneAnalytics` permission computed from the member's roles + overrides
     (`functions/lib/memberGrants.js`). Platform creators (`platformCreators/{uid}`) pass.
  4. Module entitlement `analytics` checked against `platformEntitlements/{d}`.
  5. District scope loaded from `heatZoneAccess/{uid}` unless the member may view all districts.
* A forged `departmentId` therefore fails exactly like a non-member (`permission-denied`).
* Triggers never take a tenant from data: the department comes from the document **path**
  (`departments/{departmentId}/lists/...`). A source record whose own `departmentId` field names a
  different department is **rejected** (not projected anywhere) and logged.

## 2. Tenant-scoped storage and queries

* All Heat Zone data lives under `departments/{d}/…`; every query is built from the verified
  department path (`heatZoneCalls` collection of that department only).
* Defence in depth: rows whose stored `departmentId` differs from the verified department are dropped
  at read time; incident lookups re-check it.
* Geographic queries are filters over the tenant's own rows. Two departments with identical
  coordinates are tested to prove proximity never mixes data.

## 3. Database-level row security (Firestore rules)

| Collection | Browser read | Browser write |
|---|---|---|
| `heatZoneMeta/state` | members of **that** department with `viewHeatZoneAnalytics` (`memberCanAny`) | never |
| `heatZoneCalls`, `heatZoneZones`, `heatZoneSettings`, `heatZoneAccess`, `heatZoneEvents` | never | never |

All six are listed in `hasExplicitTenantRule()` so the tenant catch-all rule cannot widen them.
Analytics are only reachable through the callables, which apply district scope — something rules
alone could not express for aggregates.

## 4. Tenant-specific caching, jobs, subscriptions and reports

* **Cache** (`functions/lib/heatZone/cache.js`): per-instance LRU. Key =
  `departmentId | data version | caller district scope | hash(filters, zoom, mode, capabilities)`.
  A key cannot be built without a department id; data changes bump the version so stale entries are
  unreachable; restricted members never share entries with broader scopes.
* **Background processing**: triggers and rebuilds are per department; the event ledger is
  per department (`departments/{d}/heatZoneEvents`).
* **Real-time**: browsers subscribe only to `departments/{d}/heatZoneMeta/state`, permitted by rules
  per department; the doc carries a counter, not data. Fresh data always comes from an authorized callable.
* **Reports/exports**: generated server-side under the same `resolveCaller()` checks plus
  `exportHeatZoneReports`; contents respect district scope; each export is written to that
  department's `auditLogs`.

## Permissions (existing role system)

| Key | Grants | fireChief / itAdmin | battalionChief | companyOfficer | readOnly | firefighter |
|---|---|---|---|---|---|---|
| `viewHeatZoneAnalytics` | Open the module, dashboard, heat map | ✓ | ✓ | ✓ | ✓ | – |
| `viewHeatZoneMarkers` | Individual incident markers + detail (also requires `viewNerisReports`) | ✓ | ✓ | ✓ | – | – |
| `viewHeatZoneAllDistricts` | All districts (otherwise assigned districts only) | ✓ | ✓ | – | – | – |
| `viewHeatZoneHistory` | Beyond the last 30 days, comparisons | ✓ | ✓ | ✓ | ✓ | – |
| `viewHeatZoneRepeatLocations` | Repeat-location analysis | ✓ | ✓ | – | – | – |
| `exportHeatZoneReports` | CSV / Excel / PDF exports | ✓ | ✓ | – | – | – |
| `manageHeatZoneSettings` | Boundaries, weights, district access, recalculation (implies all districts) | ✓ | – | – | – | – |

Grants are edited in **System Admin → Permissions** (group "Heat Zone Analytics"), per role or per user.
Having access to Forge Responder does **not** grant any of these.

## Audit logging

`departments/{d}/auditLogs` entries (`module: "Heat Zone Analytics"`):
`heat_zone_report_exported`, `heat_zone_incident_viewed`, `heat_zone_boundaries_saved`,
`heat_zone_boundary_deleted`, `heat_zone_settings_saved`, `heat_zone_access_changed`, `heat_zone_rebuilt`.
Rejected cross-tenant records are logged to Cloud Logging (`heat zone: rejected cross-tenant record`).

## Verification

See testing-results.md. The cross-tenant suite (`tests/functions/heatZone.test.mjs` → "tenant
isolation (release blocking)") and the rules suite must pass before release. Mutation checks
(forcing "all districts", or skipping the membership check) were confirmed to make the suite fail.
