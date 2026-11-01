import FleetDefectConfigPanel from "./FleetDefectConfigPanel.jsx";
import FleetShopVendorConfigPanel from "./FleetShopVendorConfigPanel.jsx";
import "../../styles/fleet-config-repairs.css";

/**
 * Fleet Configuration Studio "Repairs" tab: what crews can report
 * (defect categories) and where repairs get done (shops and vendors).
 */
export default function FleetRepairsConfigPanel({ departmentId, actor, onMessage, onError }) {
  const shared = { departmentId, actor, onMessage, onError };
  return (
    <div className="fleet-repairs-config">
      <section className="fleet-repairs-section">
        <header>
          <h3>Problem categories</h3>
        </header>
        <FleetDefectConfigPanel {...shared} />
      </section>
      <section className="fleet-repairs-section">
        <header>
          <h3>Repair shops and vendors</h3>
          <p className="occupancy-muted">Who fixes your apparatus. These appear when you create a work order.</p>
        </header>
        <FleetShopVendorConfigPanel {...shared} />
      </section>
    </div>
  );
}
