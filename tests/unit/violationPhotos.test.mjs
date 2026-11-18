// Photos as visual proof of a violation.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_VIOLATION_PHOTOS, checkViolationPhoto, violationPhotoPath, violationPhotosOf } from "../../src/lib/inspections/violationPhotoRules.js";

describe("violation photos", () => {
  it("accepts images under 20 MB only", () => {
    assert.equal(checkViolationPhoto({ name: "a.jpg", type: "image/jpeg", size: 1000 }), "");
    assert.match(checkViolationPhoto({ name: "a.pdf", type: "application/pdf", size: 1000 }), /isn't a photo/);
    assert.match(checkViolationPhoto({ name: "big.jpg", type: "image/jpeg", size: 25 * 1024 * 1024 }), /over 20 MB/);
    assert.equal(MAX_VIOLATION_PHOTOS, 10);
  });

  it("stores them under the department's violation folder with a safe name", () => {
    assert.equal(
      violationPhotoPath("dept-1", "VIO-1", "PH-1", "my photo (1).jpg"),
      "departments/dept-1/violations/VIO-1/photos/PH-1-my_photo_1_.jpg",
    );
  });

  it("are the photo evidence items on the violation", () => {
    const v = { evidence: [{ id: "1", type: "photo", url: "https://x/1" }, { id: "2", type: "note", notes: "n" }, { id: "3", type: "photo", url: "" }] };
    assert.deepEqual(violationPhotosOf(v).map((p) => p.id), ["1"]);
  });
});
