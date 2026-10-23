import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Play, Save, UploadCloud } from "lucide-react";
import {
  canConductFleetChecks,
  completeFleetCheck,
  ensureChecklistTemplatesSeeded,
  evaluateCheckFailures,
  getFleetCheck,
  listChecklistTemplates,
  loadCheckOfflineDraft,
  saveFleetCheckDraft,
  startFleetCheck,
} from "../../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Conduct / resume a readiness check for one fleet asset.
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
}) {
  const canConduct = canConductFleetChecks(permissions, isCreator);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [check, setCheck] = useState(null);
  const [answers, setAnswers] = useState({});
  const [failNotes, setFailNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const seeded = await ensureChecklistTemplatesSeeded(departmentId, actor);
        const list = seeded.length ? seeded : await listChecklistTemplates(departmentId);
        if (cancelled) return;
        setTemplates(list.filter((row) => row.lifecycleStatus === "published" || row.currentVersion > 0));
        setTemplateId(list[0]?.id || "");
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
  const failedPreview = useMemo(
    () => evaluateCheckFailures({ ...check, answers, failNotes }),
    [check, answers, failNotes]
  );

  async function handleStart() {
    if (!canConduct || !templateId) return;
    setBusy(true);
    onError?.("");
    try {
      const started = await startFleetCheck(departmentId, {
        fleetAssetId: asset.assetId || asset.id,
        templateId,
      }, actor);
      setCheck(started);
      setAnswers(started.answers || {});
      setFailNotes(started.failNotes || {});
      onMessage?.("Check started.");
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

  async function handleSaveDraft() {
    if (!check) return;
    setBusy(true);
    try {
      const saved = await saveFleetCheckDraft(departmentId, check.id, { answers, failNotes }, actor);
      setCheck(saved);
      onMessage?.("Draft saved (synced + offline copy).");
    } catch (saveError) {
      onError?.(saveError?.message || "Unable to save draft.");
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!check) return;
    setBusy(true);
    onError?.("");
    try {
      const completed = await completeFleetCheck(departmentId, check.id, { answers, failNotes }, actor);
      setCheck(completed);
      onMessage?.(`Check completed: ${completed.result}`);
      onCompleted?.(completed);
    } catch (completeError) {
      onError?.(completeError?.message || "Unable to complete check.");
    } finally {
      setBusy(false);
    }
  }

  function renderField(field) {
    const value = answers[field.key] ?? "";
    if (field.type === "heading" || field.type === "instruction") {
      return <p className="occupancy-muted">{field.helpText || field.label}</p>;
    }
    if (["pass_fail", "pass_fail_na", "yes_no"].includes(field.type)) {
      const options = field.type === "yes_no"
        ? ["Yes", "No"]
        : field.type === "pass_fail_na"
          ? ["Pass", "Fail", "N/A"]
          : ["Pass", "Fail"];
      return (
        <>
          <select
            value={value}
            disabled={!canConduct || check?.status === "completed"}
            onChange={(e) => setAnswers((c) => ({ ...c, [field.key]: e.target.value }))}
          >
            <option value="">Select</option>
            {options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {String(value).toLowerCase() === "fail" || String(value).toLowerCase() === "no" ? (
            <textarea
              rows={2}
              placeholder={field.noteRequiredOnFail ? "Failure note (required)" : "Failure note"}
              value={failNotes[field.key] || ""}
              disabled={!canConduct || check?.status === "completed"}
              onChange={(e) => setFailNotes((c) => ({ ...c, [field.key]: e.target.value }))}
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
          disabled={!canConduct || check?.status === "completed"}
          onChange={(e) => setAnswers((c) => ({ ...c, [field.key]: e.target.value }))}
        />
      );
    }
    return (
      <input
        type={["number", "meter_reading", "fuel_level"].includes(field.type) ? "number" : "text"}
        value={value}
        disabled={!canConduct || check?.status === "completed"}
        onChange={(e) => setAnswers((c) => ({ ...c, [field.key]: e.target.value }))}
      />
    );
  }

  return (
    <section className="panel fleet-check-conduct">
      <header>
        <div>
          <ClipboardCheck size={15} />
          <strong>
            Check — {asset?.fleetNumber || asset?.unitDesignation || "Unit"}
          </strong>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>Close</button>
      </header>
      <div className="panel-body config-studio-body">
        {loading ? <p className="occupancy-muted">Loading checklists...</p> : null}

        {!check ? (
          <div className="occupancy-form-grid">
            <Field label="Checklist template">
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} {tpl.currentVersion ? `(v${tpl.currentVersion})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {canConduct ? (
              <button className="primary-button" type="button" disabled={busy || !templateId} onClick={handleStart}>
                <Play size={14} /> Start check
              </button>
            ) : (
              <p className="occupancy-muted">You do not have permission to conduct checks.</p>
            )}
          </div>
        ) : (
          <>
            <p className="occupancy-muted">
              {check.templateSnapshot?.name} · v{check.templateVersion} · {check.status}
              {check.offlineDraft ? " · offline draft present" : ""}
            </p>

            {sections.map((section) => (
              <div key={section.id} className="template-section-card">
                <strong>{section.title}</strong>
                <div className="template-fields">
                  {(section.fields || []).map((field) => (
                    <div key={field.id || field.key} className="config-field">
                      <span>
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      {renderField(field)}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {failedPreview.length ? (
              <p className="occupancy-muted">
                {failedPreview.length} failed item(s) — fail handling may restrict or OOS the unit on complete.
              </p>
            ) : null}

            {check.status !== "completed" && canConduct ? (
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" disabled={busy} onClick={handleSaveDraft}>
                  <Save size={14} /> Save draft
                </button>
                <button className="primary-button" type="button" disabled={busy} onClick={handleComplete}>
                  <UploadCloud size={14} /> Complete check
                </button>
              </div>
            ) : null}

            {check.status === "completed" ? (
              <p>
                Result: <strong>{check.result}</strong>
                {" · "}
                Recommendation: <strong>{check.readinessRecommendation}</strong>
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
