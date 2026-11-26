import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ClipboardCheck, History, ListChecks, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { PLATFORM_SCOPE_ID } from "../lib/tenantPaths.js";
import { FleetSummary } from "../components/shell/ui.jsx";
import { isRetiredFleetAsset, listChecklistTemplates, listFleetAssets, listFleetChecks, listFleetClasses } from "../lib/fleet/index.js";
import {
  assignmentCovers, evaluateUnitReadiness, localDate, normalizeReadinessRules, templateHasEmsItems, unitAssignments,
} from "../lib/ems/checkoffLogic.js";
import {
  describeError, loadCheckoffResults, vehicleLocationsFrom, watchCheckoffAssignments, watchCheckoffResults, watchCheckoffSettings,
  watchPendingCheckoffs,
} from "../lib/ems/emsCheckoffService.js";
import { watchEquipment } from "../lib/ems/emsEquipmentService.js";
import { watchInventoryBalances, watchInventoryItems, watchInventoryLocations } from "../lib/ems/emsInventoryService.js";
import FleetCheckConductPanel from "../components/fleet/FleetCheckConductPanel.jsx";
import UnitsTab from "../components/ems/checkoffs/UnitsTab.jsx";
import ResultsTab from "../components/ems/checkoffs/ResultsTab.jsx";
import AssignmentsTab from "../components/ems/checkoffs/AssignmentsTab.jsx";
import RulesTab from "../components/ems/checkoffs/RulesTab.jsx";
import ResultDetailModal from "../components/ems/checkoffs/ResultDetailModal.jsx";
import "../styles/ems-inventory.css";
import "../styles/ems-checkoffs.css";

/** Checks finished this long ago or less, by you, with no recorded result, are offered for recording. */
const UNRECORDED_DAYS = 7;

/**
 * EMS check-offs: which checklists are due on which units, each unit's readiness
 * under the department's rules, sign-off, history, assignments and rules.
 * Checks are Fleet checks; this page adds the EMS layer on top.
 */
export default function EmsCheckoffsPage() {
  const { departmentId } = useTenant();
  const { user, membership, permissions, isCreator } = useAuth();
  const has = (key) => isCreator || permissions?.[key] === true;
  const can = {
    run: has("runEmsCheckoffs"),
    signOff: has("signOffEmsCheckoffs"),
    manage: has("manageEmsCheckoffs"),
    equipment: ["viewEmsEquipment", "checkEmsEquipment", "transferEmsEquipment", "manageEmsEquipment"].some(has),
    inventory: ["viewEmsInventory", "useEmsSupplies", "manageEmsInventory", "approveEmsInventoryAdjustments"].some(has),
  };
  const ready = departmentId && departmentId !== PLATFORM_SCOPE_ID;
  const uid = user?.uid || "";
  const actor = useMemo(() => ({
    actorUid: uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  }), [uid, membership?.displayName, user?.displayName, user?.email]);

  const [tab, setTab] = useState("units");
  const [assets, setAssets] = useState([]);
  const [checks, setChecks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [fleetClasses, setFleetClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [results, setResults] = useState([]);
  const [pendingResults, setPendingResults] = useState([]);
  const [olderResults, setOlderResults] = useState([]);
  const requestedResultIds = useRef(new Set());
  const [settings, setSettings] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);
  const [openResultId, setOpenResultId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadFleet = useCallback(async () => {
    if (!ready) return;
    try {
      const [a, c, t, fc] = await Promise.all([
        listFleetAssets(departmentId),
        listFleetChecks(departmentId),
        listChecklistTemplates(departmentId),
        listFleetClasses(departmentId).catch(() => []),
      ]);
      setAssets(a.filter((asset) => !isRetiredFleetAsset(asset)));
      setChecks(c);
      setTemplates(t);
      setFleetClasses(fc);
    } catch (loadError) {
      setError(describeError(loadError));
    } finally {
      setLoading(false);
    }
  }, [departmentId, ready]);

  useEffect(() => { loadFleet(); }, [loadFleet]);

  useEffect(() => {
    if (!ready) return undefined;
    const fail = (e) => setError(describeError(e));
    setOlderResults([]);
    requestedResultIds.current = new Set();
    const stops = [
      watchCheckoffAssignments(departmentId, setAssignments, fail),
      watchCheckoffResults(departmentId, setResults, fail),
      watchPendingCheckoffs(departmentId, setPendingResults, fail),
      watchCheckoffSettings(departmentId, setSettings, fail),
    ];
    // Equipment and supplies feed readiness; a member who can't read them just doesn't see those reasons.
    if (can.equipment) stops.push(watchEquipment(departmentId, setEquipment, () => setEquipment([])));
    if (can.inventory) {
      stops.push(watchInventoryLocations(departmentId, setLocations, () => setLocations([])));
      stops.push(watchInventoryBalances(departmentId, setBalances, () => setBalances([])));
      stops.push(watchInventoryItems(departmentId, setItems, () => setItems([])));
    }
    return () => stops.forEach((stop) => stop());
  }, [departmentId, ready, can.equipment, can.inventory]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const rules = useMemo(() => normalizeReadinessRules(settings?.readinessRules || {}), [settings]);
  // History is the latest results; pending sign-offs and each unit's latest check
  // are loaded on their own so older ones still count.
  const resultsByCheckId = useMemo(() => Object.fromEntries([...olderResults, ...pendingResults, ...results]
    .map((r) => [r.checkId || r.id, r])), [olderResults, pendingResults, results]);
  const templatesById = useMemo(() => Object.fromEntries(templates.map((t) => [t.id, t])), [templates]);
  const activeAssignments = useMemo(() => assignments
    .filter((a) => a.active !== false)
    .map((a) => ({ ...a, templateName: templatesById[a.templateId]?.name || a.templateName })), [assignments, templatesById]);

  const today = localDate();

  // Each unit's latest check-off result drives readiness; fetch the ones older than the history list.
  useEffect(() => {
    if (!ready) return;
    const missing = [];
    for (const asset of assets) {
      for (const row of unitAssignments(asset, activeAssignments, checks, today)) {
        const id = row.lastCheck?.id;
        if (id && !resultsByCheckId[id] && !requestedResultIds.current.has(id)) missing.push(id);
      }
    }
    if (!missing.length) return;
    missing.forEach((id) => requestedResultIds.current.add(id));
    loadCheckoffResults(departmentId, missing)
      .then((found) => { if (found.length) setOlderResults((prev) => [...prev, ...found]); })
      .catch(() => missing.forEach((id) => requestedResultIds.current.delete(id)));
  }, [ready, departmentId, assets, activeAssignments, checks, today, resultsByCheckId]);

  const units = useMemo(() => {
    const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
    return assets
      .map((asset) => {
        const unitLocations = vehicleLocationsFrom(locations, asset.id);
        const locationIds = new Set(unitLocations.map((l) => l.id));
        const unitEquipment = equipment.filter((e) => e.assignment?.fleetAssetId === asset.id);
        const covered = activeAssignments.some((a) => assignmentCovers(a, asset));
        if (!covered && !unitEquipment.length && !unitLocations.length) return null;
        const unitBalances = balances
          .filter((b) => locationIds.has(b.locationId) && b.par)
          .map((b) => ({ ...b, itemName: itemsById[b.itemId]?.name || b.itemId }));
        const scheduled = unitAssignments(asset, activeAssignments, checks, today, { operatorId: uid });
        const readiness = evaluateUnitReadiness({ asset, scheduled, resultsByCheckId, equipment: unitEquipment, balances: unitBalances, rules, today });
        return { asset, scheduled, readiness, equipmentCount: unitEquipment.length, supplyCount: unitBalances.length };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.asset.station || "").localeCompare(String(b.asset.station || ""))
        || String(a.asset.unitDesignation || a.asset.fleetNumber).localeCompare(String(b.asset.unitDesignation || b.asset.fleetNumber), undefined, { numeric: true }));
  }, [assets, locations, equipment, activeAssignments, balances, items, checks, resultsByCheckId, rules, today, uid]);

  // Your finished check-offs whose EMS results weren't recorded (a dropped connection, say).
  const unrecorded = useMemo(() => {
    const since = new Date(Date.now() - UNRECORDED_DAYS * 86400000).toISOString();
    return checks.filter((c) => c.status === "completed" && c.operatorId === uid && String(c.completedAt) >= since
      && !resultsByCheckId[c.id]
      && (templateHasEmsItems(c.templateSnapshot)
        || activeAssignments.some((a) => a.templateId === c.templateId && assignmentCovers(a, assets.find((x) => x.id === c.fleetAssetId) || {}))));
  }, [checks, uid, resultsByCheckId, activeAssignments, assets]);

  const pending = useMemo(() => Object.values(resultsByCheckId)
    .filter((r) => r.verification?.status === "pending")
    .sort((a, b) => String(b.recordedAt || "").localeCompare(String(a.recordedAt || ""))), [resultsByCheckId]);
  const summary = [
    ["EMS units", units.length, "info"],
    ["Ready", units.filter((u) => u.readiness.status === "ready").length, "success"],
    ["Ready with issues", units.filter((u) => u.readiness.status === "issues").length, "warning"],
    ["Not ready", units.filter((u) => u.readiness.status === "not_ready").length, "critical"],
    ["Check-offs overdue", units.reduce((n, u) => n + u.scheduled.filter((s) => s.state === "overdue").length, 0), "critical"],
    ["Waiting for sign-off", pending.length, "warning"],
  ];

  const tabs = [
    { id: "units", label: "Units", icon: ClipboardCheck },
    { id: "signoff", label: `Sign-off${pending.length ? ` (${pending.length})` : ""}`, icon: ShieldCheck },
    { id: "history", label: "History", icon: History },
    { id: "assignments", label: "Assignments", icon: CalendarClock },
    { id: "rules", label: "Readiness rules", icon: SlidersHorizontal },
  ];

  const openResult = openResultId ? resultsByCheckId[openResultId] || null : null;

  if (running) {
    return (
      <div className="module-page ems-inventory-page ems-checkoffs-page">
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <FleetCheckConductPanel
          departmentId={departmentId}
          asset={{ ...running.asset, assetId: running.asset.id, openCheckId: running.openCheckId }}
          actor={actor}
          permissions={permissions}
          isCreator={isCreator}
          allowConduct={can.run}
          autoStart
          initialTemplateId={running.templateId}
          recordEmsResults
          onClose={() => { setRunning(null); loadFleet(); }}
          onCompleted={() => loadFleet()}
          onMessage={setMessage}
          onError={setError}
        />
      </div>
    );
  }

  return (
    <div className="module-page ems-inventory-page ems-checkoffs-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><ListChecks size={22} /></span>
          <div>
            <h1>EMS Check-offs</h1>
            <p>Which check-offs are due on each unit, whether each unit is ready, supervisor sign-off and every past check-off.</p>
          </div>
        </div>
      </section>
      {!ready ? <p className="occupancy-muted">Choose a department in the workspace menu first.</p> : (
        <>
          <FleetSummary items={summary} />
          <section className="cert-toolbar">
            <div className="segmented-control" role="tablist" aria-label="EMS check-off views">
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>
          </section>
          {error ? <div className="checklist-missing-alert" role="alert">{error} <button type="button" className="link-button" onClick={() => setError("")}>Dismiss</button></div> : null}
          {message ? <div className="df-success" role="status">{message}</div> : null}
          {tab === "units" ? (
            <UnitsTab
              departmentId={departmentId}
              units={units}
              loading={loading}
              unrecorded={unrecorded}
              assetsById={Object.fromEntries(assets.map((a) => [a.id, a]))}
              resultsByCheckId={resultsByCheckId}
              canRun={can.run}
              canManage={can.manage}
              onStart={(asset, row) => setRunning({ asset, templateId: row.assignment.templateId, openCheckId: row.openCheckId })}
              onOpenResult={setOpenResultId}
              onRecorded={(text) => { setMessage(text); loadFleet(); }}
              onError={setError}
              onGoToAssignments={() => setTab("assignments")}
            />
          ) : null}
          {tab === "signoff" ? (
            <ResultsTab results={pending} mode="signoff" uid={uid} onOpen={setOpenResultId}
              emptyMessage="Nothing is waiting for sign-off." />
          ) : null}
          {tab === "history" ? <ResultsTab results={results} mode="history" uid={uid} onOpen={setOpenResultId} /> : null}
          {tab === "assignments" ? (
            <AssignmentsTab departmentId={departmentId} assignments={assignments} templates={templates} assets={assets}
              fleetClasses={fleetClasses} canManage={can.manage} onMessage={setMessage} />
          ) : null}
          {tab === "rules" ? (
            <RulesTab departmentId={departmentId} rules={rules} equipment={equipment} canManage={can.manage} onMessage={setMessage} />
          ) : null}
          {openResult ? (
            <ResultDetailModal departmentId={departmentId} result={openResult} uid={uid} canSignOff={can.signOff}
              onClose={() => setOpenResultId("")} onMessage={setMessage} />
          ) : null}
        </>
      )}
    </div>
  );
}
