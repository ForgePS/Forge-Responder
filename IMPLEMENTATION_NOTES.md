# Horn Lake Fire/EMS RMS Dashboard

This folder now contains the first usable Horn Lake Command RMS dashboard build.

## Included

- Desktop-first command app shell
- Grouped RMS, fleet, prevention, documents, analytics, administration, and future navigation
- Eight dashboard KPI cards
- Three-zone readiness, action center, and alerts/trends dashboard
- Interactive navigation and collapsible desktop sidebar
- Searchable module tables
- Detailed starter pages for Personnel, Certifications, Training, Scheduling, Apparatus, Inspections, and Hydrants
- Placeholder workflow pages for remaining modules
- Responsive secondary layout for laptops and limited mobile/iPad use

## Sprint 2

- Selectable personnel roster with full profile workspace
- Personnel assignment, contact, qualification, certification, and document views
- Personnel edit, cancel, and save confirmation states
- Certification expiration summary and compliance filters
- Editable certification renewal status
- Certification detail dialog
- Certification document upload and submission workflow

## Sprint 3

- Selectable seven-day A/B/C shift calendar
- Daily roster with editable apparatus assignments
- Minimum staffing requirements and live deficit status
- Leave request approval and denial workflow
- Overtime vacancy coverage and assignment workflow
- Shift trade status dashboard and review queue
- Shift trade approval, denial, filtering, and new-request workflow

## Sprint 4

- Selectable apparatus fleet roster with detailed unit readiness profiles
- Apparatus status controls, operational metrics, checks, and service timeline
- Apparatus repair-request and work-order creation workflow
- Maintenance work-order queue with status filtering and live status updates
- Preventive-maintenance schedule and maintenance-spend summary
- Searchable asset inventory with category and status filters
- Asset custody check-out and return workflow
- New-asset inventory workflow

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

## Build

```powershell
npm.cmd run build
```

## Recommended Next Sprint

1. Build dedicated training, inspections, occupancies, and preplan workflows.
2. Connect personnel, certifications, scheduling, fleet, and trade records to the production data source.
3. Connect the existing Hydrant Testing page to the Hydrants navigation item.
4. Add role-based dashboard visibility and authentication.
5. Add notifications and audit history for approvals, maintenance, and assignment changes.
