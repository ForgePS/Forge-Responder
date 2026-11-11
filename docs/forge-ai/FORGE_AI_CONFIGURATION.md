# Forge AI configuration

## Turning Forge AI on for a department

Forge AI is **off** for every department until someone turns it on.

1. Sign in as a member with **Turn Forge AI and its capabilities on or off** (`manageForgeAi`). Fire Chief and IT Admin have it by default.
2. Open **Forge AI → Admin**, or **System Admin → Forge AI settings**.
3. Tick **Forge AI is on for this department**.
4. Untick any capability the department should not use. All capabilities except **Web Research** are on by default once Forge AI is on. Web Research stays off until it is ticked (see below).
5. Set the **daily question limit** (whole department, 1–5000, default 300). The count resets at midnight in the department's time zone.
6. Select **Save settings**. Changes apply to the next question and are recorded in the audit trail.

Turning Forge AI off stops new questions immediately. Members' conversation history is kept.

## Web Research

Web Research lets Forge AI answer questions from public websites, such as NFPA standards, OSHA rules, recalls, grants or news. It is **off** until a manager ticks it, because the question leaves FORGE.

- Only the member's question, the department name and today's date are sent. Department records are never included.
- The search runs on Anthropic's server-side web search tool (`web_search_20260209`), with up to 5 searches per question. Results are localized to the department's time zone.
- Each answer lists the web pages it cites, with links. The same dose, URL and action-claim checks as other answers apply.
- Cost: web searches are billed by Anthropic at $10 per 1,000 searches, plus the model tokens. The Admin tab counts searches per day.
- If web search is disabled for the API organization in the Anthropic Console, Web Research answers "I couldn't search the web just now" and the usage log records `web-search-unavailable`.
- Without the AI model (no key, or the offline demo), Web Research can't run and says so.

## Who can use it

Members also need the Forge AI permissions and access to each capability's data. See [FORGE_AI_PERMISSION_MATRIX.md](FORGE_AI_PERMISSION_MATRIX.md). Forge AI never shows a member data they couldn't already open in FORGE.

## AI model

Forge AI uses the Anthropic API key already used by the NERIS AI Narrative Writer (the `ANTHROPIC_API_KEY` Cloud Functions secret). There is no separate key and no key in the browser.

- Model: `claude-opus-5-5`, effort `medium`, structured JSON output. Web Research uses the same model with the web search tool and plain text with citations instead of JSON (the two can't be combined).
- If the key isn't set, the model is unavailable, or its answer fails validation, Forge AI answers directly from the records instead and labels the answer **From records (no AI model)**. Forge AI shows a notice on its page when no key is configured.

## Usage and audit

**Forge AI → Admin** (with `viewForgeAiUsage`) shows the last 30 days:

- Questions per day, split into AI-written answers, answers from records, access checks and errors, with model token counts and web searches.
- The 100 most recent questions: member, capability, answer type, outcome, number of sources and time taken. Question text is not shown here; it stays in each member's own history.
- Feedback (helpful / not helpful and comments).
- The Forge AI audit trail: every question (`forge_ai.ask`) and every settings change (`forge_ai.settings`). These entries also appear in the department audit log.

## Updating the knowledge base and NERIS rules

Platform Knowledge answers come from a packed index of the Markdown files in `docs/`. Forge AI checks NERIS reports with the same rules as the NERIS report editor, bundled for Cloud Functions. After changing either, rebuild both before deploying:

```bash
npm run build:forge-ai
```

This writes `functions/lib/forgeAi/generated/knowledgeIndex.json` and `functions/lib/forgeAi/generated/nerisValidation.cjs`. A unit test fails if the bundled NERIS rules no longer match `src/lib/neris/validation.js`.

Specs, plans, audits and Forge AI's own design notes are left out of the index so Forge AI never describes planned work as a feature. The exclude list is at the top of `scripts/build-forge-ai-knowledge.mjs`.
