## Personnel, certifications, training, daily log and organization setup

How data is stored: Personnel, Certifications, Training and Daily Log are department lists (`departments/{id}/lists/hlfd-rms-*`, one item per record) loaded by `useTenantPersistentState` (src/hooks/useTenantPersistentState.js). Every page saves by calling `setRecords`, and the hook writes the change to Firestore in the background. A failed write raises a toast (`notifySaveFailed`), but the page shows its own green "saved" banner before the write finishes. Rules for lists (firestore.rules:460-484) only check `canWriteModule`, so **any active member can read, write or delete any item** in these lists. Role checks happen only in the client.

### Inventory
| Page / feature | Where (file) | Status (1-7) | One-line note |
|---|---|---|---|
| Personnel list (search, filter, sort, paging) | src/components/personnel/PersonnelListView.jsx | 1 | Real tenant data; Rank/Shift/Unit filters use seeded dropdowns, not department setup |
| Add personnel | src/pages/PersonnelPage.jsx:254 | 2 | Saves a "New Personnel" placeholder record right away; it stays behind if you leave through the menu |
| Profile – Personal Details | src/components/PersonnelProfileForm.jsx:60-160 | 4 | "Private info" fields (SSN, birth date, race) are only locked for editing; anyone who can view personnel can read them |
| Profile – Emergency contacts, Pay Rates, Promotions, Accruals, Immunization, Consultation, Employment History | PersonnelProfileForm.jsx:300-560 | 2 | Saves work; medical and pay sections have no access control beyond viewPersonnel |
| Profile – Certifications tab | PersonnelProfileForm.jsx:318 | 7 | Second certificate store, separate from the Certifications module |
| Profile – Training & Events tab | PersonnelProfileForm.jsx:222 | 4 | Matches people to training by a first-name substring |
| Profile – Academy tab | src/components/personnel/PersonnelAcademyPanel.jsx | 2 | Works when a connection exists; shows `forgePersonId` and raw IDs |
| Profile – Leave & Shift History | PersonnelActivityLogView.jsx | 1 | Read-only and filled automatically |
| Attachments (upload/archive/restore/delete) | PersonnelProfileForm.jsx:423-505 | 2 | Delete removes the Storage file at once, with no confirmation and before Save |
| Photo upload + crop | PersonnelPage.jsx:187 | 1 | |
| Bulk edit | src/lib/personnelBulkEdit.js | 1 | Writes an audit log |
| Excel import | src/lib/personnelImport.js, PersonnelImportModal.jsx | 2 | Treats people as duplicates only when first and last name match |
| Delete person | PersonnelListView.jsx:131,282 | 2 | Permanent delete after a confirm; no archive/restore; linked records left orphaned |
| Employment status (Active/Leave/Inactive) | dropdown `employmentStatus` | 2 | Inactive works as a soft archive, but the list doesn't hide inactive people by default |
| Forge Hub identity on save/import | src/lib/forgeHubIdentity.js | 2 | Logic is sound; the Hub token is readable by members and errors show raw text |
| Certifications page | src/pages/CertificationsPage.jsx | 3 | No way to add a certification; "days left" is stored once and never recalculated |
| Cert archive/restore/delete | CertificationsPage.jsx:90 | 2 | Delete has no confirmation and removes the file immediately |
| Cert expiration alerts | — | 6 | No scheduled function, email or notification |
| Training page | src/pages/TrainingPage.jsx | 3 | Create, status and delete work; no attendees, roster, requirements or edit form |
| Training requirements / per-member compliance | — | 6 | Missing; "compliance" is the average of a completion % picked by hand |
| Academy Class Schedule menu link | src/lib/platformUrls.js:30 | 1 | External link to Academy student registration |
| Daily Log | src/pages/DailyLogPage.jsx | 2 | Create/save/lock work; lock is only enforced in the client; no delete or print |
| Stations / shifts setup | DepartmentConfigPanel.jsx, DepartmentSetupWizard.jsx | 3 | Stored in `profile/main`, but Personnel reads separate seeded dropdowns |
| Ranks / positions / divisions / districts / units | src/data/defaultDropdowns.js via DropdownContext | 2 | Flat pick-lists only; no hierarchy |
| Dashboard cert/training KPIs | src/utils/dashboardMetrics.js:90 | 4 | Counts expired, archived and deleted certs using stale `days` |
| `kpis` constant | src/App.jsx:246-255 | 7 | Hard-coded numbers ("18", "87%"), never used |

### Findings
- **[Demo-blocker] Private personnel data visible to every viewer and downloaded by every member.** `canViewPrivateInfo` only controls whether the SSN, birth date, race, ethnicity and marital-status fields can be *edited*. They still display, unmasked, to roles such as Read Only (`PersonnelProfileForm.jsx:92,124-128`; `permissions.js:206`). App.jsx:971 also loads the whole personnel list for every user, including the Firefighter role with `viewPersonnel:false`, and caches it in `localStorage` (`useTenantPersistentState.js:28,248`). The rules let any member read it (firestore.rules:461). Fix: hide and mask private fields when `!canViewPrivateInfo`; move SSN, medical and pay fields to an admin-only subcollection with rules to match. Effort M.
- **[High] Role permissions are not enforced on the server for these modules.** Any active member can write or delete personnel, certifications, training and daily logs, including locked logs (firestore.rules:477-483; lock is only checked in the client at DailyLogPage.jsx:211). Storage lets any member delete any personnel or cert document (storage.rules:37-41). Fix: per-list write rules based on the role permission (`editPersonnel`, etc.) and a rule that blocks updates to a locked daily log. Effort M.
- **[High] Hub bearer token and secret are readable by every member.** They are saved in `departments/{id}/settings/main.forgeAcademy` (DepartmentConfigPanel.jsx:266-272), which any member can read (firestore.rules:444). If the callable fails, the client calls the Hub directly with them (forgeHubIdentity.js:45-46). Fix: store them in `integrations/` (server-only) and remove the browser fallback. Effort S.
- **[High] Certifications cannot be created and expiry is stale.** There is no "Add certification". The header "Upload Certification" button opens the **first record in the list**, whatever person that is (CertificationsPage.jsx:127). `days` is written only on upload and never recalculated, so Expired, Due-in-30/60/90 and the dashboard drift every day (CertificationsPage.jsx:61, dashboardMetrics.js:90). The 30/60/90 stat buttons and the "Due Soon" filter set filters that match nothing (lines 146, 168). Demo seeds hard-code `days: 460/194` (demoSeeds.js:184), so the demo shows wrong countdowns now. Fix: add a create form linked by `personnelId`, compute days from `expires` when displayed, and fix the filters. Effort M.
- **[High] Two certificate stores.** The Personnel "Fire & Other Certifications" table (PersonnelProfileForm.jsx:333) and the Certifications module never sync, and the Certifications module links people by a `person` name string. Fix: choose one store keyed by personnelId. Effort M.
- **[High] Organization data has two sources of truth.** The setup wizard and System Admin save stations and shifts to `profile.stations` and `profile.shifts`. Personnel Station, Shift and Unit fields use the separate `dropdowns` collection, which `ensureDefaultDropdowns` seeds into **every real department** with "Station 1-3 / Fire Administration", "A/B/C Shift / Day Staff" and units "Engine 1…Truck 3, FD-2" (dropdownService.js:4-12, defaultDropdowns.js:28-35,178-189; PersonnelProfileForm.jsx:149-158). A department that names stations "Station 51" will still see Station 1-3 on profiles. Preset rotations also hard-code "A Shift/B Shift/C Shift" whatever shift names the department set (defaultShiftRotation.js:99), and roster matching compares exact strings (schedulingRoster.js:37,731), so renamed shifts can drop people off rosters. Fix: drive these dropdowns from profile stations and shifts and the apparatus list. Effort M.
- **[High] US state dropdown has 6 states** (AL, MS, TN, AR, LA, VA) for addresses, driver's license and department state (defaultDropdowns.js:165-175). Fix: all 50 states plus DC. Effort S.
- **[Medium] Training is linked to people by first-name substring** (`members.includes(firstName)`, PersonnelProfileForm.jsx:225). "Al" matches "All shifts", which is the default `members` value for every new class (TrainingPage.jsx:52). Academy sync already stores `personnelId`, but it isn't used. Effort S.
- **[Medium] Training has no attendance or requirements.** `attendees` is always 0, there's no roster or per-member hours, and no edit of an existing class. The completion select offers an odd 86% option (TrainingPage.jsx:89). Categories are hard-coded, and the seeded `trainingCategories` dropdown is unused. "Overdue" is only ever set by hand. Effort L.
- **[Medium] Renames don't cascade.** Personnel, certs, training and daily logs store rank, station, shift, unit, person and apparatus as text. Historical records keep the old text, which is safe for history, but filters, rosters, the daily-log ID (`buildDailyLogId(date, shift, apparatus)`) and the training/cert links all split after a rename. Renaming a person breaks cert linkage. Effort M.
- **[Medium] Add Personnel saves a junk record immediately.** The placeholder "New Personnel" record (PersonnelPage.jsx:257-273) is written right away and counts against the plan limit. It's only removed if the user uses the breadcrumb or Cancel. Effort S.
- **[Medium] Deletes lack confirmation and are destructive.** Attachment and cert delete call `deleteFirebaseFile` with no confirm and before Save (PersonnelProfileForm.jsx:273, CertificationsPage.jsx:103). Personnel delete is permanent and leaves roster, time-card and portal `users.personnelId` links orphaned. Fix: confirm first, and use a status-based archive for personnel. Effort S/M.
- **[Medium] Weak duplicate detection.** Import matches people on first+last name only, so two "John Smith" rows merge, and duplicate rows within one file both create records (personnelImport.js:61,171). Manual add has no check unless the Hub is configured. Effort S.
- **[Medium] Cert upload with seed-style dates gives NaN.** `expires` values like "Sep 10, 2027" don't fit `<input type=date>`. Keeping them produces `new Date("Sep 10, 2027T12:00:00")`, so days are stored as NaN (CertificationsPage.jsx:60-62). Effort S.
- **[Low] Developer jargon and raw values shown to users.** Examples: "API ID" field (PersonnelProfileForm.jsx), `<code>forgePersonId</code>` (PersonnelAcademyPanel.jsx:198), the review ID and reason in the identity message, raw Hub error text in the save banner (PersonnelPage.jsx:150,157). Errors appear in green `success-banner` styling. The status badge is always "success"-toned, even for Inactive (PersonnelDetailView.jsx:101). Effort S.
- **[Low] Daily Log gaps.** It holds only crew plus free-text notes: no timed entries, delete, print or export. Every open client runs an auto-lock write every 60 s (DailyLogPage.jsx:152-163). Effort M.
- **[Low] No divisions or hierarchy.** "Division", "District" and "Group" are flat pick-lists. There's no battalion → station → unit structure, and no linking of stations to apparatus for personnel. Effort L.

### Duplicates and obsolete code
- `kpis` array in src/App.jsx:246-255: hard-coded numbers and unused; CommandDashboard has its own.
- Personnel Certifications tab vs Certifications module (two stores).
- Stations and shifts in `profile/main` vs `dropdowns/stations|shifts|apparatusUnits` (three sources, including the apparatus list).
- `trainingCategories` dropdown seeded but unused (Training hard-codes `TRAINING_CATEGORIES`).
- `personnelService.listDepartmentPersonnel` falls back to the legacy `departments/{id}/personnel` collection (personnelService.js:28).
- Training "All Training Records" rows have 8 cells but use the 6-column `.training-row` grid. `.training-row.wide` (styles.css:373) never applies because `wide` is on the table, not the row, so columns misalign.

### Quick wins (under an hour each)
- Hide and mask SSN, birth date, race, ethnicity and marital status when `!canViewPrivateInfo`.
- Complete the `usStates` dropdown.
- Calculate cert `days` from `expires` at render time and in dashboardMetrics; leave out archived and deleted certs.
- Remove or repurpose the header "Upload Certification" button; fix the "Due Soon" and 30/60/90 filters.
- Add `window.confirm` to attachment and cert delete.
- Link Training & Events by `personnelId` (or exact full name) instead of a first-name substring.
- Move error messages out of `success-banner`; drop `forgePersonId` and "API ID" jargon.
- Delete the unused `kpis` constant in App.jsx; fix the `.training-table.wide .training-row` selector.
