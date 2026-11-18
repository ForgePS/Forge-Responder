# Forge AI Operations Copilot — final report

Branch `feat/forge-ai-copilot` (from `origin/main` @ ee4f3a8, no upstream set). Not committed or deployed yet.

## Summary

Forge AI is built as a read-only, role-aware assistant. It has its own page ("Forge AI — Public Safety Operations Intelligence") and "Ask Forge AI" buttons on the Command Dashboard, NERIS Fire Reports, the NERIS report editor, Heat Zone Analytics, NERIS Analytics (Reporting) and System Admin. Every answer is built on the server from the department's own records, cites its sources, and works without the AI model: offline, or when the model fails, answers are built from the records alone and labelled.

It runs end to end in `npm run demo:offline`, and the full test suite passes.

## Status by capability

| Capability | Status | Notes |
|---|---|---|
| Incident Intelligence | Done | Summaries, filters (time, type, unit, address), report detail with timeline, NERIS checks and similar incidents |
| Dispatch Intelligence | Partial | Uses CAD times recorded on NERIS reports plus the Active911 alert window. **No live CAD feed exists**; calls without a report don't appear |
| Heat Zone Intelligence | Done | Reuses the Heat Zone dashboard with the caller's own scope (districts, history, repeat locations). Describes what the data shows, never why |
| Unit & Resource Intelligence | Partial | Fleet readiness and restrictions, unit activity on reports. No AVL or live unit status |
| Shift & Command Briefings | Done (within data) | The 10-section structure. Sections without data are left out. Staffing is left out (no server-side roster) and the briefing says so |
| NERIS Data Quality | Done | Runs the editor's own rules (`src/lib/neris/validation.js`, bundled for the server; a test fails on drift). Points to the AI Narrative Writer and never writes narratives |
| Supervisor QA | Done | Confirmed (rule failures), potential issues, and AI observations kept separate. Blame or discipline language is removed |
| Platform Knowledge | Done | Answers only from `docs/` (packed index); says when something isn't documented. Specs, plans and audits are excluded |

## Architecture (as built)

The flow is auth → department access → caller context (permissions, modules, settings) → capability permission → read-only retrieval through fixed services (no model-written queries) → grounded model request (records inside a `<records>` data block, structured JSON output) → validation (citations, doses, action claims, blame language) → sources → usage and audit log.

- 10 callables under `functions/lib/forgeAi`, which reuse `access.js`, `memberGrants`, `listStore`, Heat Zone and the existing `ANTHROPIC_API_KEY` secret.
- Model: `claude-opus-5-5`, effort medium, with server-side fallback. Any failure falls back to the records-only answer.
- Data lives in 8 department collections. Members can read only their own conversations; nothing is writable from the browser.
- 5 new permissions, with defaults per role (see FORGE_AI_PERMISSION_MATRIX.md).
- Forge AI is off by default for each department. The admin tab holds the on/off switch, a switch per capability, a daily limit, usage, feedback and the audit trail.

## Tests

| Suite | Result |
|---|---|
| `npm run test:unit` | all pass (49 Forge AI tests): routing, time windows, permission and capability gating, settings, output validation (citations, doses, action and blame language), answer composition, prompt grounding, knowledge search, NERIS rules drift, answer rendering |
| `npm run test:rules` | all pass (6 Forge AI tests): owner-only reads, same-department non-owners and admins denied, other departments and signed-out denied, revoked access, server-only collections, no browser writes |
| `npm run test:functions` | all pass (24 Forge AI tests): signed-out callers on every callable, cross-department and forged department ids, records and model prompts never containing another department's data, conversation ownership, off by default, permission and capability gating, admin gating and audit, usage logs without question text, daily limit, a fake model (grounding, injection text kept in the data block, invalid citations, doses, action claims), model failure and invalid-output fallback, no record changes |

`npm run lint` and `vite build` are clean. The NERIS AI Narrative Writer code is untouched and its tests pass.

## Checked in the offline demo

- The nav entry and subtitle, the page, the not-configured model notice, suggestions limited to allowed capabilities, and history.
- Incident, dispatch, briefing, Heat Zone, documentation, NERIS quality and QA answers, with tables, sources, liveness labels, limitations and feedback.
- The Admin tab: settings, usage, recent questions without question text, and the audit trail.
- The Dashboard "Shift briefing" button and the NERIS editor "Check with Forge AI" button auto-send.
- A source link opens that exact report.
- The Firefighter role sees no Forge AI entry points.

Bugs found and fixed during this check:
- Answer tables couldn't be saved to Firestore.
- "Shift briefing for the last 30 days" used 24 hours.
- Some questions were routed to the wrong capability ("how do I…", "repeat calls", report numbers containing "NERIS").
- Raw Markdown showed in documentation answers.
- The QA sections were empty without the model.
- The summary was duplicated.
- The nav subtitle was hard to read.

## Not verified

- **A live model answer.** The emulator has no API key. Model calls are covered by a fake client in the tests, but no real Opus 5.5 response has been checked.
- **Production data volume.** The read limits are set to 20,000 reports per question.

## Deployment readiness

Ready to deploy after review, following FORGE_AI_DEPLOYMENT.md:
- Deploy functions, Firestore rules and hosting together.
- There are no new secrets or indexes.
- Forge AI stays off until each department turns it on.
- Custom roles need the new permissions granted by hand.

Rolling back is as simple as turning it off for the department.

## Blocked / out of scope

- A live CAD/AVL feed and staffing data. These are not in FORGE; see FORGE_AI_KNOWN_LIMITATIONS.md.
- Streaming answers and semantic (vector) documentation search. Not built; documented as limitations.
