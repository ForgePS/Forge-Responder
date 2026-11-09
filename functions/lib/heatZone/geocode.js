/**
 * Address geocoding for Heat Zone Analytics.
 *
 * Reports without coordinates are looked up with the department's own Google
 * Geocoding key (existing googleApis integration), only when a Heat Zone
 * manager has turned geocoding on. Results are kept in a server-only table,
 * departments/{id}/heatZoneGeocodes/{key}, one entry per normalised address,
 * and are never written back into the NERIS report (the authoritative record
 * that members edit and that is submitted to NERIS).
 */
const crypto = require("node:crypto");
const { validLatLng } = require("./geo");

const text = (v) => (v === null || v === undefined ? "" : String(v).trim());

// Google location_type values precise enough to plot a call. APPROXIMATE
// (a town or postcode centroid) would pile calls onto one false hot spot.
const PRECISE_TYPES = new Set(["ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER"]);
const NOT_FOUND_RETRY_MS = 30 * 86_400_000;
const STATUS = Object.freeze({ ok: "ok", notFound: "not_found", imprecise: "imprecise" });

/**
 * Address sent to Google. Short editor addresses ("123 Main St") are completed
 * with the department's city / state / ZIP from its profile.
 * @param {string} address report.incidentAddress
 * @param {{city?:string, state?:string, zip?:string}} place
 */
function geocodeQuery(address, place = {}) {
  const base = text(address).replace(/\s+/g, " ").slice(0, 200);
  if (base.length < 4 || !/[a-z]/i.test(base)) return "";
  if (base.includes(",")) return base;
  const locality = [text(place.city), [text(place.state), text(place.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return locality ? `${base}, ${locality}` : base;
}

/** Stable document id for a query (case and spacing insensitive). */
function geocodeKey(query) {
  const normal = text(query).toLowerCase().replace(/[.#]/g, " ").replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").trim();
  if (!normal) return "";
  return crypto.createHash("sha256").update(normal).digest("hex").slice(0, 32);
}

/** Point from a stored entry, or null when it is not usable. */
function entryPoint(entry) {
  if (!entry || entry.status !== STATUS.ok) return null;
  return validLatLng(entry.lat, entry.lng);
}

/** True when a stored entry should be looked up again. */
function needsLookup(entry, now = Date.now()) {
  if (!entry) return true;
  if (entry.status === STATUS.notFound) return now >= (Number(entry.retryAfter) || 0);
  return false;
}

/**
 * Turn a geocoder answer into a stored entry. Errors that are not about the
 * address (network, quota, bad key) throw so they are retried later instead
 * of being remembered.
 */
function entryFromResult(query, result, now = Date.now()) {
  const base = { query, geocodedAt: now };
  if (!result) return { ...base, status: STATUS.notFound, retryAfter: now + NOT_FOUND_RETRY_MS };
  const point = validLatLng(result.latitude, result.longitude);
  if (!point) return { ...base, status: STATUS.notFound, retryAfter: now + NOT_FOUND_RETRY_MS };
  const locationType = text(result.locationType).toUpperCase();
  if (result.partialMatch || (locationType && !PRECISE_TYPES.has(locationType))) {
    return { ...base, status: STATUS.imprecise, locationType, formattedAddress: text(result.formattedAddress).slice(0, 200) };
  }
  return {
    ...base,
    status: STATUS.ok,
    lat: point.lat,
    lng: point.lng,
    locationType,
    formattedAddress: text(result.formattedAddress).slice(0, 200),
  };
}

/**
 * Default geocoder: the existing Google integration. Returns null when Google
 * finds nothing; throws for anything else.
 */
async function googleGeocoder(db, departmentId, query) {
  const { geocodeAddress } = require("../googleMapsService");
  try {
    return await geocodeAddress(db, departmentId, query);
  } catch (error) {
    if (error?.status === "ZERO_RESULTS") return null;
    throw error;
  }
}

/** Run fn over items with a small concurrency limit. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

module.exports = {
  NOT_FOUND_RETRY_MS,
  PRECISE_TYPES,
  STATUS,
  entryFromResult,
  entryPoint,
  geocodeKey,
  geocodeQuery,
  googleGeocoder,
  mapLimit,
  needsLookup,
};
