# Inspections / Prevention — Administrator Guide

Prevention data lives under `departments/{departmentId}/…`.

## Surfaces

- Occupancies, inspections, violations, preplans
- Notices, enforcement, fire protection systems, fees
- Reports, offline & sync, automation & integrations
- Import & hardening (CSV + readiness)

## Default inspection form

Every department starts with starter inspection types (Annual fire inspection, Complaint inspection, and others).
A platform creator can pick the checklist those starter types use for every department: open Digital Forms → Manage
in the department that has the form and choose **Make platform default** on a published form. Re-publishing that
form shows **Update platform default to vN**.

A department keeps the platform default until it changes the starter form itself: edits or publishes it in
Configuration Studio, or uses one of its own forms for that type (Digital Forms → Use for inspections). Changed forms
are never overwritten. Inspections already started keep the checklist they began with.

To edit the default for one department, open Digital Forms → Manage in that department and choose **Edit for my
department**. That copies the default into the department's own forms, points every starter type still on the
default at the copy, and opens it in the form editor. Publishing a new version of a form updates every inspection
type that uses it.

## Permissions

Grant paired `view*` / `edit*` (or `manage*`) keys per area. Export the matrix from **Import & Hardening**.

## Imports

1. Download the occupancy or violation CSV template  
2. Upload, map columns, preview errors/duplicates  
3. Commit — a reconciliation batch stores created/updated/skipped/error counts  
4. Rollback is a **flag only** (no automatic deletes)

## Offline

Download packs before field work. Drafts queue locally and sync on reconnect. Conflicts never silently overwrite completed inspections.

## Cutover

Run readiness checks, import legacy CSV samples, confirm fee/automation dry-runs, then deploy hosting + Firestore rules.
