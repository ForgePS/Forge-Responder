# Interactive Fire Preplans & SmartPlan AI — Repository Discovery

Status: discovery complete, foundation in progress · 2026-11-24 · branch `feat/interactive-preplans`
Spec: "Forge Responder — Interactive Fire Preplan Management & SmartPlan AI, Master Single-Sprint Instructions" (§1–36).

The most important finding: **Forge already has a working preplan module.** It has records, revisions,
review/approve/publish, buildings, files, verifications, QR tokens, restricted answers, an offline draft
queue and field-app plan screens. The spec's "do not create redundant systems" rule means this work
**extends that module**. It does not add a second one. Like the EMS discovery, the spec is written for a relational
stack; §2 maps it onto Firestore.

---

## 1. Stack (unchanged from `docs/ems/REPOSITORY_DISCOVERY.md` §1)

React 19 + Vite 8 (JSX + JSDoc, no TypeScript), lucide-react, own CSS theme · Firebase Cloud Functions v2
(Node 22) · Cloud Firestore under `departments/{departmentId}/…` · Cloud Storage `departments/{id}/**` ·
Firebase Auth · Leaflet 1.9 (npm, no plugins) · Forge AI on Anthropic (`@anthropic-ai/sdk`, JSON-schema
output, server-only) · `node:test` + rules emulator tests · GitHub Actions CI. Navigation is state-based
(`current` page name, synced to `?page=`), not a router.

## 2. Spec model → Forge model

| Spec (§23) | Forge |
|---|---|
| `preplans`, `preplan_versions` | **Exist**: `preplans`, `preplanRevisions` (draft → in_review → approved → published → superseded). Published revision stays readable while a new one is drafted (`publishedRevisionId` vs `currentRevisionId`) |
| `preplan_buildings` | **Exists**: `preplanBuildings` (name, sortOrder). Extended with footprint + floors |
| `preplan_floors` | **New**: `preplanFloors` (building, kind, level, sortOrder) |
| `preplan_objects`, `preplan_layers`, `preplan_geometries` | **New**: `preplanFloorPlans/{revisionId}__{floorId}`, one doc per floor per revision holding structured `objects[]` + `layers[]` (≤ 2,500 objects, fits the 1 MiB doc limit). Superseded `preplanDiagrams.symbolsPlaced` checklist stays readable |
| `preplan_georeferencing` | Field `alignment` on the floor plan doc (transform, control points, RMS error, status unverified/verified) |
| map features | **New**: `preplanSiteMaps/{revisionId}`: GeoJSON-style features (footprints, boundary, annotations, symbols) in WGS84 |
| `preplan_symbol_definitions` | **Exists**: `preplanSymbolLibraries` (custom symbols); starter catalog in code (`src/lib/preplans/symbolCatalog.js`) |
| `preplan_templates` | **Exists**: `preplanTemplates` + immutable `preplanTemplateVersions` |
| `preplan_operational_alerts` | **New**: `preplanAlerts` (current state, *not* versioned with geometry) |
| `preplan_inspection_finding_links` | **New**: `preplanFindingLinks` |
| `preplan_change_events` / review tasks | **New**: `preplanReviewTasks`, deterministic id `{source}-{sourceId}-{fingerprint}` (idempotent) |
| `preplan_field_observations` | **New**: `preplanObservations` (never becomes a violation automatically) |
| `preplan_source_uploads`, `preplan_conversion_jobs`, `preplan_detected_objects` | **New**: `preplanConversions` (job + proposals). The source file stays in `preplanFiles` and is never overwritten |
| `preplan_media_links` | **Exists**: `preplanFiles` (+ `objectId` link) |
| `preplan_shares` (mutual aid) | **Deferred**: needs server-side cross-tenant read callable (see §8) |
| `preplan_offline_packages` | Field app IndexedDB (`src/field/fieldDb.js`) + `fieldPlanFiles.js` |
| `preplan_audit_events` | **Exists**: `auditLogs` via `writeInspectionAuditLog` (module "Preplans") |
| Composite tenant FKs | The path is the tenant; rules use `canAccessDepartment` / `canManageModule`. Child ids are validated in services |
| Immutable publication | Rules: floor plan / site map docs are writable only while their revision is `draft`, `in_review` or `returned` (`get()` on the revision) |
| Optimistic concurrency | `version` counter checked in a Firestore transaction on save |
| Migrations | None needed: new collections are additive. `preplan*` collections are gated by the existing `preplans` module prefix (`functions/lib/moduleCatalog.js` COLLECTION_PREFIX_MODULES) |

## 3. Reuse map

| Need | Reuse |
|---|---|
| Occupancy | `occupancies/{id}` (`src/lib/inspections/occupancyService.js`). Authoritative for name, address, lat/lng, type, hazard, construction, sprinkler/alarm/Knox text, contacts. **No station/district fields** exist on occupancies; those stay on the preplan |
| Occupancy UI | `src/pages/OccupanciesMasterPage.jsx` detail panel (no tabs). Add a Preplans section; "New Preplan" button already exists |
| Inspections | `inspections/{id}` (`occupancyId`), `violations/{id}` (status open → corrective_action_submitted → closed/dismissed), evidence photos. "Create / Update Preplan" already exists on `InspectionWorkspace` |
| Fire protection | `fireProtectionSystems` (`status: impaired`, `activeImpairmentId`), `fpsImpairments` (active/restored). **Verified impairments are the authoritative source** for "current system impairment" alerts |
| Hydrants | `hydrants/{id}` (`hydrantTenantService.js`), fields flow_gpm, static_psi, residual_psi, last_checked, status. Preplans already store `hydrantIds[]` |
| Satellite | Esri World Imagery tile service already used keyless in 3 maps. Wrap it in one provider registry with attribution and a "not live imagery" note |
| AI | Forge AI capability registry (`functions/lib/forgeAi/`); vision extraction pattern from Digital Forms (`functions/lib/digitalForms/extract.js`, server-chosen upload path, size + signature checks, daily reservation) |
| Files | `uploadFirebaseFile` (`src/lib/firebaseClient.js`), `ObjectUploadField`, storage rule `departments/{id}/**` |
| CAD | `cadCoordinates()` / `parseCadPayload` (`src/lib/neris/cadImport.js`), Active911 alerts with lat/lng, `normalizeAddressKey()` (`src/lib/alertDashboard.js`) |
| Notifications | `createNotification` (`src/lib/notificationService.js`), `sendTextEmail` (server) |
| Permissions | 16 preplan keys exist (`viewPreplans … viewPreplanAudit`). Spec's dotted names map onto these (§5) |
| Feature flags | `inspectionSettings/main.preplanFeatures` (floorPlans, sitePlans, mapIntegration, offlineAccess, …) + platform allowlist |

## 4. Gaps found

1. Nothing reacts to occupancy, inspection or violation writes (no triggers). Change-driven review tasks need new Firestore triggers.
2. Floor plans are a symbol checklist only. There is no geometry (`STARTER_PREPLAN_SYMBOLS`: "no CAD geometry in MVP").
3. "Nearby Preplans" and "QR Scan" menu items are hidden as not built.
4. Storage has no content-type check on the generic department path; SmartPlan sources need a typed path like `formImports`.
5. Map tile URLs are hard-coded in three files; no offline tile caching exists (and Esri's terms limit offline caching, so it stays off).
6. Field-app inspection form object lacks `occupancyId`.

## 5. Permissions mapping (spec §25 → existing keys)

Forge permission keys are camelCase `verbNoun`; the spec's dotted names are mapped, not added verbatim.

| Spec | Forge key |
|---|---|
| preplans.view, preplans.response.view | `viewPreplans` |
| preplans.create / edit / geometry.edit / survey | `createPreplans` / `editPreplans` |
| preplans.review | `reviewPreplans` |
| preplans.approve, preplans.publish | `approvePreplans` |
| preplans.archive | `archivePreplans` |
| preplans.smartplan.upload / convert / review | `uploadPreplanFiles` (upload) + `editPreplans` (convert, review proposals) |
| preplans.alerts.create | `editPreplans` or `editInspections` (reported) |
| preplans.alerts.review / resolve | `approvePreplans` |
| preplans.inspections.view / link | `viewInspections` / `editInspections` |
| preplans.symbols.manage, templates.manage, settings.manage | `managePreplanConfig` |
| preplans.audit.view | `viewPreplanAudit` |
| preplans.share, offline.download, export | deferred with their features |

Draft editing (`editPreplans`) stays separate from approval/publication (`approvePreplans`), and the rules
enforce it (`movesToStatus`).

## 6. Security risks

- Building plans are sensitive. Every new collection gets an explicit rule and joins `hasExplicitTenantRule`; cross-tenant rules tests are required.
- Uploaded drawings and extracted text are untrusted. The AI call is server-side, the output is JSON-schema-constrained, every object is re-validated by `normalizeFloorObject` and stored as `pending`. Document text never becomes instructions.
- SVG import parses geometry with a whitelist and never renders the uploaded SVG.
- Download URLs from `getDownloadURL` are long-lived tokens (existing platform posture, already noted in `storage.rules`). Short-lived signed URLs would be a platform-wide change.
- QR access must resolve through sign-in (existing tokens are not redeemed yet).

## 7. Implementation sequence

| # | Slice | Status |
|---|---|---|
| 1 | Pure libraries: symbol catalog, floor plan model (validation, edit ops, undo/redo, publication checks), georeferencing (similarity/affine fit, RMS error) + unit tests | **Done** |
| 2 | Firestore services: floors, floor plans (transactional save, carry into new revision), site map; rules + rules tests | In progress |
| 3 | Floor plan editor (SVG canvas, palette, inspector, layers, floors, undo/redo, autosave) in the preplan workspace | |
| 4 | Satellite site map (provider registry, basemap switch, footprint/annotation drawing, hydrant layer, measurement) | |
| 5 | Response view (published revision only, alerts separate, verification dates, read-only, high contrast) | |
| 6 | SmartPlan: typed upload path, overlay mode, deterministic SVG/DXF vector import, raster line detection, Forge AI vision proposals, review workspace | |
| 7 | Alerts + finding links + review tasks (occupancy/inspection triggers), occupancy and inspection UI entry points | |
| 8 | Publication gate (critical features verified, no pending proposals) wired into `publishPreplanRevision` | |
| 9 | Field survey, offline packages, mutual aid, 3D, reporting, change detection | Later sprints |

## 8. Out of scope for this sprint (documented, not simulated)

- **DWG** needs a licensed parser or conversion service; not selected without approval. **HEIC/TIFF** need server-side conversion (not yet built). **PDF** pages need `pdf.js` (new dependency, to be evaluated).
- **Mutual aid sharing** needs a server-side cross-tenant read path with per-request authorization; the default posture stays strict isolation.
- **3D visualization**: optional per spec; 2D stays fully functional without it.
- **Offline map tiles**: Esri World Imagery terms restrict offline caching; offline packages will carry geometry, not imagery.
- **NFPA 1660**: features support pre-incident planning practice; no compliance is claimed.
