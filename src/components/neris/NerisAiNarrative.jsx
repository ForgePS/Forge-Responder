import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { Field, TextArea } from "./NerisControls.jsx";
import { requestAiNarrative } from "../../lib/neris/aiNarrativeClient.js";
import { generateDraftNarrative } from "../../lib/neris/narrative.js";
import { narrativeText } from "../../lib/neris/reportModel.js";

const STYLES = [
  { id: "concise", label: "Concise" },
  { id: "standard", label: "Standard" },
  { id: "detailed", label: "Detailed" },
];

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Narrative step: crew notes in, AI draft out, the author edits and confirms.
 */
export default function NerisAiNarrative({ report, departmentId, editable, online, onUpdate, onUpdateModule }) {
  const ws = report.workspace || {};
  const narrative = ws.narrative || {};
  const body = narrativeText(report);
  const [notes, setNotes] = useState(narrative.crewNotes || "");
  const [style, setStyle] = useState(narrative.style || "standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(narrative.missing || []);
  const [previous, setPrevious] = useState(null);

  function saveNarrative(patch) {
    const next = { ...narrative, ...patch };
    onUpdate({ workspace: { ...ws, narrative: next } });
    if (patch.body !== undefined) onUpdateModule("core_mod_incident", "incident_narrative_outcome", patch.body);
  }

  async function writeWithAi() {
    setBusy(true);
    setError("");
    try {
      const result = await requestAiNarrative({
        departmentId,
        report,
        notes,
        style,
        existingNarrative: body,
      });
      if (!result?.narrative) throw new Error("The AI didn't return a draft. Try again.");
      setPrevious(body);
      setMissing(result.missing || []);
      saveNarrative({
        body: result.narrative,
        aiGenerated: true,
        reviewedAt: "",
        model: result.model || "",
        generatedAt: new Date().toISOString(),
        crewNotes: notes,
        style,
        missing: result.missing || [],
      });
    } catch (err) {
      setError(err?.message || "Couldn't draft the narrative.");
    } finally {
      setBusy(false);
    }
  }

  function quickDraft() {
    const draft = generateDraftNarrative(report);
    setPrevious(body);
    saveNarrative({ body: draft.body, aiGenerated: false, reviewedAt: "", templateDraft: true });
  }

  const needsReview = narrative.aiGenerated && !narrative.reviewedAt;

  return (
    <div className="nr-narrative">
      <div className="nr-ai-panel">
        <div className="nr-ai-head">
          <span className="nr-ai-badge"><Sparkles size={14} /> AI writer</span>
          <h3>Tell it what happened</h3>
          <p>Jot down the key points in any order. The AI also uses everything already in this report (times, units, actions, details).</p>
        </div>
        <TextArea
          rows={7}
          value={notes}
          disabled={!editable || busy}
          onChange={setNotes}
          placeholder={"- E1 arrived, smoke showing from 2nd floor\n- Pulled 1¾ to Delta side, knocked down in 5 min\n- Primary search negative\n- Overhaul, turned over to owner"}
        />
        <div className="nr-ai-controls">
          <div className="nr-segmented nr-small" role="radiogroup" aria-label="Length">
            {STYLES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={style === s.id ? "active" : ""} disabled={!editable || busy} onClick={() => setStyle(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <button type="button" className="nr-btn nr-btn-ai" disabled={!editable || busy || !online} onClick={writeWithAi}>
            {busy ? <><Loader2 size={16} className="nr-spin" /> Writing…</> : <><Wand2 size={16} /> {body ? "Rewrite with AI" : "Write with AI"}</>}
          </button>
        </div>
        {!online ? <p className="nr-note"><TriangleAlert size={14} /> You're offline. AI drafting needs a connection. You can still write it yourself or use a quick draft.</p> : null}
        {error ? <p className="nr-error" role="alert"><TriangleAlert size={14} /> {error}</p> : null}
        <p className="nr-privacy"><ShieldCheck size={14} /> Names, phone numbers and emails are removed before anything is sent. Don't put patient names in your notes.</p>
        {editable ? (
          <button type="button" className="nr-link" onClick={quickDraft} disabled={busy}>Quick draft without AI</button>
        ) : null}
      </div>

      <div className="nr-narrative-editor">
        <div className="nr-narrative-top">
          <h3>Narrative</h3>
          <div className="nr-narrative-meta">
            {narrative.aiGenerated ? (
              needsReview
                ? <span className="nr-pill nr-pill-warn"><Sparkles size={12} /> AI draft — read before submitting</span>
                : <span className="nr-pill nr-pill-ok"><CheckCircle2 size={12} /> AI draft reviewed</span>
            ) : null}
            <span className="nr-count">{wordCount(body)} words</span>
          </div>
        </div>
        <TextArea
          rows={14}
          value={body}
          disabled={!editable || busy}
          onChange={(value) => saveNarrative({ body: value })}
          placeholder="Write the narrative here, or use the AI writer."
        />
        {missing.length ? (
          <div className="nr-missing-facts">
            <strong>The AI left these out because they aren't in the report yet:</strong>
            <ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        ) : null}
        <div className="nr-narrative-actions">
          {previous !== null && editable ? (
            <button type="button" className="nr-btn nr-btn-ghost" onClick={() => { saveNarrative({ body: previous, aiGenerated: false }); setPrevious(null); setMissing([]); }}>
              <RotateCcw size={15} /> Undo
            </button>
          ) : null}
          {needsReview && editable ? (
            <button type="button" className="nr-btn nr-btn-primary" onClick={() => saveNarrative({ reviewedAt: new Date().toISOString() })}>
              <CheckCircle2 size={16} /> I've read it and it's accurate
            </button>
          ) : null}
        </div>
        <Field label="Anything that slowed the response?" help="Optional. For example: blocked access, wrong address, weather, water supply problems." wide>
          <TextArea
            rows={2}
            value={report.modules?.core_mod_incident?.incident_narrative_impedance || ""}
            disabled={!editable}
            onChange={(value) => onUpdateModule("core_mod_incident", "incident_narrative_impedance", value)}
          />
        </Field>
      </div>
    </div>
  );
}
