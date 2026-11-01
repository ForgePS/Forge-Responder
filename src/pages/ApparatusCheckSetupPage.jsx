import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CirclePlus, ClipboardCheck, RotateCcw, Save, Trash2, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import {
  archiveChecklistTemplate,
  ensureChecklistTemplatesSeeded,
  isRetiredFleetAsset,
  listChecklistTemplates,
  listFleetAssets,
  saveAndPublishChecklist,
  saveFleetAsset,
  syncFleetAssetsFromApparatus,
} from "../lib/fleet/index.js";
import { canManageFleetConfig } from "../lib/fleet/fleetPermissions.js";

const UNIT_TYPES = ["Engine", "Ladder / Truck", "Rescue", "Ambulance / Medic", "Brush", "Tanker / Tender", "Command / Battalion", "Hazmat", "Utility", "Boat", "Other"];

// The item types an admin picks from, in plain words.
const ITEM_TYPES = [
  { id: "pass_fail", label: "Pass / Fail" },
  { id: "pass_fail_na", label: "Pass / Fail / N/A" },
  { id: "yes_no", label: "Yes / No" },
  { id: "fuel_level", label: "Fuel level (%)" },
  { id: "meter_reading", label: "Mileage or hours reading" },
  { id: "number", label: "Number" },
  { id: "short_text", label: "Short answer" },
  { id: "long_text", label: "Notes" },
  { id: "instruction", label: "Instructions (no answer)" },
];

const FAIL_ACTIONS = [
  { id: "continue", label: "Report it (unit stays in service)" },
  { id: "restrict", label: "Report it and restrict the unit" },
  { id: "oos", label: "Report it and take the unit out of service" },
];

const PASS_TYPES = ["pass_fail", "pass_fail_na", "yes_no"];

function unitName(asset = {}) {
  return asset.unitDesignation || asset.fleetNumber || asset.name || asset.id;
}

function makeKey(label = "item") {
  const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "item";
  return `${slug}_${Math.random().toString(36).slice(2, 6)}`;
}

function move(list, index, delta) {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/* ------------------------------ Units ------------------------------ */

function UnitsTab({ departmentId, actor, stations, legacyApparatus, onMessage }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ unitDesignation: "", type: "Engine", station: "" });

  async function load() {
    setLoading(true);
    try {
      await syncFleetAssetsFromApparatus(departmentId, legacyApparatus?.length ? legacyApparatus : null, actor).catch(() => []);
      setAssets(await listFleetAssets(departmentId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [departmentId]);

  const active = assets.filter((asset) => !isRetiredFleetAsset(asset));
  const removed = assets.filter(isRetiredFleetAsset);

  async function addUnit(event) {
    event.preventDefault();
    const name = draft.unitDesignation.trim();
    if (!name) {
      onMessage("Enter the unit's name, like Engine 4.", "error");
      return;
    }
    if (assets.some((asset) => unitName(asset).toLowerCase() === name.toLowerCase() && !isRetiredFleetAsset(asset))) {
      onMessage(`${name} is already on the list.`, "error");
      return;
    }
    setBusyId("new");
    try {
      await saveFleetAsset(departmentId, {
        fleetNumber: name,
        unitDesignation: name,
        name,
        type: draft.type,
        station: draft.station,
        status: "in_service",
        statusLabel: "In Service",
      }, actor);
      setDraft({ unitDesignation: "", type: draft.type, station: draft.station });
      onMessage(`${name} added. Members can check it from the Employee Portal now.`);
      await load();
    } catch (error) {
      onMessage(error?.message || "Couldn't add the unit.", "error");
    } finally {
      setBusyId("");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const name = editing.unitDesignation.trim();
    if (!name) {
      onMessage("A unit needs a name.", "error");
      return;
    }
    setBusyId(editing.id);
    try {
      await saveFleetAsset(departmentId, { ...editing, unitDesignation: name, fleetNumber: name, name }, actor);
      setEditing(null);
      onMessage(`${name} saved.`);
      await load();
    } catch (error) {
      onMessage(error?.message || "Couldn't save the unit.", "error");
    } finally {
      setBusyId("");
    }
  }

  async function setRemoved(asset, remove) {
    const name = unitName(asset);
    if (remove && !window.confirm(`Remove ${name}? It won't appear in apparatus checks anymore. Its past checks are kept, and you can add it back later.`)) return;
    setBusyId(asset.id);
    try {
      await saveFleetAsset(departmentId, {
        ...asset,
        status: remove ? "decommissioned" : "in_service",
        statusLabel: remove ? "Decommissioned" : "In Service",
      }, actor);
      onMessage(remove ? `${name} removed from apparatus checks.` : `${name} is back on the list.`);
      await load();
    } catch (error) {
      onMessage(error?.message || "Couldn't update the unit.", "error");
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <p className="auth-help">Loading units…</p>;

  return (
    <div className="check-setup-units">
      <form className="check-setup-add" onSubmit={addUnit}>
        <label>
          <span>Unit name</span>
          <input value={draft.unitDesignation} onChange={(e) => setDraft({ ...draft, unitDesignation: e.target.value })} placeholder="e.g. Engine 4" />
        </label>
        <label>
          <span>Type</span>
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            {UNIT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          <span>Station</span>
          <select value={draft.station} onChange={(e) => setDraft({ ...draft, station: e.target.value })}>
            <option value="">No station</option>
            {stations.map((station) => <option key={station} value={station}>{station}</option>)}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={busyId === "new"}>
          <CirclePlus size={14} /> Add unit
        </button>
      </form>

      <p className="auth-help">{active.length} unit{active.length === 1 ? "" : "s"} in apparatus checks.</p>
      <div className="check-setup-list">
        {active.map((asset) => (
          <div key={asset.id} className="check-setup-row">
            {editing?.id === asset.id ? (
              <>
                <input value={editing.unitDesignation} onChange={(e) => setEditing({ ...editing, unitDesignation: e.target.value })} aria-label="Unit name" />
                <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })} aria-label="Type">
                  {[...new Set([editing.type, ...UNIT_TYPES])].filter(Boolean).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select value={editing.station} onChange={(e) => setEditing({ ...editing, station: e.target.value })} aria-label="Station">
                  <option value="">No station</option>
                  {[...new Set([editing.station, ...stations])].filter(Boolean).map((station) => <option key={station} value={station}>{station}</option>)}
                </select>
                <div className="check-setup-row-actions">
                  <button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="primary-button" type="button" onClick={saveEdit} disabled={busyId === asset.id}><Save size={14} /> Save</button>
                </div>
              </>
            ) : (
              <>
                <span className="check-setup-row-name"><Truck size={15} aria-hidden="true" /> <strong>{unitName(asset)}</strong></span>
                <span className="occupancy-muted">{[asset.type, asset.station].filter(Boolean).join(" · ") || "—"}</span>
                <span className="occupancy-muted">
                  {asset.lastCheckAt ? `Last checked ${new Date(asset.lastCheckAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Not checked yet"}
                </span>
                <div className="check-setup-row-actions">
                  <button className="secondary-button" type="button" onClick={() => setEditing({ ...asset })}>Edit</button>
                  <button className="secondary-button danger-button" type="button" onClick={() => setRemoved(asset, true)} disabled={busyId === asset.id}>
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {!active.length ? <p className="empty-table">No units yet. Add your first one above.</p> : null}
      </div>

      {removed.length ? (
        <div style={{ marginTop: 14 }}>
          <button className="text-button" type="button" onClick={() => setShowRemoved((v) => !v)}>
            {showRemoved ? "Hide removed units" : `Show removed units (${removed.length})`}
          </button>
          {showRemoved ? (
            <div className="check-setup-list" style={{ marginTop: 8 }}>
              {removed.map((asset) => (
                <div key={asset.id} className="check-setup-row is-removed">
                  <span className="check-setup-row-name"><strong>{unitName(asset)}</strong></span>
                  <span className="occupancy-muted">{asset.type || ""}</span>
                  <span className="occupancy-muted">Removed</span>
                  <div className="check-setup-row-actions">
                    <button className="secondary-button" type="button" onClick={() => setRemoved(asset, false)} disabled={busyId === asset.id}>
                      <RotateCcw size={14} /> Add back
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------- Checklists ---------------------------- */

function ChecklistsTab({ departmentId, actor, onMessage }) {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [savedJson, setSavedJson] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load(keepId = selectedId) {
    setLoading(true);
    try {
      await ensureChecklistTemplatesSeeded(departmentId, actor);
      const list = (await listChecklistTemplates(departmentId)).filter((tpl) => tpl.lifecycleStatus !== "archived");
      setTemplates(list);
      const pick = list.find((tpl) => tpl.id === keepId) || list[0] || null;
      setSelectedId(pick?.id || "");
      setDraft(pick ? structuredClone(pick) : null);
      setSavedJson(pick ? JSON.stringify(pick) : "");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); }, [departmentId]);

  const dirty = Boolean(draft) && JSON.stringify(draft) !== savedJson;
  const itemCount = useMemo(
    () => (draft?.sections || []).reduce((sum, section) => sum + (section.fields || []).filter((f) => f.type !== "instruction" && f.type !== "heading").length, 0),
    [draft]
  );

  function pickTemplate(id) {
    if (dirty && !window.confirm("You have unsaved changes to this checklist. Switch without saving?")) return;
    const tpl = templates.find((row) => row.id === id);
    setSelectedId(id);
    setDraft(tpl ? structuredClone(tpl) : null);
    setSavedJson(tpl ? JSON.stringify(tpl) : "");
  }

  function update(mutator) {
    setDraft((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
  }

  function newChecklist() {
    if (dirty && !window.confirm("You have unsaved changes to this checklist. Start a new one without saving?")) return;
    const tpl = {
      id: "",
      name: "New checklist",
      checkType: "daily",
      description: "",
      lifecycleStatus: "draft",
      currentVersion: 0,
      sections: [{ id: `section-${Date.now()}`, title: "Walk-around", fields: [
        { id: `field-${Date.now()}`, key: makeKey("lights"), label: "Lights work", type: "pass_fail", required: true, failAction: "continue", noteRequiredOnFail: true, helpText: "" },
      ] }],
    };
    setSelectedId("");
    setDraft(tpl);
    setSavedJson("");
  }

  async function save() {
    if (!draft) return;
    if (!String(draft.name || "").trim()) {
      onMessage("Give the checklist a name.", "error");
      return;
    }
    const blank = (draft.sections || []).flatMap((s) => s.fields || []).find((f) => !String(f.label || "").trim());
    if (blank) {
      onMessage("Every item needs a name. Fill it in or delete the empty item.", "error");
      return;
    }
    setSaving(true);
    try {
      const published = await saveAndPublishChecklist(departmentId, draft, actor);
      onMessage(`${published.name} saved. New checks use it right away; checks already in progress keep the old version.`);
      await load(published.id);
    } catch (error) {
      onMessage(error?.message || "Couldn't save the checklist.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeChecklist() {
    if (!draft?.id) {
      setDraft(null);
      await load("");
      return;
    }
    if (templates.length <= 1) {
      onMessage("Keep at least one checklist so members can run checks. Edit this one instead.", "error");
      return;
    }
    if (!window.confirm(`Remove the "${draft.name}" checklist? Members won't see it anymore. Past checks are kept.`)) return;
    try {
      await archiveChecklistTemplate(departmentId, draft, actor);
      onMessage(`${draft.name} removed.`);
      await load("");
    } catch (error) {
      onMessage(error?.message || "Couldn't remove the checklist.", "error");
    }
  }

  if (loading) return <p className="auth-help">Loading checklists…</p>;

  return (
    <div className="check-setup-checklists">
      <div className="check-setup-toolbar">
        <label>
          <span>Checklist</span>
          <select value={selectedId} onChange={(e) => pickTemplate(e.target.value)}>
            {!selectedId && draft ? <option value="">{draft.name} (not saved yet)</option> : null}
            {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={newChecklist}><CirclePlus size={14} /> New checklist</button>
      </div>

      {draft ? (
        <>
          <div className="workflow-form">
            <label className="wide-field">
              <span>Checklist name</span>
              <input value={draft.name} onChange={(e) => update((d) => { d.name = e.target.value; })} placeholder="Daily apparatus check" />
            </label>
          </div>
          <p className="auth-help">{itemCount} item{itemCount === 1 ? "" : "s"} in {draft.sections?.length || 0} section{draft.sections?.length === 1 ? "" : "s"}. Members answer these in order.</p>

          {(draft.sections || []).map((section, sectionIndex) => (
            <div key={section.id} className="template-section-card check-setup-section">
              <div className="check-setup-section-head">
                <input
                  className="check-setup-section-title"
                  value={section.title}
                  onChange={(e) => update((d) => { d.sections[sectionIndex].title = e.target.value; })}
                  aria-label="Section name"
                />
                <button type="button" className="icon-button" title="Move section up" aria-label="Move section up" disabled={sectionIndex === 0} onClick={() => update((d) => { d.sections = move(d.sections, sectionIndex, -1); })}><ArrowUp size={14} /></button>
                <button type="button" className="icon-button" title="Move section down" aria-label="Move section down" disabled={sectionIndex === draft.sections.length - 1} onClick={() => update((d) => { d.sections = move(d.sections, sectionIndex, 1); })}><ArrowDown size={14} /></button>
                <button
                  type="button"
                  className="icon-button danger"
                  title="Delete section"
                  aria-label="Delete section"
                  onClick={() => {
                    if ((section.fields || []).length && !window.confirm(`Delete the "${section.title}" section and its ${section.fields.length} item(s)?`)) return;
                    update((d) => { d.sections.splice(sectionIndex, 1); });
                  }}
                ><Trash2 size={14} /></button>
              </div>

              {(section.fields || []).map((field, fieldIndex) => (
                <div key={field.id || field.key} className="check-setup-item">
                  <div className="check-setup-item-main">
                    <input
                      value={field.label}
                      onChange={(e) => update((d) => { d.sections[sectionIndex].fields[fieldIndex].label = e.target.value; })}
                      placeholder="What to check, e.g. Tire pressure"
                      aria-label="Item name"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => update((d) => { d.sections[sectionIndex].fields[fieldIndex].type = e.target.value; })}
                      aria-label="Answer type"
                    >
                      {[...ITEM_TYPES, ...(ITEM_TYPES.some((t) => t.id === field.type) ? [] : [{ id: field.type, label: field.type }])].map((type) => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                    <div className="check-setup-item-buttons">
                      <button type="button" className="icon-button" aria-label="Move item up" title="Move up" disabled={fieldIndex === 0} onClick={() => update((d) => { d.sections[sectionIndex].fields = move(d.sections[sectionIndex].fields, fieldIndex, -1); })}><ArrowUp size={14} /></button>
                      <button type="button" className="icon-button" aria-label="Move item down" title="Move down" disabled={fieldIndex === section.fields.length - 1} onClick={() => update((d) => { d.sections[sectionIndex].fields = move(d.sections[sectionIndex].fields, fieldIndex, 1); })}><ArrowDown size={14} /></button>
                      <button type="button" className="icon-button danger" aria-label="Delete item" title="Delete item" onClick={() => update((d) => { d.sections[sectionIndex].fields.splice(fieldIndex, 1); })}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {field.type !== "instruction" ? (
                    <div className="check-setup-item-options">
                      <label className="inline-check">
                        <input type="checkbox" checked={Boolean(field.required)} onChange={(e) => update((d) => { d.sections[sectionIndex].fields[fieldIndex].required = e.target.checked; })} />
                        Required
                      </label>
                      {PASS_TYPES.includes(field.type) ? (
                        <>
                          <label>
                            <span>If it fails</span>
                            <select value={field.failAction || "continue"} onChange={(e) => update((d) => { d.sections[sectionIndex].fields[fieldIndex].failAction = e.target.value; })}>
                              {FAIL_ACTIONS.map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}
                            </select>
                          </label>
                          <label className="inline-check">
                            <input type="checkbox" checked={Boolean(field.noteRequiredOnFail)} onChange={(e) => update((d) => { d.sections[sectionIndex].fields[fieldIndex].noteRequiredOnFail = e.target.checked; })} />
                            Ask what's wrong
                          </label>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <input
                    className="check-setup-help"
                    value={field.helpText || ""}
                    onChange={(e) => update((d) => { d.sections[sectionIndex].fields[fieldIndex].helpText = e.target.value; })}
                    placeholder={field.type === "instruction" ? "Instructions shown to the member" : "Hint for the member (optional), e.g. Check all four sides"}
                    aria-label="Hint"
                  />
                </div>
              ))}

              <button
                type="button"
                className="text-button"
                onClick={() => update((d) => {
                  d.sections[sectionIndex].fields = [...(d.sections[sectionIndex].fields || []), {
                    id: `field-${Date.now()}`, key: makeKey(), label: "", type: "pass_fail", required: true, failAction: "continue", noteRequiredOnFail: true, helpText: "",
                  }];
                })}
              >
                <CirclePlus size={14} /> Add item
              </button>
            </div>
          ))}

          <button
            type="button"
            className="secondary-button"
            onClick={() => update((d) => { d.sections = [...(d.sections || []), { id: `section-${Date.now()}`, title: "New section", fields: [] }]; })}
          >
            <CirclePlus size={14} /> Add section
          </button>

          <div className="modal-actions department-config-actions check-setup-save">
            {dirty ? <span className="unsaved-chip">Unsaved changes</span> : null}
            <button className="secondary-button danger-button" type="button" onClick={removeChecklist}>
              <Trash2 size={14} /> {draft.id ? "Remove checklist" : "Discard"}
            </button>
            {dirty && draft.id ? (
              <button className="secondary-button" type="button" onClick={() => {
                const saved = templates.find((row) => row.id === draft.id);
                if (saved) setDraft(structuredClone(saved));
              }}>
                Undo changes
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={save} disabled={saving || !dirty}>
              <Save size={14} /> {saving ? "Saving…" : "Save checklist"}
            </button>
          </div>
        </>
      ) : (
        <p className="empty-table">No checklist yet. Start a new one.</p>
      )}
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */

export default function ApparatusCheckSetupPage({ legacyApparatus = [] }) {
  const { departmentId, profile } = useTenant();
  const { user, membership, permissions, isCreator } = useAuth();
  const [tab, setTab] = useState("units");
  const [banner, setBanner] = useState({ text: "", tone: "success" });
  const actor = { actorUid: user?.uid || "", actorName: membership?.displayName || user?.email || "Administrator" };
  const stations = Array.isArray(profile?.stations) ? profile.stations.filter(Boolean) : [];

  function onMessage(text, tone = "success") {
    setBanner({ text, tone });
  }

  if (!canManageFleetConfig(permissions, isCreator)) {
    return (
      <div className="module-page">
        <p className="auth-help">Only administrators can set up apparatus checks.</p>
      </div>
    );
  }

  return (
    <div className="module-page apparatus-check-setup">
      <section className="module-heading">
        <div>
          <span className="module-icon"><ClipboardCheck size={22} /></span>
          <div>
            <h1>Apparatus Check Setup</h1>
            <p>Choose which units members check, and what's on the checklist.</p>
          </div>
        </div>
      </section>

      {banner.text ? (
        <div className={banner.tone === "error" ? "error-banner" : "success-banner"} role={banner.tone === "error" ? "alert" : "status"}>
          {banner.text}
          <button type="button" onClick={() => setBanner({ text: "", tone: "success" })} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      <div className="segmented-control admin-filter-control" style={{ margin: "12px 0" }}>
        <button type="button" className={tab === "units" ? "active" : ""} onClick={() => setTab("units")}>Units</button>
        <button type="button" className={tab === "checklists" ? "active" : ""} onClick={() => setTab("checklists")}>Checklists</button>
      </div>

      {/* Both stay mounted so switching tabs keeps unsaved edits. */}
      <div hidden={tab !== "units"}>
        <UnitsTab departmentId={departmentId} actor={actor} stations={stations} legacyApparatus={legacyApparatus} onMessage={onMessage} />
      </div>
      <div hidden={tab !== "checklists"}>
        <ChecklistsTab departmentId={departmentId} actor={actor} onMessage={onMessage} />
      </div>
    </div>
  );
}
