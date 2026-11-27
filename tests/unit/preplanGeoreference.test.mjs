// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAlignmentRecord,
  describeAlignmentQuality,
  fitTransform,
  floorToGeo,
  fromLocalMeters,
  geoToFloor,
  toLocalMeters,
} from "../../src/lib/preplans/georeference.js";

const ORIGIN = [34.9554, -90.0218];

/** Build control points from a known transform: 0.1 m per pixel, rotated 30°, offset 50 m east. */
function syntheticPoints(floorPoints, { metersPerPixel = 0.1, degrees = 30, east = 50, north = 20 } = {}) {
  const rad = (degrees * Math.PI) / 180;
  return floorPoints.map(([x, y]) => {
    const yUp = -y;
    const e = metersPerPixel * (x * Math.cos(rad) - yUp * Math.sin(rad)) + east;
    const n = metersPerPixel * (x * Math.sin(rad) + yUp * Math.cos(rad)) + north;
    return { floor: [x, y], geo: fromLocalMeters([e, n], ORIGIN) };
  });
}

describe("local meter grid", () => {
  it("round-trips lat/lng", () => {
    const point = [34.9561, -90.0201];
    const back = fromLocalMeters(toLocalMeters(point, ORIGIN), ORIGIN);
    assert.ok(Math.abs(back[0] - point[0]) < 1e-9);
    assert.ok(Math.abs(back[1] - point[1]) < 1e-9);
  });
});

describe("fitTransform", () => {
  const floor = [[0, 0], [400, 0], [400, 300], [0, 300]];

  it("recovers a similarity transform from 4 points", () => {
    const fit = fitTransform(syntheticPoints(floor), "similarity");
    assert.ok(fit.rmsErrorMeters < 0.01, `rms ${fit.rmsErrorMeters}`);
    assert.ok(Math.abs(fit.metersPerPixel - 0.1) < 1e-6);
    assert.ok(Math.abs(fit.rotationDegrees - 30) < 0.01);
    assert.equal(fit.errorMeaningful, true);
  });

  it("recovers an affine transform and maps both ways", () => {
    const fit = fitTransform(syntheticPoints(floor, { degrees: -15 }), "affine");
    const geo = floorToGeo(fit.transform, [200, 150]);
    const back = geoToFloor(fit.transform, geo);
    assert.ok(Math.abs(back[0] - 200) < 1e-6 && Math.abs(back[1] - 150) < 1e-6);
  });

  it("reports a misplaced control point as a large error", () => {
    const points = syntheticPoints(floor);
    points[2] = { ...points[2], geo: fromLocalMeters([500, 500], ORIGIN) };
    const fit = fitTransform(points, "similarity");
    assert.equal(describeAlignmentQuality(fit).level, "poor");
  });

  it("says the error is unknown with the minimum number of points", () => {
    const fit = fitTransform(syntheticPoints(floor.slice(0, 2)), "similarity");
    assert.equal(fit.errorMeaningful, false);
    assert.equal(describeAlignmentQuality(fit).level, "unknown");
  });

  it("refuses too few, coincident or collinear points", () => {
    assert.throws(() => fitTransform(syntheticPoints([[0, 0]]), "similarity"), /at least 2/);
    assert.throws(() => fitTransform(syntheticPoints([[0, 0], [100, 0]]), "affine"), /at least 3/);
    assert.throws(() => fitTransform(syntheticPoints([[0, 0], [100, 0], [200, 0]]), "affine"), /straight line/);
    const same = syntheticPoints([[5, 5], [5, 5]]);
    assert.throws(() => fitTransform(same, "similarity"), /same spot/);
  });

  it("stores alignments as unverified", () => {
    const points = syntheticPoints(floor);
    const record = buildAlignmentRecord(fitTransform(points), points, "u1");
    assert.equal(record.status, "unverified");
    assert.equal(record.verifiedBy, "");
    assert.equal(record.controlPoints.length, 4);
  });
});
