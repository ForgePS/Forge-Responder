import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OFFLINE_DEFAULTS,
  PACKAGE_SCHEMA_VERSION,
  PackageIntegrityError,
  buildPackageContent,
  canonicalJson,
  chooseOfflineFiles,
  deviceSummary,
  deviceWipeReason,
  expiryFrom,
  generateDeviceKey,
  normalizeOfflineSettings,
  offlineFileKind,
  openPackage,
  packageFreshness,
  packageSyncAction,
  sealPackage,
} from "../../src/lib/preplans/offlinePackageModel.js";

const preplan = { id: "PP1", facilityName: "Riverside High", address: "1 Main St", publishedRevisionId: "R2", hydrantIds: ["H1"], status: "operational", secretField: "x" };
const revision = { id: "R2", status: "published", revisionNumber: 2, sectionAnswers: { constructionType: "Type II" }, templateSnapshot: { sections: [] }, internalNotes: "not for the device" };

describe("settings", () => {
  it("default and clamp", () => {
    assert.deepEqual(normalizeOfflineSettings({}), { ...OFFLINE_DEFAULTS });
    const s = normalizeOfflineSettings({ packageDays: 500, staleHours: 0, maxFileMb: -3, includePhotos: false });
    assert.equal(s.packageDays, 90);
    assert.equal(s.staleHours, 1);
    assert.equal(s.maxFileMb, 0);
    assert.equal(s.includePhotos, false);
    assert.equal(s.includeDocuments, true);
  });
});

describe("what goes in a package", () => {
  it("only the published revision", () => {
    assert.throws(() => buildPackageContent({ preplan, revision: { ...revision, id: "R3", status: "draft" } }), /Only a published preplan/);
    assert.throws(() => buildPackageContent({ preplan: { ...preplan, publishedRevisionId: "" }, revision }), /Only a published preplan/);
  });

  it("keeps response fields, drops rejected objects, far hydrants and storage paths", () => {
    const content = buildPackageContent({
      preplan,
      revision,
      buildings: [{ id: "B1", name: "Main", floors: [{ id: "F1", name: "Level 1", plan: { objects: [{ id: "a", verificationStatus: "verified" }, { id: "b", verificationStatus: "rejected" }] } }] }],
      hydrantRows: [{ id: "H1" }, { id: "H9" }],
      hydrantIdsToKeep: ["H1"],
      files: [{ id: "f1", name: "Front", storagePath: "departments/x/y.jpg", stored: true }],
    });
    assert.equal(content.preplan.secretField, undefined);
    assert.equal(content.revision.internalNotes, undefined);
    assert.equal(content.revision.templateSnapshot, undefined);
    assert.equal(content.revision.sectionAnswers.constructionType, "Type II");
    assert.deepEqual(content.buildings[0].floors[0].plan.objects.map((o) => o.id), ["a"]);
    assert.deepEqual(content.hydrantRows.map((h) => h.id), ["H1"]);
    assert.equal(content.files[0].storagePath, undefined);
  });

  it("files: allowed kinds, no restricted ones unless permitted, newest first within the size budget", () => {
    assert.equal(offlineFileKind({ mimeType: "image/jpeg", category: "photo" }), "photo");
    assert.equal(offlineFileKind({ mimeType: "application/pdf" }), "document");
    assert.equal(offlineFileKind({ mimeType: "image/png", category: "floor_plan" }), "");
    assert.equal(offlineFileKind({ mimeType: "text/plain" }), "");
    const MB = 1024 * 1024;
    const files = [
      { id: "old", mimeType: "image/jpeg", category: "photo", fileSize: 3 * MB, storagePath: "p1", createdAt: "2026-01-01" },
      { id: "new", mimeType: "image/jpeg", category: "photo", fileSize: 3 * MB, storagePath: "p2", createdAt: "2026-06-01" },
      { id: "knox", mimeType: "image/jpeg", category: "photo", fileSize: MB, storagePath: "p3", sensitive: true },
      { id: "gone", mimeType: "image/jpeg", fileSize: MB, storagePath: "p4", archived: true },
      { id: "pdf", mimeType: "application/pdf", fileSize: MB, storagePath: "p5", createdAt: "2026-03-01" },
    ];
    const settings = normalizeOfflineSettings({ maxFileMb: 5 });
    const picked = chooseOfflineFiles(files, { settings });
    assert.deepEqual(picked.files.map((f) => f.id), ["new", "pdf"]);
    assert.equal(picked.leftOut, 1, "the older photo didn't fit");
    assert.ok(chooseOfflineFiles(files, { settings: normalizeOfflineSettings({ maxFileMb: 50 }), canSeeRestricted: true }).files.some((f) => f.id === "knox"));
    assert.deepEqual(chooseOfflineFiles(files, { settings: normalizeOfflineSettings({ includePhotos: false, maxFileMb: 50 }) }).files.map((f) => f.id), ["pdf"]);
  });
});

describe("freshness", () => {
  const synced = "2026-11-26T08:00:00.000Z";
  const pkg = { syncedAt: synced, expiresAt: expiryFrom(synced, { packageDays: 14 }) };
  it("current, then stale, then expired", () => {
    assert.equal(pkg.expiresAt, "2026-12-10T08:00:00.000Z");
    assert.equal(packageFreshness(pkg, new Date("2026-11-26T20:00:00Z")).state, "current");
    assert.equal(packageFreshness(pkg, new Date("2026-11-27T09:00:00Z")).state, "stale");
    const expired = packageFreshness(pkg, new Date("2026-12-10T08:00:00Z"));
    assert.equal(expired.state, "expired");
    assert.match(expired.message, /may have changed/);
    assert.equal(packageFreshness(null).state, "missing");
  });
  it("says when a newer approved version is waiting", () => {
    assert.equal(packageFreshness({ ...pkg, newerRevisionId: "R3" }, new Date("2026-11-26T09:00:00Z")).state, "outdated");
  });
});

describe("syncing", () => {
  it("removes withdrawn or unpublished plans, replaces on a new revision, otherwise refreshes the live parts", () => {
    const local = { revisionId: "R2" };
    assert.equal(packageSyncAction(local, null).action, "remove");
    assert.equal(packageSyncAction(local, { ...preplan, status: "archived" }).action, "remove");
    assert.equal(packageSyncAction(local, { ...preplan, status: "temporarily_unavailable" }).action, "remove");
    assert.equal(packageSyncAction(local, { ...preplan, publishedRevisionId: "" }).action, "remove");
    assert.equal(packageSyncAction(local, { ...preplan, publishedRevisionId: "R3" }).action, "full");
    assert.equal(packageSyncAction(local, preplan).action, "light");
  });

  it("wipes the device when access, the feature or the device was revoked", () => {
    assert.equal(deviceWipeReason({ device: { status: "active", uid: "u1" }, uid: "u1" }), "");
    assert.match(deviceWipeReason({ device: { status: "revoked", uid: "u1" }, uid: "u1" }), /revoked/);
    assert.match(deviceWipeReason({ allowed: false }), /no longer have access/);
    assert.match(deviceWipeReason({ featureOn: false }), /turned off/);
    assert.match(deviceWipeReason({ device: { status: "active", uid: "u2" }, uid: "u1" }), /someone else/);
    assert.equal(deviceWipeReason({ device: null, uid: "u1" }), "", "not registered yet (a demo reset, say) is fine");
    assert.equal(deviceSummary(new Array(250).fill({ preplanId: "P" })).length, 200);
  });
});

describe("sealing", () => {
  const pkg = { schemaVersion: PACKAGE_SCHEMA_VERSION, preplanId: "PP1", revisionId: "R2", content: { preplan: { id: "PP1", name: "A" }, alerts: [{ id: 1 }] } };

  it("hashes the same content the same way whatever the key order", () => {
    assert.equal(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] }), canonicalJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
  });

  it("round-trips, and the key can't be exported", async () => {
    const key = await generateDeviceKey();
    assert.equal(key.extractable, false);
    const sealed = await sealPackage(key, pkg, "forge-preplan:d:PP1");
    assert.ok(sealed.data.byteLength > 0 && sealed.hash.length === 64);
    assert.ok(!new TextDecoder().decode(sealed.data).includes("PP1"), "stored encrypted");
    const opened = await openPackage(key, sealed, "forge-preplan:d:PP1");
    assert.deepEqual(opened.content, pkg.content);
  });

  it("refuses an altered copy, a copy filed under another preplan, or another key", async () => {
    const key = await generateDeviceKey();
    const sealed = await sealPackage(key, pkg, "forge-preplan:d:PP1");
    const tampered = { ...sealed, data: new Uint8Array(sealed.data).map((b, i) => (i === 5 ? b ^ 1 : b)).buffer };
    await assert.rejects(openPackage(key, tampered, "forge-preplan:d:PP1"), PackageIntegrityError);
    await assert.rejects(openPackage(key, sealed, "forge-preplan:d:PP2"), PackageIntegrityError);
    await assert.rejects(openPackage(await generateDeviceKey(), sealed, "forge-preplan:d:PP1"), PackageIntegrityError);
  });
});
