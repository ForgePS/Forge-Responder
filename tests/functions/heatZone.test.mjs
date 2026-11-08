// Heat Zone Analytics: tenant isolation, authorization, event processing, reports.
// Run: npm run test:functions (Firestore emulator). A cross-tenant failure here blocks release.
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const heatZone = require("./lib/heatZone/service.js");
const { itemDocId } = require("./lib/listItemsPlan.js");

const PROJECT_ID = "demo-forge-rms";
const A = "dept-a";
const B = "dept-b";
const LIST = "hlfd-rms-neris-fire-reports";
const FILTERS = { from: "2026-10-01", to: "2026-10-31" };
// Both departments use the SAME coordinates and addresses: proximity must never leak data.
const NORTH = { latitude: 32.37, longitude: -89.47 };
const SOUTH = { latitude: 32.33, longitude: -89.47 };
const NORTH_POLY = { type: "Polygon", coordinates: [[[-89.5, 32.35], [-89.44, 32.35], [-89.44, 32.4], [-89.5, 32.4], [-89.5, 32.35]]] };
const SOUTH_POLY = { type: "Polygon", coordinates: [[[-89.5, 32.3], [-89.44, 32.3], [-89.44, 32.35], [-89.5, 32.35], [-89.5, 32.3]]] };
const VIEWPORT = { south: 32.2, west: -89.6, north: 32.5, east: -89.3 };

let db;
const auth = (uid) => ({ uid, token: { email: `${uid}@example.test`, name: uid } });
const req = (uid, data) => ({ auth: uid ? auth(uid) : undefined, data });
const as = (uid, departmentId, extra = {}) => req(uid, { departmentId, filters: FILTERS, ...extra });

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

function report(id, day, { loc = NORTH, priority = "Emergency", type = "MEDICAL: ILLNESS: SICK_CASE", hour = "14", address, departmentId, status = "Submitted" } = {}) {
  return {
    id,
    ...(departmentId ? { departmentId } : {}),
    reportNumber: id,
    status,
    incidentAddress: address || `${id} Shared Ave`,
    modules: { core_mod_incident: { incident_final_type: [type] } },
    workspace: {
      cad: { receivedTime: `2026-10-${day}T${hour}:00`, dispatchTime: `2026-10-${day}T${hour}:01`, arrivalTime: `2026-10-${day}T${hour}:07`, priority },
      location: loc,
      units: [{ unitId: "E1", apparatusType: "Engine", station: "Station 1" }],
    },
  };
}

async function writeReport(departmentId, r, order = 1) {
  await db.doc(`departments/${departmentId}/lists/${LIST}/items/${itemDocId(r.id)}`).set({ ...r, _order: order });
}

let eventSeq = 0;
const itemEvent = (departmentId, id, eventId = `evt-${++eventSeq}`) => ({ id: eventId, params: { departmentId, itemId: itemDocId(id) } });

async function seedDepartment(id, prefix, reports) {
  await Promise.all([
    db.doc(`platformDepartments/${id}`).set({ name: `Dept ${prefix}`, status: "active" }),
    db.doc(`departments/${id}/profile/main`).set({ name: `${prefix} Fire Department`, timezone: "America/Chicago" }),
    db.doc(`departments/${id}/lists/${LIST}`).set({ storage: "items", itemCount: reports.length }),
  ]);
  await Promise.all(reports.map((r, i) => writeReport(id, r, i + 1)));
}

const member = (departmentId, uid, roleIds, permissions) =>
  db.doc(`departments/${departmentId}/users/${uid}`).set({ uid, status: "active", departmentId, roleIds, role: roleIds[0], email: `${uid}@example.test`, ...(permissions ? { permissions } : {}) });

async function saveDistricts(departmentId, uid) {
  await heatZone.saveZones(db, req(uid, { departmentId, zone: { name: "North", kind: "district", geometry: NORTH_POLY } }));
  await heatZone.saveZones(db, req(uid, { departmentId, zone: { name: "South", kind: "district", geometry: SOUTH_POLY } }));
  const settings = await heatZone.getSettings(db, req(uid, { departmentId }));
  return Object.fromEntries(settings.zones.map((z) => [z.name, z.id]));
}

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});

after(async () => {
  await admin.app().delete();
});

let districtsA;
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  heatZone.cache.clearDepartment(A);
  heatZone.cache.clearDepartment(B);
  await seedDepartment(A, "A", [
    report("A-1", "05", { loc: NORTH }),
    report("A-2", "06", { loc: NORTH, address: "1 Repeat Rd" }),
    report("A-3", "07", { loc: NORTH, address: "1 Repeat Rd", priority: "Routine" }),
    report("A-4", "08", { loc: SOUTH, type: "FIRE: STRUCTURE_FIRE: RESIDENTIAL" }),
    report("A-5", "09", { loc: SOUTH, hour: "23" }),
  ]);
  await seedDepartment(B, "B", [
    report("B-1", "05", { loc: NORTH }),
    report("B-2", "06", { loc: NORTH }),
    report("B-3", "07", { loc: SOUTH }),
  ]);
  await Promise.all([
    member(A, "chief-a", ["fireChief"]),
    member(A, "officer-a", ["companyOfficer"]),             // view + markers + history, assigned districts only
    member(A, "officer-none-a", ["companyOfficer"]),        // no districts assigned
    member(A, "analyst-a", ["firefighter"], { viewHeatZoneAnalytics: true, viewHeatZoneHistory: true }),
    member(A, "viewer-a", ["firefighter"], { viewHeatZoneAnalytics: true }), // no history
    member(A, "ff-a", ["firefighter"]),
    member(B, "chief-b", ["fireChief"]),
    db.doc("platformCreators/creator-1").set({ status: "active" }),
  ]);
  districtsA = await saveDistricts(A, "chief-a"); // also rebuilds A's projections
  await heatZone.rebuildDepartment(db, B);
  await db.doc(`departments/${A}/heatZoneAccess/officer-a`).set({ districtIds: [districtsA.North] });
});

describe("tenant isolation (release blocking)", () => {
  it("each department's dashboard counts only its own calls, even at identical coordinates", async () => {
    const a = await heatZone.dashboard(db, as("chief-a", A));
    const b = await heatZone.dashboard(db, as("chief-b", B));
    assert.equal(a.summary.totalCalls, 5);
    assert.equal(b.summary.totalCalls, 3);
    assert.equal(a.department.id, A);
    assert.equal(a.heat.cells.reduce((s, c) => s + c.count, 0), 5);
    assert.equal(b.heat.cells.reduce((s, c) => s + c.count, 0), 3);
  });

  it("a member of one department cannot query another by changing departmentId", async () => {
    await expectCode(heatZone.dashboard(db, as("chief-a", B)), "permission-denied");
    await expectCode(heatZone.markers(db, as("chief-a", B, { viewport: VIEWPORT, zoom: 16 })), "permission-denied");
    await expectCode(heatZone.report(db, as("chief-a", B, { reportType: "district", format: "csv" })), "permission-denied");
    await expectCode(heatZone.boundaries(db, req("chief-a", { departmentId: B })), "permission-denied");
    await expectCode(heatZone.rebuild(db, req("chief-a", { departmentId: B })), "permission-denied");
    await expectCode(heatZone.dashboard(db, as("chief-b", A)), "permission-denied");
  });

  it("markers over an overlapping area return only the caller's department", async () => {
    const a = await heatZone.markers(db, as("chief-a", A, { viewport: VIEWPORT, zoom: 16 }));
    assert.equal(a.mode, "markers");
    assert.deepEqual(a.markers.map((m) => m.id).sort(), ["A-1", "A-2", "A-3", "A-4", "A-5"].map(itemDocId));
    const b = await heatZone.markers(db, as("chief-b", B, { viewport: VIEWPORT, zoom: 16 }));
    assert.deepEqual(b.markers.map((m) => m.id).sort(), ["B-1", "B-2", "B-3"]);
  });

  it("another department's incident id is not found, without revealing that it exists", async () => {
    await expectCode(heatZone.incident(db, req("chief-a", { departmentId: A, id: "B-1" })), "not-found");
    await expectCode(heatZone.incident(db, req("chief-a", { departmentId: B, id: "B-1" })), "permission-denied");
    const own = await heatZone.incident(db, req("chief-a", { departmentId: A, id: "A-1" }));
    assert.equal(own.reportNumber, "A-1");
  });

  it("boundaries and district assignments stay in their own department", async () => {
    const b = await heatZone.boundaries(db, req("chief-b", { departmentId: B }));
    assert.equal(b.zones.length, 0);
    const bDash = await heatZone.dashboard(db, as("chief-b", B));
    assert.ok(bDash.charts.byDistrict.every((d) => d.key === "unassigned"));
    await expectCode(heatZone.setDistrictAccess(db, req("chief-b", { departmentId: B, uid: "officer-a", districtIds: [] })), "not-found");
  });

  it("a record claiming another department is rejected and never counted anywhere", async () => {
    await writeReport(A, report("A-forged", "10", { departmentId: B }), 9);
    const outcome = await heatZone.handleItemWritten(db, itemEvent(A, "A-forged"));
    assert.equal(outcome, "rejected");
    assert.equal((await heatZone.dashboard(db, as("chief-a", A))).summary.totalCalls, 5);
    assert.equal((await heatZone.dashboard(db, as("chief-b", B))).summary.totalCalls, 3);
    assert.equal((await db.doc(`departments/${B}/heatZoneCalls/A-forged`).get()).exists, false);
  });

  it("results are cached per department and never served across tenants", async () => {
    const first = await heatZone.dashboard(db, as("chief-a", A));
    const again = await heatZone.dashboard(db, as("chief-a", A));
    assert.equal(again.cached, true);
    assert.equal(again.summary.totalCalls, first.summary.totalCalls);
    const b = await heatZone.dashboard(db, as("chief-b", B));
    assert.equal(b.cached, undefined);
    assert.equal(b.summary.totalCalls, 3);
    assert.ok(heatZone.cache.keys().every((k) => k.startsWith(`${A}|`) || k.startsWith(`${B}|`)));
  });

  it("a restricted member is never served a cached result computed for a broader scope", async () => {
    await heatZone.dashboard(db, as("chief-a", A));
    const officer = await heatZone.dashboard(db, as("officer-a", A));
    assert.equal(officer.cached, undefined);
    assert.equal(officer.summary.totalCalls, 3);
  });
});

describe("authorization", () => {
  it("requires sign-in", async () => {
    await expectCode(heatZone.dashboard(db, req(null, { departmentId: A })), "unauthenticated");
  });

  it("denies members without Heat Zone permission (app access alone is not enough)", async () => {
    await expectCode(heatZone.dashboard(db, as("ff-a", A)), "permission-denied");
    await expectCode(heatZone.dashboard(db, as("stranger", A)), "permission-denied");
  });

  it("marker and incident access need the marker permission and NERIS report access", async () => {
    const dash = await heatZone.dashboard(db, as("analyst-a", A));
    assert.equal(dash.capabilities.viewMarkers, false);
    await expectCode(heatZone.markers(db, as("analyst-a", A, { viewport: VIEWPORT, zoom: 16 })), "permission-denied");
    await expectCode(heatZone.incident(db, req("analyst-a", { departmentId: A, id: "A-1" })), "permission-denied");
  });

  it("repeat locations need their own permission", async () => {
    assert.equal((await heatZone.dashboard(db, as("analyst-a", A))).repeatLocations, null);
    const chief = await heatZone.dashboard(db, as("chief-a", A));
    assert.equal(chief.repeatLocations[0].address, "1 Repeat Rd");
    assert.equal(chief.repeatLocations[0].count, 2);
  });

  it("historical analytics are limited to the last 30 days without permission", async () => {
    const dash = await heatZone.dashboard(db, as("viewer-a", A, { filters: { from: "2025-01-01", to: "2026-10-31" } }));
    assert.equal(dash.filters.historyLimited, true);
    assert.equal(dash.comparison, null);
    const withHistory = await heatZone.dashboard(db, as("analyst-a", A));
    assert.ok(withHistory.comparison);
  });

  it("settings management is restricted", async () => {
    await expectCode(heatZone.getSettings(db, req("officer-a", { departmentId: A })), "permission-denied");
    await expectCode(heatZone.saveZones(db, req("analyst-a", { departmentId: A, zone: { name: "X", geometry: NORTH_POLY } })), "permission-denied");
    await expectCode(heatZone.setDistrictAccess(db, req("officer-a", { departmentId: A, uid: "officer-a", districtIds: [districtsA.South] })), "permission-denied");
  });

  it("is blocked when the analytics module is not in the plan", async () => {
    await db.doc(`platformEntitlements/${A}`).set({ modules: ["dashboard", "administration"] });
    await expectCode(heatZone.dashboard(db, as("chief-a", A)), "permission-denied");
  });

  it("is blocked for suspended departments", async () => {
    await db.doc(`platformSubscriptions/${A}`).set({ status: "suspended" });
    await expectCode(heatZone.dashboard(db, as("chief-a", A)), "failed-precondition");
  });

  it("platform creators can open any department", async () => {
    assert.equal((await heatZone.dashboard(db, as("creator-1", B))).summary.totalCalls, 3);
  });
});

describe("district permissions", () => {
  it("members limited to assigned districts only see those districts", async () => {
    const dash = await heatZone.dashboard(db, as("officer-a", A));
    assert.equal(dash.summary.totalCalls, 3);
    assert.deepEqual(dash.charts.byDistrict.map((d) => d.key), [districtsA.North]);
    assert.deepEqual(dash.zones.filter((z) => z.kind === "district").map((z) => z.name), ["North"]);
    const markers = await heatZone.markers(db, as("officer-a", A, { viewport: VIEWPORT, zoom: 16 }));
    assert.deepEqual(markers.markers.map((m) => m.id).sort(), ["A-1", "A-2", "A-3"]);
  });

  it("asking for an unassigned district through filters returns nothing extra", async () => {
    const dash = await heatZone.dashboard(db, as("officer-a", A, { filters: { ...FILTERS, districtIds: [districtsA.South] } }));
    assert.equal(dash.summary.totalCalls, 0);
    await expectCode(heatZone.incident(db, req("officer-a", { departmentId: A, id: "A-4" })), "not-found");
  });

  it("a restricted member with no assignment sees no incidents", async () => {
    const dash = await heatZone.dashboard(db, as("officer-none-a", A));
    assert.equal(dash.summary.totalCalls, 0);
  });

  it("restricted members' boundary list excludes other districts", async () => {
    const b = await heatZone.boundaries(db, req("officer-a", { departmentId: A }));
    assert.deepEqual(b.zones.map((z) => z.name), ["North"]);
  });
});

describe("filtering and aggregate accuracy", () => {
  it("district, classification and priority totals are exact", async () => {
    const dash = await heatZone.dashboard(db, as("chief-a", A));
    const byDistrict = Object.fromEntries(dash.charts.byDistrict.map((d) => [d.label, d.count]));
    assert.deepEqual(byDistrict, { North: 3, South: 2 });
    assert.deepEqual(dash.summary.highestActivityDistrict, { id: districtsA.North, name: "North", count: 3 });
    assert.deepEqual(Object.fromEntries(dash.charts.byClassification.map((c) => [c.label, c.count])), { Medical: 4, Fire: 1 });
    assert.equal(dash.summary.highPriorityCalls, 4);
    assert.equal(dash.summary.averageResponse.seconds, 360);
  });

  it("geographic bounds, time-of-day across midnight and date filters", async () => {
    const south = await heatZone.dashboard(db, as("chief-a", A, { filters: { ...FILTERS, bounds: { south: 32.3, west: -89.5, north: 32.34, east: -89.44 } } }));
    assert.equal(south.summary.totalCalls, 2);
    const night = await heatZone.dashboard(db, as("chief-a", A, { filters: { ...FILTERS, timeStart: "22:00", timeEnd: "02:00" } }));
    assert.equal(night.summary.totalCalls, 1);
    const dates = await heatZone.dashboard(db, as("chief-a", A, { filters: { from: "2026-10-06", to: "2026-10-07" } }));
    assert.equal(dates.summary.totalCalls, 2);
  });
});

describe("event processing", () => {
  it("a new call is projected, bumps the live version and appears on the dashboard", async () => {
    const before = (await db.doc(`departments/${A}/heatZoneMeta/state`).get()).data().version;
    await heatZone.dashboard(db, as("chief-a", A)); // warm the cache
    await writeReport(A, report("A-6", "12", { loc: SOUTH }), 6);
    assert.equal(await heatZone.handleItemWritten(db, itemEvent(A, "A-6")), "created");
    const after = (await db.doc(`departments/${A}/heatZoneMeta/state`).get()).data().version;
    assert.equal(after, before + 1);
    const dash = await heatZone.dashboard(db, as("chief-a", A));
    assert.equal(dash.cached, undefined);
    assert.equal(dash.summary.totalCalls, 6);
  });

  it("duplicate and replayed events do not double count", async () => {
    await writeReport(A, report("A-7", "12"), 7);
    const event = itemEvent(A, "A-7", "evt-fixed");
    assert.equal(await heatZone.handleItemWritten(db, event), "created");
    const v = (await db.doc(`departments/${A}/heatZoneMeta/state`).get()).data().version;
    assert.equal(await heatZone.handleItemWritten(db, event), "duplicate");
    assert.equal(await heatZone.handleItemWritten(db, itemEvent(A, "A-7")), "unchanged");
    assert.equal((await db.doc(`departments/${A}/heatZoneMeta/state`).get()).data().version, v);
    assert.equal((await heatZone.dashboard(db, as("chief-a", A))).summary.totalCalls, 6);
  });

  it("stale or out-of-order events converge on the current record", async () => {
    // The event payload is ignored; the source record is re-read inside the transaction.
    await writeReport(A, report("A-1", "05", { priority: "Routine" }));
    await heatZone.handleItemWritten(db, itemEvent(A, "A-1"));
    await heatZone.handleItemWritten(db, itemEvent(A, "A-1")); // late duplicate delivery
    assert.equal((await db.doc(`departments/${A}/heatZoneCalls/A-1`).get()).data().priority, "Routine");
  });

  it("legacy array-storage lists are processed per changed item", async () => {
    await db.doc(`departments/${B}/lists/${LIST}`).set({ items: [report("B-1", "05"), report("B-9", "11")] });
    const results = await heatZone.handleListWritten(db, {
      id: "evt-array",
      params: { departmentId: B },
      data: {
        before: { exists: true, data: () => ({ items: [report("B-1", "05")] }) },
        after: { exists: true, data: () => ({ items: [report("B-1", "05"), report("B-9", "11")] }) },
      },
    });
    assert.deepEqual(results, ["created"]);
  });
});

describe("historical corrections", () => {
  it("moving a call's coordinates moves it between districts", async () => {
    await writeReport(A, report("A-1", "05", { loc: SOUTH }));
    assert.equal(await heatZone.handleItemWritten(db, itemEvent(A, "A-1")), "updated");
    const dash = await heatZone.dashboard(db, as("chief-a", A));
    assert.deepEqual(Object.fromEntries(dash.charts.byDistrict.map((d) => [d.label, d.count])), { North: 2, South: 3 });
  });

  it("reclassification, priority and disposition changes update the aggregates", async () => {
    await writeReport(A, { ...report("A-2", "06", { type: "FIRE: OUTSIDE_FIRE: BRUSH", priority: "Routine" }), modules: { core_mod_incident: { incident_final_type: ["FIRE: OUTSIDE_FIRE: BRUSH"], incident_noaction: "CANCELLED" } } });
    await heatZone.handleItemWritten(db, itemEvent(A, "A-2"));
    const dash = await heatZone.dashboard(db, as("chief-a", A, { filters: { ...FILTERS, dispositions: ["Cancelled"] } }));
    assert.equal(dash.summary.totalCalls, 1);
    assert.equal(dash.summary.topClassification.name, "Fire");
    assert.equal(dash.summary.highPriorityCalls, 0);
  });

  it("voided and deleted calls drop out of every statistic", async () => {
    await writeReport(A, report("A-3", "07", { status: "Voided" }));
    await heatZone.handleItemWritten(db, itemEvent(A, "A-3"));
    await db.doc(`departments/${A}/lists/${LIST}/items/A-4`).delete();
    assert.equal(await heatZone.handleItemWritten(db, itemEvent(A, "A-4")), "deleted");
    const dash = await heatZone.dashboard(db, as("chief-a", A));
    assert.equal(dash.summary.totalCalls, 3);
    await expectCode(heatZone.incident(db, req("chief-a", { departmentId: A, id: "A-3" })), "not-found");
  });

  it("changing boundaries recalculates past calls", async () => {
    await heatZone.deleteZone(db, req("chief-a", { departmentId: A, zoneId: districtsA.South }));
    const dash = await heatZone.dashboard(db, as("chief-a", A));
    assert.deepEqual(Object.fromEntries(dash.charts.byDistrict.map((d) => [d.label, d.count])), { North: 3, "Outside configured districts": 2 });
  });

  it("rejects invalid boundaries", async () => {
    await expectCode(heatZone.saveZones(db, req("chief-a", { departmentId: A, zone: { name: "Bad", geometry: { type: "Point", coordinates: [0, 0] } } })), "invalid-argument");
  });
});

describe("reports", () => {
  it("carries agency, range, filters and generation time, and is audited in the right department", async () => {
    const r = await heatZone.report(db, as("chief-a", A, { reportType: "district", format: "xlsx", filters: { ...FILTERS, priorities: ["Emergency"] } }));
    assert.equal(r.meta.agencyName, "A Fire Department");
    assert.equal(r.meta.departmentId, A);
    assert.equal(r.meta.from, "2026-10-01");
    assert.ok(r.meta.filters.some((f) => f.includes("Emergency")));
    assert.ok(r.meta.generatedAt > 0);
    assert.equal(r.rows.reduce((s, row) => s + row[1], 0), 4);
    const logsA = await db.collection(`departments/${A}/auditLogs`).where("action", "==", "heat_zone_report_exported").get();
    const logsB = await db.collection(`departments/${B}/auditLogs`).get();
    assert.equal(logsA.size, 1);
    assert.equal(logsB.size, 0);
  });

  it("export needs the export permission; comparison needs history", async () => {
    await expectCode(heatZone.report(db, as("officer-a", A, { reportType: "district", format: "csv" })), "permission-denied");
    await db.doc(`departments/${A}/users/viewer-a`).update({ permissions: { viewHeatZoneAnalytics: true, exportHeatZoneReports: true } });
    await expectCode(heatZone.report(db, as("viewer-a", A, { reportType: "comparison", format: "csv" })), "permission-denied");
    assert.ok((await heatZone.report(db, as("viewer-a", A, { reportType: "hourly", format: "csv" }))).rows.length === 24);
  });

  it("district-restricted exports only contain assigned districts", async () => {
    await db.doc(`departments/${A}/users/officer-a`).update({ permissions: { exportHeatZoneReports: true } });
    const r = await heatZone.report(db, as("officer-a", A, { reportType: "district", format: "csv" }));
    assert.equal(r.meta.totalCalls, 3);
    assert.ok(r.rows.every((row) => row[0] === "North"));
    assert.match(r.meta.districtScope, /Assigned districts/);
  });
});
