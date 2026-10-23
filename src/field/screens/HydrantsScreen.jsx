import { useMemo, useState } from "react";
import { ChevronRight, Droplets, Gauge, LocateFixed, Loader2, MapPin, Search, TriangleAlert, X } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { findHydrant, formatDistance, hydrantAddress, hydrantKey, hydrantLabel, hydrantStatusTone, searchHydrants } from "../fieldHydrants.js";
import { Banner, Screen, cx, formatDay } from "../ui.jsx";

function HydrantDetail({ hydrant, onClose }) {
  const { caps, navigate, records } = useField();
  const key = hydrantKey(hydrant);
  const local = records.filter((record) => record.data?.hydrant && hydrantKey(record.data.hydrant) === key);
  const localLast = local.filter((record) => record.kind === "hydrantInspection" || record.kind === "flowTest").map((record) => record.data.date).sort().pop();
  const lastChecked = [hydrant.last_checked, localLast].filter(Boolean).sort().pop();
  return (
    <Screen title={hydrantLabel(hydrant)} subtitle={hydrantAddress(hydrant)} onBack={onClose}>
      <div className="fa-facts">
        <div><span>Status</span><strong className={`tone-text-${hydrantStatusTone(hydrant)}`}>{hydrant.status || "Unknown"}</strong></div>
        <div><span>Last checked</span><strong>{lastChecked ? formatDay(lastChecked) : "Never"}</strong></div>
        <div><span>Flow class</span><strong>{hydrant.nfpa_class || hydrant.flow_result || "—"}</strong></div>
        <div><span>District</span><strong>{hydrant.district || "—"}</strong></div>
      </div>
      {hydrant.provider ? <p className="fa-hint">Water provider: {hydrant.provider}</p> : null}
      <div className="fa-action-list">
        {caps.hydrants ? (
          <button type="button" className="fa-action tone-blue" onClick={() => navigate("hydrantInspection", { hydrantKey: key })}>
            <Droplets size={28} />
            <span><strong>Inspect</strong><small>Annual / routine inspection checklist</small></span>
            <ChevronRight size={22} />
          </button>
        ) : null}
        {caps.hydrants ? (
          <button type="button" className="fa-action tone-teal" onClick={() => navigate("flowTest", { hydrantKey: key })}>
            <Gauge size={28} />
            <span><strong>Flow test</strong><small>Static, residual and pitot — GPM calculated</small></span>
            <ChevronRight size={22} />
          </button>
        ) : null}
        {caps.hydrantDamage ? (
          <button type="button" className="fa-action tone-amber" onClick={() => navigate("hydrantDamage", { hydrantKey: key })}>
            <TriangleAlert size={28} />
            <span><strong>Report damage</strong><small>Sent to the hydrant damage queue</small></span>
            <ChevronRight size={22} />
          </button>
        ) : null}
      </div>
    </Screen>
  );
}

export default function HydrantsScreen({ params = {} }) {
  const { refData, back, navigate } = useField();
  const hydrants = refItems(refData, "hydrants");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  const selected = params.hydrantKey ? findHydrant(hydrants, params.hydrantKey) : null;
  const results = useMemo(() => searchHydrants(hydrants, query, position), [hydrants, query, position]);

  if (selected) return <HydrantDetail hydrant={selected} onClose={back} />;

  function locate() {
    if (!navigator.geolocation) {
      setGeoError("This device can't share its location.");
      return;
    }
    setLocating(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (error) => {
        setGeoError(error.code === 1 ? "Location is blocked. Allow location for this site to find nearby hydrants." : "Couldn't get your location. Try again outside or search instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  return (
    <Screen title="Hydrants" subtitle={hydrants.length ? `${hydrants.length.toLocaleString()} on this device` : ""} onBack={back}>
      {!hydrants.length ? (
        <Banner tone="info" icon={<Droplets size={22} />} title="No hydrants on this device">
          Connect and tap Update on the home screen to download your hydrants.
        </Banner>
      ) : (
        <>
          <div className="fa-search-row">
            <label className="fa-search">
              <Search size={20} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hydrant number or street" enterKeyHint="search" autoComplete="off" />
              {query ? <button type="button" className="fa-icon-btn sm" onClick={() => setQuery("")} aria-label="Clear"><X size={18} /></button> : null}
            </label>
            <button type="button" className={cx("fa-btn", position ? "fa-btn-primary" : "fa-btn-secondary")} onClick={position ? () => setPosition(null) : locate} disabled={locating}>
              {locating ? <Loader2 size={20} className="fa-spin" /> : <LocateFixed size={20} />} {position ? "Nearest" : "Near me"}
            </button>
          </div>
          {geoError ? <p className="fa-error-text">{geoError}</p> : null}
          <div className="fa-list">
            {results.map(({ hydrant, distance }) => (
              <button key={hydrantKey(hydrant)} type="button" className="fa-row" onClick={() => navigate("hydrants", { hydrantKey: hydrantKey(hydrant) })}>
                <span className={`fa-dot tone-${hydrantStatusTone(hydrant)}`} aria-hidden="true" />
                <span className="fa-row-text">
                  <strong>{hydrantLabel(hydrant)}</strong>
                  <small><MapPin size={13} /> {hydrantAddress(hydrant) || "No address"}{Number.isFinite(distance) ? ` · ${formatDistance(distance)}` : ""}</small>
                </span>
                <span className="fa-row-meta">{hydrant.last_checked ? formatDay(hydrant.last_checked) : "Not checked"}</span>
              </button>
            ))}
            {!results.length ? <p className="fa-empty">No hydrant matches “{query}”.</p> : null}
          </div>
        </>
      )}
    </Screen>
  );
}
