import { Truck, Users } from "lucide-react";

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

function memberInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return String(name).slice(0, 2).toUpperCase();
}

export default function ApparatusRoster({
  shiftLabel,
  dateLabel,
  roster = [],
  apparatus = [],
  displayUnits = [],
  unitOptions = [],
  onUpdateApparatus,
  canEdit = true,
}) {
  const units = displayUnits.length ? displayUnits : unitOptions;
  const onDuty = roster.filter((member) => member.status !== "Leave");
  const grouped = units.map((unit) => ({
    unit,
    crew: roster.filter((member) => member.apparatus === unit),
    meta: unitMeta(unit, apparatus),
  }));

  const unassigned = roster.filter((member) => !units.includes(member.apparatus));

  return (
    <section className="apparatus-roster">
      <header className="apparatus-roster-header">
        <div>
          <h2>Daily Apparatus Roster</h2>
          <p>{dateLabel} · {shiftLabel}</p>
        </div>
        <div className="apparatus-roster-stats">
          <span className="schedule-roster-stat"><Truck size={14} /> {grouped.length} units on roster</span>
          <span className="schedule-roster-stat"><Users size={14} /> {grouped.filter(({ crew }) => crew.length > 0).length} staffed</span>
        </div>
      </header>

      <div className="apparatus-roster-grid">
        {grouped.map(({ unit, crew, meta }) => (
          <article key={unit} className="apparatus-roster-card">
            <header>
              <div className="apparatus-roster-card-title">
                <span className="apparatus-unit-badge"><Truck size={14} /></span>
                <div>
                  <strong>{unit}</strong>
                  <span>{meta.type} · {meta.station}</span>
                </div>
              </div>
              <span className={`badge badge-${meta.readiness === "In Service" ? "success" : meta.readiness === "Out of Service" ? "critical" : "warning"}`}>
                {meta.readiness}
              </span>
            </header>

            {crew.length === 0 ? (
              <p className="apparatus-roster-empty">No crew assigned</p>
            ) : (
              <ul>
                {crew.map((member) => (
                  <li key={member.id}>
                    <div className="apparatus-roster-member">
                      <span className="apparatus-member-avatar">{memberInitials(member.name)}</span>
                      <div>
                        <strong>{member.name}</strong>
                        <span>{member.rank} · {member.position}</span>
                      </div>
                    </div>
                    <div className="apparatus-roster-actions">
                      {canEdit ? (
                        <select
                          value={member.apparatus}
                          onChange={(event) => onUpdateApparatus(member.id, event.target.value)}
                        >
                          {[...units, "Leave"].map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{member.apparatus}</span>
                      )}
                      <span className={`badge badge-${statusTone(member.status)}`}>{member.status}</span>
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
                <span className={`badge badge-${statusTone(member.status)}`}>{member.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
