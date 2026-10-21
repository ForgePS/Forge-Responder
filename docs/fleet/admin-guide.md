# Fleet Module — Administrator Guide

Enterprise Fleet V2 for Forge RMS (departments/{departmentId}/…).

## Enablement

1. Open **Fleet → Fleet Configuration Studio**.
2. Confirm **moduleV2Enabled** remains on (default).
3. Run **Migration Center** to import classic Apparatus into `fleetAssets` (one-way, idempotent).
4. Review cutover flags:
   - `legacyApparatusWritesLocked` — stop writing classic apparatus list
   - `redirectApparatusToFleetAssets` — send Apparatus nav to All Fleet Assets
5. Run **Fleet Hardening** readiness checks before go-live.

## Permissions

Assign via Admin → Roles. Full matrix: `docs/fleet/permission-matrix.md` or export CSV from Fleet Hardening.

Creators and Fire Chief / Admin roles include Fleet V2 permissions by default.

## Security notes

- Tenant isolation is by `departments/{departmentId}` path + `canAccessDepartment` rules.
- Accident legal/medical fields require `viewFleetAccidentSensitive`.
- CAD mappings never overwrite fleet OOS status.
- Optional **App Check**: set `VITE_FIREBASE_APPCHECK_SITE_KEY` (provider default `recaptcha-v3`).
- Do not place secrets in client config; integration endpoints are metadata only until Cloud Functions proxy them.

## Load smoke

- In-app: **Fleet Hardening → Load / App Check**
- CLI: `npm run fleet:load-smoke`

## Audit

Operational writes call `writeFleetAuditLog` into `fleetAuditEvents`.

## Related docs

- [Fleet manager guide](./fleet-manager-guide.md)
- [Operator guide](./operator-guide.md)
- [Technician guide](./technician-guide.md)
- [Deployment & rollback](./deployment-rollback.md)
- [Architecture](./architecture.md)
- [Data model](./data-model.md)
