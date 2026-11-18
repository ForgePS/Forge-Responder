import { useEffect, useState } from "react";
import { Camera, X } from "lucide-react";
import ChecklistFieldInput from "../inspections/ChecklistFieldInput.jsx";
import { DISPLAY_FIELD_TYPES, MAX_PHOTOS_PER_FIELD, NEGATIVE_ANSWERS, isNegativeAnswer } from "../../lib/digitalForms/formDraft.js";
import { describeError, photoUrl, uploadFormPhoto } from "../../lib/digitalForms/digitalFormsService.js";

/** A saved photo (path only) gets its link when shown. */
function PhotoThumb({ photo, onRemove }) {
  const [url, setUrl] = useState(photo.url || "");
  useEffect(() => {
    if (photo.url || !photo.path) return undefined;
    let live = true;
    photoUrl(photo.path).then((next) => { if (live) setUrl(next); }).catch(() => {});
    return () => { live = false; };
  }, [photo.path, photo.url]);
  return (
    <li>
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={photo.name || "Photo"} /></a> : <span className="df-photo-loading">Photo</span>}
      {onRemove ? (
        <button type="button" className="checklist-photo-remove" aria-label="Remove photo" onClick={onRemove}><X size={12} /></button>
      ) : null}
    </li>
  );
}

/**
 * Remarks (required) and photos (optional) for an answer of No or Fail.
 * Read-only when showing a saved submission.
 */
function NegativeDetails({ field, value, detail = {}, editable, missing, departmentId, uid, allowPhotos = true, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const photos = Array.isArray(detail.photos) ? detail.photos : [];
  const answer = NEGATIVE_ANSWERS[field.type] || String(value || "No").trim();

  async function addPhotos(fileList) {
    const files = Array.from(fileList || []).slice(0, MAX_PHOTOS_PER_FIELD - photos.length);
    if (!files.length) return;
    setUploading(true);
    setError("");
    const added = [];
    try {
      for (const file of files) added.push(await uploadFormPhoto(departmentId, uid, file));
    } catch (uploadError) {
      setError(`Photo upload failed: ${describeError(uploadError)}`);
    } finally {
      if (added.length) onChange({ ...detail, photos: [...photos, ...added] });
      setUploading(false);
    }
  }

  if (!editable) {
    return (
      <div className="df-negative">
        <span className="df-negative-title">Remarks ({answer})</span>
        <p className="df-remarks-text">{detail.remarks || "—"}</p>
        {photos.length ? (
          <ul className="checklist-photo-list">
            {photos.map((p) => <PhotoThumb key={p.path || p} photo={typeof p === "string" ? { path: p } : p} />)}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`df-negative${missing ? " checklist-field-missing" : ""}`}>
      <label className="df-remarks">
        <span className="df-negative-title">Remarks for {answer} *{missing ? " (required)" : ""}</span>
        <textarea
          rows={3}
          value={detail.remarks || ""}
          aria-invalid={missing || undefined}
          placeholder="What's wrong, and what was done about it?"
          onChange={(e) => onChange({ ...detail, remarks: e.target.value })}
        />
      </label>
      {photos.length ? (
        <ul className="checklist-photo-list">
          {photos.map((photo, index) => (
            <PhotoThumb key={photo.path} photo={photo}
              onRemove={() => onChange({ ...detail, photos: photos.filter((_, i) => i !== index) })} />
          ))}
        </ul>
      ) : null}
      {!allowPhotos ? <small className="occupancy-muted">Members can take or add photos here.</small> : null}
      {allowPhotos && photos.length < MAX_PHOTOS_PER_FIELD ? (
        <label className={`secondary-button df-photo-add${uploading ? " is-busy" : ""}`}>
          <Camera size={14} /> {uploading ? "Uploading…" : "Take or add photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            disabled={uploading}
            onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
          />
        </label>
      ) : null}
      {error ? <small className="df-error-text">{error}</small> : null}
    </div>
  );
}

/**
 * Draws a digital form for filling in (or previewing), section by section,
 * with the same field inputs as inspection checklists. A No/Fail answer opens
 * remarks and photos underneath it.
 */
export default function FormFillView({
  definition,
  answers = {},
  details = {},
  onChange,
  onDetailChange,
  editable = true,
  missingKeys = new Set(),
  missingRemarkKeys = new Set(),
  signerName = "",
  departmentId = "",
  uid = "",
  allowPhotos = true,
}) {
  const sections = definition?.sections || [];
  if (!sections.length) return <p className="occupancy-muted">This form has no fields yet.</p>;
  return (
    <div className="df-fill">
      {definition.description ? <p className="occupancy-muted">{definition.description}</p> : null}
      {sections.map((section) => (
        <div key={section.id} className="template-section-card">
          <strong>{section.title}</strong>
          <div className="template-fields">
            {(section.fields || []).map((field) => {
              if (DISPLAY_FIELD_TYPES.has(field.type)) {
                return (
                  <div key={field.id || field.key} className={`config-field df-display df-${field.type}`}>
                    <span>{field.label}</span>
                    {field.helpText ? <small className="occupancy-muted">{field.helpText}</small> : null}
                  </div>
                );
              }
              const missing = missingKeys.has(field.key);
              const negative = isNegativeAnswer(field, answers[field.key]);
              return (
                <div key={field.id || field.key} className={`config-field${missing ? " checklist-field-missing" : ""}`} data-checklist-key={field.key}>
                  <span>
                    {field.label}
                    {field.required ? " *" : ""}
                    {missing ? " (required)" : ""}
                  </span>
                  <ChecklistFieldInput
                    field={field}
                    value={answers[field.key]}
                    editable={editable}
                    invalid={missing}
                    signerName={signerName}
                    onChange={(next) => onChange?.(field.key, next)}
                  />
                  {field.helpText ? <small className="occupancy-muted">{field.helpText}</small> : null}
                  {negative ? (
                    <NegativeDetails
                      value={answers[field.key]}
                      field={field}
                      detail={details[field.key]}
                      editable={editable && Boolean(onDetailChange)}
                      missing={missingRemarkKeys.has(field.key)}
                      departmentId={departmentId}
                      uid={uid}
                      allowPhotos={allowPhotos}
                      onChange={(next) => onDetailChange?.(field.key, next)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
