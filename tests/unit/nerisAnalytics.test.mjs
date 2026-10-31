import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnnualSurveyTotals,
  buildHeatMapPoints,
  buildNfpa1710Metrics,
  exportAnnualSurveyCsv,
  extractIncidentTimings,
  percentile90,
  readCasualties,
  readPropertyLoss,
} from "../../src/lib/neris/analytics.js";
import { daysFromToday, filterByRange, parseRecordDate, rangeWindow } from "../../src/lib/analyticsRange.js";

const report = (id, cad = {}, extra = {}) => ({ id, reportNumber: id, incidentDate: "2026-10-20", workspace: { cad, ...(extra.workspace || {}) }, ...extra.top });

// ---------- NFPA 1710 ----------

test("no call-received time → call processing is not measured (not 0 s / 100%)", () => {
  const r = report("A", { dispatchTime: "2026-10-20T14:00", arrivalTime: "2026-10-20T14:04" });
  assert.equal(extractIncidentTimings(r).callProcessingSeconds, null);
  const metrics = buildNfpa1710Metrics([r]);
  assert.equal(metrics.compliance.callProcessingSeconds.measured, 0);
  assert.equal(metrics.compliance.callProcessingSeconds.percentage, null);
  assert.equal(metrics.compliance.callProcessingSeconds.total, 1);
});

test("call processing is measured from call received to dispatch", () => {
  const r = report("A", { receivedTime: "2026-10-20T14:00:00", dispatchTime: "2026-10-20T14:01:30" });
  assert.equal(extractIncidentTimings(r).callProcessingSeconds, 90);
  const m = buildNfpa1710Metrics([r, report("B", { dispatchTime: "2026-10-20T15:00" })]);
  assert.deepEqual(
    { measured: m.compliance.callProcessingSeconds.measured, total: m.compliance.callProcessingSeconds.total, pct: m.compliance.callProcessingSeconds.percentage },
    { measured: 1, total: 2, pct: 0 },
  );
});

test("turnout and travel need an en-route time; total response does not", () => {
  const noEnroute = report("A", { dispatchTime: "2026-10-20T14:00", arrivalTime: "2026-10-20T14:04" });
  const t = extractIncidentTimings(noEnroute);
  assert.equal(t.turnoutSeconds, null);
  assert.equal(t.travelSeconds, null);
  assert.equal(t.totalResponseSeconds, 240);

  const withEnroute = report("B", { dispatchTime: "2026-10-20T14:00:00", enrouteTime: "2026-10-20T14:01:00", arrivalTime: "2026-10-20T14:05:00" });
  const t2 = extractIncidentTimings(withEnroute);
  assert.equal(t2.turnoutSeconds, 60);
  assert.equal(t2.travelSeconds, 240);

  const m = buildNfpa1710Metrics([noEnroute, withEnroute]);
  assert.equal(m.compliance.turnoutSeconds.measured, 1);
  assert.equal(m.compliance.turnoutSeconds.percentage, 100);
  assert.equal(m.compliance.totalResponseSeconds.measured, 2);
});

test("per-unit times are used when the incident has none (first unit, last to clear)", () => {
  const r = {
    id: "U",
    workspace: {
      cad: {},
      units: [
        { unitId: "E2", dispatchTime: "2026-10-20T14:00:00", enrouteTime: "2026-10-20T14:02:00", arrivalTime: "2026-10-20T14:08:00", clearTime: "2026-10-20T15:30:00" },
        { unitId: "E1", dispatchTime: "2026-10-20T14:00:00", enrouteTime: "2026-10-20T14:01:00", arrivalTime: "2026-10-20T14:06:00", clearTime: "2026-10-20T15:00:00" },
      ],
    },
  };
  const t = extractIncidentTimings(r);
  assert.equal(t.turnoutSeconds, 60);
  assert.equal(t.totalResponseSeconds, 360);
  assert.equal(t.sceneSeconds, (90 - 6) * 60);
});

test("an end time before its start is bad data, not 0 seconds", () => {
  const r = report("A", { receivedTime: "2026-10-20T14:05", dispatchTime: "2026-10-20T14:00" });
  assert.equal(extractIncidentTimings(r).callProcessingSeconds, null);
});

test("no reports with times → nothing measured, every percentage null", () => {
  const m = buildNfpa1710Metrics([report("A"), report("B")]);
  assert.equal(m.measuredCount, 0);
  assert.equal(m.incidentCount, 2);
  for (const data of Object.values(m.compliance)) assert.equal(data.percentage, null);
  assert.equal(m.scene.median, null);
});

test("90th percentile uses nearest rank", () => {
  assert.equal(percentile90([]), null);
  assert.equal(percentile90([10]), 10);
  assert.equal(percentile90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9);
});

// ---------- Annual survey ----------

test("casualties read the names the report editor writes", () => {
  const r = { workspace: { casualties: { injuries: "2", fatalities: "1", ffInjuries: "1" } } };
  const c = readCasualties(r);
  assert.equal(c.civilian, 3);
  assert.equal(c.civilianInjuries, 2);
  assert.equal(c.civilianDeaths, 1);
  assert.equal(c.firefighter, 1);
  assert.equal(c.entered, true);
});

test("casualties still read the older civilianCount / firefighterCount names", () => {
  const c = readCasualties({ workspace: { casualties: { civilianCount: 4, firefighterCount: 2 } } });
  assert.equal(c.civilian, 4);
  assert.equal(c.firefighter, 2);
});

test("property loss reads property/contents and the older propertyLoss/contentsLoss names", () => {
  assert.deepEqual(readPropertyLoss({ workspace: { propertyLoss: { property: "15000", contents: "2500" } } }), { property: 15000, contents: 2500, total: 17500, entered: true });
  assert.equal(readPropertyLoss({ workspace: { propertyLoss: { propertyLoss: 100, contentsLoss: 50 } } }).total, 150);
  assert.equal(readPropertyLoss({ workspace: { propertyLoss: { property: "" } } }).entered, false);
});

test("annual survey totals casualties, loss and mutual aid from editor fields", () => {
  const reports = [
    {
      incidentDate: "2026-03-01",
      incidentTypeSummary: "Room and contents fire",
      modules: { core_mod_incident: { incident_final_type: ["FIRE: STRUCTURE_FIRE: ROOM_AND_CONTENTS_FIRE"], incident_aid_direction: "GIVEN" } },
      workspace: { casualties: { injuries: "1", fatalities: "", ffInjuries: "1" }, propertyLoss: { property: "20000", contents: "5000" } },
    },
    {
      incidentDate: "2026-04-01",
      incidentTypeSummary: "Fire alarm activation",
      modules: { core_mod_incident: { incident_final_type: ["NOEMERG: FALSE_ALARM"] } },
      workspace: {},
    },
    { incidentDate: "2025-12-31", workspace: { casualties: { injuries: "9" } } },
  ];
  const s = buildAnnualSurveyTotals(reports, 2026);
  assert.equal(s.totalIncidents, 2);
  assert.equal(s.fireIncidents, 1, "a false alarm is not a fire");
  assert.equal(s.mutualAidIncidents, 1);
  assert.equal(s.civilianCasualties, 1);
  assert.equal(s.firefighterCasualties, 1);
  assert.equal(s.propertyLoss, 25000);
  assert.equal(s.lossReports, 1);
  assert.equal(s.casualtyReports, 1);
});

test("annual survey CSV leaves loss blank (not $0) when no loss was entered", () => {
  const s = buildAnnualSurveyTotals([{ incidentDate: "2026-01-01", workspace: {} }], 2026);
  assert.equal(s.lossReports, 0);
  assert.match(exportAnnualSurveyCsv(s), /Property and Contents Loss,\n/);
});

// ---------- Locations ----------

test("heat map only includes real coordinates", () => {
  const points = buildHeatMapPoints([
    { id: "1" },
    { id: "2", workspace: { location: { latitude: "", longitude: "" } } },
    { id: "3", latitude: 0, longitude: 0 },
    { id: "4", workspace: { location: { latitude: "34.95", longitude: "-90.0" } } },
    { id: "5", latitude: 200, longitude: 10 },
  ]);
  assert.deepEqual(points.map((p) => p.id), ["4"]);
});

// ---------- General Analytics date range ----------

test("parseRecordDate accepts ISO and dated text, rejects dates without a year", () => {
  assert.equal(parseRecordDate("2026-06-07").getDate(), 7);
  assert.equal(parseRecordDate("Jun 12, 2026").getFullYear(), 2026);
  assert.equal(parseRecordDate("Jun 7"), null);
  assert.equal(parseRecordDate(""), null);
  assert.equal(parseRecordDate("not a date 2026x"), null);
});

test("filterByRange keeps records in the window and counts undated ones", () => {
  const today = new Date(2026, 9, 31);
  const records = [
    { id: "in", date: "2026-10-15" },
    { id: "edge", date: "2026-10-02" },
    { id: "old", date: "2026-08-15" },
    { id: "future", date: "2026-11-05" },
    { id: "nodate", date: "Oct 3" },
  ];
  const r30 = filterByRange(records, (x) => x.date, "30", today);
  assert.deepEqual(r30.rows.map((x) => x.id), ["in", "edge"]);
  assert.equal(r30.undated, 1);
  const r90 = filterByRange(records, (x) => x.date, "90", today);
  assert.deepEqual(r90.rows.map((x) => x.id), ["in", "edge", "old"]);
  const ytd = filterByRange([{ date: "2026-01-01" }, { date: "2025-12-31" }], (x) => x.date, "YTD", today);
  assert.equal(ytd.rows.length, 1);
  assert.equal(rangeWindow("YTD", today).start.getMonth(), 0);
});

test("daysFromToday counts from today, null without a usable date", () => {
  const today = new Date(2026, 9, 31);
  assert.equal(daysFromToday("2026-11-10", today), 10);
  assert.equal(daysFromToday("Oct 30, 2026", today), -1);
  assert.equal(daysFromToday("", today), null);
});
