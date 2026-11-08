# Heat Zone Analytics — Database Schema

Database: **Cloud Firestore** (the platform's only database). All collections are tenant-scoped under
`departments/{departmentId}/`. No existing agency, user, district or incident collection was duplicated.

## Source of truth (unchanged)

`departments/{d}/lists/hlfd-rms-neris-fire-reports` — NERIS incident reports, either
`items/{docId}` (one doc per report, `_order` field; current format) or a legacy `items: []` array on
the header doc. **This stays the only authoritative incident record.**

## New collections

### `heatZoneCalls/{docId}` — analytics projection (derived, server-only)

One document per analysable report. `docId` = the source item doc id (`itemDocId(report.id)`), so
every projection maps 1:1 to a source record and can be deleted/rebuilt at any time.

| Field | Type | Source / rule |
|---|---|---|
| `departmentId` | string | Path department (re-checked on every read) |
| `sourceId`, `source` | string | `report.id`, `"hlfd-rms-neris-fire-reports"` |
| `reportNumber` | string | `reportNumber` → `workspace.cad.incidentNumber` → `cadCallNumber` |
| `occurredAt` | number (UTC ms) | `cad.receivedTime` → `cad.dispatchTime` → earliest unit dispatch → `incidentDate` (local midnight). Wall-clock values are read in the department time zone |
| `localDate`, `localMonth`, `localHour`, `localMinute`, `localDow` | string/number | `occurredAt` in the department zone (Sun = 0) |
| `timeZone` | string | `profile/main.timezone` at projection time |
| `lat`, `lng`, `mapped` | number/null, bool | `workspace.location.latitude/longitude` (also `report.latitude/longitude`, `location.lat/lng`). (0,0) and out-of-range = unmapped |
| `address`, `locationKey` | string | `incidentAddress`; normalised address (`a:…`) or rounded point (`p:lat,lng`) for repeat-location grouping |
| `classification`, `classificationDetail`, `typeCode` | string | NERIS `incident_final_type[0]` (category / sub-type) → `incidentTypeSummary` → first discipline → `"Unclassified"` |
| `priority` | string | `workspace.cad.priority` (title-cased) or `"Unspecified"` |
| `disposition` | string | **Derived** — the platform has no incident disposition field: `incident_noaction` (e.g. "Cancelled") → medical/EMS disposition → `"Action Taken"` if actions recorded → `"Unspecified"` |
| `status` | string | Report workflow status (Draft … Submitted) — the only status the platform has |
| `unitTypes[]`, `units[]`, `stations[]` | string[] | `workspace.units[].apparatusType / unitId / station` |
| `responseSeconds` | number/null | Dispatch → first arrival (CAD times, else earliest unit times); kept only when 0 < x ≤ 3 h |
| `districtId` | string | First active `district` boundary containing the point (by `priority`, then id); `"unassigned"` otherwise |
| `zoneIds[]` | string[] | Every active response `zone` containing the point |
| `voided` | bool | `voided === true`, status Voided/Deleted, or lifecycle deleted/voided |
| `contentHash` | string | SHA-256 of the projection + `zonesVersion` (idempotency) |
| `projectionVersion`, `syncedAt` | number | Schema version, last write time |

Indexes: single-field (automatic) on `occurredAt` — range + order queries. All other filtering is done
server-side in memory after the date-range read (≤ 50 000 rows per query).

### `heatZoneMeta/state`

`{ version (incremented on every analytics-affecting change), zonesVersion, updatedAt, lastRebuildAt, lastChange: { type, reason, at } }`.
The only Heat Zone document browsers may read (live-update signal; contains no call data).

### `heatZoneZones/{zoneId}` — boundaries

`{ name, kind: "district" | "zone", color, priority, active, geometryJson (GeoJSON Polygon/MultiPolygon as a string — Firestore cannot store nested arrays), geometryType, bbox: [s, w, n, e], departmentId, updatedAt, updatedBy, sample? }`.
`geometryJson` is excluded from indexing. Max ~900 KB / 60 000 vertices per boundary.

### `heatZoneSettings/main`

`{ priorityWeights: { Emergency: 3, Urgent: 2, Routine: 1, "Non-Emergency": 1, … }, highPriorities: ["Emergency"], updatedAt, updatedBy }` (defaults apply when absent).

### `heatZoneAccess/{uid}`

`{ districtIds: [], departmentId, updatedAt, updatedBy }` — assigned districts for members without
`viewHeatZoneAllDistricts`.

### `heatZoneEvents/{eventId}` — processed-event ledger

`{ docId, outcome, reason, processedAt, expireAt }`. Firestore **TTL policy on `expireAt`** (7 days)
is declared in `firestore.indexes.json`.

## "Migrations"

Firestore has no DDL. The equivalent artefacts in this sprint:

| Artefact | File |
|---|---|
| Security rules for the six collections (+ `hasExplicitTenantRule` list) | `firestore.rules` |
| TTL policy + index exemption | `firestore.indexes.json` (`fieldOverrides`) |
| Data migration / backfill (idempotent, dry-run by default) | `scripts/backfill-heat-zone.mjs` (`npm run backfill:heat-zone[:apply]`) |
| Permission keys on built-in roles | `src/data/defaultRoles.js`, `functions/lib/defaultRolePermissions.json` |

## Historical recalculation

* Any report change → that projection is recomputed from the **current** source record.
* Boundary create/update/delete → `zonesVersion` bump + full department rebuild (district assignment
  of past calls changes).
* Time-zone change in the department profile → run `heatZoneRebuild` (Settings → Recalculate) or the
  backfill script; see known-limitations.md.
