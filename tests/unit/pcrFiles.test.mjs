import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PCR_FILE_KINDS, newPcrFileId, pcrFileKindLabel, pcrFileProblem, pcrFileRecord, pcrFileStoragePath, sortPcrFiles,
} from "../../src/lib/pcr/pcrFiles.js";
import { pendingPcrPhotos, uploadPcrPhotos } from "../../src/field/fieldPcrFiles.js";
import { generateDeviceKey, openBytes, sealBytes } from "../../src/field/fieldPhi.js";

describe("billing document helpers", () => {
  it("kinds map to NEMSIS external document types", () => {
    assert.deepEqual(PCR_FILE_KINDS.map((k) => [k.id, k.nemsis]), [["license", "4509017"], ["insurance", "4509003"], ["other", "4509015"]]);
    assert.equal(pcrFileKindLabel("insurance"), "Insurance card");
    assert.equal(pcrFileKindLabel("nope"), "Document");
  });

  it("accepts photos and PDFs up to 10 MB only", () => {
    assert.equal(pcrFileProblem({ type: "image/jpeg", size: 1000 }), "");
    assert.equal(pcrFileProblem({ type: "application/pdf", size: 1000 }), "");
    assert.match(pcrFileProblem({ type: "image/heic", size: 1000 }), /Only photos/);
    assert.match(pcrFileProblem({ type: "image/svg+xml", size: 10 }), /Only photos/);
    assert.match(pcrFileProblem({ type: "image/png", size: 0 }), /empty/);
    assert.match(pcrFileProblem({ type: "image/png", size: 10 * 1024 * 1024 }), /over 10 MB/);
    assert.match(pcrFileProblem(null), /Choose/);
  });

  it("file ids are URL-safe and match the Storage rules' name pattern", () => {
    for (let i = 0; i < 50; i += 1) assert.match(`${newPcrFileId()}.jpg`, /^[A-Za-z0-9_-]{8,64}[.](jpg|png|webp|pdf)$/);
  });

  it("records point at the report's folder and keep no original file name", () => {
    const record = pcrFileRecord({ departmentId: "d1", pcrId: "p1", id: "abcDEF123_-xyz", kind: "license", contentType: "image/jpeg", size: 42, actor: { actorUid: "u1", actorName: "Medic" }, now: "2026-11-27T10:00:00.000Z" });
    assert.deepEqual(record, {
      id: "abcDEF123_-xyz", kind: "license", contentType: "image/jpeg", size: 42, fileName: "abcDEF123_-xyz.jpg",
      storagePath: "pcrFiles/d1/p1/abcDEF123_-xyz.jpg", createdAt: "2026-11-27T10:00:00.000Z", createdByUid: "u1", createdByName: "Medic", source: "rms",
    });
    assert.equal(pcrFileStoragePath("d1", "p1", "x.pdf"), "pcrFiles/d1/p1/x.pdf");
    assert.throws(() => pcrFileRecord({ departmentId: "d", pcrId: "p", id: "i", kind: "selfie", contentType: "image/jpeg" }));
    assert.throws(() => pcrFileRecord({ departmentId: "d", pcrId: "p", id: "i", kind: "other", contentType: "text/html" }));
  });

  it("sorts newest first", () => {
    assert.deepEqual(sortPcrFiles([{ id: "a", createdAt: "1" }, { id: "b", createdAt: "3" }, { id: "c", createdAt: "2" }]).map((f) => f.id), ["b", "c", "a"]);
  });
});

describe("billing photos on the phone", () => {
  it("are encrypted and only open with the same key and report", async () => {
    const key = await generateDeviceKey();
    const bytes = new Uint8Array([1, 2, 3, 250]);
    const sealed = await sealBytes(key, bytes, "pcr1:ph1");
    assert.notDeepEqual(Array.from(sealed.data), Array.from(bytes));
    assert.deepEqual(Array.from(await openBytes(key, sealed, "pcr1:ph1")), [1, 2, 3, 250]);
    await assert.rejects(openBytes(key, sealed, "pcr2:ph1"), (e) => e.code === "phi-locked");
    await assert.rejects(openBytes(await generateDeviceKey(), sealed, "pcr1:ph1"), (e) => e.code === "phi-locked");
  });
});

function fakeIo({ failPutOnce = false, refuse = false } = {}) {
  const calls = [];
  const files = new Set();
  const records = new Map();
  let ids = 0;
  let failed = false;
  return {
    calls, files, records,
    io: {
      newId: () => `fileid0000${(ids += 1)}`,
      readBlob: async (a) => (a.id === "missing" ? null : { type: a.type, size: a.size }),
      putBytes: async (path) => {
        calls.push(["put", path]);
        if (refuse) throw Object.assign(new Error("no"), { code: "storage/unauthorized" });
        files.add(path);
        if (failPutOnce && !failed) {
          failed = true;
          throw new Error("connection lost");
        }
      },
      fileExists: async (path) => files.has(path),
      recordExists: async (_d, _p, id) => records.has(id),
      writeRecord: async (_d, _p, rec) => {
        calls.push(["record", rec.id]);
        records.set(rec.id, rec);
      },
      dropLocal: async (id) => calls.push(["drop", id]),
    },
  };
}

function ctxFor(record) {
  return {
    departmentId: "d1",
    actor: { actorUid: "u1", actorName: "Medic" },
    async setAttachments(attachments) {
      record.attachments = attachments;
    },
  };
}

describe("sending billing photos with a field report", () => {
  const photo = (id, kind) => ({ id, kind, type: "image/jpeg", size: 10, sealed: true });

  it("uploads each pending photo, records it on the report and deletes the phone's copy", async () => {
    const record = { localId: "L1", data: { id: "pcr1" }, attachments: [photo("ph1", "license"), photo("ph2", "insurance")] };
    const { io, calls, records } = fakeIo();
    const out = await uploadPcrPhotos(record, ctxFor(record), io);
    assert.deepEqual(calls, [
      ["put", "pcrFiles/d1/pcr1/fileid00001.jpg"], ["record", "fileid00001"], ["drop", "ph1"],
      ["put", "pcrFiles/d1/pcr1/fileid00002.jpg"], ["record", "fileid00002"], ["drop", "ph2"],
    ]);
    assert.equal(records.get("fileid00001").kind, "license");
    assert.equal(records.get("fileid00002").source, "field-app");
    assert.equal(pendingPcrPhotos({ attachments: out }).length, 0);
  });

  it("a retry after a lost connection doesn't upload or record anything twice", async () => {
    const record = { localId: "L1", data: { id: "pcr1" }, attachments: [photo("ph1", "other")] };
    const { io, calls } = fakeIo({ failPutOnce: true });
    await assert.rejects(uploadPcrPhotos(record, ctxFor(record), io), /connection lost/);
    assert.equal(record.attachments[0].fileId, "fileid00001");
    await uploadPcrPhotos(record, ctxFor(record), io);
    assert.deepEqual(calls, [["put", "pcrFiles/d1/pcr1/fileid00001.jpg"], ["record", "fileid00001"], ["drop", "ph1"]]);
    assert.equal(record.attachments[0].uploaded.recorded, true);
  });

  it("skips photos already sent", async () => {
    const record = { localId: "L1", data: { id: "pcr1" }, attachments: [{ ...photo("ph1", "other"), fileId: "f1", uploaded: { bytes: true, recorded: true } }] };
    const { io, calls } = fakeIo();
    await uploadPcrPhotos(record, ctxFor(record), io);
    assert.deepEqual(calls, []);
  });

  it("a photo missing from the phone, or a refusal, stops the send for the crew to decide", async () => {
    const missing = { localId: "L1", data: { id: "pcr1" }, attachments: [photo("missing", "other")] };
    await assert.rejects(uploadPcrPhotos(missing, ctxFor(missing), fakeIo().io), (e) => e.name === "FieldRejectedError" && /missing/.test(e.message));
    const locked = { localId: "L1", data: { id: "pcr1" }, attachments: [photo("ph1", "other")] };
    await assert.rejects(uploadPcrPhotos(locked, ctxFor(locked), fakeIo({ refuse: true }).io), (e) => e.name === "FieldRejectedError" && /unlock/.test(e.message));
  });
});
