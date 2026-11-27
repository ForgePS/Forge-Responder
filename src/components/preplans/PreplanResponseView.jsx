import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CloudOff, Droplets, Layers, Map as MapIcon, Moon, ShieldCheck, Sun, X } from "lucide-react";
import {
  alertCategoryLabel,
  groupAlertsForResponse,
  resolveResponsePlan,
  summarizeHydrant,
} from "../../lib/preplans/alertModel.js";
import { buildResponseMap } from "../../lib/preplans/responseMapModel.js";
import { loadResponseData } from "../../lib/preplans/responseData.js";
import { findSymbol } from "../../lib/preplans/symbolCatalog.js";
import FloorPlanEditor from "./FloorPlanEditor.jsx";
import PreplanResponseMap from "./PreplanResponseMap.jsx";
import SymbolGlyph from "./SymbolGlyph.jsx";
import "../../theme/preplan-response.css";

const NIGHT_KEY = "forge-preplan-response-night";

function readNight() {
  try { return window.localStorage.getItem(NIGHT_KEY) === "1"; } catch { return false; }
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/**
 * Read-only emergency response view of a preplan's PUBLISHED revision.
 * Never shows a draft. Current alerts are shown apart from the approved plan.
 *
 * Online it loads the data itself. Offline (FORGE FIELD) it is given a saved
 * package as `data`, with `offline` describing how fresh that copy is, and
 * `footer` for the package's photos and documents.
 */
export default function PreplanResponseView({ departmentId, preplan, onClose, data = null, offline = null, footer = null, backgroundUrls = null }) {
  const [night, setNight] = useState(readNight);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [hydrants, setHydrants] = useState([]);
  const [hydrantRows, setHydrantRows] = useState([]);
  const [siteMap, setSiteMap] = useState(null);
  const [liveFailed, setLiveFailed] = useState([]);
  const [view, setView] = useState("plan"); // "map" | "plan"
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [showAlerts, setShowAlerts] = useState(true);
  const loadedAt = useMemo(() => new Date(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const loaded = data || await loadResponseData(departmentId, preplan);
        const { revision: published, buildings: withFloors, catalog: nextCatalog, siteMap: storedSiteMap } = loaded;
        // A read that failed is null: show that it failed, never "no alerts".
        const alertRows = loaded.alerts || [];
        const hydrantRows = loaded.hydrantRows || [];
        if (cancelled) return;
        setLiveFailed(loaded.failed || []);
        const wanted = new Set(preplan.hydrantIds || []);
        setRevision(published);
        setBuildings(withFloors);
        setCatalog(nextCatalog);
        setAlerts(alertRows);
        setSiteMap(storedSiteMap);
        setHydrantRows(hydrantRows);
        setHydrants(hydrantRows
          .filter((row) => wanted.has(String(row.id)) || wanted.has(String(row.hydrant_id)))
          .map((row) => summarizeHydrant(row)));
        const firstBuilding = withFloors.find((row) => row.floors.some((floor) => floor.plan)) || withFloors[0];
        setBuildingId(firstBuilding?.id || "");
        const floors = firstBuilding?.floors || [];
        setFloorId((floors.find((row) => row.kind === "ground" && row.plan) || floors.find((row) => row.plan) || floors[0])?.id || "");
        // Open on the site map when one was drawn for this revision; otherwise the floor plan.
        setView(storedSiteMap?.features?.length || !withFloors.some((row) => row.floors.some((f) => f.plan)) ? "map" : "plan");
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "Couldn't load the preplan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [departmentId, preplan.id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleNight() {
    const next = !night;
    setNight(next);
    try { window.localStorage.setItem(NIGHT_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
  }

  const plan = resolveResponsePlan({ preplan, publishedRevision: revision });
  const grouped = groupAlertsForResponse(alerts);
  const alertCount = grouped.verified.length + grouped.reported.length;
  const building = buildings.find((row) => row.id === buildingId);
  const floor = building?.floors.find((row) => row.id === floorId);
  const answers = revision?.sectionAnswers || {};
  const mapModel = useMemo(() => {
    const plansByFloor = new Map();
    for (const b of buildings) for (const f of b.floors) if (f.plan) plansByFloor.set(f.id, f.plan);
    return buildResponseMap({ siteMap, preplan, plansByFloor, floorId, hydrants: hydrantRows, alerts: [...grouped.verified, ...grouped.reported] });
  }, [siteMap, preplan, buildings, floorId, hydrantRows, alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const floorOnMap = mapModel.alignedFloorIds.includes(floorId);
  const usedSymbols = useMemo(() => {
    const ids = new Set();
    for (const b of buildings) for (const f of b.floors) for (const o of f.plan?.objects || []) if (o.type === "symbol") ids.add(o.symbolId);
    return [...ids].map((id) => findSymbol(id, catalog));
  }, [buildings, catalog]);

  const facts = [
    ["Address", [preplan.address, answers.city].filter(Boolean).join(", ")],
    ["Occupancy", preplan.occupancyName || preplan.facilityName],
    ["Construction", answers.constructionType],
    ["Sprinkler", answers.sprinkler],
    ["Alarm", answers.alarm || answers.fireAlarm],
    ["Primary access", revision?.accessPlan || answers.primaryAccess],
    ["Water supply", revision?.waterSupply || answers.nearestHydrants],
    ["Utilities", revision?.utilities],
    ["Hazards", revision?.hazards],
    ["Tactical notes", revision?.tacticalPlan],
  ].filter(([, value]) => value);

  return (
    <div className={`prv-root${night ? " is-night" : ""}${offline ? " prv-standalone" : ""}`} role="dialog" aria-modal="true" aria-label={`Response view: ${preplan.facilityName || preplan.occupancyName}`}>
      <header className="prv-header">
        <div className="prv-title">
          <strong>{preplan.facilityName || preplan.occupancyName || "Preplan"}</strong>
          <span>{preplan.address}</span>
        </div>
        <div className="prv-header-actions">
          <button type="button" className={`prv-btn prv-alert-btn${grouped.verified.some((row) => row.severity === "critical") ? " is-critical" : ""}`} onClick={() => setShowAlerts((v) => !v)} aria-pressed={showAlerts}>
            <AlertTriangle size={22} /> Alerts {alertCount}
          </button>
          <button type="button" className="prv-btn" onClick={toggleNight} aria-label={night ? "Day mode" : "Night mode"}>
            {night ? <Sun size={22} /> : <Moon size={22} />}
          </button>
          <button type="button" className="prv-btn" onClick={onClose} aria-label="Close response view"><X size={24} /></button>
        </div>
      </header>

      {loading ? <p className="prv-message">Loading preplan…</p> : null}
      {error ? <p className="prv-message prv-error">{error}</p> : null}

      {offline ? (
        <section className={`prv-offline is-${offline.state}`} role="status" aria-label="Offline copy">
          <CloudOff size={20} aria-hidden="true" />
          <div>
            <strong>Saved on this device · {offline.label}</strong>
            <span>
              Updated {offline.syncedAt ? new Date(offline.syncedAt).toLocaleString() : "unknown"}
              {offline.expiresAt ? ` · expires ${new Date(offline.expiresAt).toLocaleDateString()}` : ""}
            </span>
            {offline.message ? <span>{offline.message}</span> : null}
          </div>
        </section>
      ) : null}

      {!loading && !error ? (
        <div className="prv-body">
          {showAlerts ? (
            <section className="prv-alerts" aria-label="Current operational alerts">
              <h2>Current alerts</h2>
              <p className="prv-note">
                Current conditions, separate from the approved plan below. Each shows its source and status.
                {offline ? ` As of ${offline.syncedAt ? new Date(offline.syncedAt).toLocaleString() : "the last update"}; alerts raised since then aren't shown.` : ""}
              </p>
              {liveFailed.includes("alerts") ? (
                <p className="prv-note prv-warn" role="alert">Current alerts couldn&apos;t be loaded. Don&apos;t assume there are none; reload to try again.</p>
              ) : !alertCount ? <p className="prv-note">No current alerts on record.</p> : null}
              {liveFailed.includes("hydrants") ? (
                <p className="prv-note prv-warn" role="alert">Hydrants couldn&apos;t be loaded, so the map doesn&apos;t show them.</p>
              ) : null}
              {grouped.verified.map((alert) => (
                <article key={alert.id} className={`prv-alert sev-${alert.severity}`}>
                  <div className="prv-alert-head">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <strong>VERIFIED · {alertCategoryLabel(alert.category)}</strong>
                    <span className="prv-sev">{alert.severity.toUpperCase()}</span>
                  </div>
                  <p>{alert.description}</p>
                  <small>
                    Source: {alert.source === "fps_impairment" ? "Fire protection impairment record" : alert.source.replace("_", " ")}
                    {" · "}since {formatDate(alert.effectiveAt)}
                    {alert.lastVerifiedAt ? ` · verified ${formatDate(alert.lastVerifiedAt)}` : ""}
                    {alert.stale ? " · REVIEW DATE PASSED" : ""}
                  </small>
                </article>
              ))}
              {grouped.reported.map((alert) => (
                <article key={alert.id} className="prv-alert is-reported">
                  <div className="prv-alert-head">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <strong>REPORTED, NOT VERIFIED · {alertCategoryLabel(alert.category)}</strong>
                  </div>
                  <p>{alert.description}</p>
                  <small>Reported {formatDate(alert.effectiveAt)}{alert.createdByName ? ` by ${alert.createdByName}` : ""}</small>
                </article>
              ))}
            </section>
          ) : null}

          {plan.state !== "published" ? (
            <section className="prv-noplan" role="status">
              <h2>{plan.state === "unavailable" ? "Preplan withdrawn" : "No approved preplan"}</h2>
              <p>{plan.reason}</p>
            </section>
          ) : (
            <>
              <section className={`prv-verify${plan.stale ? " is-stale" : ""}`} aria-label="Verification">
                <span>Approved revision {revision.revisionNumber}</span>
                <span>Field verified {formatDate(plan.verifiedOn)}</span>
                <span>Next verification {formatDate(plan.dueOn)}</span>
                {offline ? null : <span>Loaded {loadedAt.toLocaleTimeString()}</span>}
                {plan.stale ? <strong>{plan.staleReason}</strong> : null}
              </section>

              {revision.dispatchSummary ? <p className="prv-summary">{revision.dispatchSummary}</p> : null}

              {buildings.length || mapModel.hasContent ? (
                <section className="prv-plans" aria-label="Site map and floor plans">
                  <div className="prv-switch" role="tablist" aria-label="View">
                    <button type="button" role="tab" aria-selected={view === "map"} className={`prv-chip${view === "map" ? " is-active" : ""}`} onClick={() => setView("map")}>
                      <MapIcon size={18} /> Site map
                    </button>
                    {buildings.length ? (
                      <button type="button" role="tab" aria-selected={view === "plan"} className={`prv-chip${view === "plan" ? " is-active" : ""}`} onClick={() => setView("plan")}>
                        <Layers size={18} /> Floor plan
                      </button>
                    ) : null}
                  </div>
                  <div className="prv-switch" role="tablist" aria-label="Buildings">
                    {buildings.map((row) => (
                      <button key={row.id} type="button" role="tab" aria-selected={row.id === buildingId} className={`prv-chip${row.id === buildingId ? " is-active" : ""}`} onClick={() => { setBuildingId(row.id); setFloorId(row.floors.find((f) => f.plan)?.id || row.floors[0]?.id || ""); }}>
                        <Building2 size={18} /> {row.name}
                      </button>
                    ))}
                  </div>
                  <div className="prv-switch" role="tablist" aria-label="Floors">
                    {(building?.floors || []).map((row) => (
                      <button key={row.id} type="button" role="tab" aria-selected={row.id === floorId} className={`prv-chip${row.id === floorId ? " is-active" : ""}`} onClick={() => setFloorId(row.id)}>
                        {row.name}
                      </button>
                    ))}
                  </div>
                  {view === "map" ? (
                    <>
                      {floor && !floorOnMap ? (
                        <p className="prv-note">{floor.name} isn&apos;t shown on the map: {mapModel.unconfirmedFloorIds.includes(floor.id) ? "its alignment wasn't confirmed" : "it wasn't aligned to the map"}. Use Floor plan.</p>
                      ) : null}
                      {offline && mapModel.hasContent ? (
                        <p className="prv-note">Satellite imagery isn&apos;t stored on the device (the provider doesn&apos;t allow it). Without a connection the map shows the drawn features and hydrants only.</p>
                      ) : null}
                      {mapModel.hasContent ? (
                        <PreplanResponseMap model={mapModel} catalog={catalog} floorName={floorOnMap ? floor?.name : ""} />
                      ) : (
                        <p className="prv-note">No site map was drawn for this preplan, and the occupancy has no map location.</p>
                      )}
                    </>
                  ) : floor?.plan ? (
                    <FloorPlanEditor
                      plan={floor.plan}
                      catalog={catalog}
                      backgroundUrl={floor.backgroundUrl || backgroundUrls?.[floor.plan.background?.fileId] || ""}
                      readOnly
                    />
                  ) : (
                    <p className="prv-note">No floor plan was approved for this floor.</p>
                  )}
                  {view === "plan" && usedSymbols.length ? (
                    <div className="prv-legend" aria-label="Legend">
                      {usedSymbols.map((symbol) => (
                        <span key={symbol.id}><SymbolGlyph symbol={symbol} size={20} /> {symbol.label}</span>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="prv-facts" aria-label="Building information">
                <h2>Building</h2>
                <dl>
                  {facts.map(([label, value]) => (<div key={label}><dt>{label}</dt><dd>{value}</dd></div>))}
                </dl>
              </section>

              {hydrants.length ? (
                <section className="prv-facts" aria-label="Water supply">
                  <h2><Droplets size={20} /> Hydrants</h2>
                  <ul className="prv-hydrants">
                    {hydrants.map((row) => (
                      <li key={row.id} className={row.warnings.length ? "has-warning" : ""}>
                        <strong>{row.label}</strong> {row.address}
                        <span>{row.flowGpm != null ? `${row.flowGpm} gpm` : "Flow unknown"}{row.staticPsi != null ? ` · static ${row.staticPsi} psi` : ""}{row.residualPsi != null ? ` · residual ${row.residualPsi} psi` : ""}</span>
                        {row.warnings.length ? <em>{row.warnings.join(" · ")}</em> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
          {footer}
        </div>
      ) : null}
    </div>
  );
}
