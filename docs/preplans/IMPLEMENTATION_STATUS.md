# Interactive Fire Preplans: Implementation Status

Branch `feat/interactive-preplans` · 2026-11-24 · see [REPOSITORY_DISCOVERY.md](REPOSITORY_DISCOVERY.md)

Each item is marked **Implemented** (code exists), **Tested** (automated tests), **Verified** (exercised in the
running app against the local emulators), or **Not built**. Nothing here is deployed.

## Done in this pass (foundation slice)

| Area | Status | Where |
|---|---|---|
| Fire service symbol catalog (6 categories, 40 symbols, shape + glyph so meaning isn't color-only, critical flags, custom symbols merged from `preplanSymbolLibraries`, search, favorites, recent) | Implemented · Tested | `src/lib/preplans/symbolCatalog.js` |
| Structured floor plan model: 15 object types, geometry validation, persistent ids, provenance, verification status, layers, edit ops (move/rotate/scale/duplicate/group/align/lock/delete), snapping, undo/redo, scale calibration, measurements, publication checks | Implemented · Tested | `src/lib/preplans/floorPlanModel.js` |
| Georeferencing math: similarity (≥2 pts) and affine (≥3 pts) least-squares fit, RMS error, plain-language quality, floor↔lat/lng both ways, stored as unverified | Implemented · Tested | `src/lib/preplans/georeference.js` |
| Floors (`preplanFloors`) and per-revision floor plans (`preplanFloorPlans/{revisionId}__{floorId}`), transactional save with optimistic concurrency, floor duplication | Implemented · Verified | `src/lib/preplans/floorPlanService.js` |
| New revision carries floor plans forward (rejected proposals dropped); published plans untouched | Implemented | `startPreplanRevision` in `preplanService.js` |
| Approval and publication blocked while proposals are unreviewed or critical features unverified | Implemented · Verified | `assertFloorPlansPublishable` in `preplanService.js` |
| "Return for changes" on an approved revision | Implemented · Verified (button appears after approval) | `PreplansModulePages.jsx` |
| Firestore rules: published geometry immutable (even for approvers); doc id must match revision/floor; version must increment by one; alerts only verified/resolved by approvers; inspectors can report alerts, link findings and open review tasks; browsers can't write AI conversion results | Implemented · Tested (13 new rules tests; full suite 191/191) | `firestore.rules`, `tests/rules/preplans.rules.test.mjs` |
| Floor plan editor: draw tools, drag-and-drop and tap-to-place symbols, multi-select and box select, vertex editing, properties inspector, layer visibility/lock, keyboard shortcuts, touch (pointer events), autosave with conflict detection, unsaved-change warning, source drawing overlay with opacity | Implemented · Verified (draw, save, reload, conflict banner) | `src/components/preplans/FloorPlanEditor.jsx` |
| Workspace: buildings, floors (add, rename, copy, remove), trace-over-a-drawing overlay (interactive overlay mode), attach photos/files to an object | Implemented · Verified (buildings, floors, drawing) | `src/components/preplans/InteractivePreplanWorkspace.jsx` |
| Operational alerts model: categories, severities, reported vs verified, stale review dates, active FPS impairments shown as verified alerts with their source | Implemented · Tested | `src/lib/preplans/alertModel.js`, `alertService.js` |
| Response view: published revision only (never a draft), alerts separate from the plan, verification dates and staleness, read-only floor plans with legend, hydrants with stale/out-of-service flags, day/night, large targets | Implemented · Tested (selection logic) · Verified (published plan, night mode, never-published plan) | `src/components/preplans/PreplanResponseView.jsx` |

## Done in slice 2 (site map and SmartPlan vector import)

| Area | Status | Where |
|---|---|---|
| Site map per revision (`preplanSiteMaps/{revisionId}`): satellite, street and topographic basemaps from one provider registry (Esri keyless tiles, attribution, "imagery is not live, capture date unknown" note); footprints (linked to buildings, "Open floors"), property boundary, apparatus access / no access, staging, hazards, notes; hydrant layer with linked and out-of-service hydrants marked; distance and area measurement; saved default view; autosave with version conflict detection | Implemented · Tested (model) · Verified (basemap, hydrants, footprint drawn, linked and saved, read-only after approval) | `src/lib/preplans/siteMapModel.js`, `siteMapService.js`, `src/components/preplans/SiteMapPanel.jsx` |
| Floor plan alignment on the map: pick matching points on the floor plan and the map, similarity (2+) or affine (3+) fit, live preview, error in feet once there's an extra point, saved as not confirmed; a person confirms it; unconfirmed alignments block approval and publishing; aligned floors drawn on the map | Implemented · Tested (model) · Verified (3-point alignment, error shown, saved, confirmed, drawn on the map) | same, plus `assertFloorPlansPublishable` |
| Site map carried into a new revision; published site maps locked; saves must bump the version by one (rules) | Implemented · Tested (rules; full suite 192/192) | `copySiteMapToRevision`, `firestore.rules` |
| SmartPlan vector import: SVG and ASCII DXF read as untrusted text (scripts, styles, pictures, links ignored; never rendered except through `<img>`); transforms, paths, curves, polylines, circles, arcs, text; types only from the file's own layer/id/class names, otherwise plain lines and areas; every object `pending` with confidence "unknown" and a source reference; include filter; side-by-side preview; source file kept (as plain text) and a `preplanConversions` record per import; bulk accept/reject per import, or one by one in the editor | Implemented · Tested (parser and proposals) · Verified (SVG with embedded script imported, script never ran, 8 proposals, approval blocked until accepted) | `src/lib/preplans/vectorImport.js`, `conversionService.js`, `src/components/preplans/SmartPlanPanel.jsx`, `PlanPreview.jsx` |
| Editor and site map save pending edits when you switch tabs (they unmount) | Implemented | `FloorPlanEditor.jsx`, `SiteMapPanel.jsx` |

### Bugs found by running it

1. Firestore rejects nested arrays, so the first save failed. Points are now stored as `{x, y}` (`floorPlanToStorage`), and a test checks that nothing nested is left.
2. Symbols and labels were drawn in floor units, so they were unreadable when zoomed out. They now keep a constant on-screen size.
3. The publish-gate message was replaced by a generic error (an unknown `code` makes `friendlyError` fall back). It now reads, for example, "Can't publish yet. Ground floor: Critical features not verified: Fire department connection."
4. Geometry locked at approval, but the check ran only at publish, which left a revision that could be neither published nor edited. The check now also runs at approval, and approved revisions can be returned.
5. The response view called a never-published preplan "withdrawn", because new preplans start with `operationalValidity: "unavailable"`. Only the `temporarily_unavailable` status now means withdrawn (unit test added).
6. In night mode, the embedded floor plan's side panel and toolbar were dark text on black. They now follow the response palette.

7. SmartPlan dropped every corner of a closed outline whose last point repeats its first (the simplifier measured to a zero-length line), so the exterior wall vanished. Fixed, with a test.
8. The SmartPlan and site map previews were black: the editor's color variables were scoped to the editor only. Now shared.
9. With no address coordinates the site map opened on the whole country; it now falls back to the department's hydrants.
10. Switching tabs within 1.5 s of an edit could lose it, and coming back showed the stale plan. The editor and site map now save on leaving, and the workspace keeps the full saved plan.

### Pre-existing issue found (fixed after slice 3)

`preplanService.js` stored verification dates as `new Date().toISOString().slice(0, 10)`, the UTC date: an approval at 10:48 PM Central on Nov 24 recorded "verified 11/25". Verification dates, due dates, alert effective dates and the response view's "today" now use the local calendar day (`src/lib/preplans/localDate.js`, tests in `preplanLocalDate.test.mjs`). Dates already stored are not rewritten.

## Done in slice 3 (occupancy and inspection entry points)

| Item | Status | Where |
|---|---|---|
| "Alerts & reviews" tab on the preplan: current and closed alerts; approvers verify, reject (with reason), re-check or resolve; review requests (needs updating / investigating / no change); linked findings | Implemented · Verified (report, verify, reject-as-no-change on a review request, linked finding shown with labels) | `PreplanAlertsPanel.jsx`, `AlertReportForm.jsx` |
| Preplans section on the occupancy detail page: the occupancy's preplans (status, verify-by date, "nothing published yet"), current alert counts, Open preplan, Response view, Report a condition, Ask for a preplan review | Implemented · Verified (alert and review request saved; response view and Open preplan work) | `PreplanEntryPoints.jsx`, `OccupanciesMasterPage.jsx` |
| Same section on the inspection workspace, plus "Link a finding to the floor plan" (pick the violation or the whole inspection, the floor and the drawn object). Alerts and review requests from here are marked as coming from the inspection | Implemented · Verified (violation issued, list updated in place, linked to "Kitchen" with a note; review request marked "From an inspection") | `InspectionsModulePages.jsx` |
| Targeted lookup: preplans queried by `occupancyId` (archived and cancelled hidden), not every preplan loaded | Implemented | `preplanLookup.js` |
| Permissions follow `firestore.rules`: anyone who can view preplans sees the section; preplan or inspection workers can report, request a review and link; only preplan approvers can save an alert as verified | Implemented (no rule changes in this slice) | |

Links and review requests never change the floor plan or close a finding. A review request only puts a task in front of preplan staff.

Checked as a view-only user (demo Captain): the section shows the preplans with Open preplan and Response view only; the preplan's SmartPlan and Alerts & reviews tabs show no actions.

### Bugs found by running it (slice 3)

1. **Responders lost the plan while a new revision was in progress.** Starting a revision marks the published one "superseded" (existing behaviour in `startPreplanRevision`), and the preplan's status moves through review and approval. The response view required revision status "published" and a published-type preplan status, so it said "No approved preplan" until the new revision was published. It now shows the revision named by `publishedRevisionId` when that revision is published or superseded, and hides archived and cancelled preplans. Two unit tests added.
2. The finding list in "Link a finding" didn't pick up a violation issued while the form was open. It now reloads when the embedded violations list changes.
3. The alert count read "0 verified and 1 unverified". It now reads "1 current alert for this property (not verified yet)".
4. A person's review request from an inspection always used the same id, so a second concern from that inspection was silently dropped, and after the first was decided an inspector could never file another (only preplan staff may update a task). Each request a person sends now gets its own id; deterministic ids are kept for automatic tasks.
5. For a view-only user, SmartPlan said "Add a building and a floor on the Floor plans tab first". It now says no floors have been drawn yet.

### Demo reset was broken by PR #101 (fixed)

"Reset demo data" has failed since PR #101 (admin delete with a reason) made `preplans`, `preplanRevisions` and the new preplan collections undeletable from the app. The reset deletes violations first (allowed), then a preplan delete is refused, `Promise.all` rejects, and nothing is re-created: the demo was left with no seeded violations (the inspections table still showed their counts) and the visitor's preplan edits. `firestore.rules` now lets the demo department (`forge-demo`) delete those collections, as PR #101 already did for inspections; every other department still deletes only through `deleteRecordWithReason`. The reset also clears the new preplan collections (buildings, floors, floor plans, site maps, alerts, links, review tasks, conversions, files), because the demo preplans reuse their ids and old floors would reattach. Rules tests added; verified by resetting the demo.

`tests/rules/preplans.rules.test.mjs` also gained the running-demo guard `firestore.rules.test.mjs` has, so it can't erase a running demo.

## Done in slice 4 (automatic review tasks)

| Item | Status | Where |
|---|---|---|
| Occupancy record changed: tracked fields (address, map location, name, classification, hazard, construction, occupant load, sprinkler, alarm, Knox box / access, emergency contacts, status) → one task per live preplan, naming what changed. Bookkeeping (timeline, notes, inspection dates, inspector) is ignored; blank or 0,0 coordinates count as no location | Implemented · Tested (unit + emulator) · Verified (sprinkler + Knox edit → task listing exactly those) | `functions/lib/preplanReviewTasks.js` (`preplanReviewOnOccupancy`) |
| Occupancy deleted → task asking whether the preplan should be archived or moved | Implemented · Tested (emulator) | same |
| New inspection finding → task only when it matches the department's rules: code chapters (default 5, 6, 9, 10, 50–67), keywords, minimum severity | Implemented · Tested · Verified (1001 blocked exit → task; with "Critical only", a 906 finding made none) | `preplanReviewOnViolation` |
| Finding corrected while a preplan alert or finding link refers to it → task to check and retire the alert | Implemented · Tested · Verified (closing the linked 609 hood finding → task) | same |
| Idempotent and loop-free: deterministic ids written with `create()`, `retry: true`; handlers write only `preplanReviewTasks`, never a preplan or occupancy | Implemented · Tested (same event twice → one task; preplan unchanged) | |
| Department rules editor: Config Studio → Preplans → Review rules (three switches, chapters, words, minimum severity; audit-logged). Browser and server defaults are checked to match | Implemented · Verified | `PreplanReviewRulesPanel.jsx`, `reviewRulesModel.js`, rules `preplanSettings` |
| Alerts & reviews labels automatic tasks ("Occupancy record changed (automatic)", "Inspection finding"), and the occupancy/inspection Preplans section shows the open review task count | Implemented · Verified | |

Not done: an inspection being completed doesn't create a task by itself; inspection-driven changes arrive through the occupancy record (which inspectors update) or a finding. The Preplans section's task count refreshes when the page loads, not the moment a trigger finishes.

## Done in slice 5 (review task notifications)

| Item | Status | Where |
|---|---|---|
| A new open review task (automatic or requested) sends an in-app notification to the preplan's assigned planner and reviewer, if they still hold preplan work permissions. If neither is set or eligible, it goes to the preplan approvers and configurers (at most 25). The person who asked is never notified | Implemented · Tested (emulator) · Verified (Knox box edit on the diner → one notification for the Fire Chief, the demo's only approver) | `functions/lib/preplanReviewTasks.js` (`preplanReviewTaskNotify`, `onDocumentCreated`) |
| Once per task and person (deterministic id, `create()`); nothing for archived or cancelled preplans; nothing watches notifications, so nothing loops | Implemented · Tested | same |
| Department switch "Notify preplan staff when a review task opens" (on by default) | Implemented · Tested | Config Studio → Preplans → Review rules |
| Clicking the notification in the bell marks it read and opens the preplan on Alerts & reviews | Implemented · Verified | `src/App.jsx` (`NotificationBell`), `InteractivePreplanWorkspace.jsx` (`forge-open-preplan-tab`) |

Not done: notifications are in-app only (no email or push). The bell loads when the page loads; it doesn't update live.

## Done in slice 6 (response view on the map)

| Item | Status | Where |
|---|---|---|
| Response view has a Site map / Floor plan switch. It opens on the site map when one was drawn for the published revision, otherwise on the floor plan | Implemented · Verified | `PreplanResponseView.jsx`, `PreplanResponseMap.jsx` |
| The map shows only the published revision's site map: footprints, property boundary, apparatus access and no-access lines, staging, hazards and notes (with labels and notes), plus a legend | Implemented · Tested · Verified | `src/lib/preplans/responseMapModel.js` |
| The chosen floor is drawn on the map only if a person confirmed its alignment. Otherwise the view says "its alignment wasn't confirmed" (or "wasn't aligned") and points to the Floor plan view | Implemented · Tested · Verified (confirmed first floor drawn; unconfirmed second floor left off with the note) | same |
| Alerts placed on a floor object get a pin at that object on the map (dashed for reported, not verified) | Implemented · Tested · Verified | same |
| Hydrants: the ones linked to the preplan wherever they are, plus others within 300 m of the site; grey if out of service; distance and flow in the tooltip | Implemented · Tested | same |
| Nothing is invented: with no site map, no occupancy location (0,0 counts as none) and no linked hydrant, there is no map, just a note | Implemented · Tested | same |
| Night mode darkens the imagery; the imagery's "not live, capture date unknown" note is shown; if tiles fail to load, the view says so and still shows the drawn features | Implemented · Verified (night mode); tile failure not tested offline | |

Verified with temporary site map, floor and alert data written to the local demo emulator for PP-DEMO-1, removed afterwards. The demo seed has no site maps, floor plans or occupancy locations.

Not done: the response map has no offline tile cache (see Known limitations). The site map isn't shown for a preplan with no published revision, by design.

## Done in slice 7 (field surveys, spec §16)

A field survey is an assignment to check a preplan on site. It lives in `preplanSurveys`, apart from the revision: the surveyor records findings and proposes corrections; a preplan supervisor accepts them into a new draft revision or records a field verification. The approved plan is never edited from the field.

| Item | Status | Where |
|---|---|---|
| New permission "Conduct preplan field surveys" (`conductPreplanSurveys`): on for Fire Chief, Battalion Chief, Company Officer and Creator; departments can grant it to other roles. Server copy of the built-in roles regenerated | Implemented · Tested | `adminRegistry.js`, `defaultRoles.js`, `functions/lib/defaultRolePermissions.json` |
| Assign a survey (preplan staff): preplan, station, shift, named people, due date (default from settings), instructions. From Field Surveys → Assign survey, or "Assign field survey" on a preplan | Implemented · Verified | `src/pages/FieldSurveysPage.jsx`, `surveyService.js` |
| Field Surveys page (Preplans menu and tab): My surveys (named, or my station and shift from my Forge account), Waiting for review, All open, Closed; overdue first | Implemented · Tested · Verified | same, `surveyModel.js` |
| Phone-first survey form: checklist with Matches / Changed / Couldn't check / Doesn't apply (a note is required for changed or unchecked), proposed corrections to the plan's fields (restricted fields excluded), observations with optional GPS from the device, photos (camera or files, with location), inspection referrals (routine / soon / urgent), notes | Implemented · Tested · Verified (375 px, no sideways scroll) | `FieldSurveyForm.jsx` |
| Offline: every change is kept on the device first and sent when there's a connection; a conflicting save asks which version to keep; the list marks surveys with unsent work. Photos need a connection | Implemented · Verified (simulated offline: kept on device, sent and cleared on reconnect) | `surveyService.js` (device copy), `FieldSurveyForm.jsx` |
| Configurable checklists: a standard list and one per preplan template (Config Studio → Preplans → Field surveys); the survey copies its checklist when assigned | Implemented · Tested · Verified | `PreplanSurveySettingsPanel.jsx`, `preplanSettings/surveys` |
| Supervisor review: changed items, proposed corrections (tick which to use), observations with GPS, photos, referrals. Accept into a new draft revision (adds the ticked corrections and the field notes, files the photos with the preplan, never writes into a revision that is in review or approved), record as a field verification when nothing changed, or return with notes | Implemented · Verified (correction landed in draft revision 2, published revision 1 untouched and still the response plan, photo filed; a no-change survey recorded a verification due in a year) | `SurveyReviewPanel.jsx`, `surveyService.js` |
| Security rules: staff assign and review; a surveyor (named, or on the survey's station and shift, with the permission) may only write surveyor fields, move it to in progress or submitted, add only themselves, and must bump the version; nothing after submission; other departments see nothing | Implemented · Tested (8 rules tests, including a full-size save) | `firestore.rules` (`preplanSurveys`) |
| Notifications: assigned → the named people or the station shift's active members who may survey; submitted → whoever assigned it (else approvers); returned → the surveyor; each new referral → inspection schedulers (`assignInspections`, else `editInspections`). Once each; the bell opens the survey | Implemented · Tested (emulator) | `functions/lib/preplanSurveys.js` (`preplanSurveyNotify`), `App.jsx` |

Decisions and limits:
- Surveyors propose; the revision is created when a supervisor accepts. People who already have `editPreplans` can still start a revision themselves from the preplan, as before.
- GPS observations are shown to the reviewer with their coordinates; placing them on the site map is done by the planner (not automatic).
- Inspection referrals notify inspection schedulers; they don't create an inspection record by themselves.
- Photos are uploaded straight away and need a connection; a survey holds up to 40.
- In the demo every persona shares one sign-in, so survey notifications (which skip the person who acted) don't appear there.
- Verified in the demo through the app (assign as Fire Chief, survey as Captain, review as Fire Chief). Those test surveys, revision 2 of PP-DEMO-1, the PP-DEMO-4 verification and a Special hazard checklist are still in the demo data; "Reset demo data" clears them.

## Done in slice 8 (SmartPlan for scans and photos, no AI)

Line detection for pictures of floor plans, in the browser. Deterministic: no AI, nothing sent outside the department's own storage, nothing billed.

| Item | Status | Where |
|---|---|---|
| Line detection: local-contrast ink threshold (works on uneven phone light; light-on-dark blueprints flipped), straightening of a picture turned up to 5°, horizontal and vertical strokes with thickness, small breaks bridged, edge slivers folded in, corners and tees joined; text, hatching, door swings and solid blocks skipped. Pictures over 2400 px are read at 2400 px and the lines scaled back | Implemented · Tested (9 tests: level, 2° crooked, grainy with a light gradient, double-line walls kept apart, text and blocks ignored, blueprint) | `src/lib/preplans/rasterLines.js` |
| SmartPlan → "Choose a scan or photo" (PNG, JPEG, WebP, GIF up to 25 MB) or "Find lines in this floor's source drawing". Live preview of the lines over the picture; settings for contrast, shortest line, straightening, and what thick lines are (plain lines by default, or interior or exterior walls at a thickness you set; a cutoff is suggested from the picture) | Implemented · Verified (1600×1100 JPEG turned 1.5° with grain, text and a door swing: the 9 walls found, angle measured, gap kept, text and swing ignored) | `src/components/preplans/SmartPlanScanImport.jsx`, `SmartPlanPanel.jsx` |
| Adding: every line is `pending`, confidence "unknown", source `smartplan_lines` with the picture's file id and a reference (direction, thickness, angle). The picture is kept with the preplan and placed under the floor plan so the lines sit exactly on it (asks before replacing another source drawing). One `preplanConversions` record (method `line_detection`) with counts, warnings and the settings used. Bulk accept/reject per import as for vector imports | Implemented · Verified (9 proposals saved, picture under the plan, import listed with "9 waiting for review") | same, `conversionService.js` |
| Warns before adding a second copy of lines already found in the same picture | Implemented · Verified | `SmartPlanScanImport.jsx` |
| Floor plan editor: change an object's type to another of the same shape (line ↔ interior/exterior wall, area ↔ room/corridor/stairwell…), one or many at once; it moves to the new type's layer and stays a proposal until accepted. Helps vector imports too, which arrive as plain lines when the file has no layer names | Implemented · Tested · Verified | `floorPlanModel.js` (`retypeObjects`, `typesLike`), `FloorPlanEditor.jsx` |

Limits:
- Only straight horizontal and vertical lines (along the picture's own angle). Diagonal and curved walls, doors and door swings, windows, text (no OCR), symbols and rooms aren't detected; they're traced by hand.
- Thick-vs-thin is the only typing, and only as the person chooses. Exterior vs interior isn't guessed.
- A wall drawn as two thin lines comes in as two lines.
- Strong perspective in a phone photo (taken at an angle) isn't corrected; photograph the sheet straight on.
- HEIC and TIFF can't be read in the browser; PDF still needs exporting to PNG or SVG. AI vision remains off pending the owner's approval.
- Tested on drawn test pictures and one realistic synthetic scan in the demo, not yet on a department's real scans.

## Done in slice 9 (offline packages, spec §21)

Crews save approved preplans in FORGE FIELD and open them with no signal. Built on what was already there: the FORGE FIELD app, its service worker and on-device storage, the response view, the existing offline edit queue, and the department's existing "Offline access" preplan feature switch. No new permission key.

| Item | Status | Where |
|---|---|---|
| A package holds the approved (published) revision only, plus building and floor info, floor plan geometry and markers (rejected proposals left out), site map, current alerts (including impairments) with the time they were read, nearby hydrants, verification dates, version info, and the photos and PDFs the person may see (restricted ones and restricted answers only with the existing restricted-detail permission). Newest files first within a size budget; how many were left out is shown | Implemented · Tested · Verified (4 demo preplans saved) | `src/lib/preplans/offlinePackageModel.js`, `responseData.js`, `src/field/fieldPreplanPackages.js` |
| Encrypted on the device (AES-GCM, a non-exportable key per person and department kept in the browser). Integrity: SHA-256 of the content checked on every open, and each package is tied to its preplan, so a damaged, altered or swapped copy is refused and marked "Damaged" | Implemented · Tested (round trip, altered data, wrong preplan, wrong key) · Verified (stored copies hold no readable text) | `offlinePackageModel.js` (`sealPackage`, `openPackage`) |
| Device authorization: a device registers when it first saves (`preplanOfflineDevices`), and reports what it holds and when it last connected each time it syncs. Rules: only your own active device; you can't revive a revoked one or change its owner; the owner or a preplan manager revokes; managers see all devices, others only their own | Implemented · Tested (6 rules tests) · Verified | `firestore.rules`, `offlinePackageService.js` |
| Revocation when the device next connects: it removes every package and deletes its key if the device was revoked, the person lost preplan access, or the department turned offline access off. A revoked device can't save again | Implemented · Tested · Verified (revoked in the RMS → FORGE FIELD removed all 4 on its next sync and refused to save more) | `fieldPreplanPackages.js` (`syncPackages`, `wipePackages`) |
| Freshness: "Up to date", "May be out of date" after the department's hours (24 by default), "Newer version approved" when a newer revision couldn't be downloaded yet, "Expired" after the department's days without an update (14 by default). Shown as a banner on the plan, on the list and on the plan's page. An expired copy still opens, with the warning | Implemented · Tested · Verified (current state) | `packageFreshness`, `PlanOfflineScreens.jsx`, `PreplanResponseView.jsx` |
| Incremental sync whenever FORGE FIELD refreshes: same revision → only the live parts (alerts, hydrants, verification dates) are refreshed; new approved revision → the package is replaced; withdrawn, archived, temporarily unavailable or unpublished → removed. Files already on the device are reused. Failures are retried on the next refresh | Implemented · Tested | `packageSyncAction`, `syncPackages` |
| Offline drafts: unchanged; the existing FORGE FIELD edit queue keeps working. It merges into a draft revision (never into the published one), and asks when the same field changed on both sides, so an offline draft can't overwrite a newer approved version | Existing · reused | `fieldSyncHandlers.js` (`syncPlanEdit`) |
| FORGE FIELD: "Save for offline" / "Update now" / "Open offline copy" on a preplan; Pre-fire plans → Offline preplans (save all or one station, update all, remove); copies are removed on sign-out | Implemented · Verified (opened with the demo server stopped; phone width) | `PlanOfflineScreens.jsx`, `PlanScreens.jsx`, `FieldShell.jsx`, `SettingsScreen.jsx` |
| RMS → Preplans → Preplan Offline: settings (expiry days, stale hours, photo/document budget, preplans per device, photos and documents on or off, audited) and the device list (person, device, preplans and their expiry, last connected, revoke with a reason) | Implemented · Verified | `PreplanOfflinePanel.jsx`, `PreplanOperationalPage.jsx` |

Permissions: saving offline needs view access to preplans, the preplans module, and the department's "Offline access" feature (spec `offline.download`). Offline editing remains the existing edit permission through the FORGE FIELD edit queue (spec `offline.edit`).

Limits:
- Revocation takes effect only when the device connects again. A device that stays offline keeps its copies until then; they still show "Expired" on schedule. The RMS and the revoke prompt both say so.
- The encryption protects copies at rest (a lost phone's storage, a copied browser profile) and makes removal immediate by deleting the key. It doesn't protect against someone using the signed-in app on the unlocked device.
- Satellite imagery isn't saved (the provider's terms don't allow caching). The offline map shows the drawn features without imagery, and says so.
- Packages update only while FORGE FIELD is open and online (no background sync).
- Clearing the browser's site data removes the packages and the device id; the browser then registers as a new device.
- The device list shows what each device last reported; it can't show changes made while a device is offline.

## Done in slice 10 (CAD and incident matching, spec §15)

Dispatches are matched to approved preplans by address, and the version used on each call is recorded. Built on what exists: Active911 alerts (the only live CAD feed; `hlfd-rms-active911-alerts`), the CAD record normalizers in `pcrCad.js`, `loadCadRecords`, the demo's sample CAD runs, the department's existing "Incident Integration" preplan feature switch, and the FORGE FIELD outbox.

| Item | Status | Where |
|---|---|---|
| Address normalization: house number, street with standard suffixes and directions, suite (from "Suite 200", "#12", "Apt 3B", or a trailing unit as Active911 sends it), intersections recognized | Implemented · Tested | `src/lib/preplans/incidentMatch.js` (`parseAddress`, `compareAddresses`) |
| Matching: exact address (and suite when both sides have one) → the match; several approved preplans at one address, another suite, a similar street name, an address far (> 250 m) from the CAD point, or a different address within 150 m → listed for confirmation, marked "not the dispatched address" where it isn't. Only approved (published, not withdrawn) preplans are offered; a draft at the address is reported as "exists but isn't approved", never opened | Implemented · Tested (13 tests) · Verified (4710 Riverside Rd → Riverside High School; 880 Riverfront Pkwy → Riverside Inn; 214 Main St → "exists but isn't approved", the diner's preplan is a draft) | `matchIncidentToPreplans` |
| Incident ↔ preplan link (`preplanIncidentLinks`): incident key and number, call type, address and suite, preplan, **the revision id and number used**, how it was matched, who and when. Created once and never edited; rules accept only an approved revision of that same preplan (published, or superseded after a newer one was started, so an offline crew's earlier copy still counts) | Implemented · Tested (4 rules tests) · Verified | `incidentLinkService.js`, `firestore.rules` |
| RMS → Preplans → Incident Preplans: recent dispatches with their match, address lookup (with suite), the response view, "Link to this call" / "This is the dispatched property", and the history of preplans used on calls, noting when a preplan was revised after the call | Implemented · Verified | `IncidentPreplanPanel.jsx`, `PreplanOperationalPage.jsx` (variant `incidents`) |
| FORGE FIELD → Pre-fire plans → Calls: the last 24 hours of dispatches (plus the demo's sample runs) with "Preplan / Check / No preplan"; a call shows the match or the choices to confirm; opening one uses the saved offline copy when there is one, and queues the link in the outbox (sent when online, version = the copy the crew had) | Implemented · Verified (opened Riverside High School from its call at phone width; the queued link synced and matched the RMS one, not duplicated) | `PlanCallScreens.jsx`, `fieldRefData.js` (`callPreplans`), `fieldSyncHandlers.js` (`preplanIncidentLink`) |
| NERIS: the report's building lookup and auto-fill now use the same whole-address comparison. Before, "1214 Main St" matched the building at "214 Main St", and an occupancy with a blank address or name matched every incident. Auto-fill prefers the approved preplan over a draft | Fixed · Tested | `src/lib/neris/buildingDetails.js` (`matchBuilding`), `autoPopulation.js` |

Not built:
- No CAD system sends incident numbers or pushes calls: Active911 alerts are pulled (on demand and by the station TV), and they carry no incident number, so a link's key is the Active911 alert id. A direct CAD interface (push or polling) needs a vendor integration.
- Deep links from CAD or apparatus terminals into a preplan, and an apparatus/MDT interface beyond FORGE FIELD, need that integration too.
- No geocoding of the dispatch address: proximity uses the coordinates CAD sends (Active911 has them; the demo runs don't).
- FORGE FIELD doesn't have occupancy suites, so in the field a multi-tenant address with no preplan-level suite asks for confirmation (the RMS uses occupancy suites).
- NERIS reports don't store the preplan version; the link record holds it. No NERIS fields were added.
- The link history shows which version was used; opening that earlier version (rather than the current one) isn't built.

## Not built yet (next sprints, in order)

| # | Area | Notes |
|---|---|---|
| 1 | SmartPlan AI for scans and photos | Forge AI vision proposals (rooms, doors, symbols, text) through a server callable (JSON schema, re-validated, stored `pending`). **AI vision sends drawings to Anthropic and is billed per call, so it needs the department owner's approval before it's built and switched on.** PDF needs `pdf.js` (new dependency); DWG needs a licensed converter; HEIC/TIFF need server conversion |
| 2 | Mutual aid, 3D, reporting, admin dashboards; a direct CAD interface (see slice 10) | See spec §14–28 |

## Known limitations

- Response view leaves out restricted answers (gate codes, shutoffs, hazmat) unless the existing restricted-detail permission applies. That is intentional, but the response view does not yet load them for permitted users.
- Download URLs are Firebase tokenized URLs (platform-wide posture), not short-lived signed URLs.
- Editor performance has not been measured on apparatus hardware. No performance claims are made.
- Floor plans are limited to 2,500 objects per floor (one Firestore document); site maps to 500 features.
- Site map features can't be reshaped after drawing (delete and redraw). Labels, notes and building links can be edited.
- Vector import classifies only from names in the file. A drawing with everything on layer "0" comes in as plain lines and areas for a person to retype.
- DXF block references (INSERT) and hatches are skipped and reported; explode blocks before exporting.
- Basemap tiles come from Esri's public services (as elsewhere in Forge); there is no offline tile cache, and offline packages leave imagery out.

## Test results (this pass)

- `npm run test:unit`: 942 passed, 0 failed (new: floor plan model 19, georeference 7, alerts 12, site map 7, vector import 13, local dates 2, review tasks 11, response map 5, field surveys 11, line detection 9, retype 1, offline packages 11, incident matching 13, NERIS building match 1)
- `npm run test:rules`: 212 passed, 0 failed (`preplans.rules.test.mjs` 16, including demo-only deletes; `preplanSurveys.rules.test.mjs` 8; `preplanOfflineDevices.rules.test.mjs` 6; `preplanIncidentLinks.rules.test.mjs` 4). `firestore.rules.test.mjs` and `helpDesk.rules.test.mjs` now use the emulator ports `emulators:exec` started instead of always 8080/9199
- `npm run test:functions`: 248 passed, 0 failed (new: `preplanReviewTasks.test.mjs` 14, `preplanSurveys.test.mjs` 5)
- `npm run lint`: clean (whole `src`); `vite build` succeeds
