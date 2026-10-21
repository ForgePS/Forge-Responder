# Fleet Module — Deployment & Rollback

## Deploy (hosting + rules)

From repo root:

```powershell
npm run build
firebase deploy --only hosting,firestore:rules
```

Optional indexes:

```powershell
firebase deploy --only firestore:indexes
```

- Project: `rms-dashboard-7562e`
- Live: https://rms.forgepublicsafety.com

## Pre-deploy checklist

1. `npm run build` succeeds.
2. Run **Fleet Hardening** → save snapshot.
3. Confirm no open offline conflicts on critical stations.
4. Review Migration Center if cutover flags will change.

## Rollback

### Hosting-only rollback

1. Firebase Console → Hosting → Release history → roll back previous version  
   **or** redeploy a known-good git tag:

```powershell
git checkout <known-good-tag>
npm run build
firebase deploy --only hosting
```

### Rules rollback

Redeploy prior `firestore.rules` from the last good commit:

```powershell
git checkout <known-good-tag> -- firestore.rules
firebase deploy --only firestore:rules
```

### Data / cutover rollback

1. Turn **off** `redirectApparatusToFleetAssets` and `legacyApparatusWritesLocked` in Fleet settings.
2. Classic Apparatus list remains authoritative for day-to-day until re-cutover.
3. Do **not** delete `fleetAssets` — Migration Center imports are additive; aliases preserve links.

### Offline queue

Clear or resolve conflicts under **Fleet Hardening → Offline**. Queued mutations are device-local (`localStorage`).

## Evidence

Hardening snapshots store under `departments/{id}/fleetHardeningChecks/{id}` with audit events.
