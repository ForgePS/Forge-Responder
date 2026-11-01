import { useEffect, useState } from "react";
import { CirclePlus, Fuel, Save, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import {
  addRecommendedFuelExceptionRules,
  deleteFuelExceptionRule,
  deleteFuelSite,
  getFuelProductTypes,
  listFuelExceptionRules,
  listFuelSites,
  saveFuelExceptionRule,
  saveFuelSite,
} from "../../lib/fleet/index.js";
import { STARTER_FUEL_EXCEPTION_RULES } from "../../lib/fleet/fuelDefaults.js";
import {
  FUEL_RULE_TYPES,
  FUEL_SITE_TYPES,
  SEVERITY_LABELS,
  byActiveThenName,
  describeFuelRuleSetting,
  fuelRuleType,
  fuelRuleTypeLabel,
  fuelSiteTypeLabel,
  fuelUnitFor,
  missingRecommendedRules,
  newFuelRuleDraft,
  newFuelSiteDraft,
  siteTracksInventory,
} from "../../lib/fleet/configOpsLogic.js";
import "../../styles/fleet-config-ops.css";

// Vehicle-tracking (telematics) setup is intentionally not shown here: the
// adapters are not connected to any vendor yet. The telematics services
// (fleetTelematicsService.js) are kept for when that work is done.

const NEW_ID = "__new__";

function Field({ label, hint, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " fco-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint ? <small className="fco-hint">{hint}</small> : null}
    </label>
  );
}

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString();
}

/**
 * Fuel sites and fuel exception rules for Configuration Studio.
 * (legacyApparatus is accepted for the panel contract but not needed here.)
 */
export default function FleetFuelTelematicsConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("sites");
  const [sites, setSites] = useState([]);
  const [rules, setRules] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [siteDraft, setSiteDraft] = useState(null);
  const [ruleDraft, setRuleDraft] = useState(null);
  const products = getFuelProductTypes();

  const siteIsNew = selectedSiteId === NEW_ID;
  const ruleIsNew = selectedRuleId === NEW_ID;
  const siteOriginal = siteIsNew ? null : sites.find((row) => row.id === selectedSiteId) || null;
  const ruleOriginal = ruleIsNew ? null : rules.find((row) => row.id === selectedRuleId) || null;
  const siteDirty = Boolean(siteDraft) && (siteIsNew || JSON.stringify(siteDraft) !== JSON.stringify(siteOriginal));
  const ruleDirty = Boolean(ruleDraft) && (ruleIsNew || JSON.stringify(ruleDraft) !== JSON.stringify(ruleOriginal));
  const missingRecommended = missingRecommendedRules(rules, STARTER_FUEL_EXCEPTION_RULES);

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    setLoadError("");
    try {
      // Read only: opening this tab never writes anything.
      const [nextSites, nextRules] = await Promise.all([
        listFuelSites(departmentId),
        listFuelExceptionRules(departmentId),
      ]);
      setSites([...nextSites].sort(byActiveThenName));
      setRules([...nextRules].sort(byActiveThenName));
      setSelectedSiteId((c) => c || nextSites[0]?.id || "");
      setSelectedRuleId((c) => c || nextRules[0]?.id || "");
    } catch (err) {
      const message = err?.message || "Unable to load fuel settings.";
      setLoadError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    if (selectedSiteId === NEW_ID) return;
    const row = sites.find((item) => item.id === selectedSiteId);
    setSiteDraft(row ? { ...row } : null);
  }, [sites, selectedSiteId]);

  useEffect(() => {
    if (selectedRuleId === NEW_ID) return;
    const row = rules.find((item) => item.id === selectedRuleId);
    setRuleDraft(row ? { ...row } : null);
  }, [rules, selectedRuleId]);

  function confirmLeave(dirty) {
    return !dirty || window.confirm("You have unsaved changes. Discard them?");
  }

  function switchMode(next) {
    if (next === mode) return;
    const dirty = mode === "sites" ? siteDirty : ruleDirty;
    if (!confirmLeave(dirty)) return;
    if (mode === "sites" && siteIsNew) setSelectedSiteId(sites[0]?.id || "");
    if (mode === "rules" && ruleIsNew) setSelectedRuleId(rules[0]?.id || "");
    setMode(next);
  }

  // ——— Sites ———

  function startNewSite() {
    if (!confirmLeave(siteDirty)) return;
    setSelectedSiteId(NEW_ID);
    setSiteDraft(newFuelSiteDraft());
  }

  function selectSite(id) {
    if (id === selectedSiteId || !confirmLeave(siteDirty)) return;
    setSelectedSiteId(id);
  }

  async function saveSite() {
    if (!siteDraft) return;
    if (!String(siteDraft.name || "").trim()) {
      onError?.("Give the fuel site a name before saving.");
      return;
    }
    if (siteTracksInventory(siteDraft.siteType) && Number(siteDraft.capacity) > 0
      && Number(siteDraft.currentInventory) > Number(siteDraft.capacity)) {
      onError?.("The amount on hand can't be more than the tank holds.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveFuelSite(departmentId, { ...siteDraft, name: siteDraft.name.trim() }, actor);
      setSites((c) => [saved, ...c.filter((row) => row.id !== saved.id)].sort(byActiveThenName));
      setSelectedSiteId(saved.id);
      setSiteDraft({ ...saved });
      onMessage?.(siteIsNew ? `Added "${saved.name}".` : `Saved "${saved.name}".`);
    } catch (err) {
      onError?.(err?.message || "Unable to save the fuel site.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSite() {
    if (siteIsNew) {
      setSelectedSiteId(sites[0]?.id || "");
      if (!sites.length) setSiteDraft(null);
      return;
    }
    if (!siteOriginal) return;
    if (!window.confirm(`Remove "${siteOriginal.name}"? Fuel already logged from it keeps its history. This can't be undone.`)) return;
    setSaving(true);
    try {
      await deleteFuelSite(departmentId, siteOriginal.id, actor);
      const remaining = sites.filter((row) => row.id !== siteOriginal.id);
      setSites(remaining);
      setSelectedSiteId(remaining[0]?.id || "");
      if (!remaining.length) setSiteDraft(null);
      onMessage?.(`Removed "${siteOriginal.name}".`);
    } catch (err) {
      onError?.(err?.message || "Unable to remove the fuel site.");
    } finally {
      setSaving(false);
    }
  }

  // ——— Rules ———

  function startNewRule() {
    if (!confirmLeave(ruleDirty)) return;
    setSelectedRuleId(NEW_ID);
    setRuleDraft(newFuelRuleDraft());
  }

  function selectRule(id) {
    if (id === selectedRuleId || !confirmLeave(ruleDirty)) return;
    setSelectedRuleId(id);
  }

  async function saveRule() {
    if (!ruleDraft) return;
    if (!String(ruleDraft.name || "").trim()) {
      onError?.("Give the rule a name before saving.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveFuelExceptionRule(departmentId, { ...ruleDraft, name: ruleDraft.name.trim() }, actor);
      setRules((c) => [saved, ...c.filter((row) => row.id !== saved.id)].sort(byActiveThenName));
      setSelectedRuleId(saved.id);
      setRuleDraft({ ...saved });
      onMessage?.(ruleIsNew ? `Added "${saved.name}".` : `Saved "${saved.name}".`);
    } catch (err) {
      onError?.(err?.message || "Unable to save the rule.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRule() {
    if (ruleIsNew) {
      setSelectedRuleId(rules[0]?.id || "");
      if (!rules.length) setRuleDraft(null);
      return;
    }
    if (!ruleOriginal) return;
    if (!window.confirm(`Remove the rule "${ruleOriginal.name}"? Fuel entries will no longer be checked for this. This can't be undone.`)) return;
    setSaving(true);
    try {
      await deleteFuelExceptionRule(departmentId, ruleOriginal.id, actor);
      const remaining = rules.filter((row) => row.id !== ruleOriginal.id);
      setRules(remaining);
      setSelectedRuleId(remaining[0]?.id || "");
      if (!remaining.length) setRuleDraft(null);
      onMessage?.(`Removed "${ruleOriginal.name}".`);
    } catch (err) {
      onError?.(err?.message || "Unable to remove the rule.");
    } finally {
      setSaving(false);
    }
  }

  async function addRecommended() {
    if (ruleIsNew && !confirmLeave(ruleDirty)) return;
    setSaving(true);
    try {
      const next = await addRecommendedFuelExceptionRules(departmentId, actor);
      const added = next.length - rules.length;
      setRules([...next].sort(byActiveThenName));
      setSelectedRuleId((c) => (c && c !== NEW_ID ? c : next[0]?.id || ""));
      onMessage?.(added > 0 ? `Added ${added} recommended rule${added === 1 ? "" : "s"}.` : "You already have all the recommended rules.");
    } catch (err) {
      onError?.(err?.message || "Unable to add the recommended rules.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading fuel settings...</p></div>;
  }

  if (loadError) {
    return (
      <section className="panel">
        <div className="panel-body fco-empty" role="alert">
          <strong>Fuel settings couldn't be loaded.</strong>
          <span>{loadError}</span>
          <button className="secondary-button" type="button" onClick={reload}>Try again</button>
        </div>
      </section>
    );
  }

  const setSite = (patch) => setSiteDraft((c) => ({ ...c, ...patch }));
  const setRule = (patch) => setRuleDraft((c) => ({ ...c, ...patch }));
  const siteUnit = siteDraft ? fuelUnitFor(siteDraft.product, products) : "gallons";
  const ruleMeta = ruleDraft ? fuelRuleType(ruleDraft.ruleType) : null;

  return (
    <section className="fleet-fuel-telematics-config">
      <nav className="inspections-subnav" aria-label="Fuel settings">
        {[
          ["sites", "Fuel sites", Fuel],
          ["rules", "Fuel exception rules", ShieldAlert],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={`inspections-subnav-item${mode === id ? " active" : ""}`}
            onClick={() => switchMode(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      {mode === "sites" ? (
        <>
          <p className="fco-intro">
            Where your units get fuel or charge: station tanks, EV chargers, mobile fueling, and outside vendors
            or fuel cards. Tank levels go down automatically as fuel is logged from a site.
          </p>
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><Fuel size={15} /><strong>Fuel sites</strong></div>
                <button className="text-button" type="button" disabled={saving} onClick={startNewSite}>
                  <CirclePlus size={14} /> Add fuel site
                </button>
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {siteIsNew ? (
                    <button type="button" className="person-row selected">
                      <span>
                        <strong>{siteDraft?.name?.trim() || "New fuel site"}<span className="fco-tag fco-tag-new">Not saved</span></strong>
                        <small>{fuelSiteTypeLabel(siteDraft?.siteType)}</small>
                      </span>
                    </button>
                  ) : null}
                  {sites.map((item) => {
                    const unit = fuelUnitFor(item.product, products);
                    const product = products.find((p) => p.id === item.product)?.label || "Fuel";
                    const level = siteTracksInventory(item.siteType) && item.capacity
                      ? ` · ${formatNumber(item.currentInventory)} of ${formatNumber(item.capacity)} ${unit} on hand`
                      : "";
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${item.id === selectedSiteId ? "person-row selected" : "person-row"}${item.active === false ? " fco-row-off" : ""}`}
                        onClick={() => selectSite(item.id)}
                      >
                        <span>
                          <strong>
                            {item.name}
                            {item.active === false ? <span className="fco-tag">Not in use</span> : null}
                          </strong>
                          <small>{fuelSiteTypeLabel(item.siteType)} · {product}{level}</small>
                        </span>
                      </button>
                    );
                  })}
                  {!sites.length && !siteIsNew ? (
                    <div className="fco-empty">
                      <strong>No fuel sites yet.</strong>
                      <span>Add your station tanks, EV chargers, and the vendors or fuel cards you buy from.</span>
                      <button className="secondary-button" type="button" onClick={startNewSite}>
                        <CirclePlus size={14} /> Add fuel site
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {siteDraft ? (
              <section className="panel">
                <header>
                  <div><strong>{siteIsNew ? "New fuel site" : "Edit fuel site"}</strong></div>
                  <div className="fco-header-actions">
                    <button className="secondary-button danger-button" type="button" disabled={saving} onClick={removeSite}>
                      <Trash2 size={14} /> {siteIsNew ? "Discard" : "Remove"}
                    </button>
                    <button className="primary-button" type="button" disabled={saving || !siteDirty} onClick={saveSite}>
                      <Save size={14} /> {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </header>
                <div className="panel-body occupancy-form-grid">
                  <Field label="Name">
                    <input value={siteDraft.name || ""} placeholder="e.g. Station 1 diesel tank" onChange={(e) => setSite({ name: e.target.value })} />
                  </Field>
                  <Field label="Kind of site">
                    <select
                      value={siteDraft.siteType || "station_tank"}
                      onChange={(e) => {
                        const siteType = e.target.value;
                        setSite(siteType === "ev_charger"
                          ? { siteType, product: "electric" }
                          : { siteType, product: siteDraft.product === "electric" ? "diesel" : siteDraft.product });
                      }}
                    >
                      {FUEL_SITE_TYPES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                    </select>
                  </Field>
                  {siteDraft.siteType !== "ev_charger" ? (
                    <Field label="Fuel">
                      <select value={siteDraft.product || "diesel"} onChange={(e) => setSite({ product: e.target.value })}>
                        {products.filter((row) => row.id !== "electric").map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                      </select>
                    </Field>
                  ) : (
                    <Field label="Plug type" hint="For example J1772 or CCS.">
                      <input value={siteDraft.connectorType || ""} onChange={(e) => setSite({ connectorType: e.target.value })} />
                    </Field>
                  )}
                  <Field label="Location" hint="Station or address.">
                    <input value={siteDraft.location || ""} onChange={(e) => setSite({ location: e.target.value })} />
                  </Field>
                  {siteDraft.siteType === "vendor" ? (
                    <Field label="Vendor or fuel card company">
                      <input value={siteDraft.vendorName || ""} onChange={(e) => setSite({ vendorName: e.target.value })} />
                    </Field>
                  ) : null}
                  {siteTracksInventory(siteDraft.siteType) ? (
                    <>
                      <Field label={`Tank holds (${siteUnit})`}>
                        <input type="number" min="0" value={siteDraft.capacity ?? 0} onChange={(e) => setSite({ capacity: Number(e.target.value) || 0 })} />
                      </Field>
                      <Field label={`On hand now (${siteUnit})`} hint="Goes down automatically as fuel is logged from this site.">
                        <input type="number" min="0" value={siteDraft.currentInventory ?? 0} onChange={(e) => setSite({ currentInventory: Number(e.target.value) || 0 })} />
                      </Field>
                    </>
                  ) : null}
                  <Field label="Notes" wide>
                    <textarea rows={2} value={siteDraft.notes || ""} onChange={(e) => setSite({ notes: e.target.value })} />
                  </Field>
                  <label className="occupancy-primary-toggle">
                    <input type="checkbox" checked={siteDraft.active !== false} onChange={(e) => setSite({ active: e.target.checked })} />
                    <span>
                      In use
                      <small className="fco-hint">Turn off to stop offering this site when fuel is logged.</small>
                    </span>
                  </label>
                </div>
              </section>
            ) : null}
          </section>
        </>
      ) : null}

      {mode === "rules" ? (
        <>
          <p className="fco-intro">
            When fuel is logged, FORGE checks it against these rules and flags anything unusual for review,
            such as a fill bigger than normal or a missing receipt.
          </p>
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><ShieldAlert size={15} /><strong>Fuel exception rules</strong></div>
                <div className="fco-header-actions">
                  {rules.length && missingRecommended.length ? (
                    <button className="text-button" type="button" disabled={saving} onClick={addRecommended}>
                      <Sparkles size={14} /> Add recommended ({missingRecommended.length})
                    </button>
                  ) : null}
                  <button className="text-button" type="button" disabled={saving} onClick={startNewRule}>
                    <CirclePlus size={14} /> Add rule
                  </button>
                </div>
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {ruleIsNew ? (
                    <button type="button" className="person-row selected">
                      <span>
                        <strong>{ruleDraft?.name?.trim() || "New rule"}<span className="fco-tag fco-tag-new">Not saved</span></strong>
                        <small>{fuelRuleTypeLabel(ruleDraft?.ruleType)}</small>
                      </span>
                    </button>
                  ) : null}
                  {rules.map((item) => {
                    const setting = describeFuelRuleSetting(item);
                    const kind = fuelRuleTypeLabel(item.ruleType);
                    const parts = [];
                    if (kind !== item.name) parts.push(kind);
                    if (setting) parts.push(setting);
                    parts.push(`${SEVERITY_LABELS[item.severity] || "Medium"} priority`);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${item.id === selectedRuleId ? "person-row selected" : "person-row"}${item.enabled === false ? " fco-row-off" : ""}`}
                        onClick={() => selectRule(item.id)}
                      >
                        <span>
                          <strong>
                            {item.name}
                            {item.enabled === false ? <span className="fco-tag">Off</span> : null}
                          </strong>
                          <small>{parts.join(" · ")}</small>
                        </span>
                      </button>
                    );
                  })}
                  {!rules.length && !ruleIsNew ? (
                    <div className="fco-empty">
                      <strong>No fuel exception rules yet.</strong>
                      <span>
                        Start with the recommended set (odometer went backwards, fill larger than normal, wrong fuel,
                        possible duplicate, missing receipt, more fuel than the tank had). You can adjust or remove any of them.
                      </span>
                      <button className="secondary-button" type="button" disabled={saving} onClick={addRecommended}>
                        <Sparkles size={14} /> Add recommended rules
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {ruleDraft ? (
              <section className="panel">
                <header>
                  <div><strong>{ruleIsNew ? "New rule" : "Edit rule"}</strong></div>
                  <div className="fco-header-actions">
                    <button className="secondary-button danger-button" type="button" disabled={saving} onClick={removeRule}>
                      <Trash2 size={14} /> {ruleIsNew ? "Discard" : "Remove"}
                    </button>
                    <button className="primary-button" type="button" disabled={saving || !ruleDirty} onClick={saveRule}>
                      <Save size={14} /> {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </header>
                <div className="panel-body occupancy-form-grid">
                  <Field label="What to check" hint={ruleMeta ? ruleMeta.explain : "This rule's check isn't recognized, so it never flags anything. You can remove it."}>
                    {ruleIsNew ? (
                      <select
                        value={ruleDraft.ruleType}
                        onChange={(e) => {
                          const fresh = newFuelRuleDraft(e.target.value);
                          setRuleDraft((c) => ({ ...fresh, severity: c.severity, enabled: c.enabled }));
                        }}
                      >
                        {FUEL_RULE_TYPES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                      </select>
                    ) : (
                      <span className="fco-readonly">{fuelRuleTypeLabel(ruleDraft.ruleType)}</span>
                    )}
                  </Field>
                  <Field label="Name">
                    <input value={ruleDraft.name || ""} onChange={(e) => setRule({ name: e.target.value })} />
                  </Field>
                  {ruleMeta?.threshold ? (
                    <Field label={`${ruleMeta.threshold.label} (${ruleMeta.threshold.unit})`}>
                      <input
                        type="number"
                        min="1"
                        value={ruleDraft.threshold || ruleMeta.threshold.defaultValue}
                        onChange={(e) => setRule({ threshold: Number(e.target.value) || 0 })}
                      />
                    </Field>
                  ) : null}
                  <Field label="Priority when flagged">
                    <select value={ruleDraft.severity || "medium"} onChange={(e) => setRule({ severity: e.target.value })}>
                      {Object.entries(SEVERITY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Description" wide>
                    <textarea rows={2} value={ruleDraft.description || ""} onChange={(e) => setRule({ description: e.target.value })} />
                  </Field>
                  <label className="occupancy-primary-toggle">
                    <input type="checkbox" checked={ruleDraft.enabled !== false} onChange={(e) => setRule({ enabled: e.target.checked })} />
                    <span>
                      Turned on
                      <small className="fco-hint">When off, fuel entries are not checked for this.</small>
                    </span>
                  </label>
                </div>
              </section>
            ) : null}
          </section>
        </>
      ) : null}

      <p className="fco-note">
        Vehicle tracking integrations (Geotab, Samsara) are set up by FORGE Public Safety.
        Contact us if your department uses one.
      </p>
    </section>
  );
}
