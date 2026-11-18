# Forge AI Operations Copilot — Architecture Discovery

Inspected 2026-11-09 on `origin/main` @ `ee4f3a8` (branch `feat/forge-ai-copilot`).
Written before any implementation. It records what the platform already provides, what it does not,
and the decisions taken where the build directive assumed capabilities that are not present.

## 1. Platform summary (what Forge AI must reuse)

| Area | What exists | Where |
|---|---|---|
| Frontend | React 19 + Vite 8. No router: the page is a nav label in `current` state, synced to `?page=<slug>` | `src/App.jsx`, `src/lib/pageUrl.js` |
| Nav | `navGroups` tuples `[name, Icon, externalUrl?]`; permission filter `navPermissionMap`; module filter `NAV_MODULE_MAP`. **No nav subtitle support today** | `src/App.jsx:207`, `src/lib/permissions.js:7`, `src/data/adminRegistry.js:4` |
| UI system | `--rms-*` tokens (light/dark), `form-kit.css` loaded last, `.module-page > .module-heading`, `Panel`/`Badge`/`Modal`/`MiniTable`, `primary-button`/`secondary-button`, `cert-toolbar` tab strips | `src/theme/tokens.css`, `src/styles/form-kit.css`, `src/components/shell/ui.jsx` |
| Recent page to model on | Heat Zone Analytics: callable-driven, capability-gated tabs, own Settings tab | `src/pages/HeatZoneAnalyticsPage.jsx` |
| Backend | Cloud Functions v2, Node 22, CommonJS. Thin wrappers in `functions/index.js` over testable `functions/lib/*` modules taking `(db, request)` | `functions/` |
| Database | Cloud Firestore only. Tenant = department; everything under `departments/{departmentId}/…` | `firestore.rules` |
| Server auth / tenancy | `assertDepartmentAccess` (signed in, active member, active subscription; creators pass), `assertMemberPermission`, `memberPermissions` (roles + overrides via `computeMemberPermissions`). `departmentId` is an *input* that is always verified server-side; no custom claims | `functions/lib/access.js`, `functions/lib/memberGrants.js` |
| Roles & permissions | Flat boolean keys. Master list `src/data/creatorPermissions.js`; labels/groups `src/data/adminRegistry.js`; built-in roles `src/data/defaultRoles.js` mirrored (deep-equal, test-enforced) in `functions/lib/defaultRolePermissions.json` | |
| Rules | `canAccessDepartment`, `memberCanAny` (reads `memberGrants/{uid}`), `canWriteModule`; every explicitly ruled collection must be in `hasExplicitTenantRule()` or the catch-all would open it | `firestore.rules:109,143,661` |
| Module entitlements | `platformEntitlements/{d}.modules`, server computed. Keys used here: `nerisFireReports`, `analytics`, `apparatus` | `functions/lib/entitlements.js`, `functions/lib/moduleCatalog.js` |
| Existing AI integration | `draftNerisNarrative` callable: `defineSecret("ANTHROPIC_API_KEY")`, `@anthropic-ai/sdk` 1.2.0, `client.beta.messages.create` with `server-side-fallback-2026-07-01` + `fallbacks: "default"`, JSON-schema structured output, allowlisted facts + `scrubFreeText`, daily cap in `platformAiUsage/{d}_{day}`, typed SDK error mapping, audit entry | `functions/index.js:1017-1091`, `functions/lib/nerisNarrative.js` |
| Audit | `departments/{d}/auditLogs` (append-only in rules). Client writes `created_at`; server writes vary. Viewer exists: `AuditLogPanel` in System Admin | `src/lib/auditService.js`, `src/components/AuditLogPanel.jsx` |
| Calling functions | Per-feature `httpsCallable(getFirebaseFunctions(), name)` clients; emulator wired by `VITE_USE_FIREBASE_EMULATORS` | `src/lib/firebaseClient.js`, `src/lib/heatZone/heatZoneService.js` |
| Tests | `node --test` unit tests; emulator rules tests; emulator function tests calling handlers directly with `(db, {auth, data})` | `tests/unit`, `tests/rules/firestore.rules.test.mjs`, `tests/functions/*.test.mjs` |
| Offline demo | `npm run demo:offline` runs auth+firestore+storage+**functions** emulators (project `demo-forge-rms`), department `forge-demo`. Sample lists (incl. NERIS reports with coordinates) seed on first demo sign-in from `src/data/demoSeeds.js`; Heat Zone projections are built by the functions triggers | `scripts/offline-demo/*`, `src/lib/demoService.js` |

## 2. Data that actually exists, per requested capability

### 2.1 CAD / Dispatch — **no CAD feed exists**
- There is **no dispatch/calls-for-service collection** and **no live CAD integration**.
- CAD data enters only by **manual import** into a NERIS report (`NerisCadImportModal`, `src/lib/neris/cadImport.js`), stored at
  `report.workspace.cad` (`incidentNumber`, `cadCallNumber`, `receivedTime`, `dispatchTime`, `enrouteTime`, `arrivalTime`, `clearTime`,
  `priority`, `alarmLevel`, `initialComments`) plus `workspace.units[]` and `incidentAddress`.
- **Active911** is the only external alert feed: a client-polled (`active911SyncAlerts`) rolling window that *replaces*
  `departments/{d}/lists/hlfd-rms-active911-alerts` (fields `description`, `address`, `units` (string), `priority`, `cadCode`, `sentAt`,
  `syncedAt`, `latitude/longitude`). No status, no history beyond the window.
- **Decision:** Dispatch Intelligence searches (a) CAD fields on NERIS reports — labelled *historical, as imported* — and
  (b) the Active911 window when present — labelled *live window as of `syncedAt`*. Live unit status, call status, pending
  calls and dispatch recommendations are **not built** (no data) and are documented as requiring a real CAD integration.

### 2.2 Incidents
- `departments/{d}/lists/hlfd-rms-neris-fire-reports` (`storage: "items"` sub-collection or legacy array; read via
  `functions/lib/listStore.js readList`). This is the only incident record. `departments/{d}/incidents` is declared but unused.
- Useful fields: `id`, `reportNumber`, `incidentDate`, `incidentAddress`, `incidentTypeSummary`, `status`, `reviewStage`,
  `workspace.cad/units/personnel/actions/ems/…`, `modules.core_mod_incident…`.
- Similar-incident search can use type + address/location + time; no embeddings/vector store exists (and none is needed).

### 2.3 Heat Zone
- Server projection `departments/{d}/heatZoneCalls` (classification, priority, districtId, zoneIds, localHour/Dow, responseSeconds,
  units, locationKey), boundaries, district scope per user (`heatZoneAccess/{uid}`), history/repeat-location permissions.
- `heatZone.dashboard(db, request)` already returns summary, charts (by hour/day/classification/district), comparison to the
  previous period, district comparison and repeat locations, **with the caller's permissions and district scope applied**.
- **Decision:** Forge AI calls `heatZone.dashboard` with the caller's own auth, so it can never see more than the Heat Zone
  page would show them.

### 2.4 Units / resources
- Fleet assets `departments/{d}/fleetAssets` (`unitDesignation`, `type`, `station`, `status`, `readinessState`,
  `activeRestriction`, `lastCheckAt`, `lastCheckResult`), plus `fleetDefects`, `fleetWorkOrders`. Classic list
  `hlfd-rms-apparatus`.
- Unit activity on incidents: `workspace.units[]` on NERIS reports (dispatch/arrival/clear times per unit).
- **No live AVL/CAD unit status.** Readiness status is the fleet's maintained status, not a dispatch status.

### 2.5 Shift / command briefings
- Inputs that exist: NERIS reports by date, Heat Zone summaries, fleet readiness, outstanding report drafts/returns.
- Rosters ("who is on duty") are computed client-side only (`src/lib/schedulingRoster.js`, ESM, no server copy).
  **Decision:** briefings do not include staffing; listed under Data Limitations.

### 2.6 NERIS data quality
- Forge's rules: `src/lib/neris/validation.js` (`validateNerisReport`, `computeCompletionPercentage`) over
  `src/lib/neris/reportModel.js reportChecklist` — **ESM with JSON imports, not loadable by functions**.
- Submission checks (CommonJS): `functions/lib/nerisIncident.js buildIncidentPayload → {problems, warnings}`.
- **Decision:** bundle the existing ESM rules to CommonJS with the repo's own `rolldown`
  (`scripts/build-forge-ai-neris-rules.mjs` → `functions/lib/forgeAi/generated/nerisValidation.cjs`) and add a unit test that
  fails if the bundle drifts from `src/`. No rule is rewritten.
- The AI Narrative Writer (`draftNerisNarrative`, `NerisAiNarrative.jsx`) is left untouched; Forge AI only links to it.

### 2.7 Supervisor QA
- Built from the same validation output (confirmed issues), time-ordering / response-time checks (potential issues), and
  model observations (labelled AI observations). No personnel names are sent to the model (same allowlist as the narrative writer).

### 2.8 Platform knowledge
- `docs/` (Markdown) plus the feature docs. Functions deploy only `functions/`, so docs are packed into
  `functions/lib/forgeAi/generated/knowledgeIndex.json` by `scripts/build-forge-ai-knowledge.mjs`. Answers come only from
  retrieved chunks; no match → "not documented".

## 3. Gaps against the directive (not built, documented)

| Directive item | Status | Why |
|---|---|---|
| Live CAD call search, pending calls, live unit status, AVL | **Blocked** | No CAD/AVL feed exists |
| Staffing in briefings | **Not built** | Roster logic is client-only; no server source of truth |
| Vector / semantic search | **Not needed** | Structured filters + keyword scoring over bounded data |
| Streaming responses | **Not built** | Callables return whole responses (repo convention) |
| Department-wide "AI usage billing" | **Partial** | Usage is logged and capped per day; no billing integration |

## 4. Constraints carried into the design
- Fail closed on tenant: every callable re-verifies membership; every retrieved doc is checked for its department path.
- No write actions anywhere in Forge AI's data services (read-only Firestore access to operational data).
- Retrieved records are untrusted: allowlisted fields, scrubbed free text, wrapped as data, and the model has **no tools**.
- The AI being unavailable must not affect other pages: Forge AI is a lazy page and separate callables; when the model is
  unavailable it falls back to a deterministic, data-only answer.
- Two-factor stays optional; no signup flows; no drug dosages (EMS content is limited to recorded facts and the prompt forbids
  dosage/treatment advice).
