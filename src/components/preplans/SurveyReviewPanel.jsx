import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FilePlus2, Undo2 } from "lucide-react";
import { getPreplan, getPreplanRevision, isPreplanFieldSensitive } from "../../lib/inspections/index.js";
import {
  CHECK_RESULTS,
  OBSERVATION_CATEGORIES,
  proposableFields,
  proposedChanges,
  surveyCounts,
  surveyFoundNoChanges,
} from "../../lib/preplans/surveyModel.js";
import { acceptSurveyAsRevision, acceptSurveyAsVerification, returnSurvey } from "../../lib/preplans/surveyService.js";

const RESULT_LABEL = Object.fromEntries(CHECK_RESULTS.map((row) => [row.id, row.label]));
const VERIFIABLE_STATUSES = ["operational", "published", "verification_due", "verification_overdue"];

function point(p) {
  return p ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}${p.accuracyMeters != null ? ` (±${p.accuracyMeters} m)` : ""}` : "";
}

/**
 * Supervisor review of a submitted survey: accept the chosen corrections into a
 * new draft revision, record it as a field verification when nothing changed,
 * or return it to the surveyor.
 */
export default function SurveyReviewPanel({ departmentId, survey, actor, canReview, onDone, onOpenPreplan }) {
  const [revision, setRevision] = useState(null);
  const [preplan, setPreplan] = useState(null);
  const [accepted, setAccepted] = useState({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPreplan(departmentId, survey.preplanId).then(setPreplan).catch(() => setPreplan(null));
    if (survey.baseRevisionId) getPreplanRevision(departmentId, survey.baseRevisionId).then(setRevision).catch(() => setRevision(null));
  }, [departmentId, survey.preplanId, survey.baseRevisionId]);

  const fields = useMemo(() => proposableFields(revision?.templateSnapshot?.sections || [], isPreplanFieldSensitive), [revision]);
  const changes = useMemo(() => proposedChanges(survey, revision?.sectionAnswers || {}, fields), [survey, revision, fields]);
  useEffect(() => { setAccepted(Object.fromEntries(changes.map((row) => [row.key, true]))); }, [changes]);

  const counts = surveyCounts(survey);
  const reviewable = canReview && survey.status === "submitted";
  const noChanges = surveyFoundNoChanges(survey) && !changes.length;
  const canVerify = noChanges && VERIFIABLE_STATUSES.includes(preplan?.status);
  const flagged = survey.checklist.filter((item) => ["changed", "not_checked"].includes(survey.results[item.id]?.result));

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      onDone?.();
    } catch (runError) {
      setError(runError?.message || "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="psv-review">
      <p className="occupancy-muted">
        Sent {survey.submittedAt ? new Date(survey.submittedAt).toLocaleString() : ""} by {survey.submittedByName || "the surveyor"}.
        {" "}{counts.confirmed} match, {counts.changed} changed, {counts.not_checked} couldn&apos;t be checked, {counts.na} don&apos;t apply.
        {" "}{counts.observations} observation(s), {counts.photos} photo(s), {counts.referrals} referral(s).
      </p>
      {survey.outcome ? (
        <p className="psv-callout">
          {survey.outcome === "revision" ? "Accepted into a new draft revision" : "Recorded as a field verification"}
          {survey.reviewedByName ? ` by ${survey.reviewedByName}` : ""}{survey.reviewNotes ? `: ${survey.reviewNotes}` : "."}
          {survey.outcome === "revision" && onOpenPreplan ? <> <button type="button" className="secondary-button" onClick={onOpenPreplan}>Open the preplan</button></> : null}
        </p>
      ) : null}

      <section className="psv-card">
        <h3>Checklist</h3>
        {flagged.length ? flagged.map((item) => (
          <div key={item.id} className={`psv-item is-${survey.results[item.id].result}`}>
            <span className="psv-item-label">{item.group}: {item.label}</span>
            <strong>{RESULT_LABEL[survey.results[item.id].result]}</strong>
            <p>{survey.results[item.id].note}</p>
          </div>
        )) : <p className="occupancy-muted">Every item matches the plan or doesn&apos;t apply.</p>}
      </section>

      <section className="psv-card">
        <h3>Proposed corrections</h3>
        {changes.length ? (
          <table className="psv-table">
            <thead><tr><th>Use</th><th>Detail</th><th>Plan says</th><th>Surveyor says</th></tr></thead>
            <tbody>
              {changes.map((row) => (
                <tr key={row.key}>
                  <td><input type="checkbox" checked={Boolean(accepted[row.key])} disabled={!reviewable} aria-label={`Use the correction to ${row.label}`}
                    onChange={() => setAccepted((current) => ({ ...current, [row.key]: !current[row.key] }))} /></td>
                  <td>{row.label}</td>
                  <td>{row.current || <em>blank</em>}</td>
                  <td>{row.proposed || <em>blank</em>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="occupancy-muted">No corrections proposed.</p>}
      </section>

      {survey.observations.length ? (
        <section className="psv-card">
          <h3>Observations</h3>
          {survey.observations.map((row) => (
            <div key={row.id} className="psv-obs">
              <strong>{OBSERVATION_CATEGORIES.find((c) => c.id === row.category)?.label}</strong>
              <p>{row.note}</p>
              {row.location ? <small className="occupancy-muted">GPS {point(row.location)}: place it on the site map if it belongs there.</small> : null}
            </div>
          ))}
        </section>
      ) : null}

      {survey.photos.length ? (
        <section className="psv-card">
          <h3>Photos</h3>
          <div className="psv-photos">
            {survey.photos.map((photo) => (
              <figure key={photo.id}>
                {photo.downloadUrl ? <a href={photo.downloadUrl} target="_blank" rel="noreferrer"><img src={photo.downloadUrl} alt={photo.caption || photo.fileName} loading="lazy" /></a> : null}
                <figcaption>{photo.caption || photo.fileName}{photo.location ? ` · ${point(photo.location)}` : ""}</figcaption>
              </figure>
            ))}
          </div>
          <p className="occupancy-muted">Accepting the survey files these photos with the preplan.</p>
        </section>
      ) : null}

      {survey.referrals.length ? (
        <section className="psv-card">
          <h3>Inspection referrals</h3>
          {survey.referrals.map((row) => (
            <div key={row.id} className="psv-obs">
              <strong>{row.urgency === "urgent" ? "Urgent" : row.urgency === "soon" ? "Soon" : "Routine"}</strong>
              <p>{row.reason}</p>
              <small className="occupancy-muted">Inspection staff were notified when it was added.</small>
            </div>
          ))}
        </section>
      ) : null}

      {survey.notes ? <section className="psv-card"><h3>Surveyor notes</h3><p>{survey.notes}</p></section> : null}

      {reviewable ? (
        <section className="psv-card">
          <h3>Decision</h3>
          <textarea rows={2} value={notes} placeholder="Notes (required to return it)" aria-label="Review notes" onChange={(event) => setNotes(event.target.value)} />
          {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
          <div className="occupancy-detail-actions">
            {!noChanges || !canVerify ? (
              <button type="button" className="primary-button" disabled={busy} onClick={() => run(() => acceptSurveyAsRevision(
                departmentId, survey, Object.keys(accepted).filter((key) => accepted[key]), notes, actor,
              ))}>
                <FilePlus2 size={14} /> Accept into a new revision
              </button>
            ) : null}
            {canVerify ? (
              <button type="button" className="primary-button" disabled={busy} onClick={() => run(() => acceptSurveyAsVerification(departmentId, survey, notes, actor))}>
                <CheckCircle2 size={14} /> Record as field verification
              </button>
            ) : null}
            <button type="button" className="secondary-button" disabled={busy || !notes.trim()} onClick={() => run(() => returnSurvey(departmentId, survey, notes, actor))}>
              <Undo2 size={14} /> Return to surveyor
            </button>
          </div>
          <p className="occupancy-muted">
            {canVerify
              ? "Nothing changed on site, so this can count as the preplan's field verification. The approved plan stays as it is."
              : "Accepting adds the ticked corrections and the field notes to the preplan's draft revision (starting one if needed). The approved plan stays in use until that revision is approved and published."}
          </p>
        </section>
      ) : null}
    </div>
  );
}
