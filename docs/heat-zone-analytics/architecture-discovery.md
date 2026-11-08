# Heat Zone Analytics — Architecture Discovery

Sprint 01 · inspected 2026-11-08 on `main` @ `64e935c` (branch `feat/heat-zone-analytics`).

This document records what the existing Forge Responder platform provides, what it does not, and the
decisions taken where the sprint brief assumed capabilities that are not present.

## 1. Platform summary

| Area | What exists | Where |
|---|---|---|
| Frontend | React 19 + Vite 8, no router library (page = React state keyed by nav label, synced to `?page=<slug>`) | `src/App.jsx`, `src/lib/pageUrl.js` |
| UI system | CSS tokens (`--rms-*`, light/dark), shared `Panel`, `Badge`, `MiniTable`, `FleetSummary`, `Modal`; module page skeleton `.module-page > .module-heading`, `.segmented-control` tabs, CSS bar charts (`.inspection-chart-*`) | `src/theme/tokens.css`, `src/components/shell/ui.jsx`, `src/styles.css` |
| Charts | **No chart library.** Charts are CSS bars / CSS conic donuts | `src/pages/InspectionReportsPage.jsx` (`ChartBars`) |
| Maps | **Leaflet 1.9.4 only** (imported directly, canvas renderer, Esri World Imagery tiles). No heat, cluster or turf plugins | `src/pages/HydrantTestingPage.jsx`, `src/field/screens/HydrantMap.jsx` |
| Backend | Firebase Cloud Functions **v2 API**, Node 22; thin wrappers in `functions/index.js` over testable `functions/lib/*` modules taking `(db, request)` | `functions/` |
| Database | **Cloud Firestore** (no PostgreSQL / PostGIS). "Migrations" in this codebase are Firestore rules + indexes + idempotent backfill scripts | `firestore.rules`, `firestore.indexes.json`, `scripts/` |
| Tenancy | A tenant is a **department**: everything lives under `departments/{departmentId}/…`. Membership `departments/{d}/users/{uid}` (`status: "active"`) | `src/lib/tenantPaths.js` |
| Tenant resolution (client) | `TenantContext` (`useTenant()`), gateway slug / membership | `src/context/TenantContext.jsx` |
| Tenant resolution (server) | Callables take `departmentId` as *input* and **verify** it server-side via membership lookups. No custom claims | `functions/lib/access.js` |
| Roles & permissions | Flat boolean permission map. Built-in roles (creator, fireChief, battalionChief, companyOfficer, firefighter, readOnly, itAdmin) + custom roles + per-user overrides. Server mirror computes `memberGrants/{uid}` used by rules | `src/data/defaultRoles.js`, `src/data/creatorPermissions.js`, `src/data/adminRegistry.js`, `functions/lib/memberGrants.js`, `functions/lib/defaultRolePermissions.json` |
| Row security | Firestore rules: `canAccessDepartment`, `memberCanAny(departmentId, keys)`, `canManageModule`; every explicit collection must be listed in `hasExplicitTenantRule()` | `firestore.rules` |
| Module entitlements | Module key per nav item (`NAV_MODULE_MAP`), server-computed `platformEntitlements/{d}.modules`. An `analytics` module key already exists | `src/data/adminRegistry.js`, `functions/lib/entitlements.js` |
| Audit logging | `departments/{d}/auditLogs` (client helper `writeAuditLog`; server writes inline). Append-only in rules | `src/lib/auditService.js` |
| Real-time | Firestore `onSnapshot` (lists via `useTenantPersistentState`). No websockets / pub-sub | `src/hooks/useTenantPersistentState.js` |
| Event processing | `onDocumentWritten` triggers (entitlements, member grants, messages). Idempotency by "recompute and compare" | `functions/index.js` |
| Exports | CSV helpers, `xlsx` (SheetJS) in the client, HTML print popups for PDF. `pdfkit` exists only in functions | `src/utils/dashboardMetrics.js`, `src/lib/downloadTextFile.js`, `src/lib/hydrantActivityExport.js` |
| Tests | `node --test` unit tests; emulator-backed rules and functions tests (Java 21 + firebase-tools present) | `tests/` |

## 2. Calls-for-service data — what actually exists

The brief assumes a CAD calls-for-service table with patrol beats, dispositions and call statuses.
**Forge Responder is a fire/EMS RMS; no calls-for-service / CAD collection exists.** Findings:

1. **NERIS incident reports are the only authoritative incident records.** Stored as a tenant list
   `departments/{d}/lists/hlfd-rms-neris-fire-reports` — either an `items/{docId}` sub-collection
   (`storage: "items"`, current format) or a legacy `items: []` array on the header doc.
   Created/edited by the RMS report editor, the CAD import modal, and the Field app (`syncIncident`).
2. **Active911 alerts** (`hlfd-rms-active911-alerts`) are a rolling 25-alert window that is replaced on
   every sync. They keep no history and cannot serve as a call archive.
3. `departments/{d}/incidents` is declared in rules/catalog but **nothing reads or writes it**.

Field mapping available on a NERIS report (no fields were invented):

| Analytics concept | Source field(s) | Notes |
|---|---|---|
| Call time | `workspace.cad.receivedTime` → `dispatchTime` → earliest `workspace.units[].dispatchTime` → `incidentDate` | Local wall-clock strings (`YYYY-MM-DDTHH:mm[:ss]`) read in the department time zone |
| Coordinates | `workspace.location.latitude/longitude` (also `report.latitude/longitude`, `location.lat/lng`) | **Only demo data carries coordinates today.** The editor has no lat/lng input and CAD import dropped them (fixed this sprint, see §5) |
| Address | `incidentAddress` (one line) | Used for repeat-location analysis |
| Classification | `modules.core_mod_incident.incident_final_type[0]` (NERIS code, e.g. `FIRE: STRUCTURE_FIRE: …`) → `incidentTypeSummary` → `disciplines[0]` | Category = first code segment |
| Priority | `workspace.cad.priority` | Emergency / Urgent / Routine / Non-emergency or raw CAD value |
| Disposition | `core_mod_incident.incident_noaction`, `workspace.ems.disposition`, `mod_medical.medical_disposition`, `incident_actions_taken` | **No incident-level disposition field**; derived (see database-schema.md) |
| Status | `status` (Draft … Submitted) | Report workflow status — the only status that exists |
| Unit type | `workspace.units[].apparatusType` | |
| Station | `workspace.units[].station` | |
| Response time | dispatch → first arrival (CAD-level times, else earliest unit times) | Same rule as `src/lib/neris/analytics.js` `extractIncidentTimings` |
| District / beat / zone | **Not present on reports** | Derived by point-in-polygon against new tenant boundaries (§4) |
| Void / delete | No void flag. Drafts are hard-deleted from the list | Deletes are handled; `voided`/`status: "Voided"` honoured if ever present |

Tenant time zone: `departments/{d}/profile/main.timezone` (IANA, default `America/Chicago`).

## 3. Geographic data — what exists

* Stations: names/addresses only, **no coordinates** (`profile.stationDetails[]`).
* Water districts: GeoJSON polygons for hydrant ownership (`waterDistricts`) — a different concept,
  not reused for call districts. Point-in-polygon helpers exist in `src/lib/hydrantDamage/geo.js`
  (ported to the server for this module).
* **No districts, patrol beats, response zones, first-due polygons or department boundary exist.**

## 4. Decisions (smallest compatible solution)

| Brief requirement | Decision | Why |
|---|---|---|
| PostgreSQL/PostGIS, migrations | Firestore collections + rules + indexes; a rebuild callable/backfill acts as the data migration | Firestore is the only database. Adding Postgres would create a second database |
| "Calls" source | NERIS incident reports (both list storage formats) | Only authoritative incident records |
| No second authoritative DB | `heatZoneCalls` is a **derived, server-only read model** (projection). It can be dropped and rebuilt from the source list at any time (`heatZoneRebuild`) | Firestore cannot aggregate/filter nested list items efficiently; a flat projection gives indexed date-range reads |
| Districts / patrol zones | New tenant-scoped boundaries `heatZoneZones` (kind `district` or `zone`; GeoJSON upload), managed in the module's Settings tab. Fire terminology: "patrol zone" is labelled **Response zone** | No boundary data exists; brief says not to invent fields |
| Geographic aggregation (PostGIS) | Server-side grid binning by zoom level + server-side marker clustering | No PostGIS. Browser never receives the full record set |
| Heat map rendering | Custom Leaflet canvas heat layer (blue→green→yellow→orange→red) — no new npm dependency | Leaflet already present; avoids a plugin dependency |
| Charts | CSS bar charts matching existing `.inspection-chart-*` styling | No chart library in the app |
| Near-real-time | `onDocumentWritten` trigger on the report items (+ legacy array header) → idempotent projection upsert → bumps `heatZoneMeta/state.version`; dashboards `onSnapshot` that single doc (rules-gated) and refetch | Reuses existing trigger + snapshot patterns |
| Permissions | 7 new permission keys in the existing permission system; "assigned districts" stored per member in `heatZoneAccess/{uid}` | Reuse roles/overrides/memberGrants |
| Module gate | Reuse existing `analytics` module key | No new plan/catalog key needed |
| Exports | CSV + XLSX (existing SheetJS) + printable PDF (existing print-popup pattern) built from server-authorized report payloads; every export audited server-side | Existing capabilities |
| Caching | Per-instance in-memory cache keyed by department + data version + caller scope + filters | No shared cache (Redis etc.) exists |

## 5. Small extensions to existing code

* `src/lib/neris/cadImport.js`: CAD latitude/longitude aliases are now mapped into
  `workspace.location`, so imported CAD runs become mappable. Without this, live (non-demo) departments
  would have nothing to plot.

## 6. Blockers / unavailable integrations

* **Live coordinates:** reports created in the editor without CAD coordinates have no lat/lng.
  They are counted in every statistic and chart but cannot appear on the map ("unmapped" count is shown).
  Geocoding addresses would need the Google Geocoding callable (`googleGeocode`) to be configured per
  department and is out of scope for this sprint — see known-limitations.md.
* **True CAD feed:** there is no CAD webhook or call archive; when one is added, it should write into
  the same projection via `functions/lib/heatZone/projection.js`.
