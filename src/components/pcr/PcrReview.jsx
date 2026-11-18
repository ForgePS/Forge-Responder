/**
 * Review step of a patient care report in the RMS: what's left before posting, the server NEMSIS check, export,
 * print and unlock. PHI: opening, printing, exporting and unlocking are written to the audit log (report number only).
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Download, EyeOff, Lightbulb, Loader2, LockOpen, Printer, ShieldCheck, X } from "lucide-react";
import { PCR_SECTIONS, pcrXml, sectionForPath } from "../../lib/nemsis/pcrModel.js";
import { pcrPrintHtml } from "../../lib/nemsis/pcrPrint.js";
import { emsSettingsAgency, missingEmsSettings } from "../../lib/nemsis/emsSettings.js";
import { checkPcrOnServer, recordPcrExport, recordPcrPrint, unlockPcr } from "../../lib/pcrService.js";
import { FEEDBACK_KINDS, feedbackKind } from "../../lib/pcr/pcrQuality.js";
import { handoffHtml, handoffSummary } from "../../lib/pcr/pcrHandoff.js";
import { verifyPosted } from "../../lib/pcr/pcrLifecycle.js";
import PcrQaPanel from "./PcrQaPanel.jsx";

/** Which of the three kinds of feedback an issue is: NEMSIS, department, or a suggestion. */
export function KindTag({ kind }) {
  return <span className={`pcr-kind pcr-kind-${kind}`}>{FEEDBACK_KINDS[kind]?.label || kind}</span>;
}

export function formatWhen(value) {
  if (!value) return "";
  const t = Date.parse(value);
  return Number.isNaN(t) ? String(value) : new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function friendlyError(error, fallback) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return "You don't have permission to do that.";
  if (code.includes("not-found")) return "That report wasn't found, or you can't open it.";
  if (code.includes("failed-precondition")) return error.message || fallback;
  return fallback;
}

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Posted, but the server NEMSIS check (run on post) found errors. */
export const needsReview = (report) => report.status === "posted" && report.nemsisCheck?.ok === false;

export default function PcrReview({
  schema, report, check, settings, departmentId, actor, uid, canUnlock, canExport, canReview = false,
  suggestions = [], dismissedCount = 0, onDismiss = null, onChange, onMessage, onError, onGoTo,
}) {
  const [busy, setBusy] = useState("");
  const [intact, setIntact] = useState(null);
  const [serverCheck, setServerCheck] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const nemsis = report.nemsis || {};
  const posted = report.status === "posted";
  const missingAgency = missingEmsSettings(settings);
  const lastCheck = report.nemsisCheck;
  const lastCheckStale = lastCheck?.at && report.updatedAt && lastCheck.at < report.updatedAt;

  // Tamper check: does the posted content still match the hash stored when it was posted?
  useEffect(() => {
    let live = true;
    if (!posted || !report.postedHash) {
      setIntact(null);
      return undefined;
    }
    verifyPosted(report).then((ok) => { if (live) setIntact(ok); }).catch(() => { if (live) setIntact(null); });
    return () => { live = false; };
  }, [posted, report]);

  const handoff = async () => {
    const win = window.open("", "_blank");
    if (!win) {
      onError("The handoff view was blocked. Allow pop-ups for this site and try again.");
      return;
    }
    try {
      await recordPcrPrint(departmentId, report, actor);
      win.document.open();
      win.document.write(handoffHtml(handoffSummary(schema, report), { agencyName: settings.agencyName, printedBy: actor?.actorName, printedAt: formatWhen(new Date().toISOString()) }));
      win.document.close();
      win.focus();
    } catch (err) {
      win.close();
      onError(friendlyError(err, "The handoff view couldn't be opened."));
    }
  };

  const runCheck = async () => {
    setBusy("check");
    try {
      const result = await checkPcrOnServer(departmentId, report.id);
      setServerCheck(result);
      onChange({ nemsisCheck: { at: new Date().toISOString(), ok: result.ok, errorCount: result.errorCount, warningCount: result.warningCount, trigger: "manual" } }, { saved: true });
      onMessage(result.ok ? "NEMSIS check passed." : "NEMSIS check finished with issues (listed below).");
    } catch (err) {
      onError(friendlyError(err, "The NEMSIS check couldn't run. Try again in a minute."));
    } finally {
      setBusy("");
    }
  };

  const exportXml = async () => {
    setBusy("export");
    try {
      const xml = pcrXml(schema, { agency: emsSettingsAgency(settings), pcr: { ...nemsis, attrs: { ...(nemsis.attrs || {}), UUID: nemsis.attrs?.UUID || report.uuid } } });
      await recordPcrExport(departmentId, report, actor);
      downloadText(`PCR-${report.number || report.id}.xml`, xml, "application/xml");
      onMessage("NEMSIS XML downloaded. It contains patient information: store and send it securely.");
    } catch (err) {
      onError(friendlyError(err, "The report couldn't be exported."));
    } finally {
      setBusy("");
    }
  };

  const print = async () => {
    // Open the window in the click so pop-up blockers allow it, then fill it.
    const win = window.open("", "_blank");
    if (!win) {
      onError("The print view was blocked. Allow pop-ups for this site and try again.");
      return;
    }
    try {
      await recordPcrPrint(departmentId, report, actor);
      win.document.open();
      win.document.write(pcrPrintHtml(schema, report, { agencyName: settings.agencyName, printedBy: actor?.actorName, printedAt: new Date().toISOString(), when: formatWhen }));
      win.document.close();
      win.focus();
      win.print();
    } catch (err) {
      win.close();
      onError(friendlyError(err, "The print view couldn't be opened."));
    }
  };

  const unlock = async (reason) => {
    setBusy("unlock");
    try {
      const next = await unlockPcr(departmentId, report, actor, reason);
      onChange(next, { saved: true, replace: true });
      setUnlocking(false);
      onMessage("Report unlocked. It can be edited here, and in FORGE FIELD the next time the crew opens it with signal.");
    } catch (err) {
      onError(friendlyError(err, "The report couldn't be unlocked."));
    } finally {
      setBusy("");
    }
  };

  const sectionLabel = (path) => PCR_SECTIONS.find((s) => s.id === sectionForPath(path))?.label || "Report";

  return (
    <>
      <section className="nr-section">
        <header>
          <div className="nr-section-title">
            <span className="nr-section-icon">{check.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span>
            <div>
              <h3>{posted ? "Posted" : check.ok ? "Ready to post" : `${check.blocking.length} to fix before posting`}</h3>
              <p>
                {posted
                  ? `Posted ${formatWhen(report.postedAt)}${report.postedByName ? ` by ${report.postedByName}` : ""}. The report is locked${canUnlock ? "; unlock it to amend it" : ""}.`
                  : check.ok
                    ? `Every NEMSIS and department check passes.${check.warnings.length ? ` ${check.warnings.length} recommended field${check.warnings.length === 1 ? " is" : "s are"} empty and will be sent as Not Recorded.` : ""}`
                    : "Click one to go to it."}
              </p>
            </div>
          </div>
        </header>
        {!posted && check.blocking.length ? (
          <ul className="pcr-issues">
            {check.blocking.map((issue, i) => (
              <li key={`${issue.path}-${issue.code}-${i}`}>
                <button type="button" onClick={() => onGoTo(sectionForPath(issue.path))}>
                  <span className="nr-dot nr-dot-bad" />
                  <span><strong>{sectionLabel(issue.path)}:</strong> {issue.message}</span>
                  <KindTag kind={feedbackKind(issue)} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {report.unlockReason ? <p className="nr-muted">Unlocked {formatWhen(report.unlockedAt)} by {report.unlockedBy || "a supervisor"}: {report.unlockReason}</p> : null}
        {posted && intact !== null ? (
          <p className={`nr-muted pcr-tamper ${intact ? "ok" : "bad"}`}>
            <ShieldCheck size={14} /> {intact ? "The content matches what was posted." : "The content no longer matches what was posted. Tell your administrator."}
          </p>
        ) : null}
      </section>

      {suggestions.length || dismissedCount ? (
        <section className="nr-section">
          <header>
            <div className="nr-section-title">
              <span className="nr-section-icon"><Lightbulb size={16} /></span>
              <div>
                <h3>Documentation suggestions</h3>
                <p>Optional checks on what&apos;s charted. They never block posting and never change the report.{dismissedCount ? ` ${dismissedCount} dismissed.` : ""}</p>
              </div>
            </div>
          </header>
          {suggestions.length ? (
            <ul className="pcr-suggestions">
              {suggestions.map((item) => (
                <li key={item.id}>
                  <KindTag kind="suggestion" />
                  <span>{item.message}</span>
                  <div>
                    {item.path ? <button type="button" className="nr-btn nr-btn-soft nr-small" onClick={() => onGoTo(sectionForPath(item.path))}>Go to it</button> : null}
                    {onDismiss ? <button type="button" className="nr-btn nr-btn-ghost nr-small" onClick={() => onDismiss(item.id)} title="Hide this suggestion on this report"><EyeOff size={14} /> Dismiss</button> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="nr-muted">No open suggestions.</p>}
        </section>
      ) : null}

      <section className="nr-section">
        <header>
          <div className="nr-section-title">
            <span className="nr-section-icon"><ShieldCheck size={16} /></span>
            <div>
              <h3>NEMSIS check, export and print</h3>
              <p>The full check runs the national and state rules on the server. It runs by itself when a report is posted.</p>
            </div>
          </div>
        </header>
        <div className="pcr-review-actions">
          <button className="nr-btn nr-btn-soft" type="button" onClick={runCheck} disabled={Boolean(busy)}>
            {busy === "check" ? <Loader2 size={15} className="nr-spin" /> : <ShieldCheck size={15} />} {busy === "check" ? "Checking…" : "Run NEMSIS check"}
          </button>
          {canExport ? (
            <button className="nr-btn nr-btn-soft" type="button" onClick={exportXml} disabled={Boolean(busy) || missingAgency.length > 0} title={missingAgency.length ? "Add the EMS agency details first" : "Download NEMSIS 3.5.1 XML"}>
              <Download size={15} /> Export XML
            </button>
          ) : null}
          <button className="nr-btn nr-btn-soft" type="button" onClick={print} disabled={Boolean(busy)}><Printer size={15} /> Print</button>
          <button className="nr-btn nr-btn-soft" type="button" onClick={handoff} disabled={Boolean(busy)} title="A one-page summary for the receiving facility"><ClipboardList size={15} /> Hospital handoff</button>
          {canUnlock && posted ? (
            <button className="nr-btn nr-btn-ghost" type="button" onClick={() => setUnlocking(true)} disabled={Boolean(busy)}><LockOpen size={15} /> Unlock</button>
          ) : null}
        </div>
        {canExport && missingAgency.length ? <p className="nr-note">Export needs the EMS agency details: {missingAgency.join(", ")}.</p> : null}
        {needsReview(report) && !serverCheck ? (
          <p className="nr-error" role="alert"><AlertTriangle size={14} /> Posted with NEMSIS errors. Run the NEMSIS check to see them{canUnlock ? ", then unlock the report so it can be fixed" : ""}.</p>
        ) : null}
        {lastCheck && !serverCheck ? (
          <p className="nr-muted">
            Last NEMSIS check{lastCheck.trigger === "post" ? " (on posting)" : ""} {formatWhen(lastCheck.at)}:{" "}
            {lastCheck.ok ? "passed" : `${lastCheck.errorCount} error${lastCheck.errorCount === 1 ? "" : "s"}`}
            {lastCheck.missingAgency ? " (agency settings incomplete)" : ""}
            {lastCheckStale ? " (the report changed since)" : ""}
          </p>
        ) : null}
        {serverCheck ? <ServerCheckResult result={serverCheck} /> : null}
      </section>

      <PcrQaPanel
        schema={schema}
        report={report}
        departmentId={departmentId}
        actor={actor}
        uid={uid}
        canReview={canReview}
        onChange={onChange}
        onMessage={onMessage}
        onError={onError}
      />

      {unlocking ? <UnlockDialog busy={busy === "unlock"} onClose={() => setUnlocking(false)} onConfirm={unlock} /> : null}
    </>
  );
}

function ServerCheckResult({ result }) {
  const errors = (result.findings || []).filter((f) => f.severity === "error");
  const warnings = (result.findings || []).filter((f) => f.severity !== "error");
  return (
    <div className="pcr-server-check">
      <p>
        <strong>NEMSIS check ({result.schemaVersion || "3.5.1"}):</strong>{" "}
        {result.ok ? "passed" : `${result.errorCount} error${result.errorCount === 1 ? "" : "s"}`}
        {result.warningCount ? `, ${result.warningCount} warning${result.warningCount === 1 ? "" : "s"}` : ""}
      </p>
      {result.missingAgency?.length ? <p className="nr-error">Agency settings missing: {result.missingAgency.join(", ")}.</p> : null}
      {errors.length || warnings.length || result.blocking?.length ? (
        <ul className="pcr-issues pcr-issues-plain">
          {(result.blocking || []).map((issue, i) => <li key={`b-${i}`}><span className="nr-status nr-status-returned">Error</span> {issue.message}</li>)}
          {errors.map((f, i) => <li key={`e-${i}`}><span className="nr-status nr-status-returned">Error</span> {f.message}</li>)}
          {warnings.map((f, i) => <li key={`w-${i}`}><span className="nr-status nr-status-review">Warning</span> {f.message}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function UnlockDialog({ busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <div className="nr-dialog-backdrop" onClick={onClose}>
      <div className="nr-dialog" role="dialog" aria-modal="true" aria-label="Unlock this report" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Unlock this report?</h2>
          <button type="button" className="nr-icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <p className="nr-muted">The posted version is kept unchanged in the report&apos;s history. The report goes back to draft so it can be amended; when it&apos;s posted again, every change is recorded with this reason.</p>
        <div className="nr-field nr-wide">
          <span className="nr-label">Reason</span>
          <textarea className="nr-input nr-textarea" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Add the second set of vitals" />
        </div>
        <div className="pcr-dialog-actions">
          <button className="nr-btn nr-btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="nr-btn nr-btn-primary" type="button" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
