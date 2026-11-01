## Documents, communications, platform architecture, security and quality

### Inventory
| Page / feature | Where (file) | Status (1-7) | One-line note |
|---|---|---|---|
| Documents library (SOGs / Policies, EMS Protocols, Forms, Uploads) | `src/pages/SprintModulePages.jsx:55` | 2 | Real per-department list (`hlfd-rms-documents`), upload to Storage, archive/restore, soft delete. Non-demo departments start empty (`src/data/tenants/index.js:27`). |
| Document upload / attach / replace file | `SprintModulePages.jsx:135`, `ObjectUploadField.jsx:30` | 1 | Writes to `departments/{id}/...` in Storage, then saves the record. 12 MB limit. |
| Delete document | `SprintModulePages.jsx:125` | 2 | No confirmation. The Storage file is deleted before the record save, so a failed save leaves a record pointing at a missing file. |
| Edit title / version / category after upload | — | 6 | Not possible. No version history; "Replace file" overwrites with no record of the old one. |
| Acknowledgements | `SprintModulePages.jsx:98`, `src/lib/documentAcknowledgement.js` | 2 | Each person's acknowledgement is saved, but there is no "who hasn't acknowledged" report or reminder, and any member can edit the stored acknowledgements (see Security). |
| "SOGs / Policies" menu item | `src/data/sprintModuleSeeds.js:63` | 2 | Opens filtered to "SOG" only, so documents tagged "Policy" are hidden until the user clicks Policy. |
| Messages (department inbox) | `src/pages/InternalEmailBoardPage.jsx`, `src/components/InternalEmailBoard.jsx`, `src/lib/internalEmailService.js` | 3 | Send, read, delete and groups work. The page passes no `onMessage`, so every success or error notice is silent. No live refresh, no notification. Private messages are hidden only on screen. |
| Messages tab inside Creator Console | `CreatorConsolePage.jsx:330` | 2 | Same component, with notices wired. |
| Digital Dashboard: Devices | `src/components/digitalDashboard/DigitalDashboardPanel.jsx` | 5 | The "x/y online" count comes from a status picked by hand in a dropdown (`src/lib/digitalDashboard.js:82`). There is no device heartbeat. |
| Digital Dashboard: Media, Playlists, Publish (schedules) | `DigitalDashboardPanel.jsx`, `AddMediaModal.jsx` | 5 | Records save, but nothing plays them. The only screen a TV can open is the public alert page, which ignores `playerMode: "signage"`, playlists and schedules. The preview works only inside the admin page. |
| Digital Dashboard: Alert Dashboard settings + per-display URL | `AlertDashboardSettingsPanel.jsx`, `DisplayAlertUrlField.jsx` | 1 | Builds public `/{gateway}/alerts?display=` URLs. |
| Active911 integration | `functions/index.js:215-303`, `functions/lib/active911Store.js` | 2 | Real Open API sync of the last 25 alerts. Only a platform creator can connect it (`assertPlatformSuperAdmin`), so a department cannot set it up on its own. |
| Public alert dashboard (no sign-in) | `src/pages/PublicAlertDashboardPage.jsx`, `functions/lib/alertDashboardPublic.js` | 2 | Works, but has no on/off switch, starts an Active911 sync on viewer requests, and exposes full alert text (see Security). |
| Google APIs / JotForm panels (Integrations tab) | `GoogleApisIntegrationPanel.jsx`, `DamageFormJotformIntegrationPanel.jsx` | 2 | Server-side secrets. The Google key can be used publicly through a gateway slug. |
| Media gallery sources (Pixabay, social) | `GallerySourcePanel.jsx:33`, `SocialSourcePanel.jsx` | 5 | Without `VITE_PIXABAY_API_KEY` it shows curated samples. Several source tabs are disabled. |
| Creator Console | `src/pages/CreatorConsolePage.jsx` | 2 | Real panels for departments, modules, subscriptions, usage, audit and security. The page gate (`manageDepartments`) is checked only in the browser; Firestore rules are the real guard. |
| Analytics (same menu group) | `SprintModulePages.jsx:402` | 5 | The 30/60/90/YTD buttons change only the CSV file name, not the data. |
| `AlertDashboardPage.jsx`, `HornLakeHydrantApp.jsx` | `src/pages/` | 7 | Nothing imports them. |
| `OccupanciesPage`, `PreplansPage` in SprintModulePages | `SprintModulePages.jsx:363,390` | 7 | Never used. App imports `PreplansPage` from `PreplansModulePages.jsx` instead. |

### Architecture inventory
- **Stack:** React 19.2.7, Vite 8.0.16, Firebase JS SDK 11, lucide-react, Leaflet, xlsx, jszip, qrcode. Cloud Functions v2 (`firebase-functions` 6, Node 22, CommonJS) with `@anthropic-ai/sdk`, `twilio`, `pdfkit` and `google-auth-library`. No TypeScript and no router library.
- **Routing:**
  - One `current` string in `src/App.jsx`, a 1,988-line file with a long chain of `current === "X"` checks (~1550–1846).
  - Pages are lazy-loaded (50 `lazyPage` imports).
  - `src/main.jsx` checks the URL path before the app shell, sending public paths to the alert dashboard and the utility acknowledgement portal.
  - Department is chosen by gateway slug or subdomain (`VITE_TENANT_SUBDOMAINS`).
- **Data:**
  - Most modules use department "lists" at `departments/{id}/lists/{key}`, which come in two formats: the older single record holding an `items` array, and the newer per-item form with a `{storage:"items"}` header and an `items/` subcollection (`src/lib/tenantListStore.js`, `listItemsPlan.js`). Rules refuse array writes once a list has moved to per-item.
  - The migration has been run (`lists-migration.txt`, APPLY).
  - `App.jsx` opens 28 list subscriptions at sign-in for every user, whatever their permissions.
  - Newer modules (fleet, inspections, preplans, hydrants) use their own Firestore collections.
- **Cloud Functions:** 69 exports in `functions/index.js`, with 33 helper modules in `functions/lib`.

| Purpose | Functions |
|---|---|
| SMS | `sendShiftBroadcastSms`, `pingTwilioConfig` |
| Active911 | connect, disconnect, status, sync (4) |
| Google | `googleApisGetStatus/GetClientConfig/Save/Clear`, `googleGeocode`, `googleDirections`, `googlePlacesLookup` |
| Public dashboard | `alertDashboardPublicView` |
| JotForm / hydrant damage | `jotformDamageWebhook`, get/save setup, PDF, sync, `sendHydrantDamageReport`, ack portal view/submit, `sendHydrantDailyActivityEmail` |
| FORGE Academy hub | 22 `wrapAcademy` callables, `resolveForgePersonIdentity`, `trainingRegisteredWebhook`, `trainingCompletedWebhook` |
| Invites / domains | create, revoke, accept, preview invite; register domain; domain status |
| Billing / entitlements | `billingLifecycleDaily` (scheduled), `previewBillingLifecycle`, 6 `entitlementsOn*` triggers, `refreshEntitlements` |
| Platform | `departmentUsage`, `exportDepartmentData`, `resetTwoFactor`, `sendTestEmail`, `sendAccountVerificationEmail` |
| AI | `draftNerisNarrative` (Anthropic, secret `ANTHROPIC_API_KEY`) |

- **Integrations:**
  - Email uses Resend (`RESEND_API_KEY` secret) for invites and billing, but SendGrid (`process.env.SENDGRID_API_KEY`, not a declared secret) for hydrant damage reports (`functions/index.js:860`). That is two email providers.
  - Twilio (secrets), Active911 Open API, Google Maps/Places/Directions (per-department key in `integrations/`), JotForm webhook and API, FORGE Academy hub, Pixabay (client key).
- **Error handling and logging:** one top-level `ErrorBoundary`, 179 `console.error/warn` calls, and save-failure banners from `notifySaveFailed`. There is no error reporting service and no App Check enforcement on callables.
- **Build and deploy:**
  - `firebase.json` has a single hosting target `app` (SPA rewrite, immutable `/assets`).
  - `.firebaserc` sets prod `rms-dashboard-7562e` and staging `forge-rms-staging`, with `deploy:staging` and `seed:staging` scripts.
  - There are no preview-channel scripts.
- **CI:** `.github/workflows/ci.yml` runs on every push and PR: lint, build, a Functions load check, unit tests, and rules and functions tests in emulators. It does not deploy.
- **Tests:**
  - 23 unit files (~120 tests).
  - Rules: 1 file, ~82 tests (Firestore and Storage).
  - Functions: 7 files, ~57 tests.
  - Nothing covers Messages, Documents, Digital Dashboard or the Academy webhooks.

### Findings
- **[Demo-blocker] Active911 dispatch alerts are readable by anyone on the internet**
  - `isPublicAlertList` makes `hlfd-rms-active911-alerts` (and `dd-displays`, the business directory and the dashboard config) readable with no sign-in, for every department (`firestore.rules:364`). `alertDashboardPublicView` also returns the full alert records.
  - Those records include call description, address, cross street and responder `responses` (`functions/lib/active911Client.js:107`).
  - `rmsGateways` is `read: if true`, so slugs can be listed. There is no per-department switch to turn the public page off.
  - A rules test asserts this behaviour (`tests/rules/firestore.rules.test.mjs:178`).
  - Fix: serve only a trimmed public feed (address, type, time) through the function, gated by a "public dashboard enabled" flag plus a display token. Close direct list reads.
  - Effort: M
- **[High] Academy webhooks accept anything when no secret is set**
  - `assertAcademyWebhookSecret` returns `true` when no secret is configured (`functions/index.js:755`). The two public webhooks then write training records into whatever department the payload names, with no sign-in.
  - Fix: fail closed and require a secret. Effort: S
- **[High] Academy hub secrets are stored where every member can read them**
  - `forgeAcademy.hubBearerToken` and `hubSecret` are saved in `departments/{id}/settings/main` (`DepartmentConfigPanel.jsx:265`), which any member can read (`settings` read is `canAccessDepartment`). This contradicts the rules comment "Secrets live in integrations/".
  - The browser also calls the hub with that token directly (`src/lib/forgeHubIdentity.js:48`).
  - Fix: move the secrets to `integrations/academy` and make the hub calls from the server. Effort: M
- **[High] Any member can read and change every message, document and alert**
  - `internalEmails` falls through to the catch-all rule (`firestore.rules:1104`), so every member can read every message, including direct ones, and edit or delete them or fake `fromUid`.
  - The documents list (`canWriteModule`) lets anyone edit titles, delete records, or forge someone else's acknowledgement.
  - `notifications` lets anyone create or update.
  - Permission checks like `editDocuments` and `manageInternalEmail` exist only in the browser.
  - Fix: add rules that check the recipient or sender on `internalEmails`, require the editor role for documents (outside a person's own acknowledgement key), and limit notifications to the recipient. Effort: M
- **[High] Any signed-in user anywhere gets full access to `forge-demo`**
  - The `isDemoDepartment` checks allow this (`firestore.rules:41,105`, `storage.rules:28`), including joining as Fire Chief and creating or updating `platformDepartments/forge-demo`. Storage allows 100 MB uploads there.
  - The demo password has a hard-coded fallback (`src/lib/demoMode.js:44`).
  - Abuse is limited to the demo, but the demo can be vandalised just before a prospect sees it, and it can host arbitrary files.
  - Fix: reseed the demo nightly, make it read-only except for the demo user, and cap demo uploads. Effort: M
- **[Medium] Storage rules ignore suspended departments and file types**
  - Storage checks membership but not `isDepartmentActive`, so suspended departments keep upload and delete access.
  - Any member can delete any department file, including documents and preplan PDFs.
  - There is no content-type check (`storage.rules:36-40`).
  - Fix: mirror the Firestore rules and restrict deletes to editors. Effort: S
- **[Medium] Public functions spend department money on behalf of anonymous callers**
  - `googleGeocode/Directions/PlacesLookup` are `invoker: public` and are authorised by a gateway slug alone (`functions/lib/access.js:74`), which lets anyone use a department's Google key.
  - `alertDashboardPublicView` runs a live Active911 sync (`sync: true`), throttled only by `lastSyncAt`.
  - Fix: require a display token and add App Check. Effort: S–M
- **[Medium] Messages page shows no feedback** — `InternalEmailBoardPage.jsx:20` doesn't pass `onMessage`, so "Message sent", "Subject and message body are required" and load or delete failures never appear. The inbox doesn't refresh live and nobody is told about new messages. Fix: pass a toast handler and use `onSnapshot`. Effort: S
- **[Medium] Signage looks finished but doesn't publish** — The Devices, Playlists and Publish tabs suggest real screens, but no player exists and the "online" count is set by hand. Fix: label it "alert display only" for the demo, or build a `/display/{id}` player with a heartbeat. Effort: S to label, L to build.
- **[Medium] Document delete lacks a confirmation and versioning** — Delete happens without a confirm step and removes the file first (`SprintModulePages.jsx:126`). Effort: S
- **[Low] Analytics range buttons do nothing** (`SprintModulePages.jsx:405`). Effort: S
- **[Low] Every user loads every list at sign-in** — The 28 list subscriptions in `App.jsx` cost bandwidth and send personnel birth dates and emergency contacts to users without `viewPersonnel` (the rules allow the read anyway). Effort: L

### Duplicates and obsolete code
- `_recovered-platform/` (276 tracked files, 1.9 MB) is a full old copy of `src`, `functions`, the rules and `.firebaserc`. ESLint ignores it, but it confuses searches and audits. Delete it from the repo.
- Unused pages: `src/pages/AlertDashboardPage.jsx` (replaced by `PublicAlertDashboardPage`) and `src/pages/HornLakeHydrantApp.jsx`. Also the `OccupanciesPage` and `PreplansPage` exports in `SprintModulePages.jsx`.
- Legacy Horn Lake top-level collections are still in the rules (`preFirePlans`, `hydrants`, `hydrantInspections`, `hydrantFlowTests`, `dailyActivity`, `hoseTests`, `fireSogsFull`, `fireSogDetails`, `hoseInventory`). `HydrantTestingPage.jsx` (4,025 lines, the largest file) and `defaultAppData.js` still reference `emsProtocolsFull` and `fireSogsFull`. Horn Lake is now suspended (`archive.txt`).
- Two email paths: Resend and SendGrid.
- The apparatus list still exists alongside the newer `fleet*` collections (`legacyApparatus` is passed to about 12 fleet pages).
- No TODO or FIXME markers were found in `src` or `functions`.
- The very large files are `HydrantTestingPage.jsx` (4,025 lines), `App.jsx` (1,988), `schedulingRoster.js` (1,305), `EmployeePortalPage.jsx` (1,193) and `DigitalDashboardPanel.jsx` (1,049).
- Feature flags are Vite env vars (`VITE_TENANT_SUBDOMAINS`, `VITE_USE_FIREBASE_EMULATORS`, App Check provider) plus the Prevention feature toggles in `src/lib/inspections/preplanFeatures.js`.

### Quick wins (under an hour each)
- Make `assertAcademyWebhookSecret` reject requests when no secret is configured (`functions/index.js:755`).
- Pass `onMessage` to `InternalEmailBoard` on the Messages page.
- Add `window.confirm` before deleting a document. Save the record first, then delete the file.
- Open "SOGs / Policies" filtered to SOG + Policy.
- Add `isDepartmentActive` to the Storage rules, and restrict Storage deletes.
- Hide or label the Playlists and Publish tabs and the "online" chip as "manual / not yet live" before the demo.
- Remove the `"ForgeDemo2026!"` fallback from `src/lib/demoMode.js`.
- Delete `AlertDashboardPage.jsx`, `HornLakeHydrantApp.jsx`, the unused SprintModulePages exports and `_recovered-platform/`.
- Drop the Analytics range buttons, or make them filter the data.
