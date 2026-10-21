import { useEffect, useState } from "react";
import { CirclePlus, ClipboardCheck, Save } from "lucide-react";
import {
  ensureTestProgramsSeeded,
  saveTestProgram,
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
 * Testing program builder for Fleet Configuration Studio.
 */
export default function FleetTestProgramPanel({
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

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const next = await ensureTestProgramsSeeded(departmentId, actor);
      setPrograms(next);
      setSelectedId((current) => current || next[0]?.id || "");
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load test programs.");
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
    setDraft(selected ? { ...selected } : null);
  }, [programs, selectedId]);

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading test programs...</p></div>;
  }

  return (
    <section className="fleet-test-program-config">
      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><ClipboardCheck size={15} /><strong>Test programs</strong></div>
            <button
              className="text-button"
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const saved = await saveTestProgram(departmentId, {
                    name: "New test program",
                    programType: "custom",
                    standardReference: "",
                    intervalMonths: 12,
                    dueSoonDays: 30,
                    createDefectOnFail: true,
                    certificateRequired: true,
                    active: true,
                  }, actor);
                  setPrograms((current) => [saved, ...current]);
                  setSelectedId(saved.id);
                  onMessage?.("Test program created.");
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
                    <small>{item.programType} · {item.standardReference || "No standard"}</small>
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
                    const saved = await saveTestProgram(departmentId, draft, actor);
                    setPrograms((current) => (
                      [saved, ...current.filter((row) => row.id !== saved.id)]
                        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                    ));
                    onMessage?.("Test program saved.");
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
              <Field label="Type">
                <select
                  value={draft.programType || "custom"}
                  onChange={(e) => setDraft((c) => ({ ...c, programType: e.target.value }))}
                >
                  <option value="hose">Hose</option>
                  <option value="pump_performance">Pump performance</option>
                  <option value="ground_ladder">Ground ladder</option>
                  <option value="aerial_device">Aerial device</option>
                  <option value="generator">Generator</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <Field label="Standard / reference">
                <input
                  value={draft.standardReference || ""}
                  onChange={(e) => setDraft((c) => ({ ...c, standardReference: e.target.value }))}
                />
              </Field>
              <Field label="Edition">
                <input value={draft.edition || ""} onChange={(e) => setDraft((c) => ({ ...c, edition: e.target.value }))} />
              </Field>
              <Field label="Interval (months)">
                <input
                  type="number"
                  min="1"
                  value={draft.intervalMonths ?? 12}
                  onChange={(e) => setDraft((c) => ({ ...c, intervalMonths: Number(e.target.value) || 12 }))}
                />
              </Field>
              <Field label="Due-soon days">
                <input
                  type="number"
                  min="0"
                  value={draft.dueSoonDays ?? 30}
                  onChange={(e) => setDraft((c) => ({ ...c, dueSoonDays: Number(e.target.value) || 0 }))}
                />
              </Field>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={draft.createDefectOnFail !== false}
                  onChange={(e) => setDraft((c) => ({ ...c, createDefectOnFail: e.target.checked }))}
                />
                Create defect on fail
              </label>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(draft.blockReturnToServiceOnFail)}
                  onChange={(e) => setDraft((c) => ({ ...c, blockReturnToServiceOnFail: e.target.checked }))}
                />
                Recommend OOS on fail
              </label>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={draft.certificateRequired !== false}
                  onChange={(e) => setDraft((c) => ({ ...c, certificateRequired: e.target.checked }))}
                />
                Certificate required
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
