/**
 * QA review and report history, on the Review and sign step.
 *
 *   - QA (reviewPcrs): comment, return to the crew, or mark reviewed, with an optional checklist. Reviewers never edit
 *     the chart; the crew can reply. Every entry is kept (append-only).
 *   - History: each posted version kept when the report was unlocked, and each amendment's changes (old → new),
 *     with the reason and who made them.
 */
import { useCallback, useEffect, useState } from "react";
import { History, Loader2, MessageSquare, Send, ShieldCheck, Undo2 } from "lucide-react";
import { fieldInput } from "../../lib/nemsis/pcrModel.js";
import { leafWords, qaStatus } from "../../lib/pcr/pcrLifecycle.js";
import { addQaReview, listPcrRevisions, listQaReviews } from "../../lib/pcrService.js";

/** A starting QA checklist; departments will be able to set their own. */
export const DEFAULT_QA_CHECKLIST = Object.freeze([
  "Times are complete and in order",
  "Assessment supports the impression",
  "Treatment matches protocol",
  "Vital signs repeated as required",
  "Narrative matches the charted care",
  "Refusal or transfer documented as required",
]);

const ACTION_LABELS = { comment: "Comment", returned: "Returned to crew", reviewed: "Reviewed", reply: "Crew reply" };

const when = (value) => {
  const t = Date.parse(value || "");
  return Number.isNaN(t) ? "" : new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

function friendly(err, fallback) {
  return String(err?.code || "").includes("permission-denied") ? "You don't have permission to do that." : fallback;
}

export default function PcrQaPanel({ schema, report, departmentId, actor, uid, canReview, onChange, onMessage, onError }) {
  const [entries, setEntries] = useState(null);
  const [revisions, setRevisions] = useState(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState("");
  const onCrew = (report.crewUids || []).includes(uid);
  const qa = qaStatus(report);

  const load = useCallback(async () => {
    try {
      const [qaList, revList] = await Promise.all([listQaReviews(departmentId, report.id), listPcrRevisions(departmentId, report.id)]);
      setEntries(qaList);
      setRevisions(revList);
    } catch {
      setEntries([]);
      setRevisions([]);
    }
  }, [departmentId, report.id]);

  // Reload when the report's QA or amendment state changes.
  useEffect(() => { load(); }, [load, report.qa?.at, report.amendments, report.versions]);

  const act = async (action) => {
    setBusy(action);
    try {
      const checklist = action === "comment" || action === "reply" ? null : Object.fromEntries(DEFAULT_QA_CHECKLIST.map((item) => [item, Boolean(checked[item])]));
      const { qa: next } = await addQaReview(departmentId, report, { action, note, checklist }, actor);
      if (next && next !== report.qa) onChange({ qa: next });
      setNote("");
      setChecked({});
      onMessage(action === "returned" ? "Returned to the crew with your note." : action === "reviewed" ? "Marked as reviewed." : "Note added.");
      load();
    } catch (err) {
      onError(friendly(err, "That couldn't be saved. Try again."));
    } finally {
      setBusy("");
    }
  };

  const changeLabel = (el) => fieldInput(schema, el)?.label || el || "Report";
  const codeLabel = (el) => (code) => fieldInput(schema, el)?.options?.find((o) => o.code === code)?.label || code;
  const canReply = onCrew && !canReview && qa.id === "returned";

  return (
    <>
      <section className="nr-section">
        <header>
          <div className="nr-section-title">
            <span className="nr-section-icon"><ShieldCheck size={16} /></span>
            <div>
              <h3>QA review: {qa.label}</h3>
              <p>Quality review notes are kept separately from the chart. Reviewers can comment and return a report; they can&apos;t change what the crew charted.</p>
            </div>
          </div>
        </header>
        {entries === null ? <p className="nr-muted"><Loader2 size={14} className="nr-spin" /> Loading…</p> : entries.length ? (
          <ul className="pcr-history">
            {entries.map((e) => (
              <li key={e.id}>
                <span><strong>{ACTION_LABELS[e.action] || e.action}</strong> · {e.createdByName || "Someone"} <small>{when(e.createdAt)}</small></span>
                {e.note ? <span>{e.note}</span> : null}
                {e.checklist ? (
                  <small>{Object.entries(e.checklist).map(([item, ok]) => `${ok ? "✓" : "✗"} ${item}`).join(" · ")}</small>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="nr-muted">No QA notes yet.</p>}

        {canReview ? (
          <div className="pcr-qa-form">
            <div className="pcr-qa-checklist">
              {DEFAULT_QA_CHECKLIST.map((item) => (
                <label key={item} className="pcr-check">
                  <input type="checkbox" checked={Boolean(checked[item])} onChange={(e) => setChecked((c) => ({ ...c, [item]: e.target.checked }))} />
                  <span>{item}</span>
                </label>
              ))}
            </div>
            <textarea className="nr-input nr-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the crew (what to correct, or feedback)" aria-label="QA note" />
            <div className="pcr-review-actions" style={{ padding: 0 }}>
              <button type="button" className="nr-btn nr-btn-soft" disabled={Boolean(busy) || !note.trim()} onClick={() => act("comment")}>
                {busy === "comment" ? <Loader2 size={15} className="nr-spin" /> : <MessageSquare size={15} />} Add comment
              </button>
              <button type="button" className="nr-btn nr-btn-soft" disabled={Boolean(busy) || !note.trim()} onClick={() => act("returned")} title="Ask the crew to correct the report">
                {busy === "returned" ? <Loader2 size={15} className="nr-spin" /> : <Undo2 size={15} />} Return to crew
              </button>
              <button type="button" className="nr-btn nr-btn-primary" disabled={Boolean(busy)} onClick={() => act("reviewed")}>
                {busy === "reviewed" ? <Loader2 size={15} className="nr-spin" /> : <ShieldCheck size={15} />} Mark reviewed
              </button>
            </div>
            {report.status === "posted" ? <small className="nr-muted">Returning a posted report doesn&apos;t unlock it. If the chart needs changes, a supervisor unlocks it for an amendment.</small> : null}
          </div>
        ) : canReply ? (
          <div className="pcr-qa-form">
            <textarea className="nr-input nr-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reply to the reviewer" aria-label="Reply to the reviewer" />
            <div><button type="button" className="nr-btn nr-btn-soft" disabled={Boolean(busy) || !note.trim()} onClick={() => act("reply")}><Send size={15} /> Reply</button></div>
          </div>
        ) : null}
      </section>

      {revisions?.length ? (
        <section className="nr-section">
          <header>
            <div className="nr-section-title">
              <span className="nr-section-icon"><History size={16} /></span>
              <div>
                <h3>History</h3>
                <p>Posted versions are kept unchanged when a report is unlocked. Amendments list every change.</p>
              </div>
            </div>
          </header>
          <ul className="pcr-history">
            {revisions.map((r) => (r.kind === "amendment" ? (
              <li key={r.id}>
                <span><strong>Amendment {r.version}</strong> · posted {when(r.amendedAt)} by {r.amendedByName || "the crew"}</span>
                <small>Unlocked {when(r.unlockedAt)}{r.unlockedByName ? ` by ${r.unlockedByName}` : ""}{r.reason ? `: ${r.reason}` : ""}</small>
                {r.changes?.length ? (
                  <table className="pcr-changes">
                    <thead><tr><th scope="col">Field</th><th scope="col">Was</th><th scope="col">Now</th></tr></thead>
                    <tbody>
                      {r.changes.slice(0, 200).map((c) => (
                        <tr key={c.path}>
                          <td>{changeLabel(c.element)}</td>
                          <td><del>{leafWords(c.from, codeLabel(c.element))}</del></td>
                          <td><ins>{leafWords(c.to, codeLabel(c.element))}</ins></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <small>No charted values changed.</small>}
                {r.changeCount > 200 ? <small>+{r.changeCount - 200} more changes</small> : null}
              </li>
            ) : (
              <li key={r.id}>
                <span><strong>Posted version {r.version}</strong> · posted {when(r.postedAt)}{r.postedByName ? ` by ${r.postedByName}` : ""}</span>
                <small>Kept when it was unlocked {when(r.createdAt)}{r.createdByName ? ` by ${r.createdByName}` : ""}{r.unlockReason ? `: ${r.unlockReason}` : ""}</small>
              </li>
            )))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
