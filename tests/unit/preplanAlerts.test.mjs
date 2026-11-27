// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  alertFromImpairment,
  groupAlertsForResponse,
  normalizeAlert,
  resolveResponsePlan,
  summarizeHydrant,
} from "../../src/lib/preplans/alertModel.js";

const NOW = new Date("2026-11-24T12:00:00Z");

describe("operational alerts", () => {
  it("defaults unknown values to safe ones (reported, active)", () => {
    const alert = normalizeAlert({ category: "aliens", severity: "extreme", verificationStatus: "trust-me" });
    assert.equal(alert.category, "other");
    assert.equal(alert.severity, "moderate");
    assert.equal(alert.verificationStatus, "reported");
    assert.equal(alert.resolutionStatus, "active");
  });

  it("keeps verified and reported alerts apart and drops resolved / rejected ones", () => {
    const groups = groupAlertsForResponse([
      { id: "a", verificationStatus: "verified", severity: "low" },
      { id: "b", verificationStatus: "verified", severity: "critical" },
      { id: "c", verificationStatus: "reported" },
      { id: "d", verificationStatus: "rejected" },
      { id: "e", verificationStatus: "verified", resolutionStatus: "resolved" },
    ], NOW);
    assert.deepEqual(groups.verified.map((row) => row.id), ["b", "a"]);
    assert.deepEqual(groups.reported.map((row) => row.id), ["c"]);
  });

  it("flags alerts past their review date as stale", () => {
    const { verified } = groupAlertsForResponse([{ id: "a", verificationStatus: "verified", reviewBy: "2026-11-01" }], NOW);
    assert.equal(verified[0].stale, true);
  });

  it("turns an active impairment into a verified alert with its source", () => {
    const alert = alertFromImpairment(
      { id: "IMP-1", systemId: "FPS-1", occupancyId: "OCC-1", reason: "Riser valve replacement", fireWatchRequired: true, startedAt: "2026-11-20" },
      { name: "Wet sprinkler, building A" },
    );
    assert.equal(alert.source, "fps_impairment");
    assert.equal(alert.severity, "critical");
    assert.match(alert.description, /Wet sprinkler, building A impaired — Riser valve/);
  });
});

describe("response view plan selection", () => {
  const preplan = { status: "operational", publishedRevisionId: "R1", currentRevisionId: "R2", verificationDueAt: "2027-06-01", lastVerifiedAt: "2026-06-01" };

  it("shows the published revision with its verification dates", () => {
    const result = resolveResponsePlan({ preplan, publishedRevision: { id: "R1", status: "published" }, now: NOW });
    assert.equal(result.state, "published");
    assert.equal(result.verifiedOn, "2026-06-01");
    assert.equal(result.stale, false);
  });

  it("never substitutes a draft when nothing is published", () => {
    const result = resolveResponsePlan({ preplan: { status: "draft", currentRevisionId: "R2" }, publishedRevision: null, now: NOW });
    assert.equal(result.state, "none");
    assert.match(result.reason, /not been approved/);
    const draftAsPublished = resolveResponsePlan({ preplan: { ...preplan }, publishedRevision: { id: "R1", status: "draft" }, now: NOW });
    assert.equal(draftAsPublished.state, "none");
  });

  it("does not call a never-published preplan withdrawn", () => {
    // New preplans start with operationalValidity "unavailable"; that alone is not a withdrawal.
    const result = resolveResponsePlan({
      preplan: { status: "ready_for_review", operationalValidity: "unavailable", currentRevisionId: "R1" },
      publishedRevision: null,
      now: NOW,
    });
    assert.equal(result.state, "none");
    assert.match(result.reason, /not been approved/);
  });

  it("keeps showing the published plan while a new revision is drafted", () => {
    const result = resolveResponsePlan({ preplan: { ...preplan, status: "revision_in_progress" }, publishedRevision: { id: "R1", status: "published" }, now: NOW });
    assert.equal(result.state, "published");
  });

  it("keeps showing the published plan while the next revision is in review or approved", () => {
    // startPreplanRevision marks the published revision "superseded" right away;
    // publishedRevisionId still names it until the next revision is published.
    for (const status of ["revision_in_progress", "ready_for_review", "returned_for_revision", "approved"]) {
      const result = resolveResponsePlan({ preplan: { ...preplan, status }, publishedRevision: { id: "R1", status: "superseded" }, now: NOW });
      assert.equal(result.state, "published", status);
    }
  });

  it("shows nothing for archived preplans or a revision the preplan doesn't name", () => {
    assert.equal(resolveResponsePlan({ preplan: { ...preplan, status: "archived" }, publishedRevision: { id: "R1", status: "published" }, now: NOW }).state, "none");
    assert.equal(resolveResponsePlan({ preplan, publishedRevision: { id: "R9", status: "published" }, now: NOW }).state, "none");
  });

  it("marks overdue verification as stale, and withdrawn plans as unavailable", () => {
    const stale = resolveResponsePlan({ preplan: { ...preplan, verificationDueAt: "2026-01-01" }, publishedRevision: { id: "R1", status: "published" }, now: NOW });
    assert.equal(stale.stale, true);
    const withdrawn = resolveResponsePlan({ preplan: { ...preplan, status: "temporarily_unavailable" }, publishedRevision: { id: "R1", status: "published" }, now: NOW });
    assert.equal(withdrawn.state, "unavailable");
    assert.equal(resolveResponsePlan({ preplan: null }).state, "none");
  });
});

describe("hydrant summary", () => {
  it("flags out-of-service and untested hydrants", () => {
    const good = summarizeHydrant({ hydrant_id: "H-1", status: "In Service", flow_gpm: "1250", last_checked: "2026-05-01" }, NOW);
    assert.deepEqual(good.warnings, []);
    assert.equal(good.flowGpm, 1250);
    const bad = summarizeHydrant({ hydrant_id: "H-2", status: "Out of Service", last_checked: "2020-01-01" }, NOW);
    assert.equal(bad.inService, false);
    assert.equal(bad.warnings.length, 2);
    assert.deepEqual(summarizeHydrant({ hydrant_id: "H-3" }, NOW).warnings, ["No flow test on record"]);
  });
});
