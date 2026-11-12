# Forge AI user guide

Forge AI ("Public Safety Operations Intelligence") is a read-only assistant inside FORGE Responder. It answers questions from your department's own records and from FORGE's documentation. It never changes, submits or deletes anything.

## Opening Forge AI

- Choose **Forge AI** in the left navigation, under Dashboard.
- Or use an **Ask Forge AI** button on another page. The button opens Forge AI with a question ready for that page:
  - **Command Dashboard**: "Shift briefing" writes a briefing for the last 24 hours.
  - **NERIS Fire Reports**: "Ask about calls" lists calls from the last 24 hours.
  - **NERIS report editor**: "Check with Forge AI" checks the saved report against Forge's NERIS rules.
  - **Heat Zone Analytics**: asks about districts and busy hours for the last 30 days.
  - **NERIS Analytics (Reporting)**: summarizes incidents this month.
  - **System Admin**: "Forge AI settings" opens the Forge AI admin tab.

The buttons only appear for members who can use Forge AI. If Forge AI is off or unavailable, the rest of FORGE keeps working as normal.

## What you can ask

Forge AI picks a capability from your question, or you can choose one with the chips above the question box.

| Capability | Ask about | Example |
|---|---|---|
| Incident Intelligence | Incident summaries, timelines, missing fields, similar incidents | "Summarize incidents from the last 7 days" |
| Dispatch Intelligence | Calls by time, type, unit or address | "What calls did E1 run yesterday?" |
| Heat Zone Intelligence | Busy districts, repeat locations, hours of day, period comparison | "Which district was busiest in the last 30 days?" |
| Unit & Resource Intelligence | Fleet readiness, restrictions, unit activity | "Which units are out of service?" |
| Shift & Command Briefings | A structured briefing for a shift, week or month | "Create a shift briefing for the last 24 hours" |
| NERIS Data Quality | Missing or invalid NERIS fields | "Which draft reports are missing required fields?" |
| Supervisor QA | Rule failures, potential issues and observations for review | "Run a QA review for last week" |
| Platform Knowledge | How FORGE Responder works | "How do I turn on Heat Zone Analytics?" |
| Web Research | Public information from the internet: standards, regulations, recalls, grants, news | "Search the web for the latest NFPA 1710 turnout time" |

Web Research is available only when your department has turned it on. Forge AI uses it for questions about standards bodies and agencies (NFPA, OSHA, NIOSH, USFA, FEMA), regulations, recalls, grants and news, or whenever you say "search the web", "look it up online" or similar. Only your question is sent to the web search; your department's records are never included, so don't type names or other private details into a web question.

Time words Forge AI understands include: today, yesterday, last 24 hours, this shift, last N hours, last N days, last N weeks, this week, last week, this month, last month, this year, last year, month names, and dates such as 2026-03-01. Unit names such as "Engine 1", "E-1" and "E1" are treated the same. Without a time word, Forge AI uses a sensible default window and shows it on the answer.

## Reading an answer

- **AI-written from records** means the AI model wrote the answer from the records listed under Sources.
- **From records (no AI model)** means Forge AI built the answer directly from the records, for example when the AI model isn't configured or didn't respond.
- **AI-written from web sources** means the AI model searched the web and wrote the answer from the pages listed under Sources. Select a source to open the page in a new tab.
- **Access check** means Forge AI explained why it can't answer (for example, a missing permission).
- Citations such as [S1] point to the sources listed under the answer. Select a source to open the record.
- **Live** data (Active911 alerts, fleet status) shows when it was last updated. **Historical** data comes from saved reports. **Reference** sources are FORGE documentation. **Web** sources are public websites, not department records.
- **AI observation** marks text the model wrote as an observation, not a fact from a record.
- **Data limitations** lists what the answer could not cover, such as the lack of a live CAD feed.
- Use the copy button to copy an answer, and the thumbs buttons to rate it.

Always check important facts against the source records. Forge AI does not explain why something happened, assign fault, or recommend discipline.

## Conversations

Your conversations are private to you. Use **New conversation** to start again, and rename or archive conversations from the history list. Archived conversations no longer show in the list.

## What Forge AI will not do

- Change, submit, approve or delete records.
- Show you data you couldn't already open in FORGE.
- Read another department's data.
- Give medication doses or medical direction.
- Name civilians involved in incidents.
- Make findings about a member's fault or conduct.
- Describe features FORGE doesn't have.
