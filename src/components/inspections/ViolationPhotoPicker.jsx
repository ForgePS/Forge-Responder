import { useEffect, useMemo } from "react";
import { Camera, X } from "lucide-react";
import { MAX_VIOLATION_PHOTOS, checkViolationPhoto } from "../../lib/inspections/violationPhotoRules.js";
import "../../styles/inspections-checklist.css";

/**
 * Photos picked before a violation is issued: shown as previews, uploaded by the
 * caller once the violation exists. `files` is a File[]; `onChange(files, problem)`.
 */
export default function ViolationPhotoPicker({ files = [], onChange, disabled = false }) {
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  function add(fileList) {
    const picked = Array.from(fileList || []);
    const problem = picked.map(checkViolationPhoto).find(Boolean) || "";
    const ok = picked.filter((file) => !checkViolationPhoto(file));
    const next = [...files, ...ok].slice(0, MAX_VIOLATION_PHOTOS);
    const tooMany = files.length + ok.length > MAX_VIOLATION_PHOTOS ? `Up to ${MAX_VIOLATION_PHOTOS} photos.` : "";
    onChange(next, problem || tooMany);
  }

  return (
    <div className="checklist-photo-field">
      {previews.length ? (
        <ul className="checklist-photo-list">
          {previews.map(({ file, url }, index) => (
            <li key={`${file.name}-${index}`}>
              <img src={url} alt={file.name || "Violation photo"} />
              {!disabled ? (
                <button
                  type="button"
                  className="checklist-photo-remove"
                  aria-label={`Remove ${file.name || "photo"}`}
                  onClick={() => onChange(files.filter((_, i) => i !== index), "")}
                >
                  <X size={12} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {files.length < MAX_VIOLATION_PHOTOS ? (
        <label className={`secondary-button checklist-photo-add${disabled ? " is-busy" : ""}`}>
          <Camera size={14} /> Add photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={disabled}
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
