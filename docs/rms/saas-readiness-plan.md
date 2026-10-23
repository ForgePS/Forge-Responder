# Forge RMS: Multi-Tenant SaaS Readiness Audit & Plan

_Audit date: 2026-10-21 · Branch: feat/rms-person-identity · Firebase project: rms-dashboard-7562e_

## Summary

The app already has the shape of a multi-tenant platform:

- department-scoped data at `departments/{id}/...`
- a creator console
- plan and subscription records
- per-tenant branding and modules

It is not yet safe or complete as SaaS:

1. **Tenant isolation can be bypassed.** Any user who signs up can make themselves a member of any department.
2. **All file storage is public.**
3. **Tenant lifecycle runs in the browser.** Provisioning, membership, roles and subscription enforcement all happen client-side.
4. **Horn Lake is still the built-in default tenant.**
5. **No billing, invites, tests, CI or staging environment.**

---

## Critical security findings (fix first)

| # | Finding | Where | Fix |
|---|---------|-------|-----|
| C1 | Any authenticated user can create `departments/{any}/users/{self}` with `status:"active"`, which makes them a member with full read/write | `firestore.rules:181-183`, `isDepartmentMember` `:29-33`; client self-writes in `membershipRecovery.js:39-75`, `departmentMembership.js:121-125` (the first user into an empty department becomes admin) | Deny client create of membership docs and client edits to `status`/`roleIds`/`role`. Create memberships only via an admin callable or invite redemption. |
| C2 | Storage rules are `allow read, write: if true` for every path | `storage.rules` | Require auth plus department membership (`firestore.get`), and add size and content-type limits. |
| C3 | Email-based grants ignore `email_verified`: hardcoded platform-owner emails, and `*@hornlake.org` gets access to `horn-lake-fd` | `firestore.rules:9-17, 39-49`, `functions/lib/access.js:3-12`, `src/lib/platformBootstrap.js:4-8` | Move to custom claims (`platformRole`) and remove the email allowlists. Short term: require `email_verified`. |
| C4 | Legacy global collections are writable by any signed-in user (some are publicly readable): `rmsData`, `appData`, `hydrants`, `hydrantInspections`, `dailyActivity`, `preFirePlans`, `integrationSettings`, ... | `firestore.rules:109-144, 796-819` | Migrate the data under `departments/{id}`, then deny. Make reference data writable by platform admins only. |
| H1 | Any member can edit `roles/*` and other users, so they can escalate themselves | `firestore.rules:179-188` | Gate writes on an admin role; keep role data in admin-only docs or claims. |
| H2 | A catch-all `match /{collection}/{document}` gives members read/write on every tenant subcollection | `firestore.rules:787-789` | Replace it with explicit per-collection rules. |
| H3 | Academy webhooks fail open when no secret is configured, and use one shared secret for all tenants | `functions/index.js:681-730` | Fail closed; use per-tenant HMAC secrets in Secret Manager. |
| H4 | Public Google Maps functions can be called by anyone, spending each tenant's quota | `functions/index.js:368-405` | Require auth or App Check, and rate-limit. |
| H5 | `forge-demo` tenant is open to any signed-in user | `firestore.rules:48, 64-65` | Isolate demo data or reset it on a schedule. |
| M | Hub secrets readable by members (`settings/main.forgeAcademy.hubSecret`); `platformDepartments`/`rmsGateways` publicly listable; `resolveForgePersonIdentity` arguments in the wrong order (`functions/index.js:621`) | various | Move secrets server-side; publish a sanitized gateway projection; fix the argument order. |
| S | `tmp-token.txt` (Google OAuth token) is in the repo root and not gitignored | repo root | Delete it; add `tmp-*`, `_tmp_*`, `_deploy_*.log` to `.gitignore`. |

> **Migration caution:** existing Horn Lake users may currently rely on self-created membership docs or the `@hornlake.org` rule. Before tightening the rules, back-fill a valid membership doc for every real user. Then test the new rules against a copy of the data in the emulator or a staging project, so legitimate users don't get locked out.

---

## SaaS capability status

| Area | Status | Notes |
|------|--------|-------|
| Tenant provisioning | Partial | Creator-only, client-side `Promise.all` writes (`platformService.js:500-573`), no transaction, no setup wizard |
| Self-serve signup | Missing | "Create account" makes only an Auth user |
| Invites / user onboarding | Missing | No invite tokens or emails |
| Roles / permissions | Partial | Firestore docs read on the client; no custom claims; not enforced in rules |
| Billing | Missing | `stripe` is only a label; no SDK or webhooks |
| Plan entitlements and limits | Partial | `enabledModules` only filters navigation on the client; `maxPersonnel` etc. never enforced; `subscriptionAccessAllowed` set but never read |
| Platform admin console | Partial | Departments, modules, subscriptions tabs; no usage metrics, offboarding/export, or support tooling |
| Branding | Partial | Per-tenant logo/name/theme; path-based routing only; no custom domains |
| SSO / MFA | Missing | |
| Horn Lake decoupling | Not started | Default tenant ID, rules, `hlfd-rms-*` keys, host special cases, 53k-line hydrant JSON bundled for all tenants (56 files) |
| Environments | Missing | Single Firebase project; no staging |
| Tests / CI / lint | Missing | No test runner, ESLint or CI; dependencies pinned to `latest` |
| Frontend structure | Weak | `App.jsx` 3,156 lines, string-state routing (no router), 3.5 MB main bundle |
| Data model scale | Weak | Lists stored as one doc with an `items[]` array, so they hit the 1 MB document limit and cause write contention |

---

## Phased plan

### Phase 0: Stop the bleeding (days)
1. Create a **staging Firebase project** and add `.firebaserc` aliases (`staging`, `prod`), so security changes can be tested without risk.
2. Write **Firestore and Storage rules tests** against the emulator (`@firebase/rules-unit-testing`) covering cross-tenant read/write and self-escalation.
3. Back-fill memberships for existing real users, then fix C1, C2, C3 (short-term `email_verified`), H1, H3 and H4.
4. Delete `tmp-token.txt` and clean `.gitignore`. Stop tracking `dist/`, `.firebase/` and `_recovered-platform/` (archive it elsewhere).

### Phase 1: Server-side tenant lifecycle (1–2 weeks)
- A `createTenant` callable that does a transactional provision: profile, settings, gateway, roles, subscription, first admin.
- An **invite flow**: an admin invites by email, then the user redeems a token and a server-created membership.
- **Custom claims** for `platformRole` and per-tenant role, refreshed on membership change. Rules check the claims.
- **Entitlement enforcement**: a server-maintained `entitlements` doc per tenant (modules, limits, active/suspended). Rules and callables check it.
- Replace the catch-all rule with explicit per-collection rules.

### Phase 2: Remove Horn Lake as built-in identity (1 week)
- Remove `DEFAULT_DEPARTMENT_ID`; unresolved users get a tenant picker or the login page.
- Migrate the legacy global collections (`rmsData`, `hydrants`, …) into `departments/horn-lake-fd/...`, then deny them in the rules.
- Rename the `hlfd-rms-*` list keys (with a migration); move the hydrant JSON out of the bundle into Firestore import.
- Remove the host and logo special cases; keep Horn Lake as ordinary tenant data.

### Phase 3: Billing (1–2 weeks)
- Stripe Checkout and Customer Portal; a webhook function writes subscription state, and that state drives the `entitlements` doc.
- Plan-to-module mapping; enforce seat and station limits; handle grace periods for suspension and cancellation.

### Phase 4: Engineering foundations (ongoing, start in parallel)
- Pin dependency versions; add ESLint plus Vitest and GitHub Actions CI (build, lint, rules tests); deploy to staging on merge.
- Introduce React Router and lazy-loaded module routes; break up `App.jsx` and `HydrantTestingPage.jsx`.
- Move array-in-one-doc lists to per-item documents for large collections.

### Phase 5: Product polish
- Self-serve department signup with an onboarding wizard (stations, shifts, personnel CSV import).
- SSO (Google/Microsoft/SAML via Identity Platform) and MFA for admins.
- Platform console: tenant usage and health, audit log, impersonation with audit trail, tenant export and offboarding.
- Optional subdomains or custom domains per tenant.
