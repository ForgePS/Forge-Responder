import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildResponseMap, NEARBY_HYDRANT_METERS } from "../../src/lib/preplans/responseMapModel.js";
import { fitTransform } from "../../src/lib/preplans/georeference.js";
import { normalizeSiteMap, setFloorAlignment, verifyFloorAlignment } from "../../src/lib/preplans/siteMapModel.js";

const BASE = { lat: 32.3, lng: -90.18 };
const controlPoints = [{ floor: [0, 0], geo: [32.3, -90.18] }, { floor: [100, 0], geo: [32.3, -90.1795] }];
const plan = {
  floorId: "F1",
  objects: [
    { id: "w1", type: "exterior_wall", geometry: { kind: "polyline", points: [[0, 0], [100, 0], [100, 50]] } },
    { id: "room", type: "room", name: "Kitchen", geometry: { kind: "rect", points: [[10, 10], [40, 40]] } },
    { id: "fdc", type: "symbol", symbolId: "fdc", geometry: { kind: "point", points: [[5, 5]] } },
  ],
};

function siteMapWith({ verified = true } = {}) {
  let map = normalizeSiteMap({
    preplanId: "P", revisionId: "R",
    features: [
      { id: "fp", kind: "footprint", label: "Main building", points: [BASE, { lat: 32.3002, lng: -90.18 }, { lat: 32.3002, lng: -90.1797 }] },
      { id: "st", kind: "staging", label: "Engine staging", points: [{ lat: 32.2995, lng: -90.1802 }] },
    ],
  });
  const fit = fitTransform(controlPoints, "similarity");
  map = setFloorAlignment(map, "F1", fit, controlPoints, "planner");
  return verified ? verifyFloorAlignment(map, "F1", "captain") : map;
}

const plansByFloor = new Map([["F1", plan]]);

describe("response map", () => {
  it("shows the published site features with their labels", () => {
    const model = buildResponseMap({ siteMap: siteMapWith(), plansByFloor, floorId: "F1" });
    assert.deepEqual(model.features.map((row) => [row.kind, row.label]), [["footprint", "Main building"], ["staging", "Engine staging"]]);
    assert.equal(model.hasContent, true);
  });

  it("overlays the chosen floor only when its alignment was confirmed", () => {
    const confirmed = buildResponseMap({ siteMap: siteMapWith(), plansByFloor, floorId: "F1" });
    assert.equal(confirmed.floorShapes.length, 3);
    assert.deepEqual(confirmed.alignedFloorIds, ["F1"]);

    const unconfirmed = buildResponseMap({ siteMap: siteMapWith({ verified: false }), plansByFloor, floorId: "F1" });
    assert.equal(unconfirmed.floorShapes.length, 0);
    assert.deepEqual(unconfirmed.alignedFloorIds, []);
    assert.deepEqual(unconfirmed.unconfirmedFloorIds, ["F1"]);

    // A floor that isn't selected isn't drawn.
    assert.equal(buildResponseMap({ siteMap: siteMapWith(), plansByFloor, floorId: "F2" }).floorShapes.length, 0);
  });

  it("pins alerts placed on an object of the shown floor", () => {
    const alerts = [
      { id: "a1", floorId: "F1", objectId: "room", description: "Hood out of service", verificationStatus: "verified" },
      { id: "a2", floorId: "F1", objectId: "missing", description: "x" },
      { id: "a3", floorId: "", objectId: "", description: "Whole site" },
    ];
    const model = buildResponseMap({ siteMap: siteMapWith(), plansByFloor, floorId: "F1", alerts });
    assert.deepEqual(model.alertPins.map((row) => row.id), ["a1"]);
    const [lat, lng] = model.alertPins[0].at;
    assert.ok(Math.abs(lat - 32.3) < 0.001 && Math.abs(lng + 90.18) < 0.001);
  });

  it("shows linked hydrants anywhere and others only near the site", () => {
    const hydrants = [
      { id: "H1", hydrant_id: "H-1", lat: 32.31, lng: -90.18, status: "In Service" }, // ~1.1 km, linked
      { id: "H2", hydrant_id: "H-2", lat: 32.3005, lng: -90.18, status: "Out of service", flow_gpm: 900 }, // ~55 m
      { id: "H3", hydrant_id: "H-3", lat: 32.32, lng: -90.18 }, // ~2 km, not linked
      { id: "H4", lat: 0, lng: 0 }, // no location
    ];
    const model = buildResponseMap({ siteMap: siteMapWith(), preplan: { hydrantIds: ["H1"] }, plansByFloor, hydrants });
    assert.deepEqual(model.hydrants.map((row) => row.id), ["H1", "H2"]);
    assert.equal(model.hydrants[0].linked, true);
    assert.equal(model.hydrants[1].outOfService, true);
    assert.ok(model.hydrants[1].meters < NEARBY_HYDRANT_METERS);
  });

  it("invents nothing: no site map, no location and no hydrants means no map", () => {
    const empty = buildResponseMap({ siteMap: null, preplan: { latitude: 0, longitude: 0 }, hydrants: [{ id: "H", lat: 32.3, lng: -90.18 }] });
    assert.equal(empty.hasContent, false);
    assert.equal(empty.site, null);

    const located = buildResponseMap({ siteMap: null, preplan: { latitude: 32.3, longitude: -90.18 } });
    assert.deepEqual(located.site, [32.3, -90.18]);
    assert.equal(located.hasContent, true);
    assert.deepEqual(located.features, []);
  });
});
