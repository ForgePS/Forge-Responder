## Prevention: inspections, code enforcement, preplans, hydrants, damage reports

Routing: `src/App.jsx:1544-1846`. Every Prevention menu item opens a real page. Seven preplan items (Dashboard, Work Queue, All, My, Draft, Awaiting Review, Approved, Reports) open the same `PreplansWorkQueuePage` with a different filter. "Hydrants" and "Hydrant Overview" both open `HydrantTestingPage embedded` with **no permission gate** (`App.jsx:1809`). Almost every prevention collection uses `canWriteModule` (`firestore.rules:127`), which is just "member of the department and module turned on". So every approve, publish, pay, delete and send permission is checked only in the browser.

### Inventory
| Page / feature | Where (file) | Status | One-line note |
|---|---|---|---|
| Inspections Dashboard | InspectionsModulePages.jsx:909 | 2 | KPIs come from real queries. Charts show raw keys (`in_progress`). Pass rate has no %. |
| Work Queue / All / My Inspections, create modal | InspectionsModulePages.jsx:60, 921-955 | 2 | Real, department-scoped. No inspector picker (only "Assign to me"). |
| Conduct inspection (checklist) | InspectionsModulePages.jsx:153, 204-242 | 3 | Only pass/fail, yes/no, text and heading fields render. Photo, date, number, select and signature fall back to a text box. Required fields are not enforced. |
| Start / save / complete / approve / reopen | inspectionWorkflow.js:327-471 | 1 | Traced to Firestore. Completing locks a snapshot. |
| Reassign / reschedule | inspectionWorkflow.js:302,312 | 6 | Service functions exist. No screen calls them. |
| Reinspection | enforcementService.js:250 | 2 | Creates a real follow-up inspection with no date (`{}` at InspectionsModulePages.jsx:813). |
| Occupancies | OccupanciesMasterPage.jsx | 2 | Create, edit and delete work, with a confirm. No inspection history. |
| Fire Protection Systems | FireProtectionSystemsPage.jsx | 2 | Systems, tests and impairments are real. Raw `violationId` shown (:697). |
| Inspection Reports | InspectionReportsPage.jsx | 2 | Queries are real. Export is CSV/JSON only. Scheduled reports never run. |
| Offline & Sync | InspectionOfflinePage.jsx | 3 | Real local queue. No service worker or Firestore offline cache. Attaching a file requires typing a raw inspection ID (:346). |
| Open Violations | ViolationsPage.jsx | 2 | Real. No photos. Code citation is free text. |
| Notices & Certificates | InspectionNoticesPage.jsx, noticePrint.js | 2 | Issuing and printing work. Email/SMS delivery records "Sent (stub)". Certificates can't be printed. Printed report leaves out checklist answers. |
| Enforcement Cases | InspectionEnforcementPage.jsx | 2 | Real records. Nothing prints. |
| Fees & Payments | InspectionFeesPage.jsx | 2 | Records only. No payment processing, no invoice print. Starter fee amounts are written into real departments. |
| Search / Browse Codes | CodeLibraryPages.jsx:79; platformLibraryService.js:72-84 | 4 | Reads at most 1,000 entries, unsorted, then filters by chapter in the browser. |
| "Add to inspection" (code) | CodeLibraryPages.jsx:288 | 4 | Writes `forgePendingCodeCitation` to sessionStorage. Nothing reads it. |
| Frequently Used / Saved Sections | CodeLibraryPages.jsx:924 | 2 | Both menu items open the same page. |
| Local Amendments | CodeLibraryPages.jsx:967 | 5 | Text and a link only. |
| Adopted Codes | CodeLibraryPages.jsx:565 | 2 | Saves. |
| Code Administration | CodeLibraryPages.jsx:752 | 4 (dept admin) | Department admins are shown it, but the writes need a platform creator (firestore.rules:281-299). Shows `node scripts/ifc/...` and runbook paths. |
| Configuration Studio | InspectionConfigStudioPage.jsx | 2 | Real versioning. "Key"/"Inspection type ID" labels. Open to `editInspections`. |
| Automation & Integrations | InspectionAutomationPage.jsx; automationService.js | 5 | No Cloud Function reads it. Run only writes a log. Webhook/adapter Test returns "Stub OK" (:478, :597). |
| Import & Data Quality | InspectionHardeningPage.jsx | 2 / 7 | CSV import is real. Rollback only flags the batch. Readiness, a11y and docs tabs are developer QA screens. |
| New Preplan wizard | PreplansModulePages.jsx:76-244 | 2 | Creates a real preplan. Then jumps to the queue instead of opening it. No address lookup. |
| Preplan lists (All/My/Draft/Review/Approved) | PreplansModulePages.jsx:600-760 | 2 | Real lists. Raw type IDs. No search box. |
| Preplan Dashboard / Preplan Reports | same component, mode switch (:634) | 5 | Same table as All Preplans. |
| Preplan survey editor | PreplansModulePages.jsx:246-525 | 2 | Covers construction, access/Knox, water, fire protection, utilities, hazards, contacts and tactics, and saves. Header shows raw enums. |
| Review / approve / publish | preplanService.js:750-823 | 3 | No transition checks: Publish appears while awaiting review (:378). No confirms. Checks are browser-only. |
| Record verification | PreplansModulePages.jsx:822-834 | 4 | Marks every checklist item checked without showing the checklist. |
| Linked hydrants / systems | PreplanWorkspacePanels.jsx:220-270 | 2 | Lists the first 200 hydrants, not nearby ones. Shows success even when the save fails. |
| Files & plans upload | PreplanWorkspacePanels.jsx:299-335 | 2 | Path `departments/{id}/pre-fire-plans/` is allowed by storage.rules:37. File type checked only in the browser. No delete. |
| Risk tab | preplanRiskService.js | 3 | Code calls itself a "Phase 3 stub". Overwrites the wizard's risk level. |
| QR tokens / QR Scan | preplanQrService.js; PreplanOperationalPage.jsx:113-131 | 5 | Token shown as hex text. No QR image. Nothing redeems it. Scan page is static text with no camera code. |
| Nearby Preplans | PreplanOperationalPage.jsx:133-170 | 5 | No geolocation, map or distance. Rows can't be clicked. |
| Target Hazards | PreplanOperationalPage.jsx:63-67 | 3 | Filters on `target_hazard`, which the wizard can't set. |
| Preplan Offline | preplanOfflineQueue.js | 3 | Write queue only. No offline reading. Shows a developer note. |
| Templates | PreplanConfigPanel.jsx:240-360 | 3 | Can add or remove sections. Can't edit fields. No confirm on Remove. |
| Preplan to incident link / print for crews | App.jsx:1039 | 6 | NERIS reads the old `hlfd-rms-preplans` list, not the new `preplans`. No print or PDF view. |
| Hydrant map | HydrantTestingPage.jsx:789-862 | 2 | Leaflet with Esri tiles, so no Google key here. The popup has an XSS hole. |
| Hydrant list / edit | HydrantTestingPage.jsx:933,1150 | 2 | Real. A failed save still shows a ✓ "saved locally". Edit History never fills. |
| Add / retire a single hydrant | — | 6 | Import is the only way to add. No retire or delete. |
| Hydrant inspection | HydrantTestingPage.jsx:1304-1312 | 2 | Saves for real, but every item starts as "Yes". Inspections on the same day overwrite each other. |
| Flow test | HydrantTestingPage.jsx:1485 | 2 | Real pitot formula. No fabricated results. Class uses observed flow, not rated flow at 20 psi. |
| Daily activity + email CSV | HydrantTestingPage.jsx:1724-1782 | 2 | Real Resend email. Re-reads Firestore every 2 seconds. |
| Hydrant import | components/hydrants/HydrantImportSection.jsx | 2 | Works. Any member can import. Examples show Horn Lake IDs and a staff name. |
| Damage Reports (6 queues), wizard | HydrantDamageReportsPage.jsx; HydrantDamageWizard.jsx | 2 | Real lifecycle. No photos ("later hardening phase" shown to users, :327). Shows the internal ArcGIS ID as the hydrant label. |
| Damage email to water company | functions/index.js:811-865 | 4 (likely) | SendGrid-only, with no secret declared. The platform uses Resend. |
| Utility acknowledgment portal | functions/lib/hydrantDamageAckPortal.js | 2 | Strong hashed token with 30-day expiry. Link origin is supplied by the browser. |
| Verification / closure | hydrantDamage/verificationService.js:180 | 3 | Closes the report but never puts the hydrant back in service. |
| Water Company Directory | WaterCompanyDirectoryPage.jsx | 1 | Real CRUD, with loading and error states. |
| Water Districts | WaterDistrictsPage.jsx:361 | 2 | Real point-in-polygon matching. Boundaries are entered as pasted GeoJSON. |
| Damage Analytics | HydrantDamageAnalyticsPage.jsx | 2 | Real numbers. Bulk send has no confirm. |
| JotForm Damage Forms panel | components/DamageFormsPanel.jsx | 2 | Webhook checks a per-department token. Separate from the Damage Reports module. |
| HornLakeHydrantApp.jsx; non-embedded Hydrant shell | HydrantTestingPage.jsx:2333-3780 | 7 | Not imported or unreachable. About 2,000 lines with Horn Lake phone numbers and an onrender.com URL. |

### Findings
- **[Demo-blocker] Inspection checklist can't capture most field types.** Photo, date, number, select, signature and citation fields all render as plain text. That includes the starter template's "Evidence photos". Required fields aren't enforced. Evidence: `src/pages/InspectionsModulePages.jsx:204-242`, `src/lib/inspections/configDefaults.js:184`. Fix: render each type, sending photos through the attachment upload. Effort M.
- **[Demo-blocker] Water-company damage email probably can't send.** `sendHydrantDamageReport` reads only `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` and declares no secrets. Those appear only empty in `.env.example`. The rest of the platform sends through Resend (`EMAIL_SECRETS`). It also ignores log-only delivery mode. Evidence: `functions/index.js:859-864`. Fix: send through the shared mailer with an attachment, and honor log mode. Effort M.
- **[Demo-blocker] Placeholder pages in the Preplans menu.** Nearby, QR Scan, Preplan Dashboard and Preplan Reports are a static list or text. The footer prints the raw department ID. Evidence: `src/pages/PreplanOperationalPage.jsx:113-174`, `PreplansModulePages.jsx:634`. Fix: hide them with the existing `preplanNavFeatures.js` flags, and drop the footer. Effort S.
- **[Demo-blocker] Code Library browse/search stops at 1,000 entries, and "Add to inspection" goes nowhere.** Evidence: `src/lib/codeLibrary/platformLibraryService.js:72-84`; `src/pages/CodeLibraryPages.jsx:288`, where `forgePendingCodeCitation` is never read. Fix: query by chapter with `orderBy`, and wire the citation into the violation form or hide the button. Effort M.
- **[High] Public alert endpoint accepts any department ID.** `resolveGatewayDepartmentId` falls back to `platformDepartments/{id}` and to a hard-coded Horn Lake case. So the unauthenticated `alertDashboardPublicView` (with `invoker: "public"`, `sync: true`) and the public Google geocode/places callables work for any guessable department ID. They return live alert addresses and the Maps key. Evidence: `functions/lib/gatewayResolver.js:17-30`, `functions/index.js:371-428`. Fix: require an explicit `rmsGateways` doc with public dashboard enabled. Effort S.
- **[High] Stored XSS on the hydrant map.** The popup HTML is built from raw `hydrant_id` and `address`, which any member can set through CSV import. Evidence: `src/pages/HydrantTestingPage.jsx:862`. Fix: escape the values or pass a DOM node. Effort S.
- **[High] No server-side role checks across Prevention.**
  - `canWriteModule` lets any member approve inspections, publish preplans, record payments and fee adjustments, delete or close damage reports, and import hydrants.
  - The damage send callable checks only department access.
  - The Hydrants route has no gate.
  - Storage lets any member overwrite or delete any department file, including restricted preplan files.
  - Any signed-in user can read `codeNodes` (licensed ICC text).
  - Evidence: `firestore.rules:127, 514-760, 1079-1081`; `storage.rules:37-41`; `functions/index.js:829`; `App.jsx:1809`.
  - Fix: per-permission rule helpers, a check in the callable, a route gate, and gating `codeNodes` on library access. Effort L.
- **[High] Code Administration errors for department admins.** Default roles grant `manageCodeLibrary`, but the writes need a creator. Evidence: `src/lib/permissions/defaultRoles.js:112,258`, `firestore.rules:281-299`. Fix: show the page to creators only. Effort S.
- **[High] Fake success states.** "Stub OK" sets webhooks and adapters to active (`automationService.js:478,597`). Automation Run only writes a log (`:313`). Notice email/SMS records "Sent (stub)" (`noticeService.js:514`). A failed hydrant save shows ✓. Linked-assets save reports success after a failure (`PreplanWorkspacePanels.jsx:113-121`). Preplan verification marks every item checked (`PreplansModulePages.jsx:822-830`). Fix: hide the stubs, and surface the errors. Effort S.
- **[High] Hydrant inspection defaults to all passing.** Every item starts "Yes". One tap records an inspection nobody did. Evidence: `HydrantTestingPage.jsx:1310`. Fix: start items blank and require each one. Effort S.
- **[High] Daily Activity polls Firestore every 2 seconds.** It re-reads the whole collection. Evidence: `HydrantTestingPage.jsx:1777`. Fix: use `onSnapshot` with a date filter. Effort S.
- **[High] Preplan survey edits are lost.** Every side action reloads and remounts the detail view. Evidence: `PreplansModulePages.jsx:701,734`. Fix: refresh the data without unmounting. Effort S.
- **[High] Restricted preplan data is hidden only in the browser.** Gate codes, shutoffs and restricted files are readable by every member. Evidence: `PreplansModulePages.jsx:420`, `PreplanWorkspacePanels.jsx:318`. Fix: a separate protected doc and path. Effort M.
- **[High] Inspection and preplan numbers can duplicate.** Both use "count + 1". Evidence: `inspectionWorkflow.js:119-121`, `preplanService.js:428-433`. Fix: a transactional counter. Effort S.
- **[High] Saving a draft overwrites real violation counts.** `openViolationCount` is set from the failed-answer count. Evidence: `inspectionWorkflow.js:356-366` against `violationService.js:293`. Effort M.
- **[Medium] Damage-report lifecycle gaps.**
  - The SLA clock starts at draft creation, so unsent drafts show as overdue (`damageReportService.js:180`).
  - Closing a report doesn't return the hydrant to service (`verificationService.js:180`).
  - The internal ArcGIS `location_id` is shown instead of `hydrant_id`, including in the water-company PDF.
  - There are no photos.
  - The acknowledgment link origin comes from the browser (`functions/index.js:885`).
  - Effort S–M.
- **[Medium] Two damage systems.** JotForm `damageForms` and the wizard's `hydrantDamageReports` aren't linked, so the same damage can be logged twice. Fix: convert a submission into a report. Effort M.
- **[Medium] Printing and records gaps.** Missing: an inspection report with checklist answers, certificate/invoice/citation print, a preplan print for crews, preplan-to-incident linking (NERIS still reads the legacy list, `App.jsx:1039`), a per-hydrant history, and single hydrant add/retire. Effort M each.
- **[Medium] Local hydrant overrides never expire.** A stale browser copy hides newer cloud edits. Evidence: `hydrantTenantService.js:358`. Effort M.
- **[Medium] Preplan workflow has no state machine and no confirms.** Publish skips approval. There are no confirms on Approve, Return, Publish, inspection Archive, damage bulk send or Reopen. Effort S.
- **[Low] Developer jargon and raw keys on screen.** Examples: "stubs", "Cloud Function with SendGrid", "hardening phase", "Tokens are hashed at rest", "comma IDs", `manual_override (100%)`, `<code>{row.id}</code>`, `preplanTypeId`, `in_progress`, `node scripts/ifc/...`. Fix: a copy pass with label helpers. Effort S.
- **[Low] Starter data is written on page load.** Templates, fees and dropdown libraries are seeded for view-only users too, and the page errors if the write is denied. Evidence: `InspectionsModulePages.jsx:493`, `preplanService.js:288`. Effort S.

### Duplicates and obsolete code
- `src/pages/HornLakeHydrantApp.jsx` is not imported. About 2,000 lines of the non-embedded shell in `HydrantTestingPage.jsx:2333-3780` are unreachable. They include a second preplan database with a hard-coded Horn Lake JotForm URL (:2566), Horn Lake phone numbers (:96) and an onrender.com asset base (:270).
- `public/departments/horn-lake-fd/hydrants.json` (1,241 real hydrants) is served without login.
- Two code systems: tenant `codeSets`/`codeSections` and platform `codeNodes`. Violations use neither (free text).
- "Frequently Used" and "Saved Sections" open the same page. Local Amendments, Automation and Hardening are duplicated inside Configuration Studio. Templates is reachable both from the menu and from the Studio.
- Legacy routes: `InspectionsPage` ("Inspection Queue"/"Inspections"), "Import & Hardening", "Preplans" (`App.jsx:1658,1736`). `PreplansPage` in `SprintModulePages.jsx:390` is unused. `preplanMigration.js` is a stub.
- An unused hard-coded `kpis` array includes "Inspections Due 27" (`App.jsx:246`).
- Damage Reports and Analytics each have their own copy of the static-plus-tenant hydrant merge.

### Quick wins (under an hour each)
- Escape the hydrant map popup. Replace the 2-second poll with a snapshot listener.
- Start hydrant inspection items blank. Show `hydrant_id` on damage reports. Start the SLA clock at send. Return the hydrant to service on close.
- Remove the department-ID and Horn Lake fallbacks in `gatewayResolver.js`.
- Hide Nearby, QR Scan, Preplan Dashboard and Preplan Reports, the automation/webhook/adapter stubs, notice email/SMS, and the Import & Data Quality QA tabs.
- Show Code Administration to creators only. Hide "Add to inspection" or wire it up.
- Gate the Hydrants route on `viewHydrants`.
- Allow Publish only from approved. Add confirms on Archive, Publish, Return, bulk send and Reopen.
- Open a new preplan after creating it. Stop the reload that discards survey edits.
- Check whether production has `SENDGRID_API_KEY` set before the demo.
