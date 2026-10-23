import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAlertAddress,
  buildIncidentNotes,
  buildStationAddress,
  filterNearbyHydrants,
  formatAlertCode,
  formatClearCountdown,
  formatDispatchedClock,
  formatLastUpdated,
  formatWindDirection,
  getRecentAlerts,
  getTakeoverRemainingMs,
  matchBusinessDirectory,
  resolveDisplayStation,
  selectActiveAlert,
} from "../../lib/alertDashboard.js";
import { resolveDepartmentLogoUrl } from "../../lib/brandAssets.js";
import { fetchWeatherAtTime } from "../../lib/alertWeather.js";
import {
  fetchAlertDirections,
  geocodeAlertAddress,
  lookupAlertPlace,
} from "../../lib/alertDashboardService.js";
import { ensureDepartmentGoogleMaps, loadGoogleMapsScript } from "../../lib/googleApisService.js";
import { loadStaticHydrants, loadTenantHydrantRecords } from "../../lib/hydrantTenantService.js";
import { syncActive911Alerts } from "../../lib/active911Service.js";

function decodePolyline(encoded = "", googleMaps) {
  if (!encoded || !googleMaps?.geometry?.encoding) return [];
  return googleMaps.geometry.encoding.decodePath(encoded);
}

function formatWeatherLine(weather = {}) {
  const temp = weather.temperature != null ? `${Math.round(weather.temperature)}°F` : "—";
  const condition = weather.condition ? ` ${weather.condition}` : "";
  const wind = weather.windSpeed != null
    ? `Wind: ${Math.round(weather.windSpeed)} mph ${formatWindDirection(weather.windDirection)}`
    : "Wind: —";
  return { temp: `${temp}${condition}`, wind };
}

export default function AlertDashboardView({
  departmentId = "",
  gatewaySlug = "",
  profile = {},
  alerts = [],
  config = {},
  businessDirectory = [],
  displays = [],
  displayId = "",
  mapsApiKey = "",
  publicMode = false,
}) {
  const streetViewRef = useRef(null);
  const overviewRef = useRef(null);
  const routeRef = useRef(null);
  const mapsRef = useRef({ overview: null, route: null, routeLine: null, markers: [] });

  const [mapsReady, setMapsReady] = useState(false);
  const [coords, setCoords] = useState(null);
  const [originCoords, setOriginCoords] = useState(null);
  const [weather, setWeather] = useState({ temperature: null, windSpeed: null, windDirection: null, condition: "" });
  const [placeName, setPlaceName] = useState("");
  const [routeMeta, setRouteMeta] = useState({ distanceText: "", durationText: "" });
  const [hydrants, setHydrants] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastUpdated, setLastUpdated] = useState(() => formatLastUpdated(new Date()));
  const [clearCountdown, setClearCountdown] = useState("");

  const display = useMemo(
    () => displays.find((item) => item.id === displayId) || displays[0] || null,
    [displays, displayId]
  );

  const activeAlert = useMemo(
    () => selectActiveAlert(alerts, config),
    [alerts, config]
  );

  const recentAlerts = useMemo(
    () => getRecentAlerts(alerts, 5),
    [alerts]
  );

  const businessMatch = useMemo(
    () => (activeAlert ? matchBusinessDirectory(activeAlert, businessDirectory) : null),
    [activeAlert, businessDirectory]
  );

  const logoSrc = resolveDepartmentLogoUrl(profile.logoUrl || profile.logo || "");
  const weatherLine = formatWeatherLine(weather);
  const incidentNotes = activeAlert ? buildIncidentNotes(activeAlert, businessMatch) : "";
  const headerAddress = activeAlert
    ? buildAlertAddress(activeAlert).toUpperCase()
    : "AWAITING DISPATCH";
  const headerUnits = activeAlert ? String(activeAlert.units || "—").toUpperCase() : "—";
  const headerCode = activeAlert ? formatAlertCode(activeAlert).toUpperCase() : "—";

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        if (publicMode) {
          if (!mapsApiKey) {
            if (!cancelled) {
              setNotice("Maps not configured — save Google APIs in admin to enable Street View and route maps.");
            }
            return;
          }
          await loadGoogleMapsScript(mapsApiKey, "places,geometry");
        } else {
          await ensureDepartmentGoogleMaps(departmentId);
        }
        if (!cancelled) setMapsReady(true);
      } catch (err) {
        if (!cancelled) setNotice(err.message || "Google Maps unavailable for this display.");
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [departmentId, mapsApiKey, publicMode]);

  useEffect(() => {
    if (publicMode || !departmentId) return undefined;
    const intervalSec = Number(config.autoSyncIntervalSec) || 90;
    async function syncAlerts() {
      try {
        await syncActive911Alerts(departmentId, { alertDays: 1, alertMinutes: 180 });
        setLastUpdated(formatLastUpdated(new Date()));
      } catch {
        // Background sync stays quiet on wall displays.
      }
    }
    syncAlerts();
    const timer = window.setInterval(syncAlerts, intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [departmentId, config.autoSyncIntervalSec, publicMode]);

  useEffect(() => {
    if (!departmentId) return undefined;
    let cancelled = false;
    async function loadHydrants() {
      const [staticHydrants, tenantHydrants] = await Promise.all([
        loadStaticHydrants(departmentId),
        publicMode ? Promise.resolve([]) : loadTenantHydrantRecords(departmentId),
      ]);
      if (!cancelled) setHydrants([...staticHydrants, ...tenantHydrants]);
    }
    loadHydrants();
    return () => { cancelled = true; };
  }, [departmentId, publicMode]);

  useEffect(() => {
    if (!activeAlert) {
      setCoords(null);
      setOriginCoords(null);
      setPlaceName("");
      setRouteMeta({ distanceText: "", durationText: "" });
      setClearCountdown("");
      return undefined;
    }

    let cancelled = false;
    async function resolveLocation() {
      setError("");
      try {
        let latitude = Number(activeAlert.latitude);
        let longitude = Number(activeAlert.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          const geocoded = await geocodeAlertAddress(departmentId, buildAlertAddress(activeAlert), gatewaySlug);
          latitude = Number(geocoded.latitude);
          longitude = Number(geocoded.longitude);
        }
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error("Unable to resolve incident coordinates.");
        }
        if (cancelled) return;
        setCoords({ latitude, longitude });
        setLastUpdated(formatLastUpdated(new Date()));

        const [weatherResult, placeResult] = await Promise.all([
          fetchWeatherAtTime(latitude, longitude, activeAlert.sentAt),
          businessMatch?.businessName
            ? Promise.resolve({ name: businessMatch.businessName })
            : lookupAlertPlace(departmentId, { latitude, longitude, address: buildAlertAddress(activeAlert), gatewaySlug }),
        ]);
        if (cancelled) return;
        setWeather(weatherResult);
        setPlaceName(placeResult?.name || businessMatch?.businessName || "");

        const station = resolveDisplayStation(profile, display);
        const stationAddress = buildStationAddress(station || {});
        if (stationAddress) {
          const origin = await geocodeAlertAddress(departmentId, stationAddress, gatewaySlug);
          if (!cancelled && Number.isFinite(Number(origin.latitude))) {
            setOriginCoords({ latitude: Number(origin.latitude), longitude: Number(origin.longitude) });
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load incident location.");
      }
    }

    resolveLocation();
    return () => { cancelled = true; };
  }, [activeAlert, businessMatch, departmentId, display, profile, gatewaySlug]);

  useEffect(() => {
    if (!activeAlert) return undefined;
    const tick = () => setClearCountdown(formatClearCountdown(activeAlert, config));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeAlert, config]);

  useEffect(() => {
    if (!mapsReady || !coords || !streetViewRef.current || !window.google?.maps) return undefined;

    const googleMaps = window.google.maps;
    const position = { lat: coords.latitude, lng: coords.longitude };
    const panorama = new googleMaps.StreetViewPanorama(streetViewRef.current, {
      position,
      pov: { heading: Number(config.streetViewHeading) || 0, pitch: 0 },
      zoom: 1,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      linksControl: false,
      panControl: false,
      zoomControl: false,
    });

    const streetViewService = new googleMaps.StreetViewService();
    streetViewService.getPanorama({ location: position, radius: 120 }, (data, status) => {
      if (status === "OK" && data?.location?.latLng) {
        panorama.setPosition(data.location.latLng);
        if (originCoords) {
          const heading = googleMaps.geometry.spherical.computeHeading(
            data.location.latLng,
            new googleMaps.LatLng(originCoords.latitude, originCoords.longitude)
          );
          panorama.setPov({ heading, pitch: 0 });
        }
      }
    });

    return undefined;
  }, [mapsReady, coords, originCoords, config.streetViewHeading]);

  useEffect(() => {
    if (!mapsReady || !coords || !overviewRef.current || !window.google?.maps) return undefined;

    const googleMaps = window.google.maps;
    const center = { lat: coords.latitude, lng: coords.longitude };
    const overview = mapsRef.current.overview || new googleMaps.Map(overviewRef.current, {
      center,
      zoom: 17,
      mapTypeId: "hybrid",
      disableDefaultUI: true,
      gestureHandling: "none",
      clickableIcons: false,
    });
    mapsRef.current.overview = overview;
    overview.setCenter(center);

    mapsRef.current.markers.forEach((marker) => marker.setMap(null));
    mapsRef.current.markers = [];

    const incidentMarker = new googleMaps.Marker({
      map: overview,
      position: center,
      title: "Incident",
      label: { text: "A", color: "#ffffff", fontWeight: "700" },
      icon: {
        path: googleMaps.SymbolPath.CIRCLE,
        scale: 11,
        fillColor: "#2563eb",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "#ffffff",
      },
    });
    mapsRef.current.markers.push(incidentMarker);

    filterNearbyHydrants(hydrants, coords.latitude, coords.longitude).forEach((hydrant) => {
      const lat = Number(hydrant.latitude ?? hydrant.lat);
      const lng = Number(hydrant.longitude ?? hydrant.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = new googleMaps.Marker({
        map: overview,
        position: { lat, lng },
        title: hydrant.location_id || hydrant.hydrant_id || "Hydrant",
        icon: {
          path: googleMaps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#dc2626",
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#ffffff",
        },
      });
      mapsRef.current.markers.push(marker);
    });

    return undefined;
  }, [mapsReady, coords, hydrants]);

  useEffect(() => {
    if (!mapsReady || !coords || !routeRef.current || !window.google?.maps) return undefined;

    let cancelled = false;
    async function drawRoute() {
      const googleMaps = window.google.maps;
      const routeMap = mapsRef.current.route || new googleMaps.Map(routeRef.current, {
        center: { lat: coords.latitude, lng: coords.longitude },
        zoom: 12,
        mapTypeId: "roadmap",
        disableDefaultUI: true,
        gestureHandling: "none",
        clickableIcons: false,
      });
      mapsRef.current.route = routeMap;

      if (mapsRef.current.routeLine) {
        mapsRef.current.routeLine.setMap(null);
        mapsRef.current.routeLine = null;
      }

      if (!originCoords) {
        routeMap.setCenter({ lat: coords.latitude, lng: coords.longitude });
        routeMap.setZoom(14);
        return;
      }

      try {
        const directions = await fetchAlertDirections(departmentId, {
          originLat: originCoords.latitude,
          originLng: originCoords.longitude,
          lat: coords.latitude,
          lng: coords.longitude,
          gatewaySlug,
        });
        if (cancelled) return;
        setRouteMeta({
          distanceText: directions.distanceText || "",
          durationText: directions.durationText || "",
        });

        const path = decodePolyline(directions.polyline, googleMaps);
        if (path.length) {
          mapsRef.current.routeLine = new googleMaps.Polyline({
            path,
            strokeColor: "#84cc16",
            strokeOpacity: 0.95,
            strokeWeight: 6,
            map: routeMap,
          });
          const bounds = new googleMaps.LatLngBounds();
          path.forEach((point) => bounds.extend(point));
          routeMap.fitBounds(bounds, 48);
        }

        new googleMaps.Marker({
          map: routeMap,
          position: { lat: originCoords.latitude, lng: originCoords.longitude },
          label: { text: "1", color: "#ffffff", fontWeight: "700" },
          icon: {
            path: googleMaps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#16a34a",
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: "#ffffff",
          },
        });

        new googleMaps.Marker({
          map: routeMap,
          position: { lat: coords.latitude, lng: coords.longitude },
          label: { text: "!", color: "#ffffff", fontWeight: "700" },
          icon: {
            path: googleMaps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#dc2626",
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: "#ffffff",
          },
        });
      } catch (err) {
        if (!cancelled) setNotice(err.message || "Route unavailable.");
      }
    }

    drawRoute();
    return () => { cancelled = true; };
  }, [mapsReady, coords, originCoords, departmentId, gatewaySlug]);

  const showClearPill = activeAlert && getTakeoverRemainingMs(activeAlert, config) > 0;

  return (
    <div className={`alert-dashboard alert-dashboard-firehouse ${activeAlert ? "is-active" : "is-standby"}`}>
      <header className="alert-firehouse-banner">
        <div className="alert-firehouse-banner-left">
          <div className="alert-firehouse-dispatched-label">DISPATCHED</div>
          <div className="alert-firehouse-dispatched-time">
            {activeAlert ? formatDispatchedClock(activeAlert) : "—"}
          </div>
          {showClearPill ? (
            <div className="alert-firehouse-clear-pill">CLEARS IN {clearCountdown}</div>
          ) : null}
        </div>

        <div className="alert-firehouse-banner-center">
          <div className="alert-firehouse-code">{headerCode}</div>
          <div className="alert-firehouse-address">{headerAddress}</div>
          <div className="alert-firehouse-units">{headerUnits}</div>
        </div>

        <div className="alert-firehouse-banner-right">
          {logoSrc ? (
            <img className="alert-firehouse-logo" src={logoSrc} alt={profile.name || "Department"} />
          ) : null}
          <div className="alert-firehouse-weather">
            <div>{weatherLine.temp}</div>
            <div>{weatherLine.wind}</div>
            <div className="alert-firehouse-updated">Last Updated {lastUpdated}</div>
          </div>
        </div>
      </header>

      <div className="alert-firehouse-body">
        <aside className="alert-firehouse-sidebar">
          <h2 className="alert-firehouse-sidebar-title">LAST 5 INCIDENTS</h2>
          <ul className="alert-firehouse-incident-list">
            {recentAlerts.length ? recentAlerts.map((alert) => (
              <li
                key={alert.id || `${alert.description}-${alert.sentAt}`}
                className={activeAlert && alert.id === activeAlert.id ? "is-active" : ""}
              >
                <strong>{formatAlertCode(alert).toUpperCase()}</strong>
                <span>{buildAlertAddress(alert).toUpperCase()}</span>
                <span>{formatDispatchedClock(alert)}</span>
              </li>
            )) : (
              <li className="is-empty">
                <span>No recent incidents</span>
              </li>
            )}
          </ul>
        </aside>

        <div className="alert-firehouse-quad-grid">
          <div className="alert-firehouse-quad alert-firehouse-quad-streetview">
            <div ref={streetViewRef} className="alert-firehouse-map-host" aria-label="Street View" />
            {!coords ? (
              <div className="alert-firehouse-quad-placeholder">Street View waiting for coordinates.</div>
            ) : null}
          </div>

          <div className="alert-firehouse-quad alert-firehouse-quad-info">
            <h2 className="alert-firehouse-quad-title">INCIDENT INFORMATION</h2>
            <div className="alert-firehouse-info-box">
              {activeAlert ? (
                <>
                  {placeName ? <p className="alert-firehouse-business">{placeName}</p> : null}
                  <p>{incidentNotes}</p>
                </>
              ) : (
                <p>Waiting for incident information.</p>
              )}
            </div>
          </div>

          <div className="alert-firehouse-quad alert-firehouse-quad-satellite">
            <div ref={overviewRef} className="alert-firehouse-map-host" aria-label="Satellite overview" />
            {!coords ? (
              <div className="alert-firehouse-quad-placeholder">Satellite map waiting for coordinates.</div>
            ) : null}
          </div>

          <div className="alert-firehouse-quad alert-firehouse-quad-route">
            <div ref={routeRef} className="alert-firehouse-map-host" aria-label="Route map" />
            {!coords ? (
              <div className="alert-firehouse-quad-placeholder">Route map waiting for coordinates.</div>
            ) : null}
            {routeMeta.durationText ? (
              <div className="alert-firehouse-route-meta">
                {routeMeta.durationText}
                {routeMeta.distanceText ? ` · ${routeMeta.distanceText}` : ""}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {notice ? <p className="alert-dashboard-notice">{notice}</p> : null}
      {error ? <p className="alert-dashboard-error">{error}</p> : null}
    </div>
  );
}
