import { useMemo, useState } from "react";
import { Check, Clock3, X } from "lucide-react";
import { Badge, Panel, Modal } from "../shell/ui.jsx";
import { getPersonDisplayName } from "../../lib/personnelSchema.js";
import { uniqueRecordId } from "../../lib/recordIds.js";

/**
 * Overtime coverage: post a real open seat from the selected day as an overtime
 * offer, then assign a member to it (which puts them on that day's roster).
 */
export default function OvertimeOffersPanel({
  offers = [],
  setOffers,
  openVacancies = [],
  dutyShift = "",
  personnel = [],
  unitOptions = [],
  canEdit = false,
  onAssign,
  onMessage,
}) {
  const [creating, setCreating] = useState(false);
  const [assigningId, setAssigningId] = useState("");
  const [personId, setPersonId] = useState("");
  const [unit, setUnit] = useState("");
  const assigningOffer = offers.find((o) => o.id === assigningId) || null;

  const offDuty = useMemo(() => personnel
    .filter((p) => !/inactive|separated|retired/i.test(p.status || ""))
    .filter((p) => !dutyShift || String(p.shift || "").trim() !== String(dutyShift).trim())
    .sort((a, b) => getPersonDisplayName(a).localeCompare(getPersonDisplayName(b))), [personnel, dutyShift]);

  const posted = new Set(offers.filter((o) => o.status !== "Cancelled").map((o) => o.vacancyId));
  const unposted = openVacancies.filter((v) => !posted.has(v.id));
  const visible = offers.filter((o) => o.status !== "Cancelled");

  function post(vacancy) {
    setOffers((current) => [{
      id: uniqueRecordId("OT"),
      vacancyId: vacancy.id,
      dayId: vacancy.dayId,
      date: vacancy.date || vacancy.dayId,
      shift: vacancy.shift,
      apparatus: vacancy.apparatus || "",
      position: vacancy.position && vacancy.position !== "Any" ? vacancy.position : (vacancy.label || "Any position"),
      status: "Open",
      applicants: offDuty.length,
      createdAt: new Date().toISOString(),
    }, ...current]);
    onMessage?.(`Overtime posted: ${vacancy.label || vacancy.position} on ${vacancy.date || vacancy.dayId}`);
    setCreating(false);
  }

  function cancel(offer) {
    setOffers((current) => current.map((o) => (o.id === offer.id ? { ...o, status: "Cancelled", cancelledAt: new Date().toISOString() } : o)));
  }

  function assign() {
    const offer = offers.find((o) => o.id === assigningId);
    const person = personnel.find((p) => p.id === personId);
    if (!offer || !person) return;
    const ok = onAssign?.(person, { ...offer, apparatus: offer.apparatus || unit });
    if (ok === false) return;
    setOffers((current) => current.map((o) => (o.id === offer.id ? {
      ...o, apparatus: o.apparatus || unit, status: "Assigned", assignedPersonnelId: person.id, assignedName: getPersonDisplayName(person), assignedAt: new Date().toISOString(),
    } : o)));
    setAssigningId("");
    setPersonId("");
    setUnit("");
  }

  return (
    <Panel
      title="Overtime Coverage"
      icon={Clock3}
      action={canEdit ? <button type="button" className="text-button" onClick={() => setCreating(true)}>Create vacancy</button> : null}
    >
      {visible.length ? (
        <div className="overtime-grid">
          {visible.map((offer) => (
            <div key={offer.id} className="overtime-card">
              <div><strong>{offer.date} - {offer.shift}</strong><span>{[offer.apparatus, offer.position].filter(Boolean).join(" · ")}</span></div>
              <Badge>{offer.status}</Badge>
              <small>{offer.status === "Assigned" ? `Assigned to ${offer.assignedName}` : `${offer.applicants ?? 0} off-duty members`}</small>
              {canEdit && offer.status !== "Assigned" ? (
                <div className="inline-actions">
                  <button type="button" className="row-action" onClick={() => setAssigningId(offer.id)}>Assign</button>
                  <button type="button" className="row-action" onClick={() => cancel(offer)}>Cancel</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-table">No overtime posted. {canEdit ? "Use “Create vacancy” to post an open seat from the selected day." : ""}</p>
      )}

      {creating ? (
        <Modal title="Post an open seat for overtime" onClose={() => setCreating(false)}>
          {unposted.length ? (
            <div className="overtime-vacancy-list">
              {unposted.map((v) => (
                <button key={v.id} type="button" className="overtime-vacancy-option" onClick={() => post(v)}>
                  <strong>{v.label || v.position}</strong>
                  <span>{[v.date || v.dayId, v.shift, v.apparatus].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          ) : <p className="empty-table">The selected day has no open seats. Pick a day with a staffing deficit on the calendar.</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreating(false)}><X size={14} /> Close</button></div>
        </Modal>
      ) : null}

      {assigningId ? (
        <Modal title="Assign overtime" onClose={() => setAssigningId("")}>
          <div className="workflow-form">
            <label className="wide-field"><span>Member</span>
              <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">Choose an off-duty member</option>
                {offDuty.map((p) => <option key={p.id} value={p.id}>{getPersonDisplayName(p)}{p.shift ? ` (${p.shift})` : ""}{p.rank ? ` · ${p.rank}` : ""}</option>)}
              </select>
            </label>
            {assigningOffer && !assigningOffer.apparatus ? (
              <label className="wide-field"><span>Unit</span>
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="">Choose the unit they'll ride on</option>
                  {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setAssigningId("")}>Cancel</button>
            <button type="button" className="primary-button" disabled={!personId || (assigningOffer && !assigningOffer.apparatus && !unit)} onClick={assign}><Check size={14} /> Assign and add to roster</button>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}
