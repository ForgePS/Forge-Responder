# Forge Responder: Master Audit

**Date:** 2026-10-29 · **Branch:** `feat/rms-person-identity` (bab688f) · **Project:** `rms-dashboard-7562e`

This is Phase 1 (discovery) of the platform audit. Every page, tab and major action was traced in the code: page component → services in `src/lib` → Firestore rules / Cloud Functions. Nothing was assumed from a menu name. The screens were **not** clicked through in a browser for this pass, so visual and timing issues may be under-reported.

The detail lives in seven area sections; this file is the summary, the cross-cutting problems, and the proposed fix order.

| # | Area | Section |
|---|---|---|
| 1 | Navigation, dashboard, Employee Portal, design system | [sections/01-navigation-dashboard-portal-design.md](sections/01-navigation-dashboard-portal-design.md) |
| 2 | Personnel, certifications, training, daily log, organization | [sections/02-personnel-training-org.md](sections/02-personnel-training-org.md) |
| 3 | Scheduling, time sheets, leave | [sections/03-scheduling-time.md](sections/03-scheduling-time.md) |
| 4 | Incident reporting and NERIS | [sections/04-incidents-neris.md](sections/04-incidents-neris.md) |
| 5 | Fleet, apparatus, equipment, inventory | [sections/05-fleet-equipment.md](sections/05-fleet-equipment.md) |
| 6 | Prevention: inspections, code enforcement, preplans, hydrants, damage reports | [sections/06-prevention-preplans-hydrants.md](sections/06-prevention-preplans-hydrants.md) |
| 7 | Documents, communications, platform architecture, security, code health | [sections/07-documents-comms-platform-security.md](sections/07-documents-comms-platform-security.md) |

Recently rebuilt and not re-audited in depth: System Admin, Apparatus checks and Apparatus Check Setup, Fleet Configuration Studio, Documents "no file attached", two-step sign-in (now optional).

---

## 1. Summary

**Inventory (188 pages, tabs and actions classified):**

| Status | Count |
|---|---|
| 1. Fully functional | 18 |
| 2. Functional but needs improvement | 93 |
| 3. Partially implemented | 25 |
| 4. Broken | 13 |
| 5. Placeholder or demonstration-only | 19 |
| 6. Missing required functionality | 9 |
| 7. Unused or obsolete | 11 |

**Findings:** 15 demo-blockers, 41 high, 41 medium, 18 low.

**In one paragraph:** the platform is broad and most screens load and save real department data, but three things undermine it everywhere. (1) Permissions are enforced only in the browser: for almost every module, any signed-in member of a department can write, approve or delete through Firestore directly. (2) Several numbers a chief would trust are wrong or fake (dashboard staffing, NFPA 1710 compliance, certification due dates). (3) Older and newer versions of the same feature run side by side and drift apart (classic Apparatus vs Fleet assets, two work-order systems, two damage-report systems, stations/shifts stored in two places). There are also a few genuine exposures that should be fixed before any demo.

---

## 2. Architecture snapshot

(Full inventory in section 7.)

- **App:** React 19 + Vite single-page app; page switching by name (`current === "Page"` in `src/App.jsx`, URL `?page=`), not a router library. 64 page files; 89 menu items.
- **Data:** Firestore, everything under `departments/{departmentId}/…`. Most module data is stored as "lists" (`src/lib/tenantListStore.js`), either one document holding an array or one document per item. Platform-level data in `platform*` collections.
- **Server:** 69 Cloud Functions v2 (Node 22): invites, billing/entitlements, creator console, Academy integration, AI narrative (Claude Sonnet 5.5), Google APIs proxy, Active911, JotForm, hydrant/damage email, SMS broadcast.
- **Security:** `firestore.rules` (`canAccessDepartment`, `canWriteModule`, `isDepartmentAdmin`), `storage.rules`. Two-step sign-in is optional for everyone (as of 2026-10-29).
- **Integrations:** Anthropic, Resend and SendGrid (email is split between the two), Google Maps/Places/Geocoding/YouTube, Active911, JotForm, FORGE Academy hub, Twilio-style SMS.
- **Tests:** about 120 unit, 82 rules, 57 functions tests; CI runs on pull requests. No tests for Messages, Documents, Digital Dashboard, NERIS workflow, or the Academy webhooks.
- **Obsolete code:** `_recovered-platform/` (276 files), unused pages (`AlertDashboardPage`, `HornLakeHydrantApp`, ~2,000 lines of Horn Lake hydrant shell), dead `kpis` constant in `App.jsx`.

---

## 3. Corrections to the brief's assumptions

| Brief assumed | What the code actually has |
|---|---|
| Incident statuses DRAFT → ACTIVE → COMPLETED → SUBMITTED → APPROVED → LOCKED (+ RETURNED) | Draft, In Progress, Needs Review, Returned, Approved (never actually set), Ready for Submission, Submitted; "Locked" is a separate yes/no flag. Enforced only in the browser. |
| Incident numbers `YYYY-######`, unique | `NERIS-YYYY-###`, computed in the browser as "highest loaded + 1": duplicates possible with two users or offline. |
| NERIS: 39 modules, 682 fields, 153 value sets, 2,664 options | 39 modules and 682 fields confirmed; **69 value sets with 738 options** (Nov 2024 V1 data); 20 referenced value sets are missing. The guided editor covers 3 modules (fire, hazard, medical) plus part of the core incident. |
| A separate incidents module | None. Every incident is a NERIS report; the `incidents` rule mapping is unused. |
| Live NERIS submission | Not implemented. The UI is honest about it ("Record NERIS submission" only marks that someone entered it in the NERIS portal). No certification claims found. |
| Equipment inventory with quantities, check-in/out, transfers | Not present. Classic Assets is a flat list; "Check Out" sets a text field. |
| Divisions / organizational hierarchy | Not present; stations, shifts and units are flat pick-lists. |

---

## 4. Cross-cutting problems (fix these once, everywhere)

### 4.1 Exposure and privacy (fix before any demo)
- **Active911 dispatch alerts are public.** Call text, address, cross street and responders for every department can be read without signing in (`firestore.rules:364` public alert lists; `alertDashboardPublicView`; the gateway resolver accepts any real department ID, `functions/lib/gatewayResolver.js:17-30`). The public Google lookups use the same fallback, exposing the Maps key's quota.
- **Private personnel data is visible to anyone who can open a profile**, including Read Only: SSN, birth date, race, ethnicity, marital status are only locked from editing, not hidden (`PersonnelProfileForm.jsx:91-128`). Every member's browser downloads and caches the whole personnel list.
- **Academy webhooks accept anything when no secret is configured** (`functions/index.js:755`), letting anyone write training records into a named department.
- **Academy hub bearer token and secret** are still stored in `settings/main`, readable by every member (writes were locked to admins in batch A; the stored values remain).
- **Any signed-in user gets full access to `forge-demo`**, including joining as Fire Chief; the demo password has a hard-coded fallback (`demoMode.js:44`).
- **Stored cross-site scripting in the hydrant map popup** (`HydrantTestingPage.jsx:862` builds HTML from hydrant address text).
- **Restricted preplan data** (gate codes, shutoffs) is readable by every member; licensed code-library text is readable by any signed-in user.

### 4.2 Permissions enforced only in the browser
Almost every module uses `canWriteModule`, which lets any active member write. So any member, including Read Only, can directly: edit personnel, certifications and training; approve leave and shift trades (supervisors can approve their own); edit time cards and type a signature; rewrite or approve NERIS reports and edit their audit log; approve/publish/close prevention records; write fleet records including audit events; read and change other people's messages and document acknowledgements; delete storage files. The fix is a role-aware rules helper (as was done for `settings/*` in batch A) applied module by module, plus server checks on the few functions that send messages (`sendShiftBroadcastSms` has no role check or cap).

### 4.3 Numbers that are wrong or fake
- Dashboard "Personnel On Duty" counts every Active person; "Staffing Deficit" and asset inspections read hard-coded June 2026 dates (`src/utils/dashboardMetrics.js:61, 84-86`).
- Scheduling's Daily Staffing always shows staffing met (no minimum passed in).
- NERIS Analytics: NFPA 1710 call processing always 100% (`analytics.js:38` falls back to dispatch time); turnout/travel empty (no en-route time collected); Annual Survey casualties and property loss always 0 (field-name mismatch); heat map never has coordinates.
- Certifications "days left" is stored once and never recalculated, so Expired / Due 30-60-90 and the dashboard KPI drift.
- Training compliance is an average of a hand-picked percentage; attendees always 0.
- Analytics page date buttons only change the CSV file name.

### 4.4 Duplicate systems that drift apart
- **Apparatus:** classic Apparatus list vs Fleet assets. Status, station and decommissioning flow one way only, so a unit taken out of service by a failed check shows OOS on the Readiness Board but In Service on the Dashboard, Apparatus page and Scheduling.
- **Work orders:** classic Maintenance vs Fleet Work Orders. Portal maintenance reports go to the classic list and never reach Fleet. Completing a Fleet work order doesn't return the unit to service, close the defect, or advance PM.
- **Damage reports:** JotForm damage system vs the Prevention damage-report module.
- **Certifications:** stored on the personnel record and in the Certifications module, linked by name text.
- **Stations / shifts / units:** department profile vs seeded dropdown lists; rosters compare exact text, so renames drop people.

### 4.5 Placeholders and fake success
Integration "Test connection" always OK; automations only write a log row; notices "Sent (stub)"; hydrant inspections start with every item passing; preplan "Record verification" checks everything silently; a failed hydrant save still shows ✓; Preplan Nearby / QR Scan / Dashboard / Reports pages are placeholders; Code Library "Add to inspection" does nothing; Digital Dashboard playlists and schedules are never played; Vendor Portal is staff acting as the vendor; Fleet Hardening is a developer checklist hard-coded to pass. Some pages still seed made-up records on view (GL codes, a generic integration adapter).

### 4.6 Record numbers that can repeat
NERIS reports, inspections, preplans, leave requests and shift trades all use "count + 1" or "highest loaded + 1" in the browser. Needs a transaction-based counter per department (a small callable or a Firestore transaction).

### 4.7 Navigation and design
- **89 menu items:** 22 under Fleet (classic and V2 side by side), 48 under Prevention (several open the same page). The collapsed sidebar shows ~89 icons. Global search only works on some pages and not the Dashboard.
- **CSS:** ~17,000 lines across 24 files; primary/secondary buttons and `.kpi-card` defined 3–5 times; `.btn-primary`, `.btn-secondary`, `.button-secondary` have **no styles at all** (Academy panels and the Hydrants page render unstyled buttons); light theme is a 298-selector patch over dark styles; 25 different breakpoints; a 1,050px-wide table in the Employee Portal breaks on phones.

---

## 5. The 15 demo-blockers

| # | Problem | Area |
|---|---|---|
| 1 | Active911 dispatch alerts readable by anyone on the internet | 7, 6 |
| 2 | Private personnel data (SSN, DOB, race…) visible to every viewer | 2 |
| 3 | Dashboard "Personnel On Duty" counts everyone who is Active | 1, 3 |
| 4 | Staffing and asset KPIs use hard-coded June 2026 dates | 1, 3 |
| 5 | Daily Staffing panel always says staffing is met | 3 |
| 6 | NFPA 1710 tab always shows 100% call-processing compliance | 4 |
| 7 | Annual Survey casualties and property loss always 0 | 4 |
| 8 | Classic Apparatus and Fleet assets don't stay in sync (OOS shows In Service) | 5 |
| 9 | Two work-order systems; portal maintenance reports never reach Fleet | 5, 1 |
| 10 | Inspection checklist can't capture photo, date, number, select or signature fields | 6 |
| 11 | Water-company damage email probably can't send (SendGrid key not set) | 6 |
| 12 | Preplan Nearby / QR Scan / Dashboard / Reports are placeholders | 6 |
| 13 | Code Library stops at 1,000 entries; "Add to inspection" goes nowhere | 6 |
| 14 | Certifications can't be added; "Upload Certification" opens a random record | 2 |
| 15 | Stored cross-site scripting in the hydrant map popup | 6 |

(Items 14 and 15 are rated High in their sections and promoted here because a demo would hit them.)

---

## 6. Proposed fix order (demo in about a week)

Each batch goes to the preview channel first, then live after approval, as before.

**Batch 1: exposure and privacy (about 1 day).** Close public alert reads and the gateway fallback (require a per-department public display token or sign-in); hide private personnel fields unless `viewPrivateInfo`; require the Academy webhook secret; move hub tokens server-side and clear stored copies; restrict `forge-demo` writes to its own members and remove the hard-coded demo password; escape the hydrant popup; gate restricted preplan fields.

**Batch 2: numbers a chief will trust (about 1 day).** Real on-duty and staffing counts from the roster with configurable minimums; certification days computed from the expiration date; NERIS analytics fixed (no fallback to dispatch, collect en-route time, field names aligned, hide the heat map until coordinates exist); Analytics date filters that actually filter; remove hard-coded dates.

**Batch 3: one source of truth (1–2 days).** Fleet assets become the source for apparatus status; the classic list and Dashboard/Scheduling read through it; portal maintenance reports go to Fleet Work Orders; completing a work order returns the unit to service and closes linked defects; hide classic Maintenance/Assets from the menu.

**Batch 4: honest screens and a lighter menu (about 1 day).** Hide placeholder pages (Preplan Nearby/QR/Dashboard/Reports, Vendor Portal, Fleet Hardening tab, eight unused Fleet V2 pages, Reporting & Automation) or mark them "Coming soon"; remove stub "success"; real certification add flow; inspection checklist field types; Code Library paging and "Add to inspection"; fix unstyled buttons; damage email through Resend.

**Batch 5: role-aware security rules (2–3 days, can run in parallel).** A rules helper that checks the member's role/permissions, applied module by module (NERIS approvals, leave/trades, time cards, personnel private fields, prevention approvals, messages), plus tests per module. Transaction-based record numbers.

**After the demo:** design-system consolidation (one button/card/table set, light/dark parity, fewer breakpoints), equipment inventory, divisions/hierarchy, NERIS value-set gaps and remaining modules, live NERIS submission, removal of `_recovered-platform/` and dead pages.
