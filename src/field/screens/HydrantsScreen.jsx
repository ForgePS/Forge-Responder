import { Suspense, lazy, useMemo, useState } from "react";
import {
  AlertOctagon, ChevronRight, Droplets, Gauge, List, LocateFixed, Loader2, Map as MapIcon, MapPin, Pencil, Search, TriangleAlert, UserRound, X,
} from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { localDate } from "../fieldValidation.js";
import { isCrewSessionActive } from "../fieldCrew.js";
import {
  checkedLabel, districtCounts, findHydrant, formatDistance, hydrantAddress, hydrantDistrict, hydrantFlowColor, hydrantKey, hydrantLabel,
  hydrantSummary, isDueThisYear, isOutOfServiceHydrant, isPrivateHydrant, searchHydrants,
} from "../fieldHydrants.js";
import { Banner, Field, PickerButton, PickerSheet, Screen, Section, Segmented, cx, formatDay, formatWhen } from "../ui.jsx";

const HydrantMap = lazy(() => import("./HydrantMap.jsx"));

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "oos", label: "Out of service" },
];

/** Crew session panel: who, shift, date and district (8 hours), like the desktop hydrant app. */
export function CrewSessionPanel({ compact = false }) {
  const { crew, setCrew, refData, snapshot, recent } = useField();
  const hydrants = refItems(refData, "hydrants");
  const personnel = refItems(refData, "personnel");
  const [editing, setEditing] = useState(!isCrewSessionActive(crew));
  const [draft, setDraft] = useState(() => ({
    testedBy: crew?.testedBy || snapshot.displayName,
    shift: crew?.shift || recent.shift || snapshot.assignedShift || "",
    date: localDate(),
    district: crew?.district || "",
  }));
  const [sheet, setSheet] = useState("");
  const districts = districtCounts(hydrants).map((row) => row.district);
  const active = isCrewSessionActive(crew);

  if (active && !editing) {
    return (
      <button type="button" className="fa-crew" onClick={() => setEditing(true)}>
        <UserRound size={20} />
        <span>
          <strong>{crew.testedBy} · {crew.shift}</strong>
          <small>{crew.district ? `District ${crew.district} · ` : "All districts · "}until {new Date(crew.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>
        </span>
        <span className="fa-link">Change</span>
      </button>
    );
  }
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
      <Field label="District">
        <Segmented value={draft.district} options={[{ value: "", label: "All" }, ...districts.map((value) => ({ value, label: value }))]} onChange={(value) => setDraft((current) => ({ ...current, district: value }))} columns={Math.min(4, districts.length + 1)} />
      </Field>
      <div className="fa-inline-actions">
        <button type="button" className="fa-btn fa-btn-primary fa-btn-grow" disabled={!draft.shift || !draft.testedBy} onClick={async () => { await setCrew(draft); setEditing(false); }}>
          Set shift
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
      </div>
      {needsSession && caps.hydrants && !privateHydrant ? <CrewSessionPanel compact /> : null}
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
        {caps.hydrants ? (
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

export default function HydrantsScreen({ params = {} }) {
  const { refData, back, navigate, crew, caps } = useField();
  const hydrants = refItems(refData, "hydrants");
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState(() => crew?.district || "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState("list");
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  const selected = params.hydrantKey ? findHydrant(hydrants, params.hydrantKey) : null;
  const inDistrict = useMemo(() => (district === "all" ? hydrants : hydrants.filter((hydrant) => hydrantDistrict(hydrant) === district)), [hydrants, district]);
  const filtered = useMemo(() => inDistrict.filter((hydrant) => (
    statusFilter === "all" || (statusFilter === "due" ? isDueThisYear(hydrant) : isOutOfServiceHydrant(hydrant))
  )), [inDistrict, statusFilter]);
  const results = useMemo(() => searchHydrants(filtered, query, position, 80), [filtered, query, position]);
  const summary = useMemo(() => hydrantSummary(inDistrict), [inDistrict]);
  const districts = useMemo(() => districtCounts(hydrants), [hydrants]);

  if (selected) return <HydrantDetail hydrant={selected} onClose={back} />;

  function locate() {
    if (!navigator.geolocation) {
      setGeoError("This device can't share its location.");
      return;
    }
    setLocating(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      (error) => { setGeoError(error.code === 1 ? "Location is blocked. Allow location for this site to find nearby hydrants." : "Couldn't get your location. Try again outside or search instead."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

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
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hydrant number or street" enterKeyHint="search" autoComplete="off" />
              {query ? <button type="button" className="fa-icon-btn sm" onClick={() => setQuery("")} aria-label="Clear"><X size={18} /></button> : null}
            </label>
            <button type="button" className={cx("fa-btn", position ? "fa-btn-primary" : "fa-btn-secondary")} onClick={position ? () => setPosition(null) : locate} disabled={locating} aria-label="Near me">
              {locating ? <Loader2 size={20} className="fa-spin" /> : <LocateFixed size={20} />}<span className="fa-hide-sm">{position ? "Nearest" : "Near me"}</span>
            </button>
          </div>
          {geoError ? <p className="fa-error-text">{geoError}</p> : null}
          <div className="fa-hub-controls">
            <Segmented value={statusFilter} options={STATUS_FILTERS} onChange={setStatusFilter} columns={3} />
            <Segmented value={view} options={[{ value: "list", label: <><List size={18} /> List</> }, { value: "map", label: <><MapIcon size={18} /> Map</> }]} onChange={setView} columns={2} />
          </div>
          {view === "map" ? (
            <Suspense fallback={<div className="fa-map fa-map-loading"><Loader2 size={24} className="fa-spin" /></div>}>
              <HydrantMap hydrants={query ? results.map((row) => row.hydrant) : filtered} position={position} onSelect={(key) => navigate("hydrants", { hydrantKey: key })} />
              {!navigator.onLine ? <p className="fa-hint">Offline: map pictures show only for areas viewed before; hydrant dots always show.</p> : null}
            </Suspense>
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
