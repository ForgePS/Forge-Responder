# Training Management Module — completion report

Branch `feat/training` (worktree `../forge-training`, from `origin/main` at 22d3a13). Nothing is committed, pushed or deployed.

## What was built

The old single Training page has been replaced by a 14-tab module (RMS → Training). The previous page is still available as **Administration → Legacy event log**.

| Tab | What it does |
|---|---|
| Dashboard | **My training:** hours, requirements, overdue items, classes.<br>**Department view:** sessions, instructional hours, person-hours, instructor hours, members trained, compliance %.<br>**Also shows:** today/week/month/year strip, discipline cards, needs-attention list (pending, returned, stale drafts, no documents, overdue, due soon, expiring certificates, evaluations, CE, requests), upcoming sessions, task books, station and shift comparisons, skills, costs.<br>Every card opens the filtered view behind it. |
| Calendar | Month, week, day and list views.<br>Recurring sessions (weekly, biweekly, monthly).<br>Self-enrollment with a prerequisite check; first-come waitlist; mandatory assignment with a notification.<br>Instructor and facility conflict checks; drag to reschedule; `.ics` export.<br>"Record attendance" opens a record with enrollees **unmarked**. |
| Records | Quick entry: topic, course, template or recent; "add on-duty crew" from today's schedule (always unmarked); outside participants; live totals.<br>Workflow: draft → submitted → returned → approved → locked, with reasons; the approver must differ from the submitter.<br>Amendments to approved records keep the original values (stored as an amendments subcollection).<br>Evidence uploads, history, CSV export. |
| Courses & Lesson Plans | Catalog with lesson sections: text, instructor notes, handouts, practical, safety, evaluation, video, file and embed.<br>Publishing creates an immutable version; records point at the exact version. Duplicate, archive and retire.<br>Starter fire/EMS catalog (titles only; imported as drafts). |
| Online Learning | Your Forge Academy enrollments (existing `listMyAcademyTraining` callable) and Academy completions synced into the legacy list. Those completions count toward course requirements. |
| Skills & Evaluations | Skill sheets with points and critical steps, plus critical failures.<br>Tablet checklist (done / missed / N/A); a missed critical step or a critical failure means fail.<br>Attempt limits and remediation; evaluator and candidate signatures.<br>Approval by a second person. |
| Certifications & Qualifications | Read-only view of the existing Certifications list (no second database): expirations, credential requirements, unlinked records. |
| EMS CE | Configurable CE rule sets. The NCCP starter is **inactive and flagged "needs verification"**.<br>Awards are capped at attended time. A deterministic id prevents crediting the same learning twice; a second person approves.<br>Cycle progress with national → local → individual spillover; transcript CSV. |
| Programs & Task Books | Templates (probation, driver/operator, acting officer, FTO, specialty…) built from tasks, courses, skills and assessments.<br>Assignments with evaluator sign-off, unsuccessful-attempt notes, FTO daily observation reports (7-point scale) and supervisor reviews.<br>Final authorization with a signature, available only after every required item is complete. |
| Requests | Outside training requests with a cost breakdown, justification and duty-coverage flag.<br>Approve or deny (not your own), cancel, record completion and reimbursement. |
| Facilities & Resources | Grounds, burn buildings, classrooms, props, equipment: status, capacity and inspection due date.<br>Direct reservations and session reservations; conflicts and out-of-service bookings are blocked; past-due inspections are flagged. |
| Compliance | Requirement rules (hours, course, skill, credential) with periods, effective dates, applicability (rank, station, shift, division, position, EMS level, team, person) and cited standards.<br>Rules are versioned with history. Per-member explanations; exemptions.<br>Immutable compliance snapshots; as-of date; CSV. |
| Reports & Analytics | Eleven reports: by discipline, station, shift, rank, member; transcript; instructor hours; course delivery; compliance by requirement; costs; record register.<br>Filters; CSV, Excel (`xlsx`) and print/PDF. Approved records only unless you tick "include unapproved". |
| Administration | Settings: require evidence; stale-draft reminder days.<br>Standards catalog, by citation only: organization, publication, edition, section, jurisdiction, effective dates, adoption status. Marking a standard "adopted" requires an adoption reference.<br>Record templates; legacy event log. |

### Hard rules enforced in code and Firestore rules

These come from the brief:

- Person-hours, instructional hours and instructor hours are always computed separately.
- Enrollment and on-duty status never mark attendance.
- Only approved or locked records count toward hours, compliance, CE and task books.
- Separation of duties: record approval, evaluation approval, CE approval and request decisions each need a second person.
- Locked records can't change. Approved records change only through an amendment whose subdocument is written in the same batch (the rules check `getAfter`).
- Live-fire records can't be submitted until the instructor-in-charge, safety officer and ignition officer are named (the safety officer can't be the ignition officer) and the 12-item department checklist is confirmed. This is always on.
- CE: no double counting, and no rule set can be activated until someone marks it verified.
- Privacy:
  - Evaluations, task-book assignments, CE awards, CE cycles and requests are readable only by the member and by reviewers.
  - Members' queries are filtered to their own rows.
  - Department "system settings" or IT permissions do **not** open training records; only training permissions do, in both the rules and the UI.
- Tenant isolation: everything lives under `departments/{id}/training*`, and the rules tests confirm another department can't read it.

## Files

**New**
- `src/lib/training/`: `trainingHours`, `trainingWorkflow`, `trainingCompliance`, `trainingCe`, `trainingSkills`, `trainingScheduling`, `trainingReports`, `trainingEvidence`, `trainingCatalog`, `trainingService`
- `src/components/training/`: `useTrainingData`, `TrainingUi`, `SignatureField`, `TrainingDashboard`, `TrainingCalendar`, `TrainingRecords`, `TrainingCourses`, `TrainingOnline`, `TrainingSkills`, `TrainingCertifications`, `TrainingCe`, `TrainingTaskBooks`, `TrainingRequests`, `TrainingResources`, `TrainingCompliance`, `TrainingReports`, `TrainingAdmin`
- `src/pages/TrainingPage.jsx` (module shell; the old page moved to `src/pages/LegacyTrainingLog.jsx`)
- `src/styles/training.css`
- Tests:
  - `tests/unit/trainingModule.test.mjs` (19)
  - `tests/unit/trainingScheduling.test.mjs` (8)
  - `tests/rules/training.rules.test.mjs` (19)

**Changed**
- `firestore.rules`: training helpers, 19 collections plus subcollections, `hasExplicitTenantRule`
- `functions/lib/moduleCatalog.js`: `training` prefix
- `src/data/defaultRoles.js` and `functions/lib/defaultRolePermissions.json` (kept identical)
- `src/data/creatorPermissions.js` and `src/data/adminRegistry.js`: new permissions `approveTraining`, `evaluateSkills`, `manageTrainingConfig`, `approveCeCredits`
- `src/App.jsx`: passes personnel, certifications, today's duty roster and navigation to Training; the gate accepts any training permission
- `src/lib/firebaseClient.js`: emulator ports can be overridden with `VITE_EMULATOR_*_PORT`; defaults unchanged
- `package.json`: `test:rules` includes the training rules tests

## Data and migrations

- There are no destructive migrations. New collections are created on first write.
- The legacy list `lists/hlfd-rms-training` is untouched. The Academy sync still writes it, and its completions are read as evidence.
- New permissions default to `false` for existing custom roles. Built-in roles are updated as follows:
  - **Creator and Fire Chief:** all permissions.
  - **Battalion Chief:** edit, approve and evaluate.
  - **Company Officer:** edit and evaluate.
  - **Firefighter, read-only and IT:** view only, where they already had it.
- **Departments with saved role overrides must grant the new permissions in Admin → Roles.**

## Tests and results (run 2026-11-17)

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run test:unit` | **612 / 612 pass** (includes 27 new training tests) |
| Firestore rules: `firestore.rules.test.mjs` + `helpDesk.rules.test.mjs` + `training.rules.test.mjs`, on an isolated emulator (ports 8187/9197) | **158 / 158 pass** |
| `npm run build` | succeeds |
| `npm run test:nav` | **fails** on a Prevention-menu assertion ("Open Damage Reports"). The test only reads `src/data/preventionNav.js`, which this branch doesn't touch, so the failure is not from this work. |
| `npm run test:functions` | **not run** (no Cloud Functions changed besides the module catalog map, which the unit suite covers) |

**Browser check** (dev server against isolated emulators seeded with the demo department, signed in as Fire Chief):

- **Loading:** all 14 tabs render with no console errors and no load errors.
- **Record flow:**
  - "Log training" → "Add on-duty crew (14)" added the crew unmarked.
  - Submit was blocked ("Mark attendance for 14 participants. Nobody is marked present").
  - After marking, the totals read 14 attended / 28 person-hours / 2 instructional h / 2 instructor h; one absence changed that to 13 / 26.
  - Submit succeeded through the real rules and transaction.
  - Department totals stayed at 0 until approval.
  - The same user couldn't approve ("Another approver must approve your own submission").
- **Live fire:** choosing "Live fire" showed the panel and its blocking list.
- **Compliance:** saving a 24-hour requirement recalculated it. A member with 2 pending hours shows "0 / 24 h (+2 awaiting approval)".
- **Layout:** at 375 px no tab overflows horizontally. Dark mode renders.
- **Not tested in the browser:** approving as a second person, because the demo's "viewing as" switch keeps the same login. The rules tests cover two-person approval with separate users.

## Not built, or partly built

- **Online exams and SCORM/xAPI:** not built. Online learning relies on Forge Academy, which grades on its server. Grading exams in the browser would be insecure, so it isn't offered.
- **AI assistance:** not built. No AI draft features were added, so there is nothing that could touch attendance, sign-off, credit or compliance.
- **Scheduled notifications and escalation:** not built. In-app notifications are sent on assignment, return, decisions and mandatory sessions. Reminders for due-soon or overdue items and supervisor escalation need a scheduled Cloud Function.
- **FORGE Field (mobile/offline) training entry:** not built. The desktop UI is responsive and works on tablets, but there is no offline Field record kind yet.
- **Auto-lock** of approved records after N days: not built. Locking is manual.
- **Server-side enforcement** of the live-fire checklist and CE caps is client-side plus transaction checks. Firestore rules enforce status, ownership and separation of duties, but not checklist contents.
- **Certificates and printable transcripts:** use the report print view. There is no branded PDF certificate generator.

## Needs human or regulatory validation before relying on it

1. **NCCP hour values** in the CE starter (EMR 16, EMT 40, AEMT 50, Paramedic 60, with component splits) are placeholders from general knowledge. They must be checked against the current NREMT recertification documents. The template ships inactive.
2. **Live-fire checklist:** the 12 items are the department's own wording, not text from NFPA 1403. The training officer should map each item to the adopted edition and local SOG.
3. **Starter catalog:** course titles only, no standards text. Content and JPR mapping are for the department to supply.
4. **Compliance rules:** none ship by default. The compliance screen says plainly that its results are not a regulatory determination. Any mapping to NFPA/ISO/OSHA/state requirements must be entered and validated by the department.
5. **FTO 7-point scale and categories:** generic; confirm against the agency's FTO program.

## Deployment prerequisites (not done; needs your approval)

1. Review and commit `feat/training`, then open a PR to `main`.
2. Deploy Firestore rules (`firebase deploy --only firestore:rules`) together with the web app. The UI relies on the new rules.
3. The Cloud Functions change is only `moduleCatalog.js` (data-retention and export mapping). Deploy functions if the retention or export jobs should cover training collections.
4. In each department, grant the new permissions to custom roles. Optionally add the Fire Chief's own requirement rules and verify a CE rule set.
5. No new paid resources, indexes or secrets are required. Member queries filter on a single field, which Firestore indexes automatically.

## Rollback

- **Web app:** redeploy the previous build. The legacy list is untouched, so the old Training page works as before.
- **Rules:** redeploy the previous `firestore.rules`. Training collections then fall under the generic tenant fallback, so **any department member could read the private ones** (evaluations, CE awards, requests), and subcollections (amendments, versions, enrollments) become inaccessible. If you roll back the rules, roll back the web app too, and export and delete the `training*` collections if private rows exist.
- **Data:** new `training*` collections can be left in place (inert) or exported and deleted per department. Nothing existing was rewritten.
