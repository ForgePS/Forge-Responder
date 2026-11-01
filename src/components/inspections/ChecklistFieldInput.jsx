import { useState } from "react";
import { Camera, X } from "lucide-react";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { addInspectionAttachment } from "../../lib/inspections/inspectionWorkflow.js";
import { getChecklistFieldOptions, getChecklistInputKind } from "../../lib/inspections/checklistFields.js";
import { formatCitationLabel } from "../../lib/codeLibrary/pendingCitation.js";
import "../../styles/inspections-checklist.css";

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function PhotoField({ field, value, editable, departmentId, inspectionId, actor, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const photos = Array.isArray(value) ? value : [];

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You're offline. Photos need a connection — add them from Offline & Sync instead.");
      return;
    }
    setUploading(true);
    setError("");
    const added = [];
    try {
      for (const file of files) {
        const id = `ATT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const safeName = String(file.name || "photo").replace(/[^A-Za-z0-9._-]+/g, "_");
        const storagePath = `departments/${departmentId}/inspections/${inspectionId}/attachments/${id}-${safeName}`;
        const uploaded = await uploadFirebaseFile(storagePath, file);
        await addInspectionAttachment(departmentId, inspectionId, {
          id,
          kind: "photo",
          fileName: file.name || safeName,
          note: field.label || "",
          fieldKey: field.key,
          storagePath: uploaded.storagePath,
          downloadUrl: uploaded.downloadUrl,
          contentType: uploaded.contentType,
          sizeBytes: file.size || 0,
          uploadedAt: new Date().toISOString(),
          uploadedBy: actor?.actorName || "",
        }, actor);
        added.push({ id, fileName: file.name || safeName, downloadUrl: uploaded.downloadUrl });
      }
    } catch (uploadError) {
      setError(`Photo upload failed: ${uploadError?.message || "unknown error"}. Try again.`);
    } finally {
      if (added.length) onChange([...photos, ...added]);
      setUploading(false);
    }
  }

  return (
    <div className="checklist-photo-field">
      {photos.length ? (
        <ul className="checklist-photo-list">
          {photos.map((photo) => (
            <li key={photo.id}>
              <a href={photo.downloadUrl} target="_blank" rel="noreferrer">
                <img src={photo.downloadUrl} alt={photo.fileName || "Inspection photo"} />
              </a>
              {editable ? (
                <button
                  type="button"
                  className="checklist-photo-remove"
                  aria-label={`Remove ${photo.fileName || "photo"} from this item`}
                  title="Remove from this item (the file stays in the inspection's attachments)"
                  onClick={() => onChange(photos.filter((item) => item.id !== photo.id))}
                >
                  <X size={12} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <small className="occupancy-muted">No photos yet.</small>
      )}
      {editable ? (
        <label className={`secondary-button checklist-photo-add${uploading ? " is-busy" : ""}`}>
          <Camera size={14} /> {uploading ? "Uploading..." : "Add photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={uploading}
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
      {error ? <small className="checklist-field-error" role="alert">{error}</small> : null}
    </div>
  );
}

function SignatureField({ value, editable, defaultName, onChange }) {
  const signed = value && typeof value === "object" && value.name && value.signedAt ? value : null;
  const [name, setName] = useState(defaultName || "");

  if (signed) {
    return (
      <div className="checklist-signature">
        <span>
          Signed by <strong>{signed.name}</strong> on {new Date(signed.signedAt).toLocaleString()}
        </span>
        {editable ? (
          <button type="button" className="text-button" onClick={() => onChange("")}>Clear</button>
        ) : null}
      </div>
    );
  }
  if (!editable) return <small className="occupancy-muted">Not signed.</small>;
  return (
    <div className="checklist-signature">
      <input
        value={name}
        placeholder="Type full name to sign"
        onChange={(event) => setName(event.target.value)}
      />
      <button
        type="button"
        className="secondary-button"
        disabled={!name.trim()}
        onClick={() => onChange({ name: name.trim(), signedAt: new Date().toISOString() })}
      >
        Sign
      </button>
      <small className="occupancy-muted">
        Typed signature: the name and date/time are recorded. Drawn signatures aren't available yet.
      </small>
    </div>
  );
}

/**
 * One checklist answer input, drawn to match the template field's type.
 */
export default function ChecklistFieldInput({
  field,
  value,
  editable,
  invalid = false,
  departmentId,
  inspectionId,
  actor,
  signerName = "",
  pendingCitation = null,
  onChange,
}) {
  const kind = getChecklistInputKind(field.type);
  const inputId = `checklist-${field.id || field.key}`;
  const invalidProps = invalid ? { "aria-invalid": true, className: "checklist-input-invalid" } : {};

  if (kind === "display") {
    return <p className="occupancy-muted">{field.helpText || field.label}</p>;
  }

  if (kind === "choice" || kind === "select") {
    const options = getChecklistFieldOptions(field);
    const current = value == null ? "" : String(value);
    if (kind === "select" && !options.length) {
      return <small className="occupancy-muted">No choices are set up for this item. Add them in Configuration Studio.</small>;
    }
    return (
      <select id={inputId} value={current} disabled={!editable} onChange={(e) => onChange(e.target.value)} {...invalidProps}>
        <option value="">Select</option>
        {current && !options.includes(current) ? <option value={current}>{current}</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (kind === "multi_select") {
    const options = getChecklistFieldOptions(field);
    const selected = Array.isArray(value) ? value : [];
    if (!options.length) {
      return <small className="occupancy-muted">No choices are set up for this item. Add them in Configuration Studio.</small>;
    }
    return (
      <div className={`checklist-multi${invalid ? " checklist-input-invalid" : ""}`}>
        {options.map((option) => (
          <label key={option} className="occupancy-primary-toggle">
            <input
              type="checkbox"
              disabled={!editable}
              checked={selected.includes(option)}
              onChange={(e) => onChange(
                e.target.checked ? [...selected, option] : selected.filter((item) => item !== option)
              )}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (kind === "checkbox") {
    return (
      <label className="occupancy-primary-toggle">
        <input type="checkbox" disabled={!editable} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.placeholder || "Yes"}
      </label>
    );
  }

  if (kind === "long_text") {
    return <textarea id={inputId} rows={3} value={value ?? ""} disabled={!editable} onChange={(e) => onChange(e.target.value)} {...invalidProps} />;
  }

  if (kind === "number") {
    return (
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        disabled={!editable}
        placeholder={field.placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
        {...invalidProps}
      />
    );
  }

  if (kind === "date") {
    return (
      <div className="checklist-inline">
        <input
          id={inputId}
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          disabled={!editable}
          onChange={(e) => onChange(e.target.value)}
          {...invalidProps}
        />
        {editable && !value ? (
          <button type="button" className="text-button" onClick={() => onChange(todayInputValue())}>Today</button>
        ) : null}
      </div>
    );
  }

  if (kind === "photo") {
    return (
      <PhotoField
        field={field}
        value={value}
        editable={editable}
        departmentId={departmentId}
        inspectionId={inspectionId}
        actor={actor}
        onChange={onChange}
      />
    );
  }

  if (kind === "signature") {
    return <SignatureField value={value} editable={editable} defaultName={signerName} onChange={onChange} />;
  }

  if (kind === "code_citation") {
    const pendingLabel = formatCitationLabel(pendingCitation);
    return (
      <div className="checklist-inline">
        <input
          id={inputId}
          value={value ?? ""}
          disabled={!editable}
          placeholder="Code section, e.g. IFC 1010.1"
          aria-label="Code section"
          onChange={(e) => onChange(e.target.value)}
          {...invalidProps}
        />
        {editable && pendingLabel && value !== pendingLabel ? (
          <button type="button" className="text-button" onClick={() => onChange(pendingLabel)}>
            Use {pendingCitation.sectionNumber} from Code Library
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <input
      id={inputId}
      value={value ?? ""}
      disabled={!editable}
      placeholder={field.placeholder || ""}
      onChange={(e) => onChange(e.target.value)}
      {...invalidProps}
    />
  );
}
