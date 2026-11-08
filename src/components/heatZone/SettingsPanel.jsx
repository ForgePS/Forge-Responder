import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Scale } from "lucide-react";
import { Panel } from "../shell/ui.jsx";
import { loadHeatZoneSettings, rebuildHeatZone, saveHeatZoneSettings } from "../../lib/heatZone/heatZoneService.js";
import { formatInZone } from "../../lib/heatZone/heatZoneFilters.js";
import { describeError, rebuildSummary } from "../../lib/heatZone/heatZoneUi.js";
import AccessSettings from "./AccessSettings.jsx";
import BoundarySettings from "./BoundarySettings.jsx";
import SectionStatus from "./SectionStatus.jsx";

function validWeight(text) {
  const n = Number(text);
  return text !== "" && Number.isFinite(n) && n > 0 && n <= 100;
}

function PriorityWeights({ settings, priorityOptions = [], status, run, onSaved, departmentId }) {
  const priorities = useMemo(() => [...new Set([
    ...priorityOptions, ...Object.keys(settings.priorityWeights || {}), ...(settings.highPriorities || []),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b)), [priorityOptions, settings]);
  const [weights, setWeights] = useState(() => Object.fromEntries(priorities.map((p) => [p, String(settings.priorityWeights?.[p] ?? 1)])));
  const [high, setHigh] = useState(() => settings.highPriorities || []);
  const busy = Boolean(status?.busy);
  const invalid = priorities.filter((p) => !validWeight(weights[p] ?? "1"));

  const save = () => run(async () => {
    const priorityWeights = Object.fromEntries(priorities.map((p) => [p, Number(weights[p] ?? 1)]));
    const res = await saveHeatZoneSettings(departmentId, { priorityWeights, highPriorities: high });
    onSaved(res.settings);
    return "Priority settings saved. Weighted heat and high-priority counts now use them.";
  });

  return (
    <Panel title="Priority weights" icon={Scale}>
      <p className="hz-panel-note">Weights are used by the “Weighted by priority” density mode (each call counts as its weight, 0.1–100). High-priority priorities feed the high-priority card, district table and incident marker colours. If none are ticked, the default (Emergency) is used.</p>
      <SectionStatus status={status} />
      <div className="data-table-wrap">
        <table className="hz-table">
          <thead><tr><th>Priority</th><th>Weight</th><th>High priority</th></tr></thead>
          <tbody>
            {priorities.map((p) => (
              <tr key={p}>
                <td>{p}</td>
                <td>
                  <input
                    type="number" min="0.1" max="100" step="0.5" className={`hz-input hz-number${invalid.includes(p) ? " is-invalid" : ""}`}
                    value={weights[p] ?? "1"} disabled={busy} aria-label={`Weight for ${p}`} aria-invalid={invalid.includes(p)}
                    onChange={(e) => setWeights((prev) => ({ ...prev, [p]: e.target.value }))}
                  />
                </td>
                <td>
                  <label className="hz-switch">
                    <input type="checkbox" checked={high.includes(p)} disabled={busy} onChange={() => setHigh((prev) => (prev.includes(p) ? prev.filter((v) => v !== p) : [...prev, p]))} />
                    <span>{high.includes(p) ? "High" : "—"}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!priorities.length && <div className="empty-table">No priorities found in the incident data yet.</div>}
      </div>
      {invalid.length > 0 && <p className="hz-panel-note is-error">Weights must be greater than 0 and at most 100.</p>}
      <div className="hz-section-actions">
        <button type="button" className="primary-button hz-button" disabled={busy || invalid.length > 0 || !priorities.length} onClick={save}>Save priority settings</button>
      </div>
    </Panel>
  );
}

/**
 * Heat Zone settings for managers. `onChanged` tells the page to reload
 * boundaries and the dashboard after anything that recalculates incidents.
 */
export default function SettingsPanel({ departmentId, timeZone, priorityOptions, onChanged }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    loadHeatZoneSettings(departmentId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((error) => { if (!cancelled) setLoadError(describeError(error, "Unable to load Heat Zone settings.").message); });
    return () => { cancelled = true; };
  }, [departmentId, reloadKey]);

  const anyBusy = Object.values(status).some((s) => s?.busy);

  async function run(section, fn, busyText) {
    setStatus((prev) => ({ ...prev, [section]: { busy: true, busyText } }));
    try {
      const message = await fn();
      setStatus((prev) => ({ ...prev, [section]: { message } }));
    } catch (error) {
      setStatus((prev) => ({ ...prev, [section]: { error: describeError(error, "That change could not be saved.").message } }));
    }
  }

  // Reload settings, then let the page refresh boundaries and the dashboard.
  async function afterZonesChanged() {
    onChanged({ zones: true });
    try {
      setData(await loadHeatZoneSettings(departmentId));
    } catch {
      setReloadKey((k) => k + 1); // the save worked; retry the list through the normal path
    }
  }

  function rebuild() {
    if (!window.confirm("Recalculate Heat Zone analytics from every incident report? This can take a minute for large departments.")) return;
    run("rebuild", async () => {
      const res = await rebuildHeatZone(departmentId);
      onChanged({ zones: false });
      setReloadKey((k) => k + 1);
      return rebuildSummary(res);
    }, "Recalculating analytics…");
  }

  if (loadError) {
    return (
      <div className="error-banner" role="alert">
        <span>{loadError}</span>
        <button type="button" className="secondary-button hz-button" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
      </div>
    );
  }
  if (!data) return <div className="page-loading"><span className="page-loading-spinner" /> Loading settings…</div>;

  const zones = data.zones || [];
  const lastRebuild = data.meta?.lastRebuildAt;

  return (
    <div className="hz-stack">
      <BoundarySettings
        departmentId={departmentId}
        zones={zones}
        status={status.boundaries}
        run={(fn) => (anyBusy ? Promise.resolve() : run("boundaries", fn, "Saving and recalculating incidents…"))}
        onChanged={afterZonesChanged}
      />
      <PriorityWeights
        key={JSON.stringify(data.settings)}
        departmentId={departmentId}
        settings={data.settings || {}}
        priorityOptions={priorityOptions}
        status={status.weights}
        run={(fn) => (anyBusy ? Promise.resolve() : run("weights", fn))}
        onSaved={(settings) => { setData((prev) => ({ ...prev, settings })); onChanged({ zones: false }); }}
      />
      <AccessSettings
        departmentId={departmentId}
        members={data.members || []}
        zones={zones}
        status={status.access}
        run={(fn) => (anyBusy ? Promise.resolve() : run("access", fn))}
        onSaved={(uid, districtIds) => setData((prev) => ({ ...prev, members: prev.members.map((m) => (m.uid === uid ? { ...m, districtIds } : m)) }))}
      />
      <Panel title="Recalculate analytics" icon={RefreshCw}>
        <p className="hz-panel-note">
          Rebuilds every Heat Zone record from the incident reports. Use this after a large CAD import or if numbers look out of date.
          {lastRebuild ? ` Last recalculated ${formatInZone(lastRebuild, data.timeZone || timeZone)}.` : ""}
        </p>
        <SectionStatus status={status.rebuild} />
        <div className="hz-section-actions">
          <button type="button" className="secondary-button hz-button" disabled={anyBusy} onClick={rebuild}><RefreshCw size={14} /> Recalculate analytics</button>
        </div>
      </Panel>
    </div>
  );
}
