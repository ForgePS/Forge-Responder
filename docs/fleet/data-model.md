# Fleet Module — Data Model (summary)

All collections live under `departments/{departmentId}/`.

## Core

| Collection | Purpose |
|---|---|
| `fleetSettings` | Module flags, numbering, cutover |
| `fleetClasses` | Apparatus classes |
| `fleetAssets` | Master asset records |
| `fleetAssetAliases` | Legacy ID → fleet asset |
| `fleetAuditEvents` | Audit trail |

## Readiness & maintenance

`fleetChecklistTemplates`, `fleetChecklistTemplateVersions`, `fleetChecks`, `fleetMeterReadings`, `fleetDefects`, `fleetStatusEvents`, `fleetWorkOrders`, `fleetPmPrograms`, `fleetPmSchedules`, `fleetTests`

## Ops & risk

`fleetAssignments`, `fleetTransfers`, `fleetAccidentEvents`, `fleetInsuranceClaims`, …

## Procurement & cost

`fleetProcurementRequests`, `fleetBuildProjects`, `fleetCostEntries`, `fleetReplacementCases`, `fleetCapitalPlanItems`, `fleetDisposalRecords`

## Reporting & hardening

`fleetSavedReports`, `fleetAutomations`, `fleetWorkflows`, `fleetNerisMappings`, `fleetCadMappings`, `fleetHardeningChecks`

See Phase assessment: `docs/fleet-existing-module-assessment.md`.
