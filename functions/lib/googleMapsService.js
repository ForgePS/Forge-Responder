const { loadIntegration: loadGoogleApisIntegration } = require("./googleApisStore");

async function getMapsKey(db, departmentId) {
  const integration = await loadGoogleApisIntegration(db, departmentId);
  return integration?.geocodingApiKey || integration?.mapsJsApiKey || "";
}

async function geocodeAddress(db, departmentId, address = "") {
  const query = String(address || "").trim();
  if (!query) throw new Error("Address is required.");

  const key = await getMapsKey(db, departmentId);
  if (!key) throw new Error("Google Geocoding API key is not configured.");

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", key);

  const response = await fetch(url);
  const payload = await response.json();
  if (payload.status !== "OK" || !payload.results?.length) {
    throw new Error(payload.error_message || "Could not geocode address.");
  }

  const result = payload.results[0];
  const location = result.geometry?.location || {};
  return {
    formattedAddress: result.formatted_address || query,
    latitude: location.lat ?? null,
    longitude: location.lng ?? null,
    placeId: result.place_id || "",
  };
}

async function fetchDirections(db, departmentId, { origin = "", destination = "", lat, lng, originLat, originLng } = {}) {
  const key = await getMapsKey(db, departmentId);
  if (!key) throw new Error("Google Maps API key is not configured.");

  const dest = lat != null && lng != null ? `${lat},${lng}` : String(destination || "").trim();
  const orig = originLat != null && originLng != null
    ? `${originLat},${originLng}`
    : String(origin || "").trim();
  if (!orig || !dest) throw new Error("Origin and destination are required.");

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", orig);
  url.searchParams.set("destination", dest);
  url.searchParams.set("key", key);

  const response = await fetch(url);
  const payload = await response.json();
  if (payload.status !== "OK" || !payload.routes?.length) {
    throw new Error(payload.error_message || "Could not calculate route.");
  }

  const route = payload.routes[0];
  const leg = route.legs?.[0] || {};
  return {
    polyline: route.overview_polyline?.points || "",
    distanceText: leg.distance?.text || "",
    durationText: leg.duration?.text || "",
    startAddress: leg.start_address || orig,
    endAddress: leg.end_address || dest,
  };
}

async function lookupPlace(db, departmentId, { latitude, longitude, address = "" } = {}) {
  const key = await getMapsKey(db, departmentId);
  if (!key) return { name: "", placeId: "" };

  if (latitude != null && longitude != null) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("result_type", "establishment|point_of_interest|premise");
    url.searchParams.set("key", key);
    const response = await fetch(url);
    const payload = await response.json();
    if (payload.status === "OK" && payload.results?.length) {
      const match = payload.results.find((item) => item.types?.includes("establishment"))
        || payload.results[0];
      return {
        name: match.formatted_address?.split(",")[0] || "",
        placeId: match.place_id || "",
      };
    }
  }

  if (address) {
    const geocoded = await geocodeAddress(db, departmentId, address);
    return { name: geocoded.formattedAddress?.split(",")[0] || "", placeId: geocoded.placeId || "" };
  }

  return { name: "", placeId: "" };
}

module.exports = {
  geocodeAddress,
  fetchDirections,
  lookupPlace,
};
