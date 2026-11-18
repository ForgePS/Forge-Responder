// Emailing a completed inspection report to the occupancy.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { occupancyEmails, parseRecipients } from "../../src/lib/inspections/inspectionEmailRecipients.js";

const require = createRequire(import.meta.url);
const { buildEmailText, buildReport, cleanRecipients, emailInspectionReport, renderPdf } = require("../../functions/lib/inspectionEmail.js");

const inspection = {
  id: "INS-1",
  inspectionNumber: "INS-2026-0210",
  status: "completed",
  result: "Failed",
  completedAt: "2026-11-17T21:30:00.000Z",
  completedBy: "Lt. Rivera",
  occupancyName: "Main Street Diner",
  occupancySnapshot: { name: "Main Street Diner", address: "120 Main St", city: "Springfield", state: "IL", zip: "62701" },
  inspectionTypeSnapshot: { label: "Annual" },
  summary: "Two items to correct.",
  templateSnapshot: { sections: [{ title: "Access and Premises", fields: [
    { key: "access", label: "Fire Department access is unobstructed", type: "dropdown", options: ["Yes", "No"] },
    { key: "numbers", label: "Address numbers are visible from the street", type: "yes_no" },
    { key: "sig", label: "Inspector", type: "signature" },
  ] }] },
  answers: {
    access: "No",
    access__remarks: "Dumpster blocking the fire lane.",
    access__photos: [{ id: "p1" }, { id: "p2" }],
    numbers: "Yes",
    sig: { name: "Lt. Rivera", signedAt: "2026-11-17T21:29:00.000Z" },
  },
};
const violations = [{ name: "Fire lane obstructed", codeCitation: "IFC 503.4", correctiveAction: "Move the dumpster.", dueAt: "2026-12-01", status: "open" }];

describe("inspection report email", () => {
  it("builds the report from the stored inspection", () => {
    const report = buildReport(inspection, violations, { departmentName: "Springfield FD", timeZone: "America/Chicago" });
    assert.equal(report.title, "Springfield FD — Inspection Report");
    const facts = Object.fromEntries(report.facts);
    assert.equal(facts.Address, "120 Main St, Springfield, IL 62701");
    assert.equal(facts.Date, "November 17, 2026");
    const [access, numbers, sig] = report.sections[0].items;
    assert.equal(access.answer, "No");
    assert.equal(access.flagged, true);
    assert.equal(access.remarks, "Dumpster blocking the fire lane.");
    assert.equal(access.photos, 2);
    assert.equal(numbers.flagged, false);
    assert.match(sig.answer, /^Signed by Lt\. Rivera/);
    assert.equal(report.violations[0].citation, "IFC 503.4");
    assert.equal(report.violations[0].dueAt, "December 1, 2026");
  });

  it("writes a short email body that lists violations", () => {
    const report = buildReport(inspection, violations, { departmentName: "Springfield FD" });
    const body = buildEmailText(report, { note: "Thanks for meeting us.", departmentName: "Springfield FD", senderName: "Lt. Rivera" });
    assert.match(body, /^Thanks for meeting us\./);
    assert.match(body, /Annual inspection of Main Street Diner/);
    assert.match(body, /1\. Fire lane obstructed \(correct by/);
    assert.match(body, /Lt\. Rivera\nSpringfield FD$/);
  });

  it("renders a PDF", async () => {
    const pdf = await renderPdf(buildReport(inspection, violations));
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  });

  it("checks recipients", () => {
    assert.deepEqual(cleanRecipients(["Owner@Diner.com", "owner@diner.com"]).recipients, ["owner@diner.com"]);
    assert.match(cleanRecipients(["not-an-email"]).error, /Check this email/);
    assert.match(cleanRecipients([]).error, /at least one/);
    assert.match(cleanRecipients(["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "f@x.com"]).error, /5 addresses or fewer/);
    assert.deepEqual(parseRecipients("a@x.com; bad, b@x.com"), { recipients: ["a@x.com", "b@x.com"], invalid: ["bad"] });
    assert.deepEqual(
      occupancyEmails({ primaryContactEmail: "Owner@Diner.com", contacts: [{ email: "owner@diner.com" }, { email: "mgr@diner.com" }, { email: "" }] }),
      ["owner@diner.com", "mgr@diner.com"],
    );
  });
});

// A tiny in-memory Firestore for the callable.
function fakeDb(docs) {
  const updates = [];
  const added = [];
  const snap = (path) => ({ exists: path in docs, id: path.split("/").pop(), data: () => docs[path] });
  return {
    updates,
    added,
    doc: (path) => ({ get: async () => snap(path), update: async (data) => { updates.push({ path, data }); } }),
    collection: (path) => {
      const depth = path.split("/").length + 1;
      const rows = () => Object.keys(docs).filter((k) => k.startsWith(`${path}/`) && k.split("/").length === depth);
      return {
        get: async () => ({ docs: rows().map(snap) }),
        where: (field, _op, value) => ({ get: async () => ({ docs: rows().filter((k) => docs[k][field] === value).map(snap) }) }),
        add: async (data) => { added.push({ path, data }); },
      };
    },
  };
}

describe("emailInspectionReport callable", () => {
  const base = (dept, extra = {}) => ({
    [`departments/${dept}/inspections/INS-1`]: inspection,
    [`departments/${dept}/violations/V1`]: { ...violations[0], inspectionId: "INS-1" },
    [`departments/${dept}/profile/main`]: { name: "Springfield FD" },
    ...extra,
  });
  const request = (dept, data = {}) => ({
    auth: { uid: "u1", token: { name: "Lt. Rivera", email: "rivera@springfieldfd.gov" } },
    data: { departmentId: dept, inspectionId: "INS-1", to: ["owner@diner.com"], ...data },
  });

  it("refuses someone who isn't a member of the department", async () => {
    const db = fakeDb(base("dept-1"));
    await assert.rejects(emailInspectionReport(db, request("dept-1")), { code: "permission-denied" });
  });

  it("only emails completed inspections", async () => {
    const db = fakeDb(base("dept-1", {
      "platformCreators/u1": { status: "active" },
      "departments/dept-1/inspections/INS-1": { ...inspection, status: "in_progress" },
    }));
    await assert.rejects(emailInspectionReport(db, request("dept-1")), { code: "failed-precondition" });
  });

  it("sends (logged on staging) and records the delivery", async () => {
    const before = process.env.EMAIL_DELIVERY;
    process.env.EMAIL_DELIVERY = "log";
    try {
      const db = fakeDb(base("dept-1", { "platformCreators/u1": { status: "active" } }));
      const result = await emailInspectionReport(db, request("dept-1"));
      assert.equal(result.status, "logged");
      assert.deepEqual(result.recipients, ["owner@diner.com"]);
      assert.equal(db.updates[0].path, "departments/dept-1/inspections/INS-1");
      assert.equal(db.added[0].data.action, "email_report");
    } finally {
      if (before === undefined) delete process.env.EMAIL_DELIVERY; else process.env.EMAIL_DELIVERY = before;
    }
  });

  it("never sends from the public demo department", async () => {
    const db = fakeDb(base("forge-demo", { "platformCreators/u1": { status: "active" } }));
    const result = await emailInspectionReport(db, request("forge-demo"));
    assert.equal(result.status, "logged");
    assert.match(result.message, /demo/);
  });
});
