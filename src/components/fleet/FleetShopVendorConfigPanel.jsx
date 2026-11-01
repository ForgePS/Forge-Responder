import { useEffect, useState } from "react";
import { Building2, CirclePlus, Save, Store, Trash2, X } from "lucide-react";
import {
  deleteFleetShop,
  deleteFleetVendor,
  ensureFleetShopsSeeded,
  ensureFleetVendorsSeeded,
  listFleetWorkOrders,
  saveFleetShop,
  saveFleetVendor,
} from "../../lib/fleet/index.js";
import {
  SHOP_TYPE_OPTIONS,
  countOpenReferences,
  isOpenWorkOrder,
  shopTypeLabel,
  sortByName,
  validateConfigName,
} from "../../lib/fleet/repairsConfig.js";
import "../../styles/fleet-config-repairs.css";

const NEW_ID = "__new__";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function shopSummary(item) {
  return [shopTypeLabel(item.shopType), item.location].filter(Boolean).join(" · ");
}

function vendorSummary(item) {
  return [item.category, item.phone, item.email].filter(Boolean).join(" · ") || "No contact info yet";
}

const KINDS = {
  shop: {
    noun: "shop",
    title: "Repair shops",
    icon: Building2,
    intro: "Where your apparatus get worked on. Each work order can be assigned to one of these.",
    empty: "No repair shops yet. Add your in-house shop or the places that service your apparatus.",
    refField: "shopId",
    blank: { name: "", shopType: "internal", location: "", notes: "", active: true },
    summary: shopSummary,
    save: saveFleetShop,
    remove: deleteFleetShop,
  },
  vendor: {
    noun: "vendor",
    title: "Vendors",
    icon: Store,
    intro: "Outside companies you send work to or buy parts and service from.",
    empty: "No vendors yet. Add the outside companies you use for repairs and service.",
    refField: "vendorId",
    blank: { name: "", category: "", phone: "", email: "", notes: "", active: true },
    summary: vendorSummary,
    save: saveFleetVendor,
    remove: deleteFleetVendor,
  },
};

function ShopFields({ draft, setDraft }) {
  return (
    <>
      <Field label="Type of shop">
        <select value={draft.shopType || "internal"} onChange={(e) => setDraft((c) => ({ ...c, shopType: e.target.value }))}>
          {SHOP_TYPE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Location">
        <input
          value={draft.location || ""}
          placeholder="e.g. Station 1 apparatus bay"
          onChange={(e) => setDraft((c) => ({ ...c, location: e.target.value }))}
        />
      </Field>
    </>
  );
}

function VendorFields({ draft, setDraft }) {
  return (
    <>
      <Field label="What they do">
        <input
          value={draft.category || ""}
          placeholder="e.g. Pump repair, tires, aerial inspection"
          onChange={(e) => setDraft((c) => ({ ...c, category: e.target.value }))}
        />
      </Field>
      <Field label="Phone">
        <input
          type="tel"
          value={draft.phone || ""}
          onChange={(e) => setDraft((c) => ({ ...c, phone: e.target.value }))}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={draft.email || ""}
          onChange={(e) => setDraft((c) => ({ ...c, email: e.target.value }))}
        />
      </Field>
    </>
  );
}

function ConfigList({ kind, rows, setRows, departmentId, actor, onMessage, onError }) {
  const config = KINDS[kind];
  const Icon = config.icon;
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(rows[0]?.id || "");
  const [draft, setDraft] = useState(null);
  const isNew = selectedId === NEW_ID;

  useEffect(() => {
    if (selectedId === NEW_ID) return;
    const selected = rows.find((row) => row.id === selectedId) || null;
    setDraft(selected ? { ...selected } : null);
  }, [rows, selectedId]);

  function startNew() {
    setSelectedId(NEW_ID);
    setDraft({ ...config.blank });
  }

  async function handleSave() {
    const problem = validateConfigName(draft?.name, rows, isNew ? "" : draft?.id, config.noun);
    if (problem) {
      onError?.(problem);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, name: draft.name.trim() };
      if (isNew) delete payload.id;
      const saved = await config.save(departmentId, payload, actor);
      setRows((current) => sortByName([saved, ...current.filter((row) => row.id !== saved.id)]));
      setSelectedId(saved.id);
      onMessage?.(isNew ? `Added "${saved.name}".` : `Saved "${saved.name}".`);
    } catch (saveError) {
      onError?.(saveError?.message || `Unable to save the ${config.noun}.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft?.id) return;
    const original = rows.find((row) => row.id === draft.id) || draft;
    setSaving(true);
    try {
      const openOrders = await listFleetWorkOrders(departmentId, { openOnly: true });
      const inUse = countOpenReferences(openOrders, config.refField, original.id, isOpenWorkOrder);
      if (inUse) {
        const turnOff = window.confirm(
          `${inUse} open work order${inUse === 1 ? " is" : "s are"} assigned to "${original.name}", so it can't be removed yet.\n\n`
          + `Turn it off instead? It will stay on those work orders but won't be offered for new ones.`
        );
        if (!turnOff) return;
        const saved = await config.save(departmentId, { ...original, active: false }, actor);
        setRows((current) => sortByName([saved, ...current.filter((row) => row.id !== saved.id)]));
        onMessage?.(`"${saved.name}" is turned off and won't be offered for new work orders.`);
        return;
      }
      if (!window.confirm(`Remove the ${config.noun} "${original.name}"? This cannot be undone.`)) return;
      await config.remove(departmentId, original, actor);
      const remaining = rows.filter((row) => row.id !== original.id);
      setRows(remaining);
      setSelectedId(remaining[0]?.id || "");
      onMessage?.(`Removed "${original.name}".`);
    } catch (deleteError) {
      onError?.(deleteError?.message || `Unable to remove the ${config.noun}.`);
    } finally {
      setSaving(false);
    }
  }

  const ExtraFields = kind === "shop" ? ShopFields : VendorFields;

  return (
    <section className="fleet-repairs-block">
      <div className="fleet-repairs-intro"><p className="occupancy-muted">{config.intro}</p></div>
      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><Icon size={15} /><strong>{config.title}</strong></div>
            <button className="text-button" type="button" disabled={saving || isNew} onClick={startNew}>
              <CirclePlus size={14} /> Add {config.noun}
            </button>
          </header>
          <div className="panel-body">
            <div className="personnel-list">
              {isNew ? (
                <button type="button" className="person-row selected">
                  <span>
                    <strong>{draft?.name?.trim() || `New ${config.noun}`}</strong>
                    <small>Not saved yet</small>
                  </span>
                </button>
              ) : null}
              {rows.length === 0 && !isNew ? (
                <p className="occupancy-muted fleet-repairs-empty">{config.empty}</p>
              ) : null}
              {rows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === selectedId ? "person-row selected" : "person-row"}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{config.summary(item)}</small>
                  </span>
                  {item.active === false ? <span className="badge badge-neutral">Turned off</span> : null}
                </button>
              ))}
            </div>
          </div>
        </section>

        {draft ? (
          <section className="panel">
            <header>
              <div><strong>{isNew ? `New ${config.noun}` : `Edit ${config.noun}`}</strong></div>
              <div className="fleet-repairs-actions">
                {isNew ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={saving}
                    onClick={() => setSelectedId(rows[0]?.id || "")}
                  >
                    <X size={14} /> Cancel
                  </button>
                ) : (
                  <button className="secondary-button danger-button" type="button" disabled={saving} onClick={handleDelete}>
                    <Trash2 size={14} /> Remove
                  </button>
                )}
                <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
                  <Save size={14} /> {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name">
                <input
                  value={draft.name || ""}
                  autoFocus={isNew}
                  onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
                />
              </Field>
              <ExtraFields draft={draft} setDraft={setDraft} />
              <Field label="Notes">
                <textarea
                  rows={2}
                  value={draft.notes || ""}
                  onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))}
                />
              </Field>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={draft.active !== false}
                  onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))}
                />
                Offer on new work orders
              </label>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}

/**
 * Repair shops + vendors for the Fleet Configuration Studio "Repairs" tab.
 */
export default function FleetShopVendorConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("shop");
  const [shops, setShops] = useState([]);
  const [vendors, setVendors] = useState([]);

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [nextShops, nextVendors] = await Promise.all([
        ensureFleetShopsSeeded(departmentId, actor),
        ensureFleetVendorsSeeded(departmentId, actor),
      ]);
      setShops(sortByName(nextShops));
      setVendors(sortByName(nextVendors));
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load repair shops and vendors.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading repair shops and vendors...</p></div>;
  }

  const shared = { departmentId, actor, onMessage, onError };

  return (
    <section className="fleet-shop-vendor-config">
      <nav className="inspections-subnav" aria-label="Repair shops and vendors">
        <button
          type="button"
          className={`inspections-subnav-item${mode === "shop" ? " active" : ""}`}
          onClick={() => setMode("shop")}
        >
          <Building2 size={14} /> Repair shops ({shops.length})
        </button>
        <button
          type="button"
          className={`inspections-subnav-item${mode === "vendor" ? " active" : ""}`}
          onClick={() => setMode("vendor")}
        >
          <Store size={14} /> Vendors ({vendors.length})
        </button>
      </nav>

      {mode === "shop" ? (
        <ConfigList key="shop" kind="shop" rows={shops} setRows={setShops} {...shared} />
      ) : (
        <ConfigList key="vendor" kind="vendor" rows={vendors} setRows={setVendors} {...shared} />
      )}
    </section>
  );
}
