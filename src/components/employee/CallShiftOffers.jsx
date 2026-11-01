import { BellRing, Check, X } from "lucide-react";
import { callShiftResponseFor, isAssignedToCallShift, isCallShiftOpenFor, withCallShiftResponse } from "../../lib/callShiftWorkflow.js";
import { getPersonDisplayName } from "../../lib/personnelSchema.js";

/** Employee Portal: shift broadcasts sent to me, with Accept / Decline. */
export default function CallShiftOffers({ callShifts = [], setCallShifts, person, onResponded }) {
  const personnelId = person?.id || "";
  const mine = (Array.isArray(callShifts) ? callShifts : [])
    .filter((record) => isCallShiftOpenFor(record, personnelId) || isAssignedToCallShift(record, personnelId))
    .sort((a, b) => String(a.dayId || "").localeCompare(String(b.dayId || "")));

  if (!personnelId) return null;

  function respond(record, response) {
    if (!setCallShifts) return;
    setCallShifts((current) => current.map((item) => (
      item.id === record.id ? withCallShiftResponse(item, { personnelId, name: getPersonDisplayName(person) || person.name || "", response }) : item
    )));
    onResponded?.(record, response);
  }

  return (
    <section className="panel call-shift-offers">
      <header className="panel-header"><strong><BellRing size={15} /> Shifts you've been asked to cover</strong></header>
      <div className="panel-body request-list">
        {mine.length ? mine.map((record) => {
          const answer = callShiftResponseFor(record, personnelId);
          const assignedToMe = isAssignedToCallShift(record, personnelId);
          return (
            <div className="request-row" key={record.id}>
              <div>
                <strong>{record.dateLabel || record.dayId} · {record.shift}</strong>
                <span>{[record.position !== "Any" ? record.position : "", record.apparatus, record.startTime && record.endTime ? `${record.startTime}–${record.endTime}` : ""].filter(Boolean).join(" · ") || "Any position"}</span>
                {record.message ? <small>{record.message}</small> : null}
                <small>
                  {assignedToMe ? "You're on the roster for this shift." : answer ? `You ${answer.response === "accepted" ? "accepted" : "declined"}. ${answer.response === "accepted" ? "Your supervisor will confirm." : ""}` : "Can you cover it?"}
                </small>
              </div>
              {assignedToMe ? <span className="badge badge-success">Assigned</span> : setCallShifts ? (
                <div className="inline-actions">
                  <button type="button" className={answer?.response === "accepted" ? "active" : ""} onClick={() => respond(record, "accepted")}><Check size={13} /> Accept</button>
                  <button type="button" className={answer?.response === "declined" ? "active" : ""} onClick={() => respond(record, "declined")}><X size={13} /> Decline</button>
                </div>
              ) : null}
            </div>
          );
        }) : <p className="auth-help">No shift requests for you right now.</p>}
      </div>
    </section>
  );
}
