# Forge AI deployment

Forge AI ships as part of the normal FORGE Responder deploy. It adds Cloud Functions, Firestore rules and frontend code. It needs no new secrets and no new Firestore indexes.

## What changes

| Part | Change |
|---|---|
| Cloud Functions | 10 new callables: `forgeAiBootstrap`, `forgeAiAsk`, `forgeAiListConversations`, `forgeAiGetConversation`, `forgeAiRenameConversation`, `forgeAiArchiveConversation`, `forgeAiFeedback`, `forgeAiGetSettings`, `forgeAiSaveSettings`, `forgeAiUsageReport` |
| Secrets | Reuses `ANTHROPIC_API_KEY` (already set for the NERIS AI Narrative Writer) |
| Firestore rules | 8 new department collections: owner-only reads for conversations, messages, sources and briefings; no client access to settings, usage or feedback; no client writes anywhere |
| Firestore indexes | None (all queries are single-field) |
| Roles | 5 new permissions in the default roles (see the permission matrix). Existing departments' custom roles don't get them automatically; grant them in Roles & permissions |
| Frontend | Forge AI page, nav entry, Ask Forge AI buttons |

## Before deploying

1. Rebuild the generated files if `docs/` or `src/lib/neris/validation.js` changed since the last build:

   ```bash
   npm run build:forge-ai
   ```

2. Run the full test suite:

   ```bash
   npm test
   ```

3. Confirm the secret exists (it does if the AI Narrative Writer works). Don't print its value.

## Deploying

Deploy rules and functions together, so the new callables never run against old rules:

```bash
firebase deploy --only functions,firestore:rules,hosting --project rms-dashboard-7562e --non-interactive
```

Never use `--force`. Deploying only the new functions is also fine:

```bash
firebase deploy --only functions:forgeAiBootstrap,functions:forgeAiAsk,functions:forgeAiListConversations,functions:forgeAiGetConversation,functions:forgeAiRenameConversation,functions:forgeAiArchiveConversation,functions:forgeAiFeedback,functions:forgeAiGetSettings,functions:forgeAiSaveSettings,functions:forgeAiUsageReport --project rms-dashboard-7562e --non-interactive
```

## After deploying

1. Forge AI is off for every department. Turn it on per department in **Forge AI → Admin** (see [FORGE_AI_CONFIGURATION.md](FORGE_AI_CONFIGURATION.md)).
2. Grant the Forge AI permissions to custom roles where needed.
3. Ask one question per capability and check the answers cite real records.
4. Web Research stays off for every department until a manager turns it on. Before turning it on, check that web search is allowed for the API organization in the Anthropic Console.

## Rolling back

- **Fastest:** turn Forge AI off for the department. Questions stop immediately; nothing else in FORGE depends on Forge AI.
- **Full:** redeploy the previous release. The Forge AI collections stay in Firestore and can be deleted later if wanted.

## Offline demo

`npm run demo:offline` seeds Forge AI as on for the `forge-demo` department. The emulator has no API key, so every answer is built from the records and labelled **From records (no AI model)**.
