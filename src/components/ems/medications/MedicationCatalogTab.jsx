import { useMemo, useState } from "react";
import { Pencil, Pill, Plus } from "lucide-react";
import { Badge, Modal, Panel } from "../../shell/ui.jsx";
import {
  CONTROLLED_SCHEDULES, DEFAULT_MEDICATION_CATEGORIES, DOSAGE_FORMS, ROUTES, STORAGE_CONDITIONS, STORAGE_LABELS,
} from "../../../lib/ems/inventoryDisplay.js";
import { describeError, saveInventoryItem } from "../../../lib/ems/emsInventoryService.js";

const EMPTY_MEDICATION = {
  name: "", genericName: "", brandName: "", strength: "", concentration: "", dosageForm: "", routes: [],
  category: "", unitOfMeasure: "each", ndc: "", rxnormCode: "", controlledSchedule: "", storage: "room",
  protectFromLight: false, highAlert: false, lookAlikeNote: "", manufacturer: "", vendorName: "", barcode: "",
  unitCost: "", description: "", active: true,
};

function MedicationModal({ departmentId, item, categories, onClose, onDone }) {
  const [form, setForm] = useState({ ...EMPTY_MEDICATION, ...(item || {}), unitCost: item?.unitCost ?? "", routes: item?.routes || [] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const toggleRoute = (route) => setForm((p) => ({
    ...p, routes: p.routes.includes(route) ? p.routes.filter((r) => r !== route) : [...p.routes, route],
  }));

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      // The display name defaults to the generic name and strength.
      const name = form.name.trim() || [form.genericName.trim(), form.strength.trim()].filter(Boolean).join(" ");
      await saveInventoryItem(departmentId, { ...form, name, itemClass: "medication" });
      onDone(`${name} saved.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? `Edit ${item.name}` : "Add a medication"} onClose={onClose}>
      <form className="ems-form" onSubmit={save}>
        {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
        <div className="ems-form-grid">
          <label className="config-field"><span>Generic name *</span><input value={form.genericName} onChange={set("genericName")} maxLength={120} required /></label>
          <label className="config-field"><span>Brand name</span><input value={form.brandName} onChange={set("brandName")} maxLength={120} /></label>
          <label className="config-field"><span>Strength</span><input value={form.strength} onChange={set("strength")} maxLength={60} placeholder="1 mg/10 mL" /></label>
          <label className="config-field"><span>Concentration</span><input value={form.concentration} onChange={set("concentration")} maxLength={60} placeholder="0.1 mg/mL" /></label>
          <label className="config-field">
            <span>Dosage form</span>
            <select value={form.dosageForm} onChange={set("dosageForm")}>
              <option value="">Choose…</option>
              {DOSAGE_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Category *</span>
            <input list="ems-med-categories" value={form.category} onChange={set("category")} maxLength={60} required />
            <datalist id="ems-med-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="config-field ems-span-2">
            <span>Display name</span>
            <input value={form.name} onChange={set("name")} maxLength={120} placeholder="Generic name and strength if left blank" />
          </label>
          <fieldset className="config-field ems-span-2 ems-fieldset">
            <legend>Routes</legend>
            <div className="ems-chip-list">
              {ROUTES.map((r) => (
                <label key={r} className="ems-chip"><input type="checkbox" checked={form.routes.includes(r)} onChange={() => toggleRoute(r)} /> {r}</label>
              ))}
            </div>
          </fieldset>
          <label className="config-field"><span>NDC</span><input value={form.ndc} onChange={set("ndc")} maxLength={13} placeholder="0409-4888-02" /></label>
          <label className="config-field"><span>RxNorm code (RxCUI)</span><input value={form.rxnormCode} onChange={set("rxnormCode")} maxLength={10} inputMode="numeric" /></label>
          <label className="config-field"><span>Unit of measure</span><input value={form.unitOfMeasure} onChange={set("unitOfMeasure")} maxLength={30} placeholder="each, vial, syringe" /></label>
          <label className="config-field">
            <span>Storage</span>
            <select value={form.storage} onChange={set("storage")}>
              {STORAGE_CONDITIONS.map((c) => <option key={c} value={c}>{STORAGE_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>DEA schedule</span>
            <select value={form.controlledSchedule} onChange={set("controlledSchedule")}>
              {CONTROLLED_SCHEDULES.map((c) => <option key={c || "none"} value={c}>{c ? `Schedule ${c}` : "Not controlled"}</option>)}
            </select>
          </label>
          <label className="config-field"><span>Unit cost ($)</span><input type="number" min="0" step="0.01" value={form.unitCost} onChange={set("unitCost")} /></label>
          <label className="config-field"><span>Manufacturer</span><input value={form.manufacturer} onChange={set("manufacturer")} maxLength={120} /></label>
          <label className="config-field"><span>Vendor</span><input value={form.vendorName} onChange={set("vendorName")} maxLength={120} /></label>
          <label className="config-field"><span>Barcode</span><input value={form.barcode} onChange={set("barcode")} maxLength={60} /></label>
          <label className="config-field ems-span-2"><span>Look-alike / sound-alike warning</span><input value={form.lookAlikeNote} onChange={set("lookAlikeNote")} maxLength={200} placeholder="For example: don't confuse with…" /></label>
          <label className="config-field ems-span-2"><span>Notes</span><textarea rows={2} value={form.description} onChange={set("description")} maxLength={500} /></label>
          <label className="ems-check"><input type="checkbox" checked={form.highAlert} onChange={set("highAlert")} /> High-alert medication</label>
          <label className="ems-check"><input type="checkbox" checked={form.protectFromLight} onChange={set("protectFromLight")} /> Protect from light</label>
          {item ? <label className="ems-check"><input type="checkbox" checked={form.active} onChange={set("active")} /> Active (turn off to stop receiving it)</label> : null}
        </div>
        {form.controlledSchedule ? (
          <p className="checklist-missing-alert">Controlled substances can be listed here, but their stock isn't tracked in this inventory. A separate controlled-substance ledger with witnesses and seals is coming.</p>
        ) : null}
        <p className="occupancy-muted ems-hint">Every medication needs a lot number and expiration date when received.</p>
        <div className="df-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** The medication formulary: what the department stocks. */
export default function MedicationCatalogTab({ departmentId, items, canManage, onMessage }) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const categories = useMemo(() => [...new Set([...DEFAULT_MEDICATION_CATEGORIES, ...items.map((i) => i.category).filter(Boolean)])].sort(), [items]);
  const shown = items
    .filter((i) => `${i.name} ${i.genericName || ""} ${i.brandName || ""} ${i.category} ${i.ndc || ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Panel title="Medication catalog" icon={Pill}
      action={canManage ? <button type="button" className="primary-button" onClick={() => setEditing({})}><Plus size={14} /> Add medication</button> : null}>
      <div className="ems-filters"><input type="search" placeholder="Search medications" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search medications" /></div>
      <div className="data-table-wrap">
        <table className="ems-table">
          <thead><tr><th>Medication</th><th>Form and routes</th><th>Category</th><th>NDC</th><th>Storage</th><th>Flags</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                  <small className="ems-block occupancy-muted">{[i.genericName, i.brandName ? `(${i.brandName})` : "", i.concentration].filter(Boolean).join(" ")}</small>
                  {i.lookAlikeNote ? <small className="ems-block ems-held-text">{i.lookAlikeNote}</small> : null}
                </td>
                <td>{[i.dosageForm, (i.routes || []).join(", ")].filter(Boolean).join(" · ") || "—"}</td>
                <td>{i.category}</td>
                <td>{i.ndc || "—"}{i.rxnormCode ? <small className="ems-block occupancy-muted">RxCUI {i.rxnormCode}</small> : null}</td>
                <td>{STORAGE_LABELS[i.storage] || "Room temperature"}{i.protectFromLight ? <small className="ems-block occupancy-muted">Protect from light</small> : null}</td>
                <td>
                  {i.highAlert ? <Badge tone="critical">High alert</Badge> : null}
                  {i.controlledSchedule ? <Badge tone="warning">Schedule {i.controlledSchedule}</Badge> : null}
                  {!i.highAlert && !i.controlledSchedule ? "—" : null}
                </td>
                <td><Badge tone={i.active === false ? "neutral" : "success"}>{i.active === false ? "Off" : "Active"}</Badge></td>
                <td>{canManage ? <button type="button" className="secondary-button" onClick={() => setEditing(i)} title="Edit"><Pencil size={14} /><span className="sr-only">Edit {i.name}</span></button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <div className="empty-table">{items.length ? "Nothing matches." : "No medications yet."}</div> : null}
      </div>
      {editing ? (
        <MedicationModal departmentId={departmentId} item={editing.id ? editing : null} categories={categories}
          onClose={() => setEditing(null)} onDone={(text) => { setEditing(null); onMessage(text); }} />
      ) : null}
    </Panel>
  );
}
