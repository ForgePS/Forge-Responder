import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CirclePlus, Save, Trash2, X } from "lucide-react";
import {
  applyPmProgramsToFleet,
  ensureFleetClassesSeeded,
  ensurePmProgramsSeeded,
  listFleetShops,
  listFleetVendors,
  listPmSchedules,
  removePmProgram,
  savePmProgram,
} from "../../lib/fleet/index.js";
import {
  describeAmount,
  describeInterval,
  triggerOptions,
  triggerWording,
  validatePmDraft,
} from "../../lib/fleet/pmProgramLogic.js";
import "../../styles/fleet-config-pm.css";

const PRIORITIES = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "critical", label: "Critical" },
];

const NEW_ID = "__new__";

function Field({ label, help, unit, wide = false, children }) {
  return (
    <label className={`pm-field${wide ? " wide" : ""}`}>
      <span className="pm-field-label">{label}</span>
      {unit ? <span className="pm-input-unit">{children}<em>{unit}</em></span> : children}
      {help ? <small className="pm-help">{help}</small> : null}
    </label>
  );
}

function toDraft(program) {
  return {
    ...program,
    applicableClassIds: [...(program.applicableClassIds || [])],
    tasksText: (program.tasks || []).map((task) => task.description).join("\n"),
  };
}

function blankDraft() {
  return {
    id: "",
    name: "",
    description: "",
    triggerType: "calendar_months",
    intervalValue: 12,
    dueSoonValue: 30,
    graceValue: 7,
    priority: "medium",
    estimatedHours: 0,
    defaultShopId: "",
    defaultVendorId: "",
    autoCreateWorkOrder: true,
    applicableClassIds: [],
    tasksText: "",
    active: true,
  };
}

function draftToRecord(draft) {
  const { tasksText, updatedSchedules, limitToClasses, ...rest } = draft;
  void updatedSchedules;
  void limitToClasses;
  return {
    ...rest,
    name: String(rest.name || "").trim(),
    intervalValue: Number(rest.intervalValue) || 0,
    dueSoonValue: Number(rest.dueSoonValue) || 0,
    graceValue: Number(rest.graceValue) || 0,
    estimatedHours: Number(rest.estimatedHours) || 0,
    tasks: String(tasksText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((description, index) => ({ id: `task-${index + 1}`, description })),
  };
}

function snapshot(draft) {
  return draft ? JSON.stringify(draftToRecord(draft)) : "";
}

function sortByName(rows) {
  return [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * Maintenance Schedules (preventive maintenance programs) for Fleet Configuration Studio.
 */
export default function FleetPmBuilderPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [shops, setShops] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [unitCounts, setUnitCounts] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState("");

  const visiblePrograms = useMemo(() => programs.filter((row) => !row.archived), [programs]);
  const classNameById = useMemo(() => Object.fromEntries(classes.map((row) => [row.id, row.name])), [classes]);
  const dirty = Boolean(draft) && snapshot(draft) !== baseline;
  const isNew = selectedId === NEW_ID;

  async function loadCounts() {
    const schedules = await listPmSchedules(departmentId, { openOnly: true }).catch(() => []);
    const counts = {};
    for (const row of schedules) counts[row.programId] = (counts[row.programId] || 0) + 1;
    setUnitCounts(counts);
  }

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [nextPrograms, nextClasses, nextShops, nextVendors] = await Promise.all([
        ensurePmProgramsSeeded(departmentId, actor),
        ensureFleetClassesSeeded(departmentId, actor).catch(() => []),
        listFleetShops(departmentId).catch(() => []),
        listFleetVendors(departmentId).catch(() => []),
      ]);
      setPrograms(nextPrograms);
      setClasses(nextClasses);
      setShops(nextShops);
      setVendors(nextVendors);
      const first = nextPrograms.find((row) => !row.archived);
      if (first) selectProgram(first);
      await loadCounts();
    } catch (loadError) {
      onError?.(loadError?.message || "Couldn't load maintenance schedules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  function selectProgram(program) {
    const next = toDraft(program);
    setSelectedId(program.id);
    setDraft(next);
    setBaseline(snapshot(next));
  }

  function confirmDiscard() {
    return !dirty || window.confirm("You have unsaved changes. Discard them?");
  }

  function startNew() {
    if (!confirmDiscard()) return;
    const next = blankDraft();
    setSelectedId(NEW_ID);
    setDraft(next);
    setBaseline("");
  }

  function cancelEdit() {
    if (!confirmDiscard()) return;
    const original = programs.find((row) => row.id === selectedId);
    if (original) selectProgram(original);
    else {
      const first = visiblePrograms[0];
      if (first) selectProgram(first);
      else { setSelectedId(""); setDraft(null); setBaseline(""); }
    }
  }

  function update(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function handleSave() {
    const record = draftToRecord(draft);
    const problem = draft.limitToClasses && !record.applicableClassIds.length
      ? "Pick at least one vehicle type, or choose “All vehicle types”."
      : validatePmDraft(record);
    if (problem) { onError?.(problem); return; }
    setSaving(true);
    try {
      const saved = await savePmProgram(departmentId, record, actor);
      let added = 0;
      if (saved.active) {
        // Put the schedule on any matching units that don't have it yet (never duplicates).
        added = (await applyPmProgramsToFleet(departmentId, { programIds: [saved.id] }, actor)).length;
      }
      setPrograms((current) => sortByName([saved, ...current.filter((row) => row.id !== saved.id)]));
      selectProgram(saved);
      await loadCounts();
      const parts = [`Saved "${saved.name}".`];
      if (saved.updatedSchedules) parts.push(`Updated ${saved.updatedSchedules} vehicle${saved.updatedSchedules === 1 ? "" : "s"} already on this schedule.`);
      if (added) parts.push(`Added it to ${added} more vehicle${added === 1 ? "" : "s"}.`);
      onMessage?.(parts.join(" "));
    } catch (saveError) {
      onError?.(saveError?.message || "Couldn't save the maintenance schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const count = unitCounts[draft.id] || 0;
    const unitsText = count
      ? `It will be taken off ${count} vehicle${count === 1 ? "" : "s"} and stop showing on the PM Forecast. `
      : "";
    const ok = window.confirm(
      `Remove "${draft.name}"?\n\n${unitsText}Past service history and any work orders already created are kept.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      const { turnedOff } = await removePmProgram(departmentId, draft.id, actor);
      const remaining = programs.map((row) => (row.id === draft.id ? { ...row, archived: true, active: false } : row));
      setPrograms(remaining);
      const next = remaining.find((row) => !row.archived);
      if (next) selectProgram(next);
      else { setSelectedId(""); setDraft(null); setBaseline(""); }
      await loadCounts();
      onMessage?.(`Removed "${draft.name}"${turnedOff ? ` and took it off ${turnedOff} vehicle${turnedOff === 1 ? "" : "s"}` : ""}.`);
    } catch (removeError) {
      onError?.(removeError?.message || "Couldn't remove the maintenance schedule.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading maintenance schedules...</p></div>;
  }

  const wording = draft ? triggerWording(draft.triggerType) : null;
  const activeClasses = classes.filter((row) => row.active || draft?.applicableClassIds?.includes(row.id));
  const shopOptions = shops.filter((row) => row.active || row.id === draft?.defaultShopId);
  const vendorOptions = vendors.filter((row) => row.active || row.id === draft?.defaultVendorId);
  const limitToClasses = Boolean(draft?.applicableClassIds?.length) || draft?.limitToClasses;

  function appliesToText(program) {
    const ids = program.applicableClassIds || [];
    if (!ids.length) return "All vehicle types";
    const names = ids.map((id) => classNameById[id]).filter(Boolean);
    if (!names.length) return "Selected vehicle types";
    return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more` : names.join(", ");
  }

  return (
    <section className="fleet-pm-builder">
      <p className="pm-intro">
        Maintenance schedules set up preventive maintenance: routine service that comes due by
        time, miles driven, or engine/pump hours. Each schedule is placed on every matching
        vehicle, and due service shows up on the PM Forecast.
      </p>
      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><CalendarClock size={15} /><strong>Maintenance schedules</strong></div>
            <button className="text-button" type="button" disabled={saving} onClick={startNew}>
              <CirclePlus size={14} /> Add schedule
            </button>
          </header>
          <div className="panel-body">
            <div className="personnel-list">
              {isNew ? (
                <button type="button" className="person-row selected">
                  <span>
                    <strong>{draft?.name?.trim() || "New schedule"}</strong>
                    <small>Not saved yet</small>
                  </span>
                </button>
              ) : null}
              {visiblePrograms.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === selectedId ? "person-row selected" : "person-row"}
                  onClick={() => {
                    if (item.id === selectedId || !confirmDiscard()) return;
                    selectProgram(item);
                  }}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {describeInterval(item)} · {appliesToText(item)}
                      {item.active ? ` · ${unitCounts[item.id] || 0} vehicle${unitCounts[item.id] === 1 ? "" : "s"}` : ""}
                    </small>
                  </span>
                  {!item.active ? <span className="badge">Turned off</span> : null}
                </button>
              ))}
              {!visiblePrograms.length && !isNew ? (
                <p className="pm-empty">No maintenance schedules yet. Use “Add schedule” to create one.</p>
              ) : null}
            </div>
          </div>
        </section>

        {draft ? (
          <section className="panel">
            <header>
              <div><strong>{isNew ? "New maintenance schedule" : "Edit maintenance schedule"}</strong></div>
              <div className="pm-header-actions">
                {dirty || isNew ? (
                  <button className="secondary-button" type="button" disabled={saving} onClick={cancelEdit}>
                    <X size={14} /> Cancel
                  </button>
                ) : null}
                <button className="primary-button" type="button" disabled={saving || (!dirty && !isNew)} onClick={handleSave}>
                  <Save size={14} /> {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </header>
            <div className="panel-body pm-editor">
              <div className="pm-grid">
                <Field label="Name" wide>
                  <input
                    value={draft.name || ""}
                    placeholder="e.g. Oil and filter change"
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </Field>
                <Field label="Description" wide>
                  <textarea rows={2} value={draft.description || ""} onChange={(e) => update({ description: e.target.value })} />
                </Field>
              </div>

              <fieldset className="pm-section">
                <legend>When is it due?</legend>
                <div className="pm-grid">
                  <Field label="Measured in">
                    <select value={draft.triggerType} onChange={(e) => update({ triggerType: e.target.value })}>
                      {triggerOptions(draft.triggerType).map((row) => (
                        <option key={row.id} value={row.id}>{row.label}</option>
                      ))}
                    </select>
                  </Field>
                  {draft.triggerType !== "manual" ? (
                    <Field label="How often" unit={wording.unit}>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={draft.intervalValue}
                        onChange={(e) => update({ intervalValue: e.target.value })}
                      />
                    </Field>
                  ) : null}
                  <Field
                    label="Warn ahead by"
                    unit={wording.warnUnit}
                    help={`Shows as "due soon" this far before it's due. 0 = no warning.`}
                  >
                    <input type="number" min="0" value={draft.dueSoonValue} onChange={(e) => update({ dueSoonValue: e.target.value })} />
                  </Field>
                  <Field
                    label="Overdue after"
                    unit={wording.warnUnit}
                    help={`Extra allowance past the due point before it's marked overdue.`}
                  >
                    <input type="number" min="0" value={draft.graceValue} onChange={(e) => update({ graceValue: e.target.value })} />
                  </Field>
                </div>
                <p className="pm-summary">
                  {describeInterval(draftToRecord(draft))}
                  {Number(draft.dueSoonValue) > 0 ? `, warn ${describeAmount(draft.dueSoonValue, wording.warnUnit)} ahead` : ""}
                  {Number(draft.graceValue) > 0 ? `, overdue ${describeAmount(draft.graceValue, wording.warnUnit)} after it's due` : ", overdue as soon as it's due"}.
                </p>
              </fieldset>

              <fieldset className="pm-section">
                <legend>Applies to</legend>
                <div className="pm-radio-row">
                  <label className="pm-check">
                    <input
                      type="radio"
                      name="pm-applies"
                      checked={!limitToClasses}
                      onChange={() => update({ applicableClassIds: [], limitToClasses: false })}
                    />
                    All vehicle types
                  </label>
                  <label className="pm-check">
                    <input
                      type="radio"
                      name="pm-applies"
                      checked={limitToClasses}
                      disabled={!activeClasses.length}
                      onChange={() => update({ limitToClasses: true })}
                    />
                    Only these vehicle types
                  </label>
                </div>
                {limitToClasses ? (
                  <div className="pm-check-grid">
                    {activeClasses.map((row) => (
                      <label key={row.id} className="pm-check">
                        <input
                          type="checkbox"
                          checked={draft.applicableClassIds.includes(row.id)}
                          onChange={(e) => update({
                            applicableClassIds: e.target.checked
                              ? [...draft.applicableClassIds, row.id]
                              : draft.applicableClassIds.filter((id) => id !== row.id),
                          })}
                        />
                        {row.name}{row.active ? "" : " (no longer used)"}
                      </label>
                    ))}
                  </div>
                ) : null}
                {limitToClasses && !draft.applicableClassIds.length ? (
                  <small className="pm-help pm-warn">Pick at least one vehicle type, or choose “All vehicle types”.</small>
                ) : null}
                {!activeClasses.length ? (
                  <small className="pm-help">No vehicle types are set up yet, so this applies to every vehicle.</small>
                ) : null}
              </fieldset>

              <fieldset className="pm-section">
                <legend>Work order</legend>
                <div className="pm-grid">
                  <Field label="Priority">
                    <select value={draft.priority || "medium"} onChange={(e) => update({ priority: e.target.value })}>
                      {PRIORITIES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Estimated labor" unit="hours" help="Total for the job; split across the tasks on the work order.">
                    <input type="number" min="0" step="0.25" value={draft.estimatedHours} onChange={(e) => update({ estimatedHours: e.target.value })} />
                  </Field>
                  <Field label="Usual shop">
                    <select value={draft.defaultShopId || ""} onChange={(e) => update({ defaultShopId: e.target.value })}>
                      <option value="">No default</option>
                      {shopOptions.map((row) => (
                        <option key={row.id} value={row.id}>{row.name}{row.active ? "" : " (inactive)"}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Usual vendor">
                    <select value={draft.defaultVendorId || ""} onChange={(e) => update({ defaultVendorId: e.target.value })}>
                      <option value="">No default</option>
                      {vendorOptions.map((row) => (
                        <option key={row.id} value={row.id}>{row.name}{row.active ? "" : " (inactive)"}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tasks (one per line)" wide help="These become the checklist on the work order.">
                    <textarea
                      rows={4}
                      value={draft.tasksText || ""}
                      placeholder={"Drain oil and replace filter\nCheck for leaks"}
                      onChange={(e) => update({ tasksText: e.target.value })}
                    />
                  </Field>
                </div>
                <label className="pm-check">
                  <input
                    type="checkbox"
                    checked={draft.autoCreateWorkOrder !== false}
                    onChange={(e) => update({ autoCreateWorkOrder: e.target.checked })}
                  />
                  Suggest a work order when due
                </label>
                <small className="pm-help">
                  When a vehicle comes due, it's included when someone presses “Create due work orders”
                  on the PM Forecast, so the work orders are made in one click. Work orders are not
                  created on their own.
                </small>
              </fieldset>

              <fieldset className="pm-section">
                <legend>Status</legend>
                <label className="pm-check">
                  <input type="checkbox" checked={draft.active !== false} onChange={(e) => update({ active: e.target.checked })} />
                  Turned on
                </label>
                <small className="pm-help">
                  Turn off to pause this schedule on every vehicle. Last service dates are kept, and it picks up again when turned back on.
                </small>
              </fieldset>

              {!isNew ? (
                <div className="pm-remove-row">
                  <button className="secondary-button danger-button" type="button" disabled={saving} onClick={handleRemove}>
                    <Trash2 size={14} /> Remove schedule
                  </button>
                  <small className="pm-help">
                    {unitCounts[draft.id]
                      ? `Currently on ${unitCounts[draft.id]} vehicle${unitCounts[draft.id] === 1 ? "" : "s"}. Saving changes updates them; their last service dates are kept.`
                      : "Not on any vehicles yet."}
                  </small>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
