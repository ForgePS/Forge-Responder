import { useRef, useState } from "react";
import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { uploadFirebaseFile } from "../lib/firebaseClient.js";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg";
const DOC_ACCEPT = "image/*,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif";

/**
 * Shared Firebase Storage upload control for logos and file objects.
 *
 * @param {{
 *   buildPath: (file: File) => string,
 *   onUploaded: (result: { name: string, downloadUrl: string, storagePath: string, contentType: string, size: number }) => void,
 *   accept?: string,
 *   maxBytes?: number,
 *   disabled?: boolean,
 *   variant?: "logo" | "file",
 *   previewUrl?: string,
 *   previewAlt?: string,
 *   label?: string,
 *   hint?: string,
 *   buttonLabel?: string,
 *   className?: string,
 * }} props
 */
export default function ObjectUploadField({
  buildPath,
  onUploaded,
  accept,
  maxBytes = 12 * 1024 * 1024,
  disabled = false,
  variant = "file",
  previewUrl = "",
  previewAlt = "Preview",
  label = "Upload file",
  hint = "PDF or image up to 12 MB",
  buttonLabel,
  className = "",
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const resolvedAccept = accept || (variant === "logo" ? IMAGE_ACCEPT : DOC_ACCEPT);
  const resolvedButton = buttonLabel || (variant === "logo" ? "Upload logo" : "Choose file");

  async function handleFile(file) {
    if (!file || disabled || uploading) return;
    setError("");

    if (variant === "logo" && !file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`File must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller.`);
      return;
    }
    if (typeof buildPath !== "function") {
      setError("Upload path is not configured.");
      return;
    }

    setUploading(true);
    try {
      const storagePath = buildPath(file);
      if (!storagePath || String(storagePath).includes("undefined")) {
        throw new Error("Upload path is invalid — select a department or try again.");
      }
      const uploaded = await uploadFirebaseFile(storagePath, file);
      if (!uploaded?.downloadUrl) throw new Error("Upload failed");
      onUploaded?.({
        name: file.name,
        downloadUrl: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
        contentType: uploaded.contentType,
        size: file.size,
      });
    } catch (err) {
      console.error("Object upload failed", err);
      const code = err?.code || "";
      if (code === "storage/unauthorized" || code === "storage/permission-denied") {
        setError("Upload blocked by Storage permissions. Storage rules may need deploying.");
      } else if (code === "storage/retry-limit-exceeded" || code === "storage/network-request-failed") {
        setError("Network error during upload — check connection and try again.");
      } else if (code === "storage/canceled") {
        setError("Upload canceled.");
      } else if (err?.message) {
        setError(`Upload failed: ${err.message}`);
      } else {
        setError("Upload failed — try again.");
      }
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    handleFile(file);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragOver(false);
    handleFile(event.dataTransfer?.files?.[0]);
  }

  return (
    <div className={`object-upload-field object-upload-${variant} ${className}`.trim()}>
      {variant === "logo" && previewUrl ? (
        <div className="object-upload-preview platform-logo-preview">
          <img src={previewUrl} alt={previewAlt} />
        </div>
      ) : null}

      <div
        className={`upload-zone object-upload-zone ${dragOver ? "is-dragover" : ""} ${uploading ? "is-uploading" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {uploading ? <Loader2 size={28} className="spin" /> : variant === "logo" ? <ImagePlus size={28} /> : <UploadCloud size={28} />}
        <strong>{label}</strong>
        <span>{hint}</span>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : resolvedButton}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={resolvedAccept}
          hidden
          disabled={disabled || uploading}
          onChange={onInputChange}
        />
      </div>

      {error ? <p className="object-upload-error hint-text">{error}</p> : null}
    </div>
  );
}
