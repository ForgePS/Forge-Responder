// FORGE FIELD ePCR: device encryption (fieldPhi.js) and sync planning (fieldPcr.js).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadNemsisSchema, ROOT } from "./helpers/nemsisSchema.mjs";
import { generateDeviceKey, sealJson, openJson, isSealed, SEALED_KINDS, SEALED_FIELDS, sealRecordWithKey, openRecordWithKey } from "../../src/field/fieldPhi.js";
import { describePcr, fieldPcrNumber, newPcrRecordData, pcrMergePaths, planPcrWrite, stripUndefined } from "../../src/field/fieldPcr.js";
import { setLeaf } from "../../src/lib/nemsis/pcrModel.js";

const schema = loadNemsisSchema("3.5.1");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));
const UUID = "0b6f6d1e-1c1a-4d55-9a57-3f1f3b7f0c11";

// --- device encryption ------------------------------------------------------------------------

test("PHI is sealed with AES-GCM and only opens with the same key and record binding", async () => {
  assert.ok(SEALED_KINDS.has("pcr"));
  const key = await generateDeviceKey();
  assert.equal(key.extractable, false, "the key can't be read out of the browser");
  const value = { ePatient: { "ePatient.02": "Doe", "ePatient.03": "Jane" } };
  const sealed = await sealJson(key, value, "pc-1:data");
  assert.ok(isSealed(sealed));
  assert.ok(!new TextDecoder().decode(sealed.data).includes("Doe"), "ciphertext doesn't contain the plain text");
  assert.deepEqual(await openJson(key, sealed, "pc-1:data"), value);

  // Each seal uses a fresh IV.
  const again = await sealJson(key, value, "pc-1:data");
  assert.notDeepEqual(Array.from(again.iv), Array.from(sealed.iv));

  // Wrong key (e.g. after sign-out made a new one), swapped record, or tampering: refuses to open.
  await assert.rejects(openJson(await generateDeviceKey(), sealed, "pc-1:data"), { code: "phi-locked" });
  await assert.rejects(openJson(key, sealed, "pc-2:data"), { code: "phi-locked" });
  const tampered = { ...sealed, data: Uint8Array.from(sealed.data, (b, i) => (i === 0 ? b ^ 1 : b)) };
  await assert.rejects(openJson(key, tampered, "pc-1:data"), { code: "phi-locked" });

  // Plain values pass through openJson unchanged (records saved before sealing existed).
  assert.deepEqual(await openJson(key, { a: 1 }), { a: 1 });
});

// --- device record data -------------------------------------------------------------------------

function newData(overrides = {}) {
  return newPcrRecordData(schema, {
    uuid: UUID,
    number: "PCR-2026-FTEST01",
    softwareVersion: "0.1.0",
    uid: "user-a",
    crewUids: ["user-b", "user-a"],
    agency: { number: "TEST001" },
    unit: { callSign: "Medic 1" },
    incidentNumber: "26-001234",
    ...overrides,
  });
}

test("new device records carry the report UUID, crew and no PHI in their list title", () => {
  const data = newData();
  assert.equal(data.id, UUID);
  assert.equal(data.nemsis.attrs.UUID, UUID);
  assert.deepEqual(data.crewUids, ["user-a", "user-b"]);
  assert.equal(data.status, "draft");
  const charted = { ...data, nemsis: setLeaf(schema, data.nemsis, "ePatient.02", "Doe") };
  const { title, subtitle } = describePcr(charted);
  assert.ok(!`${title} ${subtitle}`.includes("Doe"));
  assert.equal(subtitle, "Draft · Medic 1 · 26-001234");
  assert.match(fieldPcrNumber(new Date(2026, 10, 17), () => 0.5), /^PCR-2026-F[0-9A-Z]{8}$/);
});

test("merge paths cover the workflow fields and every NEMSIS section", () => {
  const paths = pcrMergePaths(schema);
  assert.ok(paths.includes("status") && paths.includes("crewUids"));
  assert.ok(paths.includes("nemsis.eVitals") && paths.includes("nemsis.eNarrative"));
  assert.ok(paths.every((p) => p.split(".").length <= 2), "NEMSIS ids contain dots, so merge whole sections");
});

// --- sync planning ------------------------------------------------------------------------------

const record = (data, extra = {}) => ({ localId: "pc-1", savedAt: "2026-11-17T20:00:00.000Z", createdAt: "2026-11-17T19:00:00.000Z", data, base: null, ...extra });
const NOW = "2026-11-17T20:00:05.000Z";

test("first send writes the whole report with bookkeeping and a retry token", () => {
  const plan = planPcrWrite(schema, { record: record(newData()), server: null, uid: "user-a", actorName: "A. Medic", now: NOW });
  assert.equal(plan.action, "write");
  assert.equal(plan.doc.id, UUID);
  assert.equal(plan.doc.createdByUid, "user-a");
  assert.equal(plan.doc.lastWrite, "pc-1:2026-11-17T20:00:00.000Z");
  assert.equal(plan.doc.source, "field-app");
  assert.equal(plan.doc.postedAt, undefined);
  assert.ok(plan.doc.crewUids.includes("user-a"));
  assert.equal(plan.base.nemsis.attrs.UUID, UUID);
  // A retry after the write landed (reply lost) does nothing.
  assert.equal(planPcrWrite(schema, { record: record(newData()), server: plan.doc, uid: "user-a", actorName: "A. Medic", now: NOW }).action, "done");
});

test("posting is refused until NEMSIS validation passes, then stamps who posted", () => {
  const draft = { ...newData(), status: "posted" };
  const refused = planPcrWrite(schema, { record: record(draft), server: null, uid: "user-a", actorName: "A", now: NOW });
  assert.equal(refused.action, "reject");
  assert.match(refused.message, /can't be posted yet/);

  const complete = { ...newData(), status: "posted", nemsis: { ...fixture.data, attrs: { UUID } } };
  const plan = planPcrWrite(schema, { record: record(complete), server: null, uid: "user-a", actorName: "A. Medic", now: NOW });
  assert.equal(plan.action, "write");
  assert.equal(plan.doc.postedAt, NOW);
  assert.equal(plan.doc.postedByName, "A. Medic");
});

test("a posted report on the server is locked; changes from two devices merge by section or conflict", () => {
  const base = newData();
  const server = planPcrWrite(schema, { record: record(base), server: null, uid: "user-a", actorName: "A", now: NOW }).doc;

  const locked = planPcrWrite(schema, { record: record(base, { savedAt: "later" }), server: { ...server, status: "posted" }, uid: "user-a", actorName: "A", now: NOW });
  assert.equal(locked.action, "reject");
  assert.match(locked.message, /posted and is locked/);

  // Device A charts vitals; meanwhile device B's narrative reached the server: both kept.
  const startedFrom = { ...base };
  const mine = { ...base, nemsis: setLeaf(schema, base.nemsis, "eVitals.06", 142) };
  const theirs = { ...server, nemsis: setLeaf(schema, server.nemsis, "eNarrative.01", "Pt found sitting."), lastWrite: "other" };
  const merged = planPcrWrite(schema, { record: record(mine, { base: startedFrom, savedAt: "t2" }), server: theirs, uid: "user-a", actorName: "A", now: NOW });
  assert.equal(merged.action, "write");
  assert.equal(merged.doc.nemsis.eVitals["eVitals.VitalGroup"][0]["eVitals.BloodPressureGroup"]["eVitals.06"], 142);
  assert.equal(merged.doc.nemsis.eNarrative["eNarrative.01"], "Pt found sitting.");

  // Both changed vitals: the crew must choose.
  const theirVitals = { ...server, nemsis: setLeaf(schema, server.nemsis, "eVitals.06", 150), lastWrite: "other" };
  const conflict = planPcrWrite(schema, { record: record(mine, { base: startedFrom, savedAt: "t3" }), server: theirVitals, uid: "user-a", actorName: "A", now: NOW });
  assert.equal(conflict.action, "conflict");
  assert.deepEqual(conflict.conflicts.map((c) => c.path), ["nemsis.eVitals"]);
});

test("stripUndefined removes undefined values Firestore would reject, keeping everything else", () => {
  assert.deepEqual(stripUndefined({ a: undefined, b: [1, undefined, { c: undefined, d: 0 }], e: null, f: "" }), { b: [1, { d: 0 }], e: null, f: "" });
});

// --- review fixes (PR 75) -------------------------------------------------------------------------

test("conflict details (record.attention) are sealed with the chart, not stored in plain text", async () => {
  const key = await generateDeviceKey();
  const chart = { nemsis: { ePatient: { "ePatient.02": "Doe" } } };
  const record = {
    kind: "pcr",
    localId: "pc-9",
    scope: "dept::user",
    status: "attention",
    data: chart,
    base: chart,
    attention: { type: "conflict", message: "Changed on the server too", conflicts: [{ path: "nemsis.ePatient", mine: chart.nemsis.ePatient, server: {} }], merged: chart },
  };
  const sealed = await sealRecordWithKey(record, key);
  assert.ok(SEALED_FIELDS.includes("attention"));
  assert.ok(!JSON.stringify(sealed, (k, v) => (v instanceof Uint8Array ? "<bytes>" : v)).includes("Doe"));
  assert.equal(sealed.status, "attention", "bookkeeping stays readable");
  const opened = await openRecordWithKey(sealed, key);
  assert.deepEqual(opened.attention, record.attention);
  assert.deepEqual(opened.data, chart);
  // Records with no conflict seal a null attention and get it back.
  assert.equal((await openRecordWithKey(await sealRecordWithKey({ ...record, attention: null }, key), key)).attention, null);
});

test("after a merge the device gets the merged chart back with its base", () => {
  const base = newData();
  const server = planPcrWrite(schema, { record: record(base), server: null, uid: "user-a", actorName: "A", now: NOW }).doc;
  const mine = { ...base, nemsis: setLeaf(schema, base.nemsis, "eVitals.06", 142) };
  const theirs = { ...server, nemsis: setLeaf(schema, server.nemsis, "eNarrative.01", "Pt found sitting."), lastWrite: "other" };
  const plan = planPcrWrite(schema, { record: record(mine, { base, savedAt: "t2" }), server: theirs, uid: "user-a", actorName: "A", now: NOW });
  assert.equal(plan.action, "write");
  assert.equal(plan.data.nemsis.eNarrative["eNarrative.01"], "Pt found sitting.", "the kept server narrative is on the device");
  assert.deepEqual(plan.data.nemsis, plan.base.nemsis, "data and base are a matching pair");

  // The next save (unchanged chart) changes nothing on the server.
  const again = planPcrWrite(schema, { record: record(plan.data, { base: plan.base, savedAt: "t3" }), server: plan.doc, uid: "user-a", actorName: "A", now: NOW });
  assert.equal(again.doc.nemsis.eNarrative["eNarrative.01"], "Pt found sitting.");
});

test("posting validates the merged report, including server sections the author didn't touch", () => {
  const complete = { ...newData(), nemsis: { ...fixture.data, attrs: { UUID } } };
  const server = planPcrWrite(schema, { record: record(complete), server: null, uid: "user-a", actorName: "A", now: NOW }).doc;
  // Someone cleared eTimes.03 (Mandatory) on the server; this device posts its otherwise unchanged copy.
  const { "eTimes.03": _cleared, ...times } = server.nemsis.eTimes;
  const theirs = { ...server, nemsis: { ...server.nemsis, eTimes: times }, lastWrite: "other" };
  const posting = { ...complete, status: "posted" };
  const plan = planPcrWrite(schema, { record: record(posting, { base: pcrBaseOf(server), savedAt: "t2" }), server: theirs, uid: "user-a", actorName: "A", now: NOW });
  assert.equal(plan.action, "reject");
  assert.match(plan.message, /can't be posted yet/);
});

function pcrBaseOf(doc) {
  return { status: doc.status, crewUids: doc.crewUids, incidentNumber: doc.incidentNumber, unit: doc.unit, nemsis: doc.nemsis, updatedAt: doc.updatedAt };
}

// --- reopening a report a supervisor unlocked ---------------------------------------------------

test("a posted, synced report on the device is reopened only when the server copy went back to draft", async () => {
  const { mayBeUnlocked, reopenPatch } = await import("../../src/field/fieldPcr.js");
  const data = { id: UUID, uuid: UUID, number: "P-1", status: "posted", crewUids: ["u1"], nemsis: {} };
  assert.equal(mayBeUnlocked({ kind: "pcr", status: "synced", data }), true);
  assert.equal(mayBeUnlocked({ kind: "pcr", status: "queued", data }), false, "unsent changes stay as they are");
  assert.equal(mayBeUnlocked({ kind: "pcr", status: "synced", data: { ...data, status: "draft" } }), false);
  assert.equal(mayBeUnlocked({ kind: "dailyLog", status: "synced", data }), false);

  assert.equal(reopenPatch({ ...data, status: "posted" }), null);
  assert.equal(reopenPatch(null), null);
  const server = { ...data, status: "draft", unlockedAt: "2026-11-17T10:00:00Z", nemsis: { eRecord: { "eRecord.01": "P-1" } }, updatedAt: "2026-11-17T10:00:00Z" };
  const patch = reopenPatch(server);
  assert.equal(patch.status, "draft");
  assert.equal(patch.data.status, "draft");
  assert.deepEqual(patch.data.nemsis, server.nemsis, "the device chart becomes the server copy");
  assert.deepEqual(patch.base.nemsis, server.nemsis, "and so does the merge base, so the next save has no false conflicts");
  assert.equal(patch.attention, null);
});
