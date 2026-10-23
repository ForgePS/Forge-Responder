# Hydrant Damage Reporting — Deploy & Rollback

Live app: https://rms.forgepublicsafety.com  
Firebase project: `rms-dashboard-7562e`

## Deploy hosting

```powershell
npm run build
firebase deploy --only hosting
```

## Deploy email + utility portal functions

```powershell
firebase deploy --only functions:sendHydrantDamageReport,functions:hydrantDamageAckPortalView,functions:hydrantDamageAckPortalSubmit
```

### SendGrid (required for real email)

Set environment variables on the Cloud Functions / Cloud Run service for `sendHydrantDamageReport`:

- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL` (verified sender)

Until configured, send returns `accepted: false` / `not_configured` and the UI never fakes **Sent**.

Optional:

```powershell
firebase functions:secrets:set SENDGRID_API_KEY
firebase functions:secrets:set SENDGRID_FROM_EMAIL
```

Then bind secrets on the function and redeploy (or set plain env vars on the Cloud Run revision).

## Firestore rules

```powershell
firebase deploy --only firestore:rules
```

Ack tokens live in top-level `hydrantDamageAckTokens/{tokenId}` with **no client access** (Admin SDK only).

## Utility acknowledgment portal

- Public URL pattern: `/utility-ack?t=<tokenId>.<secret>`
- Issued when SendGrid accepts a damage-report email
- Expired / invalid tokens are denied
- Portal never exposes `internalNotes`
- Utility “repair completed” queues FD verification (does not auto-close)

## Offline drafts

- Queued in `localStorage` key `forge-hydrant-damage-offline-drafts-v1`
- Sync creates/updates Firestore drafts only
- **No offline email send**

## Rollback

1. **Hosting:** redeploy previous hosting release from Firebase console → Hosting → Release history → Rollback  
   or check out the prior git commit and `npm run build; firebase deploy --only hosting`.
2. **Functions:** redeploy the previous functions codebase from git, or delete the new portal callables if needed.
3. **Rules:** redeploy the previous `firestore.rules` from git.
4. **Data:** damage reports, acknowledgments, and districts remain in Firestore; do not bulk-delete unless intentional. Historical `waterCompany*` / `waterDistrict*` snapshots on sent reports are preserved on the report docs themselves.

## Smoke checklist

1. Create draft from hydrant → Report Damage  
2. Assign company / resolve ownership  
3. Preview PDF  
4. Send (expect failure until SendGrid configured; never fake Sent)  
5. Open `/utility-ack?t=…` from a issued link after a successful send  
6. Bulk create from Damage Analytics  
7. Go offline → save draft → reconnect → sync
