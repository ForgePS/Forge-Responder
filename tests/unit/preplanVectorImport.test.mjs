import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyShape,
  detectVectorFormat,
  parseDxfDrawing,
  parsePathData,
  parseSvgDrawing,
  parseTransform,
  shapesToProposals,
  simplifyPath,
} from "../../src/lib/preplans/vectorImport.js";
import { normalizeFloorPlan } from "../../src/lib/preplans/floorPlanModel.js";

const SVG = `<?xml version="1.0"?>
<!DOCTYPE svg>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <script>alert(1)</script>
  <style>.x{fill:red}</style>
  <g id="A-WALL-EXT" transform="translate(100 50)">
    <polyline points="0,0 600,0 600,400 0,400 0,0" />
  </g>
  <g id="walls"><line x1="100" y1="250" x2="700" y2="250" /></g>
  <rect id="room-101" x="120" y="70" width="200" height="150" />
  <g class="doors"><line x1="300" y1="250" x2="340" y2="250"/></g>
  <path d="M 400 300 h 100 v 80 h -100 Z" />
  <text x="150" y="120">Kitchen &amp; <tspan>Prep</tspan></text>
  <image href="data:image/png;base64,AAAA" />
  <a href="javascript:alert(1)"><line x1="0" y1="0" x2="10" y2="10"/></a>
</svg>`;

const DXF = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "2", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "A-WALL", "10", "0", "20", "0", "11", "50", "21", "0",
  "0", "LWPOLYLINE", "8", "A-ROOM", "90", "4", "70", "1", "10", "0", "20", "0", "10", "20", "20", "0", "10", "20", "20", "15", "10", "0", "20", "15",
  "0", "TEXT", "8", "A-ANNO", "10", "5", "20", "5", "1", "STORAGE",
  "0", "INSERT", "8", "0", "2", "BLOCK1",
  "0", "ENDSEC", "0", "EOF",
].join("\n");

describe("SVG import", () => {
  it("reads shapes with group transforms and ignores scripts, styles and pictures", () => {
    const parsed = parseSvgDrawing(SVG);
    const ext = parsed.shapes.find((row) => /A-WALL-EXT/.test(row.hint));
    assert.deepEqual(ext.points[0], [100, 50]);
    assert.deepEqual(ext.points[2], [700, 450]);
    assert.ok(parsed.shapes.every((row) => !/alert/.test(JSON.stringify(row)) || row.kind !== "text"));
    assert.equal(parsed.unsupported.image, 1);
    assert.ok(parsed.warnings.some((w) => /pictures were ignored/.test(w)));
    const text = parsed.shapes.find((row) => row.kind === "text");
    assert.equal(text.text, "Kitchen & Prep");
  });

  it("parses relative path commands and closes subpaths", () => {
    const { subpaths } = parsePathData("M 400 300 h 100 v 80 h -100 Z m 10 10 l 5 0");
    assert.equal(subpaths.length, 2);
    assert.equal(subpaths[0].closed, true);
    assert.deepEqual(subpaths[0].points, [[400, 300], [500, 300], [500, 380], [400, 380]]);
    assert.deepEqual(subpaths[1].points, [[410, 310], [415, 310]]);
  });

  it("composes transforms", () => {
    const { matrix } = parseTransform("translate(10 20) scale(2)");
    assert.deepEqual(matrix, [2, 0, 0, 2, 10, 20]);
    assert.equal(parseTransform("perspective(3)").unknown, true);
  });

  it("refuses files that aren't SVG", () => {
    assert.throws(() => parseSvgDrawing("hello"), /doesn't look like an SVG/);
  });
});

describe("DXF import", () => {
  it("reads lines, closed polylines and text, flips y and reports units and skipped blocks", () => {
    const parsed = parseDxfDrawing(DXF);
    assert.equal(parsed.units, "ft");
    assert.equal(parsed.shapes.length, 3);
    const room = parsed.shapes.find((row) => row.hint === "A-ROOM");
    assert.equal(room.kind, "closed");
    assert.deepEqual(room.points[2], [20, -15]);
    assert.equal(parsed.unsupported.INSERT, 1);
    assert.ok(parsed.warnings.some((w) => /block reference/.test(w)));
  });

  it("refuses binary DXF", () => {
    assert.throws(() => parseDxfDrawing("AutoCAD Binary DXF\r\n..."), /Binary DXF/);
  });
});

describe("classification and proposals", () => {
  it("uses only the file's own names, and falls back to plain lines and areas", () => {
    assert.equal(classifyShape({ kind: "open", points: [[0, 0], [1, 0], [1, 1]], hint: "A-WALL-EXT" }).type, "exterior_wall");
    assert.equal(classifyShape({ kind: "open", points: [[0, 0], [1, 0]], hint: "doors" }).type, "door");
    // A door hint on a 3-point shape doesn't fit a door: stays a line.
    assert.equal(classifyShape({ kind: "open", points: [[0, 0], [1, 0], [2, 0]], hint: "doors" }).type, "line");
    assert.equal(classifyShape({ kind: "closed", points: [[0, 0], [1, 0], [1, 1]], hint: "" }).type, "area");
    assert.equal(classifyShape({ kind: "closed", points: [[0, 0], [1, 0], [1, 1]], hint: "room-101" }).type, "room");
  });

  it("makes pending proposals with unknown confidence that survive normalization", () => {
    const parsed = parseSvgDrawing(SVG);
    const result = shapesToProposals(parsed, { conversionId: "C1", fileId: "F1", format: "svg" });
    assert.ok(result.objects.length >= 6);
    for (const object of result.objects) {
      assert.equal(object.verificationStatus, "pending");
      assert.equal(object.source.kind, "vector_import");
      assert.equal(object.source.confidence, "unknown");
      assert.equal(object.source.jobId, "C1");
    }
    const plan = normalizeFloorPlan({ objects: result.objects });
    assert.equal(plan.objects.length, result.objects.length, "every proposal is a valid floor object");
    assert.equal(result.counts.exterior_wall, 1);
    assert.equal(result.counts.room, 1);
    assert.equal(result.counts.door, 1);
    assert.equal(result.counts.text, 1);
    assert.equal(result.scaleFactor, 1);
  });

  it("scales tiny drawings (DXF in feet) and says so", () => {
    const result = shapesToProposals(parseDxfDrawing(DXF), { conversionId: "C2" });
    assert.ok(result.scaleFactor > 1);
    assert.ok(result.warnings.some((w) => /resized/.test(w)));
  });

  it("respects the include filter and the per-floor object limit", () => {
    const parsed = parseSvgDrawing(SVG);
    const noText = shapesToProposals(parsed, { include: { text: false } });
    assert.equal(noText.counts.text, undefined);
    const full = shapesToProposals(parsed, { existingCount: 2499 });
    assert.equal(full.objects.length, 1);
    assert.ok(full.warnings.some((w) => /can hold/.test(w)));
  });

  it("simplifies only collinear points", () => {
    assert.deepEqual(simplifyPath([[0, 0], [5, 0], [10, 0], [10, 10]]), [[0, 0], [10, 0], [10, 10]]);
  });

  it("keeps every corner of an outline that ends where it starts", () => {
    const square = [[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]];
    assert.deepEqual(simplifyPath(square), square);
    const parsed = parseSvgDrawing(SVG);
    const result = shapesToProposals(parsed, { conversionId: "C3" });
    const ext = result.objects.find((row) => row.type === "exterior_wall");
    assert.equal(ext.geometry.points.length, 5, "closed exterior wall keeps its four corners");
  });

  it("detects formats it can and can't import", () => {
    assert.equal(detectVectorFormat("plan.SVG"), "svg");
    assert.equal(detectVectorFormat("plan.dxf"), "dxf");
    assert.equal(detectVectorFormat("plan.dwg"), "dwg");
    assert.equal(detectVectorFormat("scan.jpg", "image/jpeg"), "raster");
  });
});
