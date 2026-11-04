import { test } from "node:test";
import assert from "node:assert/strict";
import {
  departmentInitials,
  resolveFieldAppForms,
  resolveFireCodeDocumentBase,
  resolveImportantNumbers,
  safeHttpUrl,
} from "../../src/lib/fieldAppConfig.js";

test("important numbers come only from the department profile", () => {
  assert.deepEqual(resolveImportantNumbers({}), []);
  assert.deepEqual(resolveImportantNumbers({ importantNumbers: "nope" }), []);
  const list = resolveImportantNumbers({
    importantNumbers: [
      { name: " Dispatch ", numbers: [{ label: "", value: "555-0100" }, { label: "Fax", value: "" }] },
      { name: "", numbers: [{ label: "Main", value: "555-0101" }] },
      { name: "No numbers", numbers: [] },
    ],
  });
  assert.deepEqual(list, [{ name: "Dispatch", numbers: [{ label: "Main", value: "555-0100" }] }]);
});

test("form and document links accept only http(s) URLs", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(safeHttpUrl("not a url"), "");
  assert.deepEqual(resolveFieldAppForms({}), { preFirePlanFormUrl: "", inspectionFormUrl: "" });
  assert.equal(resolveFieldAppForms({ inspectionFormUrl: "https://forms.example.com/a" }).inspectionFormUrl, "https://forms.example.com/a");
  assert.equal(resolveFireCodeDocumentBase({}), "");
  assert.equal(resolveFireCodeDocumentBase({ fireCodeDocumentBaseUrl: "https://docs.example.com/" }), "https://docs.example.com");
});

test("department initials use the short name or the display name", () => {
  assert.equal(departmentInitials({ shortName: "sfd" }), "SFD");
  assert.equal(departmentInitials({ name: "City of Springfield Fire Department" }), "CSFD");
  assert.equal(departmentInitials({}), "FD");
});
