import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashboardMetrics } from "../../src/utils/dashboardMetrics.js";

test("on duty and staffing come from today's roster, not the personnel count", () => {
  const personnel = Array.from({ length: 40 }, (_, i) => ({ id: `P${i}`, status: "Active" }));
  const metrics = buildDashboardMetrics({
    personnel,
    liveDayMetrics: { "2026-10-31": { staffed: 14, minimum: 17 } },
    dutyDayId: "2026-10-31",
  });
  assert.equal(metrics.onDuty, 14);
  assert.equal(metrics.minimum, 17);
  assert.equal(metrics.staffingDeficit, 3);
});

test("no roster for today shows nothing rather than a made-up number", () => {
  const metrics = buildDashboardMetrics({ personnel: [{ status: "Active" }], liveDayMetrics: {}, dutyDayId: "2026-10-31" });
  assert.equal(metrics.onDuty, null);
  assert.equal(metrics.staffingDeficit, null);
});

test("certifications expiring counts only the next 90 days", () => {
  const metrics = buildDashboardMetrics({ certifications: [{ days: -5 }, { days: 0 }, { days: 90 }, { days: 91 }] });
  assert.equal(metrics.certsExpiring90, 2);
});
