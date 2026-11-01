import { test } from "node:test";
import assert from "node:assert/strict";
import { departmentInactiveReason } from "../../src/lib/departmentStatus.js";

test("department registry status maps to the right message", () => {
  assert.equal(departmentInactiveReason({ status: "archived" }), "archived");
  assert.equal(departmentInactiveReason({ status: "disabled" }), "archived");
  assert.equal(departmentInactiveReason({ status: "active", subscription: { saasStatus: "suspended" } }), "suspended");
  assert.equal(departmentInactiveReason({ subscription: { saasStatus: "Cancelled" } }), "cancelled");
  assert.equal(departmentInactiveReason({ status: "active", subscription: { saasStatus: "trial" } }), "");
  assert.equal(departmentInactiveReason(undefined), "");
});
