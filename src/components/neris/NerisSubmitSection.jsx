import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, Send } from "lucide-react";
import { Field, Section, TextInput } from "./NerisControls.jsx";
import { getNerisConnection, submitNerisIncident } from "../../lib/nerisConnectionService.js";

function formatWhen(iso = "") {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/**
 * "Submit to NERIS" on the report's Review step.
 * Connected departments send straight to NERIS (first time creates the
 * incident, later sends are corrections). Otherwise the old manual flow:
 * enter it in the NERIS portal, then record it here.
 */
export default function NerisSubmitSection({ report, departmentId, canEdit, ready, approvedForSubmit, onSubmitted, onRecordSubmission, onUpdateModule }) {
  const [connection, setConnection] = useState(null);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!departmentId) return undefined;
    let active = true;
    getNerisConnection(departmentId)
      .then((next) => { if (active) setConnection(next); })
      .catch(() => { if (active) setConnection({ status: "unavailable" }); });
    return () => { active = false; };
  }, [departmentId]);

  const submission = report.nerisSubmission || null;
  const isCorrection = Boolean(submission?.nerisIncidentId);
  const submitted = report.status === "Submitted";
  const connected = connection?.status === "connected";
  const canSend = canEdit && approvedForSubmit && ready && !submitted;

  async function run(mode) {
    if (mode === "submit" && !window.confirm(isCorrection
      ? `Send the corrected ${report.reportNumber} to NERIS? This replaces what NERIS has for this incident.`
      : `Submit ${report.reportNumber} to NERIS? The report will be locked.`)) return;
    setBusy(mode);
    setError("");
    setResult(null);
    try {
      const response = await submitNerisIncident(departmentId, report, mode);
      setResult(response);
      if (response.ok && mode === "submit" && response.submission) onSubmitted?.(response.submission);
    } catch (err) {
      setError(err.message || "Couldn't reach NERIS. Try again.");
    } finally {
      setBusy("");
    }
  }

  const problems = result && !result.ok ? result.problems || [] : [];
  const warnings = result?.warnings || [];

  return (
    <Section title="Submit to NERIS" icon={Send}>
      {submitted ? (
        <div className="nr-wide nr-neris-submitted">
          <span className="nr-pill nr-pill-ok">
            <CheckCircle2 size={13} />
            {report.submissionMethod === "neris-api" ? "Sent to NERIS" : "Recorded as submitted"} {formatWhen(report.submittedAt)}
          </span>
          {submission?.nerisIncidentId ? (
            <p className="nr-muted">
              NERIS incident ID <code>{submission.nerisIncidentId}</code>
              {submission.environment === "test" ? " (test sandbox)" : ""}
              {submission.history?.length > 1 ? ` · sent ${submission.history.length} times` : ""}
            </p>
          ) : null}
          {canEdit ? <p className="nr-muted">To correct it, unlock the report, make the changes and approve it again. Then send the correction.</p> : null}
        </div>
      ) : connection === null ? (
        <p className="nr-wide nr-muted"><Loader2 size={14} className="nr-spin" /> Checking the NERIS connection…</p>
      ) : connected ? (
        <>
          <p className="nr-wide nr-muted">
            {isCorrection
              ? `NERIS already has this incident (${submission.nerisIncidentId}). Sending again replaces it with this corrected version.`
              : "FORGE checks the report with NERIS first, then submits it. Approve the report to send it."}
            {connection.environment === "test" ? " This department uses the NERIS test sandbox." : ""}
          </p>
          {canEdit ? (
            <div className="nr-actions nr-wide">
              <button type="button" className="nr-btn nr-btn-soft" disabled={!canSend || Boolean(busy)} onClick={() => run("validate")}>
                {busy === "validate" ? <Loader2 size={15} className="nr-spin" /> : <Search size={15} />} Check with NERIS
              </button>
              <button type="button" className="nr-btn nr-btn-primary" disabled={!canSend || Boolean(busy)} title={approvedForSubmit ? "" : "The report must be approved first"} onClick={() => run("submit")}>
                {busy === "submit" ? <Loader2 size={15} className="nr-spin" /> : <Send size={15} />} {isCorrection ? "Send correction to NERIS" : "Submit to NERIS"}
              </button>
            </div>
          ) : null}
          {canEdit && !isCorrection ? (
            <button type="button" className="nr-link nr-wide" disabled={!canSend} onClick={onRecordSubmission}>
              Entered it in the NERIS portal instead? Record it as submitted
            </button>
          ) : null}
        </>
      ) : (
        <>
          <p className="nr-wide nr-muted">
            This department isn't connected to NERIS, so enter the report in the NERIS portal and record the submission here.
            An administrator can connect FORGE under System Admin → Connected Services.
          </p>
          <Field label="NERIS incident ID (from the portal)">
            <TextInput value={report.modules?.core_mod_incident?.incident_neris_id} disabled={!canEdit} placeholder="Shown after you submit in NERIS" onChange={(v) => onUpdateModule("core_mod_incident", "incident_neris_id", v)} />
          </Field>
          {canEdit ? (
            <div className="nr-actions nr-wide">
              <button type="button" className="nr-btn nr-btn-primary" disabled={!canSend} title={approvedForSubmit ? "" : "The report must be approved first"} onClick={onRecordSubmission}><Send size={15} /> Record NERIS submission</button>
            </div>
          ) : null}
        </>
      )}

      {result?.ok && result.validated ? (
        <p className="nr-wide nr-neris-ok"><CheckCircle2 size={14} /> NERIS accepted the report. It's ready to submit.</p>
      ) : null}
      {result?.ok && result.action ? (
        <p className="nr-wide nr-neris-ok"><CheckCircle2 size={14} /> {result.action === "create" ? "Submitted to NERIS." : "Correction sent to NERIS."}</p>
      ) : null}
      {problems.length ? (
        <div className="nr-wide nr-neris-problems">
          <strong><AlertTriangle size={14} /> {result.stage === "forge" ? "Fix these before sending:" : "NERIS didn't accept the report:"}</strong>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      ) : null}
      {warnings.length ? (
        <ul className="nr-wide nr-neris-warnings">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      ) : null}
      {error ? <p className="nr-wide nr-error">{error}</p> : null}
    </Section>
  );
}
