# First Codex Prompt — Horn Lake Command Theme

Paste this into Codex while working inside the existing `HornLakeFire/firebase-app` repository.

```text
You are working inside the existing HornLakeFire/firebase-app Vite React + Express project.

Implement the Horn Lake Fire/EMS Dashboard theme and desktop-first RMS app shell based on the files in this package.

Primary goal:
Create a professional desktop-first RMS dashboard called "Horn Lake Fire/EMS Dashboard" using the "Horn Lake Command" theme.

Important:
- This is not a CAD screen.
- Do not build a large live incident map.
- Focus on RMS operations: personnel, certifications, scheduling, training, fleet, assets, prevention, documents, and analytics.
- Keep incident reporting and ePCR/NERIS/NEMSIS as later placeholder modules only.
- Preserve the existing hydrant functionality.
- Do not delete or break HydrantTestingPage.

Tasks:
1. Create src/App.jsx.
2. Update src/main.jsx to render App.
3. Create a desktop-first app shell with:
   - Top command bar
   - Left navigation
   - Main workspace
   - Dashboard page
4. Create reusable components:
   - AppShell
   - TopBar
   - SideNav
   - StatCard
   - StatusBadge
   - DataTable
   - ActionPanel
5. Create placeholder pages for:
   - Dashboard
   - Personnel
   - Certifications
   - Training
   - Scheduling
   - Shift Trades
   - Apparatus
   - Assets
   - Maintenance
   - Hose Testing
   - Occupancies
   - Inspections
   - Preplans
   - Hydrants
   - Documents
   - Analytics
   - Administration
   - Incidents
   - EMS Reports
   - Fire Reports
   - Compliance Export
6. The dashboard must use:
   - Top KPI row with 8 cards
   - 3-column layout
   - Left: Readiness
   - Center: Action Center
   - Right: Alerts and Trends
7. Use the Horn Lake Command colors:
   - Background #0F172A
   - Cards #1E293B
   - Accent #2563EB
   - Success #22C55E
   - Warning #F59E0B
   - Critical #EF4444
   - Text #F8FAFC
8. Make the interface professional and data-dense, not flashy.
9. Keep iPad/mobile support limited and secondary.
10. npm run build must pass.

After implementation:
- Summarize changed files.
- List any assumptions.
- List next recommended sprint.
```
