import { useState } from "react";
import { ALERT_CATEGORIES, ALERT_SEVERITIES } from "../../lib/preplans/alertModel.js";
import { reportAlert } from "../../lib/preplans/alertService.js";

const SEVERITY_LABELS = { critical: "Critical", high: "High", moderate: "Moderate", low: "Low" };

/**
 * Report an operational alert (a current condition responders should know).
 * It is saved as "reported" unless `canVerify` and the reporter ticks
 * "I've confirmed this" (the rules check approver permission either way).
 *
 * @param {{departmentId:string, context:{preplanId?:string, occupancyId?:string, inspectionId?:string,
 *   violationId?:string, buildingId?:string, floorId?:string, objectId?:string, source?:string},
 *   defaults?:{category?:string, severity?:string, description?:string}, canVerify?:boolean,
 *   actor:object, onSaved?:(alert:object)=>void, onCancel?:()=>void, onError?:(msg:string)=>void}} props
 */
export default function AlertReportForm({ departmentId, context = {}, defaults = {}, canVerify = false, actor = {}, onSaved, onCancel, onError }) {
  const [category, setCategory] = useState(defaults.category || "other");
  const [severity, setSeverity] = useState(defaults.severity || "moderate");
  const [description, setDescription] = useState(defaults.description || "");
  const [reviewBy, setReviewBy] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!description.trim()) { onError?.("Describe the condition."); return; }
    setBusy(true);
    try {
      const alert = await reportAlert(departmentId, {
        ...context,
        source: context.source || "manual",
        category,
        severity,
        description: description.trim(),
        reviewBy,
      }, actor, { verified: canVerify && verified });
      onSaved?.(alert);
    } catch (error) {
      onError?.(error?.message || "Couldn't save the alert.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pal-form" onSubmit={submit}>
      <div className="pal-form-row">
        <label>
          Type
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {ALERT_CATEGORIES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </label>
        <label>
          Severity
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            {ALERT_SEVERITIES.map((row) => <option key={row} value={row}>{SEVERITY_LABELS[row]}</option>)}
          </select>
        </label>
        <label>
          Check again by
          <input type="date" value={reviewBy} onChange={(event) => setReviewBy(event.target.value)} />
        </label>
      </div>
      <label>
        What responders need to know
        <textarea rows={3} maxLength={2000} value={description} required
          placeholder="e.g. Riser control valve for the east wing is closed and chained."
          onChange={(event) => setDescription(event.target.value)} />
      </label>
      {canVerify ? (
        <label className="pal-check">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          I&apos;ve confirmed this condition (shows as verified)
        </label>
      ) : (
        <p className="fpe-muted">It shows as &quot;reported, not verified&quot; until a preplan approver confirms it.</p>
      )}
      <div className="spm-row">
        {onCancel ? <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button> : null}
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save alert"}</button>
      </div>
    </form>
  );
}
