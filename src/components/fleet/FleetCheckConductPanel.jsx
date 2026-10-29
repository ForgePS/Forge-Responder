import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Play, Save, UploadCloud, X } from "lucide-react";
import {
  canConductFleetChecks,
  completeFleetCheck,
  ensureChecklistTemplatesSeeded,
  evaluateCheckFailures,
  getFleetCheck,
  isUsableChecklist,
  listChecklistTemplates,
  loadCheckOfflineDraft,
  saveFleetCheckDraft,
  startFleetCheck,
} from "../../lib/fleet/index.js";
import {
  answerableFields,
  checkProblems,
  checkProgress,
  choiceOptions,
  isAnswered,
  passAnswer,
  readinessLabel,
} from "../../lib/fleet/checkProgress.js";

function unitName(asset = {}) {
  return asset?.unitDesignation || asset?.fleetNumber || asset?.name || "Unit";
}

function timeAgo(iso = "") {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const FIELD_SUFFIX = { fuel_level: "%", meter_reading: "" };
const METER_SUFFIX = { mileage: "mi", engine_hours: "hrs", pump_hours: "hrs", aerial_hours: "hrs", generator_hours: "hrs" };

/** The unit's last known value for a meter item, from the fleet record. */
function lastReading(asset = {}, field = {}) {
  const map = { mileage: asset.mileage, engine_hours: asset.engineHours, pump_hours: asset.pumpHours };
  const raw = field.type === "fuel_level" ? null : map[field.meterType || field.key];
  const value = Number(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Run (or resume) a readiness check on one unit: tap Pass/Fail per item, see
 * progress, and get a plain summary at the end. Used by the Employee Portal and
 * the Fleet Readiness Board.
 */
export default function FleetCheckConductPanel({
  departmentId,
  asset,
  actor,
  permissions,
  isCreator,
  onClose,
  onCompleted,
  onMessage,
  onError,
  allowConduct = false,
  autoStart = false,
}) {
  // The Employee Portal lets any member run a daily check on a unit.
  const canConduct = allowConduct || canConductFleetChecks(permissions, isCreator);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [check, setCheck] = useState(null);
  const [answers, setAnswers] = useState({});
  const [failNotes, setFailNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [highlightKeys, setHighlightKeys] = useState(() => new Set());
  const [savedAt, setSavedAt] = useState("");
  const autoStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const seeded = await ensureChecklistTemplatesSeeded(departmentId, actor);
        const list = seeded.length ? seeded : await listChecklistTemplates(departmentId);
        if (cancelled) return;
        const usable = list.filter(isUsableChecklist);
        setTemplates(usable);
        setTemplateId(usable[0]?.id || "");
      } catch (loadError) {
        onError?.(loadError?.message || "Unable to load checklists.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, asset?.id]);

  const sections = check?.templateSnapshot?.sections || [];
  const isDone = check?.status === "completed";
  const locked = !canConduct || isDone;
  const progress = useMemo(() => checkProgress(sections, answers), [sections, answers]);
  const failedPreview = useMemo(
    () => evaluateCheckFailures({ ...check, answers, failNotes }),
    [check, answers, failNotes]
  );

  async function handleStart(chosenId = templateId) {
    if (!canConduct || !chosenId) return;
    setBusy(true);
    onError?.("");
    try {
      const started = await startFleetCheck(departmentId, {
        fleetAssetId: asset.assetId || asset.id,
        templateId: chosenId,
      }, actor);
      setCheck(started);
      setAnswers(started.answers || {});
      setFailNotes(started.failNotes || {});
    } catch (startError) {
      onError?.(startError?.message || "Unable to start check.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResume(checkId) {
    setBusy(true);
    try {
      const remote = await getFleetCheck(departmentId, checkId);
      const draft = loadCheckOfflineDraft(departmentId, checkId);
      const merged = draft && (!remote || draft.updatedAt > remote.updatedAt) ? draft : remote;
      if (!merged) throw new Error("Check not found");
      setCheck(merged);
      setAnswers(merged.answers || {});
      setFailNotes(merged.failNotes || {});
      setSavedAt(merged.updatedAt || "");
    } catch (resumeError) {
      onError?.(resumeError?.message || "Unable to resume check.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (asset?.openCheckId) handleResume(asset.openCheckId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.openCheckId]);

  // One checklist and nothing to resume: skip the picker and start straight away.
  useEffect(() => {
    if (!autoStart || autoStartedRef.current || loading || check || asset?.openCheckId) return;
    if (templates.length === 1 && canConduct) {
      autoStartedRef.current = true;
      handleStart(templates[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, loading, templates, check, asset?.openCheckId]);

  function setAnswer(key, value) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setProblem("");
    setHighlightKeys((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function markSectionPassed(section) {
    setAnswers((current) => {
      const next = { ...current };
      for (const field of section.fields || []) {
        const pass = passAnswer(field);
        if (pass && !isAnswered(next[field.key])) next[field.key] = pass;
      }
      return next;
    });
    setProblem("");
  }

  async function handleSaveDraft() {
    if (!check) return;
    setBusy(true);
    try {
      const saved = await saveFleetCheckDraft(departmentId, check.id, { answers, failNotes }, actor);
      setCheck(saved);
      setSavedAt(saved?.updatedAt || new Date().toISOString());
      onMessage?.("Progress saved. You can finish this check later.");
    } catch (saveError) {
      onError?.(saveError?.message || "Unable to save progress.");
    } finally {
      setBusy(false);
    }
  }

  function scrollToField(key) {
    requestAnimationFrame(() => document.getElementById(`check-item-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function handleComplete() {
    if (!check) return;
    const { missing, missingNotes } = checkProblems(sections, answers, failNotes);
    if (missing.length || missingNotes.length) {
      const keys = new Set([...missing, ...missingNotes].map((field) => field.key));
      setHighlightKeys(keys);
      setProblem(missing.length
        ? `${missing.length} required item${missing.length === 1 ? " is" : "s are"} still blank. They're marked in red.`
        : `Add a note to ${missingNotes.length === 1 ? "the failed item" : "each failed item"} marked in red.`);
      scrollToField((missing[0] || missingNotes[0]).key);
      return;
    }
    if (progress.answered < progress.total
      && !window.confirm(`${progress.total - progress.answered} optional item(s) are blank. Finish the check anyway?`)) {
      return;
    }
    setBusy(true);
    onError?.("");
    try {
      const completed = await completeFleetCheck(departmentId, check.id, { answers, failNotes }, actor);
      setCheck(completed);
      onCompleted?.(completed);
    } catch (completeError) {
      onError?.(completeError?.message || "Unable to complete check.");
    } finally {
      setBusy(false);
    }
  }

  function renderField(field) {
    const value = answers[field.key] ?? "";
    const options = choiceOptions(field);
    if (options) {
      const failed = ["fail", "no"].includes(String(value).toLowerCase());
      return (
        <>
          <div className="check-choice" role="radiogroup" aria-label={field.label}>
            {options.map((option) => {
              const tone = option === "Fail" || option === "No" ? "fail" : option === "N/A" ? "na" : "pass";
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={value === option}
                  className={`check-choice-button is-${tone}${value === option ? " is-selected" : ""}`}
                  disabled={locked}
                  onClick={() => setAnswer(field.key, value === option ? "" : option)}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {failed ? (
            <textarea
              className="check-fail-note"
              rows={2}
              placeholder={field.noteRequiredOnFail ? "What's wrong? (required)" : "What's wrong? (optional)"}
              value={failNotes[field.key] || ""}
              disabled={locked}
              onChange={(e) => {
                setFailNotes((c) => ({ ...c, [field.key]: e.target.value }));
                setProblem("");
              }}
            />
          ) : null}
        </>
      );
    }
    if (field.type === "long_text") {
      return (
        <textarea
          rows={3}
          value={value}
          disabled={locked}
          onChange={(e) => setAnswer(field.key, e.target.value)}
        />
      );
    }
    const numeric = ["number", "meter_reading", "fuel_level"].includes(field.type);
    const suffix = field.unit || (field.type === "meter_reading" ? METER_SUFFIX[field.meterType || field.key] : "") || FIELD_SUFFIX[field.type] || "";
    const last = field.type === "meter_reading" ? lastReading(asset, field) : null;
    const entered = Number(value);
    const lowerThanLast = last !== null && isAnswered(value) && Number.isFinite(entered) && entered < last;
    const fuelOutOfRange = field.type === "fuel_level" && isAnswered(value) && (entered < 0 || entered > 100);
    return (
      <>
        <div className="check-number-field">
          <input
            type={numeric ? "number" : "text"}
            inputMode={numeric ? "decimal" : undefined}
            min={field.type === "fuel_level" ? 0 : undefined}
            max={field.type === "fuel_level" ? 100 : undefined}
            value={value}
            disabled={locked}
            placeholder={field.type === "fuel_level" ? "0 to 100" : last !== null ? `Last: ${last.toLocaleString()}` : field.type === "meter_reading" ? "Current reading" : ""}
            onChange={(e) => setAnswer(field.key, e.target.value)}
          />
          {suffix ? <span>{suffix}</span> : null}
        </div>
        {last !== null && !lowerThanLast ? (
          <small className="check-reading-hint">Last recorded: {last.toLocaleString()} {suffix}</small>
        ) : null}
        {lowerThanLast ? (
          <small className="check-reading-warning">That's lower than the last reading ({last.toLocaleString()} {suffix}). Double-check the number.</small>
        ) : null}
        {fuelOutOfRange ? <small className="check-reading-warning">Fuel level should be between 0 and 100%.</small> : null}
      </>
    );
  }

  // ---- Finished: plain summary ----
  if (isDone) {
    const failed = check.failedItems?.length ? check.failedItems : failedPreview;
    const passed = !failed.length;
    return (
      <section className={`panel fleet-check-conduct check-summary ${passed ? "is-passed" : "is-failed"}`}>
        <div className="panel-body">
          <div className="check-summary-head">
            {passed ? <CheckCircle2 size={28} aria-hidden="true" /> : <AlertTriangle size={28} aria-hidden="true" />}
            <div>
              <h3>{unitName(asset)} {passed ? "passed its check" : `has ${failed.length} failed item${failed.length === 1 ? "" : "s"}`}</h3>
              <p>Unit status: <strong>{readinessLabel(check.readinessRecommendation)}</strong></p>
            </div>
          </div>
          {failed.length ? (
            <>
              <ul className="check-summary-failures">
                {failed.map((item) => (
                  <li key={item.fieldKey || item.label}>
                    <strong>{item.label}</strong>
                    {item.note ? <span>{item.note}</span> : null}
                  </li>
                ))}
              </ul>
              <p className="occupancy-muted">Each failed item was sent to the fleet team as a defect to fix.</p>
            </>
          ) : null}
          <div className="occupancy-detail-actions">
            <button className="primary-button" type="button" onClick={onClose}>Done</button>
          </div>
        </div>
      </section>
    );
  }

  const templateName = check?.templateSnapshot?.name || templates.find((tpl) => tpl.id === templateId)?.name || "Checklist";

  return (
    <section className="panel fleet-check-conduct">
      <header>
        <div>
          <ClipboardCheck size={15} />
          <strong>{unitName(asset)} · {templateName}</strong>
        </div>
        <button className="secondary-button" type="button" onClick={onClose} aria-label="Close check">
          <X size={14} /> Close
        </button>
      </header>
      <div className="panel-body config-studio-body">
        {loading || (busy && !check) ? <p className="occupancy-muted">Getting the checklist ready…</p> : null}

        {!check && !loading ? (
          !templates.length ? (
            <p className="occupancy-muted">No checklist is published yet. Fleet staff set them up in Fleet Configuration Studio.</p>
          ) : !canConduct ? (
            <p className="occupancy-muted">You don't have permission to run checks.</p>
          ) : (templates.length > 1 || !autoStart) ? (
            <div className="occupancy-form-grid">
              <label className="config-field">
                <span>Which checklist?</span>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                </select>
              </label>
              <button className="primary-button" type="button" disabled={busy || !templateId} onClick={() => handleStart()}>
                <Play size={14} /> Start check
              </button>
            </div>
          ) : null
        ) : null}

        {check ? (
          <>
            <div className="check-progress" aria-live="polite">
              <div className="check-progress-text">
                <strong>{progress.answered} of {progress.total} done</strong>
                {savedAt ? <span>Saved {timeAgo(savedAt)}</span> : null}
              </div>
              <div className="check-progress-bar"><span style={{ width: `${progress.percent}%` }} /></div>
            </div>

            {sections.map((section) => {
              const fields = section.fields || [];
              const canQuickPass = !locked && fields.some((field) => passAnswer(field) && !isAnswered(answers[field.key]));
              const sectionProgress = checkProgress([section], answers);
              return (
                <div key={section.id} className="template-section-card check-section">
                  <div className="check-section-head">
                    <strong>{section.title}</strong>
                    <span className="occupancy-muted">{sectionProgress.answered}/{sectionProgress.total}</span>
                    {canQuickPass ? (
                      <button type="button" className="text-button" onClick={() => markSectionPassed(section)}>
                        Mark the rest as passed
                      </button>
                    ) : null}
                  </div>
                  <div className="template-fields">
                    {fields.map((field) => {
                      if (field.type === "heading" || field.type === "instruction") {
                        return <p key={field.id || field.key} className="occupancy-muted">{field.helpText || field.label}</p>;
                      }
                      return (
                        <div
                          key={field.id || field.key}
                          id={`check-item-${field.key}`}
                          className={`config-field check-item${highlightKeys.has(field.key) ? " needs-attention" : ""}${isAnswered(answers[field.key]) ? " is-done" : ""}`}
                        >
                          <span>
                            {field.label}
                            {field.required ? <em className="check-required"> required</em> : null}
                          </span>
                          {field.helpText ? <small className="field-hint">{field.helpText}</small> : null}
                          {renderField(field)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {failedPreview.length ? (
              <p className="check-fail-warning">
                <AlertTriangle size={14} aria-hidden="true" />
                {failedPreview.length} failed item{failedPreview.length === 1 ? "" : "s"}. When you finish, each one goes to the fleet team as a defect, and the unit may be marked restricted or out of service.
              </p>
            ) : null}

            {problem ? <p className="form-error" role="alert">{problem}</p> : null}

            {canConduct ? (
              <div className="occupancy-detail-actions check-actions">
                <button className="secondary-button" type="button" disabled={busy} onClick={handleSaveDraft}>
                  <Save size={14} /> Save and finish later
                </button>
                <button className="primary-button" type="button" disabled={busy} onClick={handleComplete}>
                  <UploadCloud size={14} /> {busy ? "Finishing…" : "Finish check"}
                </button>
              </div>
            ) : null}
            {answerableFields(sections).length === 0 ? (
              <p className="occupancy-muted">This checklist has no items yet.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
