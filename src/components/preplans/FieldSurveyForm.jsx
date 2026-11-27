import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ClipboardCheck, CloudOff, LocateFixed, Plus, Send, Siren, Trash2 } from "lucide-react";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { getPreplanRevision, isPreplanFieldSensitive } from "../../lib/inspections/index.js";
import {
  CHECK_RESULTS,
  OBSERVATION_CATEGORIES,
  MAX_PHOTOS,
  canWorkOnSurvey,
  newSurveyItemId,
  normalizeSurvey,
  proposableFields,
  submissionProblems,
} from "../../lib/preplans/surveyModel.js";
import {
  clearDeviceCopy,
  getSurvey,
  keepOnDevice,
  readDeviceCopy,
  saveSurveyWork,
  startedSurvey,
  submittedSurvey,
} from "../../lib/preplans/surveyService.js";

const SERVER_SAVE_MS = 2500;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function groupChecklist(items) {
  const groups = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return groups;
}

/** Ask the device for its position. Resolves null when not available or refused. */
function currentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyMeters: pos.coords.accuracy, capturedAt: new Date().toISOString() }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

function formatPoint(point) {
  if (!point) return "";
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}${point.accuracyMeters != null ? ` (±${point.accuracyMeters} m)` : ""}`;
}

/**
 * The surveyor's form. Everything is kept on the device as it is typed and sent
 * to Forge when there's a connection; the approved preplan is only read here.
 */
export default function FieldSurveyForm({ departmentId, survey: initial, me, onChanged, onOpenResponse }) {
  const [survey, setSurvey] = useState(initial);
  const [baseVersion, setBaseVersion] = useState(initial.version);
  const [state, setState] = useState("saved"); // saved | dirty | saving | device | conflict | error
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [obsDraft, setObsDraft] = useState({ category: "general", note: "", location: null, photoIds: [] });
  const [refDraft, setRefDraft] = useState({ reason: "", urgency: "routine" });
  const [fieldKey, setFieldKey] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine !== false);
  const dirtyRef = useRef(false);
  const surveyRef = useRef(survey);
  surveyRef.current = survey;
  const editable = canWorkOnSurvey(survey, me);

  // Work saved on this device and not yet sent (e.g. filled in without a connection).
  useEffect(() => {
    const copy = readDeviceCopy(departmentId, initial.id);
    if (!copy?.survey) return;
    if (copy.baseVersion === initial.version) {
      setSurvey(normalizeSurvey({ ...initial, ...copy.survey }));
      dirtyRef.current = true;
      setState("dirty");
      setMessage("Restored work saved on this device. Sending it now.");
    } else {
      // Show the device's answers; the surveyor picks which version to keep.
      setSurvey(normalizeSurvey({ ...initial, ...copy.survey }));
      setBaseVersion(copy.baseVersion);
      setState("conflict");
      setError("This survey changed in Forge after you worked on it offline. Your device copy is kept: choose which to keep.");
    }
  }, [departmentId, initial.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const revisionId = initial.baseRevisionId;
    if (!revisionId) return;
    getPreplanRevision(departmentId, revisionId).then(setRevision).catch(() => setRevision(null));
  }, [departmentId, initial.baseRevisionId]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const sections = revision?.templateSnapshot?.sections || [];
  const fields = useMemo(() => proposableFields(sections, isPreplanFieldSensitive), [sections]);
  const currentAnswers = revision?.sectionAnswers || {};

  const change = useCallback((updater) => {
    setSurvey((current) => {
      const next = normalizeSurvey(updater(current));
      keepOnDevice(departmentId, next, baseVersion);
      return next;
    });
    dirtyRef.current = true;
    setState("dirty");
    setMessage("");
  }, [departmentId, baseVersion]);

  const send = useCallback(async (override) => {
    const toSend = override || surveyRef.current;
    if (!navigator.onLine) { setState("device"); return false; }
    setState("saving");
    dirtyRef.current = false;
    try {
      const saved = await saveSurveyWork(departmentId, toSend, { expectedVersion: baseVersion });
      setBaseVersion(saved.version);
      clearDeviceCopy(departmentId, saved.id);
      if (!override) setSurvey((current) => ({ ...current, version: saved.version }));
      setState(dirtyRef.current ? "dirty" : "saved");
      onChanged?.(saved);
      return saved;
    } catch (saveError) {
      dirtyRef.current = true;
      if (saveError?.code === "survey-conflict") { setState("conflict"); setError("Someone else saved this survey. Your work is kept on this device."); return false; }
      // A network failure leaves the device copy to send later.
      setState(navigator.onLine ? "error" : "device");
      if (navigator.onLine) setError(saveError?.message || "Couldn't save the survey.");
      return false;
    }
  }, [departmentId, baseVersion, onChanged]);

  useEffect(() => {
    if (state !== "dirty" || !online) return undefined;
    const timer = setTimeout(() => send(), SERVER_SAVE_MS);
    return () => clearTimeout(timer);
  }, [state, survey, online, send]);

  useEffect(() => {
    if (online && state === "device") send();
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  async function keepServerCopy() {
    const server = await getSurvey(departmentId, survey.id).catch(() => null);
    if (!server) { setError("Couldn't load the saved version. Check the connection."); return; }
    clearDeviceCopy(departmentId, survey.id);
    dirtyRef.current = false;
    setSurvey(server);
    setBaseVersion(server.version);
    setError("");
    setState("saved");
  }

  async function keepMine() {
    // Take the server's version number, keep this device's answers.
    const server = await getSurvey(departmentId, survey.id).catch(() => null);
    if (!server) { setError("Couldn't reach Forge. Check the connection."); return; }
    if (!["assigned", "in_progress", "returned"].includes(server.status)) {
      setError("This survey was sent for review or closed in the meantime, so it can't be changed here.");
      return;
    }
    setBaseVersion(server.version);
    keepOnDevice(departmentId, surveyRef.current, server.version);
    setError("");
    dirtyRef.current = true;
    setState("dirty");
  }

  // ---- Edits ----
  const begin = (current) => startedSurvey(current, me);
  const setResult = (itemId, patch) => change((current) => ({
    ...begin(current),
    results: { ...current.results, [itemId]: { ...current.results[itemId], ...patch } },
  }));

  function setProposed(key, value) {
    change((current) => {
      const proposedAnswers = { ...current.proposedAnswers };
      if (value === null) delete proposedAnswers[key]; else proposedAnswers[key] = value;
      return { ...begin(current), proposedAnswers };
    });
  }

  async function addLocationToDraft() {
    setBusy(true);
    const point = await currentPosition();
    setBusy(false);
    if (!point) { setError("This device didn't give a location. Check that location is allowed for Forge."); return; }
    setError("");
    setObsDraft((current) => ({ ...current, location: point }));
  }

  function addObservation() {
    if (!obsDraft.note.trim()) return;
    change((current) => ({
      ...begin(current),
      observations: [...current.observations, {
        ...obsDraft,
        id: newSurveyItemId("obs"),
        createdBy: me.uid,
        createdByName: me.name,
        createdAt: new Date().toISOString(),
      }],
    }));
    setObsDraft({ category: "general", note: "", location: null, photoIds: [] });
  }

  async function addPhotos(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    if (!navigator.onLine) { setError("Photos need a connection to upload. Note what you saw and add the photo when you're back in signal."); return; }
    if (survey.photos.length + files.length > MAX_PHOTOS) { setError(`A survey holds up to ${MAX_PHOTOS} photos.`); return; }
    setBusy(true);
    setError("");
    try {
      const location = await currentPosition();
      const added = [];
      for (const file of files) {
        if (!PHOTO_TYPES.includes(file.type)) throw new Error(`${file.name} isn't a photo (JPEG, PNG, WebP or HEIC).`);
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
        const id = newSurveyItemId("pho");
        const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        const uploaded = await uploadFirebaseFile(`departments/${departmentId}/preplanSurveys/${survey.id}/${id}.${extension}`, file);
        added.push({
          id, storagePath: uploaded.storagePath, downloadUrl: uploaded.downloadUrl, fileName: file.name,
          contentType: uploaded.contentType, size: file.size, caption: "", location,
          uploadedBy: me.uid, uploadedAt: new Date().toISOString(),
        });
      }
      change((current) => ({ ...begin(current), photos: [...current.photos, ...added] }));
      setMessage(`${added.length} photo${added.length === 1 ? "" : "s"} added.`);
    } catch (uploadError) {
      setError(uploadError?.message || "Couldn't upload the photo.");
    } finally {
      setBusy(false);
    }
  }

  function addReferral() {
    if (!refDraft.reason.trim()) return;
    change((current) => ({
      ...begin(current),
      referrals: [...current.referrals, {
        ...refDraft,
        id: newSurveyItemId("ref"),
        createdBy: me.uid,
        createdByName: me.name,
        createdAt: new Date().toISOString(),
      }],
    }));
    setRefDraft({ reason: "", urgency: "routine" });
    setMessage("Referral added. Inspection staff are notified when the survey is saved.");
  }

  const problems = submissionProblems(survey);
  async function submit() {
    if (problems.length) return;
    if (!window.confirm("Send this survey for review? You can't change it afterwards unless it's returned to you.")) return;
    const next = submittedSurvey(begin(survey), me);
    setSurvey(next);
    keepOnDevice(departmentId, next, baseVersion);
    const saved = await send(next);
    if (saved) setMessage("Sent for review.");
    else if (!navigator.onLine) setMessage("Saved on this device. It will be sent for review when you're back online.");
  }

  const stateText = {
    saved: "Saved",
    dirty: "Saving soon…",
    saving: "Saving…",
    device: "Saved on this device only. It will be sent when you're back online.",
    conflict: "Not saved: someone else changed this survey",
    error: "Not saved",
  }[state];

  const unusedFields = fields.filter((field) => !(field.key in survey.proposedAnswers));
  const proposed = fields.filter((field) => field.key in survey.proposedAnswers);

  return (
    <div className="psv-form">
      <div className={`psv-save is-${state}`} role="status">
        {state === "device" || !online ? <CloudOff size={16} /> : <CheckCircle2 size={16} />}
        <span>{!online && state !== "device" ? "Offline: changes are kept on this device." : stateText}</span>
        {state === "conflict" ? (
          <span className="psv-actions">
            <button type="button" className="secondary-button" onClick={keepMine}>Keep my answers</button>
            <button type="button" className="secondary-button" onClick={keepServerCopy}>Use the saved version</button>
          </span>
        ) : null}
      </div>
      {message ? <p className="occupancy-message">{message}</p> : null}
      {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
      {survey.status === "returned" && survey.reviewNotes ? (
        <p className="psv-callout"><strong>Returned by {survey.reviewedByName || "the reviewer"}:</strong> {survey.reviewNotes}</p>
      ) : null}
      {survey.instructions ? <p className="psv-callout"><strong>Instructions:</strong> {survey.instructions}</p> : null}
      {onOpenResponse ? (
        <button type="button" className="secondary-button" onClick={onOpenResponse}><Siren size={14} /> View the current approved plan</button>
      ) : null}

      <section className="psv-card" aria-label="Checklist">
        <h3><ClipboardCheck size={16} /> Checklist</h3>
        {groupChecklist(survey.checklist).map((group) => (
          <div key={group.name} className="psv-group">
            <h4>{group.name}</h4>
            {group.items.map((item) => {
              const row = survey.results[item.id] || { result: "", note: "" };
              const needsNote = ["changed", "not_checked"].includes(row.result);
              return (
                <div key={item.id} className={`psv-item${row.result ? ` is-${row.result}` : ""}`}>
                  <span className="psv-item-label">{item.label}</span>
                  <div className="psv-choices" role="radiogroup" aria-label={item.label}>
                    {CHECK_RESULTS.filter((r) => r.id).map((r) => (
                      <button key={r.id} type="button" role="radio" aria-checked={row.result === r.id} disabled={!editable}
                        className={`psv-choice${row.result === r.id ? " is-on" : ""}`} onClick={() => setResult(item.id, { result: row.result === r.id ? "" : r.id })}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {needsNote || row.note ? (
                    <textarea rows={2} value={row.note} disabled={!editable} placeholder={row.result === "not_checked" ? "Why couldn't it be checked?" : "What is different?"}
                      aria-label={`Note for ${item.label}`} onChange={(event) => setResult(item.id, { note: event.target.value })} />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <section className="psv-card" aria-label="Corrections to the plan">
        <h3>Corrections to the plan</h3>
        <p className="occupancy-muted">Propose the right value for anything the plan has wrong. A preplan supervisor decides which go into a new revision. Restricted details (codes, shutoffs, hazmat) are corrected by preplan staff.</p>
        {!revision ? <p className="occupancy-muted">The approved plan's details couldn't be loaded, so corrections can't be added here. Use observations instead.</p> : null}
        {proposed.map((field) => (
          <div key={field.key} className="psv-correction">
            <div><strong>{field.label}</strong> <small className="occupancy-muted">{field.section}</small></div>
            <small className="occupancy-muted">Plan says: {String(currentAnswers[field.key] ?? "") || "(blank)"}</small>
            {field.type === "long_text"
              ? <textarea rows={3} value={survey.proposedAnswers[field.key]} disabled={!editable} onChange={(event) => setProposed(field.key, event.target.value)} aria-label={`Correct value for ${field.label}`} />
              : <input value={survey.proposedAnswers[field.key]} disabled={!editable} onChange={(event) => setProposed(field.key, event.target.value)} aria-label={`Correct value for ${field.label}`} />}
            {editable ? <button type="button" className="secondary-button" onClick={() => setProposed(field.key, null)}><Trash2 size={14} /> Remove</button> : null}
          </div>
        ))}
        {editable && revision && unusedFields.length ? (
          <div className="psv-row">
            <select value={fieldKey} onChange={(event) => setFieldKey(event.target.value)} aria-label="Field to correct">
              <option value="">Choose a detail to correct…</option>
              {unusedFields.map((field) => <option key={field.key} value={field.key}>{field.section ? `${field.section}: ` : ""}{field.label}</option>)}
            </select>
            <button type="button" className="secondary-button" disabled={!fieldKey}
              onClick={() => { setProposed(fieldKey, String(currentAnswers[fieldKey] ?? "")); setFieldKey(""); }}>
              <Plus size={14} /> Correct it
            </button>
          </div>
        ) : null}
      </section>

      <section className="psv-card" aria-label="Observations">
        <h3>Observations</h3>
        {survey.observations.map((row) => (
          <div key={row.id} className="psv-obs">
            <strong>{OBSERVATION_CATEGORIES.find((c) => c.id === row.category)?.label}</strong>
            <p>{row.note}</p>
            {row.location ? <small className="occupancy-muted">Location {formatPoint(row.location)}</small> : null}
            {editable ? (
              <button type="button" className="secondary-button" onClick={() => change((current) => ({ ...current, observations: current.observations.filter((o) => o.id !== row.id) }))}>
                <Trash2 size={14} /> Remove
              </button>
            ) : null}
          </div>
        ))}
        {editable ? (
          <div className="psv-add">
            <select value={obsDraft.category} onChange={(event) => setObsDraft((c) => ({ ...c, category: event.target.value }))} aria-label="Observation type">
              {OBSERVATION_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <textarea rows={3} value={obsDraft.note} placeholder="What did you see? Where is it?" aria-label="Observation"
              onChange={(event) => setObsDraft((c) => ({ ...c, note: event.target.value }))} />
            <div className="psv-row">
              <button type="button" className="secondary-button" disabled={busy} onClick={addLocationToDraft}>
                <LocateFixed size={14} /> {obsDraft.location ? "Update my location" : "Add my location"}
              </button>
              {obsDraft.location ? <small className="occupancy-muted">{formatPoint(obsDraft.location)}</small> : null}
            </div>
            <button type="button" className="primary-button" disabled={!obsDraft.note.trim()} onClick={addObservation}><Plus size={14} /> Add observation</button>
          </div>
        ) : null}
      </section>

      <section className="psv-card" aria-label="Photos">
        <h3>Photos</h3>
        <div className="psv-photos">
          {survey.photos.map((photo) => (
            <figure key={photo.id}>
              {photo.downloadUrl ? <img src={photo.downloadUrl} alt={photo.caption || photo.fileName} loading="lazy" /> : null}
              <input value={photo.caption} disabled={!editable} placeholder="Caption" aria-label={`Caption for ${photo.fileName}`}
                onChange={(event) => change((current) => ({ ...current, photos: current.photos.map((p) => (p.id === photo.id ? { ...p, caption: event.target.value } : p)) }))} />
              {photo.location ? <small className="occupancy-muted">{formatPoint(photo.location)}</small> : null}
            </figure>
          ))}
        </div>
        {editable ? (
          <label className={`secondary-button psv-upload${busy ? " is-busy" : ""}`}>
            <Camera size={14} /> {busy ? "Working…" : "Take or add photos"}
            <input type="file" accept="image/*" capture="environment" multiple hidden disabled={busy}
              onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} />
          </label>
        ) : null}
      </section>

      <section className="psv-card" aria-label="Inspection referrals">
        <h3>Refer to fire inspections</h3>
        <p className="occupancy-muted">For conditions an inspector should follow up (a possible code violation). The surveyor doesn't issue violations.</p>
        {survey.referrals.map((row) => (
          <div key={row.id} className="psv-obs">
            <strong>{row.urgency === "urgent" ? "Urgent" : row.urgency === "soon" ? "Soon" : "Routine"}</strong>
            <p>{row.reason}</p>
          </div>
        ))}
        {editable ? (
          <div className="psv-add">
            <textarea rows={2} value={refDraft.reason} placeholder="What should an inspector look at?" aria-label="Referral reason"
              onChange={(event) => setRefDraft((c) => ({ ...c, reason: event.target.value }))} />
            <div className="psv-row">
              <select value={refDraft.urgency} onChange={(event) => setRefDraft((c) => ({ ...c, urgency: event.target.value }))} aria-label="Urgency">
                <option value="routine">Routine</option>
                <option value="soon">Soon</option>
                <option value="urgent">Urgent</option>
              </select>
              <button type="button" className="secondary-button" disabled={!refDraft.reason.trim()} onClick={addReferral}><Plus size={14} /> Add referral</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="psv-card" aria-label="Survey notes">
        <h3>Notes</h3>
        <textarea rows={4} value={survey.notes} disabled={!editable} aria-label="Survey notes"
          onChange={(event) => { const value = event.target.value; change((current) => ({ ...begin(current), notes: value })); }} />
      </section>

      {editable ? (
        <div className="psv-submit">
          {problems.map((problem) => <p key={problem} className="occupancy-muted">{problem}</p>)}
          <button type="button" className="primary-button" disabled={Boolean(problems.length) || state === "saving" || state === "conflict"} onClick={submit}>
            <Send size={14} /> Send for review
          </button>
        </div>
      ) : null}
    </div>
  );
}
