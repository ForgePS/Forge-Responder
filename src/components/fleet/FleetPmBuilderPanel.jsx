import { useEffect, useState } from "react";
import { CalendarClock, CirclePlus, Save } from "lucide-react";
import {
  ensurePmProgramsSeeded,
  getPmTriggerTypes,
  savePmProgram,
} from "../../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * PM program builder for Fleet Configuration Studio.
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
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const triggers = getPmTriggerTypes();

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const next = await ensurePmProgramsSeeded(departmentId, actor);
      setPrograms(next);
      setSelectedId((current) => current || next[0]?.id || "");
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load PM programs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    const selected = programs.find((row) => row.id === selectedId) || null;
    setDraft(selected ? {
      ...selected,
      tasksText: (selected.tasks || []).map((task) => task.description).join("\n"),
    } : null);
  }, [programs, selectedId]);

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading PM programs...</p></div>;
  }

  return (
    <section className="fleet-pm-builder">
      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><CalendarClock size={15} /><strong>PM programs</strong></div>
            <button
              className="text-button"
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const saved = await savePmProgram(departmentId, {
                    name: "New PM program",
                    triggerType: "calendar_months",
                    intervalValue: 12,
                    dueSoonValue: 30,
                    graceValue: 7,
                    priority: "medium",
                    autoCreateWorkOrder: true,
                    tasks: [{ description: "Inspect and service" }],
                    active: true,
                  }, actor);
                  setPrograms((current) => [saved, ...current]);
                  setSelectedId(saved.id);
                  onMessage?.("PM program created.");
                } catch (createError) {
                  onError?.(createError?.message || "Unable to create program.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <CirclePlus size={14} /> Add program
            </button>
          </header>
          <div className="panel-body">
            <div className="personnel-list">
              {programs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === selectedId ? "person-row selected" : "person-row"}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.triggerType} · every {item.intervalValue}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {draft ? (
          <section className="panel">
            <header>
              <div><strong>Edit program</strong></div>
              <button
                className="primary-button"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const saved = await savePmProgram(departmentId, {
                      ...draft,
                      tasks: String(draft.tasksText || "")
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((description, index) => ({ id: `task-${index + 1}`, description })),
                    }, actor);
                    setPrograms((current) => (
                      [saved, ...current.filter((row) => row.id !== saved.id)]
                        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                    ));
                    onMessage?.("PM program saved.");
                  } catch (saveError) {
                    onError?.(saveError?.message || "Unable to save program.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Save size={14} /> Save
              </button>
            </header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name">
                <input value={draft.name || ""} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Trigger">
                <select
                  value={draft.triggerType || "calendar_months"}
                  onChange={(e) => setDraft((c) => ({ ...c, triggerType: e.target.value }))}
                >
                  {triggers.map((row) => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Interval">
                <input
                  type="number"
                  min="1"
                  value={draft.intervalValue ?? 12}
                  onChange={(e) => setDraft((c) => ({ ...c, intervalValue: Number(e.target.value) || 1 }))}
                />
              </Field>
              <Field label="Due-soon window">
                <input
                  type="number"
                  min="0"
                  value={draft.dueSoonValue ?? 0}
                  onChange={(e) => setDraft((c) => ({ ...c, dueSoonValue: Number(e.target.value) || 0 }))}
                />
              </Field>
              <Field label="Grace">
                <input
                  type="number"
                  min="0"
                  value={draft.graceValue ?? 0}
                  onChange={(e) => setDraft((c) => ({ ...c, graceValue: Number(e.target.value) || 0 }))}
                />
              </Field>
              <Field label="Priority">
                <select
                  value={draft.priority || "medium"}
                  onChange={(e) => setDraft((c) => ({ ...c, priority: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
              <Field label="Estimated hours">
                <input
                  type="number"
                  min="0"
                  value={draft.estimatedHours ?? 0}
                  onChange={(e) => setDraft((c) => ({ ...c, estimatedHours: Number(e.target.value) || 0 }))}
                />
              </Field>
              <Field label="Description">
                <textarea
                  rows={2}
                  value={draft.description || ""}
                  onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))}
                />
              </Field>
              <Field label="Tasks (one per line)">
                <textarea
                  rows={4}
                  value={draft.tasksText || ""}
                  onChange={(e) => setDraft((c) => ({ ...c, tasksText: e.target.value }))}
                />
              </Field>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={draft.autoCreateWorkOrder !== false}
                  onChange={(e) => setDraft((c) => ({ ...c, autoCreateWorkOrder: e.target.checked }))}
                />
                Auto-create work order when due
              </label>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={draft.active !== false}
                  onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
