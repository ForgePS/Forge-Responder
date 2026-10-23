# Forge RMS — Current-State System Inventory

**Repository:** `forge-rms` (Firebase project `rms-dashboard-7562e`)  
**Inventory date:** 2026-07-30  
**Method:** Code-verified from `src/`, `functions/`, `firestore.rules`, and related config. No application code was modified for this document.  
**Data model note:** Forge RMS uses **Cloud Firestore** (document collections), not SQL tables. Section 6 lists collections as the database inventory.

### Status labels used in this document

| Label | Meaning |
|-------|---------|
| **Implemented** | Wired UI + service path exists and is reachable under normal gates |
| **Partial** | UI and/or service exists but incomplete, stubbed actions, or dual-store |
| **Mocked** | UI present with placeholder/demo/stub behavior (no real backend effect or deferred delivery) |
| **Hidden** | Exists in code but gated off by module/feature/permission/platform scope |
| **Not implemented** | Nav or architecture placeholder only (falls through to `ModulePage` or empty shell) |

---

## 1. Frontend routes

There is **no React Router** for admin modules. Navigation is string state `current` in `src/App.jsx`, plus a few **path-based shells** in `src/main.jsx` / gateway helpers.

### 1.1 Path-based entry points

| Path / condition | Status | Renders |
|------------------|--------|---------|
| `/{departmentId}/…` gateway | **Implemented** | Tenant scope; syncs URL ↔ active department |
| `/creator-console` or `?view=creator-console` | **Implemented** | Deep-link → module `Creator Console` |
| `/*/alerts` or `/alerts` | **Implemented** | `PublicAlertDashboardPage` |
| `/utility-ack` (+ token) | **Implemented** | `UtilityAckPortalPage` (hydrant damage ack) |
| `/demo` | **Implemented** | `DemoEntryPage` |

### 1.2 Admin module keys (`current ===` in `App.jsx`)

| Module key(s) | Page / component | Status |
|---------------|------------------|--------|
| `Dashboard` | `CommandDashboard` | **Implemented** |
| `Personnel` | `PersonnelPage` | **Implemented** |
| `Certifications` | Inline certifications UI in `App.jsx` | **Implemented** |
| `Training` | Inline training UI in `App.jsx` | **Implemented** |
| `Scheduling` | Schedule/roster UI in `App.jsx` | **Implemented** |
| `Time Sheets` | `TimeSheetsPage` | **Implemented** |
| `Daily Log` | `DailyLogPage` | **Implemented** |
| `Apparatus` | Apparatus UI (may redirect toward Fleet cutover) | **Partial** (legacy + Fleet coexistence) |
| `Fleet Dashboard` … `Fleet Configuration Studio` (full Fleet V2 set) | Matching `Fleet*Page.jsx` | **Implemented** (depth varies by board) |
| `Assets` | `AssetsPageConnected` | **Implemented** |
| `Maintenance` | Legacy work-orders style UI | **Partial** |
| `Hose Testing` | `HoseTestingPage` | **Implemented** |
| `Occupancies` | `OccupanciesMasterPage` | **Implemented** |
| `Configuration Studio` | `InspectionConfigStudioPage` | **Implemented** |
| `Inspections Dashboard` / `Prevention Dashboard` | `InspectionsDashboardPage` | **Implemented** |
| `Work Queue` / `Prevention Work Queue` | `InspectionsWorkQueuePage` | **Implemented** |
| `All Inspections`, `My Inspections` | Matching inspection pages | **Implemented** |
| `Open Violations` | `ViolationsPage` | **Implemented** |
| Code Library leaves (`Search Codes` … `Code Administration`) | `CodeLibraryPages.jsx` exports | **Implemented** (access-gated) |
| `Notices & Certificates` | `InspectionNoticesPage` | **Implemented** |
| `Enforcement` / `Enforcement Cases` | `InspectionEnforcementPage` | **Implemented** |
| `Fire Protection Systems` | `FireProtectionSystemsPage` | **Implemented** |
| `Fees & Payments` | `InspectionFeesPage` | **Implemented** |
| `Inspection Reports` | `InspectionReportsPage` | **Implemented** |
| `Offline & Sync` | `InspectionOfflinePage` | **Partial** (attachment upload stubbed) |
| `Automation & Integrations` | `InspectionAutomationPage` | **Partial** (action delivery stubbed) |
| `Import & Hardening` / `Import & Data Quality` | `InspectionHardeningPage` | **Implemented** |
| `Inspection Queue` / `Inspections` | Legacy `InspectionsPage` (sprint) | **Partial** (classic list dual-store) |
| Preplan leaves (New / Work Queue / All / filters / Templates / ops) | `PreplansModulePages` / `PreplanOperationalPage` / Config Studio | **Partial** (ops surfaces scaffolded) |
| `NERIS Fire Reports` | `NerisFireReportsPage` | **Implemented** |
| `NERIS Analytics` | `NerisAnalyticsPage` | **Implemented** |
| `Analytics` | `AnalyticsPage` | **Implemented** |
| `Messages` | `InternalEmailBoardPage` | **Implemented** |
| `Digital Dashboard` | `DigitalDashboardPage` | **Implemented** |
| Documents quartet (`SOGs / Policies`, `EMS Protocols`, `Forms`, `Uploads`) | `DocumentsPage` | **Implemented** |
| `Creator Console` | `CreatorConsolePage` | **Implemented** (creator-gated) |
| `System Admin` | `AdminControlCenterPage` | **Implemented** |
| Hydrant / damage / water utility leaves | Matching hydrant pages | **Implemented** |
| `Incidents`, `EMS Reports`, `Compliance Export` | Fallback `ModulePage` | **Not implemented** |
| Unmapped `current` | `ModulePage` (“next sprint”) | **Not implemented** |

**External (not an in-app route):** `Academy Class Schedule` opens `FORGE_ACADEMY_CLASS_SCHEDULE_URL`.

### 1.3 Employee portal sections (`employeeSection`)

Handled inside `EmployeePortalPage` (same SideNav pattern, separate from admin `current` when app view is employee):

`My Dashboard`, `My Profile`, `My Schedule`, `Time Card`, `Daily Log`, `My Certifications`, `My Training`, `Academy Class Schedule` (external), `My Documents`, `Open Vacancies`, `Assigned Tasks`, `Apparatus Checks`, `Maintenance Issues`, `Messages`, plus schedule subflows `Leave Requests`, `Shift Trades`.

---

## 2. Navigation items and submenus

Sources: `App.jsx` `navGroups`, `src/data/preventionNav.js`, `src/data/employeePortalNav.js`, filters in `src/lib/navFilter.js`, `src/lib/inspections/preplanNavFeatures.js`.

### 2.1 Admin nav groups

| Group | Items |
|-------|--------|
| (Home) | `Dashboard` |
| **RMS** | Personnel, Certifications, Training, Academy Class Schedule *(external)*, Scheduling, Time Sheets, Daily Log |
| **Fleet** | Fleet Dashboard, Readiness Board, Fleet Defects, Fleet Work Orders, PM Forecast, Fleet Tests, Fuel & Energy, Components & Warranty, Fleet Operations, Accident & Risk, Fleet Procurement, Cost & Replacement, Reporting & Automation, Vendor Portal, Fleet Hardening, All Fleet Assets, Fleet Configuration Studio, Apparatus, Assets, Maintenance, Hose Testing |
| **Prevention** (nested tree) | See §2.2 |
| **Reporting** | NERIS Fire Reports, NERIS Analytics |
| **Documents** | SOGs / Policies, EMS Protocols, Forms, Uploads |
| **Communications** | Messages, Digital Dashboard |
| (System) | Analytics, Creator Console, System Admin |
| **Future / Later** | Incidents, EMS Reports, Compliance Export — **Not implemented** |

### 2.2 Prevention tree (`PREVENTION_NAV_TREE`)

| Branch | Leaves (`name` = route key) |
|--------|------------------------------|
| Overview | Prevention Dashboard, Prevention Work Queue |
| Inspections | Inspections Dashboard, Work Queue, All Inspections, My Inspections, Occupancies, Fire Protection Systems, Inspection Reports, Offline & Sync |
| Code Enforcement | Open Violations, Notices & Certificates, Enforcement Cases, Fees & Payments |
| → Code Library | Search Codes, Browse Codes, Frequently Used, Saved Sections, Local Amendments, Adopted Codes, Code Administration |
| Preplans | Preplan Dashboard, New Preplan, Preplan Work Queue, All Preplans, My Preplans, Draft Preplans, Awaiting Review, Approved Preplans, Templates, Preplan Reports, Nearby Preplans, Target Hazards, Preplan Offline, QR Scan |
| Hydrants | Hydrant Overview |
| → Damage Reports | Open Damage Reports *(label: Open Reports)*, Awaiting Water Company, Repairs in Progress, Ready for Verification, Overdue Repairs, Closed Reports |
| → Water Utilities | Water Company Directory, Water Districts |
| Hydrants (cont.) | Damage Analytics |
| Administration | Configuration Studio, Automation & Integrations, Import & Data Quality |

**Aliases:** Prevention Dashboard → Inspections Dashboard; Prevention Work Queue → Work Queue; Hydrant Overview → Hydrants.

### 2.3 Nav gating

| Gate | Effect | Status |
|------|--------|--------|
| Permissions (`navPermissionMap`) | Hides leaves without permission | **Implemented** |
| Enabled modules (`NAV_MODULE_MAP` + `isModuleEnabled`) | Hides module-mapped leaves | **Implemented** — Fleet V2 leaves are **not** in `NAV_MODULE_MAP` (visible if permission allows) |
| Platform scope | Non-creators empty; creators see Creator Console only | **Implemented** |
| Code Library access | Hides code leaves unless module enabled; creators keep Code Administration | **Implemented** |
| Preplan features (`preplanFeatures`) | Hides mapped preplan leaves; creators bypass | **Implemented** |
| Employee filters | Messages / Daily Log by permission + module | **Implemented** |

---

## 3. Dashboards

| Dashboard | Route / entry | Status |
|-----------|---------------|--------|
| Command Dashboard | Admin `Dashboard` → `CommandDashboard` | **Implemented** |
| Inspections / Prevention Dashboard | Prevention leaves → `InspectionsDashboardPage` | **Implemented** |
| Preplan Dashboard | Preplan leaf → work-queue shell with `queueFilter` | **Partial** (reuses work queue metrics, not a dedicated ops dashboard) |
| Fleet Dashboard | `FleetDashboardPage` | **Implemented** |
| Readiness Board | `FleetReadinessBoardPage` | **Implemented** |
| Digital Dashboard (signage) | `DigitalDashboardPage` | **Implemented** |
| Public Alert Dashboard | Path `/alerts` → `PublicAlertDashboardPage` | **Implemented** |
| Alert Dashboard (internal) | `AlertDashboardPage.jsx` exists | **Hidden / orphan relative to App routes** (not wired as `current===`) |
| Employee My Dashboard | Employee portal | **Implemented** |
| NERIS Analytics | Reporting nav | **Implemented** |
| Hydrant Damage Analytics | Prevention → Hydrants | **Implemented** |
| Analytics (cross-module) | System nav → `AnalyticsPage` | **Implemented** |

---

## 4. Modules and pages

### 4.1 Enablement module keys (`ADMIN_MODULE_OPTIONS`)

`dashboard`, `personnel`, `certifications`, `training`, `scheduling`, `timeSheets`, `dailyLog`, `apparatus`, `assets`, `maintenance`, `hoseTesting`, `occupancies`, `inspections`, `preplans`, `hydrants`, `documents`, `analytics`, `nerisFireReports`, `internalEmail`, `digitalDashboard`, `administration`.

**Note:** Fleet V2 boards are permission-gated but **not** separate Creator module toggles in `ADMIN_MODULE_OPTIONS`.

### 4.2 Page components under `src/pages/` (verified)

**Default-export pages:** AccessDenied, AdminControlCenter, AlertDashboard, CreatorConsole, DailyLog, DemoEntry, DigitalDashboard, EmployeePortal, FireProtectionSystems, Fleet* (many), GatewayNotFound, HornLakeHydrantApp (**orphan** — no live importer), HydrantDamage*, HydrantTesting, Inspection*, InternalEmailBoard, Login, Neris*, OccupanciesMaster, Personnel, PreplanOperational, PublicAlertDashboard, TimeSheets, UtilityAckPortal, Violations, WaterCompanyDirectory, WaterDistricts.

**Multi-export modules:** `CodeLibraryPages.jsx`, `InspectionsModulePages.jsx`, `PreplansModulePages.jsx`, `SprintModulePages.jsx` (Documents, legacy Inspections/Preplans/Hose/Analytics/Assets).

---

## 5. API routes (Cloud Functions) grouped by module

Source: `functions/index.js` exports. All are Firebase **callable** unless noted **HTTP**.

### Communications / SMS
| Export | Type | Status |
|--------|------|--------|
| `sendShiftBroadcastSms` | callable | **Implemented** |
| `pingTwilioConfig` | callable | **Implemented** |

### Active911 / Alert Dashboard
| Export | Type | Status |
|--------|------|--------|
| `active911Connect`, `active911Disconnect`, `active911GetStatus`, `active911SyncAlerts` | callable | **Implemented** |
| `alertDashboardPublicView` | callable | **Implemented** |

### Google APIs
| Export | Type | Status |
|--------|------|--------|
| `googleApisGetStatus`, `googleApisGetClientConfig`, `googleApisSave`, `googleApisClear` | callable | **Implemented** |
| `googleGeocode`, `googleDirections`, `googlePlacesLookup` | callable | **Implemented** |

### Hydrant damage / Jotform
| Export | Type | Status |
|--------|------|--------|
| `jotformDamageWebhook` | **HTTP** | **Implemented** |
| `getJotformDamageSetup`, `getJotformDamagePdf`, `syncJotformDamageSubmissions` | callable | **Implemented** |
| `sendHydrantDamageReport` | callable | **Implemented** |
| `hydrantDamageAckPortalView`, `hydrantDamageAckPortalSubmit` | callable | **Implemented** |

### Identity
| Export | Type | Status |
|--------|------|--------|
| `resolveForgePersonIdentity` | callable | **Implemented** |

### Forge Academy bridge
| Export | Type | Status |
|--------|------|--------|
| `listAcademyConnections`, `upsertAcademyConnection`, `testAcademyConnection`, `setPrimaryAcademyConnection`, `disableAcademyConnection`, `disconnectAcademyConnection` | callable | **Implemented** |
| `listAcademyAuditLogs`, `migrateLegacyForgeAcademySettings` | callable | **Implemented** |
| `academyFindStudent`, `academyGetTranscript`, `academyGetCompletions`, `academyGetCertificates`, `academyGetEnrollments`, `academySubmitEnrollment`, `academySyncPerson` | callable | **Implemented** |
| `listAcademyLinks`, `linkAcademyPerson`, `unlinkAcademyPerson`, `resolveAcademyMatchConflict` | callable | **Implemented** |
| `replayAcademyEvent`, `ingestAcademyEvent`, `listMyAcademyTraining` | callable | **Implemented** |
| `trainingRegisteredWebhook`, `trainingCompletedWebhook` | **HTTP** (public invoker) | **Implemented** |

**Client data path:** Most RMS CRUD is **direct Firestore** from the browser (not REST API routes). There is no Express-style `/api/*` surface in the main app; Cloud Functions cover integrations and privileged ops.

**integration-hub:** Not present as a live package under this repo root at inventory time (Academy backup / other repos may host a hub). Department config UI can store an integration hub URL (`DepartmentConfigPanel`).

---

## 6. Database collections grouped by domain

Firestore paths. Department-scoped unless noted **platform**.

### Platform
`platformCreators`, `platformDepartments`, `platformConfig`, `platformSubscriptionPlans`, `platformSubscriptions`, `codePublications`, `codeNodes`, `codeImportBatches`, `departmentCodeLibraryAccess`, `rmsGateways`, `appData`, `integrationSettings`, `academyTrainingSyncLog`, legacy `rmsData/*`, `hydrantDamageAckTokens`

### Tenant core
`departments/{id}/profile`, `settings`, `users`, `roles`, `dropdowns`, `auditLogs`, `lists/{listKey}`, `notifications`, `internalEmails`, `public`

### Legacy list documents (`LIST_KEYS` → `departments/{id}/lists/{key}`)
Personnel, certifications, training, apparatus, work-orders, assets, documents, occupancies, inspections, preplans, hose-tests, schedule-days, roster, leave/overtime/vacancy/shift-trade/call-shift lists, daily-logs, time-cards, digital-dashboard*, active911-alerts, alert-dashboard-config, alert-business-directory, neris-fire-reports.

### Prevention / inspections (enterprise subcollections)
`inspectionSettings`, `inspections`, `occupancies`, `inspectionAuditEvents`, `inspectionTypes`, `inspectionTemplates`, `inspectionTemplateVersions`, `codeSets`, `codeSections`, `localAmendments`, `adoptedCodeProfiles`, `codeSavedSections`, `codeSearchHistory`, `codeExtractionIssues`, `violationCatalog`, `violations`, notices/certificates/deliveries, enforcement/citations/appeals/corrections/reinspections, FPS + impairments/deficiencies/tests/contractors, fees/invoices/payments/adjustments/schedules, saved/scheduled reports + runs, device policies, automations/webhooks/workflows/adapters/NERIS mappings/import batches/hardening checks, calendar events

### Preplans (enterprise)
`preplans`, `preplanRevisions`, `preplanTemplates`, `preplanTemplateVersions`, `preplanSymbolLibraries`, `preplanDiagrams`, `preplanVerifications`, `preplanDropdownLibraries`, `preplanDropdownOptions`, `preplanBuildings`, `preplanFiles`, `preplanQrTokens`

### Fleet V2
All `fleet*` collections enumerated in `src/lib/fleet/paths.js` / `firestore.rules` (assets, defects, work orders, PM, fuel, telematics, procurement, reporting, hardening, etc.)

### Hydrants / damage
Department damage module collections (`waterCompanies`, `hydrantDamageReports`, … per `src/lib/hydrantDamage/paths.js`).  
**Root-level legacy (security concern):** `preFirePlans` (**public read**), `hydrants`, `hydrantInspections`, `hydrantFlowTests`, `dailyActivity`, `hoseTests` — authenticated write, weak tenancy vs department-scoped model.

---

## 7. Permissions and roles

### 7.1 Roles (`src/data/defaultRoles.js`)

| Role id | Name | Status |
|---------|------|--------|
| `creator` | Creator | **Implemented** (full Creator permission set) |
| `fireChief` | Fire Chief (broad admin) | **Implemented** |
| `firefighter` | Firefighter (employee-leaning) | **Implemented** |
| `readOnly` | Read only | **Implemented** |
| `itAdmin` | IT Admin | **Implemented** |

Tenant roles are stored in `departments/{id}/roles` and merged with per-user overrides.

### 7.2 Permission keys

Canonical labels: `ADMIN_PERMISSION_LABELS` in `src/data/adminRegistry.js` (keys = `Object.keys(CREATOR_PERMISSIONS)`). Groups include:

- Platform / system admin  
- Personnel & training  
- Scheduling / daily log  
- Fleet & assets (broad Fleet V2 matrix)  
- Documents & prevention (inspections, violations, preplans, FPS, fees, offline, automation, hardening, code library)  
- Hydrants & damage  
- NERIS  
- Access portals / leave / trades / vacancies / maintenance  
- Internal email / digital dashboard  
- Academy integration matrix (`academyIntegrations*`, person link/search, transcript, enrollment, sync, audit)

Fine-grained inspection/preplan helpers also live in `src/lib/inspections/inspectionPermissions.js`.

---

## 8. Workflow status enums

| Domain | Enum / values | Source |
|--------|---------------|--------|
| Inspections | `draft`, `scheduled`, `in_progress`, `awaiting_approval`, `completed`, `cancelled`, `archived`, `overdue` | `INSPECTION_STATUS_VALUES` |
| Violations | `open`, `corrective_action_submitted`, `reinspection_scheduled`, `closed`, `dismissed`, `escalated` | `VIOLATION_STATUS_VALUES` |
| Preplans | `draft` … `cancelled` (+ aliases mapped via `PREPLAN_STATUS_ALIASES`) | `PREPLAN_STATUSES` |
| Preplan revisions | `draft`, `in_review`, `returned`, `approved`, `published`, `superseded` | `PREPLAN_REVISION_STATUSES` |
| Preplan operational validity | `current`, `verification_due`, `verification_overdue`, `superseded`, `unavailable` | `PREPLAN_OPERATIONAL_VALIDITY` |
| Config lifecycle | `draft`, `published`, `archived` | `CONFIG_LIFECYCLE_STATUSES` |
| Enforcement orders | `draft`, `issued`, `active`, `lifted`, `violated`, `superseded`, `void` | `ENFORCEMENT_ORDER_STATUSES` |
| Citations | `draft`, `issued`, `served`, `paid`, `appealed`, `dismissed`, `void` | `CITATION_STATUSES` |
| Appeals | `filed` … `closed` | `APPEAL_STATUSES` |
| Correction submissions | `submitted` … `reinspection_requested` | `CORRECTION_SUBMISSION_STATUSES` |
| Reinspections | `scheduled`, `in_progress`, `completed`, `no_access`, `cancelled` | `REINSPECTION_STATUSES` |
| Fees / invoices / payments | fee + invoice + payment status sets | `feeDefaults.js` |
| FPS | system / test / impairment statuses | `fpsDefaults.js` |
| Hydrant damage reports | Large set (`draft` … `escalated`) + repair/email/operational statuses | `hydrantDamage/defaults.js` |
| NERIS reports | `Draft`, `In Progress`, `Needs Review`, `Returned`, `Approved`, `Ready for Submission`, `Submitted` | `NERIS_REPORT_STATUSES` |
| Fleet | Defect, PM due, accident, insurance, roadside, procurement, automation, integration statuses | `src/lib/fleet/*Defaults.js` |
| Notifications | `unread` / `read` | `notificationService.js` |
| Offline queue | `queued`, `syncing`, `failed`, stub `uploaded` | inspection/preplan offline queues |

---

## 9. Approval workflows

| Workflow | Happy path | Status |
|----------|------------|--------|
| **Inspection approval** | Conduct → optional `awaiting_approval` → `approveInspection` → completed | **Implemented** |
| **Preplan review/publish** | Draft/survey → submit review → approve → publish → operational; return/revision/verify | **Implemented** (enterprise service) |
| **NERIS multi-stage review** | Author → company officer → battalion → admin → submission (`REVIEW_STAGES` + `applyReviewAction`) | **Implemented** |
| **Leave / shift trade / vacancy** | Employee submit → command approve/deny (portal + audit/notifications) | **Implemented** (scheduling lists) |
| **Hydrant damage verification** | Utility ack → repair → FD verify/close | **Implemented** |
| **Academy enrollment approve** | Permission `academyEnrollmentApprove` exists | **Partial** (permission + callables; UI depth varies) |
| **Fleet work order / defect close** | Fleet boards with status transitions | **Implemented** (module-specific) |
| **Enforcement appeals** | Appeal status machine | **Implemented** (staff-mediated) |

---

## 10. Notification types

There is **no closed enum** of notification types. Records in `departments/{id}/notifications` use free-form `title`, `message`, `module`, optional `recordId` / `personnelId`, status `unread|read`.

**Verified producers:**

| Producer | Module / context | Status |
|----------|------------------|--------|
| Employee portal vacancy pickup / related | Scheduling | **Implemented** |
| Fleet automation defaults include `notify_in_app` action type | Fleet reporting defaults | **Partial** (catalog/automation wiring varies) |
| Subscription expiry banners | UI messaging (not always persisted notifications) | **Implemented** (banner) |
| Admin “System Records” can edit `notifications` collection | Admin Control Center | **Implemented** |

**Not implemented as a typed catalog:** push/email notification taxonomy, per-event subscription preferences UI.

---

## 11. Reports

| Report surface | Catalog / behavior | Status |
|----------------|-------------------|--------|
| Inspection Reports board | `STANDARD_INSPECTION_REPORT_CATALOG` (inspections by status/type, violations, workload, pass/fail, fee aging, revenue, FPS impairments, preplan status, enforcement orders) | **Implemented** (CSV/JSON export paths) |
| Scheduled inspection reports | Runner records `lastRunAt`; **email delivery stub** | **Partial / Mocked** delivery |
| Fleet Reporting & Automation | Saved reports / runs / automations collections | **Implemented** (depth varies) |
| NERIS Fire Reports + Analytics | List + analytics page | **Implemented** |
| Hydrant Damage Analytics | Dedicated page | **Implemented** |
| Analytics page | Cross-module summary | **Implemented** |
| Preplan Reports nav leaf | Routes to work-queue shell with filter | **Partial** |
| Compliance Export (Future nav) | `ModulePage` | **Not implemented** |

---

## 12. Integrations

| Integration | Surface | Status |
|-------------|---------|--------|
| Firebase Auth + Firestore + Storage | Core platform | **Implemented** |
| Twilio SMS | Shift broadcast + ping | **Implemented** |
| Active911 | Connect/sync + alert dashboard | **Implemented** |
| Google APIs (Maps/Geocode/Directions/Places) | System Admin + client helpers | **Implemented** |
| Jotform damage form | Webhook + sync + PDF + embed | **Implemented** |
| Forge Academy | Callables + training webhooks + Admin Training Academies panel | **Implemented** |
| ImageTrend Elite (hydrants UI fields) | Placeholder inputs in Hydrant Testing | **Mocked / Not connected** |
| Digital Dashboard media (OneDrive/SharePoint/local server) | Source panels | **Partial** (URL/path based; depends on config) |
| Social / web / gallery sources | Digital Dashboard | **Partial** |
| Inspection webhooks / adapters / NERIS mappings | Automation board | **Partial** (stubs for delivery) |
| Fleet telematics / CAD / NERIS mappings | Fleet collections + boards | **Partial** |
| Integration Hub URL on department settings | Config field | **Partial** (URL stored; hub package not in this repo root) |

---

## 13. Unfinished, hidden, placeholder, or mocked features

| Item | Evidence | Label |
|------|----------|-------|
| Future nav: Incidents, EMS Reports, Compliance Export | `ModulePage` placeholder copy | **Not implemented** |
| Employee Assigned Tasks | Empty help text only | **Mocked** |
| Employee Apparatus Checks “Submit Daily Check” | Writes audit log only | **Partial / Mocked** |
| Offline attachment upload | Marked `uploadMode: "stub"` | **Mocked** |
| Inspection automation action delivery | “action delivery stubbed” | **Mocked** |
| Scheduled report email | “email delivery stub” | **Mocked** |
| Payment gateways | Fees UI: staff-mediated; gateways deferred | **Not implemented** |
| Public correction / contractor portals | Explicitly deferred in UI copy | **Not implemented** |
| Preplan CAD canvas | Checklist only; CAD deferred | **Not implemented** |
| Preplan operational Nearby map overlay | Copy notes Phase 5 map deferred | **Partial** |
| Preplan legacy migration | Dry-run plan only (`preplanMigration.js`) | **Not implemented** |
| AlertDashboardPage | File present, not routed from App | **Hidden** |
| HornLakeHydrantApp | Orphan page | **Hidden** |
| Elite hydrant connection fields | Placeholder until agency confirms method | **Mocked** |
| Classic `LIST_KEYS` inspections/preplans/occupancies vs enterprise collections | Dual stores | **Partial** |
| Root `preFirePlans` public-read | Rules gap | **Partial** (security debt) |

---

## 14. Desktop-only or mobile-only pages

**No dedicated mobile-only or desktop-only route gates** were found (no `isMobile` route split).

| Observation | Label |
|-------------|-------|
| Responsive CSS exists (e.g. time-card, schedule, employee-portal media queries) | **Implemented** layout adaptation |
| Dense admin tables / Config Studio / Fleet boards are desktop-oriented UX | **Partial** mobile usability (not blocked) |
| Public alert dashboard / utility ack / digital signage are display-oriented | **Implemented** (not phone apps) |
| Preplan Offline / QR Scan leaves are scaffolds for field use | **Partial** (not a separate mobile app) |

---

## 15. Screenshots of primary screens

**Not captured in this inventory pass.** Capturing authenticated UI screenshots requires a live signed-in session against a tenant and was out of scope for a code-only verification.

**Primary screens recommended for a follow-up capture pack:**

1. Login / gateway tenant entry  
2. Command Dashboard  
3. Creator Console (platform + department workspace)  
4. System Admin Control Center  
5. Personnel  
6. Scheduling  
7. Fleet Dashboard  
8. Inspections Dashboard + Work Queue  
9. Occupancies  
10. Code Library Browse  
11. Preplan Work Queue + detail  
12. Hydrant Overview + Damage Open Reports  
13. NERIS Fire Report workspace  
14. Digital Dashboard editor  
15. Employee My Dashboard  
16. Public Alert Dashboard  
17. Utility Ack portal  

*(No screenshot files are attached to this document.)*

---

## 16. Known technical debt and incomplete migrations

| Debt | Detail | Label |
|------|--------|-------|
| Dual data stores | Classic `lists/hlfd-rms-*` vs enterprise subcollections (inspections, occupancies, preplans) | **Partial** migration |
| Legacy apparatus ↔ Fleet assets | Cutover/coexistence; migration reports collection exists | **Partial** |
| Hydrant `preFirePlans` vault | Separate from enterprise `preplans`; public-read rules; migration plan only | **Incomplete** |
| Root-level hydrant collections | Weak tenancy vs `departments/{id}/…` | **Debt** |
| LIST_KEYS `hlfd-rms-*` prefix | Historical Horn Lake naming retained globally | **Debt** |
| Fleet V2 not in module catalog | Permissions exist; Creator module toggles omit Fleet boards | **Debt** |
| Offline attachment / automation / report email stubs | Documented stubs in services | **Debt** |
| Orphan pages | `HornLakeHydrantApp`, unwired `AlertDashboardPage` | **Debt** |
| Academy legacy settings migration callable | Exists for cutover from older settings shape | **Partial** |
| Preplan feature allowlist on platform | `availablePreplanFeatures` supported; default `null` = all allowed | **Implemented** with soft adoption |

---

## 17. Authentication and tenant-selection flow

**Status: Implemented** (with recovery paths).

1. **Firebase Auth** email/password (`AuthContext` → `signInWithEmailAndPassword` / register).  
2. On auth state change, resolve **active department** via gateway URL / storage (`resolveActiveDepartmentId`, `syncGatewayUrl`).  
3. Load **membership** `departments/{departmentId}/users/{uid}` + **roles map**; merge permissions (`mergeMembershipPermissions`).  
4. **Platform creators** get elevated permissions (`CREATOR_PERMISSIONS` / `loadPlatformCreator`); can access platform scope `__forge-platform__`.  
5. **Membership recovery / bootstrap** for creators and eligible admins (`membershipRecovery`, demo `ensureDemoAccess`).  
6. **Tenant switch:** creators switch departments from Creator Console / department switcher; non-creators typically fixed to membership department.  
7. Unauthenticated users see `LoginPage`; unknown gateway → `GatewayNotFoundPage`; denied module → `AccessDeniedModule` / `AccessDeniedPage`.  
8. App view toggle **Admin RMS** vs **Employee Portal** based on permissions.

---

## 18. Creator Console and Tenant Admin capabilities

### Creator Console (`CreatorConsolePage`) — **Implemented** (creator-gated)

Tabs / capabilities:

| Area | Capability |
|------|------------|
| Platform Settings | Branding, available modules, preplan feature allowlist (`PlatformConfigPanel`) |
| Department Modules | Enable/disable modules per branch (`DepartmentModulesPanel`) |
| Departments | List/create/repair/prune branches (`CreateDepartmentPanel`, `DepartmentBranchesPanel`) |
| Subscriptions | Plans / expirations (`PlatformSubscriptionsPanel`) |
| Messages | Platform-scoped messaging (when not in platform-only tab restrictions) |
| Workspace switch | Platform scope ↔ department branch |

### Tenant Admin / System Admin (`AdminControlCenterPage`) — **Implemented**

Collapsible sections:

- Department & Branding (`DepartmentConfigPanel`)  
- NERIS Field Settings  
- Integrations & API Keys (Google, Active911, Jotform damage, Training Academies)  
- Module Data (`DataEditorPanel`)  
- System Records (users/roles/dropdowns/notifications editors)  
- Permissions (roles + user overrides)  
- Audit Logs  

Requires `accessAdminRms` / system settings / creator as applicable.

---

## 19. Global search behavior

**Status: Partial.**

- Top bar `global-search` input in admin shell (`App.jsx`) binds to React state `query`.  
- Placeholder claims: “Search personnel, apparatus, occupancies, training, inspections…”.  
- **Actual behavior:** `query` is passed into many pages as a **local filter prop** (client-side string match on loaded rows). It is **not** a cross-module indexed search service.  
- Clearing/`setQuery("")` occurs on some navigations.  
- Many modules also have their **own** search boxes (hydrants, code library, NERIS selects, department branch filter).  
- Code Library has dedicated search + history collections.  
- **No** command palette / omnibox result aggregator.

---

## 20. Task, notification, and audit behavior

### Tasks
| Surface | Behavior | Status |
|---------|----------|--------|
| Employee “Assigned Tasks” | Placeholder copy only | **Mocked** |
| Scheduling vacancies / leave / trades | Real list workflows + approvals | **Implemented** |
| Inspection / preplan / damage work queues | Queue UIs driven by record status | **Implemented** |
| Fleet defects / work orders | Operational task-like boards | **Implemented** |

### Notifications
| Behavior | Status |
|----------|--------|
| Persist to `notifications` collection; unread/read | **Implemented** |
| Create via `createNotification` / `createPersonnelNotification` | **Implemented** |
| Typed event catalog / preferences / push | **Not implemented** |
| Admin can browse/edit notifications as system records | **Implemented** |

### Audit
| Stream | Status |
|--------|--------|
| Department `auditLogs` via `writeAuditLog` / `listAuditLogs` (Admin Audit section) | **Implemented** |
| Inspection-domain `inspectionAuditEvents` / `writeInspectionAuditLog` (often `module: "Preplans"` etc.) | **Implemented** |
| Fleet `fleetAuditEvents` | **Implemented** |
| Hydrant damage audit events | **Implemented** |
| NERIS in-report `workspace.auditLog` | **Implemented** |
| Academy audit callables | **Implemented** |

---

## Appendix A — Evidence index (primary files)

| Area | Paths |
|------|-------|
| Routing / nav | `src/App.jsx`, `src/main.jsx`, `src/data/preventionNav.js`, `src/data/employeePortalNav.js`, `src/data/adminRegistry.js`, `src/lib/navFilter.js` |
| Auth / tenant | `src/context/AuthContext.jsx`, `src/context/TenantContext.jsx`, `src/lib/gatewayRouting.js`, `src/lib/tenantPaths.js` |
| Permissions / roles | `src/data/creatorPermissions.js`, `src/data/defaultRoles.js`, `src/data/adminRegistry.js`, `src/lib/permissions.js` |
| Functions | `functions/index.js` |
| Rules / collections | `firestore.rules`, `src/lib/**/paths.js`, `src/lib/tenantListKeys.js` |
| Status enums | `src/lib/inspections/*.js`, `src/lib/hydrantDamage/defaults.js`, `src/lib/neris/workflow.js`, `src/lib/fleet/*Defaults.js` |

---

*End of verified current-state inventory. Update this document when routes, collections, or function exports change.*
