import { useMemo, useState } from "react";
import { Plus, Printer, Stethoscope } from "lucide-react";
import { Badge, Panel } from "../../shell/ui.jsx";
import {
  STATUS_INFO, describeAssignment, displayStatus, dueBadges, formatWhen,
} from "../../../lib/ems/equipmentDisplay.js";
import { describeError } from "../../../lib/ems/emsEquipmentService.js";
import { printLabels } from "../../../lib/ems/equipmentLabels.js";

const STATUS_FILTERS = ["available", "assigned", "in_service", "inspection_due", "maintenance_required", "out_of_service", "missing", "retired", "disposed"];

/** Every piece of equipment, with filters, what's due, label printing and registration. */
export default function EquipmentListTab({ equipment, canManage, departmentName, onOpen, onRegister }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [where, setWhere] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState("");

  const categories = useMemo(() => [...new Set(equipment.map((e) => e.category).filter(Boolean))].sort(), [equipment]);
  const places = useMemo(() => [...new Set(equipment.map((e) => describeAssignment(e.assignment)))].sort(), [equipment]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipment
      .map((e) => ({ ...e, shownStatus: displayStatus(e), where: describeAssignment(e.assignment) }))
      .filter((e) => showClosed || status === "retired" || status === "disposed" || !["retired", "disposed"].includes(e.status))
      .filter((e) => !category || e.category === category)
      .filter((e) => !status || e.shownStatus === status)
      .filter((e) => !where || e.where === where)
      .filter((e) => !q || `${e.name} ${e.assetNumber} ${e.serialNumber || ""} ${e.barcode || ""} ${e.manufacturer || ""} ${e.model || ""} ${e.where}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name) || String(a.assetNumber).localeCompare(String(b.assetNumber), undefined, { numeric: true }));
  }, [equipment, search, category, status, where, showClosed]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allShownSelected = shown.length > 0 && shown.every((e) => selected.has(e.id));
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((e) => e.id)));

  async function print() {
    setError("");
    const records = selected.size ? equipment.filter((e) => selected.has(e.id)) : shown;
    if (!records.length) return;
    try {
      await printLabels(records, departmentName);
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <Panel title="Equipment" icon={Stethoscope}
      action={(
        <div className="ems-row-actions">
          <button type="button" className="secondary-button" onClick={print} disabled={!shown.length && !selected.size}>
            <Printer size={14} /> {selected.size ? `Print ${selected.size} label${selected.size === 1 ? "" : "s"}` : "Print labels"}
          </button>
          {canManage ? <button type="button" className="primary-button" onClick={onRegister}><Plus size={14} /> Register equipment</button> : null}
        </div>
      )}>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <div className="ems-filters">
        <input type="search" placeholder="Search name, ID, serial, barcode" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search equipment" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
        </select>
        <select value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Where">
          <option value="">Everywhere</option>
          {places.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="ems-inline-check"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show retired and disposed</label>
      </div>
      <div className="data-table-wrap">
        <table className="ems-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all shown" /></th>
              <th>Equipment</th><th>Category</th><th>Where</th><th>Status</th><th>Last verified</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const info = STATUS_INFO[e.shownStatus] || STATUS_INFO.available;
              return (
                <tr key={e.id}>
                  <td><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Select ${e.name}`} /></td>
                  <td>
                    <button type="button" className="link-button ems-open" onClick={() => onOpen(e.id)}><strong>{e.name}</strong></button>
                    <small className="ems-block occupancy-muted">{e.assetNumber}{e.serialNumber ? ` · S/N ${e.serialNumber}` : ""}</small>
                  </td>
                  <td>{e.category}</td>
                  <td>{e.where}</td>
                  <td>
                    <div className="ems-badges">
                      <Badge tone={info.tone}>{info.label}</Badge>
                      {dueBadges(e).filter((b) => !(b.label === "Inspection overdue" && e.shownStatus === "inspection_due"))
                        .map((b) => <Badge key={b.label} tone={b.tone}>{b.label}</Badge>)}
                    </div>
                  </td>
                  <td className="ems-num">{e.lastVerifiedAt ? formatWhen(e.lastVerifiedAt) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length ? (
          <div className="empty-table">
            {equipment.length ? "Nothing matches." : `No equipment yet.${canManage ? " Register equipment, or import it from the Assets list on the Import tab." : ""}`}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
