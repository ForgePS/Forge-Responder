import { useMemo } from "react";
import { locationPath } from "../../../lib/ems/inventoryDisplay.js";

/**
 * Where equipment is: a Fleet vehicle, an inventory storage location and/or a
 * station. Leave everything blank to unassign. The server copies the labels
 * from the real records.
 */
export default function AssignmentFields({ value, onChange, stations = [], fleetAssets = [], locations = [] }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const byId = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations]);
  const storage = locations.filter((l) => l.active !== false)
    .map((l) => ({ id: l.id, path: locationPath(l, byId) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const vehicles = fleetAssets.filter((a) => !["disposed", "retired", "sold"].includes(String(a.status || "").toLowerCase()));
  return (
    <div className="ems-form-grid">
      <label className="config-field">
        <span>Vehicle</span>
        <select value={value.fleetAssetId || ""} onChange={set("fleetAssetId")}>
          <option value="">Not on a vehicle</option>
          {vehicles.map((a) => <option key={a.id} value={a.id}>{a.unitDesignation || a.fleetNumber || a.name}</option>)}
        </select>
      </label>
      <label className="config-field">
        <span>Station</span>
        <select value={value.stationName || ""} onChange={set("stationName")}>
          <option value="">{value.fleetAssetId ? "The vehicle's station" : "No station"}</option>
          {stations.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="config-field ems-span-2">
        <span>Storage location</span>
        <select value={value.locationId || ""} onChange={set("locationId")}>
          <option value="">None</option>
          {storage.map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
        </select>
        {!storage.length ? <small className="occupancy-muted">Storage locations are set up on EMS Supply Inventory → Locations.</small> : null}
      </label>
    </div>
  );
}
