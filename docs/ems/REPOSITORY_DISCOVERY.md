# Forge EMS Management — Repository Discovery

Status: discovery only, no code changed · 2026-11-19
Spec: "Forge Responder – EMS Management, Complete Technical Implementation Specification" (Parts 1–30).
Related: [EMS_SUITE_PLAN.md](EMS_SUITE_PLAN.md) (Phases 7–8 already sketch EMS inventory and regulatory tracking),
[EPCR_STATUS.md](EPCR_STATUS.md).

The spec is written for a relational stack (tables, migrations, foreign keys, row locks, cascading deletes).
Forge is not that stack. Section 2 describes how each relational requirement maps onto what Forge actually
uses, and that mapping drives every later decision.

---

## 1. Architecture and technology stack

| Layer | What Forge uses | Where |
|---|---|---|
| Frontend | React 19 + Vite 8, plain JSX + JSDoc (no TypeScript), lucide-react icons, own CSS theme (light/dark) | `src/`, `src/modern-theme.css`, `src/theme/` |
| Field app | Offline-first PWA, IndexedDB `forge-field`, per-record sync engine | `src/field/` |
| Backend | Firebase Cloud Functions v2 (Node 22), 123 exports, thin wrappers over `functions/lib/*` | `functions/index.js`, `functions/lib/` |
| Database | Cloud Firestore, every tenant record under `departments/{departmentId}/…` | `firestore.rules`, `firestore.indexes.json` |
| Files | Cloud Storage, `departments/{id}/**` | `storage.rules` |
| Auth | Firebase Auth (email/password), optional TOTP second factor | `src/context/AuthContext.jsx`, `src/lib/twoFactor.js` |
| Email / SMS | Resend → SendGrid (`functions/lib/mailer.js`), Twilio (`sendShiftBroadcastSms`) | |
| PDF | `pdfkit` on the server (`functions/lib/damageFormPdfGenerator.js`); PCR print is HTML | |
| Export | CSV (`src/lib/downloadTextFile.js`), XLSX (`xlsx` package), NEMSIS XML | |
| AI | Forge AI capability registry, server-side only | `functions/lib/forgeAi/` |
| Tests | `node:test` + `@firebase/rules-unit-testing` + emulator (`demo-forge-rms`) | `tests/unit`, `tests/rules`, `tests/functions` |
| CI | GitHub Actions: lint, build, functions load smoke, unit, rules, functions tests | `.github/workflows/ci.yml` |
| Deploy | `firebase deploy`; projects `rms-dashboard-7562e` (prod), `forge-rms-staging` | `.firebaserc`, `firebase.json`, `docs/rms/staging.md` |

Feature modules are vertical slices, the way Fleet V2 is built (`docs/fleet/architecture.md`):
paths → defaults → service (`src/lib/<module>/`) → page (`src/pages/`) → rules → tests → deploy notes.

## 2. Mapping the spec's relational model onto Firestore

| Spec requirement | Forge equivalent |
|---|---|
| Tables (Part 16) | Collections under `departments/{id}/`, camelCase prefixed names (e.g. `emsInventoryTransactions`), each with an explicit rule block |
| Migrations (Part 25) | No schema migrations. New collections need no migration. Data moves (e.g. classic `hlfd-rms-assets` list → equipment collection) follow the Fleet pattern: dry-run/apply script, never delete the source, batch-tagged rollback (`src/lib/fleet/fleetMigrationService.js`) |
| Tenant column + index | The document path *is* the tenant. Rules enforce it (`canAccessDepartment`, `firestore.rules:109`); callables enforce it (`assertDepartmentAccess`, `functions/lib/access.js:30`) |
| Foreign keys | String ids, validated in the server service that writes the record. No database-level referential integrity exists |
| Row locks / atomic balance update | Firestore transactions in a callable: read balance doc → validate → create ledger doc → update balance doc. Concurrent writers retry automatically (optimistic concurrency) |
| Immutable ledger | Rules `allow create, update, delete: if false` for browsers; only the Admin SDK in callables writes. Same posture as `pcrs/{id}/revisions` |
| Idempotency key + unique constraint | Deterministic document id + `ref.create()` inside the transaction (fails if it exists). Precedent: help-desk claim (`functions/lib/helpDesk.js:670`), heat-zone event ledger (`functions/lib/heatZone/service.js:306`), field record fixed ids |
| Cascading deletes forbidden | Firestore never cascades; rules refuse deletes on finalized records |
| Outbox / inbox (Part 11.7) | None exists. Build an inbox collection keyed by `{source}-{recordId}-{version}` written by a Firestore trigger |
| Background jobs | Firestore triggers (`onDocumentWritten`) and `onSchedule`. Only one scheduled job today (`billingLifecycleDaily`, `functions/index.js:898`) |
| Cryptographic integrity | SHA-256 over canonical JSON already used for posted PCRs (`postedHash`). Extend to a per-ledger hash chain |
| Pagination / indexed search | Firestore queries with `limit` + cursors; composite indexes in `firestore.indexes.json`. No full-text search |

## 3. Tenancy, authentication and authorization

**Tenancy.** Membership doc `departments/{id}/users/{uid}` (`status`, `role`, `roleIds[]`, `permissions{}` overrides,
`personnelId`). No custom claims. Active department resolved by `resolveActiveDepartmentId()`
(`src/lib/gatewayRouting.js:198`); `useTenant()` exposes `departmentId`, `entitlements`, `isModuleEnabled(key)`.

**Authentication.** Email/password. TOTP exists but is optional everywhere (`SECOND_FACTOR_ENFORCED=false`).
Reauthentication exists on the client only (`confirmPassword`, `src/lib/twoFactor.js:70`, `reauthenticateWithCredential`).
No server-verified step-up: nothing checks `auth_time`. **Gap for Part 9.9**: controlled-substance callables must
verify a recent `auth_time` on the ID token themselves (e.g. ≤ 5 minutes), so a fresh password re-entry is
proven to the server, not just to the browser. This is password reauthentication, not 2FA.

**Permissions.** Flat boolean map, camelCase `verbNoun` keys (`editPcrs`, `viewFleetDefects`). The spec's dotted
names (`ems.inventory.view`) and the EMS plan's (`pcr.write`) do not match the codebase; EMS keys will be camelCase
(e.g. `viewEmsInventory`, `witnessControlledSubstances`). Server truth is `departments/{id}/memberGrants/{uid}.permissions`
(true keys only), computed by `functions/lib/memberGrants.js:59`. Rules check `memberCanAny` / `canManageModule`
(`firestore.rules:143,151`); callables check `assertMemberPermission` (`functions/lib/access.js:64`); the UI uses
`hasPermission(permissions, key)` (`src/lib/permissions.js:159`).

Adding one permission touches: `src/data/creatorPermissions.js`, `src/data/adminRegistry.js` (labels + groups),
`src/data/defaultRoles.js`, `functions/lib/defaultRolePermissions.json` (test-enforced equal), `firestore.rules`
key-group helper, `src/lib/permissions.js` nav map, rules tests, and any callable.

**Roles.** Built-ins: creator, fireChief, battalionChief, companyOfficer, firefighter, readOnly, itAdmin. The spec's
EMS roles (Supply Officer, Controlled Substance Manager, Auditor, …) become **department-defined roles** built from
EMS permissions, with suggested templates. That avoids hard-coding job titles (Part 18).

**Modules.** Module key `ems` exists (ePCR). Registering a module touches the four places
`tests/unit/moduleCatalog.test.mjs` checks: `ADMIN_MODULE_OPTIONS`, `functions/lib/moduleCatalog.js` `MODULE_KEYS`,
`COLLECTION_MODULES`, and the generated `collectionModule()` map in `firestore.rules:493-562`. Navigation: `navGroups`
(`src/App.jsx:226`) filtered by permission and by `NAV_MODULE_MAP`.

## 4. Existing records the EMS module must reuse

| Domain | Existing record | Notes for EMS |
|---|---|---|
| Vehicles | `fleetAssets` (`src/lib/fleet/fleetAssetService.js:100`) with status, readiness state, restriction, last check | EMS vehicle profile = extra fields or a 1:1 `emsVehicleProfiles/{fleetAssetId}`. Never a second vehicle record. Classic `lists/hlfd-rms-apparatus` still feeds some screens |
| Vehicle status history | `fleetStatusEvents`, `applyFleetStatusDecision` (`fleetStatusControlService.js:117`) | Reuse for Part 5.2 transitions |
| Readiness | `deriveReadinessState` + score (`fleetReadinessService.js:10`) | Extend with configurable EMS rules (Part 5.3) |
| Defects | `fleetDefects`; statuses include `ready_for_verification`, `corrected`; category "EMS equipment" exists | Reuse for Part 10.5 deficiencies; add equipment/inventory references |
| Work orders / maintenance | `fleetWorkOrders` (`awaiting_parts`, `ready_for_qc`), parts lines, QC; maintenance issue board (`MaintenanceIssuesPage.jsx`) | Reuse for Part 13; equipment work orders need an equipment reference |
| Preventive maintenance | `fleetPmPrograms`, `fleetPmSchedules`, forecast, auto work orders | Reuse; extend to equipment assets |
| Procurement | `fleetProcurementRequests` (vehicle-oriented, free-text PO field); `fleetShopVendorService.js` vendors | No PO, line-item, approval chain or receiving. Generalize carefully or build EMS procurement sharing the vendor directory |
| Equipment assets | Classic `lists/hlfd-rms-assets` (`id, name, category, serial, location, assigned, inspection, value, status`) | Too thin and list-stored. Needs a real collection; migrate the list rows with the Fleet migration pattern |
| Stations | Not a collection: `stationDetails[]` on department profile/settings (`src/lib/stationProfile.js`) | References are station names. Inventory locations get their own collection that points at a station name |
| Personnel | `lists/hlfd-rms-personnel` (+ `personnel` subcollection fallback, private fields in `personnelPrivate/`) | Reference by `personnelId`; user ↔ person link is `users/{uid}.personnelId` |
| Credentials | `lists/hlfd-rms-certifications` (status Active / Due Soon ≤30d / Expired) and `person.emsCredentials[]` (Due Soon ≤90d) | Two overlapping stores already. EMS credentials should extend Certifications, not add a third |
| Crew assignment | `resolvePersonScheduledApparatus` (`src/lib/schedulingRoster.js:916`), `crewSlotsByUnit`, `isAmbulanceUnit` | Powers "My Assigned Unit". Unit name ↔ `fleetAssets` by canonical name / `legacyApparatusId` |
| ePCR | `departments/{id}/pcrs/{id}`; NEMSIS under `pcr.nemsis`; meds = `eMedications.MedicationGroup` rows, procedures = `eProcedures.ProcedureGroup` rows; `postedHash`, amendments, revisions | Read via `groupRows` / `getValue` (`src/lib/nemsis/pcrModel.js`). PHI: crew-only reads |

## 5. Existing check-off implementation (Part 10)

There are **two** check-off engines today. The spec forbids building a third.

| | Fleet checklists | Field check-offs |
|---|---|---|
| Code | `src/lib/fleet/fleetChecklistService.js`, `fleetCheckService.js`, builder `ApparatusCheckSetupPage.jsx` | `src/field/checkoffModel.js`, `FieldAppSettingsPanel.jsx` |
| Collections | `fleetChecklistTemplates`, `…TemplateVersions` (immutable), `fleetChecks` | `fieldCheckoffLists`, `fieldCheckoffs` |
| Item types | heading, instruction, pass_fail(_na), yes_no, text, number, meter, fuel | count vs par + earliest expiration only |
| Target | `fleetAssetId` (real link) | free-text unit/station name |
| Failure handling | one `fleetDefect` per failed item, `failAction` → restricted / out of service | restock list + admin "Mark restocked" |
| Missing | template assignment to classes/units, schedules, overdue, supervisor sign-off | defects, verification, schedules, lots |

**Recommendation.** Make the Fleet checklist engine the single engine. Add item types to it: inventory count vs par,
expiration check, equipment reference/scan, medication reference, controlled-substance count, seal check, signature,
photo, date/time, dropdown, multi-select. Add template assignment (class, unit, station, equipment category),
schedules and supervisor verification there. Keep field check-offs working: re-point supply lists at the inventory
catalog, then retire them only after the owner approves.

## 6. Events, notifications, jobs, storage, AI

- **Events.** No event bus or outbox. The only "PCR posted" hook is `checkPcrOnPost` (`functions/index.js:1115`,
  `pcrCheck.shouldCheckOnPost`). EMS adds a second trigger on the same path that writes an idempotent inbox doc
  (`emsEpcrEvents/{pcrId}-{postedHash}`). Only **posted** reports feed inventory. Drafts are clinical work in
  progress, which satisfies Part 9.5 ("a medication event must not automatically constitute a deduction").
- **Notifications.** In-app `departments/{id}/notifications` (client-written today, `src/lib/notificationService.js`),
  email via `mailer.js`, SMS via Twilio. No push (FCM). No "notify everyone holding permission X" helper. Build it on
  `memberGrants` (`permissions.<key> == true`), server-side.
- **Jobs.** Add one scheduled EMS monitor (expirations, reorder points, overdue checks, credential expiry, stale
  approvals), idempotent per department per day.
- **Storage.** `storage.rules:69` lets every member read everything under `departments/{id}/**`. Controlled-substance
  and PHI attachments need their own path with narrower read rules.
- **Documents.** Purchase-order PDFs via `pdfkit` on the server, following `damageFormPdfGenerator.js`.
- **AI.** `functions/lib/forgeAi/capabilities.js` registry with per-capability permission and module gates. Add a
  read-only `emsOps` capability. Forge AI does not read `pcrs` today; the EMS capability should not either.
- **QR.** `qrcode` generates codes already. There is **no scanning** anywhere. Use the browser `BarcodeDetector`
  where it exists and add one small decoder dependency as a fallback (needs owner approval).
- **Offline.** The field sync engine is idempotent by fixed ids. Adding a record kind: `fieldKinds.js` →
  screen → `SYNC_HANDLERS` (`fieldSyncHandlers.js:959`). Controlled-substance actions must not finalize offline
  (Part 19.4); they can be queued only as drafts that a callable finalizes online.

## 7. Recommended integration points (summary)

| Spec part | Build on |
|---|---|
| 5 Fleet | `fleetAssets`, `fleetStatusEvents`, `fleetReadinessService` + `emsVehicleProfiles` |
| 6 Equipment | New `emsEquipment` collection (migrated from `lists/hlfd-rms-assets`), `fleetDefects`, `fleetWorkOrders`, PM |
| 7 Supplies | New inventory core: catalog, locations, lots, balances, ledger (callables only) |
| 8 Medications | Same inventory core, `itemClass: medication`, plus recalls |
| 9 Controlled substances | Separate collections + callables, hash-chained ledger, witness attestations, `auth_time` check |
| 10 Check-offs | Fleet checklist engine, extended item types and assignments |
| 11 ePCR | Posted-PCR trigger → inbox → reconciliation + restock proposals |
| 12 Procurement | Shared vendor directory, new request/PO/receipt collections, receiving writes ledger |
| 13 Maintenance | `fleetWorkOrders` + PM, equipment reference |
| 14 Credentials | Certifications (merge with `person.emsCredentials`), explicit `emsAuthorizations` |
| 15 Handoff | New `emsShiftHandoffs`, reads inventory/seal/defect state |
| 20 Notifications | New permission-audience helper + scheduled monitor |
| 21 Reports | Pure calc libs + CSV/XLSX; PDF server-side |
| 22 AI | `emsOps` read-only capability |

## 8. Conflicts and gaps between the spec and the codebase

1. **Relational assumptions** (Parts 16, 25): handled per Section 2. No SQL tables, FKs or migrations will be created.
2. **Permission naming**: camelCase, not dotted.
3. **Two check-off engines already exist**: consolidating onto one is a product decision (Section 5).
4. **Stations and personnel are not collections**: EMS references them by name / `personnelId`, as every module does.
5. **Credentials are stored twice already**: EMS should consolidate, not add a third store.
6. **Fleet procurement is vehicle-oriented**: EMS procurement needs line items, approvals, POs and receiving it lacks.
7. **No server step-up auth**: needed for controlled substances (Section 3).
8. **No outbox/event bus**: a narrow inbox is enough; no general event framework is proposed.
9. **No push notifications**: in-app + email only unless FCM is added later.
10. **Legal**: Part 23.5 requires legally reviewed e-signatures for controlled-substance attestations. Until that
    review happens, attestations are recorded as authenticated user actions and labelled "not a legal signature".

## 9. Security findings relevant to EMS

| Finding | Location | EMS handling |
|---|---|---|
| Any member can create `auditLogs` entries with any `actorUid` | `firestore.rules:1160` | EMS audit events are written by callables only (`emsAuditEvents`, browser writes refused) |
| Any member reads all files under `departments/{id}/**` | `storage.rules:69` | Separate `emsRestricted/` storage path with permission-checked reads |
| Catch-all tenant rule applies to any collection missing from `hasExplicitTenantRule` | `firestore.rules:771-825, 2023` | Every EMS collection gets an explicit block and is added to that list (test-enforced) |
| `moduleOn` is lenient when entitlements are missing | `firestore.rules:124` | Ledger writes go through callables that check the module explicitly |
| Lists are readable by every member and cached in localStorage | `useTenantPersistentState.js` | No EMS data in `lists` |

## 10. Migration and deployment considerations

- New collections only; nothing existing is altered or deleted. ePCR, checkoff and fleet records are read, never rewritten.
- Equipment migration from `lists/hlfd-rms-assets`: dry run, apply, reconciliation report, source kept, batch rollback.
- Every new rules/functions test file must be appended to the `test:rules` / `test:functions` scripts in `package.json`.
- Deploy order per slice: functions → rules → indexes → hosting, staging first (`npm run deploy:staging`).
- Seed data: categories and example templates only; never controlled-substance balances or fake transactions (Part 25.3).

## 11. Scale and recommended delivery

The spec describes roughly 70 logical tables, 90 endpoints, 29 screens and 33 acceptance criteria. Each shipped
slice must have working backend logic, rules, tests and UI (Part 29). That is several PRs, not one change. The order
below keeps every PR shippable and puts the shared foundations first.

| Slice | Contents | Depends on |
|---|---|---|
| E1 Foundation | Module + permission registration, `emsAuditEvents`, inventory core (catalog, locations, lots, balances, ledger callables with idempotency, FEFO, counts/reconciliation), supply inventory UI | — |
| E2 Equipment | `emsEquipment` + lifecycle, assignment/transfer, QR generate + scan, migration from assets list | E1 |
| E3 Check-offs & readiness | Fleet checklist item types, assignments, schedules, verification, deficiencies → work orders, EMS readiness rules | E1, E2 |
| E4 Medications | Medication catalog fields, med inventory, expiration and recall/quarantine | E1 |
| E5 Controlled substances | Separate ledger, containers, seals, witness attestations, `auth_time` step-up, reconciliation, discrepancies → investigations, reports | E1, E4 |
| E6 ePCR integration | Posted-PCR inbox trigger, medication reconciliation, procedure→supply mappings, post-call restock, amendment exceptions | E1, E4, E5 |
| E7 Procurement | Vendors, product catalog, requests, approval chain with thresholds, POs + PDF, receiving → ledger, reorder recommendations | E1 |
| E8 People & shift | Credentials consolidation, `emsAuthorizations`, shift handoff, notification helper, scheduled monitor | E1–E5 |
| E9 Insight | EMS dashboards (admin + user), reports and exports, `emsOps` AI capability, user/admin docs | all |
