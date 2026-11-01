import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCertificationRecord,
  certificationCategoryOptions,
  certificationPersonOptions,
  certificationTypeOptions,
  newCertificationId,
  toDateInputValue,
  validateCertificationDraft,
} from "../../src/lib/certificationRecords.js";

const records = [
  { id: "CERT-1", person: "Firefighter E. Member", type: "Firefighter II", category: "Fire" },
  { id: "CERT-2", person: "Captain D. Trainee", type: "Paramedic", category: "EMS" },
  { id: "CERT-3", person: "Captain D. Trainee", type: "Hazmat Tech", category: "Special Ops" },
];

test("person picker lists the roster plus names already on certifications, once each", () => {
  const people = certificationPersonOptions([{ name: "Chief A. Sample" }, { firstName: "Pat", lastName: "Lee" }, { name: "Captain D. Trainee" }], records);
  assert.deepEqual(people, ["Captain D. Trainee", "Chief A. Sample", "Firefighter E. Member", "Pat Lee"]);
  assert.deepEqual(certificationPersonOptions(undefined, []), []);
});

test("type and category options come from existing records", () => {
  assert.deepEqual(certificationTypeOptions(records), ["Firefighter II", "Hazmat Tech", "Paramedic"]);
  assert.deepEqual(certificationCategoryOptions(records), ["Fire", "EMS", "Special Ops"]);
  assert.deepEqual(certificationCategoryOptions([]), ["Fire", "EMS"]);
});

test("new ids never collide with existing ones", () => {
  const rolls = [0, 0, 0.5];
  const random = () => rolls.shift();
  const first = newCertificationId([], 1000, () => 0);
  const second = newCertificationId([{ id: first }], 1000, random);
  assert.notEqual(first, second);
  assert.match(second, /^CERT-/);
});

test("seed-style dates convert for date inputs", () => {
  assert.equal(toDateInputValue("Sep 10, 2027"), "2027-09-10");
  assert.equal(toDateInputValue("2027-09-10"), "2027-09-10");
  assert.equal(toDateInputValue("soon"), "");
});

test("drafts need a person, type, category and expiration date", () => {
  assert.equal(validateCertificationDraft({}).length, 4);
  assert.deepEqual(validateCertificationDraft({ person: "A", type: "B", category: "Fire", expires: "2027-01-01" }), []);
  assert.ok(validateCertificationDraft({ person: "A", type: "B", category: "Fire", issue: "2028-01-01", expires: "2027-01-01" })
    .some((problem) => problem.includes("after")));
});

test("a new record stores the dates and starts with renewal not started", () => {
  const now = new Date(2026, 9, 31, 10);
  const record = buildCertificationRecord(
    { person: " Pat Lee ", type: "Paramedic", category: "EMS", issue: "2026-01-01", expires: "2026-11-10" },
    { id: "CERT-X", personnelId: "P-9", document: { name: "card.pdf", downloadUrl: "https://x", storagePath: "a/b" }, now },
  );
  assert.equal(record.person, "Pat Lee");
  assert.equal(record.expires, "2026-11-10");
  assert.equal(record.days, 10);
  assert.equal(record.status, "Due Soon");
  assert.equal(record.renewal, "Not Started");
  assert.equal(record.personnelId, "P-9");
  assert.equal(record.document, "card.pdf");
  assert.equal(buildCertificationRecord({ expires: "2026-01-01" }, { id: "Y", now }).status, "Expired");
  assert.equal(buildCertificationRecord({ expires: "2026-01-01" }, { id: "Y", now }).documentUrl, "");
});
