# Heat Zone Analytics — Deployment Guide

## Prerequisites

* Node 22, firebase-tools (repo devDependency), Java 21 for emulator tests.
* No new npm dependencies, secrets or environment variables. (Leaflet and SheetJS were already present.)

## Release gate

Run all of these and require **0 failures** (the cross-tenant tests are release blocking):

```bash
npm run test:unit
```
```bash
npm run test:rules
```
```bash
npm run test:functions
```
```bash
npm run lint
```
```bash
npm run build
```

## Order of deployment (staging first, then production)

The new rules only *add* collections, and the new functions only *read* existing data, so deploying
in this order never breaks the running app.

1. **Rules + indexes / TTL policy**
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes --project staging
   ```
   `firestore.indexes.json` adds a TTL policy on `heatZoneEvents.expireAt` and an index exemption on
   `heatZoneZones.geometryJson`. TTL policies can take a while to become active; nothing depends on it.

2. **Functions** (triggers + callables)
   ```bash
   firebase deploy --only functions:heatZoneOnReportItem,functions:heatZoneOnReportList,functions:heatZoneDashboard,functions:heatZoneMarkers,functions:heatZoneIncident,functions:heatZoneBoundaries,functions:heatZoneReport,functions:heatZoneGetSettings,functions:heatZoneSaveZones,functions:heatZoneDeleteZone,functions:heatZoneSaveSettings,functions:heatZoneSetDistrictAccess,functions:heatZoneRebuild --project staging
   ```
   (Or `npm run deploy:staging`, which deploys everything.)

3. **Data migration (backfill)** — builds projections for existing reports. Dry run first:
   ```bash
   npm run backfill:heat-zone
   ```
   then apply (PowerShell; set the target project first):
   ```bash
   npm run backfill:heat-zone:apply
   ```
   Uses Application Default Credentials and `GOOGLE_CLOUD_PROJECT`. Safe to re-run.

4. **Member grants** — the rules check `memberGrants` for the live-update listener. Existing members'
   grants refresh when their membership or role changes; to refresh everyone now:
   ```bash
   npm run backfill:memberships
   ```
   or `node scripts/sync-member-grants.mjs --apply` with `GOOGLE_CLOUD_PROJECT` set.
   Stored custom roles keep their saved permissions: grant the Heat Zone keys to custom roles in
   **System Admin → Permissions → Roles** if needed. Built-in roles get the defaults in tenant-security.md.

5. **Hosting**
   ```bash
   npm run build:staging
   ```
   then deploy hosting as usual (`firebase deploy --only hosting --project staging`).

6. **Per-department setup** (an administrator with *Manage Heat Zone settings*):
   * Heat Zone Analytics → Settings → import district / response-zone GeoJSON.
   * Assign districts to members who do not have *View all districts*.
   * Optionally adjust priority weights / high-priority list.

## Development data (never production)

```bash
npm run seed:heat-zone-dev
```
Adds sample boundaries labelled "(sample)" to `forge-demo` (emulator) or `staging-east/west`
(staging) and refuses to run against any other project. Demo incidents themselves come from the
existing demo seed (`src/data/demoNerisReports.js`).

## Local run with emulators

```bash
npx firebase emulators:start --only auth,firestore,functions --project demo-forge-rms
```
```bash
npm run dev:emulator
```

## Rollback

* Hosting: redeploy the previous release (nav item disappears).
* Functions: `firebase functions:delete heatZone… --project <p>` — the source report list is
  untouched; `heatZone*` collections can be left in place or deleted (they are derived data).
* Rules: previous `firestore.rules` (the new collections are then caught by the tenant catch-all
  only if their names are removed from `hasExplicitTenantRule`, so roll back the whole file).

## Operational notes

* Cost: one projection write per report change (+1 meta write); dashboard reads ≈ number of reports
  in the selected range (×2 with history comparison), cached for 5 minutes per instance and version.
* Live updates: expected end-to-end latency is ~2–6 s (trigger cold start can add a few seconds).
