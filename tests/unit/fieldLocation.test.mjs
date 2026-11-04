// FORGE FIELD: live location helpers.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { locationErrorText, readPosition } from "../../src/field/fieldLocation.js";

describe("live location", () => {
  it("reads position, accuracy and heading only while moving", () => {
    const moving = readPosition({ coords: { latitude: 30.1, longitude: -97.2, accuracy: 8, heading: 90, speed: 3 }, timestamp: 5 });
    assert.deepEqual(moving, { lat: 30.1, lng: -97.2, accuracy: 8, heading: 90, at: 5 });
    const standing = readPosition({ coords: { latitude: 30.1, longitude: -97.2, accuracy: 8, heading: 90, speed: 0 } });
    assert.equal(standing.heading, null);
    const noHeading = readPosition({ coords: { latitude: 1, longitude: 2, accuracy: NaN, heading: null, speed: null } });
    assert.equal(noHeading.heading, null);
    assert.equal(noHeading.accuracy, null);
  });

  it("explains blocked and slow GPS", () => {
    assert.match(locationErrorText({ code: 1 }), /blocked/i);
    assert.match(locationErrorText({ code: 3 }), /GPS/);
    assert.match(locationErrorText({ code: 2 }), /Couldn't/);
  });
});
