import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertOctagon, ChevronRight, Droplets, Gauge, List, LocateFixed, Loader2, Map as MapIcon, MapPin, Maximize2, Navigation, Pencil, Search, TriangleAlert, UserRound, X,
} from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { localDate } from "../fieldValidation.js";
import { isCrewSessionActive } from "../fieldCrew.js";
import {
  checkedLabel, districtCounts, findHydrant, formatDistance, hydrantAddress, hydrantDistrict, hydrantFlowColor, hydrantKey, hydrantLabel,
  hydrantSummary, isDueThisYear, isOutOfServiceHydrant, isPrivateHydrant, MAP_LEGEND, searchHydrants,
} from "../fieldHydrants.js";
import { useLiveLocation } from "../fieldLocation.js";
import { gpsText } from "./FlowTestScreen.jsx";
import { Banner, Field, PickerButton, PickerSheet, Screen, Section, Segmented, cx, formatDay, formatWhen } from "../ui.jsx";

const HydrantMap = lazy(() => import("./HydrantMap.jsx"));

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "oos", label: "Out of service" },
];

/**
 * Crew session: who is testing, which shift and date (8 hours), like the desktop
 * hydrant app. When the shift and name are already known it starts by itself;
 * once set it's one line with Change, not a form on every screen.
 */
export function CrewSessionPanel({ compact = false }) {
  const { crew, crewLoaded, setCrew, refData, snapshot, recent } = useField();
  const personnel = refItems(refData, "personnel");
  const active = isCrewSessionActive(crew);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    testedBy: crew?.testedBy || snapshot.displayName || "",
    shift: crew?.shift || recent.shift || snapshot.assignedShift || "",
    date: localDate(),
  }));
  const [sheet, setSheet] = useState("");
  const autoStartedRef = useRef(false);
  const [autoFailed, setAutoFailed] = useState(false);

  // Known shift and name (this person, their usual or last shift): start the
  // shift instead of waiting for a tap. Waits for any saved shift to load first.
  const knownShift = recent.shift || snapshot.assignedShift || "";
  const knownName = snapshot.displayName || "";
  useEffect(() => {
    if (!crewLoaded || active || editing || autoStartedRef.current || !knownShift || !knownName) return;
    autoStartedRef.current = true;
    setCrew({ testedBy: knownName, shift: knownShift, date: localDate() }).catch(() => setAutoFailed(true));
  }, [crewLoaded, active, editing, knownShift, knownName, setCrew]);

  if (active && !editing) {
    return (
      <button type="button" className={cx("fa-crew", compact && "is-compact")} onClick={() => {
        setDraft({ testedBy: crew.testedBy, shift: crew.shift, date: crew.date || localDate() });
        setEditing(true);
      }}>
        <UserRound size={20} />
        <span>
          <strong>{crew.testedBy} · {crew.shift}</strong>
          <small>Your shift · until {new Date(crew.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>
        </span>
        <span className="fa-link">Change</span>
      </button>
    );
  }
  // Waiting for the saved shift or the automatic start (a moment).
  if (!active && !editing && !autoFailed && (!crewLoaded || (knownShift && knownName))) return null;
  return (
    <Section title="Set your shift" hint={compact ? "" : "Used on every inspection and flow test for the next 8 hours."}>
      <div className="fa-grid-2">
        <Field label="Shift" required>
          <PickerButton value={draft.shift} onClick={() => setSheet("shift")} />
        </Field>
        <Field label="Date">
          <input className="fa-input" type="date" value={draft.date} max={localDate()} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
        </Field>
      </div>
      <Field label="Tested by" required>
        <PickerButton value={draft.testedBy} onClick={() => setSheet("by")} />
      </Field>
      <div className="fa-inline-actions">
        <button type="button" className="fa-btn fa-btn-primary fa-btn-grow" disabled={!draft.shift || !draft.testedBy} onClick={async () => { await setCrew(draft); setEditing(false); }}>
          {active ? "Save" : "Set shift"}
        </button>
        {active ? <button type="button" className="fa-btn fa-btn-ghost" onClick={() => setEditing(false)}>Cancel</button> : null}
      </div>
      <PickerSheet open={sheet === "shift"} title="Shift" options={(snapshot.profile?.shifts || []).map((value) => ({ value, label: value }))} allowCustom selected={[draft.shift]} onPick={(value) => { setDraft((current) => ({ ...current, shift: value })); setSheet(""); }} onClose={() => setSheet("")} />
      <PickerSheet open={sheet === "by"} title="Tested by" options={personnel.map((person) => ({ value: person.name, label: person.name, detail: [person.rank, person.shift].filter(Boolean).join(" · ") }))} recent={recent.testedByList || []} allowCustom selected={[draft.testedBy]} onPick={(value) => { setDraft((current) => ({ ...current, testedBy: value })); setSheet(""); }} onClose={() => setSheet("")} />
    </Section>
  );
}

function TodayActivity() {
  const { refData, records } = useField();
  const today = localDate();
  const rows = useMemo(() => {
    const server = refItems(refData, "dailyActivity").map((row) => ({
      id: row.id,
      type: row.type,
      hydrant: row.hydrant_id || row.location_id,
      by: row.tested_by,
      at: row.created_at,
      result: row.result,
      pending: false,
    }));
    const serverIds = new Set(server.map((row) => `${row.type}:${row.hydrant}`));
    const local = records
      .filter((row) => ["hydrantInspection", "flowTest", "hydrantEdit"].includes(row.kind) && row.status !== "draft")
      .filter((row) => localDate(new Date(row.savedAt || row.createdAt)) === today)
      .map((row) => ({
        id: row.localId,
        type: row.kind === "flowTest" ? "Flow Test" : row.kind === "hydrantEdit" ? "Hydrant info" : "Inspection",
        hydrant: row.data?.hydrant?.hydrant_id || "",
        by: row.data?.testedBy || row.data?.editedBy || "",
        at: row.savedAt,
        result: row.subtitle,
        pending: row.status !== "synced",
      }))
      .filter((row) => row.pending || !serverIds.has(`${row.type}:${row.hydrant}`));
    return [...local, ...server].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [refData, records, today]);
  const inspections = rows.filter((row) => row.type === "Inspection").length;
  const flows = rows.filter((row) => row.type === "Flow Test").length;
  return (
    <Section title="Today's activity" aside={<span className="fa-hint">{inspections} inspections · {flows} flow tests</span>}>
      {!rows.length ? <p className="fa-empty">Nothing yet today.</p> : (
        <div className="fa-list">
          {rows.slice(0, 30).map((row) => (
            <div key={row.id} className="fa-row is-static">
              <span className="fa-row-text">
                <strong>{row.hydrant} · {row.type}</strong>
                <small>{[row.by, formatWhen(row.at), row.result].filter(Boolean).join(" · ")}</small>
              </span>
              {row.pending ? <span className="fa-status tone-info">Saved on device</span> : null}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function HydrantDetail({ hydrant, onClose }) {
  const { caps, navigate, records, crew } = useField();
  const key = hydrantKey(hydrant);
  const local = records.filter((record) => record.data?.hydrant && hydrantKey(record.data.hydrant) === key && record.status !== "draft");
  const localLast = local.filter((record) => record.kind === "hydrantInspection" || record.kind === "flowTest").map((record) => record.data.date).sort().pop();
  const lastChecked = [hydrant.last_checked, localLast].filter(Boolean).sort().pop();
  const privateHydrant = isPrivateHydrant(hydrant);
  const needsSession = !isCrewSessionActive(crew);
  return (
    <Screen title={hydrantLabel(hydrant)} subtitle={hydrantAddress(hydrant)} onBack={onClose}>
      {privateHydrant ? <Banner tone="warn" icon={<AlertOctagon size={22} />} title="Private hydrant — do not test">Report damage only.</Banner> : null}
      <div className="fa-facts">
        <div><span>Status</span><strong>{hydrant.status || "Unknown"}</strong></div>
        <div><span>Last checked</span><strong>{lastChecked ? formatDay(lastChecked) : "Never"}</strong></div>
        <div><span>Flow</span><strong><span className="fa-swatch" style={{ background: hydrantFlowColor(hydrant) }} /> {hydrant.nfpa_class || hydrant.flow_result || "Not tested"}</strong></div>
        <div><span>GPM</span><strong>{Number(hydrant.flow_gpm) > 0 ? hydrant.flow_gpm : "—"}</strong></div>
        <div><span>District</span><strong>{hydrantDistrict(hydrant)}</strong></div>
        <div><span>Type</span><strong>{hydrant.hydrant_type || "—"}</strong></div>
        <div><span>Provider</span><strong>{hydrant.provider || hydrant.water_assoc || "—"}</strong></div>
        <div><span>This year</span><strong>{checkedLabel(hydrant)}</strong></div>
        <div><span>Lat &amp; Long</span><strong>{gpsText(hydrant) || "—"}</strong></div>
      </div>
      {caps.hydrants && !privateHydrant ? <CrewSessionPanel compact /> : null}
      <div className="fa-action-list">
        {caps.hydrants && !privateHydrant ? (
          <button type="button" className="fa-action tone-blue" disabled={needsSession} onClick={() => navigate("hydrantInspection", { hydrantKey: key })}>
            <Droplets size={28} />
            <span><strong>Inspect</strong><small>{needsSession ? "Set your shift first" : "Checklist with photos and repair flags"}</small></span>
            <ChevronRight size={22} />
          </button>
        ) : null}
        {caps.hydrants && !privateHydrant ? (
          <button type="button" className="fa-action tone-teal" disabled={needsSession} onClick={() => navigate("flowTest", { hydrantKey: key })}>
            <Gauge size={28} />
            <span><strong>Flow test</strong><small>{needsSession ? "Set your shift first" : "Static, residual and pitot — GPM and NFPA class"}</small></span>
            <ChevronRight size={22} />
          </button>
        ) : null}
        {caps.hydrantEdit ? (
          <button type="button" className="fa-action tone-slate" disabled={needsSession} onClick={() => navigate("hydrantEdit", { hydrantKey: key })}>
            <Pencil size={26} />
            <span><strong>Edit hydrant info</strong><small>{needsSession ? "Set your shift first" : "Status, district, GPS, provider, notes"}</small></span>
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

const VIEW_PREF_KEY = "forge-field-hydrant-view";

function readViewPref() {
  try {
    return window.localStorage.getItem(VIEW_PREF_KEY) === "list" ? "list" : "map";
  } catch {
    return "map";
  }
}

/** Card under the map for the tapped hydrant, like the desktop hydrant info box. */
function MapHydrantCard({ hydrant, distance, onClose }) {
  const { caps, navigate, crew } = useField();
  const key = hydrantKey(hydrant);
  const privateHydrant = isPrivateHydrant(hydrant);
  const needsSession = !isCrewSessionActive(crew);
  const canTest = caps.hydrants && !privateHydrant;
  return (
    <div className="fa-map-card">
      <div className="fa-map-card-head">
        <span className="fa-dot" style={{ background: hydrantFlowColor(hydrant) }} aria-hidden="true" />
        <span className="fa-row-text">
          <strong>{hydrantLabel(hydrant)}</strong>
          <small>{[hydrantAddress(hydrant), Number.isFinite(distance) ? formatDistance(distance) : ""].filter(Boolean).join(" · ") || "No address"}</small>
        </span>
        <button type="button" className="fa-icon-btn sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <p className="fa-map-card-meta">
        Flow: {hydrant.nfpa_class || hydrant.flow_result || "Not tested"}{Number(hydrant.flow_gpm) > 0 ? ` · ${hydrant.flow_gpm} GPM` : ""} · <span className={cx(isDueThisYear(hydrant) && "tone-text-warn")}>{checkedLabel(hydrant)}</span>
      </p>
      {privateHydrant ? <p className="fa-error-text">Private hydrant — do not test. Report damage only.</p> : null}
      {canTest && needsSession ? <p className="fa-hint">Set your shift above to inspect or flow test.</p> : null}
      <div className="fa-map-card-actions">
        {canTest ? (
          <button type="button" className="fa-btn fa-btn-primary" disabled={needsSession} onClick={() => navigate("hydrantInspection", { hydrantKey: key })}>
            <Droplets size={18} /> Inspect
          </button>
        ) : null}
        {canTest ? (
          <button type="button" className="fa-btn fa-btn-primary" disabled={needsSession} onClick={() => navigate("flowTest", { hydrantKey: key })}>
            <Gauge size={18} /> Flow test
          </button>
        ) : null}
        <button type="button" className="fa-btn fa-btn-secondary" onClick={() => navigate("hydrants", { hydrantKey: key })}>
          More <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

export default function HydrantsScreen({ params = {} }) {
  const { refData, back, navigate, caps } = useField();
  const hydrants = refItems(refData, "hydrants");
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setViewState] = useState(readViewPref);
  const [nearMe, setNearMe] = useState(false);
  const [follow, setFollow] = useState(true);
  const [mapSelected, setMapSelected] = useState("");
  const [fitKey, setFitKey] = useState(0);
  // The map always tracks you; the list does when "Near me" is on.
  const live = useLiveLocation(!params.hydrantKey && (view === "map" || nearMe));
  const position = live.position;
  const selected = params.hydrantKey ? findHydrant(hydrants, params.hydrantKey) : null;
  const inDistrict = useMemo(() => (district === "all" ? hydrants : hydrants.filter((hydrant) => hydrantDistrict(hydrant) === district)), [hydrants, district]);
  const filtered = useMemo(() => inDistrict.filter((hydrant) => (
    statusFilter === "all" || (statusFilter === "due" ? isDueThisYear(hydrant) : isOutOfServiceHydrant(hydrant))
  )), [inDistrict, statusFilter]);
  const results = useMemo(() => searchHydrants(filtered, query, position, 80), [filtered, query, position]);
  // Map dots don't depend on your position, so they aren't redrawn as you move.
  const mapHydrants = useMemo(() => (query ? searchHydrants(filtered, query, null, 2000).map((row) => row.hydrant) : filtered), [filtered, query]);
  const nearest = useMemo(() => (position ? searchHydrants(filtered, "", position, 1)[0] || null : null), [filtered, position]);
  const summary = useMemo(() => hydrantSummary(inDistrict), [inDistrict]);
  const districts = useMemo(() => districtCounts(hydrants), [hydrants]);
  const mapCard = mapSelected ? findHydrant(hydrants, mapSelected) : null;

  if (selected) return <HydrantDetail hydrant={selected} onClose={back} />;

  const setView = (value) => {
    setViewState(value);
    if (value === "map") setFollow(true);
    try {
      window.localStorage.setItem(VIEW_PREF_KEY, value);
    } catch {
      // ignore
    }
  };

  const locateLabel = live.status === "locating" ? "Finding you…" : follow && position ? "Following you" : "Center on me";

  return (
    <Screen title="Hydrants" subtitle={hydrants.length ? `${hydrants.length.toLocaleString()} on this device` : ""} onBack={back} wide>
      {!hydrants.length ? (
        <Banner tone="info" icon={<Droplets size={22} />} title="No hydrants on this device">Connect and tap Update on the home screen to download your hydrants.</Banner>
      ) : (
        <>
          {caps.hydrants ? <CrewSessionPanel /> : null}
          <div className="fa-district-strip" role="tablist" aria-label="District">
            <button type="button" className={cx("fa-district", district === "all" && "is-active")} onClick={() => setDistrict("all")}>All <small>{hydrants.length}</small></button>
            {districts.map((row) => (
              <button key={row.district} type="button" className={cx("fa-district", district === row.district && "is-active")} onClick={() => setDistrict(row.district)}>
                {row.district === "Unassigned" ? "Unassigned" : `District ${row.district}`} <small>{row.count}</small>
              </button>
            ))}
          </div>
          <div className="fa-metrics">
            <div><strong>{summary.checked}</strong><span>Inspected {new Date().getFullYear()}</span></div>
            <div className="tone-warn"><strong>{summary.due}</strong><span>Due</span></div>
            <div className="tone-bad"><strong>{summary.outOfService}</strong><span>Out of service</span></div>
            <div className="tone-private"><strong>{summary.private}</strong><span>Private</span></div>
          </div>
          <div className="fa-search-row">
            <label className="fa-search">
              <Search size={20} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hydrant number, street or district" enterKeyHint="search" autoComplete="off" />
              {query ? <button type="button" className="fa-icon-btn sm" onClick={() => setQuery("")} aria-label="Clear"><X size={18} /></button> : null}
            </label>
            {view === "list" ? (
              <button type="button" className={cx("fa-btn", nearMe ? "fa-btn-primary" : "fa-btn-secondary")} onClick={() => setNearMe((on) => !on)} aria-label="Near me" aria-pressed={nearMe}>
                {nearMe && live.status === "locating" ? <Loader2 size={20} className="fa-spin" /> : <LocateFixed size={20} />}<span className="fa-hide-sm">Near me</span>
              </button>
            ) : null}
          </div>
          <div className="fa-hub-controls">
            <Segmented value={statusFilter} options={STATUS_FILTERS} onChange={setStatusFilter} columns={3} />
            <Segmented value={view} options={[{ value: "map", label: <><MapIcon size={18} /> Map</> }, { value: "list", label: <><List size={18} /> List</> }]} onChange={setView} columns={2} />
          </div>
          {live.error && live.status !== "on" ? <p className="fa-error-text">{live.error}</p> : null}
          {view === "map" ? (
            <>
              <div className="fa-map-wrap">
                <Suspense fallback={<div className="fa-map fa-map-loading"><Loader2 size={24} className="fa-spin" /></div>}>
                  <HydrantMap
                    hydrants={mapHydrants}
                    position={position}
                    follow={follow}
                    onFollowChange={setFollow}
                    selectedKey={mapSelected}
                    onSelect={(key) => { setMapSelected(key); setFollow(false); }}
                    fitKey={fitKey}
                  />
                </Suspense>
                <div className="fa-map-tools">
                  <button
                    type="button"
                    className={cx("fa-map-tool", follow && position && "is-on")}
                    onClick={() => setFollow(true)}
                    aria-label={locateLabel}
                    title={locateLabel}
                  >
                    {live.status === "locating" ? <Loader2 size={22} className="fa-spin" /> : follow && position ? <Navigation size={22} /> : <LocateFixed size={22} />}
                  </button>
                  <button type="button" className="fa-map-tool" onClick={() => { setFollow(false); setFitKey((n) => n + 1); }} aria-label="Show all hydrants" title="Show all hydrants">
                    <Maximize2 size={20} />
                  </button>
                </div>
                {position ? (
                  <div className="fa-map-status" aria-live="polite">
                    <span className="fa-map-live" aria-hidden="true" />
                    {follow ? "Following you" : "Live location"}{position.accuracy ? ` · ±${formatDistance(position.accuracy)}` : ""}
                  </div>
                ) : null}
              </div>
              {mapCard ? (
                <MapHydrantCard
                  hydrant={mapCard}
                  distance={position ? searchHydrants([mapCard], "", position, 1)[0]?.distance : Infinity}
                  onClose={() => setMapSelected("")}
                />
              ) : nearest && Number.isFinite(nearest.distance) ? (
                <button type="button" className="fa-row fa-nearest" onClick={() => { setMapSelected(hydrantKey(nearest.hydrant)); setFollow(false); }}>
                  <span className="fa-dot" style={{ background: hydrantFlowColor(nearest.hydrant) }} aria-hidden="true" />
                  <span className="fa-row-text">
                    <strong>Nearest: {hydrantLabel(nearest.hydrant)}</strong>
                    <small><MapPin size={13} /> {hydrantAddress(nearest.hydrant) || "No address"} · {formatDistance(nearest.distance)}</small>
                  </span>
                  <span className={cx("fa-row-meta", isDueThisYear(nearest.hydrant) && "tone-text-warn")}>{checkedLabel(nearest.hydrant)}</span>
                </button>
              ) : null}
              <div className="fa-legend" aria-label="Map colours">
                {MAP_LEGEND.map((item) => (
                  <span key={item.label}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</span>
                ))}
                <span><i className="fa-legend-me" aria-hidden="true" />You</span>
              </div>
              {!navigator.onLine ? <p className="fa-hint">Offline: map pictures show only for areas viewed before; hydrant dots and your location always show.</p> : null}
            </>
          ) : (
            <div className="fa-list">
              {results.map(({ hydrant, distance }) => (
                <button key={hydrantKey(hydrant)} type="button" className="fa-row" onClick={() => navigate("hydrants", { hydrantKey: hydrantKey(hydrant) })}>
                  <span className="fa-dot" style={{ background: hydrantFlowColor(hydrant) }} aria-hidden="true" />
                  <span className="fa-row-text">
                    <strong>{hydrantLabel(hydrant)}</strong>
                    <small><MapPin size={13} /> {hydrantAddress(hydrant) || "No address"}{Number.isFinite(distance) ? ` · ${formatDistance(distance)}` : ""}</small>
                  </span>
                  <span className={cx("fa-row-meta", isDueThisYear(hydrant) && "tone-text-warn")}>{checkedLabel(hydrant)}</span>
                </button>
              ))}
              {!results.length ? <p className="fa-empty">{query ? `No hydrant matches “${query}”.` : "No hydrants in this view."}</p> : null}
            </div>
          )}
          {caps.hydrants ? <TodayActivity /> : null}
        </>
      )}
    </Screen>
  );
}
