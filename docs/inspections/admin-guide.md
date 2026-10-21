# Inspections / Prevention — Administrator Guide

Prevention data lives under `departments/{departmentId}/…`.

## Surfaces

- Occupancies, inspections, violations, preplans
- Notices, enforcement, fire protection systems, fees
- Reports, offline & sync, automation & integrations
- Import & hardening (CSV + readiness)

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
