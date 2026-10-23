# Forge RMS restore point

**Deployed:** 2026-06-23  
**Hosting site:** `rms-dashboard-7562e`  
**URL:** https://rms-dashboard-7562e.web.app  

## What this restore point includes

- Full **Creator Console** with Platform Settings, Department Modules, Departments, and Internal Email
- Firebase Auth gate (`authRequired: true`) with `isCreator`, `hydrateAccess`, and `signingOutRef`
- `RmsShell` navigation with Creator Console (creators), DepartmentSwitcher, sign-out, and module routing
- Complete `platformService.js` (config load/save, department modules, bootstrap registry, `registerPlatformDepartment` with `{ user }`)
- Executive Minimal theme (light/dark via `lib/theme.js`)
- Department-scoped Firestore list loading via `useDepartmentList`
- Platform Firestore rules (creators, departments, `platformConfig`)

## Build artifact

```powershell
cd C:\Users\jerem\Projects\forge-rms
npm run build
```

Latest bundle in `dist/`:

- `assets/index-BbNZrPc-.js`
- `assets/index-CAcDZktL.css`

## Redeploy

```powershell
cd C:\Users\jerem\Projects\forge-rms
npm run build
firebase deploy --only firestore:rules,hosting --project rms-dashboard-7562e
```

## Key source files

| Area | Files |
|------|-------|
| Entry | `src/main.jsx`, `src/App.jsx`, `src/components/RmsShell.jsx` |
| Auth / tenant | `src/context/AuthContext.jsx`, `src/context/TenantContext.jsx` |
| Platform | `src/lib/platformService.js`, `src/data/platformBrand.js`, `src/lib/brandAssets.js` |
| Creator UI | `src/pages/CreatorConsolePage.jsx`, `src/components/PlatformConfigPanel.jsx`, `src/components/DepartmentModulesPanel.jsx`, `src/components/InternalEmailBoard.jsx` |
| Styles | `src/styles/theme.css`, `src/styles/platform-admin.css`, `src/theme/tokens.css` |

## Remaining gaps

- Logo PNG assets not in repo (`/forge-logo.png`, `/horn-lake-logo.png` use public paths; add to `public/` for branding)
- `hornLakeSeeds.js` is an empty stub — no offline Horn Lake list fallbacks
- Most RMS modules (Certifications, Scheduling, Fleet, etc.) render placeholders in `RmsShell`
- `NerisFireReportsPage` is a minimal stub (no full incident editor)
- `DropdownProvider` wired in `main.jsx` (Personnel filters + Admin dropdown editors)
- Gateway/demo entry routes (`/demo`, `/creator-console` deep links) not in thin `App.jsx` router
- Recovered `_recovered-platform/` tree not fully merged (~245 files; many lib stubs remain incomplete)
