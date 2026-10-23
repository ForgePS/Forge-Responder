import { useEffect, useState } from "react";
import { FileWarning, ShieldCheck } from "lucide-react";
import {
  ensureFleetRecallsSeeded,
  getFluidTypes,
  getRecallCampaignTypes,
  getTirePositions,
} from "../../lib/fleet/index.js";

/**
 * Reference config for Phase 9 component / warranty catalogs.
 */
export default function FleetComponentsConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [recallCount, setRecallCount] = useState(0);
  const fluidTypes = getFluidTypes();
  const campaignTypes = getRecallCampaignTypes();
  const tirePositions = getTirePositions();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!departmentId) return;
      setLoading(true);
      try {
        const recalls = await ensureFleetRecallsSeeded(departmentId, actor);
        if (!cancelled) {
          setRecallCount(recalls.length);
          onMessage?.(`Recall / bulletin catalog ready (${recalls.length}).`);
        }
      } catch (err) {
        if (!cancelled) onError?.(err?.message || "Unable to seed recalls.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading component catalogs...</p></div>;
  }

  return (
    <section className="fleet-components-config">
      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><FileWarning size={15} /><strong>Campaign types</strong></div></header>
        <div className="panel-body">
          <p className="occupancy-muted">
            Seeded recall / bulletin records: {recallCount}. NHTSA-style matching requires human confirmation before assets are linked.
          </p>
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>Type</span><span>Label</span></div>
            {campaignTypes.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><ShieldCheck size={15} /><strong>Tire positions</strong></div></header>
        <div className="panel-body">
          <p className="occupancy-muted">Editable position labels can be extended later; these are the starter set.</p>
          <ul className="occupancy-timeline">
            {tirePositions.map((row) => (
              <li key={row.id}><strong>{row.id}</strong><small>{row.label}</small></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Fluid types</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {fluidTypes.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
