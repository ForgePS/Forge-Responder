// EMS equipment rules (functions/lib/emsEquipment/logic.js) and the display
// helpers that mirror them (src/lib/ems/equipmentDisplay.js): status moves, due
// dates, scan lookup, QR addresses and the classic Assets list mapping.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as display from "../../src/lib/ems/equipmentDisplay.js";

const require = createRequire(import.meta.url);
const logic = require("../../functions/lib/emsEquipment/logic.js");

const TODAY = "2026-11-25";
const onUnit = { fleetAssetId: "M1", unitDesignation: "Medic 1", stationName: "Station 1" };
const inStorage = { locationId: "L1", locationName: "Supply room", stationName: "Station 1" };

describe("status after a move", () => {
  it("placing equipment on a vehicle makes it Assigned; storage or nowhere makes it Available", () => {
    assert.equal(logic.statusAfterTransfer("available", onUnit), "assigned");
    assert.equal(logic.statusAfterTransfer("assigned", inStorage), "available");
    assert.equal(logic.statusAfterTransfer("assigned", {}), "available");
  });

  it("in-service equipment stays in service between vehicles; repair holds stay as they are", () => {
    assert.equal(logic.statusAfterTransfer("in_service", onUnit), "in_service");
    assert.equal(logic.statusAfterTransfer("in_service", inStorage), "available");
    assert.equal(logic.statusAfterTransfer("maintenance_required", inStorage), "maintenance_required");
    assert.equal(logic.statusAfterTransfer("out_of_service", onUnit), "out_of_service");
  });

  it("missing, retired and disposed equipment can't be moved", () => {
    for (const status of ["missing", "retired", "disposed"]) {
      assert.throws(() => logic.statusAfterTransfer(status, onUnit), logic.EquipmentRuleError);
    }
  });

  it("a hold ends back where the equipment is", () => {
    assert.equal(logic.statusAfterHold("in_service", onUnit), "in_service");
    assert.equal(logic.statusAfterHold("in_service", inStorage), "available");
    assert.equal(logic.statusAfterHold("", onUnit), "assigned");
    assert.equal(logic.statusAfterHold(null, {}), "available");
  });
});

describe("manual status changes", () => {
  it("allows the normal ones", () => {
    assert.doesNotThrow(() => logic.assertManualStatus("available", "in_service"));
    assert.doesNotThrow(() => logic.assertManualStatus("maintenance_required", "out_of_service"));
    assert.doesNotThrow(() => logic.assertManualStatus("in_service", "retired"));
    assert.doesNotThrow(() => logic.assertManualStatus("retired", "disposed"));
    assert.doesNotThrow(() => logic.assertManualStatus("retired", "available"));
    assert.doesNotThrow(() => logic.assertManualStatus("missing", "retired"));
  });

  it("refuses disposing before retiring, anything after disposal, and setting action-only statuses", () => {
    assert.throws(() => logic.assertManualStatus("in_service", "disposed"), /Retire the equipment before/);
    assert.throws(() => logic.assertManualStatus("disposed", "available"), /final/);
    assert.throws(() => logic.assertManualStatus("available", "missing"), /Choose a status/);
    assert.throws(() => logic.assertManualStatus("available", "assigned"), /Choose a status/);
    assert.throws(() => logic.assertManualStatus("missing", "in_service"), /verifying it/);
    assert.throws(() => logic.assertManualStatus("available", "available"), /already/);
  });
});

describe("due dates", () => {
  it("overdue on or before today, soon within 30 days, otherwise nothing", () => {
    assert.equal(logic.dueState("2026-11-25", TODAY), "overdue");
    assert.equal(logic.dueState("2026-10-01", TODAY), "overdue");
    assert.equal(logic.dueState("2026-12-25", TODAY), "soon");
    assert.equal(logic.dueState("2026-12-26", TODAY), "");
    assert.equal(logic.dueState("", TODAY), "");
    assert.equal(logic.dueState("2026-02-30", TODAY), "");
  });

  it("the next due date comes from the interval", () => {
    assert.equal(logic.nextDue("2026-11-25", 30), "2026-12-25");
    assert.equal(logic.nextDue("2026-11-25", 365), "2027-11-25");
    assert.equal(logic.nextDue("2026-11-25", null), null);
    assert.equal(logic.nextDue("2026-11-25", 0), null);
  });

  it("an active item with an overdue inspection shows as Inspection due; retired items show nothing due", () => {
    const record = { status: "in_service", schedules: { nextInspectionDue: "2026-11-01" }, warrantyExpiration: "2026-12-01" };
    assert.equal(logic.displayStatus(record, TODAY), "inspection_due");
    assert.deepEqual(logic.equipmentFlags(record, TODAY), { inspection: "overdue", calibration: "", maintenance: "", warranty: "soon", replacement: "" });
    assert.equal(logic.displayStatus({ ...record, status: "maintenance_required" }, TODAY), "maintenance_required");
    assert.deepEqual(Object.values(logic.equipmentFlags({ ...record, status: "retired" }, TODAY)), ["", "", "", "", ""]);
  });

  it("the browser works out the same flags and statuses", () => {
    const records = [
      { status: "assigned", schedules: { nextInspectionDue: "2026-11-25", nextCalibrationDue: "2026-12-10" } },
      { status: "available", schedules: { nextMaintenanceDue: "2027-06-01" }, replacementDate: "2026-12-01" },
      { status: "disposed", schedules: { nextInspectionDue: "2020-01-01" } },
    ];
    for (const r of records) {
      assert.deepEqual(display.equipmentFlags(r, TODAY), logic.equipmentFlags(r, TODAY));
      assert.equal(display.displayStatus(r, TODAY), logic.displayStatus(r, TODAY));
    }
    assert.deepEqual(display.dueBadges(records[0], TODAY).map((b) => b.tone), ["critical", "warning"]);
  });
});

describe("client and server agree", () => {
  it("on statuses, categories, conditions and the due-soon window", () => {
    assert.deepEqual(display.STATUSES, logic.STATUSES);
    assert.deepEqual(display.MANUAL_STATUSES, logic.MANUAL_STATUSES);
    assert.deepEqual(display.CLOSED_STATUSES, logic.CLOSED_STATUSES);
    assert.deepEqual(display.REASON_REQUIRED_STATUSES, logic.REASON_REQUIRED_STATUSES);
    assert.deepEqual(display.CONDITIONS, logic.CONDITIONS);
    assert.deepEqual(display.DEFAULT_EQUIPMENT_CATEGORIES, logic.DEFAULT_EQUIPMENT_CATEGORIES);
    assert.equal(display.DUE_SOON_DAYS, logic.DUE_SOON_DAYS);
    for (const s of [...logic.STATUSES, "inspection_due"]) assert.ok(display.STATUS_INFO[s], `label for ${s}`);
    assert.equal(logic.DEFAULT_EQUIPMENT_CATEGORIES.length, 15);
  });

  it("on lookup keys", () => {
    for (const value of ["ast-1042", " CM 22018 ", "AED/90117", ""]) assert.equal(display.lookupKey(value), logic.lookupKey(value));
    assert.equal(logic.lookupKey("ast-1042"), "AST1042");
  });
});

describe("scanning", () => {
  const equipment = [
    { id: "EQ-A1", name: "Cardiac monitor", assetNumber: "AST-1178", assetNumberKey: "AST1178", serialKey: "CM22018", barcodeKey: "" },
    { id: "EQ-B2", name: "AED", assetNumber: "AST-1362", assetNumberKey: "AST1362", serialKey: "AED90117", barcodeKey: "0884521" },
    { id: "EQ-C3", name: "Suction unit", assetNumber: "SU-1", assetNumberKey: "SU1", serialKey: "DUP", barcodeKey: "" },
    { id: "EQ-D4", name: "Suction unit", assetNumber: "SU-2", assetNumberKey: "SU2", serialKey: "DUP", barcodeKey: "" },
  ];
  const location = { origin: "https://camden.forgeresponder.com", pathname: "/" };

  it("a QR label holds this app's EMS Equipment page with the record id, and reading it back finds the record", () => {
    const url = display.equipmentUrl("EQ-B2", location);
    assert.equal(url, "https://camden.forgeresponder.com/?page=ems-equipment&equipment=EQ-B2");
    assert.equal(display.equipmentIdFromScan(url), "EQ-B2");
    assert.equal(display.findEquipment(url, equipment).match.id, "EQ-B2");
    assert.equal(display.findEquipment("https://camden.forgeresponder.com/?page=ems-equipment&equipment=OTHER", equipment).match, null);
  });

  it("the department path is kept for departments served under one (web.app/camden)", () => {
    assert.equal(display.equipmentUrl("EQ-1", { origin: "https://x.web.app", pathname: "/camden" }), "https://x.web.app/camden?page=ems-equipment&equipment=EQ-1");
  });

  it("finds by equipment ID, serial or barcode, ignoring case and punctuation", () => {
    assert.equal(display.findEquipment("ast-1178", equipment).match.id, "EQ-A1");
    assert.equal(display.findEquipment("cm22018", equipment).match.id, "EQ-A1");
    assert.equal(display.findEquipment("0884521", equipment).match.id, "EQ-B2");
    assert.equal(display.findEquipment("EQ-C3", equipment).match.id, "EQ-C3");
  });

  it("a shared serial lists every match instead of guessing; nothing found is empty", () => {
    const shared = display.findEquipment("dup", equipment);
    assert.equal(shared.match, null);
    assert.deepEqual(shared.matches.map((e) => e.id), ["EQ-C3", "EQ-D4"]);
    assert.deepEqual(display.findEquipment("nope", equipment), { match: null, matches: [] });
    assert.deepEqual(display.findEquipment("  ", equipment), { match: null, matches: [] });
    assert.equal(display.equipmentIdFromScan("not a url"), "");
  });
});

describe("what each person can do", () => {
  it("follows the permissions and the record's status", () => {
    const crew = { check: true };
    const officer = { check: true, transfer: true };
    const manager = { manage: true };
    const live = { status: "in_service" };
    assert.deepEqual(display.equipmentAbilities(live, {}), { verify: false, report: false, inspect: false, transfer: false, maintain: false, status: false, edit: false, files: false });
    assert.equal(display.equipmentAbilities(live, crew).verify, true);
    assert.equal(display.equipmentAbilities(live, crew).transfer, false);
    assert.equal(display.equipmentAbilities(live, officer).transfer, true);
    assert.equal(display.equipmentAbilities(live, manager).maintain, true);
    const missing = display.equipmentAbilities({ status: "missing" }, manager);
    assert.equal(missing.verify, true);
    assert.equal(missing.transfer, false);
    assert.equal(missing.report, false);
    const retired = display.equipmentAbilities({ status: "retired" }, manager);
    assert.equal(retired.verify, false);
    assert.equal(retired.status, true);
    assert.equal(display.equipmentAbilities({ status: "disposed" }, manager).status, false);
  });
});

describe("classic Assets list import", () => {
  const vehicles = [{ id: "FA-E1", unitDesignation: "Engine 1", fleetNumber: "E1", station: "Station 1" }, { id: "FA-M1", unitDesignation: "Medic 1" }];
  const stations = ["Station 1", "Station 2"];

  it("reads the dates and dollar amounts the old list holds", () => {
    assert.equal(logic.parseLegacyDate("Dec 18, 2026"), "2026-12-18");
    assert.equal(logic.parseLegacyDate("January 5, 2027"), "2027-01-05");
    assert.equal(logic.parseLegacyDate("Sept 3, 2027"), "2027-09-03");
    assert.equal(logic.parseLegacyDate("2027-03-04"), "2027-03-04");
    assert.equal(logic.parseLegacyDate("3/4/2027"), "2027-03-04");
    assert.equal(logic.parseLegacyDate("Feb 30, 2027"), null);
    assert.equal(logic.parseLegacyDate("soon"), null);
    assert.equal(logic.parseMoney("$28,500"), 28500);
    assert.equal(logic.parseMoney("1,900.50"), 1900.5);
    assert.equal(logic.parseMoney(42), 42);
    assert.equal(logic.parseMoney("about $5k"), null);
  });

  it("maps a row on a Fleet vehicle", () => {
    const { record, warnings } = logic.mapLegacyAsset({
      id: "AST-1178", name: "Cardiac Monitor", category: "Medical", serial: "CM-22018", location: "Engine 1",
      assigned: "F. Roster", inspection: "Jan 2, 2027", value: "$28,500", status: "In Service",
    }, { vehicles, stations });
    assert.deepEqual(warnings, []);
    assert.equal(record.assetNumber, "AST-1178");
    assert.equal(record.serialNumber, "CM-22018");
    assert.equal(record.status, "in_service");
    assert.deepEqual(record.assignment, { stationName: "Station 1", fleetAssetId: "FA-E1", unitDesignation: "Engine 1", locationId: "", locationName: "" });
    assert.equal(record.schedules.nextInspectionDue, "2027-01-02");
    assert.equal(record.purchasePrice, 28500);
    assert.match(record.notes, /Assigned to \(old list\): F\. Roster/);
  });

  it("maps statuses and stations, and keeps anything it can't place as a note with a warning", () => {
    const repair = logic.mapLegacyAsset({ id: "AST-1307", name: "Portable Radio", location: "Repair Vendor", status: "Out for Repair", assigned: "Unassigned" }, { vehicles, stations });
    assert.equal(repair.record.status, "maintenance_required");
    assert.equal(repair.record.condition, "poor");
    assert.match(repair.record.notes, /Location in the old list: Repair Vendor/);
    assert.doesNotMatch(repair.record.notes, /Assigned to/);
    assert.equal(repair.warnings.length, 1);

    const station = logic.mapLegacyAsset({ id: "AST-1350", name: "SCBA Pack", location: "station 1", status: "Available" }, { vehicles, stations });
    assert.equal(station.record.assignment.stationName, "Station 1");
    assert.equal(station.record.status, "available");

    const odd = logic.mapLegacyAsset({ id: "X", name: "Thing", status: "Loaned out", inspection: "whenever", value: "n/a" }, { vehicles, stations });
    assert.equal(odd.record.status, "available");
    assert.equal(odd.warnings.length, 3);
    assert.match(odd.record.notes, /Status in the old list: Loaned out/);

    // "Available" on a vehicle is Assigned; "Inspection Due" is In service with the date (worked out, not stored).
    assert.equal(logic.mapLegacyAsset({ id: "Y", name: "AED", location: "Medic 1", status: "Available" }, { vehicles }).record.status, "assigned");
    assert.equal(logic.mapLegacyAsset({ id: "Z", name: "Meter", status: "Inspection Due" }, {}).record.status, "in_service");
    assert.equal(logic.mapLegacyAsset({ id: "W", name: "Bag", location: "Station 2", status: "Assigned" }, { stations }).record.status, "available");
  });

  it("a row with no name uses its asset number", () => {
    const { record, warnings } = logic.mapLegacyAsset({ id: "AST-9" }, {});
    assert.equal(record.name, "AST-9");
    assert.equal(record.category, "General EMS Equipment");
    assert.equal(warnings.length, 1);
  });
});
