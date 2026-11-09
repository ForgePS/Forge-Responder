import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays, Clock, FileText, Flame, Gauge, LayoutDashboard, Layers, Map as MapIcon, Maximize2,
  RefreshCw, Repeat, Settings, ShieldAlert, Tags, TrendingUp,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import ForgeAiLaunchButton from "../components/forgeAi/ForgeAiLaunchButton.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { Panel } from "../components/shell/ui.jsx";
import { BarChart, ColumnChart } from "../components/heatZone/BarChart.jsx";
import DistrictComparison from "../components/heatZone/DistrictComparison.jsx";
import FilterBar from "../components/heatZone/FilterBar.jsx";
import HeatZoneMap from "../components/heatZone/HeatZoneMap.jsx";
import IncidentDetail from "../components/heatZone/IncidentDetail.jsx";
import LiveStatus from "../components/heatZone/LiveStatus.jsx";
import RepeatLocations from "../components/heatZone/RepeatLocations.jsx";
import ReportsPanel from "../components/heatZone/ReportsPanel.jsx";
import SettingsPanel from "../components/heatZone/SettingsPanel.jsx";
import SummaryCards from "../components/heatZone/SummaryCards.jsx";
import TrendChart from "../components/heatZone/TrendChart.jsx";
import { loadHeatZoneBoundaries, loadHeatZoneDashboard, watchHeatZoneVersion } from "../lib/heatZone/heatZoneService.js";
import {
  defaultFilters, loadStoredFilters, presetRange, storeFilters, todayInZone, toggleValue, toRequestFilters,
} from "../lib/heatZone/heatZoneFilters.js";
import {
  FALLBACK_TIME_ZONE, changeArrow, describeError, formatCount, formatDate, formatPct, hourWindow, isHourWindow,
  loadStoredTab, rangeProblem, storeTab,
} from "../lib/heatZone/heatZoneUi.js";
import "../styles/heat-zone.css";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "map", label: "Map", icon: MapIcon },
  { id: "trends", label: "Trends", icon: TrendingUp },
  { id: "districts", label: "Districts", icon: Layers },
  { id: "repeat", label: "Repeat locations", icon: Repeat, capability: "viewRepeatLocations" },
  { id: "reports", label: "Reports", icon: FileText, capability: "exportReports" },
  { id: "settings", label: "Settings", icon: Settings, capability: "manageSettings" },
];

const FILTER_DEBOUNCE_MS = 300;
const LIVE_DEBOUNCE_MS = 1000;
const DEFAULT_PREFS = { heat: true, incidents: true, districts: true, zones: false, intensity: 1 };

/** Until the server answers, guess capabilities from the member's permissions (server stays authoritative). */
function fallbackCapabilities(permissions = {}, isCreator = false) {
  const has = (key) => permissions?.[key] === true;
  return {
    viewMarkers: has("viewHeatZoneMarkers") && has("viewNerisReports"),
    viewAllDistricts: isCreator || has("viewHeatZoneAllDistricts") || has("manageHeatZoneSettings"),
    viewHistory: has("viewHeatZoneHistory"),
    viewRepeatLocations: has("viewHeatZoneRepeatLocations"),
    exportReports: has("exportHeatZoneReports"),
    manageSettings: has("manageHeatZoneSettings"),
  };
}

function Heading({ subtitle, children }) {
  return (
    <section className="module-heading">
      <div>
        <span className="module-icon"><Flame size={22} /></span>
        <div>
          <h1>Heat Zone Analytics</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      {children ? <div className="heading-actions">{children}</div> : null}
    </section>
  );
}

function EmptyState({ onReset }) {
  return (
    <section className="hz-empty panel">
      <strong>No incidents match these filters</strong>
      <p>Try a wider date range, other days or times, or clear some filters.</p>
      <button type="button" className="primary-button hz-button" onClick={onReset}>Reset filters</button>
    </section>
  );
}

export default function HeatZoneAnalyticsPage() {
  const { departmentId } = useTenant();
  if (!departmentId) {
    return (
      <div className="module-page heat-zone-page">
        <Heading subtitle="Call density, hot spots and trends by district." />
        <div className="hz-empty panel"><strong>Select a department</strong><p>Choose a department to view its Heat Zone Analytics.</p></div>
      </div>
    );
  }
  // Keyed so every piece of state (filters, map view, live listener) resets per department.
  return <HeatZoneWorkspace key={departmentId} departmentId={departmentId} />;
}

function HeatZoneWorkspace({ departmentId }) {
  const { permissions, isCreator } = useAuth();
  const [timeZone, setTimeZone] = useState(FALLBACK_TIME_ZONE);
  const today = todayInZone(timeZone);
  const [filters, setFilters] = useState(() => loadStoredFilters(departmentId, todayInZone(FALLBACK_TIME_ZONE)));
  const [tab, setTab] = useState(() => loadStoredTab());
  const [mode, setMode] = useState("raw");
  const [zoom, setZoom] = useState(12);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [live, setLive] = useState("connecting");
  const [boundaries, setBoundaries] = useState(null);
  const [boundaryError, setBoundaryError] = useState("");
  const [zonesKey, setZonesKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [markersKey, setMarkersKey] = useState(0);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [viewport, setViewport] = useState(null);
  const [focus, setFocus] = useState(null);
  const [incidentId, setIncidentId] = useState(null);

  const viewRef = useRef({});
  const seqRef = useRef(0);
  const loadedVersionRef = useRef(undefined);
  const remoteMetaRef = useRef(null);
  const scheduledVersionRef = useRef(undefined);
  const zonesVersionRef = useRef(undefined);
  const liveTimerRef = useRef(null);

  const requestFilters = useMemo(() => toRequestFilters(filters), [filters]);
  const requestKey = JSON.stringify(requestFilters);
  const rangeError = rangeProblem(filters);
  const caps = data?.capabilities || fallbackCapabilities(permissions, isCreator);
  const tabs = TABS.filter((t) => !t.capability || caps[t.capability]);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "overview";

  useEffect(() => { storeFilters(departmentId, filters); }, [departmentId, filters]);

  const changeTab = useCallback((id) => { setTab(id); storeTab(id); }, []);
  const resetFilters = useCallback(() => setFilters(defaultFilters(todayInZone(timeZone))), [timeZone]);

  // Refetch when live meta shows a version newer than the one on screen.
  const maybeRefreshForVersion = useCallback(() => {
    const remote = remoteMetaRef.current?.version;
    if (loadedVersionRef.current === undefined || remote === undefined) return;
    if (remote === loadedVersionRef.current || remote === scheduledVersionRef.current) return;
    scheduledVersionRef.current = remote;
    window.clearTimeout(liveTimerRef.current);
    liveTimerRef.current = window.setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setMarkersKey((k) => k + 1);
    }, LIVE_DEBOUNCE_MS);
  }, []);

  // Dashboard: debounced, and out-of-order responses are dropped.
  useEffect(() => {
    const seq = ++seqRef.current;
    if (rangeError) { setUpdating(false); return undefined; }
    setUpdating(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await loadHeatZoneDashboard(departmentId, JSON.parse(requestKey), { zoom, mode });
        if (seq !== seqRef.current) return;
        setData(res);
        setError(null);
        setLastUpdated(Date.now());
        loadedVersionRef.current = res.meta?.version ?? 0;
        maybeRefreshForVersion();
      } catch (loadError) {
        if (seq !== seqRef.current) return;
        console.error(loadError);
        setError(describeError(loadError, "Unable to load Heat Zone Analytics."));
      } finally {
        if (seq === seqRef.current) setUpdating(false);
      }
    }, data ? FILTER_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [departmentId, requestKey, zoom, mode, refreshKey, rangeError]);

  // Department time zone: "today" and preset ranges follow it once known.
  const serverTimeZone = data?.department?.timeZone;
  useEffect(() => {
    if (!serverTimeZone || serverTimeZone === timeZone) return;
    setTimeZone(serverTimeZone);
    setFilters((prev) => {
      if (prev.preset === "custom") return prev;
      const range = presetRange(prev.preset, todayInZone(serverTimeZone));
      return range.from === prev.from && range.to === prev.to ? prev : { ...prev, ...range };
    });
  }, [serverTimeZone]);

  // Live updates from heatZoneMeta/state.
  useEffect(() => {
    const unsubscribe = watchHeatZoneVersion(
      departmentId,
      (meta) => {
        setLive("live");
        remoteMetaRef.current = meta;
        const zonesVersion = meta?.zonesVersion || 0;
        if (zonesVersionRef.current === undefined) zonesVersionRef.current = zonesVersion;
        else if (zonesVersion !== zonesVersionRef.current) {
          zonesVersionRef.current = zonesVersion;
          setZonesKey((k) => k + 1);
        }
        maybeRefreshForVersion();
      },
      (watchError) => {
        console.warn("Heat Zone live updates unavailable", watchError);
        setLive("unavailable");
      },
    );
    return () => {
      unsubscribe();
      window.clearTimeout(liveTimerRef.current);
    };
  }, [departmentId, maybeRefreshForVersion]);

  // Boundary geometry: once per department and whenever zones change.
  useEffect(() => {
    let cancelled = false;
    loadHeatZoneBoundaries(departmentId)
      .then((res) => { if (!cancelled) { setBoundaries(res.zones || []); setBoundaryError(""); } })
      .catch((loadError) => { if (!cancelled) setBoundaryError(describeError(loadError, "Boundaries could not be loaded.").message); });
    return () => { cancelled = true; };
  }, [departmentId, zonesKey]);

  const onViewChange = useCallback(({ bounds, zoom: nextZoom }) => {
    setViewport(bounds);
    setZoom((prev) => (prev === nextZoom ? prev : nextZoom));
  }, []);

  const refreshNow = () => { setRefreshKey((k) => k + 1); setMarkersKey((k) => k + 1); };
  const onSettingsChanged = ({ zones }) => {
    if (zones) setZonesKey((k) => k + 1);
    refreshNow();
  };

  const toggleList = (key, value) => setFilters((f) => ({ ...f, [key]: toggleValue(f[key], value) }));
  const selectHour = (row) => setFilters((f) => (isHourWindow(f, row.key) ? { ...f, timeStart: "", timeEnd: "" } : { ...f, ...hourWindow(row.key) }));
  const selectWeekday = (row) => setFilters((f) => ({ ...f, daysOfWeek: toggleValue(f.daysOfWeek, row.key).sort() }));
  const focusLocation = ({ lat, lng }) => { setFocus({ lat, lng, zoom: 17, key: Date.now() }); changeTab("map"); };

  const department = data?.department;
  const subtitle = department
    ? `Call density, hot spots and trends for ${department.name}. Times are shown in ${department.timeZone}.`
    : "Call density, hot spots and trends by district.";

  const headingActions = (
    <>
      <LiveStatus state={live} updating={updating && Boolean(data)} lastUpdated={lastUpdated} timeZone={timeZone} />
      <button type="button" className="secondary-button" onClick={refreshNow} disabled={updating}><RefreshCw size={14} /> Refresh</button>
      <ForgeAiLaunchButton capability="heatZone" prompt="Which districts and hours had the most calls in the last 30 days, and how does that compare to the previous period?" />
    </>
  );

  // First load, or the dashboard could not be loaded at all.
  if (!data) {
    return (
      <div className="module-page heat-zone-page">
        <Heading subtitle={subtitle}>{headingActions}</Heading>
        {!error && !rangeError && <div className="page-loading"><span className="page-loading-spinner" /> Loading Heat Zone Analytics…</div>}
        {rangeError && (
          <div className="error-banner" role="alert">
            <span>{rangeError}</span>
            <button type="button" className="secondary-button hz-button" onClick={resetFilters}>Reset filters</button>
          </div>
        )}
        {error && error.denied && (
          <section className="hz-empty panel" role="alert">
            <ShieldAlert size={28} />
            <strong>You don’t have access to Heat Zone Analytics</strong>
            <p>{error.message}</p>
            <p className="hz-muted">Ask a department administrator to grant the Heat Zone Analytics permission.</p>
          </section>
        )}
        {error && !error.denied && (
          <div className="error-banner" role="alert">
            <span>{error.message}</span>
            <span className="hz-banner-actions">
              <button type="button" className="secondary-button hz-button" onClick={resetFilters}>Reset filters</button>
              <button type="button" className="secondary-button hz-button" onClick={refreshNow}>Retry</button>
            </span>
          </div>
        )}
      </div>
    );
  }

  const { summary, charts, heat, zones = [], comparison } = data;
  const noCalls = !summary?.totalCalls;
  const mapProps = {
    departmentId, heat, boundaries, capabilities: caps, requestFilters, requestKey, timeZone,
    highPriorities: data.settings?.highPriorities || summary?.highPriorities || [],
    mode, onModeChange: setMode, prefs, onPrefsChange: setPrefs, viewRef, onViewChange,
    onSelectIncident: setIncidentId, onResetFilters: resetFilters, focus, markersKey, mappedCalls: summary?.mappedCalls || 0,
  };
  const districtBars = (charts?.byDistrict || []);
  const notes = [
    data.meta?.truncated && "Results are limited to the first 50,000 incidents in this range; narrow the dates for complete numbers.",
    heat?.truncated && "The heat map shows the densest areas only; zoom in for more detail.",
    boundaryError && `Boundaries: ${boundaryError}`,
  ].filter(Boolean);

  const hourChart = (
    <ColumnChart title="Calls by hour" icon={Clock} rows={charts?.byHour || []} tickEvery={3} onSelect={selectHour} isSelected={(r) => isHourWindow(filters, r.key)} hint="Select an hour to filter" />
  );
  const weekdayChart = (
    <ColumnChart title="Calls by weekday" icon={CalendarDays} rows={charts?.byWeekday || []} onSelect={selectWeekday} isSelected={(r) => filters.daysOfWeek.includes(r.key)} hint="Select a day to filter" />
  );

  return (
    <div className="module-page heat-zone-page">
      <Heading subtitle={subtitle}>{headingActions}</Heading>

      <section className="cert-toolbar hz-tabs">
        <div className="segmented-control" role="tablist" aria-label="Heat Zone views">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} className={activeTab === t.id ? "active" : ""} onClick={() => changeTab(t.id)}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab !== "settings" && (
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          today={today}
          zones={zones}
          filterOptions={data.filterOptions}
          historyLimited={Boolean(data.filters?.historyLimited)}
          rangeError={rangeError}
          getViewport={() => viewport}
          onReset={resetFilters}
        />
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error.denied ? `Access denied: ${error.message}` : error.message}</span>
          <span className="hz-banner-actions">
            <button type="button" className="secondary-button hz-button" onClick={refreshNow}>Retry</button>
            <button type="button" className="secondary-button hz-button" onClick={() => setError(null)}>Dismiss</button>
          </span>
        </div>
      )}
      {notes.length > 0 && activeTab !== "settings" && <div className="hz-notes">{notes.map((n) => <p key={n} className="hz-note">{n}</p>)}</div>}

      <div className={`hz-content${updating ? " is-updating" : ""}`}>
        {activeTab === "overview" && (noCalls ? <EmptyState onReset={resetFilters} /> : (
          <>
            <SummaryCards summary={summary} comparison={comparison} />
            <Panel
              title="Heat map"
              icon={Flame}
              className="hz-map-panel"
              action={<button type="button" className="text-button" onClick={() => changeTab("map")}><Maximize2 size={13} /> Open full map</button>}
            >
              <HeatZoneMap {...mapProps} size="compact" />
            </Panel>
            <div className="hz-chart-grid">
              {hourChart}
              {weekdayChart}
              <BarChart title="Calls by district" icon={Layers} rows={districtBars} onSelect={(r) => toggleList("districtIds", r.key)} isSelected={(r) => filters.districtIds.includes(r.key)} hint="Select to filter" />
              <BarChart title="Calls by classification" icon={Tags} rows={charts?.byClassification || []} limit={15} onSelect={(r) => toggleList("classifications", r.key)} isSelected={(r) => filters.classifications.includes(r.key)} hint="Select to filter" />
              <BarChart title="Calls by priority" icon={Gauge} rows={charts?.byPriority || []} onSelect={(r) => toggleList("priorities", r.key)} isSelected={(r) => filters.priorities.includes(r.key)} hint="Select to filter" />
            </div>
          </>
        ))}

        {activeTab === "map" && (
          <>
            <p className="hz-map-summary">
              {formatCount(summary?.totalCalls)} calls · {formatCount(summary?.mappedCalls)} mapped
              {summary?.unmappedCalls ? ` · ${formatCount(summary.unmappedCalls)} without a map location (counted in totals, not on the map)` : ""}
            </p>
            <HeatZoneMap {...mapProps} size="full" />
          </>
        )}

        {activeTab === "trends" && (noCalls ? <EmptyState onReset={resetFilters} /> : (
          <>
            <TrendChart trend={charts?.trend} />
            {caps.viewHistory ? (
              comparison && (
                <Panel title="Compared with the previous period" icon={TrendingUp}>
                  <div className="hz-compare">
                    <div><span>This period</span><strong>{formatCount(comparison.currentTotal)}</strong><small>{formatDate(data.filters?.from)} – {formatDate(data.filters?.to)}</small></div>
                    <div><span>Previous period</span><strong>{formatCount(comparison.previousTotal)}</strong><small>{formatDate(comparison.previousFrom)} – {formatDate(comparison.previousTo)}</small></div>
                    <div className={comparison.changePct > 0 ? "hz-up" : comparison.changePct < 0 ? "hz-down" : ""}>
                      <span>Change</span>
                      <strong>{Number.isFinite(comparison.changePct) ? `${changeArrow(comparison.changePct)} ${formatPct(comparison.changePct)}` : "—"}</strong>
                      <small>{Number.isFinite(comparison.changePct) ? "Same filters, same length of time" : "No calls in the previous period"}</small>
                    </div>
                  </div>
                </Panel>
              )
            ) : (
              <p className="hz-panel-note hz-standalone-note">Comparison with the previous period needs the “View Heat Zone history” permission.</p>
            )}
            <div className="hz-chart-grid">
              {hourChart}
              {weekdayChart}
            </div>
          </>
        ))}

        {activeTab === "districts" && (
          <DistrictComparison
            rows={data.districtComparison || []}
            zones={zones}
            selectedIds={filters.districtIds}
            showPrevious={caps.viewHistory}
            viewAllDistricts={caps.viewAllDistricts}
            canManage={caps.manageSettings}
            onSelectDistrict={(id) => toggleList("districtIds", id)}
            onOpenSettings={() => changeTab("settings")}
          />
        )}

        {activeTab === "repeat" && (
          <RepeatLocations rows={data.repeatLocations || []} zones={zones} timeZone={timeZone} onFocus={focusLocation} />
        )}

        {activeTab === "reports" && (
          <ReportsPanel departmentId={departmentId} requestFilters={requestFilters} canViewHistory={caps.viewHistory} disabled={Boolean(rangeError)} />
        )}

        {activeTab === "settings" && (
          <SettingsPanel departmentId={departmentId} timeZone={timeZone} priorityOptions={data.filterOptions?.priorities || []} onChanged={onSettingsChanged} />
        )}
      </div>

      {incidentId && (
        <IncidentDetail departmentId={departmentId} incidentId={incidentId} timeZone={timeZone} onClose={() => setIncidentId(null)} />
      )}
    </div>
  );
}
