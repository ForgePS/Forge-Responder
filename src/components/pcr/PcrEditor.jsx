/**
 * Patient care report editor in the RMS (desktop), in the NERIS editor's look: Call → Scene and patient →
 * Assessment → Treatment → Disposition → Narrative → Sign and post.
 *
 * Saved to Firestore as you type (a short pause after the last change). The save merges section by section with
 * any change made elsewhere (a crew device, another screen) since the report was opened; a section changed in both
 * places is shown as a conflict to resolve. Posting is blocked until NEMSIS and the department's required fields
 * pass. CAD: import a call, and refresh when CAD has newer times (hand edits are kept).
 */
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Ambulance, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Clock, Download,
  HeartPulse, Lightbulb, Loader2, Lock, MapPin, Radio, RefreshCw, ShieldCheck, Sparkles, Stethoscope, Syringe, TriangleAlert, User,
  Wifi, WifiOff,
} from "lucide-react";
import { Field, ProgressRing, TextInput } from "../neris/NerisControls.jsx";
import { PcrSectionCard } from "./PcrFields.jsx";
import PcrNarrativePanel from "./PcrNarrativePanel.jsx";
import PcrReview, { formatWhen, friendlyError } from "./PcrReview.jsx";
import { PcrCadImportDialog } from "./PcrCadDialogs.jsx";
import PcrVitalsTrend from "./PcrVitalsTrend.jsx";
import PcrBillingFiles from "./PcrBillingFiles.jsx";
import { documentationSuggestions, openSuggestions } from "../../lib/pcr/pcrQuality.js";
import { qaStatus, reportStatus, submissionStatus } from "../../lib/pcr/pcrLifecycle.js";
import { fieldPath, getValue, postCheck, sectionForPath, sectionLayout, sectionProgress, setLeaf } from "../../lib/nemsis/pcrModel.js";
import { pcrMergePaths } from "../../field/fieldPcr.js";
import { postIssues, rebaseEdits } from "../../lib/pcr/pcrEditing.js";
import { customizeLayout, visibleSections, withDepartmentIssues } from "../../lib/pcr/pcrForm.js";
import { applyCadChanges, cadLink, cadRefresh } from "../../lib/pcr/pcrCad.js";
import { requestPcrNarrative, savePcr } from "../../lib/pcrService.js";

export const STEPS = [
  { id: "call", label: "Incident", description: "Dispatch, response, crew, times and scene", icon: Radio, sections: ["dispatch", "response", "crew", "times", "scene"] },
  { id: "patient", label: "Patient", description: "Who the patient is and their history", icon: User, sections: ["patient", "history"] },
  { id: "assessment", label: "Assessment", description: "Complaint, impression, injury, arrest, exam", icon: Stethoscope, sections: ["situation", "injury", "arrest", "exam", "labs"] },
  { id: "vitals", label: "Vitals", description: "Every set of vital signs, with the trend", icon: HeartPulse, sections: ["vitals"] },
  { id: "treatment", label: "Treatment", description: "Protocols, medications, procedures", icon: Syringe, sections: ["protocols", "medications", "procedures", "airway", "devices"] },
  { id: "disposition", label: "Transport", description: "Disposition, destination, billing", icon: Ambulance, sections: ["disposition", "payment", "outcome"] },
  { id: "narrative", label: "Narrative", description: "Written with the AI narrator", icon: Sparkles, sections: ["narrative"] },
  { id: "review", label: "Review and sign", description: "Signatures, checks, posting", icon: ClipboardCheck, sections: ["other", "record"] },
];

const SECTION_ICONS = { vitals: HeartPulse, times: Clock, scene: MapPin, situation: Activity, medications: Syringe, procedures: Syringe, disposition: Ambulance, dispatch: Radio };
const AUTOSAVE_MS = 1500;
const CAD_POLL_MS = 60_000;

export const stepForSection = (sectionId) => STEPS.find((s) => s.sections.includes(sectionId))?.id || "review";

export default function PcrEditor({
  schema, form, settings, initial, departmentId, uid, actor, canEdit, canUnlock, canExport, canReview = false, online,
  cadRecords, cadLoading, onReloadCad, onSaved, onClose, onMessage, onError,
}) {
  const [report, setReport] = useState(initial);
  const [base, setBase] = useState(initial);
  const [save, setSave] = useState({ state: "saved", at: initial.updatedAt || "" });
  const [stepId, setStepId] = useState(initial.status === "posted" ? "review" : "call");
  const [cadOpen, setCadOpen] = useState(false);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const saving = useRef(null);

  const mergePaths = useMemo(() => [...pcrMergePaths(schema), "cad", "aiNarrative", "qualityDismissed"], [schema]);
  const posted = report.status === "posted";
  const onCrew = (report.crewUids || []).includes(uid);
  const editable = !posted && ((canEdit && onCrew) || canUnlock);
  const readOnly = !editable;

  // ---- editing and saving ------------------------------------------------------------------------------------
  /** Apply a change to the working copy: a patch or (current) => patch. */
  const update = useCallback((change) => {
    revision.current += 1;
    setReport((current) => {
      const patch = typeof change === "function" ? change(current) : change;
      const next = { ...current, ...patch };
      // The list's incident number and unit follow the NEMSIS fields.
      next.incidentNumber = String(getValue(schema, next.nemsis || {}, "eResponse.03") ?? next.incidentNumber ?? "");
      return next;
    });
    setSave((s) => (s.state === "conflict" ? s : { ...s, state: "dirty" }));
  }, [schema]);
  const setPcr = useCallback((fn) => update((current) => ({ nemsis: fn(current.nemsis || {}) })), [update]);

  const reportRef = useRef(report);
  reportRef.current = report;
  const baseRef = useRef(base);
  baseRef.current = base;

  const doSave = useCallback(async ({ post = false, keepMine = false } = {}) => {
    if (readOnly && !post) return true;
    if (saving.current) await saving.current.catch(() => undefined);
    const startedAt = revision.current;
    const mine = reportRef.current;
    setSave((s) => ({ ...s, state: "saving" }));
    // Posting re-checks the merged chart, which can include changes saved elsewhere since this screen checked it.
    const postGate = post ? (record) => postIssues(schema, form, record.nemsis || {}, record.aiNarrative).blocking : undefined;
    const run = savePcr(departmentId, { base: baseRef.current, mine, mergePaths, actor, post, keepMine, postGate });
    saving.current = run;
    try {
      const result = await run;
      if (!result.saved) {
        setSave({ state: "conflict", conflicts: result.conflicts, server: result.server });
        return false;
      }
      savedRevision.current = startedAt;
      setBase(result.saved);
      // Show what was stored (it can include sections changed elsewhere). Anything typed while the save was running
      // is kept on top of it, so the next save doesn't mistake the stored sections for edits and write them back.
      if (revision.current === startedAt) setReport(result.saved);
      else {
        setReport((current) => {
          const next = rebaseEdits(mine, current, result.saved, mergePaths);
          next.incidentNumber = String(getValue(schema, next.nemsis || {}, "eResponse.03") ?? next.incidentNumber ?? "");
          return next;
        });
      }
      onSaved(result.saved);
      setSave({ state: revision.current === startedAt ? "saved" : "dirty", at: result.saved.updatedAt });
      if (result.blocked) {
        // Saved, not posted: the merged chart (with another device's changes) has problems to fix first.
        const n = result.blocked.length;
        onMessage(`Not posted: this report was changed on another device and now has ${n} ${n === 1 ? "thing" : "things"} to fix before posting. Your changes were saved.`);
        return false;
      }
      return true;
    } catch (err) {
      setSave({ state: "error", message: friendlyError(err, "Couldn't save. Check your connection; your changes are still here.") });
      return false;
    } finally {
      saving.current = null;
    }
  }, [actor, departmentId, form, mergePaths, onMessage, onSaved, readOnly, schema]);

  useEffect(() => {
    if (save.state !== "dirty" || readOnly) return undefined;
    const timer = setTimeout(() => { doSave(); }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [report, save.state, readOnly, doSave]);

  // Don't lose typing when the tab closes.
  useEffect(() => {
    const warn = (event) => {
      if (save.state === "dirty" || save.state === "saving" || save.state === "conflict") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save.state]);

  // Leaving: anything not stored yet (typing, a failed save, a conflict, a save still running) is saved first, and
  // if that doesn't work the person has to choose to discard it.
  const close = async () => {
    if (saving.current) await saving.current.catch(() => undefined);
    const unsaved = !readOnly && (revision.current !== savedRevision.current || save.state === "conflict" || save.state === "error");
    if (unsaved && !(await doSave())
      && !window.confirm("Your latest changes aren't saved. Leave this report and discard them?")) return;
    onClose();
  };

  // ---- checks -------------------------------------------------------------------------------------------------
  const deferredNemsis = useDeferredValue(report.nemsis || {});
  const check = useMemo(() => postIssues(schema, form, deferredNemsis, report.aiNarrative), [schema, deferredNemsis, form, report.aiNarrative]);
  const allSuggestions = useMemo(() => documentationSuggestions(schema, deferredNemsis, form.vitalRanges ? { ranges: form.vitalRanges } : {}), [schema, deferredNemsis, form.vitalRanges]);
  const suggestions = useMemo(() => openSuggestions(allSuggestions, report.qualityDismissed), [allSuggestions, report.qualityDismissed]);
  const dismissSuggestion = (id) => update((current) => ({ qualityDismissed: [...new Set([...(current.qualityDismissed || []), id])] }));
  const progress = useMemo(() => sectionProgress(schema, deferredNemsis), [schema, deferredNemsis]);
  const sections = useMemo(() => visibleSections(schema, form), [schema, form]);
  const shownIds = useMemo(() => new Set(sections.map((s) => s.id)), [sections]);
  const layouts = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, customizeLayout(sectionLayout(schema, s.id), form)])), [schema, form, sections]);
  const blockingBySection = useMemo(() => {
    const out = {};
    for (const issue of check.blocking) out[sectionForPath(issue.path)] = (out[sectionForPath(issue.path)] || 0) + 1;
    return out;
  }, [check.blocking]);
  const stepStats = (step) => {
    const ids = step.sections.filter((id) => shownIds.has(id));
    const filled = ids.reduce((n, id) => n + (progress[id]?.filled || 0), 0);
    const total = ids.reduce((n, id) => n + (progress[id]?.total || 0), 0);
    const blocking = ids.reduce((n, id) => n + (blockingBySection[id] || 0), 0);
    return { filled, total, blocking };
  };
  const overall = sections.reduce((acc, s) => ({ filled: acc.filled + (progress[s.id]?.filled || 0), total: acc.total + (progress[s.id]?.total || 0) }), { filled: 0, total: 0 });
  const percent = overall.total ? Math.round((overall.filled / overall.total) * 100) : 0;

  const goTo = (id) => {
    setStepId(id);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };
  const goToSection = (sectionId) => {
    goTo(stepForSection(sectionId));
    setTimeout(() => document.getElementById(`pcr-section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  // ---- CAD ----------------------------------------------------------------------------------------------------
  const refresh = useMemo(() => (editable ? cadRefresh(schema, report, cadRecords) : null), [editable, schema, report, cadRecords]);
  useEffect(() => {
    if (!editable) return undefined;
    const timer = setInterval(() => onReloadCad({ sync: false, quiet: true }), CAD_POLL_MS);
    return () => clearInterval(timer);
  }, [editable, onReloadCad]);

  const applyCad = ({ record, unit, values, changes }) => {
    update((current) => ({
      nemsis: applyCadChanges(schema, current.nemsis || {}, changes),
      cad: cadLink(record, values),
      ...(unit && !current.unit ? { unit } : {}),
    }));
  };
  const checkCad = async () => {
    const records = await onReloadCad({ sync: true });
    const next = cadRefresh(schema, reportRef.current, records || []);
    if (!next) onMessage("CAD has no record of this call yet. Use Import from CAD to link one.");
    else if (!next.changes.length) onMessage("The report is up to date with CAD.");
  };

  // ---- posting ------------------------------------------------------------------------------------------------
  const post = async () => {
    if (!check.ok) {
      const first = check.blocking[0];
      if (first) goToSection(sectionForPath(first.path));
      return;
    }
    if (await doSave({ post: true })) onMessage(`${report.number} posted. The NEMSIS check runs on the server now.`);
  };

  const ctx = { schema, pcr: report.nemsis || {}, setPcr, issues: check.issues, readOnly };
  const step = STEPS.find((s) => s.id === stepId) || STEPS[0];
  const stepIndex = STEPS.indexOf(step);
  const stepSections = step.sections.filter((id) => shownIds.has(id)).map((id) => sections.find((s) => s.id === id));
  const unitOptions = [...new Set(cadRecords.flatMap((r) => (r.units || []).map((u) => u.id)))];

  return (
    <div className="nr-editor pcr-editor">
      <header className="nr-editor-head">
        <button type="button" className="nr-btn nr-btn-ghost" onClick={close}><ArrowLeft size={16} /> All reports</button>
        <div className="nr-editor-title">
          <h1>{report.number || "Patient care report"}</h1>
          <p>
            {report.unit ? <span><Ambulance size={13} /> {report.unit}</span> : null}
            {report.incidentNumber ? <span>Incident {report.incidentNumber}</span> : null}
            {report.cad?.description ? <span><Radio size={13} /> {report.cad.description}</span> : null}
            {settings?.agencyName ? <span>{settings.agencyName}</span> : null}
            {report.createdByName ? <span><User size={13} /> {report.createdByName}</span> : null}
            {report.createdAt ? <span>{formatWhen(report.createdAt)}</span> : null}
            <span>NEMSIS 3.5.1</span>
          </p>
        </div>
        <div className="nr-editor-status">
          <StatusChips report={report} check={check} online={online} />
          <SaveState save={save} readOnly={readOnly} onRetry={() => doSave()} />
          {!readOnly ? (
            <button type="button" className={`nr-btn ${check.ok ? "nr-btn-primary" : "nr-btn-soft"}`} onClick={post} disabled={save.state === "saving" || save.state === "conflict"} title={check.ok ? "Post the report" : "Go to the first thing left to do"}>
              {check.ok ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />} {check.ok ? "Post report" : `${check.blocking.length} left to post`}
            </button>
          ) : null}
        </div>
      </header>

      {save.state === "conflict" ? (
        <div className="nr-cad-update pcr-conflict" role="alert">
          <TriangleAlert size={18} />
          <div>
            <strong>Someone else changed this report at the same time</strong>
            <small>Both of you changed: {save.conflicts.map((p) => p.replace(/^nemsis\./, "")).join(", ")}. Nothing of yours was lost yet.</small>
          </div>
          <button type="button" className="nr-btn nr-btn-ghost" onClick={() => { setBase(save.server); setReport(save.server); setSave({ state: "saved", at: save.server?.updatedAt }); }}>Use their version</button>
          <button type="button" className="nr-btn nr-btn-primary" onClick={() => doSave({ keepMine: true })}>Keep mine</button>
        </div>
      ) : null}
      {!posted && !editable ? (
        <div className="nr-banner" role="status"><span>{canEdit ? "Only the crew on this report and supervisors can edit it." : "Your role can view this report but not chart."}</span></div>
      ) : null}

      <nav className="nr-stepper pcr-stepper" aria-label="Report steps">
        {STEPS.map((s, index) => {
          const st = stepStats(s);
          const complete = st.total > 0 && st.filled === st.total && !st.blocking;
          const Icon = s.icon;
          return (
            <button key={s.id} type="button" className={`nr-step${s.id === stepId ? " active" : ""}${complete ? " complete" : ""}`} onClick={() => goTo(s.id)} aria-current={s.id === stepId ? "step" : undefined}>
              <span className="nr-step-dot">{complete ? <Check size={14} /> : <Icon size={14} />}</span>
              <span className="nr-step-text">
                <strong>{index + 1}. {s.label}</strong>
                <small>{st.blocking ? `${st.blocking} to fix` : st.total ? `${st.filled} of ${st.total} done` : s.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="nr-body">
        <main className="nr-main">
          {refresh?.changes.length ? (
            <div className="nr-cad-update" role="status">
              <RefreshCw size={18} />
              <div>
                <strong>Updated CAD information{refresh.record.incidentNumber ? ` for incident ${refresh.record.incidentNumber}` : ""}</strong>
                <small>{refresh.changes.slice(0, 4).map((c) => c.label).join(" · ")}{refresh.changes.length > 4 ? ` · and ${refresh.changes.length - 4} more` : ""}. Anything typed by hand is kept.</small>
              </div>
              <button type="button" className="nr-btn nr-btn-primary" onClick={() => applyCad(refresh)}><RefreshCw size={15} /> Refresh from CAD</button>
            </div>
          ) : null}

          <div className="nr-step-head">
            <h2>{step.label}</h2>
            <p>{step.description}</p>
          </div>

          {step.id === "call" ? (
            <section className="nr-section">
              <header>
                <div className="nr-section-title">
                  <span className="nr-section-icon"><Radio size={16} /></span>
                  <div>
                    <h3>Unit and CAD</h3>
                    <p>{report.cad?.importedAt ? `Filled from ${report.cad.source === "active911" ? "Active911" : "CAD"} ${formatWhen(report.cad.importedAt)}. CAD is checked for newer times every minute.` : "Import the call from CAD to fill in the incident number, times, address and location."}</p>
                  </div>
                </div>
                {editable ? (
                  <div className="nr-actions">
                    <button type="button" className="nr-btn nr-btn-soft" onClick={() => setCadOpen(true)}><Download size={15} /> Import from CAD</button>
                    {report.cad?.id || report.incidentNumber ? (
                      <button type="button" className="nr-btn nr-btn-soft" onClick={checkCad} disabled={cadLoading}>
                        {cadLoading ? <Loader2 size={15} className="nr-spin" /> : <RefreshCw size={15} />} Check CAD for updates
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </header>
              <div className="nr-grid">
                <Field label="Unit" help="The unit this report is for (call sign). CAD times are taken for this unit.">
                  <TextInput
                    value={report.unit}
                    disabled={readOnly}
                    list="pcr-unit-options"
                    placeholder="Medic 1"
                    onChange={(unit) => update((current) => ({
                      unit,
                      nemsis: setLeaf(schema, setLeaf(schema, current.nemsis || {}, "eResponse.14", unit || undefined), "eResponse.13", unit || undefined),
                    }))}
                  />
                  <datalist id="pcr-unit-options">{unitOptions.map((u) => <option key={u} value={u} />)}</datalist>
                </Field>
                {report.cad?.comments ? (
                  <Field label="CAD notes" wide help="From the CAD record. Not part of the NEMSIS report.">
                    <p className="pcr-cad-notes">{report.cad.comments}</p>
                  </Field>
                ) : null}
              </div>
            </section>
          ) : null}

          {step.id === "narrative" ? (
            <PcrNarrativePanel
              schema={schema}
              report={report}
              editable={editable}
              online={online}
              aiEnabled={form.aiNarrative}
              onChange={update}
              onSaveFirst={() => doSave()}
              requestDraft={(input) => requestPcrNarrative({ departmentId, pcrId: report.id, ...input })}
            />
          ) : (
            <>
              {step.id === "vitals" ? <PcrVitalsTrend schema={schema} pcr={report.nemsis || {}} /> : null}
              {stepSections.map((section) => (
              <Fragment key={section.id}>
                <PcrSectionCard section={section} layout={layouts[section.id]} ctx={ctx} icon={SECTION_ICONS[section.id]} blocking={blockingBySection[section.id] || 0} />
                {section.id === "payment" ? (
                  <PcrBillingFiles departmentId={departmentId} report={report} editable={editable} online={online} actor={actor} onMessage={onMessage} onError={onError} />
                ) : null}
              </Fragment>
              ))}
              {step.id === "disposition" && !stepSections.some((section) => section.id === "payment") ? (
                <PcrBillingFiles departmentId={departmentId} report={report} editable={editable} online={online} actor={actor} onMessage={onMessage} onError={onError} />
              ) : null}
            </>
          )}

          {step.id === "review" ? (
            <PcrReview
              schema={schema}
              report={report}
              check={check}
              settings={settings}
              departmentId={departmentId}
              actor={actor}
              canUnlock={canUnlock}
              canExport={canExport}
              canReview={canReview}
              uid={uid}
              suggestions={suggestions}
              dismissedCount={allSuggestions.length - suggestions.length}
              onDismiss={editable ? dismissSuggestion : null}
              onGoTo={goToSection}
              onMessage={onMessage}
              onError={onError}
              onChange={(patch, { replace = false } = {}) => {
                setReport((current) => (replace ? { ...patch } : { ...current, ...patch }));
                if (replace) {
                  setBase(patch);
                  setStepId("call");
                }
                onSaved(replace ? patch : { ...reportRef.current, ...patch });
              }}
            />
          ) : null}

          <footer className="nr-step-nav">
            {stepIndex > 0 ? <button type="button" className="nr-btn nr-btn-ghost" onClick={() => goTo(STEPS[stepIndex - 1].id)}><ArrowLeft size={16} /> {STEPS[stepIndex - 1].label}</button> : <span />}
            {stepIndex < STEPS.length - 1 ? <button type="button" className="nr-btn nr-btn-primary" onClick={() => goTo(STEPS[stepIndex + 1].id)}>Next: {STEPS[stepIndex + 1].label} <ArrowRight size={16} /></button> : null}
          </footer>
        </main>

        <aside className="nr-rail" aria-label="Report checklist">
          <div className="nr-rail-card">
            <div className="nr-rail-progress">
              <ProgressRing percent={percent} size={64} stroke={6} />
              <div>
                <strong>{posted ? "Posted" : check.ok ? "Ready to post" : `${check.blocking.length} thing${check.blocking.length === 1 ? "" : "s"} left`}</strong>
                <small>{overall.filled} of {overall.total} key fields charted</small>
              </div>
            </div>
            {!posted && check.blocking.length ? (
              <ul className="nr-rail-list">
                {check.blocking.slice(0, 8).map((issue, i) => (
                  <li key={`${issue.path}-${i}`}>
                    <button type="button" onClick={() => goToSection(sectionForPath(issue.path))}>
                      <span className="nr-dot nr-dot-bad" />
                      {issue.message}
                      <small>{STEPS.find((s) => s.id === stepForSection(sectionForPath(issue.path)))?.label}</small>
                    </button>
                  </li>
                ))}
                {check.blocking.length > 8 ? <li className="nr-rail-more">+{check.blocking.length - 8} more</li> : null}
              </ul>
            ) : !posted ? <p className="nr-rail-done"><CheckCircle2 size={16} /> Everything required is charted.</p> : null}
          </div>
          {suggestions.length ? (
            <div className="nr-rail-card">
              <strong className="pcr-rail-title"><Lightbulb size={15} /> {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}</strong>
              <small className="nr-muted">Optional. They don&apos;t block posting.</small>
              <ul className="nr-rail-list">
                {suggestions.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => goToSection(sectionForPath(s.path))}>
                      <span className="nr-dot nr-dot-warn" />
                      {s.message}
                    </button>
                  </li>
                ))}
                {suggestions.length > 5 ? <li className="nr-rail-more">+{suggestions.length - 5} more on Review and sign</li> : null}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {cadOpen ? (
        <PcrCadImportDialog
          schema={schema}
          report={report}
          records={cadRecords}
          loading={cadLoading}
          onReload={() => onReloadCad({ sync: true })}
          onClose={() => setCadOpen(false)}
          onApply={(picked) => { applyCad(picked); setCadOpen(false); }}
        />
      ) : null}
    </div>
  );
}

/** Report, QA and submission status, kept apart (src/lib/pcr/pcrLifecycle.js), plus online/offline. */
function StatusChips({ report, check, online }) {
  const r = reportStatus(report);
  const qa = qaStatus(report);
  const sub = submissionStatus(report);
  const tone = (t) => (t === "good" ? "nr-status-done" : t === "bad" ? "nr-status-returned" : t === "warn" ? "nr-status-review" : "nr-status-draft");
  return (
    <span className="pcr-status-chips">
      <span className={`nr-status ${tone(r.tone)}`} title={r.detail}>{r.id === "posted" || r.id === "amended" ? <Lock size={11} /> : null} {r.label}</span>
      {report.status !== "posted" ? (
        <span className={`nr-status ${check.ok ? "nr-status-done" : "nr-status-review"}`}>{check.ok ? "Checks pass" : `${check.blocking.length} to fix`}</span>
      ) : null}
      {qa.id !== "none" ? <span className={`nr-status ${tone(qa.tone)}`}>{qa.label}</span> : null}
      <span className="nr-status nr-status-draft" title={sub.detail}>{sub.label}</span>
      <span className={`nr-pill ${online ? "nr-pill-ok" : "nr-pill-warn"}`}>{online ? <Wifi size={12} /> : <WifiOff size={12} />} {online ? "Online" : "Offline"}</span>
    </span>
  );
}

function SaveState({ save, readOnly, onRetry }) {
  if (readOnly) return null;
  if (save.state === "saving") return <span className="nr-saved"><Loader2 size={13} className="nr-spin" /> Saving…</span>;
  if (save.state === "dirty") return <span className="nr-saved">Unsaved changes</span>;
  if (save.state === "error") return <button type="button" className="nr-pill nr-pill-warn" onClick={onRetry} title={save.message}><TriangleAlert size={12} /> Not saved. Retry</button>;
  if (save.state === "conflict") return <span className="nr-pill nr-pill-warn"><TriangleAlert size={12} /> Conflict</span>;
  return save.at ? <span className="nr-saved"><Check size={13} /> Saved {new Date(save.at).toLocaleTimeString([], { timeStyle: "short" })}</span> : null;
}
