import { useEffect, useState } from "react";
import { Modal } from "../shell/ui.jsx";
import { loadHeatZoneIncident } from "../../lib/heatZone/heatZoneService.js";
import { formatDuration, formatInZone } from "../../lib/heatZone/heatZoneFilters.js";
import { describeError } from "../../lib/heatZone/heatZoneUi.js";

const list = (values) => (Array.isArray(values) && values.length ? values.join(", ") : "—");

/** Authorized detail for one incident marker (the server audits each view). */
export default function IncidentDetail({ departmentId, incidentId, timeZone, onClose }) {
  const [state, setState] = useState({ loading: true, incident: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, incident: null, error: null });
    loadHeatZoneIncident(departmentId, incidentId)
      .then((incident) => { if (!cancelled) setState({ loading: false, incident, error: null }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, incident: null, error: describeError(error, "Unable to load this incident.") }); });
    return () => { cancelled = true; };
  }, [departmentId, incidentId]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { loading, incident, error } = state;
  const zone = incident?.timeZone || timeZone;
  const rows = incident ? [
    ["Report number", incident.reportNumber || "—"],
    ["Date / time", `${formatInZone(incident.occurredAt, zone)} (${zone})`],
    ["Address", incident.address || "—"],
    ["Classification", [incident.classification, incident.classificationDetail].filter(Boolean).join(" — ") || "—"],
    ["Priority", incident.priority || "—"],
    ["Disposition", incident.disposition || "—"],
    ["Status", incident.status || "—"],
    ["Units", list(incident.units)],
    ["Unit types", list(incident.unitTypes)],
    ["Stations", list(incident.stations)],
    ["Response time", Number.isFinite(incident.responseSeconds) && incident.responseSeconds > 0 ? formatDuration(incident.responseSeconds) : "Not recorded"],
    ["District", incident.district?.name || "—"],
    ["Response zones", list((incident.zones || []).map((z) => z.name))],
  ] : [];

  return (
    <Modal title={incident?.reportNumber ? `Incident ${incident.reportNumber}` : "Incident detail"} onClose={onClose}>
      <div className="hz-incident">
        {loading && <div className="page-loading"><span className="page-loading-spinner" /> Loading incident…</div>}
        {error && (
          <div className="error-banner" role="alert">
            {error.code === "not-found" ? "That incident is not available. It may have been removed or is outside your districts." : error.message}
          </div>
        )}
        {incident && (
          <dl className="hz-detail-list">
            {rows.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        )}
        <div className="hz-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
