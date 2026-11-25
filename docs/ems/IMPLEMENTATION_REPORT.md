# Forge EMS Management — Implementation Report

Tracks each delivery slice from [REPOSITORY_DISCOVERY.md](REPOSITORY_DISCOVERY.md) §11. A slice is listed as done
only when it has server logic, rules, UI and passing tests.

| Slice | Status |
|---|---|
| E1 Foundation: module, permissions, audit, supply inventory core | **Deployed** (PR #97, staging and production) |
| E2 Equipment: records, lifecycle, moves, QR labels and scanning, import from Assets | **Built** (branch `feat/ems-equipment`, not deployed) |
| E3 – E9 | Not started |

---

## E1 — Supply inventory foundation

### What a department can do

- **Catalog**: supply items with category (the spec's 15 starter categories, plus any of their own), unit of measure,
  manufacturer and part number, barcode, vendor, unit cost, and whether a lot number and/or expiration date is required.
- **Locations**: station → storage area → cabinet → shelf → bin, plus vehicles (optionally linked to a Fleet vehicle).
  Nesting loops are refused; a location holding stock can't be turned off.
- **Par levels** per item per location: minimum, maximum, reorder point, reorder quantity. Drives low / out-of-stock flags.
- **Stock movements**: receive, use (with incident number), transfer (including restocking a unit), remove expired,
  remove damaged, waste, return to vendor. Each needs the right permission; waste/damaged/return need a reason.
- **FEFO or FIFO** (department setting, FEFO default). Lots are picked automatically, or a specific lot can be chosen.
  Expired stock is never picked for use or transfer; "remove expired" only picks expired lots.
- **Expiration warnings** at department-set days (default 90/60/30/14/7), shown on lots and in the summary.
- **Physical counts**: start a count at a location (expected quantities snapshot), enter actual counts per lot, add
  found stock, a reason is required for every difference, submit; **someone other than the counter** approves (stock
  adjusted by the difference found, so anything used while counting is kept) or rejects with a note.
- **Reversals**: an approver reverses a posted transaction with a reason. The original stays; a linked reversal record
  undoes it exactly. Each transaction can be reversed once; reversals can't be reversed; a reversal that would leave
  less than zero is refused.
- **History** (ledger, newest 200, filter by item or location) and an **Audit** tab of every change.

### How it is built

| Piece | Where |
|---|---|
| Stock rules (FEFO/FIFO, lot picking, never-negative, flags, count checks) | `functions/lib/emsInventory/logic.js` |
| Callables (11): settings, item, location, par, post, reverse, start/save/submit/approve/reject count | `functions/lib/emsInventory/service.js`, exported in `functions/index.js` as `emsInventory*` |
| Client service and display helpers | `src/lib/ems/emsInventoryService.js`, `src/lib/ems/inventoryDisplay.js` |
| Page and tabs | `src/pages/EmsSupplyInventoryPage.jsx`, `src/components/ems/*`, `src/styles/ems-inventory.css` |
| Navigation | New **EMS** sidebar group → **EMS Supply Inventory** (`src/App.jsx`, `src/lib/permissions.js`) |
| Rules | `firestore.rules`: read-only for browsers, `emsInventoryReadKeys()`, module `emsManagement` |
| Indexes | `firestore.indexes.json`: ledger by item + time, by location + time |

**Ledger integrity.** Every movement is one Firestore transaction: read the balances, check the rules, create the
ledger record, update every affected balance, write the audit event. If any check fails, nothing is written. The
browser sends a request id per action; the ledger record id is derived from it and created with `create()`, so a
retry (or a double tap) returns the first result instead of moving stock twice. Balances are a projection: the sum of
the ledger lines for a location equals its balance (tested).

### Data (all under `departments/{id}/`, written only by the callables)

| Collection | Holds |
|---|---|
| `emsSettings/main` | rotation policy, expiration warning days |
| `emsInventoryItems` | catalog |
| `emsInventoryLocations` | locations with `parentId` and `ancestorIds` |
| `emsInventoryBalances/{locationId}__{itemId}` | `onHand`, `lots[]` (lot, expiration, quantity, receivedAt), `par`, `lowStock`, `outOfStock`, `earliestExpiration` |
| `emsInventoryTransactions` | append-only ledger: type, item, quantity, from/to, per-lot `lines[]` with signed deltas, who, when, reason, incident number, reversal links |
| `emsInventoryCounts` | count rows (expected / counted / reason), status, counter, reviewer |
| `emsAuditEvents` | actor, action, record, summary, before/after where relevant |

### Permissions (new)

| Key | Lets a member | Built-in roles |
|---|---|---|
| `viewEmsInventory` | see stock, catalog, locations, history, counts | every built-in role |
| `useEmsSupplies` | record use, transfer/restock, remove expired or damaged, count | Fire Chief, Battalion Chief, Company Officer, Firefighter |
| `manageEmsInventory` | catalog, locations, par, receive, waste, return to vendor | Fire Chief, Battalion Chief |
| `approveEmsInventoryAdjustments` | approve/reject counts (not their own), reverse transactions | Fire Chief, Battalion Chief |
| `manageEmsSettings` | stock rotation and warning days | Fire Chief, IT Admin |
| `viewEmsAudit` | EMS audit history | Fire Chief, Battalion Chief, IT Admin |

Read Only gets `viewEmsInventory`. Departments can change any of these per role or per member.

### Tests

| Suite | New tests | Covers |
|---|---|---|
| `tests/unit/emsInventory.test.mjs` | 18 | FEFO/FIFO order, expired never used, chosen lot, never negative, flags, transfers, reversals, count checks, client/server constants match |
| `tests/functions/emsInventory.test.mjs` | 18 | end to end ledger = balance, retry and double-submit deduct once, two people taking the last stock (one wins, nothing negative), concurrent transfers, permissions per role, other department refused even with real ids, plan without the module, counts with independent reviewer, found stock, reversals |
| `tests/rules/emsInventory.rules.test.mjs` | 5 | reads need an EMS permission, other departments and unauthenticated refused, audit needs `viewEmsAudit`, module off = no reads, no browser writes anywhere |

Full suite on this branch: lint, build, unit 793/793, rules 173/173, functions 221/221.

### Known limits of E1

- Crews can record use or transfers at **any** location, not only their assigned unit. Assignment scoping arrives with
  "My Assigned Unit" (E3/E8).
- No reserved quantity yet: reservations come with restock and supply requests (E6/E7), so available = on hand.
- One item per transaction. Receiving a shipment with many items is one entry per item until purchase-order receiving (E7).
- No supply-to-supply-request link, no reorder recommendations, no notifications or scheduled expiration alerts yet (E7/E8).
- Expiration "today" is the UTC date.
- The stock and catalog lists read every balance and item document live. Fine for a department-sized catalog;
  if one grows past a few thousand balances it should page.
- No hash chain on supply transactions. Tamper evidence is planned for the controlled-substance ledger (E5), where the spec requires it.

### Deploying E1

1. `firebase deploy --only functions,firestore:rules,firestore:indexes --project staging`, then hosting.
2. Wait for the two new indexes to finish building before using the History filters.
3. Existing departments: new modules appear automatically for plans that list no modules; plans that list modules
   need `emsManagement` added in the Creator Console.
4. Rollback: redeploy the previous hosting build and functions. The new collections are inert without the UI; nothing
   existing was changed.

---

## E2 — Equipment

### What a department can do

- **Register equipment.** Monitors, AEDs, suction units, stretchers, ventilators and the rest of the spec's 15
  categories, plus categories the department adds. Each record holds:
  - name, category and equipment ID (unique in the department; one is made if left blank)
  - make, model, serial number and barcode
  - purchase date and cost, vendor, warranty end
  - condition and notes
  - inspection, calibration and maintenance schedules (an interval in days, or a set next date)
- **Where it is.** Each item is either on a Fleet vehicle (status Assigned) or at an EMS storage location from E1
  (status Available). The record copies the name and station of its vehicle or location.
- **Statuses**: Available, Assigned, In Service, Inspection Due, Maintenance Required, Out of Service, Missing,
  Retired, Disposed. Inspection Due is worked out from the due dates when shown, not stored, so it is always current.
- **Actions.** The history records each one: who, when, and the status before and after.
  - Verify the item is there. If it was marked missing, this marks it found and puts back its earlier status.
  - Report damage or a deficiency. The item either stays in use or is taken out of use until repaired.
  - Request maintenance, or report the item missing.
  - Record an inspection or calibration. A pass sets the next due date from the interval. A fail needs notes and
    holds the item for repair.
  - Complete maintenance. This clears the problem and returns the item to use.
  - Move it to another vehicle or storage location.
  - Change its status by hand. Out of Service and Retired need a reason. Disposed can only follow Retired, and it
    can't be changed afterwards.
- **Photos and documents** on each record: up to 20 of each, 25 MB per file. Photos must be images.
- **QR labels.** Each record shows its QR code. Select records in the list to print a sheet of 66 mm labels, each
  with the item's name, ID and QR code.
- **Scan.** A phone's camera app opens the link in the QR code straight to the record
  (`?page=ems-equipment&equipment=<id>`). The in-app **Scan** tab uses the browser's barcode reader if the browser has
  one. Otherwise the code can be typed, or sent by a scanner that acts as a keyboard. A scan matches the QR link,
  equipment ID, serial number or barcode.
- **History tab** listing every equipment event, with filters.
- **Import from the classic Assets list** (`lists/hlfd-rms-assets`):
  - Preview each row as it would be imported, including the vehicle it would be placed on.
  - Choose which rows to import. Rows already imported, or whose ID is already in use, are skipped.
  - The Assets list itself is not changed.
  - An import can be rolled back. Records nobody has changed since the import are deleted. Changed records are kept
    and listed.

### How it is built

| Piece | Where |
|---|---|
| Shared EMS helpers used by E1 and E2: caller checks, ids, audit | `functions/lib/emsCommon.js` |
| Lifecycle rules, due dates, mapping of Assets list rows | `functions/lib/emsEquipment/logic.js` |
| 12 callables: save, transfer, verify, report problem, record inspection, complete maintenance, set status, add file, remove file, preview import, apply import, roll back import | `functions/lib/emsEquipment/service.js`, exported in `functions/index.js` as `emsEquipment*` |
| Client service, display helpers, labels | `src/lib/ems/emsEquipmentService.js`, `equipmentDisplay.js`, `equipmentLabels.js` |
| Page and tabs | `src/pages/EmsEquipmentPage.jsx`, `src/components/ems/equipment/*`, `src/styles/ems-equipment.css` |
| Navigation | **EMS** sidebar group → **EMS Equipment** |
| Rules | Browsers can only read; reads need a key from `emsEquipmentReadKeys()` and the `emsManagement` module. Inventory or equipment readers can read storage locations. Files use the existing department storage rule. |
| Index | `emsEquipmentEvents`: `equipmentId` ascending, `at` descending |

Every action runs as one transaction that:

1. Reads the record.
2. Checks the caller's permission and the lifecycle rule.
3. Updates the record and adds 1 to its version.
4. Creates the history event.
5. Writes the audit event.

The history event's id comes from the browser's request id and is written with `create()`. So a retry or a double
tap changes the record only once. A request id reused by a different person, or for a different record, is refused.
If two people move the same item at the same moment, both moves are applied, one after the other, and both appear in
the history.

When a manager opens the page and Fleet has no vehicles yet, the page fills Fleet from the classic apparatus list,
as the Fleet pages already do. That way equipment and imported rows can be placed on vehicles.

### Data (under `departments/{id}/`, written only by the callables)

| Collection | Holds |
|---|---|
| `emsEquipment` | each record: details, status, condition, `assignment` (vehicle or location, with its name and station), schedules and next due dates, open problem, missing report, photos and documents, lookup keys for ID / serial / barcode, the `migration` tag, `version` |
| `emsEquipmentEvents` | history: type, status before and after, place before and after, notes, who, when |
| `emsEquipmentMigrations` | one per import: rows imported, ids created, rows skipped and why, rollback result |

Files are stored in Storage under `departments/{id}/emsEquipment/{equipmentId}/`.

### Permissions (new)

| Key | Lets a member | Built-in roles |
|---|---|---|
| `viewEmsEquipment` | see equipment, history and labels; scan | every built-in role |
| `checkEmsEquipment` | verify; report damage, maintenance needed or missing; record inspections | Fire Chief, Battalion Chief, Company Officer, Firefighter |
| `transferEmsEquipment` | move equipment between vehicles and storage | Fire Chief, Battalion Chief, Company Officer |
| `manageEmsEquipment` | register and edit; add and remove files; change status; complete maintenance; import and roll back | Fire Chief, Battalion Chief |

The server refuses a move from anyone without `transferEmsEquipment`, so opening a scanned link doesn't let anyone
move equipment.

### Tests

| Suite | New tests | Covers |
|---|---|---|
| `tests/unit/emsEquipment.test.mjs` | 21 | lifecycle and status rules, due dates, flags, mapping of Assets list rows, scan matching, client and server constants match |
| `tests/functions/emsEquipment.test.mjs` | 24 | each action end to end with history and audit; permissions per role; a retry acts once; a reused request id is refused; two moves at once; missing and found; failed inspection; retire and dispose; files; another department refused; plan without the module; import preview, apply, skips and rollback; lists stored one record per document; event timestamps |
| `tests/rules/emsEquipment.rules.test.mjs` | 6 | reads need an equipment permission; import reports need `manageEmsEquipment`; other departments and plans without the module refused; no browser writes |

`tests/rules/firestore.rules.test.mjs` and `helpDesk.rules.test.mjs` used to connect to fixed ports 8080 and 9199.
They now use the ports `emulators:exec` assigns, so a test run can't clear another emulator on the default ports.

Full suite on this branch: lint, build, unit 842/842, rules 185/185, functions 253/253.

### Known limits of E2

- Inspection is pass or fail with notes. Checklists for each equipment type come with the checklist engine (E3).
- The in-app camera scanner needs a browser with a barcode reader (for example Chrome and Edge on Android). It has
  not been tested on a device yet. Phones can always scan the QR label with their camera app instead.
- No reminders or notifications for due inspections yet (E8). The list and summary show what is due.
- Crews can move or check any equipment, not only their own unit's. Limiting them to their unit comes with
  "My Assigned Unit" (E3/E8).
- The list loads every equipment record live, which is fine at the size of one department's equipment.

### Deploying E2

1. Run `firebase deploy --only functions,firestore:rules,firestore:indexes --project staging`, then deploy hosting.
   Storage rules are unchanged.
2. Wait for the `emsEquipmentEvents` index to finish building before opening equipment history.
3. Built-in roles get the new permissions automatically. Custom roles need them added in Admin.
4. To roll back, redeploy the previous build. Without the UI nothing uses the new collections, and imports never
   change the Assets list.
