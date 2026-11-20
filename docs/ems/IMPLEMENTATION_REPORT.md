# Forge EMS Management — Implementation Report

Tracks each delivery slice from [REPOSITORY_DISCOVERY.md](REPOSITORY_DISCOVERY.md) §11. A slice is listed as done
only when it has server logic, rules, UI and passing tests.

| Slice | Status |
|---|---|
| E1 Foundation: module, permissions, audit, supply inventory core | **Built** (branch `feat/ems-inventory-foundation`, not deployed) |
| E2 – E9 | Not started |

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
