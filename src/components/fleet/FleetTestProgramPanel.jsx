import { useEffect, useState } from "react";
import { CirclePlus, ClipboardCheck, Save, Trash2 } from "lucide-react";
import {
  ensureTestProgramsSeeded,
  removeTestProgram,
  saveTestProgram,
} from "../../lib/fleet/index.js";
import {
  TEST_PROGRAM_TYPES,
  byActiveThenName,
  newTestProgramDraft,
  testProgramTypeLabel,
} from "../../lib/fleet/configOpsLogic.js";
import "../../styles/fleet-config-ops.css";

const NEW_ID = "__new__";

function Field({ label, hint, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " fco-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint ? <small className="fco-hint">{hint}</small> : null}
    </label>
  );
}

function programSummary(item) {
  const parts = [testProgramTypeLabel(item.programType)];
  if (item.standardReference) parts.push(item.standardReference);
  parts.push(`every ${item.intervalMonths || 12} month${Number(item.intervalMonths) === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/**
 * Testing programs (hose, pump, ladder, aerial, generator...) for Configuration Studio.
 */
export default function FleetTestProgramPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);

  const isNew = selectedId === NEW_ID;
  const original = isNew ? null : programs.find((row) => row.id === selectedId) || null;
  const dirty = Boolean(draft) && (isNew || JSON.stringify(draft) !== JSON.stringify(original));

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    setLoadError("");
    try {
      const next = await ensureTestProgramsSeeded(departmentId, actor);
      setPrograms([...next].sort(byActiveThenName));
      setSelectedId((current) => current || next[0]?.id || "");
    } catch (err) {
      const message = err?.message || "Unable to load testing programs.";
      setLoadError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    if (selectedId === NEW_ID) return;
    const selected = programs.find((row) => row.id === selectedId) || null;
    setDraft(selected ? { ...selected } : null);
  }, [programs, selectedId]);

  function confirmLeave() {
    return !dirty || window.confirm("You have unsaved changes to this program. Discard them?");
  }

  function select(id) {
    if (id === selectedId || !confirmLeave()) return;
    setSelectedId(id);
  }

  function startNew() {
    if (!confirmLeave()) return;
    setSelectedId(NEW_ID);
    setDraft(newTestProgramDraft());
  }

  async function handleSave() {
    if (!draft) return;
    if (!String(draft.name || "").trim()) {
      onError?.("Give the program a name before saving.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveTestProgram(departmentId, { ...draft, name: draft.name.trim() }, actor);
      setPrograms((current) => [saved, ...current.filter((row) => row.id !== saved.id)].sort(byActiveThenName));
      setSelectedId(saved.id);
      setDraft({ ...saved });
      onMessage?.(isNew ? `Added "${saved.name}".` : `Saved "${saved.name}".`);
    } catch (err) {
      onError?.(err?.message || "Unable to save the program.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (isNew) {
      setSelectedId(programs[0]?.id || "");
      if (!programs.length) setDraft(null);
      return;
    }
    if (!original) return;
    if (!window.confirm(`Remove "${original.name}"? If tests have already been recorded under it, it will be turned off instead so that history is kept.`)) return;
    setSaving(true);
    try {
      const result = await removeTestProgram(departmentId, original.id, actor);
      if (result.mode === "delete") {
        const remaining = programs.filter((row) => row.id !== original.id);
        setPrograms(remaining);
        setSelectedId(remaining[0]?.id || "");
        if (!remaining.length) setDraft(null);
        onMessage?.(`Removed "${original.name}".`);
      } else {
        const updated = result.program || { ...original, active: false };
        setPrograms((current) => current.map((row) => (row.id === updated.id ? updated : row)).sort(byActiveThenName));
        setDraft({ ...updated });
        onMessage?.(result.testCount > 0
          ? `"${original.name}" has ${result.testCount} recorded test${result.testCount === 1 ? "" : "s"}, so it was turned off instead of deleted.`
          : `"${original.name}" is your only program, so it was turned off instead of deleted.`);
      }
    } catch (err) {
      onError?.(err?.message || "Unable to remove the program.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading testing programs...</p></div>;
  }

  if (loadError) {
    return (
      <section className="panel">
        <div className="panel-body fco-empty" role="alert">
          <strong>Testing programs couldn't be loaded.</strong>
          <span>{loadError}</span>
          <button className="secondary-button" type="button" onClick={reload}>Try again</button>
        </div>
      </section>
    );
  }

  const set = (patch) => setDraft((c) => ({ ...c, ...patch }));

  return (
    <section className="fleet-test-program-config">
      <p className="fco-intro">
        Each testing program sets how often a test is due, when it shows as due soon, and what happens
        when a unit fails. Test results are recorded against these programs.
      </p>
      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><ClipboardCheck size={15} /><strong>Testing programs</strong></div>
            <button className="text-button" type="button" disabled={saving} onClick={startNew}>
              <CirclePlus size={14} /> Add program
            </button>
          </header>
          <div className="panel-body">
            <div className="personnel-list">
              {isNew ? (
                <button type="button" className="person-row selected">
                  <span>
                    <strong>{draft?.name?.trim() || "New program"}<span className="fco-tag fco-tag-new">Not saved</span></strong>
                    <small>{testProgramTypeLabel(draft?.programType)}</small>
                  </span>
                </button>
              ) : null}
              {programs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${item.id === selectedId ? "person-row selected" : "person-row"}${item.active === false ? " fco-row-off" : ""}`}
                  onClick={() => select(item.id)}
                >
                  <span>
                    <strong>
                      {item.name}
                      {item.active === false ? <span className="fco-tag">Off</span> : null}
                    </strong>
                    <small>{programSummary(item)}</small>
                  </span>
                </button>
              ))}
              {!programs.length && !isNew ? (
                <div className="fco-empty">
                  <strong>No testing programs yet.</strong>
                  <span>Add one for each kind of test you track, such as annual hose or pump testing.</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {draft ? (
          <section className="panel">
            <header>
              <div><strong>{isNew ? "New program" : "Edit program"}</strong></div>
              <div className="fco-header-actions">
                <button className="secondary-button danger-button" type="button" disabled={saving} onClick={handleRemove}>
                  <Trash2 size={14} /> {isNew ? "Discard" : "Remove"}
                </button>
                <button className="primary-button" type="button" disabled={saving || !dirty} onClick={handleSave}>
                  <Save size={14} /> {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name">
                <input value={draft.name || ""} placeholder="e.g. Annual hose test" onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field
                label="What is tested"
                hint={isNew ? "This can't be changed after the program is saved." : "Fixed once saved, because recorded tests are filed by it."}
              >
                {isNew ? (
                  <select value={draft.programType || "custom"} onChange={(e) => set({ programType: e.target.value })}>
                    {TEST_PROGRAM_TYPES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                ) : (
                  <span className="fco-readonly">{testProgramTypeLabel(draft.programType)}</span>
                )}
              </Field>
              <Field label="Standard followed" hint="For example NFPA 1962 or your department SOP.">
                <input value={draft.standardReference || ""} onChange={(e) => set({ standardReference: e.target.value })} />
              </Field>
              <Field label="Test every (months)">
                <input
                  type="number"
                  min="1"
                  value={draft.intervalMonths ?? 12}
                  onChange={(e) => set({ intervalMonths: Number(e.target.value) || 12 })}
                />
              </Field>
              <Field label="Show as due soon (days before)">
                <input
                  type="number"
                  min="0"
                  value={draft.dueSoonDays ?? 30}
                  onChange={(e) => set({ dueSoonDays: Number(e.target.value) || 0 })}
                />
              </Field>
              <div className="fco-toggle-stack">
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={draft.createDefectOnFail !== false}
                    onChange={(e) => set({ createDefectOnFail: e.target.checked })}
                  />
                  <span>
                    Open a defect when a test fails
                    <small className="fco-hint">The failed test shows up in the unit's defect list for repair.</small>
                  </span>
                </label>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    disabled={draft.createDefectOnFail === false}
                    checked={draft.createDefectOnFail !== false && Boolean(draft.blockReturnToServiceOnFail)}
                    onChange={(e) => set({ blockReturnToServiceOnFail: e.target.checked })}
                  />
                  <span>
                    Take the unit out of service when a test fails
                    <small className="fco-hint">
                      {draft.createDefectOnFail === false
                        ? "Turn on \"Open a defect\" to use this."
                        : "The defect is filed as out-of-service instead of high priority."}
                    </small>
                  </span>
                </label>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={draft.certificateRequired !== false}
                    onChange={(e) => set({ certificateRequired: e.target.checked })}
                  />
                  <span>
                    Certificate required
                    <small className="fco-hint">Each test should have a certificate on file; the testing board shows which ones do.</small>
                  </span>
                </label>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={draft.active !== false}
                    onChange={(e) => set({ active: e.target.checked })}
                  />
                  <span>
                    In use
                    <small className="fco-hint">Turn off to stop tracking this program without losing its history.</small>
                  </span>
                </label>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
