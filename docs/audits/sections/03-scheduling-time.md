## Scheduling, time sheets and leave

Traced from `src/App.jsx:1306` (Scheduling) and `src/App.jsx:1345` (Time Sheets), plus the Employee Portal leave, trade, "Open Vacancies" and time card views. All of this area's data (roster, schedule days, leave, trades, overtime offers, vacancy pickups, call shifts, time cards) is stored through `useTenantPersistentState` under `departments/{id}/lists/{listKey}`. The scheduling lists map to module `scheduling` and time cards map to `timeSheets` (`firestore.rules:152-179`). Writes are allowed by `canWriteModule` (`firestore.rules:127`), which only checks department membership and plan entitlement. No Cloud Function validates any scheduling, leave or time card action. The only server function in this area is the SMS sender.

### Inventory
| Page / feature | Where (file) | Status (1-7) | One-line note |
|---|---|---|---|
| Scheduling page shell, stat strip | src/pages/SchedulingPage.jsx | 2 | Stats come from live roster snapshots. Clicking a day writes `scheduleDays`, even for view-only users. |
| Daily Roster (assign, partial slots, OT "+") | src/components/admin/AdminDailyRoster.jsx | 2 | Saves work, but nothing stops a member being double-booked or assigned while on leave (see findings) |
| 7-Day Schedule / 30 Day Calendar | WeekRosterView.jsx, ShiftCalendar.jsx | 1 | Built from rotation, roster and leave data |
| Daily Staffing panel | SchedulingPage.jsx:643 | 4 | Minimum is always equal to the number staffed, so it always reads "X / X" |
| Print Roster | SchedulingPage.jsx:554 | 2 | Works (pop-up). Header shows the same wrong "staffed of minimum" figure. |
| Leave Requests (admin) | src/components/scheduling/LeaveRequestsPanel.jsx | 2 | Approve, deny and delete persist and update accruals. No check that someone is approving their own leave, no balance check, no audit, no confirmation before delete. |
| Vacancy Pickup Requests | SchedulingPage.jsx:574 | 2 | Approving checks eligibility and adds the member to the roster |
| Overtime Coverage (offers) | src/components/scheduling/OvertimeOffersPanel.jsx | 2 | Real posting and assignment. Admin-only, with no member-facing side, no fairness/OT-hours list and no rest-hour limit. |
| Shift Trades (admin) | src/components/scheduling/ShiftTradesPanel.jsx | 4 | Anyone who can view the schedule can approve as a Battalion Chief. The recorded approver is whichever chief is listed first. |
| Trade "Open" button | ShiftTradesPanel.jsx:218 | 5 | Only shows a message ("…opened for audit review") |
| Shift Broadcast (call shift) | src/components/scheduling/CallShiftPanel.jsx, src/lib/callShiftWorkflow.js | 3 | Tier 1 is notified in-app and by SMS. Later tiers, the wait timer and the deadline are never acted on. |
| Call Shift Rules | CallShiftRulesPanel.jsx | 1 | Rules feed candidate ranking |
| Portal: Shift broadcast accept/decline | src/components/employee/CallShiftOffers.jsx | 2 | Saves the reply. Every eligible member sees the broadcast, not just the tier that was notified. |
| Portal: Leave request form | src/pages/EmployeePortalPage.jsx:536 | 2 | No check for overlapping leave, available balance or minimum staffing. ID is based on list length. |
| Portal: Shift trade form / approvals | EmployeePortalPage.jsx:592-685 | 2 | Approver role is checked in the client, and the approver's identity is recorded correctly |
| Portal: Vacancy pickup | src/components/employee/VacancyPickupPanel.jsx | 1 | Creates a request and notifies the BC |
| Time Sheets: Edit Time Sheet | src/components/admin/AdminTimeCardEditor.jsx | 2 | Model is calculated from roster, leave and pay rules. Not edit-gated. Signatures are free text. No lock. |
| Time Sheets: Bulk Print | src/components/admin/TimeCardBulkPrintPanel.jsx, src/lib/printTimeCard.js | 1 | Clones the sheets and calls print |
| Portal: My Time Card | src/components/employee/EmployeeTimeCard.jsx | 2 | Member can still edit after the department head has signed |
| Pay Rules / holidays (settings) | src/components/PayRulesPanel.jsx, src/lib/payRules.js | 2 | Saves are admin-only by rules. Defaults are Horn Lake values, and holidays are listed for 2026 only. |
| Payroll export / pay-period approval | — | 6 | Missing: no CSV/payroll export, and no submit, approve or lock step for a pay period |
| Dashboard "Personnel On Duty" / "Staffing Deficit" | src/utils/dashboardMetrics.js:85-89 | 5 | Not on-duty data (see finding 2) |
| `kpis` constant in App.jsx | src/App.jsx:246 | 7 | Hard-coded "42 of 56", "14" values. Defined but never used. |

### Findings
- **[Demo-blocker] The dashboard's "Personnel On Duty" and "Staffing Deficit" figures are not real on-duty counts.** `onDuty` counts every Active person in the department (`src/utils/dashboardMetrics.js:85`). The deficit comes from a hard-coded day `"2026-06-10"`, or failing that `scheduleDays[0]`, which is whichever day someone happened to click (`:86-89`). A chief will see "on duty = whole department". Fix: work both out from `buildDayScheduleSnapshot` for the current shift day, as the staffing rows already do. Effort S.
- **[Demo-blocker] The Daily Staffing panel always says staffing is met.** `resolveDayCoverageMetrics({ dayRoster, personnel })` is called without a `minimum`, so the minimum defaults to the number staffed (`SchedulingPage.jsx:126`, `src/lib/schedulingRoster.js:~826`). The panel then shows "21 / 21" next to "3 position needs coverage", which comes from the snapshot (`SchedulingPage.jsx:647-648`). The printed roster header has the same problem (`:566`). Fix: use `selectedDaySnapshot.coverage` throughout. Effort S.
- **[High] Approvals are enforced only in the UI, and the rules let any member rewrite them.** Every member can create, update or delete any leave request, trade, roster entry or time card (`firestore.rules:460-477` with `canWriteModule`). A firefighter can therefore approve their own leave, delete someone else's request, or edit their own time card hours from the browser console. Fix: move leave, trade and time-card decisions into callables, or add rules that let members write only their own pending items. Effort L.
- **[High] Anyone who can view the schedule can approve a shift trade, and the record names the wrong chief.** `ShiftTradesPanel` gets no permission prop (`SchedulingPage.jsx:835`), so the "Read Only" role (`src/data/defaultRoles.js:322`) sees working Approve and Deny buttons. The approval is recorded as `getPendingBattalionChiefs(trade)[0]`, not the person who clicked (`ShiftTradesPanel.jsx:99-101`). "New Trade Request" also lets a viewer file a trade for any member. Fix: pass `canEditRoster`, record the signed-in approver, and gate the controls. Effort S.
- **[High] Time Sheets is not edit-gated.** The route only checks `viewSchedule` (`App.jsx:1346`), so the Read Only role can change any employee's medic hours, workers comp and OT, and type a "Department Head Signature". Signatures are free-text inputs that save on every keystroke, with no signer identity or timestamp (`TimeCardSheet.jsx:52-75`, `AdminTimeCardEditor.jsx:156`). Nothing locks a card after signing: the member can still edit it in the portal (`EmployeeTimeCard.jsx:87-140`). Fix: require `editSchedule` or a new `editTimeSheets` permission, capture uid and time when signing, and lock a signed pay period. Effort M.
- **[High] Supervisors can approve their own leave.** `canManage` in the portal's "My Leave Requests" is true for any `accessAdminRms` user (`EmployeePortalPage.jsx:966`). The admin panel has no check comparing the approver with `request.personnelId` either (`LeaveRequestsPanel.jsx:167`). Both approval stages (officer, then BC) can be clicked through by the same person. Fix: block self-approval and stage approvals by assigned approver. Effort S.
- **[High] The daily roster allows double-booking.** The partial-slot picker lists every active member (`AdminDailyRoster.jsx:418-426`), and `assignPersonToUnit` runs no eligibility check (`SchedulingPage.jsx:356`), so a person can be placed on two units or while on approved leave. The OT "+" path (`addOvertimeToUnit`, `SchedulingPage.jsx:440`) only compares home shift with duty shift and does not call `checkOvertimeEligibility`, unlike offers, pickups and broadcasts. Fix: run `checkOvertimeEligibility` (or a same-day conflict check) on every assignment path. Effort S.
- **[High] Any member can send SMS to any personnel with any text.** `sendShiftBroadcastSms` only calls `assertDepartmentAccess` and accepts arbitrary `personnelIds` and `message` (`functions/index.js:107-122`). It has no role check and no rate or volume cap, and Twilio cost falls on the platform. Fix: require `editSchedule` on the server and cap the number of recipients. Effort S.
- **[Medium] A day assignment silently rewrites the member's permanent unit.** Choosing a unit for one day also sets `personnel.unit/assignment` (`SchedulingPage.jsx:309-313, 425-430`). Fix: only change roster entries. Effort S.
- **[Medium] Shift broadcast tiers and deadlines are not implemented.** Only tier 1, capped at 25 people, is ever notified (`CallShiftPanel.jsx:277-278`). There is no scheduler for `waitMinutes`, later tiers or `deadlineDate`, and status never becomes "expired". The portal shows the broadcast to every eligible member regardless of tier (`callShiftWorkflow.js:343-347`). Fix: add a scheduled function, or hide tier settings until it exists. Effort M.
- **[Medium] Leave submission has no business checks.** Nothing checks for an overlap with existing leave, hours against the accrual balance (accruals only floor `used` at 0, `leaveAccrualIntegration.js:69`), or minimum staffing or max-off-per-day. Fix: validate at submit and show the remaining balance. Effort M.
- **[Medium] The dashboard leave queue misses portal requests.** `pendingLeave` and Open Tasks filter on `status === "Pending"` (`dashboardMetrics.js:101,117`). Real statuses are "Pending Officer Approval" and "Pending Battalion Chief" (`employeePortalWorkflow.js:143-166`). Fix: use `isLeavePending`. Effort S.
- **[Medium] Decisions are neither audited nor notified, but submissions notify everyone.** Admin approve, deny and delete for leave and trades write no audit log and do not notify the member. Meanwhile `logAction` sends every leave submission, trade and broadcast reply to `userId: "all"` (`EmployeePortalPage.jsx:517-533`). That exposes members' leave to the whole department. Fix: notify the approver and the requester only, and audit the decisions. Effort S.
- **[Medium] "Today" means the calendar date, not the shift day.** `formatDayId(new Date())` is used everywhere. Between midnight and `shiftChangeTime`, the roster, dashboard and portal show the oncoming crew. Dates are browser-local, not department-timezone. Fix: add a `currentShiftDayId(shiftChangeTime)` helper. Effort S.
- **[Medium] Record IDs are based on list length.** Leave uses `L-${300 + leaveRequests.length}` and trades use `TR-${500 + length}` (`EmployeePortalPage.jsx:568,617`). After a delete, or when two people submit at once, IDs repeat, and per-item storage keys on `id`. Fix: use `uniqueRecordId`. Effort S.
- **[Medium] Pay rules carry Horn Lake defaults.** The OT threshold defaults to 106 hours per period regardless of period length, and a saved value of 96 is silently changed to 106 (`payRules.js:158-165`). Default holidays are 2026 only, and the default pay period is June 2026 (`payPeriods.js:3`). Fix: use neutral defaults and recurring holidays. Effort S.
- **[Low] Viewing writes data.** `selectDay` writes a `scheduleDays` snapshot on every calendar click, for any viewer (`SchedulingPage.jsx:205-224`). The dashboard then reads those stale snapshots. Effort S.
- **[Low] Admin trade form has no shift checks.** Nothing checks that the requester works the "give" day or the coverage member works the "receive" day (`ShiftTradesPanel.jsx:107`). Effort S.
- **[Low] Small gaps.** Leave delete has no confirmation (`LeaveRequestsPanel.jsx:224`). The modal shows the raw "Personnel ID". The panel text reads "1 position needs coverage" even for several (no plural). Effort S.

### Duplicates and obsolete code
- `kpis` in `src/App.jsx:246-255` is a dead hard-coded copy of the dashboard tiles. Delete it.
- There are three overlapping ways to fill a vacancy: Overtime Offers (admin-only), Vacancy Pickups (member-initiated) and Shift Broadcast (push). Each has its own status model. Consider making Overtime Offers a view of broadcasts.
- `ShiftTradesPanel` and `LeaveRequestsPanel` define their own local `Badge`, `Panel` and `Modal` instead of using `shell/ui.jsx`.
- Leave can be recorded two ways: by choosing "Vacation"/"Sick" in the roster dropdown, which does not touch accruals or requests, or through leave requests.
- The SMS text points members to "Open Vacancies" (`functions/index.js:68`). That matches the portal page name, but the admin tab is called "Shift Broadcast". Use consistent wording.

### Quick wins (under an hour each)
- Calculate dashboard On Duty and Deficit from today's snapshot, and delete the dead `kpis`.
- Use `selectedDaySnapshot.coverage` in the Daily Staffing panel and on the print header.
- Gate `ShiftTradesPanel` and Time Sheets editing on `canEditRoster`/`editSchedule`, and record the signed-in approver.
- Block self-approval of leave (`request.personnelId === viewer personnelId`).
- Call `checkOvertimeEligibility` in `assignPersonToUnit` and `addOvertimeToUnit`.
- Require `editSchedule` and a recipient cap in `sendShiftBroadcastSms`.
- Change `status === "Pending"` to `isLeavePending` in dashboard metrics.
- Replace length-based leave and trade IDs with `uniqueRecordId`.
- Stop the "all users" notification for leave and trade submissions.
- Remove the placeholder "Open" button on trades, or make it open a detail modal.
