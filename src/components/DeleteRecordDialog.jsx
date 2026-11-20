import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  DELETE_REASONS,
  MAX_DELETE_NOTES,
  OTHER_DELETE_REASON,
  deleteReasonProblem,
} from "../lib/recordDeletionReasons.js";
import { deleteRecordWithReason } from "../lib/recordDeletionService.js";
import { friendlyError } from "../lib/friendlyError.js";

const NOUN = { inspection: "inspection", preplan: "preplan" };

/**
 * Administrators delete an inspection or preplan. The reason comes from a fixed
 * list; who, when and why go in the audit log with a copy of the record.
 */
export default function DeleteRecordDialog({ open, kind, departmentId, recordId, label, onCancel, onDeleted }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  const noun = NOUN[kind] || "record";
  const problem = deleteReasonProblem(reason, notes);

  function close() {
    if (busy) return;
    setReason("");
    setNotes("");
    setError("");
    onCancel?.();
  }

  async function confirm() {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await deleteRecordWithReason(departmentId, { kind, recordId, reason, notes: notes.trim() });
      setReason("");
      setNotes("");
      onDeleted?.({ ...result, reason, notes: notes.trim() });
    } catch (deleteError) {
      setError(friendlyError(deleteError, `Couldn't delete this ${noun}.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="workflow-modal" role="dialog" aria-modal="true" aria-label={`Delete ${noun}`}>
        <header>
          <strong>Delete {noun}</strong>
          <button type="button" className="icon-button" aria-label="Close" onClick={close} disabled={busy}>×</button>
        </header>
        <div className="modal-content">
          <p>
            <strong>{label || recordId}</strong> will be removed from the RMS
            {kind === "preplan" ? ", with all of its revisions" : ""}. A copy, who deleted it, when and why are
            kept in the audit log.
          </p>
          <label className="config-field">
            <span>Reason for deleting</span>
            <select value={reason} disabled={busy} onChange={(e) => { setReason(e.target.value); setError(""); }}>
              <option value="">Choose a reason…</option>
              {DELETE_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>Notes{reason === OTHER_DELETE_REASON ? " (required)" : " (optional)"}</span>
            <textarea
              rows={3}
              maxLength={MAX_DELETE_NOTES}
              value={notes}
              disabled={busy}
              onChange={(e) => { setNotes(e.target.value); setError(""); }}
              placeholder="Anything that explains the deletion"
            />
          </label>
          {error ? <p className="checklist-field-error" role="alert">{error}</p> : null}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={close} disabled={busy}>Cancel</button>
            <button className="primary-button" type="button" onClick={confirm} disabled={busy || Boolean(problem)}>
              <Trash2 size={14} /> {busy ? "Deleting…" : `Delete ${noun}`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
