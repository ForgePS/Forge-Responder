import { useEffect, useMemo, useState } from "react";
import { Boxes, CalendarClock, History, ListChecks, Pill, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { PLATFORM_SCOPE_ID } from "../lib/tenantPaths.js";
import {
  describeError, watchEmsSettings, watchInventoryBalances, watchInventoryItems, watchInventoryLocations,
  watchLotHolds, watchMedicationRecalls,
} from "../lib/ems/emsInventoryService.js";
import { isMedication } from "../lib/ems/inventoryDisplay.js";
import InventoryStockTab from "../components/ems/InventoryStockTab.jsx";
import InventoryTransactionModal from "../components/ems/InventoryTransactionModal.jsx";
import InventoryActivityTab from "../components/ems/InventoryActivityTab.jsx";
import MedicationCatalogTab from "../components/ems/medications/MedicationCatalogTab.jsx";
import MedicationExpirationTab from "../components/ems/medications/MedicationExpirationTab.jsx";
import MedicationRecallsTab from "../components/ems/medications/MedicationRecallsTab.jsx";
import "../styles/ems-inventory.css";

/**
 * EMS medications: stock by location and lot, expirations, recalls and lot holds, the
 * medication ledger and the catalog. Medications are inventory items with itemClass
 * "medication"; locations, counts and settings are shared with EMS Supply Inventory.
 */
export default function EmsMedicationsPage() {
  const { departmentId } = useTenant();
  const { permissions, isCreator } = useAuth();
  const has = (key) => isCreator || permissions?.[key] === true;
  const canManage = has("manageEmsMedications");
  const canUse = has("useEmsMedications") || canManage;
  const canApprove = has("approveEmsInventoryAdjustments");
  const ready = departmentId && departmentId !== PLATFORM_SCOPE_ID;

  const [tab, setTab] = useState("stock");
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [holds, setHolds] = useState([]);
  const [recalls, setRecalls] = useState([]);
  const [settings, setSettings] = useState(null);
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
      watchLotHolds(departmentId, setHolds, onError),
      watchMedicationRecalls(departmentId, setRecalls, onError),
      watchEmsSettings(departmentId, setSettings, () => setSettings(null)),
    ];
    return () => stops.forEach((stop) => stop());
  }, [departmentId, ready]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(""), 8000);
    return () => clearTimeout(timer);
  }, [message]);

  const medications = useMemo(() => items.filter(isMedication), [items]);
  // Stock moves for medications tracked here; controlled substances get their own ledger.
  const stocked = useMemo(() => medications.filter((m) => !m.controlledSchedule), [medications]);
  const medicationBalances = useMemo(() => {
    const ids = new Set(stocked.map((m) => m.id));
    return balances.filter((b) => ids.has(b.itemId));
  }, [balances, stocked]);
  const openRecalls = recalls.filter((r) => r.status === "open").length;
  const medicationHolds = holds.filter((h) => medications.some((m) => m.id === h.itemId));

  const tabs = [
    { id: "stock", label: "Stock", icon: Boxes },
    { id: "expiring", label: "Expirations", icon: CalendarClock },
    { id: "recalls", label: `Recalls and holds${openRecalls || medicationHolds.length ? ` (${openRecalls + medicationHolds.length})` : ""}`, icon: ShieldAlert },
    { id: "activity", label: "History", icon: History },
    { id: "catalog", label: "Catalog", icon: ListChecks },
  ];

  return (
    <div className="module-page ems-inventory-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Pill size={22} /></span>
          <div>
            <h1>EMS Medications</h1>
            <p>Medications by station, storage location and unit, with lots, expirations, recalls and holds.</p>
          </div>
        </div>
      </section>
      {!ready ? <p className="occupancy-muted">Choose a department in the workspace menu first.</p> : (
        <>
          <section className="cert-toolbar">
            <div className="segmented-control" role="tablist" aria-label="EMS medication views">
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
            <InventoryStockTab departmentId={departmentId} items={stocked} locations={locations} balances={medicationBalances} settings={settings}
              canUse={canUse} canManage={canManage} onRecord={setRecording} onMessage={setMessage} title="Medications on hand"
              emptyText={`No medications in the catalog yet. ${canManage ? "Add them on the Catalog tab; storage locations are set up in EMS Supply Inventory." : "A medication manager needs to add them."}`} />
          ) : null}
          {tab === "expiring" ? (
            <MedicationExpirationTab items={stocked} balances={medicationBalances} locations={locations} settings={settings}
              canUse={canUse} onRecord={setRecording} />
          ) : null}
          {tab === "recalls" ? (
            <MedicationRecallsTab departmentId={departmentId} medications={medications} balances={medicationBalances} locations={locations}
              holds={medicationHolds} recalls={recalls} canManage={canManage} onRecord={setRecording} onMessage={setMessage} />
          ) : null}
          {tab === "activity" ? (
            <InventoryActivityTab departmentId={departmentId} items={medications} locations={locations} canApprove={canApprove}
              onMessage={setMessage} itemClass="medication" title="Medication history" />
          ) : null}
          {tab === "catalog" ? <MedicationCatalogTab departmentId={departmentId} items={medications} canManage={canManage} onMessage={setMessage} /> : null}
          {recording ? (
            <InventoryTransactionModal departmentId={departmentId} items={stocked} locations={locations} balances={medicationBalances} settings={settings}
              canUse={canUse} canManage={canManage} preset={recording} title="Record medication stock"
              onClose={() => setRecording(null)} onDone={(text) => { setRecording(null); setMessage(text); }} />
          ) : null}
        </>
      )}
    </div>
  );
}
