import { CirclePlus, Trash2 } from "lucide-react";
import AdminTextInput from "./AdminTextInput.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { limitCheck, limitMessage } from "../lib/moduleAccess.js";
import {
  createEmptyStation,
  normalizeStationDetails,
  normalizeStationRecord,
} from "../lib/stationProfile.js";

export default function DepartmentStationsEditor({
  value = [],
  onChange,
}) {
  const stations = normalizeStationDetails(value);
  const { entitlements } = useTenant();
  const { isCreator } = useAuth();
  // The plan's station limit (the database refuses saves past it too).
  const stationLimit = limitCheck({ ...entitlements, usage: { stations: stations.length } }, "maxStations", "stations", 1);
  const atLimit = !isCreator && !stationLimit.allowed;

  function updateStation(index, patch) {
    onChange(
      stations.map((station, stationIndex) => (
        stationIndex === index ? normalizeStationRecord({ ...station, ...patch }, stationIndex) : station
      ))
    );
  }

  function addStation() {
    onChange([...stations, createEmptyStation(`Station ${stations.length + 1}`, stations.length)]);
  }

  function removeStation(index) {
    onChange(stations.filter((_, stationIndex) => stationIndex !== index));
  }

  return (
    <section className="department-stations-editor">
      <header className="department-stations-header">
        <div>
          <strong>Station Information</strong>
          <p className="auth-help">Add address and contact details for each station in this department.</p>
        </div>
        <button className="secondary-button" type="button" onClick={addStation} disabled={atLimit}>
          <CirclePlus size={14} /> Add station
        </button>
      </header>
      {atLimit && <p className="auth-help" role="status">{limitMessage("stations", stationLimit)}</p>}

      {!stations.length ? (
        <p className="auth-help">No stations configured yet. Add a station to get started.</p>
      ) : (
        <div className="department-stations-list">
          {stations.map((station, index) => (
            <article className="department-station-card" key={station.id || `station-card-${index}`}>
              <header className="department-station-card-head">
                <strong>{station.name || `Station ${index + 1}`}</strong>
                <button
                  className="row-action danger"
                  type="button"
                  onClick={() => removeStation(index)}
                  aria-label={`Remove ${station.name || "station"}`}
                >
                  <Trash2 size={14} />
                </button>
              </header>

              <div className="workflow-form department-station-fields">
                <label>
                  <span>Station name</span>
                  <AdminTextInput
                    value={station.name}
                    onChange={(nextValue) => updateStation(index, { name: nextValue })}
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <AdminTextInput
                    value={station.phone}
                    onChange={(nextValue) => updateStation(index, { phone: nextValue })}
                  />
                </label>
                <label className="wide-field">
                  <span>Address</span>
                  <AdminTextInput
                    value={station.address}
                    onChange={(nextValue) => updateStation(index, { address: nextValue })}
                  />
                </label>
                <label>
                  <span>City</span>
                  <AdminTextInput
                    value={station.city}
                    onChange={(nextValue) => updateStation(index, { city: nextValue })}
                  />
                </label>
                <label>
                  <span>State</span>
                  <AdminTextInput
                    value={station.state}
                    onChange={(nextValue) => updateStation(index, { state: nextValue })}
                  />
                </label>
                <label>
                  <span>ZIP</span>
                  <AdminTextInput
                    value={station.zip}
                    onChange={(nextValue) => updateStation(index, { zip: nextValue })}
                  />
                </label>
                <label className="wide-field">
                  <span>Notes</span>
                  <AdminTextInput
                    value={station.notes}
                    onChange={(nextValue) => updateStation(index, { notes: nextValue })}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
