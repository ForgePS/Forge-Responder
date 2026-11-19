import { useMemo, useState } from "react";
import { ArrowRightLeft, Boxes, MinusCircle, PackagePlus, SlidersHorizontal } from "lucide-react";
import { Badge, FleetSummary, Modal, Panel } from "../shell/ui.jsx";
import {
  EXPIRATION_TONES, expirationStatus, formatDate, inventoryValue, locationPath, stockStatus, todayIso,
} from "../../lib/ems/inventoryDisplay.js";
import { describeError, setInventoryPar } from "../../lib/ems/emsInventoryService.js";

function ParModal({ departmentId, balance, item, location, onClose, onDone }) {
  const par = balance?.par || {};
  const [form, setForm] = useState({
    min: par.min ?? "", max: par.max ?? "", reorderPoint: par.reorderPoint ?? "", reorderQuantity: par.reorderQuantity ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  async function save(clear = false) {
    setSaving(true);
    setError("");
    try {
      await setInventoryPar(departmentId, location.id, item.id, clear ? null : form);
      onDone(clear ? `Par cleared for ${item.name}.` : `Par saved for ${item.name}.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={`Par levels: ${item.name}`} onClose={onClose}>
      <p className="occupancy-muted">{location.name}. Stock shows as low at or below the reorder point (or the minimum when there is no reorder point).</p>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <div className="ems-form-grid">
        {[["min", "Minimum"], ["max", "Maximum"], ["reorderPoint", "Reorder point"], ["reorderQuantity", "Reorder quantity"]].map(([key, label]) => (
          <label key={key} className="config-field">
            <span>{label}</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={form[key]} onChange={set(key)} />
          </label>
        ))}
      </div>
      <div className="df-actions">
        {balance?.par ? <button type="button" className="secondary-button" disabled={saving} onClick={() => save(true)}>Clear par</button> : null}
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => save(false)}>Save</button>
      </div>
    </Modal>
  );
}

function AddParModal({ departmentId, items, locations, onClose, onDone }) {
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState("");
  const item = items.find((i) => i.id === itemId);
  const location = locations.find((l) => l.id === locationId);
  if (item && location) {
    return <ParModal departmentId={departmentId} item={item} location={location} balance={null} onClose={onClose} onDone={onDone} />;
  }
  const byId = Object.fromEntries(locations.map((l) => [l.id, l]));
  return (
    <Modal title="Stock an item at a location" onClose={onClose}>
      <p className="occupancy-muted">Set par levels for an item a location should carry, even before any is on hand.</p>
      <div className="ems-form-grid">
        <label className="config-field">
          <span>Item</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Choose an item</option>
            {items.filter((i) => i.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label className="config-field">
          <span>Location</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Choose a location</option>
            {locations.filter((l) => l.active !== false).map((l) => ({ ...l, path: locationPath(l, byId) }))
              .sort((a, b) => a.path.localeCompare(b.path)).map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
          </select>
        </label>
      </div>
    </Modal>
  );
}

/** Every item at every location, with lots, par and expiration state. */
export default function InventoryStockTab({
  departmentId, items, locations, balances, settings, canUse, canManage, onRecord, onMessage,
}) {
  const [filters, setFilters] = useState({ locationId: "", category: "", search: "", show: "all" });
  const [parFor, setParFor] = useState(null);
  const [addPar, setAddPar] = useState(false);
  const today = todayIso();
  const warningDays = settings?.expirationWarningDays;
  const maxWarning = Math.max(...(warningDays?.length ? warningDays : [90]));
  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const locationsById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);

  const rows = useMemo(() => balances
    .filter((b) => (b.onHand || 0) > 0 || b.par)
    .map((b) => {
      const item = itemsById[b.itemId] || { id: b.itemId, name: "(removed item)" };
      const location = locationsById[b.locationId] || { id: b.locationId, name: "(removed location)" };
      const expiration = expirationStatus(b.earliestExpiration, warningDays, today);
      return { balance: b, item, location, path: locationPath(location, locationsById), stock: stockStatus(b), expiration };
    })
    .sort((a, b) => a.item.name.localeCompare(b.item.name) || a.path.localeCompare(b.path)), [balances, itemsById, locationsById, warningDays, today]);

  const filtered = rows.filter(({ balance, item, location, path, stock, expiration }) => {
    if (filters.locationId && location.id !== filters.locationId && !(location.ancestorIds || []).includes(filters.locationId)) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.search && !`${item.name} ${item.barcode || ""} ${item.manufacturerPartNumber || ""} ${path}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.show === "low" && !["low", "out"].includes(stock.key)) return false;
    if (filters.show === "expiring" && !["warning", "soon", "expired"].includes(expiration.level)) return false;
    if (filters.show === "expired" && expiration.level !== "expired") return false;
    return balance !== null;
  });

  const summary = [
    ["Catalog items", items.filter((i) => i.active !== false).length, "neutral"],
    ["Low stock", rows.filter((r) => r.stock.key === "low").length, "warning"],
    ["Out of stock", rows.filter((r) => r.stock.key === "out").length, "critical"],
    [`Expiring within ${maxWarning} days`, rows.filter((r) => ["warning", "soon"].includes(r.expiration.level)).length, "warning"],
    ["Holding expired stock", rows.filter((r) => r.expiration.level === "expired").length, "critical"],
    ["Value on hand", `$${inventoryValue(balances, itemsById).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, "neutral"],
  ];
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
  const sortedLocations = locations.map((l) => ({ ...l, path: locationPath(l, locationsById) })).sort((a, b) => a.path.localeCompare(b.path));
  const setFilter = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <>
      <FleetSummary items={summary} />
      <Panel
        title="Stock on hand"
        icon={Boxes}
        action={(
          <div className="df-card-actions">
            {canManage ? <button type="button" className="secondary-button" onClick={() => setAddPar(true)}><SlidersHorizontal size={14} /> Set par</button> : null}
            {canManage ? <button type="button" className="primary-button" onClick={() => onRecord({ type: "receive" })}><PackagePlus size={14} /> Receive</button> : null}
            {canUse || canManage ? <button type="button" className="secondary-button" onClick={() => onRecord({ type: "usage" })}><MinusCircle size={14} /> Record use</button> : null}
          </div>
        )}
      >
        <div className="ems-filters">
          <input type="search" placeholder="Search item, barcode, location" value={filters.search} onChange={setFilter("search")} aria-label="Search stock" />
          <select value={filters.locationId} onChange={setFilter("locationId")} aria-label="Location">
            <option value="">All locations</option>
            {sortedLocations.map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
          </select>
          <select value={filters.category} onChange={setFilter("category")} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.show} onChange={setFilter("show")} aria-label="Show">
            <option value="all">Everything</option>
            <option value="low">Low or out of stock</option>
            <option value="expiring">Expiring or expired</option>
            <option value="expired">Expired only</option>
          </select>
        </div>
        {!items.length ? <p className="occupancy-muted">The catalog is empty. {canManage ? "Add items on the Catalog tab and locations on the Locations tab, then receive stock." : "An inventory manager needs to set it up."}</p> : null}
        <div className="data-table-wrap">
          <table className="ems-table">
            <thead>
              <tr><th>Item</th><th>Location</th><th>On hand</th><th>Par (min / max / reorder)</th><th>Lots</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {filtered.map(({ balance, item, location, path, stock, expiration }) => (
                <tr key={balance.id}>
                  <td><strong>{item.name}</strong><small className="occupancy-muted ems-block">{item.category}</small></td>
                  <td>{path}</td>
                  <td className="ems-num">{balance.onHand || 0} <small className="occupancy-muted">{item.unitOfMeasure || "each"}</small></td>
                  <td>{balance.par ? `${balance.par.min ?? "–"} / ${balance.par.max ?? "–"} / ${balance.par.reorderPoint ?? "–"}` : <span className="occupancy-muted">None</span>}</td>
                  <td>
                    {(balance.lots || []).length ? (
                      <ul className="ems-lots">
                        {balance.lots.map((lot) => {
                          const status = expirationStatus(lot.expiration, warningDays, today);
                          return (
                            <li key={lot.key}>
                              <span>{lot.quantity} × {lot.lot || "no lot"}</span>
                              {lot.expiration ? <Badge tone={EXPIRATION_TONES[status.level]}>{status.level === "expired" ? `Expired ${formatDate(lot.expiration)}` : `Exp ${formatDate(lot.expiration)}`}</Badge> : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : <span className="occupancy-muted">—</span>}
                  </td>
                  <td>
                    <Badge tone={stock.tone}>{stock.label}</Badge>
                    {["warning", "soon", "expired"].includes(expiration.level) ? <small className="ems-block occupancy-muted">{expiration.label}</small> : null}
                  </td>
                  <td>
                    <div className="ems-row-actions">
                      {(canUse || canManage) && balance.onHand > 0 ? (
                        <>
                          <button type="button" className="secondary-button" onClick={() => onRecord({ type: "usage", itemId: item.id, fromLocationId: location.id })} title="Record use"><MinusCircle size={14} /><span className="sr-only">Record use of {item.name}</span></button>
                          <button type="button" className="secondary-button" onClick={() => onRecord({ type: "transfer", itemId: item.id, fromLocationId: location.id })} title="Transfer"><ArrowRightLeft size={14} /><span className="sr-only">Transfer {item.name}</span></button>
                        </>
                      ) : null}
                      {canManage ? <button type="button" className="secondary-button" onClick={() => setParFor({ balance, item, location })} title="Par levels"><SlidersHorizontal size={14} /><span className="sr-only">Par levels for {item.name}</span></button> : null}
                      {canManage ? <button type="button" className="secondary-button" onClick={() => onRecord({ type: "receive", itemId: item.id, toLocationId: location.id })} title="Receive"><PackagePlus size={14} /><span className="sr-only">Receive {item.name}</span></button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && items.length ? <div className="empty-table">{rows.length ? "Nothing matches these filters." : "No stock yet. Receive stock to get started."}</div> : null}
        </div>
      </Panel>
      {parFor ? (
        <ParModal departmentId={departmentId} {...parFor} onClose={() => setParFor(null)} onDone={(text) => { setParFor(null); onMessage(text); }} />
      ) : null}
      {addPar ? (
        <AddParModal departmentId={departmentId} items={items} locations={locations} onClose={() => setAddPar(false)} onDone={(text) => { setAddPar(false); onMessage(text); }} />
      ) : null}
    </>
  );
}

export { ParModal };
