import { useEffect, useState } from "react";
import { ClipboardCheck, RotateCcw, Save } from "lucide-react";
import { DEFAULT_SURVEY_CHECKLIST, checklistToText, normalizeSurveySettings, parseChecklistText } from "../../lib/preplans/surveyModel.js";
import { getSurveySettings, saveSurveySettings } from "../../lib/preplans/surveyService.js";

const STANDARD = "__standard";

/**
 * Config Studio: the field survey checklist, standard and per preplan template
 * (so a high-rise template can ask about standpipes per floor, say). Existing
 * surveys keep the checklist they were assigned with.
 */
export default function PreplanSurveySettingsPanel({ departmentId, templates = [], actor = {}, canManage = false }) {
  const [settings, setSettings] = useState(null);
  const [which, setWhich] = useState(STANDARD);
  const [textValue, setTextValue] = useState("");
  const [meta, setMeta] = useState({ saved: false, updatedAt: "", updatedByName: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getSurveySettings(departmentId)
      .then((result) => { setSettings(result.settings); setMeta(result); setTextValue(checklistToText(result.settings.standard)); })
      .catch((err) => setError(err?.message || "Couldn't load the survey settings."));
  }, [departmentId]);

  if (!settings) return error ? <p className="occupancy-error">{error}</p> : <p className="occupancy-muted">Loading…</p>;

  const usesStandard = which !== STANDARD && !settings.byTemplate[which];
  const items = parseChecklistText(textValue);

  function choose(next) {
    setWhich(next);
    setMessage("");
    const list = next === STANDARD ? settings.standard : settings.byTemplate[next] || settings.standard;
    setTextValue(checklistToText(list));
  }

  function current() {
    if (which === STANDARD) return { ...settings, standard: items.length ? items : settings.standard };
    return { ...settings, byTemplate: { ...settings.byTemplate, [which]: items } };
  }

  async function persist(next, note) {
    setSaving(true);
    setError("");
    try {
      const saved = await saveSurveySettings(departmentId, next, actor);
      setSettings(saved);
      setMeta({ saved: true, updatedAt: new Date().toISOString(), updatedByName: actor.actorName || "" });
      setMessage(note);
    } catch (err) {
      setError(err?.message || "Couldn't save the survey settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <header><div><ClipboardCheck size={15} /><strong>Field survey checklists</strong></div></header>
      <div className="panel-body">
        <p className="occupancy-muted">
          What crews check on a preplan field survey. One item per line; a line ending in a colon starts a group
          (for example <code>Equipment:</code>). Surveys already assigned keep the checklist they started with.
        </p>
        {meta.saved
          ? <p className="occupancy-muted">Last saved {meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : ""}{meta.updatedByName ? ` by ${meta.updatedByName}` : ""}.</p>
          : <p className="occupancy-muted">Using the standard checklist (not changed for this department).</p>}
        <div className="occupancy-form-grid">
          <label className="config-field">
            <span>Checklist for</span>
            <select value={which} onChange={(event) => choose(event.target.value)}>
              <option value={STANDARD}>All preplans (standard)</option>
              {templates.map((row) => <option key={row.id} value={row.id}>Template: {row.name}{settings.byTemplate[row.id] ? " (own checklist)" : ""}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Default time to complete (days)</span>
            <input type="number" min={1} max={365} value={settings.defaultDueDays} disabled={!canManage}
              onChange={(event) => setSettings((s) => ({ ...s, defaultDueDays: Number(event.target.value) || 30 }))} />
          </label>
          <label className="config-field wide">
            <span>{usesStandard ? "This template uses the standard checklist. Edit below to give it its own." : `${items.length} item(s)`}</span>
            <textarea rows={16} value={textValue} disabled={!canManage} onChange={(event) => { setTextValue(event.target.value); setMessage(""); }} />
          </label>
        </div>
        {message ? <p className="occupancy-message" role="status">{message}</p> : null}
        {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
        {canManage ? (
          <div className="occupancy-detail-actions">
            {which === STANDARD ? (
              <button type="button" className="secondary-button" disabled={saving} onClick={() => setTextValue(checklistToText(DEFAULT_SURVEY_CHECKLIST))}>
                <RotateCcw size={14} /> Forge standard list
              </button>
            ) : settings.byTemplate[which] ? (
              <button type="button" className="secondary-button" disabled={saving} onClick={() => {
                const byTemplate = { ...settings.byTemplate };
                delete byTemplate[which];
                persist(normalizeSurveySettings({ ...settings, byTemplate }), "This template uses the standard checklist again.").then(() => setTextValue(checklistToText(settings.standard)));
              }}>
                <RotateCcw size={14} /> Use the standard checklist
              </button>
            ) : null}
            <button type="button" className="primary-button" disabled={saving || !items.length} onClick={() => persist(current(), "Checklist saved. New surveys use it.")}>
              <Save size={14} /> {saving ? "Saving…" : "Save checklist"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
