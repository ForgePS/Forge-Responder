// Patient care reports: documentation suggestions, vital flags, report status, amendments, handoff, analytics.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { addGroupRow, getValue, setLeaf } from "../../src/lib/nemsis/pcrModel.js";
import {
  ageBand, documentationSuggestions, feedbackKind, openSuggestions, vitalFlags, vitalTrend,
} from "../../src/lib/pcr/pcrQuality.js";
import {
  canonicalJson, contentHash, diffPcr, elementOfPath, leafWords, qaStatus, reportStatus, submissionStatus, verifyPosted,
} from "../../src/lib/pcr/pcrLifecycle.js";
import { handoffHtml, handoffSummary } from "../../src/lib/pcr/pcrHandoff.js";
import { pcrAnalytics, shownCount } from "../../src/lib/pcr/pcrAnalytics.js";

const require = createRequire(import.meta.url);
const schema = loadNemsisSchema("3.5.1");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));
const VITALS = "eVitals.VitalGroup";
const codes = (s) => s.map((x) => x.code);

test("a complete chest pain report has no suggestions", () => {
  assert.deepEqual(documentationSuggestions(schema, fixture.data), []);
});

test("suggestions point at what's missing, and never block", () => {
  let pcr = setLeaf(schema, fixture.data, "eMedications.01", "", { "eMedications.MedicationGroup": 1 });
  pcr = setLeaf(schema, pcr, "eNarrative.01", "Pt given aspirin and ondansetron. CPR not indicated.");
  pcr = setLeaf(schema, pcr, "eDisposition.01", "");
  pcr = setLeaf(schema, pcr, "eDisposition.21", "");
  const s = documentationSuggestions(schema, pcr);
  assert.ok(codes(s).includes("med-no-time"));
  assert.ok(s.some((x) => x.code === "med-in-narrative" && /ondansetron/.test(x.message)), "ondansetron isn't charted");
  assert.ok(!s.some((x) => x.code === "med-in-narrative" && /aspirin/.test(x.message)), "aspirin is charted");
  assert.ok(codes(s).includes("arrest-not-charted"), "narrative says CPR, arrest is No");
  assert.ok(codes(s).includes("transport-no-destination"));
  assert.ok(s.every((x) => x.kind === "suggestion" && x.blocking === false));
  assert.ok(s.every((x) => x.path), "each one links to a field");
});

test("one vital set for a transported patient, and times out of order", () => {
  let pcr = structuredClone(fixture.data);
  pcr.eVitals[VITALS] = pcr.eVitals[VITALS].slice(0, 1);
  pcr = setLeaf(schema, pcr, "eTimes.09", "2026-11-15T14:05:00-06:00");
  const s = documentationSuggestions(schema, pcr);
  assert.ok(codes(s).includes("one-vital-set"));
  assert.ok(s.some((x) => x.code === "times-order" && /Left scene is earlier than At patient/.test(x.message)));
});

test("refusal without a signature, and no transport with a destination", () => {
  let pcr = setLeaf(schema, fixture.data, "eDisposition.30", "4230009");
  const s = documentationSuggestions(schema, pcr);
  assert.ok(codes(s).includes("refusal-no-signature"));
  assert.ok(codes(s).includes("no-transport-destination"));
  pcr = setLeaf(schema, pcr, "eDisposition.30", "4230013");
  assert.ok(!codes(documentationSuggestions(schema, pcr)).includes("refusal-no-signature"));
});

test("dismissed suggestions stay hidden; feedback kinds stay apart", () => {
  const pcr = setLeaf(schema, fixture.data, "eNarrative.01", "");
  const s = documentationSuggestions(schema, pcr);
  assert.deepEqual(codes(s), ["no-narrative"]);
  assert.deepEqual(openSuggestions(s, ["no-narrative"]), []);
  assert.equal(feedbackKind({ code: "department-required" }), "agency");
  assert.equal(feedbackKind({ code: "required" }), "nemsis");
  assert.equal(feedbackKind(s[0]), "suggestion");
});

test("vital flags: typos and the usual range by age, nothing changed", () => {
  let pcr = setLeaf(schema, fixture.data, "eVitals.10", 960, { [VITALS]: 0 });
  pcr = setLeaf(schema, pcr, "eVitals.12", 84, { [VITALS]: 1 });
  const flags = vitalFlags(schema, pcr);
  assert.deepEqual(flags.map((f) => [f.row, f.el, f.kind]), [[0, "eVitals.10", "typo"], [1, "eVitals.12", "range"]]);
  assert.equal(getValue(schema, pcr, "eVitals.10", { [VITALS]: 0 }), 960, "the value is left as charted");
  // HR 96 is normal for an adult but low for an infant.
  const infant = setLeaf(schema, setLeaf(schema, fixture.data, "ePatient.15", 6), "ePatient.16", "2516001");
  assert.equal(ageBand(schema, infant), "infant");
  assert.ok(vitalFlags(schema, infant).some((f) => f.el === "eVitals.10" && f.kind === "range"));
  assert.equal(ageBand(schema, fixture.data), "adult");
});

test("the trend lists vital sets in time order", () => {
  const trend = vitalTrend(schema, fixture.data);
  assert.deepEqual(trend.map((r) => r.values["eVitals.06"]), [158, 142]);
  const { pcr: added } = addGroupRow(schema, fixture.data, VITALS, { "eVitals.01": "2026-11-15T14:05:00-06:00", "eVitals.HeartRateGroup": { "eVitals.10": 110 } });
  assert.equal(vitalTrend(schema, added)[0].values["eVitals.10"], 110);
});

test("report, QA and submission status are separate and honest", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  assert.equal(reportStatus({ status: "draft", createdAt: "2026-11-17T10:00:00Z" }, { now }).id, "draft");
  assert.equal(reportStatus({ status: "draft", createdAt: "2026-11-15T10:00:00Z" }, { now }).id, "overdue");
  assert.equal(reportStatus({ status: "draft", amendment: { open: true } }, { now }).id, "amending");
  assert.equal(reportStatus({ status: "posted", nemsisCheck: { ok: false } }).id, "needs-review");
  assert.equal(reportStatus({ status: "posted", amendments: 2 }).label, "Amended");
  assert.equal(qaStatus({}).label, "Not reviewed");
  assert.equal(qaStatus({ qa: { status: "returned" } }).id, "returned");
  const sub = submissionStatus({ status: "posted" });
  assert.equal(sub.id, "not-configured");
  assert.doesNotMatch(sub.label, /accepted|submitted to/i);
});

test("amendment changes are listed by element, old and new", () => {
  let after = setLeaf(schema, fixture.data, "eVitals.06", 150, { [VITALS]: 1 });
  after = setLeaf(schema, after, "eDisposition.01", "Other Hospital");
  const changes = diffPcr(fixture.data, after);
  assert.deepEqual(changes.map((c) => c.element), ["eDisposition.01", "eVitals.06"]);
  const bp = changes.find((c) => c.element === "eVitals.06");
  assert.equal(leafWords(bp.from), "142");
  assert.equal(leafWords(bp.to), "150");
  assert.deepEqual(diffPcr(fixture.data, structuredClone(fixture.data)), []);
  assert.equal(elementOfPath("eVitals.eVitals.VitalGroup[1].eVitals.BloodPressureGroup.eVitals.06"), "eVitals.06");
  assert.equal(leafWords(JSON.stringify({ NV: "7701003" })), "Not recorded (7701003)");
});

test("the posted hash detects any change, and ignores key order", async () => {
  const hash = await contentHash(fixture.data);
  assert.match(hash, /^[0-9a-f]{64}$/);
  const reordered = Object.fromEntries(Object.entries(fixture.data).reverse());
  assert.equal(await contentHash(reordered), hash);
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
  assert.equal(await verifyPosted({ nemsis: fixture.data, postedHash: hash }), true);
  assert.equal(await verifyPosted({ nemsis: setLeaf(schema, fixture.data, "eVitals.10", 97, { [VITALS]: 0 }), postedHash: hash }), false);
  assert.equal(await verifyPosted({ nemsis: fixture.data }), null);
});

test("the server's amendment record matches the browser's diff", async () => {
  const canonicalHashSync = await contentHash(fixture.data);
  const core = require("../../functions/lib/nemsis/generated/nemsisCore.cjs");
  const { amendmentRevision } = require("../../functions/lib/nemsis/pcrCheck.js");
  const after = setLeaf(schema, fixture.data, "eVitals.06", 150, { [VITALS]: 1 });
  assert.deepEqual(core.diffPcr(fixture.data, after), diffPcr(fixture.data, after));
  const nodeHash = require("node:crypto").createHash("sha256").update(core.canonicalJson(fixture.data)).digest("hex");
  assert.equal(nodeHash, canonicalHashSync, "the server's posted hash matches the browser's check");
  const rev = amendmentRevision({ count: 1, open: { revisionId: "posted-1", reason: "Fix BP", openedByName: "Chief" }, changes: diffPcr(fixture.data, after), after: { postedAt: "t", postedByName: "Medic" }, at: "now" });
  assert.equal(rev.kind, "amendment");
  assert.equal(rev.reason, "Fix BP");
  assert.equal(rev.changeCount, 1);
  assert.equal(rev.amendedByName, "Medic");
});

test("the handoff summary has the key facts and escapes everything", () => {
  const sum = handoffSummary(schema, { number: "P-1", unit: "Medic 1", nemsis: fixture.data });
  assert.equal(sum.patient.name, "Alex Testpatient");
  assert.equal(sum.vitals.length, 2);
  assert.match(sum.vitals[1].text, /BP 142\/88/);
  assert.match(sum.medications[0].text, /^aspirin · 324 Milligrams/);
  assert.equal(sum.transport.destination, "Test Regional Medical Center");
  const evil = handoffSummary(schema, { number: "<b>x</b>", nemsis: setLeaf(schema, fixture.data, "eDisposition.01", "<script>alert(1)</script>") });
  const html = handoffHtml(evil);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /not the complete patient care report/);
});

test("analytics are totals only, with small counts hidden", () => {
  const report = (i, transport) => ({
    status: "posted",
    postedAt: "2026-11-15T16:00:00-06:00",
    createdAt: "2026-11-15T14:00:00-06:00",
    nemsis: setLeaf(schema, fixture.data, "eDisposition.30", transport),
    nemsisCheck: { ok: i !== 0 },
  });
  const reports = [...Array(6)].map((_, i) => report(i, i < 5 ? "4230001" : "4230013"));
  const data = pcrAnalytics(schema, reports);
  assert.equal(data.total, 6);
  const transport = Object.fromEntries(data.byTransport.map((r) => [r.label, r.shown]));
  assert.equal(transport["Transport by This EMS Unit (This Crew Only)"], 5);
  assert.equal(transport["No Transport"], "<5");
  assert.equal(data.transportRate, 83);
  assert.ok(Math.abs(data.medianResponseMinutes - 7.6) < 0.1);
  assert.equal(data.nemsisCheckFailRate, 17);
  assert.equal(shownCount(0), 0);
  assert.equal(shownCount(3), "<5");
  assert.doesNotMatch(JSON.stringify(data), /Testpatient|Alex|Willow/, "no identities");
  const few = pcrAnalytics(schema, reports.slice(0, 3));
  assert.equal(few.shownTotal, "<5");
  assert.equal(few.medianResponseMinutes, null);
  assert.equal(few.transportRate, null);
  assert.equal(pcrAnalytics(schema, reports, { from: "2026-11-16" }).total, 0);
});
