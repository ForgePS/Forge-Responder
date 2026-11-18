/**
 * Narrative step of the RMS patient care report: crew notes in, AI draft out (draftPcrNarrative), the author edits
 * and confirms. The writer sees only de-identified clinical facts from the saved report (pcrNarrativeFacts).
 * A quick draft from the same facts works without AI (offline, or when the department hasn't switched AI on).
 */
import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { TextArea } from "../neris/NerisControls.jsx";
import { getValue, setLeaf } from "../../lib/nemsis/pcrModel.js";
import { pcrNarrativeFacts, quickPcrNarrative } from "../../lib/nemsis/pcrNarrativeFacts.js";

const STYLES = [
  { id: "chronological", label: "Chronological" },
  { id: "chart", label: "CHART" },
  { id: "soap", label: "SOAP" },
];

const words = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;

/**
 * @param {{ schema, report, editable, online, aiEnabled, onChange: (patch) => void, onSaveFirst: () => Promise<boolean>,
 *   requestDraft: (input) => Promise<{narrative, missing, model}> }} props
 */
export default function PcrNarrativePanel({ schema, report, editable, online, aiEnabled, onChange, onSaveFirst, requestDraft }) {
  const ai = report.aiNarrative || {};
  const body = String(getValue(schema, report.nemsis || {}, "eNarrative.01") ?? "");
  const [notes, setNotes] = useState(ai.crewNotes || "");
  const [style, setStyle] = useState(ai.style || "chronological");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(ai.missing || []);
  const [previous, setPrevious] = useState(null);

  const save = (text, meta) => onChange((current) => ({
    nemsis: setLeaf(schema, current.nemsis || {}, "eNarrative.01", text || undefined),
    aiNarrative: meta === undefined ? current.aiNarrative : meta,
  }));

  async function writeWithAi() {
    setBusy(true);
    setError("");
    try {
      // The server drafts from the saved report.
      if (!(await onSaveFirst())) throw new Error("Save the report first, then try again.");
      const result = await requestDraft({ notes, style, existingNarrative: body });
      if (!result?.narrative) throw new Error("The AI didn't return a draft. Try again.");
      setPrevious(body);
      setMissing(result.missing || []);
      save(result.narrative, { generated: true, reviewedAt: "", model: result.model || "", generatedAt: new Date().toISOString(), crewNotes: notes, style, missing: result.missing || [] });
    } catch (err) {
      setError(err?.message || "Couldn't draft the narrative.");
    } finally {
      setBusy(false);
    }
  }

  function quickDraft() {
    setPrevious(body);
    setMissing([]);
    save(quickPcrNarrative(pcrNarrativeFacts(schema, report.nemsis || {})), { generated: false, quickDraft: true, reviewedAt: "", crewNotes: notes, style });
  }

  const needsReview = ai.generated && !ai.reviewedAt;

  return (
    <div className="nr-narrative">
      <div className="nr-ai-panel">
        <div className="nr-ai-head">
          <span className="nr-ai-badge"><Sparkles size={14} /> AI narrator</span>
          <h3>Tell it what happened</h3>
          <p>Jot down the key points in any order. The AI also uses what's charted: times, vitals, assessment, medications, procedures and disposition.</p>
        </div>
        <TextArea
          rows={7}
          value={notes}
          disabled={!editable || busy}
          onChange={setNotes}
          placeholder={"- Pt found sitting in recliner, alert, diaphoretic\n- Pain started 30 min PTA, 8/10, radiating to L arm\n- 12-lead sent, no STEMI\n- Moved to stretcher, transported without change"}
        />
        <div className="nr-ai-controls">
          <div className="nr-segmented nr-small" role="radiogroup" aria-label="Format">
            {STYLES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={style === s.id ? "active" : ""} disabled={!editable || busy} onClick={() => setStyle(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          {aiEnabled ? (
            <button type="button" className="nr-btn nr-btn-ai" disabled={!editable || busy || !online} onClick={writeWithAi}>
              {busy ? <><Loader2 size={16} className="nr-spin" /> Writing…</> : <><Wand2 size={16} /> {body ? "Rewrite with AI" : "Write with AI"}</>}
            </button>
          ) : null}
        </div>
        {!aiEnabled ? (
          <p className="nr-note"><TriangleAlert size={14} /> The AI narrator is switched off for your department. An administrator can switch it on in Form settings. You can still use a quick draft.</p>
        ) : null}
        {aiEnabled && !online ? <p className="nr-note"><TriangleAlert size={14} /> You're offline. AI drafting needs a connection. You can still write it yourself or use a quick draft.</p> : null}
        {error ? <p className="nr-error" role="alert"><TriangleAlert size={14} /> {error}</p> : null}
        <p className="nr-privacy">
          <ShieldCheck size={14} /> The AI never sees the patient's name, date of birth, address, phone numbers, record numbers or dates; only
          clinical details, clock times and age. Phone numbers, emails, dates of birth and names after words like "patient" are
          removed from your notes, but leave names out of your notes anyway.
        </p>
        {editable ? <button type="button" className="nr-link" onClick={quickDraft} disabled={busy}>Quick draft without AI</button> : null}
      </div>

      <div className="nr-narrative-editor">
        <div className="nr-narrative-top">
          <h3>Narrative <small className="pcr-el">eNarrative.01</small></h3>
          <div className="nr-narrative-meta">
            {ai.generated ? (
              needsReview
                ? <span className="nr-pill nr-pill-warn"><Sparkles size={12} /> AI draft: read it before posting</span>
                : <span className="nr-pill nr-pill-ok"><CheckCircle2 size={12} /> AI draft reviewed</span>
            ) : null}
            <span className="nr-count">{words(body)} words</span>
          </div>
        </div>
        <TextArea rows={16} value={body} disabled={!editable || busy} onChange={(value) => save(value)} placeholder="Write the narrative here, or use the AI narrator." />
        {missing.length ? (
          <div className="nr-missing-facts">
            <strong>The AI left these out because they aren't in the report yet:</strong>
            <ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        ) : null}
        <div className="nr-narrative-actions">
          {previous !== null && editable ? (
            <button type="button" className="nr-btn nr-btn-ghost" onClick={() => { save(previous, { ...ai, generated: false }); setPrevious(null); setMissing([]); }}>
              <RotateCcw size={15} /> Undo
            </button>
          ) : null}
          {needsReview && editable ? (
            <button type="button" className="nr-btn nr-btn-primary" onClick={() => onChange((current) => ({ aiNarrative: { ...(current.aiNarrative || {}), reviewedAt: new Date().toISOString() } }))}>
              <CheckCircle2 size={16} /> I've read it and it's accurate
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
