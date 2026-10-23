/** Field app frame: status bar, navigation, data loading, sync and app updates. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Download,
  Flame,
  Home,
  ListChecks,
  Loader2,
  RefreshCw,
  Settings as SettingsIcon,
  Smartphone,
} from "lucide-react";
import { FieldContext } from "./fieldContext.jsx";
import { fieldCapabilities } from "./fieldSession.js";
import { listRecords, subscribeRecords, summarizeRecords } from "./fieldRecords.js";
import { loadRecent, loadRefData, refreshRefData } from "./fieldRefData.js";
import { getSyncState, startSync, stopSync, subscribeSync, syncNow } from "./fieldSync.js";
import { activateUpdate, subscribeUpdateReady } from "./registerFieldSW.js";
import { cx } from "./ui.jsx";
import HomeScreen from "./screens/HomeScreen.jsx";
import ActivityScreen from "./screens/ActivityScreen.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import RecordScreen from "./screens/RecordScreen.jsx";
import TruckCheckScreen from "./screens/TruckCheckScreen.jsx";
import HoseTestScreen from "./screens/HoseTestScreen.jsx";
import HydrantsScreen from "./screens/HydrantsScreen.jsx";
import HydrantInspectionScreen from "./screens/HydrantInspectionScreen.jsx";
import FlowTestScreen from "./screens/FlowTestScreen.jsx";
import HydrantDamageScreen from "./screens/HydrantDamageScreen.jsx";
import DamageFormScreen from "./screens/DamageFormScreen.jsx";
import DailyLogScreen from "./screens/DailyLogScreen.jsx";
import DailyLogFormScreen from "./screens/DailyLogFormScreen.jsx";
import IncidentsScreen from "./screens/IncidentsScreen.jsx";
import IncidentFormScreen from "./screens/IncidentFormScreen.jsx";

const SCREENS = {
  home: HomeScreen,
  activity: ActivityScreen,
  settings: SettingsScreen,
  record: RecordScreen,
  truckCheck: TruckCheckScreen,
  hoseTest: HoseTestScreen,
  hydrants: HydrantsScreen,
  hydrantInspection: HydrantInspectionScreen,
  flowTest: FlowTestScreen,
  hydrantDamage: HydrantDamageScreen,
  damageForm: DamageFormScreen,
  dailyLog: DailyLogScreen,
  dailyLogForm: DailyLogFormScreen,
  incidents: IncidentsScreen,
  incidentForm: IncidentFormScreen,
};

const REF_REFRESH_MS = 20 * 60_000;
const TAB_ROOTS = new Set(["home", "activity", "settings"]);

function SyncPill({ online, sync, counts, onClick }) {
  let tone = "ok";
  let icon = <CheckCircle2 size={18} />;
  let label = "All synced";
  const waiting = counts.queued + counts.syncing;
  if (counts.attention) {
    tone = "warn";
    icon = <AlertTriangle size={18} />;
    label = `${counts.attention} need${counts.attention === 1 ? "s" : ""} attention`;
  } else if (!online || !sync.reachable) {
    const word = online ? "No signal" : "Offline";
    tone = waiting ? "info" : "muted";
    icon = waiting ? <Smartphone size={18} /> : <CloudOff size={18} />;
    label = waiting ? `${word} · ${waiting} saved on device` : word;
  } else if (sync.running || counts.syncing) {
    tone = "info";
    icon = <RefreshCw size={18} className="fa-spin" />;
    label = waiting ? `Syncing ${waiting}…` : "Syncing…";
  } else if (waiting) {
    tone = "info";
    icon = <Smartphone size={18} />;
    label = `${waiting} saved on device`;
  }
  return (
    <button type="button" className={cx("fa-sync-pill", `tone-${tone}`)} onClick={onClick} aria-live="polite">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Toasts({ items }) {
  return (
    <div className="fa-toasts" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={cx("fa-toast", `tone-${item.tone}`)}>
          {item.tone === "warn" ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

function readScreenFromHistory() {
  const state = window.history.state;
  if (state?.fieldScreen) return { name: state.fieldScreen, params: state.fieldParams || {} };
  return { name: "home", params: {} };
}

export default function FieldShell({ snapshot, online, accessLive }) {
  const caps = useMemo(() => fieldCapabilities(snapshot), [snapshot]);
  const [route, setRoute] = useState(readScreenFromHistory);
  const [refData, setRefData] = useState({ parts: {}, fetchedAt: "" });
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState("");
  const [records, setRecords] = useState([]);
  const [recent, setRecent] = useState({});
  const [sync, setSync] = useState(getSyncState);
  const [toasts, setToasts] = useState([]);
  const [updateReady, setUpdateReady] = useState(false);
  const refRef = useRef(refData);
  const capsRef = useRef(caps);
  const snapRef = useRef(snapshot);
  refRef.current = refData;
  capsRef.current = caps;
  snapRef.current = snapshot;

  const actor = useMemo(() => ({ actorUid: snapshot.uid, actorName: snapshot.displayName }), [snapshot.uid, snapshot.displayName]);

  /* ---------------- navigation (works with the phone's back button) --------------- */
  useEffect(() => {
    if (!window.history.state?.fieldScreen) {
      window.history.replaceState({ ...(window.history.state || {}), fieldScreen: "home", fieldParams: {} }, "");
    }
    const onPop = () => setRoute(readScreenFromHistory());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((name, params = {}, { replace = false } = {}) => {
    const state = { fieldScreen: name, fieldParams: params };
    if (replace) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    setRoute({ name, params });
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1 && window.history.state?.fieldScreen && window.history.state.fieldScreen !== "home") {
      window.history.back();
    } else {
      navigate("home", {}, { replace: true });
    }
  }, [navigate]);

  const goTab = useCallback((name) => {
    if (route.name === name) return;
    if (TAB_ROOTS.has(route.name)) navigate(name, {}, { replace: true });
    else navigate(name);
  }, [route.name, navigate]);

  /* --------------------------------- toasts ---------------------------------- */
  const toast = useCallback((message, tone = "ok") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), tone === "warn" ? 6000 : 3500);
  }, []);

  /* ---------------------------- records on device ----------------------------- */
  const reloadRecords = useCallback(() => {
    listRecords(snapshot.departmentId, snapshot.uid).then(setRecords).catch(() => null);
  }, [snapshot.departmentId, snapshot.uid]);

  useEffect(() => {
    reloadRecords();
    return subscribeRecords(reloadRecords);
  }, [reloadRecords]);

  /* ------------------------------ reference data ------------------------------ */
  useEffect(() => {
    loadRefData(snapshot.departmentId).then(setRefData).catch(() => null);
    loadRecent(snapshot.departmentId).then(setRecent).catch(() => null);
  }, [snapshot.departmentId]);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (navigator.onLine === false) {
      if (!quiet) toast("No connection — showing the data saved on this device.", "warn");
      return;
    }
    setRefLoading(true);
    setRefError("");
    try {
      const { data, failed } = await refreshRefData({ departmentId: snapshot.departmentId, caps: capsRef.current, actor });
      setRefData(data);
      if (failed.length) setRefError(`Some data didn't update (${failed.join(", ")}). The saved copy is used.`);
      else if (!quiet) toast("Field data updated");
    } catch (error) {
      setRefError(error?.message || "Couldn't update field data.");
    } finally {
      setRefLoading(false);
    }
  }, [snapshot.departmentId, actor, toast]);

  // Refresh when access is confirmed online, when the connection returns, and periodically.
  useEffect(() => {
    if (accessLive && online) refresh({ quiet: true });
  }, [accessLive, online]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (navigator.onLine !== false && document.visibilityState === "visible") refresh({ quiet: true });
    }, REF_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  /* ----------------------------------- sync ----------------------------------- */
  useEffect(() => {
    startSync({
      departmentId: snapshot.departmentId,
      uid: snapshot.uid,
      actor,
      getCaps: () => capsRef.current,
      getRefData: () => refRef.current,
      getSnapshot: () => snapRef.current,
    });
    const unsubscribe = subscribeSync(setSync);
    return () => {
      unsubscribe();
      stopSync();
    };
  }, [snapshot.departmentId, snapshot.uid, actor]);

  useEffect(() => {
    if (online) syncNow();
  }, [online]);

  // After records reach the server, refresh the downloaded copies (throttled).
  const syncedCount = records.filter((row) => row.status === "synced").length;
  const lastSyncedRefresh = useRef(0);
  useEffect(() => {
    if (!syncedCount || !online || Date.now() - lastSyncedRefresh.current < 60_000) return;
    lastSyncedRefresh.current = Date.now();
    refresh({ quiet: true });
  }, [syncedCount]);

  /* ------------------------------- app updates -------------------------------- */
  useEffect(() => subscribeUpdateReady(() => setUpdateReady(true)), []);

  const counts = useMemo(() => summarizeRecords(records), [records]);
  const Current = SCREENS[route.name] || HomeScreen;

  const contextValue = useMemo(() => ({
    snapshot,
    caps,
    online,
    refData,
    refLoading,
    refError,
    refresh,
    records,
    counts,
    recent,
    setRecent,
    sync,
    navigate,
    back,
    toast,
    actor,
  }), [snapshot, caps, online, refData, refLoading, refError, refresh, records, counts, recent, sync, navigate, back, toast, actor]);

  const isTab = TAB_ROOTS.has(route.name);

  return (
    <FieldContext.Provider value={contextValue}>
      <div className="fa-app">
        <header className="fa-topbar">
          <button type="button" className="fa-brand" onClick={() => goTab("home")} aria-label="Home">
            {snapshot.logoUrl && !snapshot.logoUrl.includes("forge-logo")
              ? <img src={snapshot.logoUrl} alt="" />
              : <span className="fa-brand-mark" aria-hidden="true"><Flame size={22} /></span>}
            <span className="fa-brand-text">
              <strong>{snapshot.departmentName}</strong>
              <small>FORGE Field</small>
            </span>
          </button>
          <SyncPill online={online} sync={sync} counts={counts} onClick={() => goTab("activity")} />
        </header>
        {updateReady ? (
          <div className="fa-update">
            <Download size={18} />
            <span>A new version of FORGE Field is ready.</span>
            <button
              type="button"
              className="fa-btn fa-btn-sm fa-btn-primary"
              disabled={counts.syncing > 0}
              onClick={() => activateUpdate()}
            >
              {counts.syncing ? <Loader2 size={16} className="fa-spin" /> : null} Update
            </button>
          </div>
        ) : null}
        <main className={cx("fa-main", isTab && "has-tabs")}>
          <Current key={`${route.name}:${JSON.stringify(route.params)}`} params={route.params} />
        </main>
        {isTab ? (
          <nav className="fa-tabs" aria-label="Main">
            <button type="button" className={cx("fa-tab", route.name === "home" && "is-active")} onClick={() => goTab("home")}>
              <Home size={24} /><span>Home</span>
            </button>
            <button type="button" className={cx("fa-tab", route.name === "activity" && "is-active")} onClick={() => goTab("activity")}>
              <span className="fa-tab-icon">
                <ListChecks size={24} />
                {counts.attention || counts.queued ? <span className={cx("fa-badge", counts.attention && "is-warn")}>{counts.attention || counts.queued}</span> : null}
              </span>
              <span>Records</span>
            </button>
            <button type="button" className={cx("fa-tab", route.name === "settings" && "is-active")} onClick={() => goTab("settings")}>
              <SettingsIcon size={24} /><span>Device</span>
            </button>
          </nav>
        ) : null}
        <Toasts items={toasts} />
      </div>
    </FieldContext.Provider>
  );
}
