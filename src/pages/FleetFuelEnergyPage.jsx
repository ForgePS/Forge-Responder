import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BatteryCharging, CirclePlus, Fuel, Radio } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  buildFuelEnergySummary,
  buildTelematicsBoard,
  canEditFleetFuel,
  canViewFleetFuel,
  createChargingSession,
  createFuelTransaction,
  ensureFleetAssets,
  getFuelProductTypes,
  getFuelTransactionSources,
  ingestTelematicsEvent,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetFuelEnergyPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetFuel(permissions, isCreator);
  const canEdit = canEditFleetFuel(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("fuel");
  const [summary, setSummary] = useState(null);
  const [telematics, setTelematics] = useState(null);
  const [assets, setAssets] = useState([]);
  const [selectedTxId, setSelectedTxId] = useState("");
  const [showFuel, setShowFuel] = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [showTelematics, setShowTelematics] = useState(false);
  const [fuelDraft, setFuelDraft] = useState({
    fleetAssetId: "",
    siteId: "",
    product: "diesel",
    quantity: "20",
    unitCost: "3.50",
    meterValue: "",
    source: "manual",
    receiptRef: "",
    driverName: "",
  });
  const [chargeDraft, setChargeDraft] = useState({
    fleetAssetId: "",
    siteId: "",
    energyKwh: "25",
    unitCost: "0.18",
    startSoc: "30",
    endSoc: "80",
  });
  const [telDraft, setTelDraft] = useState({
    fleetAssetId: "",
    adapterId: "",
    odometer: "",
    engineHours: "",
    fuelLevel: "",
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const products = getFuelProductTypes();
  const sources = getFuelTransactionSources();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextAssets = await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const [fuelBoard, telBoard] = await Promise.all([
        buildFuelEnergySummary(departmentId),
        buildTelematicsBoard(departmentId),
      ]);
      setAssets(nextAssets);
      setSummary(fuelBoard);
      setTelematics(telBoard);
      setSelectedTxId((current) => current || fuelBoard.transactions[0]?.id || "");
      setFuelDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        siteId: c.siteId || fuelBoard.sites.find((s) => s.siteType !== "ev_charger")?.id || fuelBoard.sites[0]?.id || "",
      }));
      setChargeDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        siteId: c.siteId || fuelBoard.sites.find((s) => s.siteType === "ev_charger")?.id || "",
      }));
      setTelDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        adapterId: c.adapterId || telBoard.adapters[0]?.id || "",
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load fuel & energy.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const selectedTx = useMemo(
    () => (summary?.transactions || []).find((row) => row.id === selectedTxId) || null,
    [summary, selectedTxId]
  );

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Fuel & Energy"
        description="Fuel transactions, EV charging, exception rules, and telematics meter sync."
        activeNavName="Fuel & Energy"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button className="secondary-button" type="button" onClick={() => setShowCharge(true)}>
              <BatteryCharging size={14} /> Log charge
            </button>
            <button className="secondary-button" type="button" onClick={() => setShowTelematics(true)}>
              <Radio size={14} /> Ingest telematics
            </button>
            <button className="primary-button" type="button" onClick={() => setShowFuel(true)}>
              <CirclePlus size={14} /> Log fuel
            </button>
          </div>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading fuel & energy...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && summary ? (
          <section className="fleet-summary">
            {[
              ["Transactions", summary.transactionCount, "info"],
              ["Exceptions", summary.exceptionCount, "critical"],
              ["Fuel cost", `$${summary.fuelCost}`, "warning"],
              ["Energy kWh", summary.energyKwh, "info"],
              ["Energy cost", `$${summary.energyCost}`, "info"],
              ["Synced events", telematics?.summary?.synced || 0, "success"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Fuel energy views">
            {[
              ["fuel", "Fuel transactions", Fuel],
              ["exceptions", "Exceptions", AlertTriangle],
              ["charging", "EV charging", BatteryCharging],
              ["telematics", "Telematics", Radio],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={`inspections-subnav-item${tab === id ? " active" : ""}`}
                onClick={() => setTab(id)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>
        ) : null}

        {!loading && tab === "fuel" ? (
          summary?.transactions?.length ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header>
                  <div><Fuel size={15} /><strong>Transactions</strong></div>
                  <span className="inspections-count">{summary.transactions.length}</span>
                </header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {summary.transactions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedTxId ? "person-row selected" : "person-row"}
                        onClick={() => setSelectedTxId(item.id)}
                      >
                        <span>
                          <strong>{item.fleetNumber || "No unit"}</strong>
                          <small>
                            {item.quantity} {item.unit} {item.product}
                            {" · "}
                            {item.occurredAt ? new Date(item.occurredAt).toLocaleString() : ""}
                          </small>
                        </span>
                        {(item.exceptions || []).length ? <FleetStatusBadge status="critical" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              {selectedTx ? (
                <section className="panel">
                  <header>
                    <div><strong>{selectedTx.id}</strong></div>
                    {(selectedTx.exceptions || []).length ? <FleetStatusBadge status={selectedTx.exceptionSeverity || "warning"} /> : null}
                  </header>
                  <div className="panel-body config-studio-body">
                    <div className="occupancy-form-grid">
                      <div><span className="occupancy-muted">Unit</span><strong>{selectedTx.fleetNumber || "—"}</strong></div>
                      <div><span className="occupancy-muted">Site</span><strong>{selectedTx.siteName || "—"}</strong></div>
                      <div><span className="occupancy-muted">Product</span><strong>{selectedTx.product}</strong></div>
                      <div><span className="occupancy-muted">Quantity</span><strong>{selectedTx.quantity} {selectedTx.unit}</strong></div>
                      <div><span className="occupancy-muted">Cost</span><strong>${Number(selectedTx.totalCost || 0).toFixed(2)}</strong></div>
                      <div><span className="occupancy-muted">Meter</span><strong>{selectedTx.meterValue || "—"}{selectedTx.meterSynced ? " (synced)" : ""}</strong></div>
                      <div><span className="occupancy-muted">Source</span><strong>{selectedTx.source}</strong></div>
                      <div><span className="occupancy-muted">Driver</span><strong>{selectedTx.driverName || "—"}</strong></div>
                    </div>
                    {(selectedTx.exceptions || []).length ? (
                      <ul className="occupancy-timeline">
                        {selectedTx.exceptions.map((ex, index) => (
                          <li key={`${ex.ruleId}-${index}`}>
                            <strong>{ex.ruleType}</strong>
                            <small>{ex.severity}</small>
                            <p>{ex.message}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </section>
          ) : (
            <FleetEmptyState title="No fuel transactions" description="Log a fuel fill or EV charge to get started." icon={Fuel} />
          )
        ) : null}

        {!loading && tab === "exceptions" ? (
          (summary?.exceptions || []).length ? (
            <section className="panel">
              <header><div><AlertTriangle size={15} /><strong>Open exceptions</strong></div></header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {summary.exceptions.map((tx) => (
                    <li key={tx.id}>
                      <strong>{tx.fleetNumber || tx.id}</strong>
                      <small>{tx.exceptions.map((ex) => ex.message).join(" · ")}</small>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No exceptions" description="Fuel exception rules will flag meter rollbacks, excess quantity, duplicates, and more." icon={AlertTriangle} />
          )
        ) : null}

        {!loading && tab === "charging" ? (
          (summary?.sessions || []).length ? (
            <section className="panel">
              <header><div><BatteryCharging size={15} /><strong>Charging sessions</strong></div></header>
              <div className="panel-body">
                <div className="cert-table" style={{ minWidth: 0 }}>
                  <div className="cert-row cert-head">
                    <span>Unit</span>
                    <span>Energy</span>
                    <span>SOC</span>
                    <span>Cost</span>
                    <span>Site</span>
                    <span>Ended</span>
                  </div>
                  {summary.sessions.map((session) => (
                    <div className="cert-row" key={session.id}>
                      <strong>{session.fleetNumber || "—"}</strong>
                      <span>{session.energyKwh} kWh</span>
                      <span>{session.startSoc || "—"} → {session.endSoc || "—"}%</span>
                      <span>${Number(session.totalCost || 0).toFixed(2)}</span>
                      <span>{session.siteName || "—"}</span>
                      <span>{session.endedAt ? new Date(session.endedAt).toLocaleString() : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No charging sessions" description="Log an EV charge against a charger site." icon={BatteryCharging} />
          )
        ) : null}

        {!loading && tab === "telematics" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><Radio size={15} /><strong>Adapters</strong></div>
                <span className="inspections-count">{telematics?.summary?.adapters || 0}</span>
              </header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {(telematics?.adapters || []).map((adapter) => (
                    <li key={adapter.id}>
                      <strong>{adapter.name}</strong>
                      <small>
                        {adapter.provider} · {adapter.status}
                        {adapter.lastSyncAt ? ` · last sync ${new Date(adapter.lastSyncAt).toLocaleString()}` : ""}
                      </small>
                    </li>
                  ))}
                </ul>
                <p className="occupancy-muted">
                  Mappings: {telematics?.summary?.mappings || 0}
                  {" · "}
                  Unmapped assets: {telematics?.summary?.unmappedAssets || 0}
                </p>
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Recent events</strong></div></header>
              <div className="panel-body">
                {(telematics?.events || []).length ? (
                  <ul className="occupancy-timeline">
                    {telematics.events.slice(0, 20).map((event) => (
                      <li key={event.id}>
                        <strong>{event.fleetNumber || event.externalVehicleId || event.id}</strong>
                        <small>
                          {event.occurredAt ? new Date(event.occurredAt).toLocaleString() : ""}
                          {event.odometer !== "" ? ` · odo ${event.odometer}` : ""}
                          {event.meterSynced ? " · synced" : ""}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="occupancy-muted">No telematics events yet. Use Ingest telematics to sync meters.</p>
                )}
              </div>
            </section>
          </section>
        ) : null}

        {showFuel ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header>
                <strong>Log fuel transaction</strong>
                <button type="button" onClick={() => setShowFuel(false)}>×</button>
              </header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={fuelDraft.fleetAssetId} onChange={(e) => setFuelDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fleetNumber || asset.id}</option>)}
                  </select>
                </Field>
                <Field label="Site">
                  <select value={fuelDraft.siteId} onChange={(e) => setFuelDraft((c) => ({ ...c, siteId: e.target.value }))}>
                    <option value="">None</option>
                    {(summary?.sites || []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                  </select>
                </Field>
                <Field label="Product">
                  <select value={fuelDraft.product} onChange={(e) => setFuelDraft((c) => ({ ...c, product: e.target.value }))}>
                    {products.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Quantity">
                  <input value={fuelDraft.quantity} onChange={(e) => setFuelDraft((c) => ({ ...c, quantity: e.target.value }))} />
                </Field>
                <Field label="Unit cost">
                  <input value={fuelDraft.unitCost} onChange={(e) => setFuelDraft((c) => ({ ...c, unitCost: e.target.value }))} />
                </Field>
                <Field label="Meter (odometer)">
                  <input value={fuelDraft.meterValue} onChange={(e) => setFuelDraft((c) => ({ ...c, meterValue: e.target.value }))} />
                </Field>
                <Field label="Source">
                  <select value={fuelDraft.source} onChange={(e) => setFuelDraft((c) => ({ ...c, source: e.target.value }))}>
                    {sources.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Receipt ref">
                  <input value={fuelDraft.receiptRef} onChange={(e) => setFuelDraft((c) => ({ ...c, receiptRef: e.target.value }))} />
                </Field>
                <Field label="Driver">
                  <input value={fuelDraft.driverName} onChange={(e) => setFuelDraft((c) => ({ ...c, driverName: e.target.value }))} />
                </Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowFuel(false)}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !fuelDraft.fleetAssetId}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const created = await createFuelTransaction(departmentId, {
                        ...fuelDraft,
                        quantity: Number(fuelDraft.quantity) || 0,
                        unitCost: Number(fuelDraft.unitCost) || 0,
                        driverName: fuelDraft.driverName || actor.actorName,
                      }, actor);
                      setShowFuel(false);
                      setMessage(`Fuel logged${created.exceptions.length ? ` with ${created.exceptions.length} exception(s)` : ""}.`);
                      await reload();
                    } catch (createError) {
                      setError(createError?.message || "Unable to log fuel.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {showCharge ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header>
                <strong>Log EV charge</strong>
                <button type="button" onClick={() => setShowCharge(false)}>×</button>
              </header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={chargeDraft.fleetAssetId} onChange={(e) => setChargeDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fleetNumber || asset.id}</option>)}
                  </select>
                </Field>
                <Field label="Charger site">
                  <select value={chargeDraft.siteId} onChange={(e) => setChargeDraft((c) => ({ ...c, siteId: e.target.value }))}>
                    {(summary?.sites || []).filter((s) => s.siteType === "ev_charger").map((site) => (
                      <option key={site.id} value={site.id}>{site.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Energy (kWh)">
                  <input value={chargeDraft.energyKwh} onChange={(e) => setChargeDraft((c) => ({ ...c, energyKwh: e.target.value }))} />
                </Field>
                <Field label="Unit cost">
                  <input value={chargeDraft.unitCost} onChange={(e) => setChargeDraft((c) => ({ ...c, unitCost: e.target.value }))} />
                </Field>
                <Field label="Start SOC %">
                  <input value={chargeDraft.startSoc} onChange={(e) => setChargeDraft((c) => ({ ...c, startSoc: e.target.value }))} />
                </Field>
                <Field label="End SOC %">
                  <input value={chargeDraft.endSoc} onChange={(e) => setChargeDraft((c) => ({ ...c, endSoc: e.target.value }))} />
                </Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowCharge(false)}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !chargeDraft.fleetAssetId}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await createChargingSession(departmentId, {
                        ...chargeDraft,
                        energyKwh: Number(chargeDraft.energyKwh) || 0,
                        unitCost: Number(chargeDraft.unitCost) || 0,
                      }, actor);
                      setShowCharge(false);
                      setMessage("Charging session logged.");
                      await reload();
                    } catch (createError) {
                      setError(createError?.message || "Unable to log charge.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {showTelematics ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header>
                <strong>Ingest telematics event</strong>
                <button type="button" onClick={() => setShowTelematics(false)}>×</button>
              </header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={telDraft.fleetAssetId} onChange={(e) => setTelDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fleetNumber || asset.id}</option>)}
                  </select>
                </Field>
                <Field label="Adapter">
                  <select value={telDraft.adapterId} onChange={(e) => setTelDraft((c) => ({ ...c, adapterId: e.target.value }))}>
                    {(telematics?.adapters || []).map((adapter) => (
                      <option key={adapter.id} value={adapter.id}>{adapter.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Odometer">
                  <input value={telDraft.odometer} onChange={(e) => setTelDraft((c) => ({ ...c, odometer: e.target.value }))} />
                </Field>
                <Field label="Engine hours">
                  <input value={telDraft.engineHours} onChange={(e) => setTelDraft((c) => ({ ...c, engineHours: e.target.value }))} />
                </Field>
                <Field label="Fuel level">
                  <input value={telDraft.fuelLevel} onChange={(e) => setTelDraft((c) => ({ ...c, fuelLevel: e.target.value }))} />
                </Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowTelematics(false)}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !telDraft.fleetAssetId}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const event = await ingestTelematicsEvent(departmentId, telDraft, actor);
                      setShowTelematics(false);
                      setMessage(`Telematics ingested${event.meterSynced ? " and meters synced" : ""}.`);
                      await reload();
                    } catch (createError) {
                      setError(createError?.message || "Unable to ingest telematics.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Ingest & sync
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
