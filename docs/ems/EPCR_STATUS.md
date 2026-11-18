# Forge Responder ePCR — implementation status

Last updated 2026-11-17. This is the honest state of the ePCR against the full product brief. "Done" means built,
wired into the app, and covered by automated tests; "Partial" says what's missing; "Not started" is not started.
Nothing here is NEMSIS certified or compliant: official NEMSIS TAC testing has not been done.

Plan and phase history: [EMS_SUITE_PLAN.md](EMS_SUITE_PLAN.md).

## Where things live

| Area | Code |
|---|---|
| NEMSIS 3.5.1 schema engine (generated from the official release: XSD tree, dictionary, enumerations, NV/PN, cardinality) | `src/lib/nemsis/schema.js`, `src/data/nemsis/3.5.1/`, `scripts/nemsis/sync-nemsis-schema.mjs` |
| Validation (XSD-level in the browser; national Schematron 3.5.1 CP2 + runtime state Schematron on the server) | `src/lib/nemsis/validation.js`, `functions/lib/nemsis/schematron.js`, `functions/lib/nemsis/pcrCheck.js` |
| XML export / import | `src/lib/nemsis/xmlExport.js`, `xmlImport.js` |
| Charting model (sections, fields from the schema, repeating groups, post gate) | `src/lib/nemsis/pcrModel.js` |
| Field app (offline, encrypted on device, sync with section merge) | `src/field/fieldPcr.js`, `fieldPhi.js`, `screens/PcrFormScreen.jsx` |
| RMS desktop editor, review, QA, history | `src/pages/PatientCareReportsPage.jsx`, `src/components/pcr/*` |
| Department form settings | `src/lib/pcr/pcrForm.js` (`settings/emsForm`) |
| CAD import/refresh | `src/lib/pcr/pcrCad.js` |
| Documentation suggestions, vital flags, trend | `src/lib/pcr/pcrQuality.js` |
| Report status, amendments, tamper hash | `src/lib/pcr/pcrLifecycle.js`, `functions/index.js` (`checkPcrOnPost` → `recordPosting`) |
| Hospital handoff | `src/lib/pcr/pcrHandoff.js` |
| Analytics (totals only, small-cell suppression) | `src/lib/pcr/pcrAnalytics.js` |
| AI narrative (server-side, de-identified facts) | `functions/lib/pcrNarrative.js`, `src/lib/nemsis/pcrNarrativeFacts.js` |
| Access rules | `firestore.rules` (`pcrs`, `pcrs/{id}/revisions`, `pcrs/{id}/qaReviews`) |

Permissions: `editPcrs`, `viewAllPcrs`, `unlockPcrs`, `exportPcrs`, `reviewPcrs` (QA). Off for built-in roles except
the platform creator; departments grant them.

## Status by brief section

| # | Brief section | Status | Notes |
|---|---|---|---|
| 3–4 | Official NEMSIS resources, schema registry | Done (3.5.1) | Generated from official 3.5.1 files; 2026 pre-testing package round-trips and validates. **3.5.0 not supported** (would be a second `sync:nemsis-schema` + version switch per report). Mapping inspector / "unmapped elements" developer report: not started (every element is reachable because the form is generated from the schema). |
| 5–6 | Core UX, workspace header, 8-step navigation | Done (desktop), Done (field) | Steps: Incident, Patient, Assessment, Vitals, Treatment, Transport, Narrative, Review and sign. Header: agency, incident, PCR number, unit, author, date, status, validation, last saved, online. Autosave with conflict handling. Mobile layout is the field app; the RMS page is responsive but desktop-first. |
| 7 | Smart incident creation | Partial | From CAD (Active911, CAD exports, pasted records) or blank. Not yet: from a Forge NERIS incident record, standby/interfacility/MCI templates, multi-patient linking. |
| 8 | Patient information | Done (NEMSIS ePatient) | Every ePatient element is available. No patient search (deliberately: needs a policy decision). |
| 9 | Clinical assessment | Done (NEMSIS eSituation/eExam/eHistory) | Structured, timestamped via NEMSIS groups. Smart lookup for ICD-10/RxNorm/SNOMED: codes are typed (needs the NEMSIS defined lists; download not yet approved). |
| 10 | Interactive body diagram | Not started | |
| 11 | Vital signs | Partial | Repeating sets, trend chart and table, adult/child/infant reference flags (informational, never change values), "not obtained" via NV. Not yet: provider per set, one-tap "copy previous set" with confirmation. |
| 12–13 | Medications, procedures | Partial | NEMSIS groups with code lists; "treatment without time" flagged. Not yet: department formulary with favorites/recent, procedure favorites. |
| 14 | Specialized workflows | Partial | All NEMSIS sections are present (arrest, injury, etc.); department can hide sections that NEMSIS allows. Not yet: conditional show/hide by situation (e.g. arrest section only when arrest = yes), refusal capacity workflow. |
| 15 | Transport and disposition | Done (NEMSIS eDisposition) | Department destination drop-down (`choices`). No state facility directory yet. |
| 16 | AI narrative | Partial | Server-side, department opt-in, de-identified facts, notes scrubbed, chronological/SOAP/CHART, quick draft without AI, crew must confirm. Not tested against the live AI (no API key here). Not yet: dictation, per-statement source links, version history of drafts. |
| 17 | Documentation assistant | Done (rules, no AI) | Three kinds kept apart: NEMSIS validation, department requirement, suggestion. Suggestions are dismissible and never block. Checks: missing/one vital set, out-of-range/typo vitals, med/procedure without time, med named in narrative but not charted, arrest in narrative but not charted, transport without destination, no transport but destination, refusal without signature, no narrative, times out of order. |
| 18 | AI privacy and safety | Partial | Key only on the server; opt-in per department; minimum-necessary facts; audit entry per draft; prompt treats notes as data. **A BAA with the AI provider is required before real patient data**; not in place. No role-specific AI permission beyond editPcrs/unlockPcrs. |
| 19–20 | Autofill, dynamic form | Partial | Agency, unit, CAD times/address, department defaults. Situation-driven show/hide not built. |
| 21 | Validation engine | Partial | Layers 1–3 done (input, XSD-level, national Schematron), 4 done for runtime-loaded state Schematron (no state file loaded), 5 department-required, 6 suggestions. Not yet: rule ID and rule version shown on every result in the UI. |
| 22 | XML export | Done | Official namespaces, order, NV/PN, UUIDs; validated against XSD in tests. |
| 23 | State configuration manager | Not started | Mississippi not configured (needs the state's current spec). |
| 24 | Submission and acknowledgment | Not started | Every report says "Not submitted — no state submission connection is set up". No simulated success anywhere. |
| 25 | Electronic signatures | Partial | Signature pad in the field app (NEMSIS eOther signature rows), shown in RMS review and print. Not yet on the desktop. Posted content is hashed (SHA-256, `postedHash`) and the RMS shows whether it still matches. |
| 26 | Finalization and amendments | Done | Unlock (unlockPcrs, reason required) keeps the posted version as an immutable revision; re-posting records every changed element (old → new), reason, who unlocked and who re-posted (server trigger). Revisions can't be edited or deleted (rules). Statuses: Draft, Overdue draft, Amendment in progress, Returned for correction, Posted, Needs review, Amended. |
| 27 | Offline reporting | Done (field app) | Encrypted at rest, sync queue, section-level merge, conflicts not last-write-wins, posted reports locked. |
| 28 | Crew-based documentation | Partial | Crew list, report-level author, per-save author. Not yet: per-entry author on every row. |
| 29 | CAD and incident integration | Partial | CAD import + refresh that keeps hand edits. No link to Forge NERIS incident records yet; no PHI goes to NERIS. |
| 30 | Hospital handoff | Done (print) | One-page summary; printing is audit-logged. No electronic delivery to facilities. |
| 31 | Billing | Not started | NEMSIS ePayment fields exist on the form only. |
| 32 | Supervisor / QA | Done | `reviewPcrs` permission; queues (Overdue, NEMSIS errors, Awaiting QA, Returned); comment, return to crew, mark reviewed with checklist; crew reply; append-only history; reviewers can't change the chart (rules). Checklist is fixed for now. |
| 33 | Analytics | Done (basic) | Status, dispositions, transport rate, impressions, meds, procedures, median response/scene/time-to-post, NEMSIS error rate; counts under 5 shown as "<5"; date filter; most recent 300 reports. No export yet. |
| 34 | Administration panel | Partial | Agency settings, form settings, AI switch. Not yet: formulary, protocols, state, submissions, permissions and audit tabs in one place. |
| 35–36 | Data architecture, security | Partial | Tenant-scoped collections, rules tests, audit log for view/print/export/unlock/QA/AI. See "Before real patient data" below. |
| 37–38 | Performance, accessibility | Partial | Lazy schema load, deferred checks, list capped at 300. Accessibility: labels, focus, status text not color-only; no formal WCAG audit. |
| 39 | Testing | Partial | Unit tests (NEMSIS, model, CAD, form, quality, lifecycle, handoff, analytics, AI facts), rules tests, NEMSIS 2026 pre-testing files, field offline e2e. No browser e2e for the RMS flows. |
| 40 | Compliance readiness dashboard | Not started | Status today: **Development / Schema Validation Passing** (2026 pre-testing files pass locally). Not "Ready for Official Testing". |
| 43 | Demo | Partial | Three synthetic reports (posted, posted with errors, draft) and three CAD calls. Not yet: the seven named scenarios. |

## Before real patient data (production blockers)

1. Google Cloud BAA covering Firestore, Storage, Functions, Logging; and an AI provider BAA/zero-retention before any
   real narrative request.
2. Security risk assessment, retention policy, backup/restore test, incident response plan, workforce access review.
3. State: choose the first state, load its StateDataSet and Schematron, and get submission credentials.
4. NEMSIS TAC compliance testing (Collect Data; Send Data for state submission).
5. Desktop signatures and per-entry authorship if agencies chart primarily on the desktop.

## Known limits of what was verified

- Rules tests (112, including revisions and QA) pass; run them only with the offline demo stopped (both use project
  `demo-forge-rms`).
- The amendment record is written by the `checkPcrOnPost` trigger; checked end to end in the emulator (unlock, edit,
  re-post: the History panel lists the change and the posted-content check matches).
- Reports posted from the field app after an unlock also go through the trigger, but that path has not been run end
  to end.
