import { useEffect, useMemo, useState } from "react";
import { Boxes, Building2, ClipboardList, History, ListChecks, Package, ScrollText, Settings2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { PLATFORM_SCOPE_ID } from "../lib/tenantPaths.js";
import { buildStationDetailsFromProfile, stationNamesFromDetails } from "../lib/stationProfile.js";
import { listFleetAssets } from "../lib/fleet/fleetAssetService.js";
import {
  describeError, watchEmsSettings, watchInventoryBalances, watchInventoryItems, watchInventoryLocations,
} from "../lib/ems/emsInventoryService.js";
import InventoryStockTab from "../components/ems/InventoryStockTab.jsx";
import InventoryTransactionModal from "../components/ems/InventoryTransactionModal.jsx";
import InventoryActivityTab from "../components/ems/InventoryActivityTab.jsx";
import InventoryCountsTab from "../components/ems/InventoryCountsTab.jsx";
import { EmsAuditTab, InventoryCatalogTab, InventoryLocationsTab, InventorySettingsTab } from "../components/ems/InventorySetupTabs.jsx";
import "../styles/ems-inventory.css";

/** EMS supply inventory: stock by location and lot, the ledger, counts, catalog and locations. */
export default function EmsSupplyInventoryPage() {
  const { departmentId, profile } = useTenant();
  const { user, permissions, isCreator } = useAuth();
  const has = (key) => isCreator || permissions?.[key] === true;
  const canManage = has("manageEmsInventory");
  const canUse = has("useEmsSupplies") || canManage;
  const canApprove = has("approveEmsInventoryAdjustments");
  const canSettings = has("manageEmsSettings");
  const canAudit = has("viewEmsAudit");
  const ready = departmentId && departmentId !== PLATFORM_SCOPE_ID;

  const [tab, setTab] = useState("stock");
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [settings, setSettings] = useState(null);
  const [fleetAssets, setFleetAssets] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(null);

  useEffect(() => {
    if (!ready) return undefined;
    const onError = (e) => setError(describeError(e));
    const stops = [
      watchInventoryItems(departmentId, setItems, onError),
      watchInventoryLocations(departmentId, setLocations, onError),
      watchInventoryBalances(departmentId, setBalances, onError),
      watchEmsSettings(departmentId, setSettings, () => setSettings(null)),
    ];
    return () => stops.forEach((stop) => stop());
  }, [departmentId, ready]);

  useEffect(() => {
    if (!ready || !canManage) return undefined;
    let live = true;
    listFleetAssets(departmentId).then((rows) => { if (live) setFleetAssets(rows); });
    return () => { live = false; };
  }, [departmentId, ready, canManage]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const tabs = [
    { id: "stock", label: "Stock", icon: Boxes },
    { id: "activity", label: "History", icon: History },
    { id: "counts", label: "Counts", icon: ClipboardList },
    { id: "catalog", label: "Catalog", icon: ListChecks },
    { id: "locations", label: "Locations", icon: Building2 },
    ...(canSettings ? [{ id: "settings", label: "Settings", icon: Settings2 }] : []),
    ...(canAudit ? [{ id: "audit", label: "Audit", icon: ScrollText }] : []),
  ];
  const stations = stationNamesFromDetails(buildStationDetailsFromProfile(profile || {}));
  // Medications share the inventory but have their own page (EMS Medications).
  const supplyItems = useMemo(() => items.filter((i) => i.itemClass !== "medication"), [items]);
  const supplyBalances = useMemo(() => {
    const ids = new Set(supplyItems.map((i) => i.id));
    return balances.filter((b) => ids.has(b.itemId));
  }, [balances, supplyItems]);

  return (
    <div className="module-page ems-inventory-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Package size={22} /></span>
          <div>
            <h1>EMS Supply Inventory</h1>
            <p>Medical supplies by station, storage location and unit, with lots, expirations and a full history.</p>
          </div>
        </div>
      </section>
      {!ready ? <p className="occupancy-muted">Choose a department in the workspace menu first.</p> : (
        <>
          <section className="cert-toolbar">
            <div className="segmented-control" role="tablist" aria-label="EMS inventory views">
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
          {tab === "stock" ? (
            <InventoryStockTab departmentId={departmentId} items={supplyItems} locations={locations} balances={supplyBalances} settings={settings}
              canUse={canUse} canManage={canManage} onRecord={setRecording} onMessage={setMessage} />
          ) : null}
          {tab === "activity" ? <InventoryActivityTab departmentId={departmentId} items={supplyItems} locations={locations} canApprove={canApprove} onMessage={setMessage} itemClass="supply" /> : null}
          {tab === "counts" ? (
            <InventoryCountsTab departmentId={departmentId} uid={user?.uid || ""} items={items} locations={locations}
              canCount={canUse} canApprove={canApprove} onMessage={setMessage} />
          ) : null}
          {tab === "catalog" ? <InventoryCatalogTab departmentId={departmentId} items={supplyItems} canManage={canManage} onMessage={setMessage} /> : null}
          {tab === "locations" ? (
            <InventoryLocationsTab departmentId={departmentId} locations={locations} stations={stations} fleetAssets={fleetAssets}
              canManage={canManage} onMessage={setMessage} />
          ) : null}
          {tab === "settings" && canSettings ? <InventorySettingsTab departmentId={departmentId} settings={settings} onMessage={setMessage} /> : null}
          {tab === "audit" && canAudit ? <EmsAuditTab departmentId={departmentId} /> : null}
          {recording ? (
            <InventoryTransactionModal departmentId={departmentId} items={supplyItems} locations={locations} balances={supplyBalances} settings={settings}
              canUse={canUse} canManage={canManage} preset={recording} onClose={() => setRecording(null)}
              onDone={(text) => { setRecording(null); setMessage(text); }} />
          ) : null}
        </>
      )}
    </div>
  );
}
