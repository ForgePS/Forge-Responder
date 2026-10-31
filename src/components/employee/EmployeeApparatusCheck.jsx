import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Truck } from "lucide-react";
import FleetCheckConductPanel from "../fleet/FleetCheckConductPanel.jsx";
import { isRetiredFleetAsset, listFleetAssets, syncFleetAssetsFromApparatus } from "../../lib/fleet/fleetAssetService.js";
import { readinessLabel } from "../../lib/fleet/checkProgress.js";
import { canonicalApparatusUnitName } from "../../lib/apparatusSchema.js";

function assetLabel(asset = {}) {
  return asset.unitDesignation || asset.fleetNumber || asset.name || asset.id;
}

function lastCheckText(asset = {}) {
  if (!asset.lastCheckAt) return "Not checked yet";
  const when = new Date(asset.lastCheckAt);
  const today = new Date();
  const sameDay = when.toDateString() === today.toDateString();
  const label = sameDay
    ? `today at ${when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : when.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Last checked ${label}${asset.lastCheckResult ? ` · ${asset.lastCheckResult}` : ""}`;
}

function checkedToday(asset = {}) {
  return asset.lastCheckAt && new Date(asset.lastCheckAt).toDateString() === new Date().toDateString();
}

/**
 * Employee Portal: pick a unit and run the department's published checklist on it.
 * Results, failed items and defects land in Fleet, same as the admin side.
 */
export default function EmployeeApparatusCheck({ departmentId, myUnit, actor, permissions, isCreator, onMessage }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [showAll, setShowAll] = useState(false);

  async function loadAssets() {
    try {
      // Units added on the Apparatus page join the check list automatically.
      await syncFleetAssetsFromApparatus(departmentId, null, actor).catch(() => []);
      const list = await listFleetAssets(departmentId);
      setAssets((list || []).filter((a) => !isRetiredFleetAsset(a)));
    } catch (err) {
      setError(err?.message || "Couldn't load the fleet list.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAssets().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  const mine = useMemo(() => {
    if (!myUnit) return null;
    const unitName = canonicalApparatusUnitName(myUnit.unit || "");
    return assets.find((a) => a.legacyApparatusId === myUnit.id)
      || assets.find((a) => canonicalApparatusUnitName(assetLabel(a)) === unitName)
      || null;
  }, [assets, myUnit]);

  // Your unit first, then everything else by name.
  const ordered = useMemo(() => {
    const rest = assets.filter((a) => a.id !== mine?.id)
      .sort((a, b) => String(assetLabel(a)).localeCompare(String(assetLabel(b)), undefined, { numeric: true }));
    return mine ? [mine, ...rest] : rest;
  }, [assets, mine]);
  const shown = showAll || !mine ? ordered : ordered.slice(0, 1);
  const active = assets.find((a) => a.id === activeId) || null;

  if (loading) return <p className="auth-help">Loading your fleet…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!assets.length) return <p className="auth-help">Your department hasn't set up its fleet yet, so there are no checklists to run. Ask command staff.</p>;

  if (active) {
    return (
      <FleetCheckConductPanel
        departmentId={departmentId}
        asset={active}
        actor={actor}
        permissions={permissions}
        isCreator={isCreator}
        allowConduct
        autoStart
        onClose={() => setActiveId("")}
        onCompleted={() => {
          onMessage?.(`Check saved for ${assetLabel(active)}.`);
          loadAssets();
        }}
        onMessage={onMessage}
        onError={setError}
      />
    );
  }

  return (
    <div className="employee-apparatus-check">
      <p className="auth-help">Tap a unit to start its daily check. Failed items go straight to the fleet team.</p>
      <div className="apparatus-check-cards">
        {shown.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className={`apparatus-check-card${checkedToday(asset) ? " is-done" : ""}`}
            onClick={() => setActiveId(asset.id)}
          >
            <span className="apparatus-check-card-icon"><Truck size={18} aria-hidden="true" /></span>
            <span className="apparatus-check-card-text">
              <strong>{assetLabel(asset)}{asset.id === mine?.id ? <em> · your unit</em> : null}</strong>
              <small>{lastCheckText(asset)}</small>
              {asset.readinessState && asset.readinessState !== "available" ? (
                <small className="apparatus-check-card-status">{readinessLabel(asset.readinessState)}</small>
              ) : null}
            </span>
            <span className="apparatus-check-card-action">
              <ClipboardCheck size={14} aria-hidden="true" /> {asset.openCheckId ? "Continue" : "Start"}
            </span>
          </button>
        ))}
      </div>
      {mine && ordered.length > 1 ? (
        <button type="button" className="text-button" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show only my unit" : `Check a different unit (${ordered.length - 1} more)`}
        </button>
      ) : null}
    </div>
  );
}
