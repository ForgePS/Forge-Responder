// FORGE FIELD: emailing the inspection report once the completed inspection syncs.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateInspectionForm } from "../../src/field/inspectionValidation.js";

const rules = { required: () => false };
const base = { finish: true, result: "Passed", inspection: { templateSnapshot: { sections: [] } }, answers: {} };

describe("FORGE FIELD email report choice", () => {
  it("needs nothing when the report isn't being emailed", () => {
    assert.equal(validateInspectionForm({ ...base, emailReport: { send: false, to: "" } }, rules).emailTo, undefined);
  });

  it("needs a valid address when it is", () => {
    assert.match(validateInspectionForm({ ...base, emailReport: { send: true, to: "" } }, rules).emailTo, /Add the email/);
    assert.match(validateInspectionForm({ ...base, emailReport: { send: true, to: "owner@diner" } }, rules).emailTo, /Check this email/);
    assert.match(validateInspectionForm({ ...base, emailReport: { send: true, to: "a@x.com,b@x.com,c@x.com,d@x.com,e@x.com,f@x.com" } }, rules).emailTo, /5 addresses or fewer/);
    assert.equal(validateInspectionForm({ ...base, emailReport: { send: true, to: "owner@diner.com, mgr@diner.com" } }, rules).emailTo, undefined);
  });
});
