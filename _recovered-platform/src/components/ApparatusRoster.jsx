import { Truck, Users } from "lucide-react";
import Badge from "./Badge.jsx";

const FALLBACK_UNITS = ["Battalion 1", "Engine 1", "Engine 2", "Engine 3", "Truck 3", "Rescue 1", "Brush 2"];

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (/leave|off|vacation/.test(value)) return "warning";
  if (/out|vacant|unassigned/.test(value)) return "critical";
  return "success";
}

function unitMeta(unit, apparatus = []) {
  const match = apparatus.find((item) => item.unit === unit);
  return {
    station: match?.station || "Department-wide",
    type: match?.type || "Assignment",
    readiness: match?.status || "Assigned",
  };
}

export default function ApparatusRoster({
  shiftLabel,
  dateLabel,
  roster = [],
  apparatus = [],
  unitOptions = FALLBACK_UNITS,
  onUpdateApparatus,
}) {
  const onDuty = roster.filter((member) => member.status !== "Leave");
  const grouped = unitOptions.map((unit) => ({
    unit,
    crew: roster.filter((member) => member.apparatus === unit),
    meta: unitMeta(unit, apparatus),
  })).filter((entry) => entry.crew.length > 0 || !["Leave"].includes(entry.unit));

  const unassigned = roster.filter((member) => !unitOptions.includes(member.apparatus));

  return (
    <section className="apparatus-roster">
      <header className="apparatus-roster-header">
        <div>
          <h2>Daily Apparatus Roster</h2>
          <p>{dateLabel} · {shiftLabel}</p>
        </div>
        <div className="apparatus-roster-stats">
          <span><Users size={14} /> {onDuty.length} on duty</span>
          <span><Truck size={14} /> {grouped.filter((entry) => entry.crew.length > 0).length} units staffed</span>
        </div>
      </header>

      <div className="apparatus-roster-grid">
        {grouped.map(({ unit, crew, meta }) => (
          <article key={unit} className="apparatus-roster-card">
            <header>
              <div>
                <strong>{unit}</strong>
                <span>{meta.type} · {meta.station}</span>
              </div>
              <Badge tone={meta.readiness === "In Service" ? "success" : meta.readiness === "Out of Service" ? "critical" : "warning"}>
                {meta.readiness}
              </Badge>
            </header>

            {crew.length === 0 ? (
              <p className="apparatus-roster-empty">No crew assigned</p>
            ) : (
              <ul>
                {crew.map((member) => (
                  <li key={member.id}>
                    <div>
                      <strong>{member.name}</strong>
                      <span>{member.rank} · {member.position}</span>
                    </div>
                    <div className="apparatus-roster-actions">
                      <select
                        value={member.apparatus}
                        onChange={(event) => onUpdateApparatus(member.id, event.target.value)}
                      >
                        {[...unitOptions, "Leave"].map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <Badge tone={statusTone(member.status)}>{member.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>

      {unassigned.length > 0 && (
        <section className="apparatus-roster-unassigned">
          <h3>Unassigned / alternate duty</h3>
          <ul>
            {unassigned.map((member) => (
              <li key={member.id}>
                <strong>{member.name}</strong>
                <span>{member.rank} · {member.position}</span>
                <Badge tone={statusTone(member.status)}>{member.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
