import { useCallback, useEffect, useMemo, useState } from "react";
import { DatabaseZap, History, ScanLine, Stethoscope } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { PLATFORM_SCOPE_ID } from "../lib/tenantPaths.js";
import { buildStationDetailsFromProfile, stationNamesFromDetails } from "../lib/stationProfile.js";
import { ensureFleetAssets, listFleetAssets } from "../lib/fleet/fleetAssetService.js";
import { FleetSummary } from "../components/shell/ui.jsx";
import { EQUIPMENT_PAGE, EQUIPMENT_PARAM, displayStatus, equipmentFlags } from "../lib/ems/equipmentDisplay.js";
import { pageSlug } from "../lib/pageUrl.js";
import { describeError, watchEquipment, watchStorageLocations } from "../lib/ems/emsEquipmentService.js";
import EquipmentListTab from "../components/ems/equipment/EquipmentListTab.jsx";
import EquipmentScanTab from "../components/ems/equipment/EquipmentScanTab.jsx";
import EquipmentHistoryTab from "../components/ems/equipment/EquipmentHistoryTab.jsx";
import EquipmentImportTab from "../components/ems/equipment/EquipmentImportTab.jsx";
import EquipmentDetailModal from "../components/ems/equipment/EquipmentDetailModal.jsx";
import EquipmentFormModal from "../components/ems/equipment/EquipmentFormModal.jsx";
import "../styles/ems-inventory.css";
import "../styles/ems-equipment.css";

/** Keep ?equipment=<id> in the address while a record is open, so it can be shared and survives a reload. */
function setEquipmentParam(id) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(EQUIPMENT_PARAM, id);
  else url.searchParams.delete(EQUIPMENT_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}

function equipmentParam() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(EQUIPMENT_PARAM) || "";
}

/** EMS equipment: every serialized piece, where it is, what's due, scanning, history and the Assets import. */
export default function EmsEquipmentPage() {
  const { departmentId, profile } = useTenant();
  const { user, membership, permissions, isCreator } = useAuth();
  const has = (key) => isCreator || permissions?.[key] === true;
  const can = { manage: has("manageEmsEquipment"), transfer: has("transferEmsEquipment"), check: has("checkEmsEquipment") };
  const ready = departmentId && departmentId !== PLATFORM_SCOPE_ID;
  const departmentName = profile?.shortName || profile?.name || "";

  const [tab, setTab] = useState("equipment");
  const [equipment, setEquipment] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [locations, setLocations] = useState([]);
  const [fleetAssets, setFleetAssets] = useState([]);
  const [openId, setOpenId] = useState(equipmentParam);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready) return undefined;
    const stops = [
      watchEquipment(departmentId, (rows) => { setEquipment(rows); setLoaded(true); }, (e) => { setError(describeError(e)); setLoaded(true); }),
      // Storage locations are optional context; a member without inventory access just doesn't see them.
      watchStorageLocations(departmentId, setLocations, () => setLocations([])),
    ];
    return () => stops.forEach((stop) => stop());
  }, [departmentId, ready]);

  // Equipment goes on Fleet vehicles. Like the Fleet pages, an equipment manager's
  // first visit sets up Fleet vehicles from the classic apparatus list when the
  // department has none yet, so units can be chosen and imported rows linked.
  const actorUid = user?.uid || "system";
  const actorName = membership?.displayName || user?.displayName || user?.email || "User";
  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    const load = can.manage
      ? ensureFleetAssets(departmentId, [], { actorUid, actorName }).catch(() => listFleetAssets(departmentId))
      : listFleetAssets(departmentId);
    load.then((rows) => { if (live) setFleetAssets(rows || []); });
    return () => { live = false; };
  }, [departmentId, ready, can.manage, actorUid, actorName]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  // Leaving the page drops ?equipment from the address. Checked after the app has
  // updated ?page, so a remount of this same page (React dev mode) keeps it.
  useEffect(() => () => {
    window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("page") !== pageSlug(EQUIPMENT_PAGE)) setEquipmentParam("");
    }, 0);
  }, []);

  const open = useCallback((id) => { setOpenId(id); setEquipmentParam(id); }, []);
  const close = useCallback(() => { setOpenId(""); setEquipmentParam(""); }, []);

  const stations = stationNamesFromDetails(buildStationDetailsFromProfile(profile || {}));
  const record = openId ? equipment.find((e) => e.id === openId) : null;

  const summary = useMemo(() => {
    const active = equipment.filter((e) => !["retired", "disposed"].includes(e.status));
    const count = (fn) => active.filter(fn).length;
    return [
      ["Active equipment", active.length, "info"],
      ["Ready (available, assigned, in service)", count((e) => ["available", "assigned", "in_service"].includes(displayStatus(e))), "success"],
      ["Inspection overdue", count((e) => equipmentFlags(e).inspection === "overdue"), "warning"],
      ["Maintenance or out of service", count((e) => ["maintenance_required", "out_of_service"].includes(e.status)), "warning"],
      ["Missing", count((e) => e.status === "missing"), "critical"],
    ];
  }, [equipment]);

  const tabs = [
    { id: "equipment", label: "Equipment", icon: Stethoscope },
    { id: "scan", label: "Scan", icon: ScanLine },
    { id: "history", label: "History", icon: History },
    ...(can.manage ? [{ id: "import", label: "Import", icon: DatabaseZap }] : []),
  ];

  const done = (text) => setMessage(text);

  return (
    <div className="module-page ems-inventory-page ems-equipment-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Stethoscope size={22} /></span>
          <div>
            <h1>EMS Equipment</h1>
            <p>Monitors, defibrillators, airway and other serialized equipment: where it is, its status, what's due and its full history.</p>
          </div>
        </div>
      </section>
      {!ready ? <p className="occupancy-muted">Choose a department in the workspace menu first.</p> : (
        <>
          <FleetSummary items={summary} />
          <section className="cert-toolbar">
            <div className="segmented-control" role="tablist" aria-label="EMS equipment views">
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
          {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
          {message ? <div className="df-success" role="status">{message}</div> : null}
          {openId && loaded && !record ? (
            <div className="checklist-missing-alert" role="alert">
              That equipment isn't in this department, or you don't have access to it.
              <button type="button" className="link-button" onClick={close}>Dismiss</button>
            </div>
          ) : null}
          {tab === "equipment" ? (
            <EquipmentListTab equipment={equipment} canManage={can.manage} departmentName={departmentName} onOpen={open} onRegister={() => setEditing({})} />
          ) : null}
          {tab === "scan" ? <EquipmentScanTab equipment={equipment} onOpen={open} /> : null}
          {tab === "history" ? <EquipmentHistoryTab departmentId={departmentId} onOpen={open} /> : null}
          {tab === "import" && can.manage ? <EquipmentImportTab departmentId={departmentId} stations={stations} onMessage={done} /> : null}
          {record && !editing ? (
            <EquipmentDetailModal departmentId={departmentId} record={record} can={can} stations={stations} fleetAssets={fleetAssets}
              locations={locations} departmentName={departmentName} onClose={close} onEdit={() => setEditing(record)} onMessage={done} />
          ) : null}
          {editing ? (
            <EquipmentFormModal departmentId={departmentId} record={editing.id ? editing : null} equipment={equipment} stations={stations}
              fleetAssets={fleetAssets} locations={locations} onClose={() => setEditing(null)}
              onDone={(text, id) => { setEditing(null); done(text); if (id) open(id); }} />
          ) : null}
        </>
      )}
    </div>
  );
}
