# Academy Integration Hub (RMS)

Department-scoped multi-academy connections. The browser never selects a Firebase
project ID or academy database location — Cloud Functions load configuration from:

`departments/{departmentId}/academyIntegrations/{connectionId}`

Secrets are stored by `secretReference` (Secret Manager preferred; Admin-only
Firestore mirror under `integrations/academy-secret-*`).

## Providers

- `forge_academy` — ForgeAcademyConnector (Hub reachability + identity match)
- `external_api` — stub
- `csv_import` — stub
- `sftp_import` — stub
- `manual` — stub / manual entry

## Callables

See `functions/index.js` exports prefixed with academy / Academy.

## UI

- System Admin → Integrations → Training Academies
- Personnel profile → Academy tab
