/**
 * Incident-to-preplan matching (spec §15).
 *
 * Given a dispatched address (and coordinates when CAD sends them), find the
 * approved preplan for that property. The rules:
 *  - Only an exact street address (house number and street) counts as the
 *    dispatched property. A different number, a nearby building or a partial
 *    street name is offered for confirmation, never presented as the match.
 *  - Several preplans at one address (multi-tenant buildings, campuses) need
 *    confirmation unless the dispatched suite picks one out.
 *  - Only approved (published) preplans are offered to open. A preplan that
 *    exists for the address but isn't approved is reported as such, never
 *    substituted.
 * Pure functions: no Firestore, so the RMS, FORGE FIELD and NERIS share them.
 */

const SUFFIXES = {
  street: "st", str: "st", st: "st",
  avenue: "ave", av: "ave", ave: "ave",
  road: "rd", rd: "rd",
  drive: "dr", dr: "dr",
  lane: "ln", ln: "ln",
  boulevard: "blvd", blvd: "blvd",
  parkway: "pkwy", pkwy: "pkwy", pky: "pkwy",
  highway: "hwy", hwy: "hwy",
  court: "ct", ct: "ct",
  place: "pl", pl: "pl",
  circle: "cir", cir: "cir",
  terrace: "ter", ter: "ter",
  trail: "trl", trl: "trl",
  way: "way",
  square: "sq", sq: "sq",
  loop: "loop",
  pike: "pike",
  expressway: "expy", expy: "expy",
  freeway: "fwy", fwy: "fwy",
  center: "ctr", ctr: "ctr",
  crossing: "xing", xing: "xing",
  point: "pt", pt: "pt",
  plaza: "plz", plz: "plz",
  alley: "aly", aly: "aly",
};
const DIRECTIONS = {
  north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  n: "n", s: "s", e: "e", w: "w", ne: "ne", nw: "nw", se: "se", sw: "sw",
};
const SUITE_WORDS = /^(apt|apartment|unit|ste|suite|bldg|building|rm|room|fl|floor|lot|spc|space|#)$/;

/** Statuses where a preplan is withdrawn from response use. */
const WITHDRAWN = new Set(["archived", "temporarily_unavailable", "retired", "deleted"]);

/** Within this distance an address match is consistent with the CAD coordinates. */
export const SAME_PLACE_METERS = 250;
/** Preplans this close to the CAD point are offered as "nearby" when no address matches. */
export const NEARBY_METERS = 150;

function clean(value) {
  return String(value ?? "").trim();
}

/**
 * Split an address into number, street and suite, with suffixes and
 * directions standardized ("4710 Riverside Road, Suite 200, Springfield" →
 * { number: "4710", street: "riverside rd", suite: "200" }).
 * The city and anything after the first comma are ignored, except a suite.
 */
export function parseAddress(value) {
  const raw = clean(value);
  if (!raw) return { raw, number: "", street: "", suite: "", key: "", intersection: false };
  const [first, ...rest] = raw.split(",");
  const intersection = /\s(&|and|at|\/)\s/i.test(first) || /&/.test(first);
  let suite = "";
  const restSuite = rest.join(" ").match(/(?:\b(?:apt|apartment|unit|ste|suite|bldg|building|rm|room|lot|spc|space)\b\.?|#)\s*([a-z0-9-]+)/i);
  if (restSuite) suite = restSuite[1];

  const tokens = first.toLowerCase().replace(/[.]/g, "").replace(/#\s*/g, " # ").split(/[\s]+/).filter(Boolean);
  const words = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].replace(/[^a-z0-9-]/g, "");
    if (!token && tokens[i] !== "#") continue;
    if (SUITE_WORDS.test(tokens[i]) && tokens[i + 1]) {
      suite = suite || tokens[i + 1].replace(/[^a-z0-9-]/g, "");
      i += 1;
      continue;
    }
    words.push(token);
  }

  let number = "";
  if (!intersection && /^\d+[a-z]?(-\d+)?$/.test(words[0] || "")) number = words.shift();
  // Standardize suffixes and directions; a short token after the last suffix is a suite ("214 Main St 200").
  let lastSuffix = -1;
  const street = words.map((word, index) => {
    if (DIRECTIONS[word] && (index === 0 || index === words.length - 1)) return DIRECTIONS[word];
    if (SUFFIXES[word] && index > 0) { lastSuffix = index; return SUFFIXES[word]; }
    return word;
  });
  if (lastSuffix >= 0 && lastSuffix < street.length - 1) {
    const trailing = street.slice(lastSuffix + 1);
    const directionTail = trailing.length === 1 && Object.values(DIRECTIONS).includes(trailing[0]);
    if (!directionTail && trailing.length === 1 && /^[a-z]?\d+[a-z]?$|^[a-z]$/.test(trailing[0])) {
      suite = suite || trailing[0];
      street.splice(lastSuffix + 1);
    }
  }
  const streetText = street.join(" ").trim();
  return {
    raw,
    number,
    street: streetText,
    suite: suite.toLowerCase(),
    key: number && streetText ? `${number} ${streetText}` : "",
    intersection,
  };
}

/** The street without its suffix and directions ("riverside rd" → "riverside"). */
function streetCore(street) {
  const suffixes = new Set(Object.values(SUFFIXES));
  const directions = new Set(Object.values(DIRECTIONS));
  return street.split(" ").filter((word) => !suffixes.has(word) && !directions.has(word)).join(" ");
}

/**
 * How two addresses compare: "exact" (same number and street), "partial"
 * (same number, same street name but a suffix or direction differs or is
 * missing), "street" (same street, other number) or "" (different).
 */
export function compareAddresses(a, b) {
  const left = typeof a === "string" ? parseAddress(a) : a;
  const right = typeof b === "string" ? parseAddress(b) : b;
  if (!left?.street || !right?.street) return "";
  if (left.key && left.key === right.key) return "exact";
  const sameCore = streetCore(left.street) && streetCore(left.street) === streetCore(right.street);
  if (left.number && left.number === right.number && sameCore) return "partial";
  if (left.street === right.street || sameCore) return "street";
  return "";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** { lat, lng } from an incident or record (latitude/longitude, lat/lng, or a "lat,lng" gps string). */
export function pointOf(record = {}) {
  let lat = toNumber(record.latitude ?? record.lat);
  let lng = toNumber(record.longitude ?? record.lng ?? record.lon);
  if ((lat === null || lng === null) && typeof record.gps === "string" && record.gps.includes(",")) {
    const [a, b] = record.gps.split(",");
    lat = toNumber(a);
    lng = toNumber(b);
  }
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/** Haversine distance in meters. */
export function distanceMeters(a, b) {
  if (!a || !b) return null;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** True when the preplan is approved for response use (a published revision, not withdrawn). */
export function isApprovedPreplan(preplan = {}) {
  return Boolean(preplan.publishedRevisionId) && !WITHDRAWN.has(String(preplan.status || "").toLowerCase());
}

/**
 * The incident as the matcher reads it, from an Active911 alert, a CAD record
 * (pcrCad.js), a dispatch (fieldDispatch.js) or a typed address.
 */
export function incidentFrom(source = {}) {
  const parsed = parseAddress(source.address || source.incidentAddress || "");
  const suite = clean(source.suite || source.unit || "").toLowerCase().replace(/^(apt|unit|ste|suite|#)\s*/i, "") || parsed.suite;
  return {
    source: clean(source.source) || "manual",
    id: clean(source.id),
    incidentNumber: clean(source.incidentNumber || source.cadNumber),
    description: clean(source.description || source.incidentTypeSummary),
    address: parsed.raw,
    parsed: { ...parsed, suite },
    point: pointOf(source),
    sentAt: clean(source.sentAt || source.receivedAt),
  };
}

/** A stable key for an incident: "active911:123", "cad:2026-004187", or "" for a typed address. */
export function incidentKey(incident = {}) {
  const id = clean(incident.id || incident.incidentNumber);
  return id ? `${clean(incident.source) || "cad"}:${id}` : "";
}

/**
 * The addresses a preplan answers for: its own and, when known, its
 * occupancy's (with the occupancy's suite or unit).
 */
function preplanPlaces(preplan, occupancy) {
  const places = [];
  const own = parseAddress(preplan.address);
  if (own.street) places.push({ ...own, suite: own.suite || clean(preplan.suite || preplan.unitId).toLowerCase() });
  if (occupancy) {
    const occ = parseAddress(occupancy.address);
    const suite = clean(occupancy.suite || occupancy.unitNumber || occupancy.unitId || "").toLowerCase() || occ.suite;
    if (occ.street) places.push({ ...occ, suite });
  }
  return places;
}

/**
 * Match an incident against the department's preplans.
 *
 * @param {object} incidentInput anything incidentFrom() reads
 * @param {object[]} preplans preplan records (address, latitude, longitude, publishedRevisionId, status, occupancyId)
 * @param {{ occupancies?: object[] }} [options] occupancy records, for suite numbers and second addresses
 * @returns {{
 *   status: "matched" | "confirm" | "none",
 *   message: string,
 *   match: object | null,       // the single approved match, only when status is "matched"
 *   candidates: object[],       // approved preplans needing confirmation, best first
 *   unapproved: object[],       // preplans at the address that aren't approved
 *   incident: object,
 * }}
 * Each candidate: { preplan, method: "suite"|"address"|"partial"|"nearby", distance, reasons[], sameAddress }
 */
export function matchIncidentToPreplans(incidentInput, preplans = [], { occupancies = [] } = {}) {
  const incident = incidentInput?.parsed ? incidentInput : incidentFrom(incidentInput);
  const occupancyById = new Map((occupancies || []).map((row) => [row.id, row]));
  const want = incident.parsed;
  const rows = [];
  const unapproved = [];

  for (const preplan of preplans || []) {
    const places = preplanPlaces(preplan, occupancyById.get(preplan.occupancyId));
    let best = null;
    for (const place of places) {
      const compare = want.street ? compareAddresses(want, place) : "";
      if (compare !== "exact" && compare !== "partial") continue;
      let method = compare === "exact" ? "address" : "partial";
      let suiteNote = "";
      if (compare === "exact" && want.suite && place.suite) {
        if (want.suite === place.suite) method = "suite";
        else { method = "other_suite"; suiteNote = `Suite ${place.suite}, not ${want.suite}`; }
      }
      const rank = { suite: 4, address: 3, other_suite: 2, partial: 1 }[method];
      if (!best || rank > best.rank) best = { method, rank, suiteNote, place };
    }
    const distance = distanceMeters(incident.point, pointOf(preplan));
    const nearby = !best && distance !== null && distance <= NEARBY_METERS;
    if (!best && !nearby) continue;
    if (!isApprovedPreplan(preplan)) {
      if (best && best.method !== "partial") unapproved.push(preplan);
      continue;
    }
    const reasons = [];
    if (best?.method === "suite") reasons.push(`Same address and suite (${want.suite})`);
    if (best?.method === "address") reasons.push(want.suite ? `Same address; the preplan covers the building (dispatched suite ${want.suite})` : "Same address");
    if (best?.method === "other_suite") reasons.push(`Same building, different suite: ${best.suiteNote}`);
    if (best?.method === "partial") reasons.push(`Similar address: "${preplan.address}" (the street type or direction differs)`);
    if (nearby) reasons.push(`A different address ${distance} m from the dispatched location`);
    if (distance !== null && best && distance > SAME_PLACE_METERS) reasons.push(`But the preplan's location is ${distance} m from the CAD location`);
    rows.push({
      preplan,
      method: best ? best.method : "nearby",
      rank: best ? best.rank : 0,
      distance,
      reasons,
      sameAddress: Boolean(best && best.method !== "partial"),
      farFromCad: Boolean(best && distance !== null && distance > SAME_PLACE_METERS),
    });
  }

  rows.sort((a, b) => (b.rank - a.rank) || ((a.distance ?? 1e9) - (b.distance ?? 1e9)) || String(a.preplan.facilityName || a.preplan.address).localeCompare(String(b.preplan.facilityName || b.preplan.address)));
  const candidates = rows.map(({ rank, ...row }) => row); // eslint-disable-line no-unused-vars

  const strong = rows.filter((row) => (row.method === "suite" || row.method === "address") && !row.farFromCad);
  const topRank = strong.length ? strong[0].rank : 0;
  const top = strong.filter((row) => row.rank === topRank);
  const base = { incident, unapproved };

  if (top.length === 1) {
    const [{ rank, ...match }] = top; // eslint-disable-line no-unused-vars
    return { ...base, status: "matched", message: match.reasons[0], match, candidates };
  }
  if (top.length > 1) {
    return { ...base, status: "confirm", match: null, candidates, message: `${top.length} approved preplans share this address${want.suite ? "" : " and the dispatch has no suite"}. Choose the right one.` };
  }
  if (candidates.length) {
    const far = candidates.find((row) => row.farFromCad);
    const message = far
      ? "The address matches, but the preplan's location is far from where CAD placed the call. Confirm it's the same property."
      : candidates.every((row) => row.method === "nearby")
        ? "No approved preplan for this address. These are for other properties nearby; they are not the dispatched location."
        : "No exact match. Confirm before using any of these.";
    return { ...base, status: "confirm", match: null, candidates, message };
  }
  if (unapproved.length) {
    return { ...base, status: "none", match: null, candidates, message: "A preplan for this address exists but isn't approved yet, so it isn't shown for response." };
  }
  if (!want.street && !incident.point) {
    return { ...base, status: "none", match: null, candidates, message: "The dispatch has no address or location to match." };
  }
  return {
    ...base,
    status: "none",
    match: null,
    candidates,
    message: want.intersection ? "An intersection: no single property to match. No approved preplan nearby." : "No approved preplan for this address.",
  };
}

/** The association record for an incident and the preplan version used (stored by incidentLinkService). */
export function buildIncidentLink({ incident, preplan, revision, method, actor, note = "", now = new Date().toISOString() }) {
  if (!incident || !preplan?.id) throw new Error("An incident and a preplan are needed.");
  const approvedVersion = revision?.id && (revision.id === preplan.publishedRevisionId || ["published", "superseded"].includes(revision.status));
  if (!approvedVersion || (revision.preplanId && revision.preplanId !== preplan.id)) {
    throw new Error("Only an approved version of a preplan can be linked to an incident.");
  }
  const key = incidentKey(incident);
  return {
    incidentKey: key,
    incidentSource: incident.source || "manual",
    incidentId: incident.id || "",
    incidentNumber: incident.incidentNumber || "",
    incidentDescription: String(incident.description || "").slice(0, 160),
    incidentAddress: String(incident.address || "").slice(0, 240),
    incidentSuite: incident.parsed?.suite || "",
    incidentAt: incident.sentAt || "",
    preplanId: preplan.id,
    preplanNumber: preplan.preplanNumber || "",
    preplanName: String(preplan.facilityName || preplan.businessName || preplan.occupancyName || preplan.address || "").slice(0, 160),
    preplanAddress: String(preplan.address || "").slice(0, 240),
    occupancyId: preplan.occupancyId || "",
    revisionId: revision.id,
    revisionNumber: Number(revision.revisionNumber) || null,
    matchMethod: method,
    note: String(note || "").slice(0, 500),
    linkedBy: actor?.actorUid || "",
    linkedByName: actor?.actorName || "",
    linkedAt: now,
  };
}

/** Firestore-safe document id for a link: one per incident and preplan. */
export function incidentLinkId(link) {
  const base = `${link.incidentKey || `manual:${link.linkedAt}`}__${link.preplanId}`;
  return `PIL-${base.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300)}`;
}
