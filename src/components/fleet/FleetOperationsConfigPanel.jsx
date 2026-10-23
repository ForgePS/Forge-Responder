import { getDeconTypes, getStarterLoadPlanItems } from "../../lib/fleet/index.js";
import { ClipboardList, Droplets } from "lucide-react";

/**
 * Reference catalogs for Fleet Operations (Phase 10).
 */
export default function FleetOperationsConfigPanel() {
  const deconTypes = getDeconTypes();
  const loadItems = getStarterLoadPlanItems();

  return (
    <section className="fleet-operations-config">
      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><Droplets size={15} /><strong>Decontamination types</strong></div></header>
        <div className="panel-body">
          <p className="occupancy-muted">Starter service types for cleaning and infection-control records.</p>
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {deconTypes.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <header><div><ClipboardList size={15} /><strong>Starter load-plan items</strong></div></header>
        <div className="panel-body">
          <p className="occupancy-muted">Applied when creating a new apparatus load plan. Customize per unit after creation.</p>
          <ul className="occupancy-timeline">
            {loadItems.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <small>{item.compartment} · qty {item.quantity} (min {item.minimumQuantity}){item.required ? " · required" : ""}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </section>
  );
}
