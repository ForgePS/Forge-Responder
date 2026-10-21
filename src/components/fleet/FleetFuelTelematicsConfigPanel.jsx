import { useEffect, useState } from "react";
import { CirclePlus, Fuel, Radio, Save } from "lucide-react";
import {
  ensureFleetAssets,
  ensureFuelExceptionRulesSeeded,
  ensureFuelSitesSeeded,
  ensureTelematicsAdaptersSeeded,
  getFuelProductTypes,
  listTelematicsMappings,
  saveFuelExceptionRule,
  saveFuelSite,
  saveTelematicsAdapter,
  saveTelematicsMapping,
} from "../../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Fuel sites, exception rules, and telematics adapters for Configuration Studio.
 */
export default function FleetFuelTelematicsConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
  legacyApparatus = [],
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("sites");
  const [sites, setSites] = useState([]);
  const [rules, setRules] = useState([]);
  const [adapters, setAdapters] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [selectedAdapterId, setSelectedAdapterId] = useState("");
  const [siteDraft, setSiteDraft] = useState(null);
  const [ruleDraft, setRuleDraft] = useState(null);
  const [adapterDraft, setAdapterDraft] = useState(null);
  const [mapDraft, setMapDraft] = useState({ fleetAssetId: "", adapterId: "", externalVehicleId: "" });
  const products = getFuelProductTypes();

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [nextSites, nextRules, nextAdapters, nextMappings, nextAssets] = await Promise.all([
        ensureFuelSitesSeeded(departmentId, actor),
        ensureFuelExceptionRulesSeeded(departmentId, actor),
        ensureTelematicsAdaptersSeeded(departmentId, actor),
        listTelematicsMappings(departmentId),
        ensureFleetAssets(departmentId, legacyApparatus, actor),
      ]);
      setSites(nextSites);
      setRules(nextRules);
      setAdapters(nextAdapters);
      setMappings(nextMappings);
      setAssets(nextAssets);
      setSelectedSiteId((c) => c || nextSites[0]?.id || "");
      setSelectedRuleId((c) => c || nextRules[0]?.id || "");
      setSelectedAdapterId((c) => c || nextAdapters[0]?.id || "");
      setMapDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        adapterId: c.adapterId || nextAdapters[0]?.id || "",
      }));
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load fuel / telematics config.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    setSiteDraft(sites.find((row) => row.id === selectedSiteId) || null);
  }, [sites, selectedSiteId]);

  useEffect(() => {
    setRuleDraft(rules.find((row) => row.id === selectedRuleId) || null);
  }, [rules, selectedRuleId]);

  useEffect(() => {
    setAdapterDraft(adapters.find((row) => row.id === selectedAdapterId) || null);
  }, [adapters, selectedAdapterId]);

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading fuel & telematics config...</p></div>;
  }

  return (
    <section className="fleet-fuel-telematics-config">
      <nav className="inspections-subnav" aria-label="Fuel telematics config">
        {[
          ["sites", "Fuel sites", Fuel],
          ["rules", "Exception rules", Fuel],
          ["adapters", "Telematics adapters", Radio],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={`inspections-subnav-item${mode === id ? " active" : ""}`}
            onClick={() => setMode(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      {mode === "sites" ? (
        <section className="personnel-workspace occupancy-workspace">
          <section className="panel">
            <header>
              <div><Fuel size={15} /><strong>Sites</strong></div>
              <button
                className="text-button"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const saved = await saveFuelSite(departmentId, {
                      name: "New fuel site",
                      siteType: "station_tank",
                      product: "diesel",
                      capacity: 1000,
                      currentInventory: 500,
                      active: true,
                    }, actor);
                    setSites((c) => [saved, ...c]);
                    setSelectedSiteId(saved.id);
                    onMessage?.("Fuel site created.");
                  } catch (err) {
                    onError?.(err?.message || "Unable to create site.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <CirclePlus size={14} /> Add site
              </button>
            </header>
            <div className="panel-body">
              <div className="personnel-list">
                {sites.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === selectedSiteId ? "person-row selected" : "person-row"}
                    onClick={() => setSelectedSiteId(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.product} · {item.currentInventory}/{item.capacity || "—"}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
          {siteDraft ? (
            <section className="panel">
              <header>
                <div><strong>Edit site</strong></div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const saved = await saveFuelSite(departmentId, siteDraft, actor);
                      setSites((c) => [saved, ...c.filter((row) => row.id !== saved.id)].sort((a, b) => a.name.localeCompare(b.name)));
                      onMessage?.("Fuel site saved.");
                    } catch (err) {
                      onError?.(err?.message || "Unable to save site.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Save size={14} /> Save
                </button>
              </header>
              <div className="panel-body occupancy-form-grid">
                <Field label="Name"><input value={siteDraft.name || ""} onChange={(e) => setSiteDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                <Field label="Type">
                  <select value={siteDraft.siteType || "station_tank"} onChange={(e) => setSiteDraft((c) => ({ ...c, siteType: e.target.value }))}>
                    <option value="station_tank">Station tank</option>
                    <option value="ev_charger">EV charger</option>
                    <option value="mobile">Mobile fueling</option>
                    <option value="vendor">Vendor</option>
                  </select>
                </Field>
                <Field label="Product">
                  <select value={siteDraft.product || "diesel"} onChange={(e) => setSiteDraft((c) => ({ ...c, product: e.target.value }))}>
                    {products.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Capacity"><input type="number" value={siteDraft.capacity ?? 0} onChange={(e) => setSiteDraft((c) => ({ ...c, capacity: Number(e.target.value) || 0 }))} /></Field>
                <Field label="Inventory"><input type="number" value={siteDraft.currentInventory ?? 0} onChange={(e) => setSiteDraft((c) => ({ ...c, currentInventory: Number(e.target.value) || 0 }))} /></Field>
                <Field label="Location"><input value={siteDraft.location || ""} onChange={(e) => setSiteDraft((c) => ({ ...c, location: e.target.value }))} /></Field>
                <Field label="Connector (EV)"><input value={siteDraft.connectorType || ""} onChange={(e) => setSiteDraft((c) => ({ ...c, connectorType: e.target.value }))} /></Field>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={siteDraft.active !== false} onChange={(e) => setSiteDraft((c) => ({ ...c, active: e.target.checked }))} />
                  Active
                </label>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {mode === "rules" ? (
        <section className="personnel-workspace occupancy-workspace">
          <section className="panel">
            <header><div><strong>Exception rules</strong></div></header>
            <div className="panel-body">
              <div className="personnel-list">
                {rules.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === selectedRuleId ? "person-row selected" : "person-row"}
                    onClick={() => setSelectedRuleId(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.ruleType} · {item.enabled === false ? "off" : "on"}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
          {ruleDraft ? (
            <section className="panel">
              <header>
                <div><strong>Edit rule</strong></div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const saved = await saveFuelExceptionRule(departmentId, ruleDraft, actor);
                      setRules((c) => [saved, ...c.filter((row) => row.id !== saved.id)].sort((a, b) => a.name.localeCompare(b.name)));
                      onMessage?.("Exception rule saved.");
                    } catch (err) {
                      onError?.(err?.message || "Unable to save rule.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Save size={14} /> Save
                </button>
              </header>
              <div className="panel-body occupancy-form-grid">
                <Field label="Name"><input value={ruleDraft.name || ""} onChange={(e) => setRuleDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                <Field label="Threshold"><input type="number" value={ruleDraft.threshold ?? 0} onChange={(e) => setRuleDraft((c) => ({ ...c, threshold: Number(e.target.value) || 0 }))} /></Field>
                <Field label="Severity">
                  <select value={ruleDraft.severity || "medium"} onChange={(e) => setRuleDraft((c) => ({ ...c, severity: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <Field label="Description">
                  <textarea rows={3} value={ruleDraft.description || ""} onChange={(e) => setRuleDraft((c) => ({ ...c, description: e.target.value }))} />
                </Field>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={ruleDraft.enabled !== false} onChange={(e) => setRuleDraft((c) => ({ ...c, enabled: e.target.checked }))} />
                  Enabled
                </label>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {mode === "adapters" ? (
        <section className="personnel-workspace occupancy-workspace">
          <section className="panel">
            <header>
              <div><Radio size={15} /><strong>Adapters</strong></div>
              <button
                className="text-button"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const saved = await saveTelematicsAdapter(departmentId, {
                      name: "New adapter",
                      provider: "generic_api",
                      status: "configured",
                      syncMeters: true,
                      syncFuelLevel: true,
                      pollMinutes: 15,
                    }, actor);
                    setAdapters((c) => [saved, ...c]);
                    setSelectedAdapterId(saved.id);
                    onMessage?.("Adapter created.");
                  } catch (err) {
                    onError?.(err?.message || "Unable to create adapter.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <CirclePlus size={14} /> Add adapter
              </button>
            </header>
            <div className="panel-body">
              <div className="personnel-list">
                {adapters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === selectedAdapterId ? "person-row selected" : "person-row"}
                    onClick={() => setSelectedAdapterId(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.provider} · {item.status}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
          {adapterDraft ? (
            <section className="panel">
              <header>
                <div><strong>Edit adapter</strong></div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const saved = await saveTelematicsAdapter(departmentId, adapterDraft, actor);
                      setAdapters((c) => [saved, ...c.filter((row) => row.id !== saved.id)].sort((a, b) => a.name.localeCompare(b.name)));
                      onMessage?.("Adapter saved.");
                    } catch (err) {
                      onError?.(err?.message || "Unable to save adapter.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Save size={14} /> Save
                </button>
              </header>
              <div className="panel-body occupancy-form-grid">
                <Field label="Name"><input value={adapterDraft.name || ""} onChange={(e) => setAdapterDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                <Field label="Provider">
                  <select value={adapterDraft.provider || "manual"} onChange={(e) => setAdapterDraft((c) => ({ ...c, provider: e.target.value }))}>
                    <option value="manual">Manual / CSV</option>
                    <option value="generic_api">Generic API</option>
                    <option value="geotab">Geotab</option>
                    <option value="samsara">Samsara</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select value={adapterDraft.status || "configured"} onChange={(e) => setAdapterDraft((c) => ({ ...c, status: e.target.value }))}>
                    <option value="configured">Configured</option>
                    <option value="active">Active</option>
                    <option value="error">Error</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </Field>
                <Field label="Poll minutes"><input type="number" min="0" value={adapterDraft.pollMinutes ?? 0} onChange={(e) => setAdapterDraft((c) => ({ ...c, pollMinutes: Number(e.target.value) || 0 }))} /></Field>
                <Field label="API base URL"><input value={adapterDraft.apiBaseUrl || ""} onChange={(e) => setAdapterDraft((c) => ({ ...c, apiBaseUrl: e.target.value }))} /></Field>
                <Field label="Notes"><textarea rows={2} value={adapterDraft.notes || ""} onChange={(e) => setAdapterDraft((c) => ({ ...c, notes: e.target.value }))} /></Field>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={adapterDraft.syncMeters !== false} onChange={(e) => setAdapterDraft((c) => ({ ...c, syncMeters: e.target.checked }))} />
                  Sync odometer / hours
                </label>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={adapterDraft.syncFuelLevel !== false} onChange={(e) => setAdapterDraft((c) => ({ ...c, syncFuelLevel: e.target.checked }))} />
                  Sync fuel level
                </label>
              </div>

              <section className="occupancy-section">
                <header><div><strong>Asset mappings</strong></div></header>
                <div className="occupancy-form-grid">
                  <Field label="Fleet asset">
                    <select value={mapDraft.fleetAssetId} onChange={(e) => setMapDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                      {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fleetNumber || asset.id}</option>)}
                    </select>
                  </Field>
                  <Field label="External vehicle ID">
                    <input value={mapDraft.externalVehicleId} onChange={(e) => setMapDraft((c) => ({ ...c, externalVehicleId: e.target.value }))} />
                  </Field>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving || !mapDraft.externalVehicleId.trim()}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const saved = await saveTelematicsMapping(departmentId, {
                        ...mapDraft,
                        adapterId: selectedAdapterId,
                      }, actor);
                      setMappings((c) => [saved, ...c.filter((row) => row.id !== saved.id)]);
                      setMapDraft((c) => ({ ...c, externalVehicleId: "" }));
                      onMessage?.("Mapping saved.");
                    } catch (err) {
                      onError?.(err?.message || "Unable to save mapping.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Save mapping
                </button>
                <ul className="occupancy-timeline">
                  {mappings.filter((row) => row.adapterId === selectedAdapterId).map((row) => (
                    <li key={row.id}>
                      <strong>{row.fleetNumber}</strong>
                      <small>→ {row.externalVehicleId}</small>
                    </li>
                  ))}
                </ul>
              </section>
            </section>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
