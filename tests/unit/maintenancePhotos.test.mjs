import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMaintenanceIssueMessageBody,
  buildMaintenanceWorkOrderRecord,
  savedPhotos,
} from "../../src/lib/maintenanceIssueWorkflow.js";
import { portalReportToFleetWorkOrderInput } from "../../src/lib/fleet/workOrderLoopLogic.js";

const form = {
  date: "2026-11-02",
  location: "Engine 1",
  equipment: "Driver door",
  damageDescription: "Dent in the driver door.",
  photos: [
    { url: "https://example.test/a.jpg", storagePath: "departments/d/damage-reports/WO-1/a.jpg", name: "a.jpg", contentType: "image/jpeg" },
    { id: "local", previewUrl: "blob:local", file: {} },
  ],
};

test("only uploaded photos are kept (no local previews or File objects)", () => {
  const photos = savedPhotos(form.photos);
  assert.equal(photos.length, 1);
  assert.deepEqual(Object.keys(photos[0]).sort(), ["contentType", "name", "storagePath", "url"]);
});

test("work order record and fleet input carry the photos", () => {
  const record = buildMaintenanceWorkOrderRecord(form, "Chief A. Sample", 0);
  assert.equal(record.photos.length, 1);
  assert.equal(record.photos[0].url, "https://example.test/a.jpg");
  const fleet = portalReportToFleetWorkOrderInput(form, record, "Chief A. Sample");
  assert.equal(fleet.photos.length, 1);
  assert.equal(fleet.photos[0].url, "https://example.test/a.jpg");
});

test("the message to the battalion chiefs links the photos", () => {
  const body = buildMaintenanceIssueMessageBody(form, "Chief A. Sample");
  assert.match(body, /Photos \(1\):\n1\. https:\/\/example\.test\/a\.jpg/);
  assert.doesNotMatch(buildMaintenanceIssueMessageBody({ ...form, photos: [] }, "x"), /Photos/);
});
