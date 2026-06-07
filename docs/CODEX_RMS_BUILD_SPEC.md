# Horn Lake Fire Department RMS Build Specification for Codex

## Purpose
Build the current Horn Lake Fire Department app into a complete operational RMS platform. The system should function as the department's primary daily operations platform while using a separate low-cost compliance/reporting pathway for official ePCR/NEMSIS and NERIS submissions until full compliance certification is later developed.

This specification is written for Codex implementation inside the existing `HornLakeFire/firebase-app` project.

---

## Current Project Baseline

### Existing Stack
- Frontend: Vite + React
- Backend: Express server in `server.cjs`
- Mapping: Leaflet
- Icons/UI: lucide-react
- Data: local JSON files with optional Firebase integration
- Firebase client: Firestore + Storage through `src/lib/firebaseClient.js`
- Main entry: `src/main.jsx`
- Current primary page: `src/pages/HydrantTestingPage.jsx`

### Existing Core Features
- Hydrant dashboard and map
- Hydrant flow testing
- Hydrant inspection records
- Pre-fire plans
- CSV export for hydrants and daily activity
- Local/Firebase support pattern
- Fire/EMS reference content placeholders
- Hose inventory placeholder
- File upload capability through Firebase Storage

---

## Product Goal
Create a full fire department software package with these major areas:

1. Operations Dashboard
2. Incident RMS
3. EMS/ePCR Workbench
4. Fire/NERIS Workbench
5. Personnel Management
6. Scheduling and Shift Trades
7. Training Records
8. Certifications and Expiration Tracking
9. Apparatus Management
10. Equipment and Asset Management
11. Hydrant Management
12. Hose Testing
13. Pre-Fire Plans
14. Occupancy Inspections
15. Fire Investigations
16. Community Risk Reduction
17. Documents/SOG/Protocols Library
18. Analytics and Reporting
19. Station Display Mode
20. Admin/Security/Settings
21. Compliance Export Bridge for ePCR/NEMSIS and NERIS

---

## Strategic Architecture Decision

### Do Not Replace ImageTrend/ePCR Submission First
The app should collect, organize, validate, and export operational data, but official ePCR/NEMSIS and NERIS submissions should initially be handled by a basic external compliance/reporting system or existing vendor.

### Build the Platform as the Department System of Record
The app should become the daily working platform for:
- Personnel
- Scheduling
- Training
- Apparatus
- Hydrants
- Assets
- Inspections
- Preplans
- Incident documentation
- Dashboards
- Analytics

### Compliance Bridge Model
The app should create export-ready records that can be:
1. Reviewed internally.
2. Exported as JSON/CSV/XML.
3. Sent to a third-party reporting system through API or file import.
4. Later upgraded to direct NEMSIS/NERIS submission if certification and state approval are achieved.

---

## Implementation Rules for Codex

### General Rules
- Preserve the current working hydrant application.
- Do not delete existing hydrant, test, inspection, or pre-fire plan functionality.
- Add features incrementally.
- Use modular React pages instead of expanding one giant page file.
- Create reusable components.
- Create a real navigation shell.
- Keep the app mobile-first and iPad-friendly.
- Use Firestore-ready service functions.
- Keep local JSON fallback where practical for development.
- Avoid storing sensitive protocol or patient data in public GitHub.

### Data Rules
- All records must have:
  - `id`
  - `created_at`
  - `updated_at`
  - `created_by`
  - `updated_by`
  - `shift`
  - `status`
- Incident-related records must have:
  - `incident_number`
  - `incident_date`
  - `dispatch_time`
  - `arrival_time`
  - `clear_time`
  - `station`
  - `district`
  - `address`
  - `latitude`
  - `longitude`
  - `call_type`
  - `primary_unit`
- Patient/ePCR records must be separated from public/non-HIPAA operational data.
- Patient identifiers must not be committed to GitHub.

### UI Rules
- Use a clean command-dashboard layout.
- Prioritize iPad use.
- Large buttons, large form inputs, clear status badges.
- Fireground-friendly contrast.
- Station display pages must be read-only and auto-refresh.
- All forms must support Save Draft and Submit/Lock.

---

## Recommended File Structure

```text
src/
  main.jsx
  App.jsx
  routes.jsx
  styles.css
  assets/
  components/
    AppShell.jsx
    TopBar.jsx
    SideNav.jsx
    StatCard.jsx
    StatusBadge.jsx
    DataTable.jsx
    FormSection.jsx
    ConfirmDialog.jsx
    MapPanel.jsx
    FileUploader.jsx
  pages/
    DashboardPage.jsx
    IncidentListPage.jsx
    IncidentDetailPage.jsx
    EmsWorkbenchPage.jsx
    FireReportWorkbenchPage.jsx
    PersonnelPage.jsx
    SchedulingPage.jsx
    TrainingPage.jsx
    CertificationsPage.jsx
    ApparatusPage.jsx
    AssetsPage.jsx
    HydrantTestingPage.jsx
    HoseTestingPage.jsx
    PreFirePlansPage.jsx
    InspectionsPage.jsx
    InvestigationsPage.jsx
    DocumentsPage.jsx
    AnalyticsPage.jsx
    StationDisplayPage.jsx
    AdminSettingsPage.jsx
  services/
    apiClient.js
    incidentService.js
    personnelService.js
    scheduleService.js
    trainingService.js
    apparatusService.js
    assetService.js
    hydrantService.js
    hoseService.js
    preplanService.js
    inspectionService.js
    investigationService.js
    documentService.js
    analyticsService.js
    complianceExportService.js
  data/
    defaultAppData.js
    schema/
      incidentSchema.js
      emsSchema.js
      nerisSchema.js
      personnelSchema.js
      trainingSchema.js
      apparatusSchema.js
  utils/
    dates.js
    ids.js
    validation.js
    csv.js
    permissions.js
```

Backend:

```text
server.cjs
server/
  routes/
    health.routes.cjs
    incidents.routes.cjs
    personnel.routes.cjs
    schedules.routes.cjs
    training.routes.cjs
    apparatus.routes.cjs
    assets.routes.cjs
    hydrants.routes.cjs
    hose.routes.cjs
    preplans.routes.cjs
    inspections.routes.cjs
    investigations.routes.cjs
    documents.routes.cjs
    analytics.routes.cjs
    compliance.routes.cjs
  services/
    jsonStore.cjs
    firebaseAdminStore.cjs
    exportService.cjs
    auditService.cjs
    validationService.cjs
  data/
```

---

## Phase 1: App Shell and Core Navigation

### Build
- Add `src/App.jsx`.
- Move the current HydrantTestingPage into the new app shell.
- Add top navigation and side navigation.
- Add route-based page switching without breaking Vite.
- Use a simple internal state router first unless react-router is added intentionally.

### Navigation Items
- Dashboard
- Incidents
- EMS Workbench
- Fire Reports
- Personnel
- Scheduling
- Training
- Certifications
- Apparatus
- Assets
- Hydrants
- Hose Testing
- Preplans
- Inspections
- Investigations
- Documents
- Analytics
- Station Display
- Admin

### Acceptance Criteria
- App loads to Dashboard.
- Hydrant Testing still works.
- Navigation opens each placeholder page.
- No white screen.
- `npm run build` passes.

---

## Phase 2: Core Incident RMS

### Incident Module
Create full incident records.

#### Incident Fields
- Incident number
- CAD/Active911 ID
- Call type
- Alarm level
- Dispatch time
- Enroute time
- Arrival time
- Controlled time
- Clear time
- Address
- Business/occupancy name
- Latitude/longitude
- District
- Station area
- Units assigned
- Personnel assigned
- Apparatus assigned
- Narrative
- Actions taken
- Disposition
- Exposure flag
- EMS involved flag
- Fire involved flag
- Investigation required flag
- Attachments
- Review status

#### Incident Statuses
- Draft
- In Progress
- Submitted for Review
- Returned for Correction
- Approved
- Exported
- Locked

### Backend Endpoints
- `GET /api/incidents`
- `GET /api/incidents/:id`
- `POST /api/incidents`
- `PATCH /api/incidents/:id`
- `DELETE /api/incidents/:id`
- `POST /api/incidents/:id/lock`
- `POST /api/incidents/:id/review`
- `GET /api/incidents/export`

### Acceptance Criteria
- Create/edit incident.
- Assign units and personnel.
- Save draft.
- Submit for review.
- Export incident list as CSV.

---

## Phase 3: Personnel Management

### Personnel Fields
- Employee ID
- Name
- Rank
- Assignment
- Shift
- Station
- Unit assignment
- Employment status
- Hire date
- Phone/email
- EMS level
- Fire certifications
- Driver/operator status
- Officer status
- Special teams
- Medical clearance date
- Fit test date
- Notes

### Personnel Statuses
- Active
- Off Duty
- Leave
- Light Duty
- Suspended
- Retired
- Separated

### Backend Endpoints
- `GET /api/personnel`
- `POST /api/personnel`
- `PATCH /api/personnel/:id`
- `DELETE /api/personnel/:id`
- `GET /api/personnel/export`

### Acceptance Criteria
- Add/edit personnel.
- Filter by shift/rank/status.
- Show expiring certifications.

---

## Phase 4: Scheduling and Shift Trades

### Scheduling Features
- Shift calendar
- A/B/C shift assignment
- Daily roster
- Apparatus assignment
- Leave tracking
- Overtime tracking
- Callback availability
- Shift trade requests
- Supervisor approval

### Shift Trade Workflow
1. Employee submits trade request.
2. Covering employee accepts.
3. Battalion Chief approves or denies.
4. Roster updates after approval.
5. Audit log records all steps.

### Backend Endpoints
- `GET /api/schedule`
- `POST /api/schedule/assignments`
- `POST /api/shift-trades`
- `PATCH /api/shift-trades/:id`
- `POST /api/shift-trades/:id/approve`
- `POST /api/shift-trades/:id/deny`

### Acceptance Criteria
- Build daily roster.
- Submit and approve trade.
- Display current staffing by apparatus.

---

## Phase 5: Training and Certifications

### Training Module
- Training event creation
- Class title
- Category
- Instructor
- Date/time
- Hours
- Objectives
- Attendees
- Signature/acknowledgement
- Attachments
- ISO category
- EMS CE category

### Certification Module
- Certification name
- Level
- Issuing agency
- Issue date
- Expiration date
- Renewal requirement
- Document upload
- Notification threshold

### Backend Endpoints
- `GET /api/training/events`
- `POST /api/training/events`
- `PATCH /api/training/events/:id`
- `POST /api/training/events/:id/attendance`
- `GET /api/certifications`
- `POST /api/certifications`
- `PATCH /api/certifications/:id`

### Acceptance Criteria
- Add class.
- Add attendees.
- Track hours by person.
- Show certifications expiring in 30/60/90 days.

---

## Phase 6: Apparatus and Assets

### Apparatus Fields
- Apparatus ID
- Unit number
- Type
- Year/make/model
- VIN
- License plate
- Station
- Status
- Mileage
- Engine hours
- Pump hours
- Tank size
- Pump rating
- Maintenance history
- Inspection history
- Assigned equipment

### Asset Fields
- Asset ID
- Name
- Category
- Serial number
- Location
- Assigned apparatus
- Purchase date
- Value
- Warranty expiration
- Inspection interval
- Maintenance interval
- Status

### Backend Endpoints
- `GET /api/apparatus`
- `POST /api/apparatus`
- `PATCH /api/apparatus/:id`
- `GET /api/assets`
- `POST /api/assets`
- `PATCH /api/assets/:id`
- `POST /api/assets/:id/inspection`
- `POST /api/assets/:id/maintenance`

### Acceptance Criteria
- Track apparatus status.
- Track asset location.
- Show maintenance due list.

---

## Phase 7: Hydrants and Hose Testing Improvements

### Preserve Existing Hydrant Work
Do not replace the current hydrant system. Refactor it into services and components only after app shell is stable.

### Additions
- Hydrant provider field
- District/station filter
- Out-of-service workflow
- Repair request workflow
- Public works notification export
- Hydrant annual completion dashboard
- Map clustering if performance requires it

### Hose Testing
- Hose inventory
- Annual hose test
- Hose failure record
- Remove from service workflow
- Replacement recommendation

### Acceptance Criteria
- Existing hydrant records still load.
- Flow test still saves.
- Inspection still marks hydrant checked.
- Hose testing records save and export.

---

## Phase 8: Preplans, Inspections, and Investigations

### Preplans
- Occupancy profile
- Contact information
- Knox box location
- FDC location
- Fire alarm panel location
- Sprinkler system details
- Hazards
- Utilities shutoff
- Tactical notes
- Attachments/floorplans
- Map location

### Inspections
- Occupancy
- Inspection type
- Inspector
- Violations
- Code reference
- Correction deadline
- Reinspection date
- Owner/manager signature
- Notice export

### Investigations
- Linked incident
- Origin and cause
- Photos
- Witnesses
- Property owner
- Insurance contact
- Evidence log
- Narrative
- Report export

### Acceptance Criteria
- Preplan search works.
- Inspection creates violation list.
- Investigation links to incident.

---

## Phase 9: EMS/ePCR Workbench

### Purpose
Create a lightweight EMS documentation workbench that supports internal review and export, but do not treat it as certified state submission software yet.

### EMS Fields
- Linked incident number
- Patient sequence number
- Unit
- Crew
- Response times
- Patient demographics
- Chief complaint
- Primary impression
- Vitals
- Assessment
- Procedures
- Medications
- Narrative
- Disposition
- Receiving facility
- Signatures
- QA status

### Security Rule
Patient care data must be stored separately from non-HIPAA operational data. Access must be restricted by role.

### Export Bridge
- Create NEMSIS-style internal JSON mapping.
- Later add XML generator.
- Add validation queue.
- Add export status.

### Acceptance Criteria
- Create EMS chart linked to incident.
- Add vitals, meds, procedures, narrative.
- Mark ready for QA.
- Export draft JSON.

---

## Phase 10: Fire Report / NERIS Workbench

### Purpose
Create a fire reporting workbench mapped toward NERIS-style reporting.

### Fire Report Fields
- Linked incident
- Incident type
- Actions taken
- Resources assigned
- Property use
- Structure type
- Fire origin area
- Fire cause
- Fire spread
- Detector/suppression info
- Civilian casualties
- Fire service casualties
- Property loss estimate
- Narrative
- Attachments
- QA status

### Export Bridge
- Create NERIS-style internal JSON.
- Add schema validation placeholder.
- Add export status.
- Add external submission ID field.

### Acceptance Criteria
- Create fire report linked to incident.
- Validate required fields before export.
- Export draft JSON.

---

## Phase 11: Compliance Export Center

### Purpose
Provide a single page for records that need external submission.

### Queues
- EMS records pending QA
- EMS records ready for export
- Fire reports pending QA
- Fire reports ready for export
- Rejected/returned records
- Exported records

### Export Formats
- CSV
- JSON
- Future XML
- Future API POST

### Fields
- Local record ID
- Incident number
- Record type
- Current status
- Last validation result
- External system
- External submission ID
- Exported by
- Exported at

### Acceptance Criteria
- View export queue.
- Validate required fields.
- Export selected records.
- Mark exported.
- Store audit history.

---

## Phase 12: Analytics

### Dashboards
- Total incidents
- EMS vs fire volume
- Call volume by month
- Call volume by hour/day
- Top incident types
- Top addresses
- Unit utilization
- Response time benchmarks
- Training hours
- Hydrant completion
- Inspection backlog
- Apparatus downtime
- Certification expirations

### Station Display Mode
- Current incident
- Last 5 incidents
- Weather panel
- Route/map panel
- Unit status
- Staffing
- Alerts/messages

### Acceptance Criteria
- Dashboard loads without interaction.
- Station display auto-refreshes.
- Analytics can be filtered by date range.

---

## Phase 13: Admin, Security, and Audit Logs

### Roles
- Fire Chief
- Deputy Chief
- Battalion Chief
- EMS Chief
- Fire Marshal/Inspector
- Lieutenant
- Driver/Operator
- Firefighter
- EMS Provider
- Admin Assistant
- IT Admin
- Read-only Display

### Permissions
- View incidents
- Edit incidents
- Approve incidents
- View EMS charts
- Edit EMS charts
- QA EMS charts
- Export compliance records
- Manage personnel
- Manage schedule
- Manage training
- Manage inspections
- Manage assets
- Manage settings

### Audit Log Events
- Record created
- Record updated
- Record deleted
- Record submitted
- Record approved
- Record exported
- Login/logout if auth added
- Permission change
- File upload

### Acceptance Criteria
- Role object exists.
- Permission guard utility exists.
- Audit events are stored for major actions.

---

## Backend Refactor Plan

Current `server.cjs` can remain temporarily, but should be refactored into route modules.

### Step 1
Create `server/services/jsonStore.cjs`:
- `readJson(file, fallback)`
- `writeJson(file, data)`
- `readList(file, key)`
- `saveList(file, key, rows)`

### Step 2
Move hydrant endpoints to `server/routes/hydrants.routes.cjs`.

### Step 3
Move pre-fire plan endpoints to `server/routes/preplans.routes.cjs`.

### Step 4
Add new route modules by feature.

### Step 5
Keep `server.cjs` as the main app bootstrap.

---

## Database / Firestore Collection Plan

```text
appData
users
personnel
incidents
incidentUnits
incidentPersonnel
emsCharts
emsVitals
emsMedications
emsProcedures
fireReports
apparatus
assets
assetInspections
hydrants
hydrantTests
hydrantInspections
hoseInventory
hoseTests
preplans
occupancies
inspections
violations
investigations
trainingEvents
trainingAttendance
certifications
scheduleAssignments
shiftTrades
documents
stationMessages
exportQueue
auditLogs
settings
```

---

## Priority Build Order for Codex

### Sprint 1
- Add app shell.
- Add dashboard.
- Preserve hydrant page.
- Add placeholder pages.
- Add API client service.

### Sprint 2
- Add incident RMS list/detail/create/edit.
- Add incident backend routes.
- Add CSV export.

### Sprint 3
- Add personnel module.
- Add apparatus module.
- Add asset module.

### Sprint 4
- Add scheduling and shift trades.
- Add daily roster.

### Sprint 5
- Add training and certifications.

### Sprint 6
- Improve hydrants.
- Add hose testing.

### Sprint 7
- Add inspections and investigations.

### Sprint 8
- Add EMS workbench draft records.
- Add Fire/NERIS workbench draft records.

### Sprint 9
- Add compliance export center.
- Add draft NEMSIS/NERIS JSON mapping.

### Sprint 10
- Add analytics and station display mode.

---

## First Codex Prompt to Run

```text
You are working inside the existing HornLakeFire/firebase-app Vite React + Express project.

Implement Sprint 1 from docs/CODEX_RMS_BUILD_SPEC.md.

Requirements:
1. Create src/App.jsx with a department RMS app shell.
2. Preserve the existing HydrantTestingPage and make it available from navigation.
3. Update src/main.jsx to render App instead of HydrantTestingPage directly.
4. Create reusable components: AppShell, TopBar, SideNav, StatCard, StatusBadge.
5. Add placeholder pages for Dashboard, Incidents, EMS Workbench, Fire Reports, Personnel, Scheduling, Training, Certifications, Apparatus, Assets, Hose Testing, Preplans, Inspections, Investigations, Documents, Analytics, Station Display, and Admin.
6. Use simple React state navigation unless adding react-router is necessary.
7. Do not delete or break existing hydrant functionality.
8. Keep design mobile-first and iPad-friendly.
9. npm run build must pass.

After implementation, summarize changed files and any follow-up tasks.
```

---

## Second Codex Prompt

```text
Implement Sprint 2 from docs/CODEX_RMS_BUILD_SPEC.md.

Build the Incident RMS module:
1. Add IncidentListPage and IncidentDetailPage functionality.
2. Add incidentService.js.
3. Add Express endpoints for incidents.
4. Store incidents in server/data/incidents.json for local development.
5. Support create, edit, save draft, submit for review, approve, lock, and CSV export.
6. Incident records must include units, personnel, address, call type, times, narrative, actions taken, and review status.
7. Add dashboard stats from incident data.
8. npm run build must pass.

Do not modify hydrant behavior except where needed for navigation.
```

---

## Third Codex Prompt

```text
Implement Sprint 3 from docs/CODEX_RMS_BUILD_SPEC.md.

Build Personnel, Apparatus, and Assets modules:
1. Add CRUD pages and service files.
2. Add Express route files and local JSON storage.
3. Add filtering and status badges.
4. Add export CSV endpoints.
5. Add dashboard cards for active personnel, apparatus out of service, and assets due for inspection.
6. npm run build must pass.
```

---

## Notes for Future Compliance Work

### NEMSIS
Treat NEMSIS as a separate compliance project. Build internal EMS charting first, then map fields to NEMSIS later.

Required future items:
- NEMSIS data dictionary mapping
- Required field validator
- Schematron/XML validation
- State submission pathway
- QA workflow
- Audit logging
- HIPAA review

### NERIS
Treat NERIS as a separate export bridge first.

Required future items:
- NERIS schema mapping
- Fire report validator
- API/export connector
- Submission ID tracking
- Rejection/correction workflow

---

## Immediate Safety/Compliance Warning
Do not store real patient data, Social Security numbers, medical record numbers, billing information, or protected health information in public GitHub, local unsecured JSON files, or browser localStorage. EMS patient data requires proper access control, encryption, audit logging, backup policy, and HIPAA review before production use.
