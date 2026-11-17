# Forge EMS Suite — Build Plan (draft)

Status: draft for owner review · 2026-11-16

Scope: a NEMSIS v3.5 compliant ePCR, an AI QA/QI reviewer, EMS analytics, Zoll and Lifepak monitor import,
EMS inventory (including controlled substances), and apparatus regulatory / state inspection tracking.

Everything below reuses an existing Forge mechanism unless it says otherwise.

---

## 0. Ground rules (decide before any code)

| Topic | Decision needed / proposal |
|---|---|
| **NEMSIS version** | **v3.5.1** (owner decision, 2026-11-16). The schema is generated from the official release files, so a later patch or version is a re-sync (`npm run sync:nemsis-schema -- --version x.y.z`), not a rewrite. |
| **State** | Which state(s) first? The state data manager supplies the state dataset (custom elements, state Schematron, required elements, submission endpoint and credentials). |
| **PHI / HIPAA** | ePCR data is PHI; nothing else in Forge is. Requires a Google Cloud BAA covering Firestore, Storage, Functions and Logging, and an Anthropic BAA / zero-retention arrangement before any PHI reaches the AI reviewer. PHI lives in its own collections with its own rules, field-level access audit, no PHI in `lists`, logs, notifications or Forge AI chat history. |
| **Compliance testing** | NEMSIS "v3 compliant" listing requires passing the NEMSIS TAC Collect Data (and Send Data, for the state bridge) test cases. Plan the test case suite as automated fixtures from day one. |
| **Monitor vendors** | Zoll and Stryker (Lifepak) real-time / cloud APIs require partner agreements. File import works without them. |

## 1. Architecture (mirrors NERIS)

```
scripts/sync-nemsis-schema.mjs     official XSDs + Schematron + data dictionary → src/data/nemsis/*.json
src/lib/nemsis/
  schema.js          element metadata: id (eVitals.06), type, constraints, NV/PN allowed, usage (M/R/E/O), national/state
  valueSets.js       code lists (incl. ICD-10, RxNorm, SNOMED subsets the dictionary references)
  pcrModel.js        plain-English sections → NEMSIS elements (Dispatch, Response, Times, Patient, Situation,
                     History, Assessment, Vitals, Procedures, Medications, Disposition, Outcome, Narrative, Signatures)
  validation.js      pure: XSD-level checks + ported national/state Schematron rules → issues (error/warning, blocking)
  xmlExport.js       pure: PCR → EMSDataSet XML (and DEMDataSet for the agency)
functions/lib/nemsis/
  stateBridge.js     SOAP submission to the state (NEMSIS Web Services), status polling, retry
  schematron.js      authoritative server-side Schematron run (bundled like generated/nerisValidation.cjs)
```

Storage (all under `departments/{id}/`, real collections, never `lists`):

| Collection | Holds |
|---|---|
| `emsDemographics` | DEMDataSet: agency, configuration, personnel certs (from Personnel), vehicles (from Fleet), facilities, protocols |
| `pcrs` | One doc per patient encounter; NEMSIS element values + workflow state, locked after sign/post |
| `pcrs/{id}/revisions` | Immutable amendment history (addenda after lock) |
| `pcrs/{id}/attachments` | Monitor files, ECG strips, photos, signatures (Storage) |
| `pcrAccessLog` | Who viewed/exported which PCR (HIPAA access audit) |
| `pcrSubmissions` | State/NEMSIS submission attempts, responses, Schematron results |
| `qaReviews` | AI + human QA/QI reviews per PCR |

New module key `ems` (plus `emsQa`, `emsInventory`) registered in the four places `moduleCatalog.test.mjs` checks.
New permissions: `pcr.write`, `pcr.viewAll`, `pcr.unlock`, `pcr.export`, `qa.review`, `inventory.controlled`.

## 2. Phases

### Phase 1 — NEMSIS foundation (no UI)

**Status (2026-11-17): done.** Everything NEMSIS checks automatically for Collect Data software passes against the 2026 pre-testing package. What remains for compliance needs the ePCR UI (Phase 2) and web service submission (Phase 3).

| Piece | Where | State |
|---|---|---|
| Sync from nemsis.org (XSDs, dictionary, enumerations, national Schematron) | `scripts/nemsis/sync-nemsis-schema.mjs` → `src/data/nemsis/3.5.1/`, `functions/nemsis/3.5.1/` | done |
| Schema access (tree, dictionary, code labels, NV/PN) | `src/lib/nemsis/schema.js`, `index.js` | done |
| XSD-level validation (cardinality, required, NV/PN, codes, patterns, ranges, dates) | `src/lib/nemsis/validation.js` | done |
| XML export (EMSDataSet, DEMDataSet, XSD order, NV Not Recorded fill) | `src/lib/nemsis/xmlExport.js` | done |
| Tests incl. agreement with the official XSD (JDK validator) | `tests/unit/nemsis.test.mjs`, `tests/nemsis/XsdValidate.java`, `tests/fixtures/nemsis/` | done |
| National Schematron 3.5.1 CP2, compiled with the official ISO pipeline to SaxonJS | `scripts/nemsis/compile-nemsis-schematron.mjs` → `functions/nemsis/3.5.1/schematron/compiled/` | done |
| Server runner: SVRL + nemsisDiagnostic → findings (error/warning, location, record, elements, missing) | `functions/lib/nemsis/schematron.js` (not yet behind a callable) | done |
| Every national `[ERROR]` rule mirrored in the browser validator: EMS NV/PN usage (with the national exemptions) and medication codes; DEM UUID uniqueness, county-in-state, medication codes, future time stamp | `src/lib/nemsis/validation.js`, `tests/unit/nemsisSchematron.test.mjs` | done |
| Runtime-loaded state/test Schematron (NEMSIS requires these not be built in): compiled in-process, cached by hash, findings tagged by source | `functions/lib/nemsis/schematron.js` `compileSchematron`, `extraSchematron` option | done |
| XML import (NEMSIS XML → Forge document), for round trips and later for monitor/other-vendor imports | `src/lib/nemsis/xmlImport.js` | done |
| State Schematron | from the first state's data manager | waiting on state |
| 2026 pre-testing package: all reference files round-trip unchanged, pass browser validator, XSD, national and pre-testing Schematron; fail files rejected with NEMSIS's expected messages; warnings don't block | `tests/fixtures/nemsis/tac-2026-pretesting/`, `tests/unit/nemsisTac.test.mjs` | done |

Still required for compliance, outside Phase 1: StateDataSet-driven configuration and custom elements in the UI, NEMSIS defined lists with smart lookup, entering the six test cases by hand through the UI, errors blocking finalization in the UI, automatic DEM resubmission on change, and NEMSIS web service submission.

- Schema sync script from the official v3.5.1 XSD + Schematron + data dictionary.
- `schema.js`, `valueSets.js`, `validation.js`, `xmlExport.js` with unit tests.
- Fixture suite built from the NEMSIS TAC compliance test cases; CI validates exported XML against the XSDs and Schematron.
- **Done when:** a hand-built PCR fixture exports to XML that passes national XSD + Schematron.

### Phase 2 — ePCR on the field app (offline-first)

**Status (2026-11-17): first slice built** on `feat/epcr-field` (stacked on `feat/nemsis-foundation`).

| Piece | Where | State |
|---|---|---|
| Charting model: plain-English sections over the NEMSIS document, field descriptors from the schema, read/write by element + group row, new report prefill, post gate | `src/lib/nemsis/pcrModel.js`, `tests/unit/nemsisPcrModel.test.mjs` (every reference PCR re-charted field by field exports identically) | done |
| Field record kind `pcr`: on-device drafts, sync to `departments/{id}/pcrs/{uuid}` with retry token, section-level merge, posted = locked, posting refused while NEMSIS errors remain | `src/field/fieldPcr.js`, `fieldSyncHandlers.js`, `tests/unit/fieldPcr.test.mjs` | done |
| PHI on device: AES-GCM with a non-extractable per-user key; records sealed at rest; wiped (records + key) at sign-out; no plain-file export | `src/field/fieldPhi.js`, `fieldRecords.js`, `SettingsScreen.jsx` | done |
| Module `ems`, permissions `editPcrs` / `viewAllPcrs` / `unlockPcrs` / `exportPcrs` (off for every built-in role except platform creator) | registry, `permissions.js`, `defaultRoles.js`, field caps | done |
| Firestore rules: crew (`crewUids`) and read-all permissions only; posted locked except `unlockPcrs`; never deleted; off when the plan excludes `ems` | `firestore.rules`, `tests/rules/firestore.rules.test.mjs` | done |
| Field charting screen: section chips with progress and errors, essential fields first, repeating groups, NV/PN choices, "Now" times, issues list, Save / Post | `src/field/screens/PcrFormScreen.jsx`, EMS home card | done |
| EMS agency settings (`settings/ems`: state agency ID, agency number, name, ANSI state code), admin-only; prefill new reports and fill the export header | `src/lib/nemsis/emsSettings.js`, Agency settings on the Patient Care Reports page, `fieldRefData.js` | done |
| Defined lists with smart lookup (ICD-10 impressions, RxNorm medications, SNOMED procedures) | codes are typed for now | next |
| Signatures: pad in each NEMSIS signature row (eOther.16–.19, 600×200 PNG, size-capped), status set to Signed / Signed-Not Patient; shown in the RMS review and print (safe raster images only) | `src/field/screens/SignaturePad.jsx`, `pcrModel.js` `setSignature` | done |
| Monitor files, CAD prefill, device auto-lock | | next |
| RMS Patient Care Reports page: my reports / all reports, section-by-section review, unlock with a reason, NEMSIS XML export; view, unlock and export audit-logged (report number only) | `src/pages/PatientCareReportsPage.jsx`, `src/lib/pcrService.js` | done |
| Unlocked reports reopen on the crew's device the next time it's opened with signal | `src/field/fieldPcrReopen.js` | done |
| Server NEMSIS check (`checkPcr` callable): the app's own NEMSIS code bundled for Functions, XSD-level checks + national (and state, once loaded) Schematron; result stamped on the report | `functions/lib/nemsis/pcrCheck.js`, `scripts/nemsis/bundle-nemsis-functions.mjs` (`npm run bundle:nemsis-functions`; a unit test fails when the bundle is stale) | done |
| Server check runs automatically when a report is posted (`checkPcrOnPost` trigger); posted reports with NEMSIS errors show as "Needs review" in the RMS | `functions/index.js`, `functions/lib/nemsis/pcrCheck.js` `shouldCheckOnPost` | done |
| Print view (all charted sections, escaped, PHI footer; printing is audit-logged) | `src/lib/nemsis/pcrPrint.js`, Print on the Patient Care Reports page | done |

- New field record kind `pcr` reusing `fieldDb` / `fieldSync` (device-fixed ids, idempotent retry, needs-attention).
- PHI on device: encrypted IndexedDB store, auto-lock, wipe on sign-out.
- Tablet-first charting: times bar, vitals grid, quick-add procedures/meds, body map, narrative, signatures (patient, crew, receiving facility).
- Live validation panel; "post" blocked until required elements pass.
- CAD/Active911 prefill of dispatch/response; crew and unit from Scheduling/Fleet; NERIS report linked by incident.
- Desktop review/print (PDF) on the RMS side.
- **Done when:** a crew can chart a full call offline, sync, sign, and export valid XML.

### Phase 3 — State submission & demographics
- DEMDataSet built from Personnel, Certifications, Fleet, Stations.
- State bridge: credentials stored like the NERIS connection (`integrations/nemsisState`, closed to browsers), submit/poll/retry, submission dashboard.
- Run NEMSIS TAC compliance testing; apply for compliant-software listing.

### Phase 4 — Monitor integration (Zoll, Lifepak)
- **File import first (no partnership needed):** parse case exports (Zoll X Series / R Series case files, Lifepak 15/35 exports via CODE-STAT / LIFENET export) → vitals, 12-lead, events, defib/pacing → map to eVitals / eProcedures / eMedications with a crew review step before anything is written.
- **Cloud integration (needs vendor agreements):** Zoll Data relay / RescueNet integrations and Stryker LIFENET — pull cases by device serial + time window, auto-match to the open PCR.
- Device registry under Fleet assets (serial → unit).

### Phase 5 — AI QA/QI reviewer
- New Forge AI capability `emsQa`, server only, same pattern as `nerisQuality`:
  deterministic rules first (validation, time-order, protocol checklists: STEMI, stroke, cardiac arrest, sepsis, airway, pain mgmt, refusals),
  then the model reviews the narrative vs structured data for contradictions and documentation gaps, with citations to elements.
- Output: score, findings by severity, suggested addenda — never edits the chart; reviewer accepts/rejects.
- Human QA workflow: queues by rule trigger (all arrests, all refusals, 10% random), feedback to provider, CE tie-in to Training.
- PHI minimisation: send only the elements a rule needs; requires the BAA from §0.

### Phase 6 — EMS analytics
- Pure calc libs (like `neris/analytics.js`): response/scene/transport intervals, chief complaints, protocol compliance (e.g. aspirin/12-lead in chest pain, door-to-ECG), cardiac arrest (ROSC, CPR fraction from monitor data), refusals, destinations, offload times, provider-level QA trends.
- Charts: adopt the shared dataviz approach rather than one-off SVGs.

### Phase 7 — EMS inventory
- Extend field check-offs into stock: items, lots, expirations, par by unit/station, transfers, restock requests.
- Auto-decrement from ePCR medication/procedure entries.
- **Controlled substances:** per-vial chain of custody, two-person verification for waste, discrepancy workflow, DEA-ready logs, seal numbers on boxes, shift-change counts. Write-once audit.

### Phase 8 — Apparatus regulatory & state inspections
- Extend Fleet (not a new module): `fleetRegulatoryItems` — state ambulance permit/licence, state EMS vehicle inspection, registration, DOT/annual, emissions, insurance; issue/expiry, inspector, result, deficiencies, documents.
- State required-equipment lists as checklist templates (versioned, per state + vehicle class), feeding check-offs.
- Expiry alerts (30/60/90) in dashboards, readiness blocks a unit when a required permit lapses.

## 3. Suggested order and why

1 → 2 → 3 is the critical path to being sellable and compliant. 8 and 7 are mostly independent and reuse
Fleet / check-offs, so they can run in parallel with 2. 4, 5, 6 need real PCR data.

## 4. Open questions for the owner

1. First state (and do we have a contact with that state's EMS data manager)?
2. BAA status with Google Cloud and Anthropic?
3. Any existing relationship with Zoll or Stryker?
4. Is the ePCR a paid add-on module or part of existing plans?
5. Billing export (837/ePCR-to-billing) in scope?
