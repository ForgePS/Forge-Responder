/**
 * SmartPlan line detection for scans and photos of floor plans. Deterministic,
 * runs in the browser, sends nothing anywhere. Pure functions over an
 * ImageData-like `{width, height, data}` (RGBA bytes), so tests run in Node.
 *
 * What it finds: straight horizontal and vertical strokes (after straightening
 * a slightly crooked scan), joined at corners. That's most of a floor plan's
 * walls. What it doesn't: diagonal or curved lines, door swings, text, symbols
 * or rooms. Those stay for a person to trace.
 *
 * Every result is a proposal (verificationStatus "pending", confidence
 * "unknown"). A stroke becomes a wall only when the person chooses that for
 * thick lines; otherwise it's a plain line. Nothing is added that isn't in the
 * picture.
 */
import { MAX_OBJECTS_PER_FLOOR } from "./floorPlanModel.js";

export const RASTER_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const MAX_RASTER_BYTES = 25 * 1024 * 1024;
/** Longest side the detector works at; bigger pictures are scaled down first. */
export const MAX_DETECT_SIDE = 2400;
const MAX_SKEW_DEGREES = 5;

// ---------------------------------------------------------------- ink

/** Luminance 0–255 per pixel; transparent pixels count as white paper. */
export function toGray(image) {
  const { width, height, data } = image;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    const a = data[p + 3];
    const lum = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    gray[i] = a < 128 ? 255 : Math.round(lum);
  }
  return gray;
}

/** Otsu's global threshold. */
export function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0; let weightB = 0; let best = 0; let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    weightB += hist[t];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/**
 * Ink mask (1 = line). Uses a local-contrast threshold so a phone photo with
 * uneven light still works: a pixel is ink when it's darker than its
 * neighbourhood by `contrast` (0.05–0.4). Light lines on a dark sheet
 * (blueprints) are flipped first.
 */
export function inkMask(image, options = {}) {
  const { width, height } = image;
  let gray = toGray(image);
  const otsu = otsuThreshold(gray);
  let dark = 0;
  for (let i = 0; i < gray.length; i += 1) if (gray[i] <= otsu) dark += 1;
  const inverted = dark / gray.length > 0.5;
  if (inverted) gray = gray.map((v) => 255 - v);
  const contrast = Math.max(0.05, Math.min(Number(options.contrast) || 0.18, 0.4));
  // Summed-area table for the neighbourhood means.
  const w1 = width + 1;
  const integral = new Float64Array(w1 * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += gray[y * width + x];
      integral[(y + 1) * w1 + x + 1] = integral[y * w1 + x + 1] + row;
    }
  }
  const half = Math.max(4, Math.round(Math.max(width, height) / 32));
  const mask = new Uint8Array(width * height);
  let ink = 0;
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - half); const y1 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - half); const x1 = Math.min(width, x + half + 1);
      const area = (x1 - x0) * (y1 - y0);
      const total = integral[y1 * w1 + x1] - integral[y0 * w1 + x1] - integral[y1 * w1 + x0] + integral[y0 * w1 + x0];
      const v = gray[y * width + x];
      // Darker than the neighbourhood, and not paper-white in absolute terms.
      if (v * area < total * (1 - contrast) && v < 235) { mask[y * width + x] = 1; ink += 1; }
    }
  }
  return { mask, width, height, inverted, inkShare: ink / mask.length, threshold: otsu };
}

// ---------------------------------------------------------------- straighten

function skewScore(xs, ys, degrees, span) {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad); const s = Math.sin(rad);
  const rows = new Int32Array(span * 2 + 1);
  const cols = new Int32Array(span * 2 + 1);
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i]; const y = ys[i];
    rows[Math.round(-x * s + y * c) + span] += 1;
    cols[Math.round(x * c + y * s) + span] += 1;
  }
  let score = 0;
  for (let i = 0; i < rows.length; i += 1) score += rows[i] * rows[i] + cols[i] * cols[i];
  return score;
}

/**
 * How far the drawing's lines are turned from level, in degrees (within ±5):
 * the angle at which ink lines up into the sharpest rows and columns.
 */
export function estimateSkew(maskInfo, options = {}) {
  const { mask, width, height } = maskInfo;
  const limit = Math.max(0, Math.min(Number(options.maxDegrees ?? MAX_SKEW_DEGREES), 10));
  const count = mask.reduce((n, v) => n + v, 0);
  if (count < 50 || !limit) return 0;
  const stride = Math.max(1, Math.floor(count / 60000));
  const xs = []; const ys = [];
  let seen = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    if (seen % stride === 0) { xs.push(i % width); ys.push(Math.floor(i / width)); }
    seen += 1;
  }
  const span = width + height;
  let best = 0; let bestScore = skewScore(xs, ys, 0, span);
  for (let d = -limit; d <= limit + 1e-9; d += 0.25) {
    const score = skewScore(xs, ys, d, span);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  const coarse = best;
  for (let d = coarse - 0.25; d <= coarse + 0.25 + 1e-9; d += 0.05) {
    const score = skewScore(xs, ys, d, span);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return Math.abs(best) < 0.15 ? 0 : Math.round(best * 100) / 100;
}

/**
 * Turn the mask by -degrees so the lines run level. Returns the new mask and a
 * function that maps a point in it back to the original picture.
 */
export function rotateMask(maskInfo, degrees) {
  const { mask, width, height } = maskInfo;
  if (!degrees) return { mask, width, height, toSource: (x, y) => [x, y] };
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad); const s = Math.sin(rad);
  // Forward (source → straightened): xr = x c + y s, yr = -x s + y c.
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => [x * c + y * s, -x * s + y * c]);
  const ox = Math.floor(Math.min(...corners.map((p) => p[0])));
  const oy = Math.floor(Math.min(...corners.map((p) => p[1])));
  const w = Math.ceil(Math.max(...corners.map((p) => p[0]))) - ox;
  const h = Math.ceil(Math.max(...corners.map((p) => p[1]))) - oy;
  const out = new Uint8Array(w * h);
  const toSource = (xr, yr) => {
    const X = xr + ox; const Y = yr + oy;
    return [X * c - Y * s, X * s + Y * c];
  };
  for (let yr = 0; yr < h; yr += 1) {
    for (let xr = 0; xr < w; xr += 1) {
      const [sx, sy] = toSource(xr + 0.5, yr + 0.5);
      const ix = Math.floor(sx); const iy = Math.floor(sy);
      if (ix >= 0 && iy >= 0 && ix < width && iy < height && mask[iy * width + ix]) out[yr * w + xr] = 1;
    }
  }
  return { mask: out, width: w, height: h, toSource };
}

// ---------------------------------------------------------------- strokes

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Horizontal strokes: runs of ink along each row (small breaks bridged),
 * stacked across neighbouring rows. Returns {a, b, at, thickness} with a..b
 * along the row and `at` the stroke's centre row.
 */
function horizontalStrokes(mask, width, height, { minLength, maxGap, maxThickness }) {
  const done = [];
  let open = [];
  for (let y = 0; y <= height; y += 1) {
    const runs = [];
    if (y < height) {
      const row = y * width;
      let x = 0;
      while (x < width) {
        if (!mask[row + x]) { x += 1; continue; }
        const start = x;
        let end = x;
        let gap = 0;
        x += 1;
        while (x < width) {
          if (mask[row + x]) { end = x; gap = 0; } else if (++gap > maxGap) break;
          x += 1;
        }
        if (end - start + 1 >= minLength) runs.push([start, end]);
        x = end + 1;
      }
    }
    const next = [];
    const used = new Set();
    for (const stroke of open) {
      let match = -1; let bestOverlap = 0;
      for (let i = 0; i < runs.length; i += 1) {
        if (used.has(i)) continue;
        const [a, b] = runs[i];
        const overlap = Math.min(b, stroke.lastB) - Math.max(a, stroke.lastA);
        const needed = 0.6 * Math.min(b - a, stroke.lastB - stroke.lastA);
        if (overlap >= needed && overlap > bestOverlap) { bestOverlap = overlap; match = i; }
      }
      if (match < 0) { done.push(stroke); continue; }
      used.add(match);
      const [a, b] = runs[match];
      stroke.starts.push(a); stroke.ends.push(b);
      stroke.lastA = a; stroke.lastB = b; stroke.y1 = y;
      next.push(stroke);
    }
    runs.forEach(([a, b], i) => {
      if (!used.has(i)) next.push({ starts: [a], ends: [b], lastA: a, lastB: b, y0: y, y1: y });
    });
    open = next;
  }
  const out = [];
  for (const stroke of done) {
    const thickness = stroke.y1 - stroke.y0 + 1;
    const a = median(stroke.starts); const b = median(stroke.ends);
    const length = b - a + 1;
    if (length < minLength || thickness > maxThickness || length < thickness * 4) continue;
    out.push({ a, b: b + 1, at: (stroke.y0 + stroke.y1 + 1) / 2, thickness });
  }
  return out;
}

function transpose(mask, width, height) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) out[x * height + y] = mask[y * width + x];
  return out;
}

/** Join pieces of one line that a faint or slightly crooked scan broke up. */
function mergeCollinear(strokes, maxGap) {
  const sorted = [...strokes].sort((p, q) => p.at - q.at || p.a - q.a);
  const out = [];
  for (const stroke of sorted) {
    // Touching bands: a sliver along a line's edge (left by straightening) or the next piece of the same line.
    // Two separate thin lines a few pixels apart (a double-line wall) don't touch, so they stay apart.
    const near = out.find((row) => Math.abs(row.at - stroke.at) <= (row.thickness + stroke.thickness) / 2 + 0.5
      && stroke.a <= row.b + maxGap && stroke.b >= row.a - maxGap);
    if (!near) { out.push({ ...stroke }); continue; }
    const lenA = near.b - near.a; const lenB = stroke.b - stroke.a;
    near.at = (near.at * lenA + stroke.at * lenB) / (lenA + lenB);
    near.a = Math.min(near.a, stroke.a);
    near.b = Math.max(near.b, stroke.b);
    const top = Math.min(near.at - near.thickness / 2, stroke.at - stroke.thickness / 2);
    const bottom = Math.max(near.at + near.thickness / 2, stroke.at + stroke.thickness / 2);
    near.thickness = Math.max(near.thickness, stroke.thickness, Math.min(bottom - top, near.thickness + 1));
  }
  return out;
}

/**
 * Corners and tees: pull a line's end onto the centre of the line it meets,
 * so walls join instead of stopping short or poking past.
 */
function snapEnds(horizontal, vertical, extra) {
  for (const h of horizontal) {
    for (const end of ["a", "b"]) {
      for (const v of vertical) {
        const tol = v.thickness / 2 + h.thickness / 2 + extra;
        if (Math.abs(h[end] - v.at) > tol) continue;
        if (h.at < v.a - tol || h.at > v.b + tol) continue;
        h[end] = v.at;
        if (h.at < v.a) v.a = h.at;
        if (h.at > v.b) v.b = h.at;
        break;
      }
    }
  }
  for (const v of vertical) {
    for (const end of ["a", "b"]) {
      for (const h of horizontal) {
        const tol = h.thickness / 2 + v.thickness / 2 + extra;
        if (Math.abs(v[end] - h.at) > tol) continue;
        if (v.at < h.a - tol || v.at > h.b + tol) continue;
        v[end] = h.at;
        break;
      }
    }
  }
}

/**
 * Find straight lines in a picture of a floor plan.
 *
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} image
 * @param {{contrast?:number, minLength?:number, straighten?:boolean}} options
 *   minLength in the image's pixels (default 3% of the longest side, at least 12)
 * @returns {{segments:{x1:number,y1:number,x2:number,y2:number,thickness:number,orientation:"horizontal"|"vertical"}[],
 *   skewDegrees:number, inverted:boolean, inkShare:number, warnings:string[], notes:string[], width:number, height:number}}
 */
export function detectLines(image, options = {}) {
  const warnings = [];
  const ink = inkMask(image, options);
  const longest = Math.max(image.width, image.height);
  if (ink.inkShare < 0.0005) {
    return { segments: [], skewDegrees: 0, inverted: ink.inverted, inkShare: ink.inkShare, warnings: ["No lines stand out from the background in this picture."], notes: [], width: image.width, height: image.height };
  }
  if (ink.inkShare > 0.35) warnings.push("Much of this picture reads as dark ink (shading, a photo of a screen, or a busy background), so expect extra lines to reject.");
  if (ink.inverted) warnings.push("The picture looks like light lines on a dark sheet; it was read that way.");
  const skewDegrees = options.straighten === false ? 0 : estimateSkew(ink);
  const turned = rotateMask(ink, skewDegrees);
  const minLength = Math.max(12, Math.round(Number(options.minLength) || longest * 0.03));
  const maxGap = Math.max(1, Math.round(longest / 800));
  const maxThickness = Math.max(6, Math.round(longest / 60));
  const settings = { minLength, maxGap, maxThickness };

  const horizontal = mergeCollinear(horizontalStrokes(turned.mask, turned.width, turned.height, settings), maxGap * 3);
  const vertical = mergeCollinear(horizontalStrokes(transpose(turned.mask, turned.width, turned.height), turned.height, turned.width, settings), maxGap * 3);
  snapEnds(horizontal, vertical, Math.max(3, maxGap * 2));

  const round1 = (v) => Math.round(v * 10) / 10;
  const toImage = (x, y) => turned.toSource(x, y).map(round1);
  const segments = [];
  for (const h of horizontal) {
    const [x1, y1] = toImage(h.a, h.at); const [x2, y2] = toImage(h.b, h.at);
    segments.push({ x1, y1, x2, y2, thickness: h.thickness, orientation: "horizontal" });
  }
  for (const v of vertical) {
    const [x1, y1] = toImage(v.at, v.a); const [x2, y2] = toImage(v.at, v.b);
    segments.push({ x1, y1, x2, y2, thickness: v.thickness, orientation: "vertical" });
  }
  const notes = skewDegrees ? [`The picture is turned about ${Math.abs(skewDegrees)}°; lines were found along its own angle.`] : [];
  return { segments, skewDegrees, inverted: ink.inverted, inkShare: ink.inkShare, warnings, notes, width: image.width, height: image.height, minLength };
}

/** Suggested "thick line" cutoff: clearly heavier than the typical line in this picture. */
export function suggestWallThickness(segments = []) {
  if (!segments.length) return 3;
  // The thinner quarter of the lines is the drawing's ordinary line weight.
  const sorted = segments.map((row) => row.thickness).sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 4)];
  const cutoff = Math.max(3, Math.round(typical * 1.75));
  return segments.some((row) => row.thickness >= cutoff) ? cutoff : Math.max(3, typical + 1);
}

/**
 * Detected segments → pending floor plan objects, in the picture's own pixel
 * coordinates (so they sit exactly over it when it's the floor's source drawing).
 *
 * @param {object[]} segments  from detectLines
 * @param {{scale?:number, conversionId?:string, fileId?:string, thickAs?:"line"|"interior_wall"|"exterior_wall",
 *   wallThickness?:number, existingCount?:number, actorUid?:string, skewDegrees?:number}} options
 *   scale: multiply coordinates (and thickness) by this to reach the original picture's pixels
 */
export function segmentsToProposals(segments = [], options = {}) {
  const scale = Number(options.scale) > 0 ? Number(options.scale) : 1;
  const thickAs = ["interior_wall", "exterior_wall"].includes(options.thickAs) ? options.thickAs : "line";
  const cutoff = Number(options.wallThickness) || 3;
  const room = Math.max(0, MAX_OBJECTS_PER_FLOOR - (Number(options.existingCount) || 0));
  const stamp = new Date().toISOString();
  const r = (v) => Math.round(v * scale * 10) / 10;
  const ranked = segments
    .map((row, index) => ({ ...row, index, length: Math.hypot(row.x2 - row.x1, row.y2 - row.y1) }))
    .sort((p, q) => q.length - p.length);
  const kept = ranked.slice(0, room);
  const objects = [];
  const counts = {};
  for (const row of kept) {
    const thicknessPx = Math.round(row.thickness * scale * 10) / 10;
    const thick = row.thickness * scale >= cutoff;
    const type = thick ? thickAs : "line";
    objects.push({
      id: `sl-${options.conversionId || "x"}-${objects.length}`.slice(0, 80),
      type,
      name: "",
      geometry: { kind: "polyline", points: [[r(row.x1), r(row.y1)], [r(row.x2), r(row.y2)]] },
      verificationStatus: "pending",
      source: {
        kind: "smartplan_lines",
        uploadId: options.fileId || "",
        jobId: options.conversionId || "",
        reference: `${row.orientation} line, ${thicknessPx} px thick${thick ? " (thick)" : ""}${options.skewDegrees ? `, picture turned ${options.skewDegrees}°` : ""}`.slice(0, 200),
        confidence: "unknown",
      },
      createdAt: stamp,
      createdBy: options.actorUid || "",
      updatedAt: stamp,
    });
    counts[type] = (counts[type] || 0) + 1;
  }
  const warnings = [];
  if (ranked.length > kept.length) warnings.push(`This floor can hold ${MAX_OBJECTS_PER_FLOOR.toLocaleString()} objects; the ${ranked.length - kept.length} shortest lines were left out.`);
  return { objects, counts, skipped: ranked.length - kept.length, warnings };
}

/** Scale to fit MAX_DETECT_SIDE: returns the working size and the factor back to the original. */
export function workingSize(width, height, maxSide = MAX_DETECT_SIDE) {
  const longest = Math.max(width, height);
  const factor = longest > maxSide ? maxSide / longest : 1;
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)), backToOriginal: 1 / factor };
}
