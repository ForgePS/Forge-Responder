import { useRef } from "react";
import { Camera, CirclePlus, ImagePlus, X } from "lucide-react";
import { MAX_DAMAGE_PHOTOS } from "../../lib/damageReportPhotos.js";

let photoSeq = 0;

function DamagePhotoPicker({ photos = [], onChange }) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const room = MAX_DAMAGE_PHOTOS - photos.length;

  function addFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => String(file.type || "").startsWith("image/")).slice(0, Math.max(room, 0));
    if (!files.length) return;
    onChange([
      ...photos,
      ...files.map((file) => ({ id: `photo-${Date.now()}-${photoSeq += 1}`, file, name: file.name, previewUrl: URL.createObjectURL(file) })),
    ]);
  }

  function remove(id) {
    const photo = photos.find((p) => p.id === id);
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div className="maintenance-block-field">
      <span>Photos of the damage <small className="maintenance-optional">(optional, up to {MAX_DAMAGE_PHOTOS})</small></span>
      <div className="maintenance-photo-actions">
        <button type="button" className="secondary-button" disabled={room <= 0} onClick={() => cameraRef.current?.click()}>
          <Camera size={15} /> Take photo
        </button>
        <button type="button" className="secondary-button" disabled={room <= 0} onClick={() => libraryRef.current?.click()}>
          <ImagePlus size={15} /> Choose photos
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
        />
      </div>
      {photos.length ? (
        <ul className="maintenance-photo-grid">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <img src={photo.previewUrl} alt={`Damage photo ${index + 1}`} />
              <button type="button" className="maintenance-photo-remove" aria-label={`Remove photo ${index + 1}`} onClick={() => remove(photo.id)}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function MaintenanceIssueForm({
  value,
  onChange,
  apparatusOptions = [],
  submittedByName = "",
  onSubmit,
  submitting = false,
}) {
  function update(patch) {
    onChange?.({ ...value, ...patch });
  }

  return (
    <form
      className="maintenance-damage-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <p className="auth-help">
        Complete this damage report. When submitted, a message is sent to all Battalion Chiefs.
      </p>

      <label className="maintenance-line-field">
        <span>Date:</span>
        <input
          type="date"
          value={value.date || ""}
          onChange={(event) => update({ date: event.target.value })}
          required
        />
      </label>

      <label className="maintenance-line-field">
        <span>Damaged Property/Equipment Location:</span>
        <select
          value={value.location || ""}
          onChange={(event) => update({ location: event.target.value })}
          required
        >
          <option value="">Select apparatus…</option>
          {apparatusOptions.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </label>

      <label className="maintenance-line-field">
        <span>Equipment (Please write if not listed above)</span>
        <input
          type="text"
          value={value.equipment || ""}
          onChange={(event) => update({ equipment: event.target.value })}
          placeholder="Pump, compartment door, SCBA, etc."
        />
      </label>

      <label className="maintenance-block-field">
        <span>What is damaged and provide a description of the damage:</span>
        <textarea
          rows={6}
          value={value.damageDescription || ""}
          onChange={(event) => update({ damageDescription: event.target.value })}
          placeholder="Describe the damage, location on the unit, and any safety concerns."
          required
        />
      </label>

      <DamagePhotoPicker photos={value.photos || []} onChange={(photos) => update({ photos })} />

      <label className={`maintenance-oos-check${value.unitOutOfService ? " is-checked" : ""}`}>
        <input
          type="checkbox"
          checked={Boolean(value.unitOutOfService)}
          onChange={(event) => update({ unitOutOfService: event.target.checked })}
        />
        <span>
          <strong>Take this unit out of service</strong>
          <small>Check this if the unit can't safely respond until it's fixed.</small>
        </span>
      </label>

      <div className="maintenance-submitted-by">
        <span>Submitted by</span>
        <strong>{submittedByName || "Employee"}</strong>
        <small>From your sign-in</small>
      </div>

      <button type="submit" className="primary-button" disabled={submitting}>
        <CirclePlus size={14} /> {submitting ? ((value.photos || []).length ? "Uploading photos…" : "Submitting...") : "Submit Damage Report"}
      </button>
    </form>
  );
}
