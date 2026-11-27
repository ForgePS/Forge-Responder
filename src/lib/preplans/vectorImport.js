/**
 * SmartPlan deterministic vector import: SVG and DXF drawings → proposed floor
 * plan objects. Pure functions (no DOM), so they run the same in the browser
 * and in tests.
 *
 * Uploaded files are untrusted. Nothing here renders or evaluates them: SVG is
 * read as text with a small tokenizer (scripts, styles, links and embedded
 * images are ignored), and DXF is read as group-code pairs.
 *
 * Every result is a *proposal*: objects come back with verificationStatus
 * "pending" and confidence "unknown". Classification only uses what the file
 * says (layer, id or class names); anything it can't place is a plain line or
 * area for a person to decide. Nothing is invented: no geometry is added that
 * isn't in the file.
 */
import { MAX_OBJECTS_PER_FLOOR, MAX_POINTS_PER_OBJECT, OBJECT_TYPES, geometryError } from "./floorPlanModel.js";

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_SOURCE_SHAPES = 20000;
const CURVE_STEPS = 8;
const ELLIPSE_STEPS = 24;

// ---------------------------------------------------------------- matrices

const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function numbers(text) {
  return (String(text || "").match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
}

/** SVG transform attribute → matrix. Unknown functions are ignored (and reported). */
export function parseTransform(text = "") {
  let m = IDENTITY;
  let unknown = false;
  for (const [, name, args] of String(text).matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const v = numbers(args);
    let t = null;
    if (name === "matrix" && v.length === 6) t = v;
    else if (name === "translate") t = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (name === "scale") t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (name === "rotate") {
      const r = ((v[0] || 0) * Math.PI) / 180;
      const [cx, cy] = [v[1] || 0, v[2] || 0];
      t = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (name === "skewX") t = [1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0];
    else if (name === "skewY") t = [1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    if (t && t.every(Number.isFinite)) m = multiply(m, t);
    else unknown = true;
  }
  return { matrix: m, unknown };
}

// ---------------------------------------------------------------- SVG

function attrs(text = "") {
  const out = {};
  for (const [, key, , dq, sq] of String(text).matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[key.toLowerCase()] = dq ?? sq ?? "";
  }
  return out;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&amp;/g, "&");
}

/** Path data → subpaths of [x,y] (curves sampled; arcs drawn straight and reported). */
export function parsePathData(d = "") {
  const tokens = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const subpaths = [];
  let current = null;
  let x = 0; let y = 0; let startX = 0; let startY = 0;
  let lastCtrl = null; let lastCmd = "";
  let arcs = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);
  const hasNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  const push = (px, py) => { current.points.push([px, py]); };
  let cmd = "";
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) { i += 1; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") {
      if (current) { current.closed = true; x = startX; y = startY; }
      lastCtrl = null; lastCmd = C;
      if (!hasNum()) continue;
    }
    if (C === "M") {
      if (!hasNum()) continue;
      const nx = num() + (rel ? x : 0); const ny = num() + (rel ? y : 0);
      current = { points: [], closed: false };
      subpaths.push(current);
      x = nx; y = ny; startX = x; startY = y; push(x, y);
      cmd = rel ? "l" : "L"; // following pairs are line-tos
      lastCtrl = null; lastCmd = C;
      continue;
    }
    if (!current) { current = { points: [[x, y]], closed: false }; subpaths.push(current); }
    if (!hasNum()) { i += 1; continue; }
    if (C === "L") { x = num() + (rel ? x : 0); y = num() + (rel ? y : 0); push(x, y); lastCtrl = null; }
    else if (C === "H") { x = num() + (rel ? x : 0); push(x, y); lastCtrl = null; }
    else if (C === "V") { y = num() + (rel ? y : 0); push(x, y); lastCtrl = null; }
    else if (C === "C" || C === "S") {
      let c1;
      if (C === "C") c1 = [num() + (rel ? x : 0), num() + (rel ? y : 0)];
      else c1 = lastCtrl && (lastCmd === "C" || lastCmd === "S") ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
      const c2 = [num() + (rel ? x : 0), num() + (rel ? y : 0)];
      const end = [num() + (rel ? x : 0), num() + (rel ? y : 0)];
      for (let s = 1; s <= CURVE_STEPS; s += 1) {
        const t = s / CURVE_STEPS; const u = 1 - t;
        push(u ** 3 * x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * end[0],
          u ** 3 * y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * end[1]);
      }
      lastCtrl = c2; [x, y] = end;
    } else if (C === "Q" || C === "T") {
      let c;
      if (C === "Q") c = [num() + (rel ? x : 0), num() + (rel ? y : 0)];
      else c = lastCtrl && (lastCmd === "Q" || lastCmd === "T") ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
      const end = [num() + (rel ? x : 0), num() + (rel ? y : 0)];
      for (let s = 1; s <= CURVE_STEPS; s += 1) {
        const t = s / CURVE_STEPS; const u = 1 - t;
        push(u * u * x + 2 * u * t * c[0] + t * t * end[0], u * u * y + 2 * u * t * c[1] + t * t * end[1]);
      }
      lastCtrl = c; [x, y] = end;
    } else if (C === "A") {
      i += 5; // rx ry rotation large-arc sweep
      x = num() + (rel ? x : 0); y = num() + (rel ? y : 0);
      push(x, y); arcs += 1; lastCtrl = null;
    } else { i += 1; }
    lastCmd = C;
  }
  return { subpaths: subpaths.filter((row) => row.points.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b))), arcs };
}

function ellipsePoints(cx, cy, rx, ry) {
  const out = [];
  for (let s = 0; s < ELLIPSE_STEPS; s += 1) {
    const a = (2 * Math.PI * s) / ELLIPSE_STEPS;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/**
 * Read an SVG drawing.
 * @returns {{shapes:object[], warnings:string[], unsupported:Record<string,number>, units:string}}
 */
export function parseSvgDrawing(text) {
  const source = String(text || "");
  if (source.length > MAX_IMPORT_BYTES) throw new Error("This drawing is too large to import (15 MB limit).");
  if (!/<svg[\s>]/i.test(source)) throw new Error("This file doesn't look like an SVG drawing.");
  const cleaned = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<(script|style|foreignObject|metadata)\b[\s\S]*?<\/\1\s*>/gi, "");
  const shapes = [];
  const unsupported = {};
  const warnings = [];
  let arcs = 0;
  let unknownTransforms = 0;
  const stack = [{ matrix: IDENTITY, hint: "", name: "#root" }];
  let textCapture = null;
  const tagRe = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g;
  let last = 0;
  let match;
  let units = "";

  const pushShape = (shape) => {
    if (shapes.length < MAX_SOURCE_SHAPES) shapes.push(shape);
  };

  while ((match = tagRe.exec(cleaned))) {
    if (textCapture && match.index > last) textCapture.text += cleaned.slice(last, match.index);
    last = tagRe.lastIndex;
    const [, closing, rawName, attrText, selfClosing] = match;
    const name = rawName.toLowerCase().replace(/^svg:/, "");
    if (closing) {
      if (name === "text" && textCapture) {
        const content = decodeEntities(textCapture.text).replace(/\s+/g, " ").trim();
        if (content) pushShape({ kind: "text", points: [textCapture.at], text: content.slice(0, 200), hint: textCapture.hint, ref: textCapture.ref });
        textCapture = null;
      }
      if (stack.length > 1 && stack[stack.length - 1].name === name) stack.pop();
      continue;
    }
    const a = attrs(attrText);
    const parent = stack[stack.length - 1];
    const own = parseTransform(a.transform);
    if (own.unknown) unknownTransforms += 1;
    const matrix = multiply(parent.matrix, own.matrix);
    const hint = [a.id, a.class, a["inkscape:label"], a["data-layer"], parent.hint].filter(Boolean).join(" ").slice(0, 300);
    const ref = `${name}${a.id ? `#${a.id}` : ""}`.slice(0, 120);
    const T = (pts) => pts.map((p) => apply(matrix, p));

    if (name === "svg" && !units) {
      const w = String(a.width || "");
      units = /mm$/.test(w) ? "mm" : /cm$/.test(w) ? "cm" : /in$/.test(w) ? "in" : "";
    }
    if (name === "g" || name === "svg" || name === "a" || name === "switch") {
      if (!selfClosing) stack.push({ matrix, hint, name });
      continue;
    }
    if (name === "defs" || name === "symbol" || name === "clippath" || name === "mask" || name === "pattern" || name === "marker") {
      // Content of these isn't drawn directly; skip to its end tag.
      if (!selfClosing) {
        const end = cleaned.toLowerCase().indexOf(`</${rawName.toLowerCase()}`, tagRe.lastIndex);
        if (end > 0) { tagRe.lastIndex = end; last = end; }
      }
      continue;
    }
    if (name === "text") {
      const x = numbers(a.x)[0] || 0;
      const y = numbers(a.y)[0] || 0;
      textCapture = { at: apply(matrix, [x, y]), text: "", hint, ref };
      if (selfClosing) textCapture = null;
      continue;
    }
    if (name === "tspan" || name === "title" || name === "desc") continue;
    if (name === "line") {
      pushShape({ kind: "open", points: T([[+a.x1 || 0, +a.y1 || 0], [+a.x2 || 0, +a.y2 || 0]]), hint, ref });
    } else if (name === "polyline" || name === "polygon") {
      const v = numbers(a.points);
      const pts = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
      pushShape({ kind: name === "polygon" ? "closed" : "open", points: T(pts), hint, ref });
    } else if (name === "rect") {
      const x = +a.x || 0; const y = +a.y || 0; const w = +a.width || 0; const h = +a.height || 0;
      if (w > 0 && h > 0) pushShape({ kind: "closed", points: T([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), hint, ref });
    } else if (name === "circle" || name === "ellipse") {
      const rx = +(a.r ?? a.rx) || 0; const ry = +(a.r ?? a.ry) || 0;
      if (rx > 0 && ry > 0) pushShape({ kind: "closed", points: T(ellipsePoints(+a.cx || 0, +a.cy || 0, rx, ry)), hint, ref, round: true });
    } else if (name === "path") {
      const parsed = parsePathData(a.d);
      arcs += parsed.arcs;
      for (const sub of parsed.subpaths) {
        if (sub.points.length >= 2) pushShape({ kind: sub.closed ? "closed" : "open", points: T(sub.points), hint, ref });
      }
    } else {
      unsupported[name] = (unsupported[name] || 0) + 1;
    }
    if (!selfClosing && !["line", "polyline", "polygon", "rect", "circle", "ellipse", "path"].includes(name)) {
      stack.push({ matrix, hint, name });
    }
  }
  if (arcs) warnings.push(`${arcs} arc segment${arcs === 1 ? " was" : "s were"} drawn as straight lines. Check curved walls.`);
  if (unknownTransforms) warnings.push(`${unknownTransforms} transform${unknownTransforms === 1 ? "" : "s"} couldn't be read; those shapes may be out of place.`);
  if (unsupported.image) warnings.push("Embedded pictures were ignored. Use Trace over a drawing for raster images.");
  if (unsupported.use) warnings.push("Reused symbols (<use>) were ignored.");
  if (shapes.length >= MAX_SOURCE_SHAPES) warnings.push(`Only the first ${MAX_SOURCE_SHAPES.toLocaleString()} shapes were read.`);
  return { shapes, warnings, unsupported, units };
}

// ---------------------------------------------------------------- DXF

const DXF_UNITS = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };

/** DXF (ASCII) → shapes. Binary DXF is refused. */
export function parseDxfDrawing(text) {
  const source = String(text || "");
  if (source.length > MAX_IMPORT_BYTES) throw new Error("This drawing is too large to import (15 MB limit).");
  if (source.startsWith("AutoCAD Binary DXF")) throw new Error("Binary DXF isn't supported. Save it as ASCII DXF and try again.");
  const lines = source.split(/\r?\n/);
  const pairs = [];
  for (let k = 0; k + 1 < lines.length; k += 2) pairs.push([Number(lines[k].trim()), lines[k + 1].trim()]);
  if (!pairs.some(([c, v]) => c === 0 && v === "SECTION")) throw new Error("This file doesn't look like a DXF drawing.");

  let units = "";
  const insunits = pairs.findIndex(([c, v]) => c === 9 && v === "$INSUNITS");
  if (insunits >= 0) units = DXF_UNITS[Number(pairs[insunits + 1]?.[1])] || "";

  const start = pairs.findIndex(([c, v], idx) => c === 0 && v === "SECTION" && pairs[idx + 1]?.[0] === 2 && pairs[idx + 1]?.[1] === "ENTITIES");
  if (start < 0) throw new Error("This DXF has no drawing entities.");
  const shapes = [];
  const unsupported = {};
  const warnings = [];
  let bulges = 0;
  let k = start + 2;
  let polyline = null;

  const entity = () => {
    const type = pairs[k][1];
    const fields = [];
    k += 1;
    while (k < pairs.length && pairs[k][0] !== 0) { fields.push(pairs[k]); k += 1; }
    return { type, fields };
  };
  const first = (fields, code, fallback = "") => fields.find(([c]) => c === code)?.[1] ?? fallback;

  while (k < pairs.length) {
    if (pairs[k][0] !== 0) { k += 1; continue; }
    if (pairs[k][1] === "ENDSEC") break;
    const { type, fields } = entity();
    const layer = String(first(fields, 8, "0"));
    const hint = layer;
    const ref = `${type} on layer ${layer}`.slice(0, 120);
    if (shapes.length >= MAX_SOURCE_SHAPES) continue;
    if (type === "LINE") {
      shapes.push({ kind: "open", points: [[+first(fields, 10, 0), +first(fields, 20, 0)], [+first(fields, 11, 0), +first(fields, 21, 0)]], hint, ref });
    } else if (type === "LWPOLYLINE") {
      const pts = [];
      let pendingX = null;
      for (const [c, v] of fields) {
        if (c === 10) pendingX = Number(v);
        else if (c === 20 && pendingX != null) { pts.push([pendingX, Number(v)]); pendingX = null; }
        else if (c === 42 && Number(v) !== 0) bulges += 1;
      }
      const closed = (Number(first(fields, 70, 0)) & 1) === 1;
      shapes.push({ kind: closed ? "closed" : "open", points: pts, hint, ref });
    } else if (type === "POLYLINE") {
      polyline = { points: [], closed: (Number(first(fields, 70, 0)) & 1) === 1, hint, ref };
    } else if (type === "VERTEX" && polyline) {
      polyline.points.push([+first(fields, 10, 0), +first(fields, 20, 0)]);
      if (Number(first(fields, 42, 0)) !== 0) bulges += 1;
    } else if (type === "SEQEND" && polyline) {
      shapes.push({ kind: polyline.closed ? "closed" : "open", points: polyline.points, hint: polyline.hint, ref: polyline.ref });
      polyline = null;
    } else if (type === "CIRCLE") {
      const r = +first(fields, 40, 0);
      if (r > 0) shapes.push({ kind: "closed", points: ellipsePoints(+first(fields, 10, 0), +first(fields, 20, 0), r, r), hint, ref, round: true });
    } else if (type === "ARC") {
      const cx = +first(fields, 10, 0); const cy = +first(fields, 20, 0); const r = +first(fields, 40, 0);
      const a0 = +first(fields, 50, 0); let a1 = +first(fields, 51, 0);
      if (a1 < a0) a1 += 360;
      const pts = [];
      for (let s = 0; s <= CURVE_STEPS; s += 1) {
        const a = ((a0 + ((a1 - a0) * s) / CURVE_STEPS) * Math.PI) / 180;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      if (r > 0) shapes.push({ kind: "open", points: pts, hint, ref });
    } else if (type === "TEXT" || type === "MTEXT") {
      const raw = fields.filter(([c]) => c === 1 || c === 3).map(([, v]) => v).join("");
      const content = raw.replace(/\\P/g, " ").replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
      if (content) shapes.push({ kind: "text", points: [[+first(fields, 10, 0), +first(fields, 20, 0)]], text: content.slice(0, 200), hint, ref });
    } else {
      unsupported[type] = (unsupported[type] || 0) + 1;
    }
  }
  // DXF y points up; floor plans point down.
  for (const shape of shapes) shape.points = shape.points.map(([x, y]) => [x, -y]);
  if (bulges) warnings.push(`${bulges} curved polyline segment${bulges === 1 ? " was" : "s were"} drawn straight.`);
  if (unsupported.INSERT) warnings.push(`${unsupported.INSERT} block reference${unsupported.INSERT === 1 ? " was" : "s were"} skipped. Explode blocks in your CAD program to include them.`);
  if (unsupported.HATCH) warnings.push("Hatch fills were skipped.");
  return { shapes, warnings, unsupported, units };
}

// ---------------------------------------------------------------- classification

/** Layer/id/class hints → object type. Order matters (most specific first). */
const HINT_RULES = [
  { re: /(ext(erior)?[\s_-]*wall|wall[\s_-]*ext|a-wall-ext)/i, type: "exterior_wall", needs: "any" },
  { re: /wall/i, type: "interior_wall", needs: "any" },
  { re: /door/i, type: "door", needs: "two" },
  { re: /(window|glaz)/i, type: "window", needs: "two" },
  { re: /stair/i, type: "stairwell", needs: "closed" },
  { re: /elev/i, type: "elevator", needs: "closed" },
  { re: /corridor|hall/i, type: "corridor", needs: "closed" },
  { re: /(room|space)/i, type: "room", needs: "closed" },
  { re: /(colu?mn|a-cols)/i, type: "column", needs: "closed" },
  { re: /dim/i, type: "dimension", needs: "two" },
];

/**
 * Pick an object type from the file's own naming. Returns the reason, so a
 * reviewer can see why ("layer A-WALL-EXT").
 */
export function classifyShape(shape) {
  if (shape.kind === "text") return { type: "text", reason: "text in the file" };
  const closed = shape.kind === "closed";
  const two = shape.points.length === 2;
  for (const rule of HINT_RULES) {
    if (!rule.re.test(shape.hint || "")) continue;
    if (rule.needs === "closed" && !closed) continue;
    if (rule.needs === "two" && !two) continue;
    if (rule.type === "column") return { type: "area", reason: `named "${(shape.hint || "").slice(0, 40)}" (column outline)` };
    return { type: rule.type, reason: `named "${(shape.hint || "").slice(0, 40)}"` };
  }
  return { type: closed ? "area" : "line", reason: "no layer or name hint" };
}

// ---------------------------------------------------------------- proposals

function dedupe(points) {
  return points.filter((p, i) => i === 0 || Math.abs(p[0] - points[i - 1][0]) > 1e-6 || Math.abs(p[1] - points[i - 1][1]) > 1e-6);
}

/** Douglas–Peucker; drops only points within `tolerance` of the simplified line. */
export function simplifyPath(points, tolerance = 0.25) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true; keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = points[a]; const [x2, y2] = points[b];
    const len = Math.hypot(x2 - x1, y2 - y1);
    let worst = -1; let index = -1;
    for (let k = a + 1; k < b; k += 1) {
      const [x, y] = points[k];
      // A closed outline starts and ends on the same point: measure to that point, not to a zero-length line.
      const dist = len < 1e-9
        ? Math.hypot(x - x1, y - y1)
        : Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / len;
      if (dist > worst) { worst = dist; index = k; }
    }
    if (worst > tolerance && index > 0) { keep[index] = true; stack.push([a, index], [index, b]); }
  }
  return points.filter((_, k) => keep[k]);
}

function round1(v) { return Math.round(v * 10) / 10; }

/**
 * Shapes → pending floor plan objects in floor coordinates.
 * The drawing is moved so it starts near (40, 40); it is scaled only when it is
 * tiny or huge (e.g. a DXF in feet), and the factor is reported.
 *
 * @param {{shapes:object[]}} parsed
 * @param {{conversionId:string, fileId:string, format:"svg"|"dxf", actorUid?:string, existingCount?:number, include?:Record<string,boolean>}} options
 */
export function shapesToProposals(parsed, options = {}) {
  const include = { walls: true, openings: true, rooms: true, lines: true, text: true, ...(options.include || {}) };
  const room = MAX_OBJECTS_PER_FLOOR - (Number(options.existingCount) || 0);
  const warnings = [];
  // Loop rather than Math.min(...): large drawings would overflow the call stack.
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const shape of parsed.shapes) {
    for (const [x, y] of shape.points) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { objects: [], canvas: null, scaleFactor: 1, counts: {}, skipped: 0, warnings: ["No drawable shapes were found."] };
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const scaleFactor = span < 400 || span > 8000 ? 2000 / span : 1;
  const margin = 40;
  const toFloor = ([x, y]) => [round1((x - minX) * scaleFactor + margin), round1((y - minY) * scaleFactor + margin)];
  const group = (type) => {
    if (["exterior_wall", "interior_wall"].includes(type)) return "walls";
    if (["door", "window"].includes(type)) return "openings";
    if (["room", "corridor", "stairwell", "elevator", "area"].includes(type)) return "rooms";
    if (type === "text") return "text";
    return "lines";
  };
  const stamp = new Date().toISOString();
  const objects = [];
  const counts = {};
  let skipped = 0;
  let split = 0;

  for (const shape of parsed.shapes) {
    const { type, reason } = classifyShape(shape);
    if (!include[group(type)]) continue;
    const geometry = OBJECT_TYPES[type].geometry;
    let points = dedupe(shape.points.map(toFloor));
    if (geometry === "polygon" && points.length > 2 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) {
      points = points.slice(0, -1);
    }
    if (!shape.round) points = simplifyPath(points, 0.25);
    let pieces = [points];
    if (geometry === "polyline" && shape.kind === "closed" && points.length > 2) pieces = [[...points, points[0]]];
    if (points.length > MAX_POINTS_PER_OBJECT) {
      if (geometry === "polygon") { skipped += 1; continue; }
      pieces = [];
      for (let s = 0; s < points.length - 1; s += MAX_POINTS_PER_OBJECT - 1) pieces.push(points.slice(s, s + MAX_POINTS_PER_OBJECT));
      split += 1;
    }
    for (const piece of pieces) {
      const kindPoints = geometry === "point" ? piece.slice(0, 1) : piece;
      if (geometryError(geometry, kindPoints)) { skipped += 1; continue; }
      if (objects.length >= room) { skipped += 1; continue; }
      objects.push({
        id: `vi-${options.conversionId || "x"}-${objects.length}`.slice(0, 80),
        type,
        name: type === "text" ? shape.text : "",
        geometry: { kind: geometry, points: kindPoints },
        verificationStatus: "pending",
        source: {
          kind: "vector_import",
          uploadId: options.fileId || "",
          jobId: options.conversionId || "",
          reference: `${shape.ref || ""} · ${reason}`.slice(0, 200),
          confidence: "unknown",
        },
        createdAt: stamp,
        createdBy: options.actorUid || "",
        updatedAt: stamp,
      });
      counts[type] = (counts[type] || 0) + 1;
    }
  }
  if (scaleFactor !== 1) warnings.push(`The drawing was resized ×${Math.round(scaleFactor * 1000) / 1000} to fit the canvas. Set the scale on the floor plan before measuring.`);
  if (split) warnings.push(`${split} very long line${split === 1 ? " was" : "s were"} split into pieces.`);
  if (objects.length >= room) warnings.push(`This floor can hold ${MAX_OBJECTS_PER_FLOOR.toLocaleString()} objects; the rest of the drawing was left out.`);
  return {
    objects,
    canvas: {
      width: Math.ceil((maxX - minX) * scaleFactor + margin * 2),
      height: Math.ceil((maxY - minY) * scaleFactor + margin * 2),
    },
    scaleFactor,
    offset: { minX, minY, margin },
    counts,
    skipped,
    warnings,
  };
}

/** Pick the parser by file name / type. */
export function detectVectorFormat(fileName = "", mimeType = "") {
  if (/\.svg$/i.test(fileName) || mimeType === "image/svg+xml") return "svg";
  if (/\.dxf$/i.test(fileName) || /dxf/i.test(mimeType)) return "dxf";
  if (/\.dwg$/i.test(fileName)) return "dwg";
  if (/\.pdf$/i.test(fileName) || mimeType === "application/pdf") return "pdf";
  if (/^image\//.test(mimeType) || /\.(png|jpe?g|webp|gif|heic|tiff?)$/i.test(fileName)) return "raster";
  return "";
}

export function parseVectorDrawing(format, text) {
  if (format === "svg") return parseSvgDrawing(text);
  if (format === "dxf") return parseDxfDrawing(text);
  throw new Error("Only SVG and DXF drawings can be imported as vectors.");
}
