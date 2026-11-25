import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { Panel } from "../../shell/ui.jsx";
import { EVENT_LABELS, STATUS_INFO, describeAssignment, formatWhen } from "../../../lib/ems/equipmentDisplay.js";
import { describeError, watchEquipmentEvents } from "../../../lib/ems/emsEquipmentService.js";

const GROUPS = {
  moves: ["transferred", "registered", "imported"],
  checks: ["verified", "found", "inspected", "calibrated"],
  problems: ["problem_reported", "maintenance_requested", "reported_missing", "maintenance_completed"],
  status: ["status_changed", "retired", "disposed"],
};

/** The newest equipment history across the department. */
export default function EquipmentHistoryTab({ departmentId, onOpen }) {
  const [events, setEvents] = useState([]);
  const [group, setGroup] = useState("");
  const [error, setError] = useState("");
  useEffect(() => watchEquipmentEvents(departmentId, { max: 200 }, setEvents, (e) => setError(describeError(e))), [departmentId]);
  const shown = useMemo(() => events.filter((e) => !group || GROUPS[group].includes(e.type)), [events, group]);
  return (
    <Panel title="Equipment history" icon={History}>
      {error ? <div className="checklist-missing-alert" role="alert">{error}</div> : null}
      <div className="ems-filters">
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Show">
          <option value="">Everything</option>
          <option value="moves">Moves and registration</option>
          <option value="checks">Verifications and inspections</option>
          <option value="problems">Problems and repairs</option>
          <option value="status">Status changes</option>
        </select>
      </div>
      <div className="data-table-wrap">
        <table className="ems-table">
          <thead><tr><th>When</th><th>Equipment</th><th>What happened</th><th>Details</th><th>Who</th></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="ems-num">{formatWhen(e.at)}</td>
                <td>
                  <button type="button" className="link-button ems-open" onClick={() => onOpen(e.equipmentId)}>{e.equipmentName}</button>
                  <small className="ems-block occupancy-muted">{e.assetNumber}</small>
                </td>
                <td>{EVENT_LABELS[e.type] || e.type}{e.result ? ` (${e.result === "pass" ? "pass" : "fail"})` : ""}</td>
                <td>
                  {e.type === "transferred" ? `${describeAssignment(e.from)} → ${describeAssignment(e.to)}` : ""}
                  {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus
                    ? <small className="ems-block">{STATUS_INFO[e.fromStatus]?.label} → {STATUS_INFO[e.toStatus]?.label}</small> : null}
                  {e.description || e.notes || e.note || e.reason ? <small className="ems-block occupancy-muted">{e.description || e.notes || e.note || e.reason}</small> : null}
                </td>
                <td>{e.actorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <div className="empty-table">No equipment history yet.</div> : null}
      </div>
    </Panel>
  );
}
