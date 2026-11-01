import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgementKeys,
  acknowledgementLabel,
  hasAcknowledged,
  pendingForPerson,
  requiresAcknowledgement,
  withAcknowledgement,
} from "../../src/lib/documentAcknowledgement.js";
import { displayDate, uniqueRecordId } from "../../src/lib/recordIds.js";
import { autoPopulateReport } from "../../src/lib/neris/autoPopulation.js";

const docs = [
  { id: "A", title: "SOG", requiresAcknowledgement: "Yes", acknowledgementStatus: "Acknowledged" },
  { id: "B", title: "Form", requiresAcknowledgement: "No", acknowledgementStatus: "Not Required" },
  { id: "C", title: "Old", acknowledgementStatus: "Pending" },
  { id: "D", title: "Archived", requiresAcknowledgement: "Yes", lifecycleStatus: "archived" },
];

test("one person's acknowledgement doesn't count for anyone else", () => {
  const alice = { personnelId: "P-1", uid: "u-alice", name: "Alice" };
  const bob = { personnelId: "P-2", uid: "u-bob", name: "Bob" };
  // The old shared "Acknowledged" flag no longer means everyone has.
  assert.deepEqual(pendingForPerson(docs, acknowledgementKeys(alice)).map((d) => d.id), ["A", "C"]);

  const signed = withAcknowledgement(docs[0], alice);
  assert.ok(hasAcknowledged(signed, acknowledgementKeys(alice)));
  assert.ok(!hasAcknowledged(signed, acknowledgementKeys(bob)));
  assert.deepEqual(pendingForPerson([signed, docs[2]], acknowledgementKeys(alice)).map((d) => d.id), ["C"]);
  assert.deepEqual(pendingForPerson([signed, docs[2]], acknowledgementKeys(bob)).map((d) => d.id), ["A", "C"]);

  // Signed by personnel ID in the portal, recognised by sign-in ID elsewhere.
  assert.ok(hasAcknowledged(signed, ["u-alice"]));
  assert.equal(acknowledgementLabel(signed), "Required · 1 acknowledged");
  assert.equal(acknowledgementLabel(docs[1]), "Not Required");
  assert.ok(!requiresAcknowledgement(docs[1]));
  assert.deepEqual(pendingForPerson(docs, []), []);
});

test("record IDs don't repeat and dates keep the existing format", () => {
  const ids = new Set(Array.from({ length: 200 }, () => uniqueRecordId("WO")));
  assert.equal(ids.size, 200);
  assert.match([...ids][0], /^WO-[A-Z0-9]+$/);
  assert.equal(displayDate("2026-06-14"), "Jun 14, 2026");
  assert.equal(displayDate(""), "");
});

test("NERIS auto-fill doesn't invent weather or dispatch times", () => {
  const report = { reportNumber: "R-1", incidentDate: "2026-06-14", workspace: {}, modules: {} };
  const filled = autoPopulateReport(report, {});
  assert.equal(filled.workspace?.weather?.dispatchWeather, undefined);
  assert.equal(filled.workspace?.cad?.dispatchTime || "", "");
});
