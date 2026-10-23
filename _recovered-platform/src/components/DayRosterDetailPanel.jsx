import { AlertTriangle, Truck, Users } from "lucide-react";

function statusTone(status, leaveLabel = "") {
  const value = String(leaveLabel || status || "").toLowerCase();
  if (/leave|off|vacation|sick/.test(value)) return "warning";
  if (/vacant|deficit/.test(value)) return "critical";
  if (/trade/.test(value)) return "info";
  return "success";
}

function memberStatusLabel(member = {}) {
  if (member.status === "Leave") return member.leaveLabel || "Leave";
  if (member.tradeLabel) return member.tradeLabel;
  return member.status || "On Duty";
}

function memberAssignmentValue(member = {}) {
  if (member.status === "Leave") {
    return member.assignmentValue || member.leaveLabel || "Vacation";
  }
  return member.assignmentValue || member.apparatus || "Unassigned";
}

export default function DayRosterDetailPanel({
  snapshot = null,
  canEdit = false,
  unitOptions = [],
  onUpdateApparatus,
}) {
  if (!snapshot) {
    return <p className="auth-help">Select a day on the calendar or week roster to view scheduled personnel and vacancies.</p>;
  }

  const { grouped, unassigned } = snapshot.apparatusGroups || { grouped: [], unassigned: [] };
  const openVacancies = snapshot.openVacancies || [];

  return (
    <section className="day-roster-detail">
      <header className="day-roster-detail-header">
        <div>
          <h3>{snapshot.weekday}, {snapshot.date} · {snapshot.shift}</h3>
          <p>
            {snapshot.coverage?.staffed || 0} on duty
            {snapshot.coverage?.leave ? ` · ${snapshot.coverage.leave} on leave` : ""}
            {openVacancies.length ? ` · ${openVacancies.length} open vacancy${openVacancies.length === 1 ? "" : "ies"}` : " · fully staffed"}
          </p>
        </div>
        <span className={`badge badge-${snapshot.status === "Deficit" ? "critical" : "success"}`}>
          {snapshot.status === "Deficit" ? "Staffing deficit" : "Staffing OK"}
        </span>
      </header>

      {openVacancies.length > 0 && (
        <section className="day-roster-vacancies">
          <h4><AlertTriangle size={14} /> Open vacancies</h4>
          <ul>
            {openVacancies.map((vacancy) => (
              <li key={vacancy.id} className="day-roster-vacancy-item">
                <strong>{vacancy.label}</strong>
                <span>{vacancy.type === "shift" ? "Shift-wide coverage needed" : `${vacancy.apparatus} needs crew`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="day-roster-detail-grid">
        {grouped.map(({ unit, crew }) => {
          const onDuty = crew.filter((member) => member.status !== "Leave");
          const onLeave = crew.filter((member) => member.status === "Leave");
          const unitVacancies = (snapshot.apparatusVacancies || []).filter((vacancy) => vacancy.apparatus === unit);

          return (
            <article key={unit} className="day-roster-unit-card">
              <header>
                <div>
                  <Truck size={14} />
                  <strong>{unit}</strong>
                </div>
                <span className="schedule-roster-stat"><Users size={12} /> {onDuty.length} assigned</span>
              </header>

              {onDuty.length === 0 && !onLeave.length ? (
                <p className="apparatus-roster-empty">No crew assigned</p>
              ) : (
                <ul>
                  {onDuty.map((member) => (
                    <li key={member.id}>
                      <div>
                        <strong>{member.name}</strong>
                        <span>{member.rank} · {member.position}</span>
                      </div>
                      {canEdit && onUpdateApparatus ? (
                        <select
                          value={memberAssignmentValue(member)}
                          onChange={(event) => onUpdateApparatus(member.id, event.target.value)}
                        >
                          {unitOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`badge badge-${statusTone(member.status, member.tradeLabel)}`}>
                          {memberStatusLabel(member)}
                        </span>
                      )}
                    </li>
                  ))}
                  {onLeave.map((member) => (
                    <li key={member.id} className="day-roster-leave">
                      <div>
                        <strong>{member.name}</strong>
                        <span>{member.rank} · {member.leaveLabel || "on leave"}</span>
                      </div>
                      {canEdit && onUpdateApparatus ? (
                        <select
                          value={memberAssignmentValue(member)}
                          onChange={(event) => onUpdateApparatus(member.id, event.target.value)}
                        >
                          {unitOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge badge-warning">{member.leaveLabel || "Leave"}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {unitVacancies.length > 0 && (
                <div className="day-roster-unit-vacancies">
                  {unitVacancies.map((vacancy) => (
                    <span key={vacancy.id} className="badge badge-critical">
                      Open: {vacancy.position}
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {unassigned?.length > 0 && (
        <section className="apparatus-roster-unassigned">
          <h4>Unassigned / alternate duty</h4>
          <ul>
            {unassigned.map((member) => (
              <li key={member.id}>
                <strong>{member.name}</strong>
                <span>{member.rank} · {member.position}</span>
                {canEdit && onUpdateApparatus ? (
                  <select
                    value={memberAssignmentValue(member)}
                    onChange={(event) => onUpdateApparatus(member.id, event.target.value)}
                  >
                    {unitOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`badge badge-${statusTone(member.status, member.leaveLabel)}`}>
                    {memberStatusLabel(member)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
