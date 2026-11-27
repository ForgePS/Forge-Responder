import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectLines,
  estimateSkew,
  inkMask,
  otsuThreshold,
  segmentsToProposals,
  suggestWallThickness,
  toGray,
  workingSize,
} from "../../src/lib/preplans/rasterLines.js";
import { normalizeFloorObject } from "../../src/lib/preplans/floorPlanModel.js";

/** Paint thick line segments (in "plan" coordinates, turned by `degrees` about the centre) onto white paper. */
function picture(width, height, lines, { degrees = 0, ink = 20, paper = 250, noise = 0, gradient = 0 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad); const s = Math.sin(rad);
  const cx = width / 2; const cy = height / 2;
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Undo the turn to find the plan point under this pixel.
      const dx = x + 0.5 - cx; const dy = y + 0.5 - cy;
      const px = dx * c + dy * s + cx; const py = -dx * s + dy * c + cy;
      let on = false;
      for (const [x1, y1, x2, y2, t] of lines) {
        const half = t / 2;
        if (px >= Math.min(x1, x2) - half && px <= Math.max(x1, x2) + half && py >= Math.min(y1, y2) - half && py <= Math.max(y1, y2) + half) { on = true; break; }
      }
      let v = on ? ink : paper - gradient * (x / width);
      if (noise) v += (rand() - 0.5) * noise;
      const p = (y * width + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = Math.max(0, Math.min(255, v));
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}

// A simple plan: 600×400 outline (6 px walls), one interior wall (3 px) with a door gap.
const PLAN = [
  [100, 100, 700, 100, 6], [700, 100, 700, 500, 6], [700, 500, 100, 500, 6], [100, 500, 100, 100, 6],
  [400, 100, 400, 260, 3], [400, 320, 400, 500, 3],
];

function near(a, b, tol = 3) { return Math.abs(a - b) <= tol; }
function hasLine(segments, [x1, y1, x2, y2], tol = 4) {
  return segments.some((s) => (near(s.x1, x1, tol) && near(s.y1, y1, tol) && near(s.x2, x2, tol) && near(s.y2, y2, tol))
    || (near(s.x1, x2, tol) && near(s.y1, y2, tol) && near(s.x2, x1, tol) && near(s.y2, y1, tol)));
}

describe("ink", () => {
  it("reads dark lines on paper, and flips light lines on a dark sheet", () => {
    const img = picture(200, 120, [[20, 60, 180, 60, 4]]);
    assert.ok(otsuThreshold(toGray(img)) >= 20 && otsuThreshold(toGray(img)) < 250);
    const normal = inkMask(img);
    assert.equal(normal.inverted, false);
    assert.ok(normal.inkShare > 0.01 && normal.inkShare < 0.05);
    const blueprint = inkMask(picture(200, 120, [[20, 60, 180, 60, 4]], { ink: 240, paper: 30 }));
    assert.equal(blueprint.inverted, true);
    assert.ok(blueprint.inkShare > 0.01 && blueprint.inkShare < 0.05);
  });

  it("finds nothing on a blank page", () => {
    const result = detectLines(picture(300, 200, []));
    assert.equal(result.segments.length, 0);
    assert.match(result.warnings[0], /No lines/);
  });
});

describe("line detection", () => {
  it("finds a level plan's walls, joins the corners, and keeps the door gap", () => {
    const result = detectLines(picture(800, 600, PLAN));
    assert.equal(result.skewDegrees, 0);
    assert.equal(result.segments.length, 6, JSON.stringify(result.segments));
    for (const [x1, y1, x2, y2] of PLAN.slice(0, 4)) assert.ok(hasLine(result.segments, [x1, y1, x2, y2]), `missing ${x1},${y1}→${x2},${y2}`);
    // The interior wall stays two pieces either side of the opening, the top one joined to the outer wall.
    assert.ok(hasLine(result.segments, [400, 100, 400, 260]));
    assert.ok(hasLine(result.segments, [400, 320, 400, 500]));
    const outer = result.segments.filter((s) => s.thickness >= 5);
    assert.equal(outer.length, 4);
    assert.equal(suggestWallThickness(result.segments), 5);
  });

  it("straightens a crooked scan and puts the lines back on the picture", () => {
    const img = picture(800, 600, PLAN, { degrees: 2 });
    const skew = estimateSkew(inkMask(img));
    assert.ok(Math.abs(Math.abs(skew) - 2) <= 0.15, `skew ${skew}`);
    const result = detectLines(img);
    assert.equal(result.segments.length, 6, JSON.stringify(result.segments));
    // The top wall's left corner, turned 2° about the centre (400, 300), lands here in the picture.
    const rad = (2 * Math.PI) / 180;
    const corner = [(100 - 400) * Math.cos(rad) - (100 - 300) * Math.sin(rad) + 400, (100 - 400) * Math.sin(rad) + (100 - 300) * Math.cos(rad) + 300];
    assert.ok(result.segments.some((s) => (near(s.x1, corner[0], 4) && near(s.y1, corner[1], 4)) || (near(s.x2, corner[0], 4) && near(s.y2, corner[1], 4))), JSON.stringify(corner));
  });

  it("copes with uneven light and grain like a phone photo", () => {
    const result = detectLines(picture(800, 600, PLAN, { noise: 30, gradient: 90, paper: 235, ink: 60 }));
    for (const [x1, y1, x2, y2] of PLAN.slice(0, 4)) assert.ok(hasLine(result.segments, [x1, y1, x2, y2], 6), `missing ${x1},${y1}→${x2},${y2}: ${JSON.stringify(result.segments)}`);
    assert.ok(result.segments.length <= 8, `${result.segments.length} lines`);
  });

  it("keeps the two lines of a double-line wall apart", () => {
    const result = detectLines(picture(800, 600, [[100, 200, 700, 200, 2], [100, 208, 700, 208, 2]]));
    assert.equal(result.segments.length, 2, JSON.stringify(result.segments));
    assert.ok(hasLine(result.segments, [100, 200, 700, 200]) && hasLine(result.segments, [100, 208, 700, 208]));
  });

  it("ignores short marks like text, and solid blocks", () => {
    const marks = [];
    for (let i = 0; i < 20; i += 1) marks.push([150 + i * 12, 300, 156 + i * 12, 300, 2], [150 + i * 12, 296, 150 + i * 12, 304, 2]);
    const result = detectLines(picture(800, 600, [...PLAN.slice(0, 4), ...marks, [500, 380, 560, 440, 60]]));
    assert.equal(result.segments.length, 4, JSON.stringify(result.segments));
  });
});

describe("proposals", () => {
  const segments = [
    { x1: 10, y1: 10, x2: 300, y2: 10, thickness: 6, orientation: "horizontal" },
    { x1: 10, y1: 10, x2: 10, y2: 40, thickness: 2, orientation: "vertical" },
  ];

  it("are pending, unknown confidence, plain lines unless the person picks walls for thick lines", () => {
    const plain = segmentsToProposals(segments, { conversionId: "PPC-1", fileId: "F1" });
    assert.deepEqual(plain.objects.map((o) => o.type), ["line", "line"]);
    for (const object of plain.objects) {
      assert.equal(object.verificationStatus, "pending");
      assert.equal(object.source.kind, "smartplan_lines");
      assert.equal(object.source.confidence, "unknown");
      assert.equal(object.source.jobId, "PPC-1");
      assert.ok(normalizeFloorObject(object), "valid floor object");
    }
    const walls = segmentsToProposals(segments, { thickAs: "exterior_wall", wallThickness: 4 });
    assert.deepEqual(walls.objects.map((o) => o.type), ["exterior_wall", "line"]);
    assert.match(walls.objects[0].source.reference, /6 px thick \(thick\)/);
  });

  it("scale back to the original picture and respect the floor's object limit", () => {
    const scaled = segmentsToProposals(segments, { scale: 2 });
    assert.deepEqual(scaled.objects[0].geometry.points, [[20, 20], [600, 20]]);
    const limited = segmentsToProposals(segments, { existingCount: 2499 });
    assert.equal(limited.objects.length, 1);
    assert.equal(limited.objects[0].geometry.points[1][0], 300, "keeps the longest");
    assert.match(limited.warnings[0], /left out/);
    assert.deepEqual(workingSize(4800, 1200), { width: 2400, height: 600, backToOriginal: 2 });
    assert.deepEqual(workingSize(800, 600), { width: 800, height: 600, backToOriginal: 1 });
  });
});
