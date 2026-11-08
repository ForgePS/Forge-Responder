# Heat Zone Analytics — Testing Results

Run on 2026-11-08, branch `feat/heat-zone-analytics`, Node 22, Firebase emulators (project `demo-forge-rms`).

| Suite | Command | Result |
|---|---|---|
| Unit (whole app, incl. 40 Heat Zone tests) | `npm run test:unit` | **420 / 420 pass** |
| Firestore rules (incl. 4 Heat Zone tests) | `npm run test:rules` | **104 / 104 pass** |
| Cloud Functions (incl. 35 Heat Zone tests) | `npm run test:functions` | **105 / 105 pass** |
| Lint | `npm run lint` | Clean |
| Production build | `npm run build` | Succeeds (one existing, unrelated chunking warning) |

## Multi-tenant security (release-blocking)

Two test departments, `dept-a` and `dept-b`, have **overlapping boundaries and calls at identical
coordinates and addresses**. All of these pass:

* Each department's dashboard counts only its own calls.
* A member of A who passes `departmentId: "dept-b"` is denied (`permission-denied`).
* Markers over the shared area return only the caller's department.
* Another department's incident id returns "not found", without revealing that it exists.
* Boundaries and district assignment stay inside their department.
* A source record claiming another department is rejected and never counted.
* The cache is keyed per department and scope: no cross-tenant or cross-scope hits.
* A district-restricted member is never served a result cached for a broader scope.
* Rules: browsers can't read or write `heatZoneCalls`, zones, settings, access or events, even in
  their own department; the live-version doc is readable only with Heat Zone permission, in their own department.

**Mutation check:** forcing "all districts" for every caller failed 6 tests, and skipping the membership
check failed 15. The suite catches both regressions.

## Authorization

Sign-in required. App access alone is denied. The marker, repeat-location, history (30-day clamp),
export and settings permissions are each enforced. The plan-module gate, suspended departments and
platform-creator access are covered. District-restricted members see only their districts in data,
filters, boundaries, comparisons and exports.

## Data and processing

* Exact totals by district, classification and priority.
* Map-bounds, midnight-crossing time and date filters.
* A new call is projected, bumps the live version and appears on the dashboard.
* Duplicate and replayed events don't double count, and out-of-order events converge on the current record.
* Legacy array-storage lists work.
* Coordinate moves, reclassification, priority and disposition changes, voids and deletions update all aggregates.
* Boundary changes recalculate past calls, and invalid GeoJSON is rejected.
* Reports carry agency, range, filters and generated time, and are audited in the correct department.

## Browser checks (emulator, demo department, 130 demo reports)

* Live update appeared without a reload.
* Cards, charts, trend, district comparison and repeat locations worked.
* Heat, clusters, markers and incident detail worked.
* The 22:00–02:00 filter showed the midnight note.
* CSV, Excel and print views worked.
* Settings worked.
* No console errors.
* A Firefighter persona deep link is redirected away from the page.
* Tablet width (768 px) has no horizontal scroll, and the map is usable.

The backfill dry run after live processing reported **0 differences** across the 130 reports, so the
trigger and the rebuild agree.

## Not tested

* A real staging or production deploy and load at production scale.
* Real department boundaries.
* Firestore TTL deletion of the event ledger (TTL doesn't run in the emulator).
