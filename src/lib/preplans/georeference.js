/**
 * Floor plan ↔ map alignment (pure math, no Leaflet).
 *
 * Floor plans use floor-local coordinates (x right, y down, in source pixels).
 * Alignment maps them to geographic lat/lng through a local east/north meter
 * grid centred on the first control point, so the transform is linear and
 * distances are honest at building scale.
 *
 * Transforms:
 *  - similarity (2+ points): translation, rotation, uniform scale
 *  - affine (3+ points): also handles shear / non-uniform scale (skewed scans)
 * Perspective-distorted photos are corrected before alignment (not here).
 *
 * An alignment is never survey-grade: `status` stays "unverified" until a
 * person confirms it, and the RMS error is stored with it.
 */

const EARTH_RADIUS_M = 6_378_137;
const DEG = Math.PI / 180;

export const ALIGNMENT_STATUSES = Object.freeze(["none", "unverified", "verified"]);
export const MIN_POINTS = Object.freeze({ similarity: 2, affine: 3 });

/** lat/lng → meters east/north of an origin (equirectangular; fine within a few km). */
export function toLocalMeters([lat, lng], [originLat, originLng]) {
  const east = (lng - originLng) * DEG * EARTH_RADIUS_M * Math.cos(originLat * DEG);
  const north = (lat - originLat) * DEG * EARTH_RADIUS_M;
  return [east, north];
}

export function fromLocalMeters([east, north], [originLat, originLng]) {
  const lat = originLat + (north / EARTH_RADIUS_M) / DEG;
  const lng = originLng + (east / (EARTH_RADIUS_M * Math.cos(originLat * DEG))) / DEG;
  return [lat, lng];
}

/** Solve a 3x3 linear system (Gaussian elimination with partial pivoting). */
function solve3(matrix, vector) {
  const m = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < 4; k += 1) m[row][k] -= factor * m[col][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/**
 * Least-squares fit of floor (x, y) → local meters (east, north).
 * Floor y points down, so it is negated before fitting (north is up).
 * @param {{floor:[number,number], geo:[number,number]}[]} controlPoints
 * @param {"similarity"|"affine"} kind
 */
export function fitTransform(controlPoints = [], kind = "similarity") {
  const points = controlPoints.filter((row) => (
    Array.isArray(row?.floor) && Array.isArray(row?.geo)
    && [...row.floor, ...row.geo].every((value) => Number.isFinite(Number(value)))
  ));
  const needed = MIN_POINTS[kind];
  if (!needed) throw new Error(`Unknown alignment type "${kind}".`);
  if (points.length < needed) {
    throw new Error(`${kind === "affine" ? "Affine" : "Similarity"} alignment needs at least ${needed} control points.`);
  }
  const origin = points[0].geo.map(Number);
  const pairs = points.map((row) => ({
    x: Number(row.floor[0]),
    y: -Number(row.floor[1]),
    ...(([e, n]) => ({ e, n }))(toLocalMeters(row.geo.map(Number), origin)),
  }));

  let params;
  if (kind === "similarity") {
    // e = a*x - b*y + tx ; n = b*x + a*y + ty  (closed-form least squares)
    const count = pairs.length;
    const mx = pairs.reduce((s, p) => s + p.x, 0) / count;
    const my = pairs.reduce((s, p) => s + p.y, 0) / count;
    const me = pairs.reduce((s, p) => s + p.e, 0) / count;
    const mn = pairs.reduce((s, p) => s + p.n, 0) / count;
    let sxx = 0; let sab = 0; let sba = 0;
    for (const p of pairs) {
      const x = p.x - mx; const y = p.y - my; const e = p.e - me; const n = p.n - mn;
      sxx += x * x + y * y;
      sab += x * e + y * n;
      sba += x * n - y * e;
    }
    if (sxx < 1e-9) throw new Error("Control points on the floor plan are all in the same spot.");
    const a = sab / sxx;
    const b = sba / sxx;
    params = { a, b: -b, c: me - a * mx + b * my, d: b, e: a, f: mn - b * mx - a * my };
  } else {
    // e = a*x + b*y + c ; n = d*x + e*y + f  (normal equations)
    const ata = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const ate = [0, 0, 0];
    const atn = [0, 0, 0];
    for (const p of pairs) {
      const row = [p.x, p.y, 1];
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) ata[i][j] += row[i] * row[j];
        ate[i] += row[i] * p.e;
        atn[i] += row[i] * p.n;
      }
    }
    const east = solve3(ata, ate);
    const north = solve3(ata, atn);
    if (!east || !north) throw new Error("Control points are in a straight line. Spread them out across the building.");
    params = { a: east[0], b: east[1], c: east[2], d: north[0], e: north[1], f: north[2] };
  }

  const transform = { kind, origin, ...params };
  const residuals = pairs.map((p) => {
    const [e, n] = applyLocal(transform, p.x, p.y);
    return Math.hypot(e - p.e, n - p.n);
  });
  const rmsErrorMeters = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const metersPerPixel = Math.sqrt(Math.abs(params.a * params.e - params.b * params.d));
  const rotationDegrees = ((Math.atan2(params.d, params.a) / DEG) + 360) % 360;
  return {
    transform,
    rmsErrorMeters,
    residualsMeters: residuals,
    metersPerPixel,
    rotationDegrees,
    // With exactly the minimum points the fit is exact by construction, so
    // the error says nothing about accuracy.
    errorMeaningful: points.length > needed,
  };
}

function applyLocal(t, x, yUp) {
  return [t.a * x + t.b * yUp + t.c, t.d * x + t.e * yUp + t.f];
}

/** Floor (x, y) → [lat, lng]. */
export function floorToGeo(transform, [x, y]) {
  return fromLocalMeters(applyLocal(transform, x, -y), transform.origin);
}

/** [lat, lng] → floor (x, y). */
export function geoToFloor(transform, latLng) {
  const [e, n] = toLocalMeters(latLng, transform.origin);
  const det = transform.a * transform.e - transform.b * transform.d;
  if (Math.abs(det) < 1e-15) throw new Error("Alignment can't be inverted.");
  const ex = e - transform.c;
  const ny = n - transform.f;
  const x = (transform.e * ex - transform.b * ny) / det;
  const yUp = (-transform.d * ex + transform.a * ny) / det;
  return [x, -yUp];
}

/**
 * Plain-language quality for the alignment UI.
 * @param {ReturnType<typeof fitTransform>} fit
 */
export function describeAlignmentQuality(fit) {
  if (!fit) return { level: "none", text: "Not aligned." };
  if (!fit.errorMeaningful) {
    return { level: "unknown", text: "Fits the points exactly; add one more control point to measure the error." };
  }
  const error = fit.rmsErrorMeters;
  const feet = Math.round(error * 3.281 * 10) / 10;
  if (error <= 1) return { level: "good", text: `Average error about ${feet} ft.` };
  if (error <= 3) return { level: "fair", text: `Average error about ${feet} ft. Check the control points.` };
  return { level: "poor", text: `Average error about ${feet} ft. A control point is probably misplaced.` };
}

/** Stored shape for a floor's alignment (on the floor plan document). */
export function buildAlignmentRecord(fit, controlPoints, actor = "") {
  return {
    status: "unverified",
    kind: fit.transform.kind,
    transform: fit.transform,
    controlPoints: controlPoints.map((row) => ({ floor: row.floor.map(Number), geo: row.geo.map(Number) })),
    rmsErrorMeters: fit.errorMeaningful ? Math.round(fit.rmsErrorMeters * 100) / 100 : null,
    metersPerPixel: fit.metersPerPixel,
    rotationDegrees: Math.round(fit.rotationDegrees * 10) / 10,
    alignedBy: actor,
    alignedAt: new Date().toISOString(),
    verifiedBy: "",
    verifiedAt: "",
  };
}
