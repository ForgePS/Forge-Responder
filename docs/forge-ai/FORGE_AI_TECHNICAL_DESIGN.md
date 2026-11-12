# Forge AI Operations Copilot — Technical Design

Companion to `FORGE_AI_ARCHITECTURE_DISCOVERY.md`. Everything here reuses an existing platform mechanism unless it says otherwise.

## 1. Shape

One assistant ("Forge AI — Public Safety Operations Intelligence"), one chat UI, eight **capabilities**. Each capability is a
read-only server-side service that retrieves a bounded, allowlisted set of facts. The model only *phrases* those facts; it has
no tools, never builds queries, and never sees another department.

```
Browser (ForgeAiPage / launch buttons)
   │ httpsCallable forgeAiAsk {departmentId, conversationId?, message, capability?, context?}
   ▼
functions/lib/forgeAi/service.js  ask()
   1 authenticate          request.auth required                    → unauthenticated
   2 resolve tenant        assertDepartmentAccess (membership, active dept)  → permission-denied / failed-precondition
   3 resolve settings      forgeAiSettings/main (enabled, capability switches, daily limit)
   4 resolve capability    explicit capability, else router.classify(message)
   5 check permissions     capabilities.js: Forge AI key + underlying data keys + module entitlement
   6 reserve daily use     forgeAiUsage/{day} transaction             → resource-exhausted
   7 retrieve              services/<capability>.js (read-only, department path only, allowlisted fields)
   8 grounded request      model.js: system rules + <records> JSON (untrusted) + question; JSON-schema output
   9 validate              validate.js: drop unknown citations/sections, strip markup, dosage + blame filters,
                           empty/refused/failed → deterministic answer built from the same facts
  10 persist + return      conversation, messages, message sources, usage log, audit log
```

The model is optional at runtime: without an API key (offline demo) or when the provider fails, step 9 returns the
deterministic answer, labelled "Generated from records without the AI model". Other RMS pages never call Forge AI.

## 2. Capabilities

| id | Name | Data (read-only) | Live vs historical |
|---|---|---|---|
| `dispatch` | Dispatch Intelligence | CAD fields on NERIS reports (`workspace.cad`, units, address); Active911 window list | reports: historical; Active911: live window as of `syncedAt` |
| `incident` | Incident Intelligence | NERIS reports: summary facts (narrative-writer allowlist), timeline, Forge validation, similar incidents | historical |
| `heatZone` | Heat Zone Intelligence | `heatZone.dashboard()` called *as the user* (district scope, history, repeat-location permissions apply) | historical (projection version + generatedAt) |
| `units` | Unit & Resource Intelligence | `fleetAssets` readiness/status/restriction/last check; unit activity from `workspace.units[]` | readiness: as maintained in Fleet; activity: historical |
| `briefing` | Shift & Command Briefings | Composes incident, heat zone, units and outstanding-item services; saves a `forgeAiBriefings` record | mixed, per section |
| `nerisQuality` | NERIS Data Quality Assistant | Bundled Forge rules (`validateNerisReport`, `computeCompletionPercentage`) | historical |
| `supervisorQa` | Supervisor QA | Validation + time-order checks + response-time outliers | historical |
| `knowledge` | Platform Knowledge | `generated/knowledgeIndex.json` built from `docs/` | reference |
| `web` | Web Research | None from the department. Anthropic server-side web search (`web_search_20260209`, max 5 uses); cited pages become `kind: "web"` sources with `link.url`. Off unless `settings.capabilities.web === true` (`defaultOff`) | web |

### Routing
`router.classify(message, allowed)` is a deterministic keyword scorer (e.g. "heat", "district", "hot spot" → heatZone;
"brief", "shift report" → briefing; "missing", "NERIS", "validation" → nerisQuality; "how do I", "where is" → knowledge).
An explicit capability from the UI or an entry point always wins. If the best match is not allowed for the caller, the reply
says so and retrieves nothing.

### Query understanding (no free-form queries)
`query.js` extracts, deterministically: a time window (today, yesterday, last N hours/days, this/last week, this/last
month, a named month, an ISO date), report numbers, unit ids (`E1`, `M-2`, `Ladder 3`), incident categories (fire, EMS,
MVA, hazmat, rescue, alarm, service), and an address fragment. Services accept only these parsed values. Windows are
capped at 366 days; Heat Zone also applies its own history limit.

### Briefing structure
Sections, in order: Executive Summary, Call Activity, Significant Incidents, District Activity, Unit and Resource Activity,
Geographic Trends, Response-Time Performance, Outstanding Items, Notable Observations, Data Limitations. A section is
included only when the caller may see its data **and** there is data; Data Limitations is always included. Notable
Observations is model-written and labelled as AI observations; it is omitted in the deterministic answer.

### Supervisor QA buckets
- **Confirmed issues** — failed Forge validation rules and time-order problems (rule output, quoted as such).
- **Potential issues** — warnings and statistical outliers (e.g. response time above the period's 90th percentile).
- **AI observations** — model text, labelled, filtered for fault/blame/discipline/misconduct language.
No personnel names reach the model. The UI states that QA output is not a finding about any member.

## 3. Permissions

New keys (added to `creatorPermissions.js`, `adminRegistry.js` labels/group, `defaultRoles.js`,
`defaultRolePermissions.json`):

| Key | Meaning |
|---|---|
| `useForgeAi` | Open Forge AI and use capabilities whose underlying data the member can already see |
| `useForgeAiBriefings` | Generate shift/command briefings |
| `useForgeAiSupervisorQa` | Run Supervisor QA reviews |
| `manageForgeAi` | Turn Forge AI and individual capabilities on/off, set the daily limit |
| `viewForgeAiUsage` | See usage, feedback and the Forge AI audit trail |

Capability requirements (all also need `useForgeAi`, the department switch, and the capability switch):

| Capability | Extra permission(s) | Module |
|---|---|---|
| dispatch | `viewNerisReports` | `nerisFireReports` |
| incident | `viewNerisReports` | `nerisFireReports` |
| heatZone | `viewHeatZoneAnalytics` (+ Heat Zone's own scope rules) | `analytics` |
| units | `viewApparatus` or `viewFleetDashboard` | `apparatus` |
| briefing | `useForgeAiBriefings` + `viewNerisReports` (sections further gated) | `nerisFireReports` |
| nerisQuality | `viewNerisReports` | `nerisFireReports` |
| supervisorQa | `useForgeAiSupervisorQa` + `viewNerisReports` | `nerisFireReports` |
| knowledge | — | — |

Defaults: creator, fireChief = all; battalionChief = use + briefings + QA; companyOfficer = use + briefings;
itAdmin = use + manage + usage; readOnly and firefighter = none (admins can grant). Platform creators pass all checks,
as everywhere else.

## 4. Data model (all under `departments/{departmentId}/`, all written only by Cloud Functions)

| Collection | Doc | Fields | Client rule |
|---|---|---|---|
| `forgeAiSettings` | `main` | `enabled` (default **false**), `capabilities{id: bool}`, `dailyLimit`, `updatedAt`, `updatedBy` | none |
| `forgeAiConversations` | auto | `departmentId`, `ownerUid`, `title`, `capability`, `messageCount`, `archived`, `createdAt`, `updatedAt` | owner read |
| `forgeAiMessages` | auto | `departmentId`, `conversationId`, `ownerUid`, `role`, `text`, `capability`, `answer{…}`, `sourceIds[]`, `generatedBy` (`model`/`rules`), `model`, `dataAsOf`, `liveness`, `createdAt` | owner read |
| `forgeAiMessageSources` | auto | `departmentId`, `conversationId`, `messageId`, `ownerUid`, `kind`, `recordId`, `label`, `detail`, `liveness`, `asOf`, `link` | owner read |
| `forgeAiUsage` | `YYYY-MM-DD` | `requests`, `modelAnswers`, `ruleAnswers`, `errors`, `byCapability{}`, `inputTokens`, `outputTokens` | none |
| `forgeAiUsageLogs` | auto | `uid`, `capability`, `generatedBy`, `model`, `latencyMs`, `inputTokens`, `outputTokens`, `outcome`, `createdAt` (no prompt text) | none |
| `forgeAiFeedback` | auto | `messageId`, `conversationId`, `uid`, `rating`, `comment`, `capability`, `createdAt` | none |
| `forgeAiBriefings` | auto | `kind`, `window`, `sections[]`, `createdBy`, `createdAt`, `sourceCount`, `generatedBy` | author only (`createdBy == uid`) with `useForgeAiBriefings` |

All are listed in `hasExplicitTenantRule()`. Writes are denied to every client. Conversations, messages and sources are
readable only by their owner (and creators); everything else is served by permission-checked callables. Audit entries go to
the existing `auditLogs` (`module: "Forge AI"`).

## 5. Callables (`functions/index.js` → `functions/lib/forgeAi/service.js`)

| Callable | Purpose |
|---|---|
| `forgeAiBootstrap` | Department switch, capabilities available to the caller (with reasons when not), suggested questions, admin flags, whether a model is configured |
| `forgeAiAsk` | The orchestration flow above |
| `forgeAiListConversations` / `forgeAiGetConversation` | Caller's own history only |
| `forgeAiRenameConversation` / `forgeAiArchiveConversation` | Caller's own conversations only |
| `forgeAiFeedback` | Thumbs up/down + comment on the caller's own assistant message |
| `forgeAiGetSettings` / `forgeAiSaveSettings` | `manageForgeAi` |
| `forgeAiUsageReport` | `viewForgeAiUsage` or `manageForgeAi`: 30 days of usage, recent logs, feedback, Forge AI audit entries |

`forgeAiAsk` uses the existing `ANTHROPIC_API_KEY` secret. Model: `claude-opus-5-5`, `effort: "medium"`, structured JSON
output, `server-side-fallback-2026-07-01` with `fallbacks: "default"` (same request shape as the narrative writer).

## 6. Prompt-injection and safety controls
- Records are passed as JSON inside `<records>`; the system prompt says record text is data, never instructions.
- Free text is scrubbed with the narrative writer's `scrubFreeText`; staff appear by rank/role/unit only.
- No tools, no URLs, no write paths: an injected instruction has nothing to act on.
- The one exception is Web Research (`model.generateWeb`): its only tool is Anthropic's server-side web search, and its
  request carries only the question, department name and date, never records. Web pages are treated as data in its system
  prompt. Structured output can't be combined with web search citations, so the answer is plain text: the text after the
  last search result, with `[S#]` markers placed after each cited span, then the same `validateOutput` checks (doses,
  URLs, action claims). Only `http(s)` citation URLs become sources. `pause_turn` is continued up to 3 times.
- Output is validated: citations must be retrieved source ids; section ids must be known; HTML is stripped; medication-dose
  patterns and blame/discipline language are removed (QA); anything invalid falls back to the deterministic answer.
- The system prompt forbids speculation about causes ("explain what the data shows, not why"), dispatch/operational
  commands, and medical treatment or dosage advice.

## 7. Frontend
- `src/pages/ForgeAiPage.jsx` (lazy), `src/components/forgeAi/*`, `src/lib/forgeAi/*`, `src/styles/forge-ai.css`.
- Nav: `["Forge AI", Sparkles]` after Dashboard with subtitle "Public Safety Operations Intelligence" (new optional
  `NAV_SUBTITLES` map, rendered under the label when the sidebar is expanded). Gated by `useForgeAi`.
- Tabs: Assistant; Admin (with `manageForgeAi` / `viewForgeAiUsage`).
- Chat: history list, new conversation, rename/archive, capability chips (only allowed ones), suggested questions (only
  allowed capabilities), loading/error/retry, copy, tables, source chips with live/historical labels and timestamps,
  "Generated by AI model" vs "Generated from records" badge, thumbs feedback.
- Entry points (`openForgeAi({capability, prompt, context})` → window event → App switches page): Heat Zone page,
  NERIS report editor (data quality / incident summary for that report), NERIS reports list (dispatch/call search),
  NERIS Analytics (reporting), System Admin (settings), Command Dashboard (shift briefing). Buttons render only for members
  with `useForgeAi`.
- Rendering is a small safe Markdown subset (paragraphs, bullets, bold) built from React elements — no `innerHTML`.

## 8. Testing
- Unit: router, query parser, validation/sanitizer, deterministic answers, knowledge retrieval, NERIS bundle parity with
  `src/lib/neris/validation.js`, permission/role parity.
- Rules: unauthenticated, other department, same-department non-owner, owner read, client writes denied, settings/usage hidden.
- Functions: unauthenticated, cross-department, forged department id, disabled department/capability, permission gating,
  heat zone scope delegation, daily limit, fake model client (grounding + citation validation + injection text), fallback
  when the model fails, conversation ownership, admin settings/usage gating.
