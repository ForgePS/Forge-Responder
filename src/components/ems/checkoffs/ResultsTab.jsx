import { useState } from "react";
import { VERIFICATION_LABELS } from "../../../lib/ems/checkoffLogic.js";

const VERIFICATION_TONES = { not_required: "neutral", pending: "warning", verified: "success", returned: "critical" };

export function verificationBadge(result = {}) {
  const status = result.verification?.status || "not_required";
  return <span className={`badge badge-${VERIFICATION_TONES[status] || "neutral"}`}>{VERIFICATION_LABELS[status] || status}</span>;
}

export function problemText(result = {}) {
  const p = result.problemCounts || {};
  const parts = [];
  if (p.equipment) parts.push(`${p.equipment} equipment`);
  if (p.supplies) parts.push(`${p.supplies} supply`);
  return parts.length ? `${parts.join(", ")} problem${(p.equipment || 0) + (p.supplies || 0) === 1 ? "" : "s"}` : "None";
}

/** Recorded check-offs: the sign-off queue, or the whole history with filters. */
export default function ResultsTab({ results, mode, uid, onOpen, emptyMessage = "No check-offs recorded yet." }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const q = query.trim().toLowerCase();
  const shown = results.filter((r) => (!q || [r.unitDesignation, r.templateName, r.operatorName, r.station].join(" ").toLowerCase().includes(q))
    && (!status || (status === "problems" ? (r.problemCounts?.equipment || r.problemCounts?.supplies || r.result === "Failed") : r.verification?.status === status)));

  return (
    <>
      {mode === "history" ? (
        <section className="cert-toolbar">
          <label className="config-field">
            <span>Search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Unit, checklist or person" />
          </label>
          <label className="config-field">
            <span>Show</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="problems">With failed items or EMS problems</option>
              <option value="pending">Waiting for sign-off</option>
              <option value="verified">Signed off</option>
              <option value="returned">Sent back</option>
            </select>
          </label>
        </section>
      ) : (
        <p className="occupancy-muted ems-hint">Open a check-off to review it, then sign it off or send it back. You can't sign off your own.</p>
      )}
      <div className="data-table-wrap">
        <table>
          <thead>
            <tr><th>Finished</th><th>Unit</th><th>Check-off</th><th>Result</th><th>EMS problems</th><th>Done by</th><th>Sign-off</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><button type="button" className="link-button" onClick={() => onOpen(r.id)}>{r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</button></td>
                <td>{r.unitDesignation}</td>
                <td>{r.templateName}</td>
                <td><span className={`badge badge-${r.result === "Failed" ? "critical" : "success"}`}>{r.result || "Done"}</span></td>
                <td>{problemText(r)}</td>
                <td>{r.operatorName}{r.operatorUid === uid ? " (you)" : ""}</td>
                <td>{verificationBadge(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <div className="empty-table">{results.length ? "No check-offs match." : emptyMessage}</div> : null}
      </div>
    </>
  );
}
