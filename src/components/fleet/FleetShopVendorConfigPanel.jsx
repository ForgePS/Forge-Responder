import { useEffect, useState } from "react";
import { Building2, CirclePlus, Save, Store } from "lucide-react";
import {
  ensureFleetShopsSeeded,
  ensureFleetVendorsSeeded,
  saveFleetShop,
  saveFleetVendor,
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
 * Shops + vendors for Fleet Configuration Studio (Phase 6).
 */
export default function FleetShopVendorConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("shops");
  const [shops, setShops] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [shopDraft, setShopDraft] = useState(null);
  const [vendorDraft, setVendorDraft] = useState(null);

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [nextShops, nextVendors] = await Promise.all([
        ensureFleetShopsSeeded(departmentId, actor),
        ensureFleetVendorsSeeded(departmentId, actor),
      ]);
      setShops(nextShops);
      setVendors(nextVendors);
      setSelectedShopId((current) => current || nextShops[0]?.id || "");
      setSelectedVendorId((current) => current || nextVendors[0]?.id || "");
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load shops / vendors.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    const selected = shops.find((row) => row.id === selectedShopId) || null;
    setShopDraft(selected ? { ...selected } : null);
  }, [shops, selectedShopId]);

  useEffect(() => {
    const selected = vendors.find((row) => row.id === selectedVendorId) || null;
    setVendorDraft(selected ? { ...selected } : null);
  }, [vendors, selectedVendorId]);

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading shops and vendors...</p></div>;
  }

  return (
    <section className="fleet-shop-vendor-config">
      <nav className="inspections-subnav" aria-label="Shops and vendors">
        <button
          type="button"
          className={`inspections-subnav-item${mode === "shops" ? " active" : ""}`}
          onClick={() => setMode("shops")}
        >
          <Building2 size={14} /> Shops
        </button>
        <button
          type="button"
          className={`inspections-subnav-item${mode === "vendors" ? " active" : ""}`}
          onClick={() => setMode("vendors")}
        >
          <Store size={14} /> Vendors
        </button>
      </nav>

      {mode === "shops" ? (
        <section className="personnel-workspace occupancy-workspace">
          <section className="panel">
            <header>
              <div><Building2 size={15} /><strong>Shops</strong></div>
              <button
                className="text-button"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const saved = await saveFleetShop(departmentId, {
                      name: "New shop",
                      shopType: "internal",
                      location: "",
                      active: true,
                    }, actor);
                    setShops((current) => [saved, ...current]);
                    setSelectedShopId(saved.id);
                    onMessage?.("Shop created.");
                  } catch (createError) {
                    onError?.(createError?.message || "Unable to create shop.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <CirclePlus size={14} /> Add shop
              </button>
            </header>
            <div className="panel-body">
              <div className="personnel-list">
                {shops.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === selectedShopId ? "person-row selected" : "person-row"}
                    onClick={() => setSelectedShopId(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.shopType} · {item.location || "No location"}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {shopDraft ? (
            <section className="panel">
              <header>
                <div><strong>Edit shop</strong></div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const saved = await saveFleetShop(departmentId, shopDraft, actor);
                      setShops((current) => (
                        [saved, ...current.filter((row) => row.id !== saved.id)]
                          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                      ));
                      onMessage?.("Shop saved.");
                    } catch (saveError) {
                      onError?.(saveError?.message || "Unable to save shop.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Save size={14} /> Save
                </button>
              </header>
              <div className="panel-body occupancy-form-grid">
                <Field label="Name">
                  <input
                    value={shopDraft.name || ""}
                    onChange={(e) => setShopDraft((c) => ({ ...c, name: e.target.value }))}
                  />
                </Field>
                <Field label="Type">
                  <select
                    value={shopDraft.shopType || "internal"}
                    onChange={(e) => setShopDraft((c) => ({ ...c, shopType: e.target.value }))}
                  >
                    <option value="internal">Internal</option>
                    <option value="vendor">Vendor bay</option>
                    <option value="station">Station</option>
                  </select>
                </Field>
                <Field label="Location">
                  <input
                    value={shopDraft.location || ""}
                    onChange={(e) => setShopDraft((c) => ({ ...c, location: e.target.value }))}
                  />
                </Field>
                <Field label="Bay count">
                  <input
                    type="number"
                    min="0"
                    value={shopDraft.bayCount ?? 0}
                    onChange={(e) => setShopDraft((c) => ({ ...c, bayCount: Number(e.target.value) || 0 }))}
                  />
                </Field>
                <Field label="Notes">
                  <textarea
                    rows={2}
                    value={shopDraft.notes || ""}
                    onChange={(e) => setShopDraft((c) => ({ ...c, notes: e.target.value }))}
                  />
                </Field>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={shopDraft.active !== false}
                    onChange={(e) => setShopDraft((c) => ({ ...c, active: e.target.checked }))}
                  />
                  Active
                </label>
              </div>
            </section>
          ) : null}
        </section>
      ) : (
        <section className="personnel-workspace occupancy-workspace">
          <section className="panel">
            <header>
              <div><Store size={15} /><strong>Vendors</strong></div>
              <button
                className="text-button"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const saved = await saveFleetVendor(departmentId, {
                      name: "New vendor",
                      category: "General",
                      active: true,
                    }, actor);
                    setVendors((current) => [saved, ...current]);
                    setSelectedVendorId(saved.id);
                    onMessage?.("Vendor created.");
                  } catch (createError) {
                    onError?.(createError?.message || "Unable to create vendor.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <CirclePlus size={14} /> Add vendor
              </button>
            </header>
            <div className="panel-body">
              <div className="personnel-list">
                {vendors.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === selectedVendorId ? "person-row selected" : "person-row"}
                    onClick={() => setSelectedVendorId(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.category}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {vendorDraft ? (
            <section className="panel">
              <header>
                <div><strong>Edit vendor</strong></div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const saved = await saveFleetVendor(departmentId, vendorDraft, actor);
                      setVendors((current) => (
                        [saved, ...current.filter((row) => row.id !== saved.id)]
                          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                      ));
                      onMessage?.("Vendor saved.");
                    } catch (saveError) {
                      onError?.(saveError?.message || "Unable to save vendor.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Save size={14} /> Save
                </button>
              </header>
              <div className="panel-body occupancy-form-grid">
                <Field label="Name">
                  <input
                    value={vendorDraft.name || ""}
                    onChange={(e) => setVendorDraft((c) => ({ ...c, name: e.target.value }))}
                  />
                </Field>
                <Field label="Category">
                  <input
                    value={vendorDraft.category || ""}
                    onChange={(e) => setVendorDraft((c) => ({ ...c, category: e.target.value }))}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={vendorDraft.phone || ""}
                    onChange={(e) => setVendorDraft((c) => ({ ...c, phone: e.target.value }))}
                  />
                </Field>
                <Field label="Email">
                  <input
                    value={vendorDraft.email || ""}
                    onChange={(e) => setVendorDraft((c) => ({ ...c, email: e.target.value }))}
                  />
                </Field>
                <Field label="Notes">
                  <textarea
                    rows={2}
                    value={vendorDraft.notes || ""}
                    onChange={(e) => setVendorDraft((c) => ({ ...c, notes: e.target.value }))}
                  />
                </Field>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={vendorDraft.active !== false}
                    onChange={(e) => setVendorDraft((c) => ({ ...c, active: e.target.checked }))}
                  />
                  Active
                </label>
              </div>
            </section>
          ) : null}
        </section>
      )}
    </section>
  );
}
