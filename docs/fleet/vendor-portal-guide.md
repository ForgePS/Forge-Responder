# Fleet Module — Vendor Portal Guide

Authorized vendors use the in-app **Vendor Portal** (Fleet nav) to work assigned jobs. Department staff select the vendor context; portal scopes on the vendor record control what is visible.

## Enable a vendor

1. Configuration Studio → Shops & vendors (or Vendor Portal → vendor list).
2. Ensure the vendor is **active** and **portal enabled**.
3. Assign work orders with matching `vendorId` / vendor name.

## Vendor actions

| Action | Effect |
|---|---|
| Accept | Moves WO toward scheduled |
| Reject / return | Returns to requested |
| Submit estimate | Updates estimated cost |
| Mark in progress / awaiting parts | Status updates |
| Mark ready for QC | Hands back to department |
| Submit invoice note | Appends invoice note on the WO |

## Scopes

Portal scopes (defaults on): `view_work`, `accept_reject`, `estimate`, `status`, `diagnosis`, `parts`, `labor`, `invoice`.

Department controls scopes per vendor — vendors never see unassigned work.

## Security

- Tenant isolation still applies (`departments/{id}`).
- Actions are audited as `vendor_portal_action`.
- Sensitive diagnosis can be withheld by removing the `diagnosis` scope.
- External anonymous vendor login is not in this release; use staff-mediated portal or future Cloud Function auth.
