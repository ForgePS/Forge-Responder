# Help Desk — Platform Administration

How the Help Desk is set up, who is notified, and how it is secured.

## Who designates the notification addresses

Two lists, both optional, and a new request is emailed to the union of them:

- **Platform list** (Creator Console → platform workspace → **Help Desk** → Platform notification list). Kept by platform creators. Every new request from every department is emailed here. This is FORGE support's inbox.
- **Department list** (RMS → Help Desk → **Notifications**, or Creator Console → a department workspace → Help Desk). Kept by that department's admins. Only that department's new requests are emailed here.

Why: departments are tenants the owner creates and supports, so FORGE support needs every request regardless of department settings; departments with their own IT or admin staff can add themselves without seeing other departments' requests. The platform list lives in `platformHelpDesk/settings`, not `platformConfig`, because `platformConfig` is readable by every signed-in user and the list holds email addresses.

## Who sees what

| Person | Sees | Can do |
| --- | --- | --- |
| Any signed-in member | Requests they opened; public replies and status changes on them | Open requests, reply, attach files, close or reopen their own |
| Department admin (department_admin role, Fire Chief, IT Admin) | Every request from their department, internal notes, the email log | Reply, internal notes, status, assignee (their department's admins), priority, category, department list |
| Platform creator | Every request from every department | Everything above, assign to creators or department admins, the platform list |

A department admin who opens a request is its requester: their replies notify FORGE support. Internal notes are visible to everyone who works the request, including that department's admins.

## Notifications

All email goes through `functions/lib/mailer.js` (Resend, or SendGrid as a fallback), the same as invites and billing. Firestore triggers send them:

- `helpDeskOnTicketCreated`: new request → platform list + department list (reply-to: the requester).
- `helpDeskOnMessageCreated`: staff reply or status change → requester; requester reply → assignee, or both lists when unassigned; assignment → the new assignee. Internal notes and priority/category changes send nothing.

Each email is recorded under `helpDeskTickets/{id}/notifications` with its recipients, text and outcome (`sent`, `logged`, `demo_not_sent`, `no_recipient`, `not_configured`, `failed`), shown to staff as the request's **Email notifications** log. A retried trigger doesn't send twice.

Nothing is emailed for the public demo department (`forge-demo`): its sign-in is published, so the notification is recorded as `demo_not_sent`. With `EMAIL_DELIVERY=log` (offline demo and staging, `functions/.env.*`) the mailer writes the email to the functions log instead of sending it.

## Data and rules

- `helpDeskTickets/{ticketId}`: the request. Read by its requester and staff; written only by the functions.
- `helpDeskTickets/{ticketId}/messages/{id}`: replies (`visibility: public`), internal notes (`internal`) and status/assignment events. Requesters may only query `visibility == "public"`.
- `helpDeskTickets/{ticketId}/notifications/{id}`: staff only.
- `platformHelpDesk/settings` (creators), `platformHelpDesk/counter` (server only), `helpDeskSettings/{departmentId}` (that department's admins), `helpDeskRate/{uid}` (server only; 10 new requests per person per hour).
- Storage `helpDesk/{departmentId}/{uid}/…` (new-request files) and `helpDeskReplies/{ticketId}/{public|internal}/{uid}/…` (reply files). Files are opened through the signed-in session, never shared download links, and requesters can't open files on internal notes. 10 MB, images, PDF, text, CSV and JSON only.

Callables: `helpDeskCreateTicket`, `helpDeskAddMessage`, `helpDeskUpdateTicket`, `helpDeskListAssignees`, `helpDeskGetSettings`, `helpDeskSaveSettings`. Every ticket action is written to the department's audit log (module "Help Desk"); list changes go to the department log or `platformAuditLogs`.

## Tests

- `tests/rules/helpDesk.rules.test.mjs` (in `npm run test:rules`): requester/staff/cross-department reads, no client writes, settings, Storage uploads and reads.
- `tests/functions/helpDesk.test.mjs` (in `npm run test:functions`): creation, validation, rate limit, notifications and their recipients, demo and log modes, replies, status, assignment, settings, audit entries.
- `tests/unit/helpDesk.test.mjs` (in `npm run test:unit`): client and server choices match, browser description, help article search.

## Deploying

No new secrets (it uses `RESEND_API_KEY`) and no new indexes. Deploy functions, Firestore and Storage rules, and hosting. After deploying, add FORGE support's address in Creator Console → Help Desk; until then new requests are recorded but emailed to no one (`no_recipient`).
