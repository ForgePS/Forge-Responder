import { useMemo, useState } from "react";
import { CirclePlus } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Badge, EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, Section, Table, todayIso } from "./TrainingUi.jsx";
import { reservationProblems } from "../../lib/training/trainingScheduling.js";
import { saveTrainingDoc, TRAINING_COLLECTIONS as C } from "../../lib/training/trainingService.js";
import { friendlyError } from "../../lib/friendlyError.js";

export const RESOURCE_KINDS = ["Training ground", "Burn building", "Drill tower", "Classroom", "Simulator", "Manikin", "Prop", "Apparatus", "Equipment", "Vehicle", "Other"];
const STATUS = { available: ["Available", "success"], maintenance: ["Maintenance", "warning"], out_of_service: ["Out of service", "critical"], retired: ["Retired", "neutral"] };

function ResourceEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const [r, setR] = useState(() => ({ name: "", kind: RESOURCE_KINDS[0], location: "", capacity: "", status: "available", inspectionDue: "", lastInspected: "", notes: "", ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p) => setR((x) => ({ ...x, ...p }));
  async function save() {
    if (!r.name.trim()) { setError("Name the resource."); return; }
    setBusy(true);
    try { await saveTrainingDoc(t.departmentId, C.resources, { ...r, capacity: Number(r.capacity) || 0 }, t.actor, "RES"); onSaved(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title={initial?.id ? `Edit ${r.name}` : "Add facility or resource"} onClose={onClose}>
      <ErrorNote error={error} />
      <div className="trn-grid">
        <Field label="Name" wide><input value={r.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Type"><select value={r.kind} onChange={(e) => set({ kind: e.target.value })}>{RESOURCE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Status"><select value={r.status} onChange={(e) => set({ status: e.target.value })}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Location"><input value={r.location} onChange={(e) => set({ location: e.target.value })} /></Field>
        <Field label="Capacity (people)"><input type="number" min="0" value={r.capacity} onChange={(e) => set({ capacity: e.target.value })} /></Field>
        <Field label="Last inspected"><input type="date" value={r.lastInspected} onChange={(e) => set({ lastInspected: e.target.value })} /></Field>
        <Field label="Next inspection due" hint="Bookings after this date are flagged"><input type="date" value={r.inspectionDue} onChange={(e) => set({ inspectionDue: e.target.value })} /></Field>
        <Field label="Notes" wide><textarea rows={2} value={r.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
      <ModalActions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}

function ReserveForm({ resource, onClose, onSaved }) {
  const t = useTraining();
  const [slot, setSlot] = useState({ title: "", date: todayIso(), startTime: "08:00", endTime: "12:00" });
  const [error, setError] = useState("");
  const problems = reservationProblems(slot, [resource.id], { resources: t.resources, reservations: t.reservations });
  const blocking = problems.filter((p) => p.kind !== "inspection");
  async function save() {
    if (!slot.title.trim()) { setError("Say what the reservation is for."); return; }
    if (blocking.length) { setError(blocking.map((p) => p.message).join(" ")); return; }
    try { await saveTrainingDoc(t.departmentId, C.reservations, { ...slot, resourceId: resource.id, status: "reserved", reservedByName: t.actor.name }, t.actor, "RSV"); onSaved(); } catch (e) { setError(friendlyError(e)); }
  }
  return (
    <Modal title={`Reserve ${resource.name}`} onClose={onClose}>
      <ErrorNote error={error} />
      <div className="trn-grid">
        <Field label="Purpose" wide><input value={slot.title} onChange={(e) => setSlot({ ...slot, title: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} /></Field>
        <Field label="Start"><input type="time" value={slot.startTime} onChange={(e) => setSlot({ ...slot, startTime: e.target.value })} /></Field>
        <Field label="End"><input type="time" value={slot.endTime} onChange={(e) => setSlot({ ...slot, endTime: e.target.value })} /></Field>
      </div>
      {problems.length ? <ul className="trn-callout warning">{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul> : <p className="trn-callout success">No conflicts.</p>}
      <ModalActions onCancel={onClose} onSave={save} saveLabel="Reserve" disabled={Boolean(blocking.length)} />
    </Modal>
  );
}

export default function TrainingResources() {
  const t = useTraining();
  const [editing, setEditing] = useState(null);
  const [reserving, setReserving] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const today = todayIso();
  const canManage = t.flags.canConfigure || t.flags.canApprove;
  const upcoming = useMemo(() => t.reservations.filter((r) => r.status !== "cancelled" && r.date >= today).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)), [t.reservations, today]);
  const nameOf = (id) => t.resources.find((r) => r.id === id)?.name || "Removed resource";
  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <ErrorNote error={error} onClose={() => setError("")} />
      <div className="trn-toolbar"><span className="trn-muted">Training grounds, burn buildings, classrooms, simulators, props and equipment. Sessions reserve these automatically; conflicts are blocked.</span>
        {canManage ? <button type="button" className="primary-button" onClick={() => setEditing({})}><CirclePlus size={14} /> Add resource</button> : null}</div>
      {t.resources.length ? (
        <Section title="Facilities & resources">
          <Table rows={t.resources.filter((r) => r.status !== "retired")}
            columns={[{ key: "name", label: "Name" }, { key: "kind", label: "Type" }, { key: "location", label: "Location" }, { key: "capacity", label: "Capacity", render: (r) => r.capacity || "—" },
              { key: "status", label: "Status", render: (r) => <Badge tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] || r.status}</Badge> },
              { key: "inspectionDue", label: "Inspection due", render: (r) => (r.inspectionDue ? <span className={r.inspectionDue < today ? "trn-tone-critical" : ""}>{r.inspectionDue}</span> : "—") },
              { key: "a", label: "", render: (r) => <div className="trn-actions">{t.flags.canEdit && r.status === "available" ? <button type="button" className="secondary-button" onClick={() => setReserving(r)}>Reserve</button> : null}{canManage ? <button type="button" className="text-button" onClick={() => setEditing(r)}>Edit</button> : null}</div> }]} />
        </Section>
      ) : <EmptyState title="No facilities or resources">Add your training ground, burn building, classrooms and equipment to reserve them for sessions.</EmptyState>}
      <Section title="Upcoming reservations">
        <Table rows={upcoming} empty="No upcoming reservations."
          columns={[{ key: "date", label: "Date" }, { key: "time", label: "Time", render: (r) => `${r.startTime || ""}–${r.endTime || ""}` }, { key: "resourceId", label: "Resource", render: (r) => nameOf(r.resourceId) }, { key: "title", label: "For" }, { key: "sessionId", label: "Session", render: (r) => (r.sessionId ? "Calendar" : "Direct") },
            { key: "a", label: "", render: (r) => (canManage || r.createdBy === t.actor.uid) && !r.sessionId ? <button type="button" className="text-button" onClick={() => saveTrainingDoc(t.departmentId, C.reservations, { ...r, status: "cancelled" }, t.actor).catch((e) => setError(friendlyError(e)))}>Cancel</button> : null }]} />
      </Section>
      {editing ? <ResourceEditor initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice("Resource saved."); }} /> : null}
      {reserving ? <ReserveForm resource={reserving} onClose={() => setReserving(null)} onSaved={() => { setReserving(null); setNotice("Reserved."); }} /> : null}
    </div>
  );
}
