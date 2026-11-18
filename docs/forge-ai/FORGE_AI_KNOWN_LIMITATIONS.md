# Forge AI known limitations

Forge AI only answers from data FORGE already holds. Where that data doesn't exist, Forge AI says so in the answer's **Data limitations** section instead of guessing.

## Data that doesn't exist yet

| Area | Limitation | What Forge AI does instead |
|---|---|---|
| Live CAD feed | FORGE has no live CAD or dispatch feed. | Dispatch Intelligence uses the CAD times recorded on NERIS reports, plus the Active911 alert window. Calls without a report don't appear. |
| Unit locations (AVL) | No live unit positions. | Unit answers use fleet status and the units recorded on reports. |
| Staffing | No live staffing or shift roster data. | Briefings leave staffing out and say so. |
| Active911 history | Active911 alerts are a rolling window, not a full history. | Alerts are labelled live with their sync time; older alerts aren't available. |
| Heat Zone | Calls without a location can't be placed in a district. Heat Zone also follows the member's Heat Zone district and history permissions. | Heat Zone answers say how many calls had no location and which permissions limited the answer. |

## Behaviour

- **Answers aren't streamed.** A question shows "Working on it…" until the whole answer is ready (usually a few seconds, up to about a minute for briefings).
- **Report limit.** Each question reads at most the department's most recent 20,000 NERIS reports. Answers say when this limit was reached.
- **Keyword search for documentation.** Platform Knowledge uses keyword matching, not semantic search. Questions worded very differently from the docs may get "not documented" answers.
- **Questions are read by pattern, not free-form queries.** Time windows, unit names, report numbers, categories and addresses are picked out of the question. Unusual wording may fall back to the default window, which is always shown on the answer.
- **Response-time statistics** need at least 5 reports with response times; otherwise the briefing leaves the section out.
- **No write actions.** Forge AI never changes records. Fixes it suggests must be made in the relevant page.
- **Daily limit** is per department, not per member.
- **Model fallback.** When the model is unavailable or its answer fails validation, the answer is built from the records alone. It is accurate but less fluent, and has no AI observations.
- **Not a medical or legal tool.** Forge AI removes medication doses from answers and does not give medical direction, legal advice or findings about members.
- **Web Research needs the AI model.** It can't run in the offline demo or without the API key, and it reads only public pages that Anthropic's web search returns. Pages behind sign-ins (for example, paid NFPA standards) can't be read; answers may rely on summaries of them.
- **Web questions leave FORGE.** The question text is sent to Anthropic's web search. Forge AI does not remove names or details a member types into a web question.
- **Model answers can still be wrong.** Answers cite their sources and are validated, but members should check important facts against the records.
