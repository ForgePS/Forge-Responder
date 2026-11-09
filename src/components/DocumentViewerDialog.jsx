import React, { useEffect } from "react";
import { CheckCircle2, ExternalLink, X } from "lucide-react";
import { documentHasFile, documentPreviewKind } from "../lib/documentPreview.js";

/**
 * Shows a document (its file when it has one, plus its details) so a person can
 * read it before acknowledging. `onAcknowledge` is left out once they already have.
 */
export default function DocumentViewerDialog({ doc, onClose, onAcknowledge, acknowledged = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasFile = documentHasFile(doc);
  const kind = documentPreviewKind(doc);
  const meta = [doc.category, doc.version ? `v${doc.version}` : "", doc.effectiveDate ? `Effective ${doc.effectiveDate}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="modal-backdrop document-viewer-backdrop" role="presentation" onClick={onClose}>
      <div
        className="workflow-modal document-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={doc.title || "Document"}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="document-viewer-title">
            <strong>{doc.title || "Document"}</strong>
            {meta ? <small>{meta}</small> : null}
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="modal-content document-viewer-body">
          {doc.description ? <p className="document-viewer-description">{doc.description}</p> : null}
          {kind === "pdf" ? (
            <iframe className="document-viewer-frame" src={doc.fileUrl} title={doc.title || "Document"} />
          ) : kind === "image" ? (
            <img className="document-viewer-image" src={doc.fileUrl} alt={doc.title || "Document"} />
          ) : hasFile ? (
            <div className="document-viewer-note">
              This file type can't be shown here. Open it in a new tab to read it.
            </div>
          ) : (
            <div className="document-viewer-note">
              No file is attached to this document yet. Ask an administrator to add it.
            </div>
          )}
        </div>
        <footer>
          {hasFile ? (
            <a className="secondary-button" href={doc.fileUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open in new tab
            </a>
          ) : null}
          {acknowledged ? (
            <span className="document-viewer-done"><CheckCircle2 size={16} /> You acknowledged this</span>
          ) : onAcknowledge ? (
            <button type="button" className="primary-button" onClick={onAcknowledge}>
              <CheckCircle2 size={16} /> I have read this — Acknowledge
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
