import { useEffect, useState } from "react";
import { ClipboardList, RotateCcw, Save } from "lucide-react";
import {
  DEFAULT_REVIEW_RULES,
  SEVERITY_OPTIONS,
  getReviewRules,
  normalizeReviewRules,
  parseRuleList,
  saveReviewRules,
} from "../../lib/preplans/reviewRules.js";

/**
 * Config Studio: when the server opens preplan review tasks on its own.
 * Tasks only ask preplan staff to look; they never change a preplan.
 */
export default function PreplanReviewRulesPanel({ departmentId, actor = {}, canManage = false }) {
  const [rules, setRules] = useState(null);
  const [prefixes, setPrefixes] = useState("");
  const [keywords, setKeywords] = useState("");
  const [meta, setMeta] = useState({ saved: false, updatedAt: "", updatedByName: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function show(next) {
    setRules(next);
    setPrefixes(next.citationPrefixes.join(", "));
    setKeywords(next.keywords.join(", "));
  }

  useEffect(() => {
    getReviewRules(departmentId)
      .then((result) => { show(result.rules); setMeta(result); })
      .catch((err) => setError(err?.message || "Couldn't load the review rules."));
  }, [departmentId]);

  if (!rules) return error ? <p className="occupancy-error">{error}</p> : <p className="occupancy-muted">Loading…</p>;

  const toggle = (key) => (event) => setRules((current) => ({ ...current, [key]: event.target.checked }));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await saveReviewRules(departmentId, {
        ...rules,
        citationPrefixes: parseRuleList(prefixes),
        keywords: parseRuleList(keywords),
      }, actor);
      show(next);
      setMeta({ saved: true, updatedAt: new Date().toISOString(), updatedByName: actor.actorName || "" });
      setMessage("Review rules saved. They apply to changes from now on.");
    } catch (err) {
      setError(err?.message || "Couldn't save the review rules.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <header>
        <div><ClipboardList size={15} /><strong>Automatic review tasks</strong></div>
      </header>
      <div className="panel-body">
        <p className="occupancy-muted">
          When an occupancy record or an inspection finding changes in a way that may affect a preplan, Forge opens a review
          task on that preplan (under Alerts &amp; reviews). Preplan staff decide whether a new revision is needed; nothing is
          changed on the preplan itself.
        </p>
        {meta.saved ? (
          <p className="occupancy-muted">
            Last saved {meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : ""}{meta.updatedByName ? ` by ${meta.updatedByName}` : ""}.
          </p>
        ) : <p className="occupancy-muted">Using the standard rules (not changed for this department).</p>}

        <label className="occupancy-primary-toggle">
          <input type="checkbox" checked={rules.occupancyChanges} disabled={!canManage} onChange={toggle("occupancyChanges")} />
          Occupancy changes: address, map location, name, classification, hazard, construction, occupant load, sprinkler,
          alarm, Knox box / access, emergency contacts, status, or the record being deleted
        </label>
        <label className="occupancy-primary-toggle">
          <input type="checkbox" checked={rules.violationFindings} disabled={!canManage} onChange={toggle("violationFindings")} />
          New inspection findings that match the rules below
        </label>
        <label className="occupancy-primary-toggle">
          <input type="checkbox" checked={rules.correctedFindings} disabled={!canManage} onChange={toggle("correctedFindings")} />
          A finding is corrected while a preplan alert or link refers to it
        </label>
        <label className="occupancy-primary-toggle">
          <input type="checkbox" checked={rules.notifyOnNewTasks} disabled={!canManage} onChange={toggle("notifyOnNewTasks")} />
          Notify preplan staff when a review task opens (the preplan&apos;s assigned planner and reviewer; if neither is set,
          the department&apos;s preplan approvers). Applies to automatic tasks and to people&apos;s requests; never to the person who asked.
        </label>

        <div className="occupancy-form-grid">
          <label className="config-field wide">
            <span>Code chapters (start of the section number; 9 = 9xx fire protection, 10 = 10xx egress)</span>
            <textarea rows={2} value={prefixes} disabled={!canManage || !rules.violationFindings} onChange={(event) => setPrefixes(event.target.value)} />
          </label>
          <label className="config-field wide">
            <span>Words in the finding (any match counts)</span>
            <textarea rows={3} value={keywords} disabled={!canManage || !rules.violationFindings} onChange={(event) => setKeywords(event.target.value)} />
          </label>
          <label className="config-field">
            <span>Only findings of at least</span>
            <select value={rules.minSeverity} disabled={!canManage || !rules.violationFindings}
              onChange={(event) => setRules((current) => ({ ...current, minSeverity: event.target.value }))}>
              {SEVERITY_OPTIONS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </label>
        </div>

        {message ? <p className="occupancy-message" role="status">{message}</p> : null}
        {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
        {canManage ? (
          <div className="occupancy-detail-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={() => { show(normalizeReviewRules(DEFAULT_REVIEW_RULES)); setMessage(""); }}>
              <RotateCcw size={14} /> Standard rules
            </button>
            <button className="primary-button" type="button" disabled={saving} onClick={save}>
              <Save size={14} /> {saving ? "Saving…" : "Save review rules"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
