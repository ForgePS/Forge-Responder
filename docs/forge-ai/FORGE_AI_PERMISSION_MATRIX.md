# Forge AI permission matrix

Forge AI adds five permissions. They are set per role in **System Admin → Roles & permissions** (group "Forge AI") and can be granted to individual members like any other permission.

| Permission | Label | What it allows |
|---|---|---|
| `useForgeAi` | Use Forge AI | Open Forge AI and ask questions |
| `useForgeAiBriefings` | Generate Forge AI briefings | Shift & Command Briefings |
| `useForgeAiSupervisorQa` | Forge AI supervisor QA | Supervisor QA reviews |
| `manageForgeAi` | Turn Forge AI on or off | Department settings (on/off, capabilities, daily limit) |
| `viewForgeAiUsage` | View Forge AI usage | Usage, feedback and audit tab (`manageForgeAi` includes this) |

## Default roles

| Role | Use | Briefings | Supervisor QA | Manage | View usage |
|---|---|---|---|---|---|
| Platform creator | Yes | Yes | Yes | Yes | Yes |
| Fire Chief | Yes | Yes | Yes | Yes | Yes |
| Battalion Chief | Yes | Yes | Yes | No | No |
| Company Officer | Yes | Yes | No | No | No |
| Firefighter | No | No | No | No | No |
| Read-only | No | No | No | No | No |
| IT Admin | Yes | No | No | Yes | Yes |

## Capability access

A capability works only when **all** of these are true:

1. Forge AI is on for the department.
2. The capability is not switched off in Forge AI settings.
3. The department has the module the capability reads from.
4. The member has `useForgeAi` (platform creators always pass this step).
5. The member has the capability's data permissions.

| Capability | Data permissions | Module |
|---|---|---|
| Incident Intelligence | `viewNerisReports` | NERIS Fire Reports |
| Dispatch Intelligence | `viewNerisReports` | NERIS Fire Reports |
| Heat Zone Intelligence | `viewHeatZoneAnalytics` | Analytics |
| Unit & Resource Intelligence | `viewApparatus` or `viewFleetDashboard` | Apparatus |
| Shift & Command Briefings | `useForgeAiBriefings` and `viewNerisReports` | NERIS Fire Reports |
| NERIS Data Quality | `viewNerisReports` | NERIS Fire Reports |
| Supervisor QA | `useForgeAiSupervisorQa` and `viewNerisReports` | NERIS Fire Reports |
| Platform Knowledge | none beyond `useForgeAi` | none |

Briefings include the District, Geographic and Unit sections only when the member can also use Heat Zone Intelligence or Unit & Resource Intelligence. Heat Zone answers are further limited by the member's Heat Zone station or district scope, the same as the Heat Zone page.

## Stored data

| Collection (under `departments/{id}/`) | Who can read it | Who writes it |
|---|---|---|
| `forgeAiConversations`, `forgeAiMessages`, `forgeAiMessageSources` | Only the member who owns the conversation, with `useForgeAi` | Cloud Functions only |
| `forgeAiBriefings` | Only the author, with `useForgeAiBriefings` | Cloud Functions only |
| `forgeAiSettings` | Through the `forgeAiGetSettings` function (`viewForgeAiUsage` or `manageForgeAi`) | `forgeAiSaveSettings` (`manageForgeAi`) |
| `forgeAiUsage`, `forgeAiUsageLogs`, `forgeAiFeedback` | Through `forgeAiUsageReport` (`viewForgeAiUsage` or `manageForgeAi`) | Cloud Functions only |

No member can read another department's Forge AI data. Browsers cannot write any Forge AI collection directly.
