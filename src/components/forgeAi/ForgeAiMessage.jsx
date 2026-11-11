import { useState } from "react";
import { Bot, Check, ChevronDown, Copy, Database, FileText, Radio, ThumbsDown, ThumbsUp, User } from "lucide-react";
import { answerToPlainText, parseAnswer } from "../../lib/forgeAi/answerText.js";

const LIVENESS = {
  historical: { label: "Historical", hint: "From saved reports" },
  live: { label: "Live window", hint: "From the latest sync" },
  current: { label: "Current record", hint: "As maintained in FORGE" },
  mixed: { label: "Mixed", hint: "Historical reports and current records" },
  reference: { label: "Documentation", hint: "From FORGE's documentation" },
  none: { label: "", hint: "" },
};

function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Inline({ parts, sourcesById }) {
  return parts.map((part, i) => {
    if (part.type === "bold") return <strong key={i}>{part.value}</strong>;
    if (part.type === "italic") return <em key={i}>{part.value}</em>;
    if (part.type === "cite") {
      const s = sourcesById.get(part.value);
      return <sup key={i} className="fa-cite" title={s ? `${s.label}${s.detail ? ` — ${s.detail}` : ""}` : part.value}>{part.value}</sup>;
    }
    return <span key={i}>{part.value}</span>;
  });
}

export function AnswerText({ text, sourcesById = new Map() }) {
  return (
    <div className="fa-answer-text">
      {parseAnswer(text).map((block, i) => (block.type === "ul" ? (
        <ul key={i}>
          {block.items.map((item, j) => <li key={j} className={item.depth ? "is-nested" : ""}><Inline parts={item.inline} sourcesById={sourcesById} /></li>)}
        </ul>
      ) : (
        <p key={i}><Inline parts={block.inline} sourcesById={sourcesById} /></p>
      )))}
    </div>
  );
}

function AnswerTable({ table }) {
  return (
    <figure className="fa-table">
      <figcaption>{table.title}</figcaption>
      <div className="fa-table-scroll">
        <table>
          <thead><tr>{table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell === null || cell === undefined ? "" : String(cell)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function GeneratedBadge({ message }) {
  if (message.generatedBy === "model") return <span className="fa-pill is-ai" title={message.model}><Bot size={12} aria-hidden /> AI-written from records</span>;
  if (message.generatedBy === "policy") return <span className="fa-pill is-muted">Access check</span>;
  return <span className="fa-pill is-rules" title="The AI model wasn't used; this answer lists the records directly."><Database size={12} aria-hidden /> From records (no AI model)</span>;
}

export default function ForgeAiMessage({ message, capabilityLabel, onFeedback, onFollowUp, onOpenSource }) {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  if (message.role === "user") {
    return (
      <article className="fa-msg is-user" aria-label="Your question">
        <span className="fa-avatar" aria-hidden><User size={14} /></span>
        <div className="fa-bubble"><p>{message.text}</p></div>
      </article>
    );
  }

  const sources = message.sources || [];
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const answer = message.answer || {};
  const live = LIVENESS[message.liveness] || LIVENESS.none;
  const cited = sources.filter((s) => s.cited);
  const shownSources = showSources ? sources : (cited.length ? cited : sources).slice(0, 6);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answerToPlainText(message));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const rate = async (rating) => {
    if (!onFeedback || feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      await onFeedback(message, rating);
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <article className="fa-msg is-assistant" aria-label="Forge AI answer">
      <span className="fa-avatar" aria-hidden><Bot size={14} /></span>
      <div className="fa-bubble">
        <header className="fa-msg-head">
          <strong>{message.title || capabilityLabel}</strong>
          <div className="fa-msg-meta">
            {capabilityLabel ? <span className="fa-pill">{capabilityLabel}</span> : null}
            <GeneratedBadge message={message} />
            {live.label ? <span className={`fa-pill is-${message.liveness}`} title={live.hint}>{message.liveness === "live" ? <Radio size={12} aria-hidden /> : null}{live.label}</span> : null}
            <span className="fa-when" title="When this answer was generated">as of {formatWhen(message.dataAsOf || message.createdAt)}</span>
            {message.window?.from ? <span className="fa-when">· {message.window.from === message.window.to ? message.window.from : `${message.window.from} to ${message.window.to}`}</span> : null}
          </div>
        </header>

        <AnswerText text={message.text} sourcesById={sourcesById} />

        {(answer.sections || []).map((section) => (
          <section key={section.id} className={`fa-section${section.ai ? " is-ai" : ""}`}>
            <h3>{section.title}{section.ai ? <span className="fa-pill is-ai">AI observation</span> : null}</h3>
            <AnswerText text={section.text} sourcesById={sourcesById} />
          </section>
        ))}

        {(answer.observations || []).length ? (
          <section className="fa-section is-ai">
            <h3>Observations <span className="fa-pill is-ai">AI observation</span></h3>
            <ul>{answer.observations.map((o, i) => <li key={i}>{o}</li>)}</ul>
          </section>
        ) : null}

        {(answer.tables || []).map((table) => <AnswerTable key={table.id} table={table} />)}

        {(answer.limitations || []).length ? (
          <details className="fa-limits">
            <summary><ChevronDown size={13} aria-hidden /> Data limitations ({answer.limitations.length})</summary>
            <ul>{answer.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </details>
        ) : null}

        {sources.length ? (
          <div className="fa-sources" aria-label="Sources">
            <span className="fa-sources-label">Sources</span>
            {shownSources.map((s) => (
              <button key={s.id} type="button" className={`fa-source${s.cited ? " is-cited" : ""}`} onClick={() => onOpenSource?.(s)} title={`${s.detail || ""}${s.asOf ? ` · as of ${formatWhen(s.asOf)}` : ""}`}>
                <FileText size={12} aria-hidden />
                <span className="fa-source-id">{s.id}</span>
                <span className="fa-source-label">{s.label}</span>
                <span className={`fa-source-live is-${s.liveness}`}>{(LIVENESS[s.liveness] || LIVENESS.historical).label}</span>
              </button>
            ))}
            {sources.length > shownSources.length || showSources ? (
              <button type="button" className="text-button fa-more" onClick={() => setShowSources((v) => !v)}>
                {showSources ? "Show fewer" : `All ${sources.length} sources`}
              </button>
            ) : null}
          </div>
        ) : null}

        {(answer.followUps || []).length ? (
          <div className="fa-followups">
            {answer.followUps.map((q) => <button key={q} type="button" className="fa-chip" onClick={() => onFollowUp?.(q, message.capability)}>{q}</button>)}
          </div>
        ) : null}

        <footer className="fa-msg-actions">
          <button type="button" className="icon-button" onClick={copy} aria-label="Copy answer" title="Copy answer">{copied ? <Check size={15} /> : <Copy size={15} />}</button>
          {message.generatedBy !== "policy" ? (
            <>
              <button type="button" className={`icon-button${message.feedback === "up" ? " is-on" : ""}`} onClick={() => rate("up")} aria-label="Helpful" aria-pressed={message.feedback === "up"} disabled={feedbackBusy}><ThumbsUp size={15} /></button>
              <button type="button" className={`icon-button${message.feedback === "down" ? " is-on" : ""}`} onClick={() => rate("down")} aria-label="Not helpful" aria-pressed={message.feedback === "down"} disabled={feedbackBusy}><ThumbsDown size={15} /></button>
            </>
          ) : null}
          <span className="fa-disclaimer">Forge AI reads records only. It can't dispatch, change or submit anything. Check important details against the source record.</span>
        </footer>
      </div>
    </article>
  );
}
