import { useMemo, useState } from "react";
import { Check, MessageSquare } from "lucide-react";
import {
  buildVacancyPickupRecord,
  hasExistingPickupRequest,
  vacancyPickupStatusDetail,
} from "../../lib/vacancyPickupWorkflow.js";

export default function VacancyPickupPanel({
  person,
  personnel = [],
  vacancyDays = [],
  pickupRequests = [],
  onSubmitPickup,
  canSubmit = true,
  rotation = null,
}) {
  const [selectedVacancyId, setSelectedVacancyId] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const allVacancies = useMemo(
    () => vacancyDays.flatMap((day) => (day.vacancies || []).map((vacancy) => ({ ...vacancy, dayLabel: `${day.weekday} ${day.date}` }))),
    [vacancyDays]
  );

  const selectedVacancy = allVacancies.find((vacancy) => vacancy.id === selectedVacancyId) || null;
  const myPickups = useMemo(
    () => pickupRequests.filter((item) => item.personnelId === person?.id),
    [pickupRequests, person?.id]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) {
      setFeedback("Your role cannot submit vacancy pickup requests.");
      return;
    }
    if (!person?.id) {
      setFeedback("Link your user account to a personnel profile before requesting pickup.");
      return;
    }
    if (!selectedVacancy) {
      setFeedback("Select an open vacancy to request pickup.");
      return;
    }
    if (hasExistingPickupRequest(pickupRequests, person, selectedVacancy)) {
      setFeedback("You already have a pending request for this vacancy.");
      return;
    }

    const record = buildVacancyPickupRecord({
      person,
      personnel,
      vacancy: selectedVacancy,
      message,
      existingPickups: pickupRequests,
      rotation,
    });

    setSubmitting(true);
    try {
      await onSubmitPickup?.(record);
      setFeedback(`Pickup request sent to ${record.assignedBattalionChief}.`);
      setSelectedVacancyId("");
      setMessage("");
    } catch (error) {
      console.error("Failed to submit vacancy pickup", error);
      setFeedback("Could not submit pickup request. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!person) {
    return <p className="auth-help">No personnel profile linked. Ask an admin to link your account in System Admin → Users.</p>;
  }

  return (
    <section className="vacancy-pickup-panel">
      <p className="auth-help">
        Open shifts on <strong>opposite platoons</strong> (not your assigned shift) are listed below.
        Select a vacancy, add an optional message, and submit — the Battalion Chief for that shift
        will be notified to approve your pickup request.
      </p>

      {feedback ? <div className="success-banner">{feedback}</div> : null}

      {!allVacancies.length ? (
        <p className="auth-help">No open shifts on opposite platoons in the next several weeks.</p>
      ) : (
        <form className="vacancy-pickup-form" onSubmit={handleSubmit}>
          <label>
            <span>Open vacancy</span>
            <select
              value={selectedVacancyId}
              onChange={(event) => setSelectedVacancyId(event.target.value)}
              required
            >
              <option value="">Select a vacancy…</option>
              {vacancyDays.map((day) => (
                <optgroup key={day.id} label={`${day.weekday} ${day.date} · ${day.shift}`}>
                  {(day.vacancies || []).map((vacancy) => (
                    <option
                      key={vacancy.id}
                      value={vacancy.id}
                      disabled={hasExistingPickupRequest(pickupRequests, person, vacancy)}
                    >
                      {vacancy.label}
                      {hasExistingPickupRequest(pickupRequests, person, vacancy) ? " (requested)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {selectedVacancy ? (
            <div className="vacancy-pickup-preview">
              <strong>{selectedVacancy.dayLabel || selectedVacancy.date}</strong>
              <span>{selectedVacancy.shift} · {selectedVacancy.label}</span>
              <span>Notifies {selectedVacancy.shift} Battalion Chief for approval.</span>
            </div>
          ) : null}

          <label>
            <span>Message to Battalion Chief</span>
            <textarea
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Example: Available for Engine 1 coverage on this shift."
            />
          </label>

          <button type="submit" className="primary-button" disabled={submitting || !canSubmit}>
            <Check size={14} /> {submitting ? "Sending..." : "Request pickup"}
          </button>
        </form>
      )}

      {myPickups.length > 0 && (
        <section className="vacancy-pickup-history">
          <h4><MessageSquare size={14} /> Your pickup requests</h4>
          <div className="request-list">
            {myPickups.map((item) => (
              <div className="request-row" key={item.id}>
                <div>
                  <strong>{item.vacancyLabel}</strong>
                  <span>{item.date} · {item.shift}</span>
                  {item.message ? <small>{item.message}</small> : null}
                </div>
                <span className="badge">{vacancyPickupStatusDetail(item)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
