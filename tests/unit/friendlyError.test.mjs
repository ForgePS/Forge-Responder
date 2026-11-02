// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { friendlyError, isHumanMessage } from "../../src/lib/friendlyError.js";
import { labelFromKey } from "../../src/lib/labelFromKey.js";

function coded(code, message = "Firebase: internal detail") {
  return Object.assign(new Error(message), { code });
}

describe("friendlyError", () => {
  it("maps permission errors from Firestore and Storage", () => {
    const text = "You don't have permission to do that. Ask your administrator if you need access.";
    assert.equal(friendlyError(coded("permission-denied")), text);
    assert.equal(friendlyError(coded("storage/unauthorized")), text);
    assert.equal(friendlyError(coded("functions/permission-denied")), text);
    assert.equal(friendlyError(new Error("Missing or insufficient permissions.")), text);
  });

  it("maps connection, not-found, quota and session errors", () => {
    const offline = "Can't reach FORGE right now. Check your connection and try again.";
    assert.equal(friendlyError(coded("unavailable")), offline);
    assert.equal(friendlyError(coded("auth/network-request-failed")), offline);
    assert.equal(friendlyError(coded("deadline-exceeded")), offline);
    assert.equal(friendlyError(coded("not-found")), "That record no longer exists.");
    assert.equal(friendlyError(coded("resource-exhausted")), "Too many requests. Wait a moment and try again.");
    assert.equal(friendlyError(coded("unauthenticated")), "Your session expired. Sign in again.");
  });

  it("uses the fallback for failed-precondition and unknown codes", () => {
    assert.equal(friendlyError(coded("failed-precondition"), "Couldn't save."), "Couldn't save.");
    assert.equal(friendlyError(coded("internal")), "Something went wrong. Please try again.");
  });

  it("passes through our own plain-language messages", () => {
    assert.equal(friendlyError(new Error("Choose a file to attach.")), "Choose a file to attach.");
    assert.equal(friendlyError("Add a damage description before sending."), "Add a damage description before sending.");
  });

  it("hides technical messages", () => {
    assert.equal(friendlyError(new Error("FIRESTORE (11.0.0) INTERNAL ASSERTION FAILED"), "Couldn't load."), "Couldn't load.");
    assert.equal(friendlyError(new TypeError("Cannot read properties of undefined (reading 'id')")), "Something went wrong. Please try again.");
    assert.equal(friendlyError(new Error("Function addDoc() called with invalid data { x: undefined }")), "Something went wrong. Please try again.");
    assert.equal(friendlyError(null, "Nope."), "Nope.");
    assert.equal(isHumanMessage("at Object.save (app.js:12:4)"), false);
  });
});

describe("labelFromKey", () => {
  it("turns data keys into column labels", () => {
    assert.equal(labelFromKey("inspectionDate"), "Inspection Date");
    assert.equal(labelFromKey("violation_count"), "Violation Count");
    assert.equal(labelFromKey("occupancyID"), "Occupancy ID");
    assert.equal(labelFromKey("NFPACode"), "NFPA Code");
  });
});
