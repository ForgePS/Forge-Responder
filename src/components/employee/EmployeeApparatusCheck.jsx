import { useEffect, useMemo, useState } from "react";
import { Truck } from "lucide-react";
import FleetCheckConductPanel from "../fleet/FleetCheckConductPanel.jsx";
import { listFleetAssets } from "../../lib/fleet/fleetAssetService.js";
import { canonicalApparatusUnitName } from "../../lib/apparatusSchema.js";

function assetLabel(asset = {}) {
  return asset.unitDesignation || asset.fleetNumber || asset.name || asset.id;
}

/**
 * Employee Portal: run the department's published fleet checklist on a unit.
 * Results, failed items and defects land in Fleet, same as the admin side.
 */
export default function EmployeeApparatusCheck({ departmentId, myUnit, actor, permissions, isCreator, onMessage }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assetId, setAssetId] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listFleetAssets(departmentId)
      .then((list) => { if (!cancelled) setAssets((list || []).filter((a) => !/retired|disposed|sold/i.test(a.status || ""))); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Couldn't load the fleet list."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [departmentId]);

  const mine = useMemo(() => {
    if (!myUnit) return null;
    const unitName = canonicalApparatusUnitName(myUnit.unit || "");
    return assets.find((a) => a.legacyApparatusId === myUnit.id)
      || assets.find((a) => canonicalApparatusUnitName(assetLabel(a)) === unitName)
      || null;
  }, [assets, myUnit]);

  useEffect(() => {
    if (!assetId && mine) setAssetId(mine.id);
  }, [mine, assetId]);

  const selected = assets.find((a) => a.id === assetId) || null;

  if (loading) return <p className="auth-help">Loading your fleet…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!assets.length) return <p className="auth-help">Your department hasn't set up its fleet yet, so there are no checklists to run. Ask command staff.</p>;

  return (
    <div className="employee-apparatus-check">
      <div className="workflow-form">
        <label className="wide-field">
          <span>Unit to check</span>
          <select value={assetId} onChange={(e) => { setAssetId(e.target.value); setOpen(false); }}>
            <option value="">Choose a unit</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{assetLabel(a)}{a.id === mine?.id ? " (your unit)" : ""}</option>)}
          </select>
        </label>
      </div>
      {!open ? (
        <button type="button" className="primary-button" style={{ marginTop: 12 }} disabled={!selected} onClick={() => setOpen(true)}>
          <Truck size={14} /> Start check{selected ? ` on ${assetLabel(selected)}` : ""}
        </button>
      ) : (
        <FleetCheckConductPanel
          departmentId={departmentId}
          asset={selected}
          actor={actor}
          permissions={permissions}
          isCreator={isCreator}
          allowConduct
          onClose={() => setOpen(false)}
          onCompleted={() => { setOpen(false); onMessage?.(`Check completed for ${assetLabel(selected)}.`); }}
          onMessage={onMessage}
          onError={setError}
        />
      )}
    </div>
  );
}
