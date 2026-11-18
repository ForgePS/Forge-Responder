import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { friendlyError } from "../../lib/friendlyError.js";
import {
  MAX_REPORT_RECIPIENTS,
  emailInspectionReport,
  occupancyEmails,
  parseRecipients,
} from "../../lib/inspections/inspectionEmailService.js";

function formatWhen(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

/** Email a completed inspection's report (PDF) to the occupancy. */
export default function InspectionEmailPanel({ record, occupancy, departmentId }) {
  const suggested = occupancyEmails(occupancy || record?.occupancySnapshot);
  const [to, setTo] = useState(suggested.join(", "));
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setTo(occupancyEmails(occupancy || record?.occupancySnapshot).join(", "));
    setNote("");
    setError("");
    setSent([]);
    setNotice("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const history = [...(record?.emailDeliveries || []), ...sent]
    .filter((row, index, all) => all.findIndex((r) => r.sentAt === row.sentAt) === index)
    .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));

  async function send() {
    const { recipients, invalid } = parseRecipients(to);
    if (invalid.length) { setError(`Check this email address: ${invalid[0]}`); return; }
    if (!recipients.length) { setError("Add at least one email address."); return; }
    if (recipients.length > MAX_REPORT_RECIPIENTS) { setError(`Send to ${MAX_REPORT_RECIPIENTS} addresses or fewer.`); return; }
    setSending(true);
    setError("");
    setNotice("");
    try {
      const result = await emailInspectionReport(departmentId, record.id, { to: recipients, note });
      setSent((current) => [...current, { to: result.recipients || recipients, status: result.status, sentAt: result.sentAt || new Date().toISOString() }]);
      setNote("");
      setNotice(result.message || `Report emailed to ${(result.recipients || recipients).join(", ")}.`);
    } catch (sendError) {
      setError(friendlyError(sendError, "The report couldn't be emailed. Try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="occupancy-section inspection-email-panel">
      <h4><Mail size={14} /> Email report to occupancy</h4>
      <p className="occupancy-muted">
        Sends a PDF copy of this inspection, including answers, remarks and violations. The sender name,
        reply-to address, copies and signature come from Configuration Studio → Module settings.
      </p>
      <div className="occupancy-form-grid">
        <label className="config-field">
          <span>To</span>
          <input
            type="text"
            inputMode="email"
            value={to}
            placeholder="owner@business.com, manager@business.com"
            onChange={(e) => setTo(e.target.value)}
            disabled={sending}
          />
          {!suggested.length ? (
            <small className="occupancy-muted">This occupancy has no email on file. Add one on the occupancy to fill this in next time.</small>
          ) : null}
        </label>
        <label className="config-field">
          <span>Note (optional)</span>
          <textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} disabled={sending} />
        </label>
      </div>
      <div className="occupancy-detail-actions">
        <button className="primary-button" type="button" disabled={sending || !to.trim()} onClick={send}>
          <Mail size={14} /> {sending ? "Sending…" : "Email report"}
        </button>
      </div>
      {notice ? <p className="occupancy-muted" role="status">{notice}</p> : null}
      {error ? <div className="inspections-error-state" role="alert"><p>{error}</p></div> : null}
      {history.length ? (
        <ul className="inspection-email-history">
          {history.map((row) => (
            <li key={row.sentAt}>
              {row.status === "sent" || row.status === "logged" ? "Sent" : "Not sent"} to {(row.to || []).join(", ")}
              <small className="occupancy-muted"> · {formatWhen(row.sentAt)}{row.sentBy ? ` · ${row.sentBy}` : ""}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
