## Incident reporting and NERIS

Scope traced: `src/pages/NerisFireReportsPage.jsx`, `src/pages/NerisAnalyticsPage.jsx`, `src/components/neris/*`, `src/lib/neris/*`, `src/lib/nerisSchema.js`, `src/data/neris/*`, `functions/lib/nerisNarrative.js` and `draftNerisNarrative` in `functions/index.js`, `firestore.rules`, `src/hooks/useTenantPersistentState.js`.

**There is no separate incidents record.** `firestore.rules:190` maps an `incidents` collection to the `nerisFireReports` module and `src/lib/tenantPaths.js:20` lists the name, but nothing in `src/` reads or writes it. Every "incident" is one NERIS report stored as an item in the tenant list `departments/{id}/lists/hlfd-rms-neris-fire-reports/items/{id}` (`src/App.jsx:1057`).

### Owner's assumptions vs. code
| Assumption | What the code does |
|---|---|
| Status DRAFT → ACTIVE → COMPLETED → SUBMITTED → APPROVED → LOCKED, plus RETURNED | Statuses are `Draft, In Progress, Needs Review, Returned, Approved, Ready for Submission, Submitted` (`src/lib/neris/workflow.js:1`). There's no ACTIVE, COMPLETED or LOCKED status: `locked` is a separate true/false field. In practice nothing ever sets `Approved`, because the final approval sets `Ready for Submission` (`workflow.js:44-50`). The order is also different: approval comes before submission. |
| Transitions enforced | **Only in the UI.** Rules allow any member of the department to write any field of any report (`firestore.rules:475-477`, where `canWriteModule` checks only department access and that the module is switched on). |
| Numbers `YYYY-######`, unique per dept | The format is `NERIS-YYYY-###` (3 digits). The number is worked out in the browser as the highest number in the loaded list + 1 (`NerisFireReportsPage.jsx:30-39`). There's no counter and no transaction, so two users, or one offline user, can get the same number. Deleting the newest draft frees its number for reuse, although the code comment says numbers are never reused. |
| ~39 modules, 682 fields, 153 value sets, 2,664 options | **39 modules and 682 fields are correct** (`src/data/neris/modules.json`, source "NERIS V1 XLSX (official Nov 2024)"). **There are 69 value sets with 738 options, not 153 and 2,664** (`src/data/neris/valueSets.json`). Fields refer to 86 value-set names, and 20 of them have no data (for example `type_actions_tactics`, `type_yes_no_unknown`, `type_suppress_appliance`, `type_rescue_elevation`, `type_region`), partly because the names don't match exactly. The guided editor uses hand-written fields for only 3 NERIS modules (`mod_fire`, `mod_hazard`, `mod_medical`; `reportModel.js:86-118`) plus some `core_mod_incident` fields. `NERIS_FORM_MODULES` lists 9 modules (`nerisSchema.js:9`). |
| Supervisor review/approve/return | This exists, but any user with `editNerisReports` can approve every stage of their own report. The three review stages (Company Officer → Battalion Chief → RMS Admin) are just three clicks on the same "Approve" button, and no role is checked (`NerisReportEditor.jsx:538-616`). |
| Locking | `locked` is set only by "Record NERIS submission". Any editor can click "Unlock for corrections", which is not restricted to admins and doesn't ask for a reason (`NerisReportEditor.jsx:620`). The rules ignore `locked`. |
| Narrative revisions | No revision history. There's one in-memory "undo" (`previous` state in `NerisAiNarrative.jsx:30,138`), which is lost on reload. |
| Audit history | `workspace.auditLog` sits inside the report and only gets review and unlock entries. Field edits, submission and deletion aren't logged. Any member can rewrite the log. AI drafts write to `departments/{id}/auditLogs` on the server (`functions/index.js:1175`). |
| Units / personnel / apparatus | Units with their own times, crew picked from personnel, and units picked from apparatus all work (`NerisReportEditor.jsx:440-520`). |
| Timestamps | The fields are dispatch, arrival and clear, plus per-unit dispatch, arrival and clear. **There's no en-route or call-received time** in the manual editor; those only come from a CAD import (`cadImport.js:68`). |
| Export / print | There's no print view or PDF of a single report. The CSV exports are only on the Analytics page. |
| Submit to NERIS | There's no API integration. The UI says so plainly ("FORGE doesn't send reports to NERIS automatically yet", `NerisReportEditor.jsx:626`), and "Record NERIS submission" only marks a manual portal entry after a confirmation (`NerisFireReportsPage.jsx:206-211`). I found no claim of certification. The section title "Submit to NERIS" and the Send icon are the only places that could suggest a real submission. |

### Inventory
| Page / feature | Where (file) | Status (1-7) | One-line note |
|---|---|---|---|
| Report list, status tiles, search | `src/pages/NerisFireReportsPage.jsx` | 2 | Loads real tenant data. The page heading says "Incident Reports" but the menu says "NERIS Fire Reports". |
| Start a report dialog | `NerisFireReportsPage.jsx:303` | 2 | Works. The number is generated in the browser, so duplicates are possible. |
| Guided editor (Basics/Response/Scene/Details) | `src/components/neris/NerisReportEditor.jsx` | 2 | Saves through the per-item list. Covers a small part of NERIS's 682 fields. |
| Import from CAD | `NerisCadImportModal.jsx`, `lib/neris/cadImport.js` | 2 | Paste or upload JSON/CSV/XML, parsed in the browser. No live connection to a CAD system. |
| Fill from FORGE records | `lib/neris/autoPopulation.js` | 2 | Fills in occupancy details and the scheduled crew. |
| AI narrative | `NerisAiNarrative.jsx`, `functions/lib/nerisNarrative.js` | 2 | Real Claude call with a daily limit and an audit entry. Any department member can call it, not just editors. |
| Template narrative (offline) | `lib/neris/narrative.js` | 1 | Builds the draft locally. |
| Review / approve / return | `NerisReportEditor.jsx:581-622`, `lib/neris/workflow.js` | 3 | One person can approve every stage. Not enforced on the server. |
| Unlock for corrections | `NerisReportEditor.jsx:620` | 3 | Any editor can unlock, with no reason prompt. |
| Record NERIS submission | `NerisFireReportsPage.jsx:206` | 2 | Manual record only; asks for confirmation first. |
| Attachments | `NerisReportEditor.jsx:548-562` | 1 | Real Storage upload; removing a file soft-deletes it. |
| Delete draft | `NerisFireReportsPage.jsx:197` | 2 | Asks for confirmation. Only the UI limits it to drafts. |
| Offline queue | `lib/neris/offlineSync.js` | 3 | Uses one global localStorage key that isn't scoped to the department or user. |
| NERIS Analytics: NFPA 1710 | `src/pages/NerisAnalyticsPage.jsx`, `lib/neris/analytics.js` | 4 | Call processing is always 0 s, so it always shows 100% compliance. Turnout and travel are empty without a CAD en-route time. |
| NERIS Analytics: Annual Survey | same | 4 | Casualties and property loss always add up to 0 because the field names don't match. Mutual aid is almost always 0. |
| NERIS Analytics: Heat Map | same | 4 | Nothing ever writes latitude/longitude, so the page always shows the empty message. It's also a text list, not a map. |
| NERIS Analytics: Ad-Hoc | same | 2 | Free-text filters only. Column headers are raw keys (`reportNumber`, `incidentTypeSummary`). |
| Role-based approval / numbered revisions / print | — | 6 | Not present. |
| `incidents` collection | `firestore.rules:190`, `src/lib/tenantPaths.js:20` | 7 | Has a rule and a path but nothing uses it. |
| `nerisFireReportSeeds.js`, `lib/neris/validation.js` | `src/data/`, `src/lib/neris/` | 7 | Nothing imports either one. |

### Findings
- **[Demo-blocker] NFPA 1710 tab always shows 100% call-processing compliance** — `secondsBetween(cad.receivedTime || dispatch, dispatch)` gives 0 because nothing sets `receivedTime`, so 0 s ≤ 60 s every time (`src/lib/neris/analytics.js:38`). Turnout and travel need `enrouteTime`, which the editor never collects. Chiefs will read these numbers as real. Fix: skip a metric when its start time is missing, and add en-route and call-received fields. Effort M.
- **[Demo-blocker] Annual Survey casualties and property loss are always 0** — analytics reads `casualties.civilianCount`, `casualties.firefighterCount`, `propertyLoss.propertyLoss` and `propertyLoss.contentsLoss` (`analytics.js:137-141`), but the editor writes `injuries`, `fatalities`, `ffInjuries`, `property` and `contents` (`NerisReportEditor.jsx:300-309`). Mutual aid checks `disciplines.includes("mutual_aid")`, which nothing sets; the editor stores aid in `incident_aid_direction`. Fix: line up the field names. Effort S.
- **[High] Workflow not enforced on the server; one person can author, approve and lock** — the `lists/.../items` rules let any department member write any report, including view-only roles (`firestore.rules:475-477`). The UI lets anyone with `editNerisReports` approve all three review stages and unlock a locked report (`NerisReportEditor.jsx:609-621`). A "Submitted" record can be changed with a direct write. Fix: check the reviewer's role or permission for each stage, and move status changes into a callable function or a dedicated rule. Effort L.
- **[High] Report numbers aren't guaranteed unique** — the number is the highest loaded number + 1 in the browser (`NerisFireReportsPage.jsx:30-39`). There's no transaction or counter, so two users at the same time or an offline user will collide, and deleting the newest draft lets its number be reused. Fix: a counter document (`departments/{id}/counters/nerisReports`) updated in a transaction through a callable. Effort M.
- **[High] The NERIS schema in the repo is incomplete and dated** — 69 value sets with 738 options, not 153 and 2,664. 20 value sets that fields refer to are missing. The source is the Nov 2024 V1 XLSX. The guided editor covers 3 of 39 modules in detail. Don't present "682 fields, 153 value sets" as editor coverage in the demo. Fix: re-sync from the current `ulfsri/neris-framework` and fix the name mismatches. Effort M.
- **[Medium] Offline queue isn't scoped to the department** — the single key `neris-offline-queue` (`offlineSync.js:6`) is merged into whatever department's list is open when the browser comes back online (`NerisFireReportsPage.jsx:110-114`). A creator who switches departments, or a shared device, can push reports into the wrong tenant. Fix: put the department and user in the key. Effort S.
- **[Medium] Audit history can be edited and is incomplete** — `workspace.auditLog` lives inside the report, which any member can write. It records only review and unlock actions. Fix: write events to `departments/{id}/auditLogs` and allow create only (no update or delete). Effort M.
- **[Medium] No narrative revisions and no print/export of a single report** — only an in-memory undo exists. Departments expect a printable or PDF incident report. Fix: keep a `narrative.revisions[]` list and add a print stylesheet or PDF. Effort M.
- **[Medium] Feature flags that do nothing** — `officerApprovalWorkflow`, `aiNarrativeBuilder`, `enhancedEmsModule`, `nerisAdvancedValidation`, `incidentAutoPopulation` and `irwinWildlandIntegration` are defined (`featureFlags.js`, `defaultDepartment.js:78-80`) but never checked. Turning them off changes nothing. Fix: check them or remove them. Effort S.
- **[Low] AI narrative: who can call it and what it sends** — `draftNerisNarrative` checks department access and the plan, but not `editNerisReports`, and it trusts the report object sent by the browser (`functions/index.js:1146-1158`). Privacy handling: the server keeps only listed fields (allowlist). Staff go in by rank and role only. Free text is scrubbed of phones, emails, DOBs, SSNs and capitalised names after role words such as "patient Jane Doe" (`nerisNarrative.js:28-42`). The prompt tells the model never to name civilians. **The street address and occupancy name are still sent** (`nerisNarrative.js:80-81`), and names without a role word in front aren't caught. Fix: require `editNerisReports`, and decide whether to send the address. Effort S.
- **[Low] Heat map tab is a text list with no data source** — nothing collects latitude or longitude (`analytics.js:177-179`). Fix: geocode the address or hide the tab. Effort S–M.
- **[Low] Raw keys shown to users** — the Ad-Hoc column headers are camelCase keys, and the NFPA cards show `callProcessing (sec)` (`NerisAnalyticsPage.jsx:99,205`). The drill-down shows "—s" when a time is missing. Effort S.

### Duplicates and obsolete code
- Two `statusTone` functions with different return values: `workflow.js:96` and `reportModel.js:233`.
- `NERIS_REPORT_STATUSES` is re-exported three times (`workflow.js`, `nerisSchema.js:5`, `NerisFireReportsPage.jsx:20`).
- `src/lib/neris/validation.js` (`validateNerisReport`, `computeCompletionPercentage`) is unused and replaced by `reportModel.checklistProgress`.
- `src/data/nerisFireReportSeeds.js` (`HL-2026-001` sample data) isn't imported anywhere. Delete it so it can't be loaded into a real department.
- The `incidents` collection mapping in `firestore.rules:190` and `tenantPaths.js:20` is unused.
- `src/data/neris/v1/*.xlsx` (14 files) are source spreadsheets that sit in `src/`. Move them out of the app source tree.

### Quick wins (under an hour each)
- Make the analytics field names match the editor's casualty, loss and aid fields.
- Leave call-processing out of the NFPA 1710 results when there's no received time, and label turnout and travel as "needs CAD en-route time".
- Hide the Heat Map tab until coordinates exist.
- Put the department ID in the offline queue key.
- Show "Unlock" and "Approve" only to admins and officers (check `accessAdminRms` or a new `approveNerisReports` permission) as a stopgap until server checks exist.
- Rename the "Submit to NERIS" section to "Record NERIS portal submission".
- Delete `nerisFireReportSeeds.js` and `validation.js`.
