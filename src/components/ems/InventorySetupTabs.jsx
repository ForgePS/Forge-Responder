import { useEffect, useMemo, useState } from "react";
import { Building2, ListChecks, Pencil, Plus, ScrollText, Settings2 } from "lucide-react";
import { Badge, Modal, Panel } from "../shell/ui.jsx";
import {
  DEFAULT_EMS_SETTINGS, DEFAULT_SUPPLY_CATEGORIES, LOCATION_TYPES, LOCATION_TYPE_LABELS, formatWhen, locationPath,
} from "../../lib/ems/inventoryDisplay.js";
import {
  describeError, saveEmsSettings, saveInventoryItem, saveInventoryLocation, watchEmsAuditEvents,
} from "../../lib/ems/emsInventoryService.js";

function useSaver(onDone) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function run(fn, message) {
    setSaving(true);
    setError("");
    try {
      await fn();
      onDone(message);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }
  return { error, saving, run };
}

// ---------------------------------------------------------------- catalog

const EMPTY_ITEM = {
  name: "", category: "", unitOfMeasure: "each", description: "", manufacturer: "", manufacturerPartNumber: "",
  barcode: "", vendorName: "", unitCost: "", tracksLots: false, tracksExpiration: true, active: true,
};

function ItemModal({ departmentId, item, categories, onClose, onDone }) {
  const [form, setForm] = useState({ ...EMPTY_ITEM, ...(item || {}), unitCost: item?.unitCost ?? "" });
  const { error, saving, run } = useSaver(onDone);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <Modal title={item ? `Edit ${item.name}` : "Add a catalog item"} onClose={onClose}>
      <form className="ems-form" onSubmit={(e) => { e.preventDefault(); run(() => saveInventoryItem(departmentId, form), `${form.name} saved.`); }}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <div className="ems-form-grid">
          <label className="config-field ems-span-2"><span>Name *</span><input value={form.name} onChange={set("name")} maxLength={120} required /></label>
          <label className="config-field">
            <span>Category *</span>
            <input list="ems-categories" value={form.category} onChange={set("category")} maxLength={60} required />
            <datalist id="ems-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="config-field"><span>Unit of measure</span><input value={form.unitOfMeasure} onChange={set("unitOfMeasure")} maxLength={30} placeholder="each, box, bag" /></label>
          <label className="config-field"><span>Manufacturer</span><input value={form.manufacturer} onChange={set("manufacturer")} maxLength={120} /></label>
          <label className="config-field"><span>Manufacturer part number</span><input value={form.manufacturerPartNumber} onChange={set("manufacturerPartNumber")} maxLength={60} /></label>
          <label className="config-field"><span>Barcode</span><input value={form.barcode} onChange={set("barcode")} maxLength={60} /></label>
          <label className="config-field"><span>Vendor</span><input value={form.vendorName} onChange={set("vendorName")} maxLength={120} /></label>
          <label className="config-field"><span>Unit cost ($)</span><input type="number" min="0" step="0.01" value={form.unitCost} onChange={set("unitCost")} /></label>
          <label className="config-field ems-span-2"><span>Description</span><textarea rows={2} value={form.description} onChange={set("description")} maxLength={500} /></label>
          <label className="ems-check"><input type="checkbox" checked={form.tracksExpiration} onChange={set("tracksExpiration")} /> Expiration date required when received</label>
          <label className="ems-check"><input type="checkbox" checked={form.tracksLots} onChange={set("tracksLots")} /> Lot number required when received</label>
          {item ? <label className="ems-check"><input type="checkbox" checked={form.active} onChange={set("active")} /> Active (turn off to stop receiving it)</label> : null}
        </div>
        <div className="df-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

export function InventoryCatalogTab({ departmentId, items, canManage, onMessage }) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const categories = useMemo(() => [...new Set([...DEFAULT_SUPPLY_CATEGORIES, ...items.map((i) => i.category).filter(Boolean)])].sort(), [items]);
  const shown = items
    .filter((i) => `${i.name} ${i.category} ${i.barcode || ""} ${i.manufacturer || ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Panel title="Supply catalog" icon={ListChecks}
      action={canManage ? <button type="button" className="primary-button" onClick={() => setEditing({})}><Plus size={14} /> Add item</button> : null}>
      <div className="ems-filters"><input type="search" placeholder="Search catalog" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search catalog" /></div>
      <div className="data-table-wrap">
        <table className="ems-table">
          <thead><tr><th>Item</th><th>Category</th><th>Unit</th><th>Manufacturer / part</th><th>Unit cost</th><th>Tracks</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.name}</strong>{i.barcode ? <small className="ems-block occupancy-muted">Barcode {i.barcode}</small> : null}</td>
                <td>{i.category}</td>
                <td>{i.unitOfMeasure}</td>
                <td>{[i.manufacturer, i.manufacturerPartNumber].filter(Boolean).join(" · ")}</td>
                <td className="ems-num">{Number.isFinite(i.unitCost) ? `$${i.unitCost.toFixed(2)}` : ""}</td>
                <td>{[i.tracksLots ? "Lot" : "", i.tracksExpiration ? "Expiration" : ""].filter(Boolean).join(", ") || "—"}</td>
                <td><Badge tone={i.active === false ? "neutral" : "success"}>{i.active === false ? "Off" : "Active"}</Badge></td>
                <td>{canManage ? <button type="button" className="secondary-button" onClick={() => setEditing(i)} title="Edit"><Pencil size={14} /><span className="sr-only">Edit {i.name}</span></button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <div className="empty-table">{items.length ? "Nothing matches." : "No catalog items yet."}</div> : null}
      </div>
      {editing ? (
        <ItemModal departmentId={departmentId} item={editing.id ? editing : null} categories={categories}
          onClose={() => setEditing(null)} onDone={(text) => { setEditing(null); onMessage(text); }} />
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------- locations

function LocationModal({ departmentId, location, locations, stations, fleetAssets, onClose, onDone }) {
  const [form, setForm] = useState({
    name: "", type: "station", parentId: "", stationName: "", fleetAssetId: "", notes: "", active: true, ...(location || {}),
  });
  const { error, saving, run } = useSaver(onDone);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const byId = Object.fromEntries(locations.map((l) => [l.id, l]));
  // A location can't sit inside itself or anything inside it.
  const parents = locations
    .filter((l) => l.id !== location?.id && !(l.ancestorIds || []).includes(location?.id) && l.type !== "bin")
    .map((l) => ({ ...l, path: locationPath(l, byId) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return (
    <Modal title={location ? `Edit ${location.name}` : "Add a location"} onClose={onClose}>
      <form className="ems-form" onSubmit={(e) => { e.preventDefault(); run(() => saveInventoryLocation(departmentId, form), `${form.name} saved.`); }}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <div className="ems-form-grid">
          <label className="config-field"><span>Name *</span><input value={form.name} onChange={set("name")} maxLength={120} required /></label>
          <label className="config-field">
            <span>Type *</span>
            <select value={form.type} onChange={set("type")}>{LOCATION_TYPES.map((t) => <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>)}</select>
          </label>
          <label className="config-field">
            <span>Inside</span>
            <select value={form.parentId} onChange={set("parentId")}>
              <option value="">(top level)</option>
              {parents.map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Station</span>
            <input list="ems-stations" value={form.stationName} onChange={set("stationName")} maxLength={120} />
            <datalist id="ems-stations">{stations.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          {form.type === "vehicle" ? (
            <label className="config-field ems-span-2">
              <span>Fleet vehicle</span>
              <select value={form.fleetAssetId} onChange={set("fleetAssetId")}>
                <option value="">Not linked</option>
                {fleetAssets.map((a) => <option key={a.id} value={a.id}>{a.unitDesignation || a.fleetNumber || a.id}</option>)}
              </select>
              {!fleetAssets.length ? <small className="occupancy-muted">No Fleet vehicles to link yet; the name is used.</small> : null}
            </label>
          ) : null}
          <label className="config-field ems-span-2"><span>Notes</span><textarea rows={2} value={form.notes} onChange={set("notes")} maxLength={500} /></label>
          {location ? <label className="ems-check"><input type="checkbox" checked={form.active !== false} onChange={set("active")} /> Active (only an empty location can be turned off)</label> : null}
        </div>
        <div className="df-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

export function InventoryLocationsTab({ departmentId, locations, stations, fleetAssets, canManage, onMessage }) {
  const [editing, setEditing] = useState(null);
  const byId = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const shown = locations.map((l) => ({ ...l, path: locationPath(l, byId), depth: (l.ancestorIds || []).length }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return (
    <Panel title="Inventory locations" icon={Building2}
      action={canManage ? <button type="button" className="primary-button" onClick={() => setEditing({})}><Plus size={14} /> Add location</button> : null}>
      <p className="occupancy-muted">Stations hold storage areas, cabinets, shelves and bins. Vehicles are locations too, so restocking a unit is a transfer.</p>
      <div className="data-table-wrap">
        <table className="ems-table">
          <thead><tr><th>Location</th><th>Type</th><th>Station</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id}>
                <td style={{ paddingLeft: `${12 + l.depth * 18}px` }}><strong>{l.name}</strong>{l.depth ? <small className="ems-block occupancy-muted">{l.path}</small> : null}</td>
                <td>{LOCATION_TYPE_LABELS[l.type] || l.type}{l.unitDesignation ? ` · ${l.unitDesignation}` : ""}</td>
                <td>{l.stationName}</td>
                <td><Badge tone={l.active === false ? "neutral" : "success"}>{l.active === false ? "Off" : "Active"}</Badge></td>
                <td>{canManage ? <button type="button" className="secondary-button" onClick={() => setEditing(l)} title="Edit"><Pencil size={14} /><span className="sr-only">Edit {l.name}</span></button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <div className="empty-table">No locations yet.</div> : null}
      </div>
      {editing ? (
        <LocationModal departmentId={departmentId} location={editing.id ? editing : null} locations={locations} stations={stations}
          fleetAssets={fleetAssets} onClose={() => setEditing(null)} onDone={(text) => { setEditing(null); onMessage(text); }} />
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------- settings and audit

export function InventorySettingsTab({ departmentId, settings, onMessage }) {
  const current = { ...DEFAULT_EMS_SETTINGS, ...(settings || {}) };
  const [rotationPolicy, setRotationPolicy] = useState(current.rotationPolicy);
  const [days, setDays] = useState(current.expirationWarningDays.join(", "));
  useEffect(() => {
    setRotationPolicy(current.rotationPolicy);
    setDays(current.expirationWarningDays.join(", "));
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { error, saving, run } = useSaver(onMessage);
  return (
    <Panel title="EMS inventory settings" icon={Settings2}>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <div className="ems-form-grid">
        <label className="config-field">
          <span>Which stock leaves first</span>
          <select value={rotationPolicy} onChange={(e) => setRotationPolicy(e.target.value)}>
            <option value="fefo">FEFO: soonest expiration first (recommended for medical supplies)</option>
            <option value="fifo">FIFO: oldest received first</option>
          </select>
        </label>
        <label className="config-field">
          <span>Expiration warnings (days before)</span>
          <input value={days} onChange={(e) => setDays(e.target.value)} placeholder="90, 60, 30, 14, 7" />
          <small className="occupancy-muted">Up to eight values. The smallest is shown as urgent.</small>
        </label>
      </div>
      <div className="df-actions">
        <button type="button" className="primary-button" disabled={saving}
          onClick={() => run(() => saveEmsSettings(departmentId, {
            rotationPolicy,
            expirationWarningDays: days.split(/[\s,]+/).filter(Boolean).map(Number),
          }), "Settings saved.")}>Save settings</button>
      </div>
    </Panel>
  );
}

export function EmsAuditTab({ departmentId }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => watchEmsAuditEvents(departmentId, setRows, (e) => setError(describeError(e))), [departmentId]);
  return (
    <Panel title="EMS audit history" icon={ScrollText}>
      <p className="occupancy-muted">Every change, written by the server in the same step as the change itself. Entries can't be edited or deleted. Newest 200.</p>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <div className="data-table-wrap">
        <table className="ems-table">
          <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{formatWhen(r.at)}</td><td>{r.actorName}</td><td>{r.summary}</td></tr>)}</tbody>
        </table>
        {!rows.length && !error ? <div className="empty-table">Nothing yet.</div> : null}
      </div>
    </Panel>
  );
}
