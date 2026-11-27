import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addSiteFeature,
  basemapById,
  controlPointsOf,
  distanceMeters,
  normalizeSiteMap,
  polygonAreaSqMeters,
  projectFloorPlan,
  removeSiteFeature,
  setFloorAlignment,
  siteMapPublicationProblems,
  siteMapToStorage,
  updateSiteFeature,
  verifyFloorAlignment,
} from "../../src/lib/preplans/siteMapModel.js";
import { fitTransform } from "../../src/lib/preplans/georeference.js";

function hasNestedArray(value) {
  if (Array.isArray(value)) return value.some((item) => Array.isArray(item) || hasNestedArray(item));
  if (value && typeof value === "object") return Object.values(value).some(hasNestedArray);
  return false;
}

const BASE = { lat: 32.3, lng: -90.18 };

describe("site map model", () => {
  it("normalizes features and drops ones that can't be drawn", () => {
    const map = normalizeSiteMap({
      preplanId: "P", revisionId: "R",
      features: [
        { id: "a", kind: "footprint", points: [BASE, { lat: 32.3001, lng: -90.18 }, { lat: 32.3001, lng: -90.1799 }] },
        { id: "b", kind: "footprint", points: [BASE] },
        { id: "c", kind: "bogus", points: [BASE] },
        { id: "d", kind: "staging", points: [[32.3, -90.18], [1, 1]] },
        { id: "e", kind: "note", points: [{ lat: 200, lng: 0 }] },
      ],
    });
    assert.deepEqual(map.features.map((row) => row.id), ["a", "d"]);
    assert.equal(map.features[1].points.length, 1);
    assert.equal(map.basemap, "imagery");
    assert.equal(basemapById("nope").id, "imagery");
  });

  it("adds, edits and removes features", () => {
    let map = normalizeSiteMap({ preplanId: "P", revisionId: "R" });
    map = addSiteFeature(map, { kind: "access", points: [BASE, { lat: 32.301, lng: -90.18 }] }, "u1");
    const id = map.features[0].id;
    map = updateSiteFeature(map, id, { label: "North gate" });
    assert.equal(map.features[0].label, "North gate");
    assert.equal(map.features[0].createdBy, "u1");
    assert.throws(() => addSiteFeature(map, { kind: "boundary", points: [BASE] }), /more points/);
    assert.equal(removeSiteFeature(map, id).features.length, 0);
  });

  it("measures distance and area", () => {
    const d = distanceMeters(BASE, { lat: 32.301, lng: -90.18 });
    assert.ok(Math.abs(d - 111.2) < 1, `about 111 m, got ${d}`);
    const area = polygonAreaSqMeters([BASE, { lat: 32.3, lng: -90.1795 }, { lat: 32.3005, lng: -90.1795 }, { lat: 32.3005, lng: -90.18 }]);
    assert.ok(area > 2500 && area < 2800, `about 2,600 m², got ${area}`);
  });

  it("stores alignments without nested arrays and reads them back", () => {
    const controlPoints = [
      { floor: [0, 0], geo: [32.3, -90.18] },
      { floor: [100, 0], geo: [32.3, -90.1795] },
      { floor: [0, 100], geo: [32.2995, -90.18] },
    ];
    const fit = fitTransform(controlPoints, "affine");
    let map = normalizeSiteMap({ preplanId: "P", revisionId: "R" });
    map = setFloorAlignment(map, "F1", fit, controlPoints, "u1");
    assert.equal(map.alignments.F1.status, "unverified");
    const stored = siteMapToStorage(map);
    assert.equal(hasNestedArray(stored), false);
    const reloaded = normalizeSiteMap(JSON.parse(JSON.stringify(stored)));
    assert.deepEqual(controlPointsOf(reloaded.alignments.F1), controlPoints);
  });

  it("blocks publishing until a person confirms each alignment", () => {
    const fit = fitTransform([{ floor: [0, 0], geo: [32.3, -90.18] }, { floor: [100, 0], geo: [32.3, -90.1795] }], "similarity");
    let map = setFloorAlignment(normalizeSiteMap({}), "F1", fit, [{ floor: [0, 0], geo: [32.3, -90.18] }, { floor: [100, 0], geo: [32.3, -90.1795] }]);
    assert.equal(siteMapPublicationProblems(map).length, 1);
    map = verifyFloorAlignment(map, "F1", "u2");
    assert.equal(map.alignments.F1.verifiedBy, "u2");
    assert.deepEqual(siteMapPublicationProblems(map), []);
    assert.deepEqual(siteMapPublicationProblems(null), []);
  });

  it("projects floor plan shapes onto the map and skips rejected ones", () => {
    const fit = fitTransform([{ floor: [0, 0], geo: [32.3, -90.18] }, { floor: [100, 0], geo: [32.3, -90.1795] }], "similarity");
    const plan = {
      objects: [
        { id: "w", type: "exterior_wall", geometry: { kind: "polyline", points: [[0, 0], [100, 0]] } },
        { id: "c", type: "column", geometry: { kind: "rect", points: [[10, 10], [20, 20]] } },
        { id: "s", type: "symbol", symbolId: "fdc", name: "FDC", geometry: { kind: "point", points: [[50, 0]] } },
        { id: "r", type: "line", verificationStatus: "rejected", geometry: { kind: "polyline", points: [[0, 0], [1, 1]] } },
      ],
    };
    const shapes = projectFloorPlan(plan, { transform: fit.transform });
    assert.deepEqual(shapes.map((row) => row.id), ["w", "c", "s"]);
    assert.equal(shapes[1].latLngs.length, 4);
    assert.ok(Math.abs(shapes[0].latLngs[1][1] - -90.1795) < 1e-7);
    assert.equal(shapes[2].kind, "point");
  });
});
