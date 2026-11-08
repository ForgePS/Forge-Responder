import { useState } from "react";
import { Check, LoaderCircle, Search, Send, X } from "lucide-react";
import { applyNerisSync, nerisUnitTypeLabel, previewNerisSync } from "../../lib/nerisConnectionService.js";

const ACTION_LABELS = {
  create: { label: "Add to NERIS", tone: "info" },
  update: { label: "Update in NERIS", tone: "warning" },
  linked: { label: "Matches NERIS", tone: "success" },
  skip: { label: "Can't send yet", tone: "critical" },
};
const SENDABLE = new Set(["create", "update"]);

function ActionPill({ action }) {
  const info = ACTION_LABELS[action] || ACTION_LABELS.skip;
  return <span className={`dd-status-pill dd-status-${info.tone}`}>{info.label}</span>;
}

// NERIS holds the department's official record, so only fill blanks (and the
// RMS name) by default; overwriting an existing value is an explicit choice.
function defaultSelection(plan) {
  return {
    departmentFields: new Set(plan.department.changes.filter((c) => !c.neris || c.field === "rms_software").map((c) => c.field)),
    stationIds: new Set(plan.stations.filter((s) => SENDABLE.has(s.action)).map((s) => s.forgeId)),
    unitIds: new Set(plan.units.filter((u) => SENDABLE.has(u.action)).map((u) => u.apparatusId)),
  };
}

function toggle(set, key) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/**
 * Step 3 of the NERIS panel: compare FORGE's department, stations and
 * apparatus with NERIS, then send the ticked items.
 */
export default function NerisSyncSection({ departmentId = "" }) {
  const [plan, setPlan] = useState(null);
  const [unitTypes, setUnitTypes] = useState([]);
  const [selection, setSelection] = useState(null);
  const [unitEdits, setUnitEdits] = useState({});
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  function takePlan(next, keepSelection = false) {
    const fresh = defaultSelection(next.plan);
    if (keepSelection && plan && selection) {
      // Keep what the admin unticked; tick only items that weren't sendable before.
      const before = defaultSelection(plan);
      const keep = (freshSet, beforeSet, currentSet) => new Set([...freshSet].filter((k) => currentSet.has(k) || !beforeSet.has(k)));
      setSelection({
        departmentFields: keep(fresh.departmentFields, before.departmentFields, selection.departmentFields),
        stationIds: keep(fresh.stationIds, before.stationIds, selection.stationIds),
        unitIds: keep(fresh.unitIds, before.unitIds, selection.unitIds),
      });
    } else {
      setSelection(fresh);
    }
    setPlan(next.plan);
    setUnitTypes(next.unitTypes || []);
  }

  async function handlePreview(edits = unitEdits) {
    setBusy("preview");
    setError("");
    try {
      takePlan(await previewNerisSync(departmentId, edits), Boolean(plan));
    } catch (err) {
      setError(err.message || "Couldn't compare with NERIS. Try again.");
    } finally {
      setBusy("");
    }
  }

  function editUnit(apparatusId, patch) {
    const next = { ...unitEdits, [apparatusId]: { ...(unitEdits[apparatusId] || {}), ...patch } };
    setUnitEdits(next);
    return next;
  }

  async function handleSend() {
    const count = selection.departmentFields.size + selection.stationIds.size + selection.unitIds.size;
    if (!count) return;
    if (!window.confirm(`Send ${count} change${count === 1 ? "" : "s"} to NERIS?`)) return;
    setBusy("send");
    setError("");
    try {
      const response = await applyNerisSync(departmentId, {
        departmentFields: [...selection.departmentFields],
        stationIds: [...selection.stationIds],
        unitIds: [...selection.unitIds],
      }, unitEdits);
      setResults(response.results || []);
      setUnitEdits({});
      takePlan(response);
    } catch (err) {
      setError(err.message || "Couldn't send to NERIS. Try again.");
    } finally {
      setBusy("");
    }
  }

  const sendCount = selection
    ? selection.departmentFields.size + selection.stationIds.size + selection.unitIds.size
    : 0;
  const nothingToDo = plan && !plan.department.changes.length
    && !plan.stations.some((s) => s.action !== "linked")
    && !plan.units.some((u) => u.action !== "linked");

  return (
    <div className="neris-connection-step neris-sync">
      <h4>Step 3: Send your department, stations and units to NERIS</h4>
      <p className="dd-google-api-hint">
        FORGE compares its records with NERIS and shows what would change. Nothing is sent until you choose.
        Units need to be in NERIS before incident reports can list them.
      </p>

      <div className="dd-google-api-actions">
        <button type="button" className="dd-action-button" disabled={Boolean(busy)} onClick={() => handlePreview()}>
          {busy === "preview" ? <LoaderCircle size={16} className="dd-spin" /> : <Search size={16} />}
          {plan ? "Compare again" : "Compare with NERIS"}
        </button>
      </div>

      {results.length ? (
        <ul className="neris-sync-results">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.label}-${i}`} className={r.ok ? "is-ok" : "is-problem"}>
              {r.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
              <span><strong>{r.label}</strong>: {r.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {plan && selection ? (
        <>
          {nothingToDo ? (
            <p className="neris-connection-result is-ok"><Check size={16} aria-hidden="true" /> NERIS already matches FORGE.</p>
          ) : null}

          {plan.department.changes.length ? (
            <div className="neris-sync-group">
              <h5>Department profile</h5>
              <div className="neris-sync-table-wrap">
                <table className="neris-sync-table">
                  <thead><tr><th aria-label="Send" /><th>Field</th><th>In NERIS now</th><th>From FORGE</th></tr></thead>
                  <tbody>
                    {plan.department.changes.map((c) => (
                      <tr key={c.field}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Send ${c.label}`}
                            checked={selection.departmentFields.has(c.field)}
                            onChange={() => setSelection({ ...selection, departmentFields: toggle(selection.departmentFields, c.field) })}
                          />
                        </td>
                        <td>{c.label}</td>
                        <td className="neris-sync-muted">{c.neris || "(blank)"}</td>
                        <td>{c.forge}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {plan.stations.length ? (
            <div className="neris-sync-group">
              <h5>Stations</h5>
              <div className="neris-sync-table-wrap">
                <table className="neris-sync-table">
                  <thead><tr><th aria-label="Send" /><th>Station</th><th>Status</th><th>Notes</th></tr></thead>
                  <tbody>
                    {plan.stations.map((s) => (
                      <tr key={s.forgeId}>
                        <td>
                          {SENDABLE.has(s.action) ? (
                            <input
                              type="checkbox"
                              aria-label={`Send ${s.name}`}
                              checked={selection.stationIds.has(s.forgeId)}
                              onChange={() => setSelection({ ...selection, stationIds: toggle(selection.stationIds, s.forgeId) })}
                            />
                          ) : null}
                        </td>
                        <td>{s.name}</td>
                        <td><ActionPill action={s.action} /></td>
                        <td className="neris-sync-muted">
                          {s.reason || (s.changes.length ? `Changes: ${s.changes.join(", ").replace(/_/g, " ")}` : "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="dd-empty-detail">No stations in FORGE yet. Add them under System Admin → Department → Stations.</p>
          )}

          {plan.units.length ? (
            <div className="neris-sync-group">
              <h5>Units</h5>
              <p className="dd-google-api-hint">
                FORGE guesses each unit's NERIS type from its apparatus type. Check the type and the minimum crew needed to dispatch it.
              </p>
              <div className="neris-sync-table-wrap">
                <table className="neris-sync-table">
                  <thead><tr><th aria-label="Send" /><th>Unit</th><th>Station</th><th>NERIS type</th><th>Min. crew</th><th>Status</th></tr></thead>
                  <tbody>
                    {plan.units.map((u) => (
                      <tr key={u.apparatusId}>
                        <td>
                          {SENDABLE.has(u.action) ? (
                            <input
                              type="checkbox"
                              aria-label={`Send ${u.name}`}
                              checked={selection.unitIds.has(u.apparatusId)}
                              onChange={() => setSelection({ ...selection, unitIds: toggle(selection.unitIds, u.apparatusId) })}
                            />
                          ) : null}
                        </td>
                        <td>
                          {u.name}
                          {u.apparatusType ? <span className="neris-sync-muted"> · {u.apparatusType}</span> : null}
                          {!u.inService ? <span className="neris-sync-muted"> · out of service</span> : null}
                        </td>
                        <td>{u.stationName || "—"}</td>
                        <td>
                          <select
                            aria-label={`NERIS type for ${u.name}`}
                            value={unitEdits[u.apparatusId]?.type ?? u.type}
                            disabled={Boolean(busy)}
                            onChange={(event) => handlePreview(editUnit(u.apparatusId, { type: event.target.value }))}
                          >
                            <option value="">Pick a type…</option>
                            {unitTypes.map((t) => <option key={t} value={t}>{nerisUnitTypeLabel(t)}</option>)}
                          </select>
                          {u.typeGuessed && u.type && !unitEdits[u.apparatusId]?.type ? <span className="neris-sync-muted"> (guess)</span> : null}
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            className="neris-sync-staffing"
                            aria-label={`Minimum crew for ${u.name}`}
                            value={unitEdits[u.apparatusId]?.staffing ?? u.staffing}
                            disabled={Boolean(busy)}
                            onChange={(event) => editUnit(u.apparatusId, { staffing: Number(event.target.value) })}
                            onBlur={() => handlePreview()}
                          />
                        </td>
                        <td>
                          <ActionPill action={u.action} />
                          {u.reason ? <div className="neris-sync-muted">{u.reason}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="dd-empty-detail">No apparatus in FORGE yet.</p>
          )}

          {!nothingToDo ? (
            <div className="dd-google-api-actions">
              <button type="button" className="dd-action-button primary" disabled={Boolean(busy) || !sendCount} onClick={handleSend}>
                {busy === "send" ? <LoaderCircle size={16} className="dd-spin" /> : <Send size={16} />}
                {sendCount ? `Send ${sendCount} to NERIS` : "Nothing selected"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <p className="dd-upload-error">{error}</p> : null}
    </div>
  );
}
