import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Save, Settings2, ShieldCheck } from "lucide-react";
import { loadForgeAiSettings, loadForgeAiUsage, saveForgeAiSettings } from "../../lib/forgeAi/forgeAiClient.js";

function when(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Table({ columns, rows, empty }) {
  if (!rows.length) return <p className="fa-muted">{empty}</p>;
  return (
    <div className="fa-table-scroll">
      <table className="fa-admin-table">
        <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function ForgeAiAdminPanel({ departmentId, canManage, canViewUsage, onSaved }) {
  const [settings, setSettings] = useState(null);
  const [capabilities, setCapabilities] = useState([]);
  const [usage, setUsage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, u] = await Promise.all([
        loadForgeAiSettings(departmentId),
        canViewUsage ? loadForgeAiUsage(departmentId) : Promise.resolve(null),
      ]);
      setSettings(s.settings);
      setCapabilities(s.capabilities || []);
      setUsage(u);
    } catch (e) {
      setError(e.message);
    }
  }, [departmentId, canViewUsage]);

  useEffect(() => { load(); }, [load]);

  const toggleCapability = (id) => setSettings((s) => ({ ...s, capabilities: { ...s.capabilities, [id]: s.capabilities?.[id] === false } }));

  const save = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveForgeAiSettings(departmentId, settings);
      setSettings(result.settings);
      setNotice("Saved. Changes apply to the next question.");
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!settings && !error) return <section className="panel fa-admin"><div className="panel-body fa-muted">Loading Forge AI settings…</div></section>;

  const totals = (usage?.days || []).reduce((t, d) => ({ requests: t.requests + d.requests, model: t.model + d.modelAnswers, rules: t.rules + d.ruleAnswers, errors: t.errors + d.errors, tokens: t.tokens + d.inputTokens + d.outputTokens }), { requests: 0, model: 0, rules: 0, errors: 0, tokens: 0 });

  return (
    <div className="fa-admin">
      {error ? <div className="banner error" role="alert">{error}</div> : null}
      {notice ? <div className="banner success" role="status">{notice}</div> : null}

      {settings ? (
        <section className="panel">
          <header><div><Settings2 size={15} /><strong>Department settings</strong></div></header>
          <div className="panel-body fa-admin-settings">
            <label className="rms-check">
              <input type="checkbox" checked={settings.enabled} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))} />
              <span><strong>Forge AI is on for this department</strong><br /><span className="fa-muted">Off by default. When off, no one can ask questions; history stays.</span></span>
            </label>
            <fieldset className="fa-cap-grid" disabled={!canManage}>
              <legend>Capabilities</legend>
              {capabilities.map((c) => (
                <label key={c.id} className="rms-check">
                  <input type="checkbox" checked={settings.capabilities?.[c.id] !== false} onChange={() => toggleCapability(c.id)} />
                  <span><strong>{c.label}</strong><br /><span className="fa-muted">{c.description}</span></span>
                </label>
              ))}
            </fieldset>
            <label className="rms-field fa-limit">
              <span>Daily question limit (whole department)</span>
              <input type="number" min={1} max={5000} value={settings.dailyLimit} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, dailyLimit: Number(e.target.value) }))} />
            </label>
            <p className="fa-muted"><ShieldCheck size={13} aria-hidden /> Members still need the Forge AI permissions (Roles &amp; permissions) and access to each capability's data. Forge AI never shows a member data they couldn't already open.</p>
            {canManage ? (
              <div className="modal-actions">
                <button type="button" className="primary-button" onClick={save} disabled={busy}><Save size={15} /> {busy ? "Saving…" : "Save settings"}</button>
              </div>
            ) : <p className="fa-muted">You can view these settings. Changing them needs the "Turn Forge AI on or off" permission.</p>}
            {settings.updatedAt ? <p className="fa-muted">Last changed {when(settings.updatedAt)} by {settings.updatedBy || "unknown"}.</p> : null}
          </div>
        </section>
      ) : null}

      {canViewUsage && usage ? (
        <section className="panel">
          <header>
            <div><Activity size={15} /><strong>Usage (last 30 days)</strong></div>
            <button type="button" className="secondary-button" onClick={load}><RefreshCw size={14} /> Refresh</button>
          </header>
          <div className="panel-body fa-stack">
            <div className="fa-stats">
              <div><strong>{totals.requests}</strong><span>Questions</span></div>
              <div><strong>{totals.model}</strong><span>AI-written answers</span></div>
              <div><strong>{totals.rules}</strong><span>Answers from records</span></div>
              <div><strong>{totals.errors}</strong><span>Errors</span></div>
              <div><strong>{totals.tokens.toLocaleString()}</strong><span>Model tokens</span></div>
              <div><strong>{usage.dailyLimit}</strong><span>Daily limit</span></div>
            </div>
            <h3>By day</h3>
            <Table columns={["Day", "Questions", "AI", "Records", "Access checks", "Errors", "Tokens"]} rows={usage.days.map((d) => [d.day, d.requests, d.modelAnswers, d.ruleAnswers, d.policyAnswers, d.errors, (d.inputTokens + d.outputTokens).toLocaleString()])} empty="No questions yet." />
            <h3>Recent questions</h3>
            <p className="fa-muted">Question text is not logged here; it stays in each member's own history.</p>
            <Table columns={["When", "Member", "Capability", "Answer", "Outcome", "Sources", "Time (ms)"]} rows={usage.logs.map((l) => [when(l.createdAt), l.actorName, l.capability, l.generatedBy === "model" ? "AI" : l.generatedBy === "policy" ? "Access check" : `Records${l.fallbackReason ? ` (${l.fallbackReason})` : ""}`, l.outcome, l.sourceCount, l.latencyMs])} empty="No questions yet." />
            <h3>Feedback</h3>
            <Table columns={["When", "Member", "Capability", "Rating", "Comment"]} rows={usage.feedback.map((f) => [when(f.createdAt), f.actorName, f.capability, f.rating === "up" ? "Helpful" : "Not helpful", f.comment || ""])} empty="No feedback yet." />
            <h3>Audit trail</h3>
            <Table columns={["When", "Member", "Action", "Summary"]} rows={usage.audit.map((a) => [when(a.createdAt), a.actorName, a.action, a.summary])} empty="No Forge AI audit entries yet." />
          </div>
        </section>
      ) : null}
    </div>
  );
}
