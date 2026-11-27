/**
 * Billing documents on a patient care report (RMS): photos or scans of the patient's driver's license or ID,
 * insurance cards and other papers. Shown under Billing.
 *
 * PHI: files are read with the signed-in person's credentials and shown from in-memory blob URLs that are released
 * when the panel closes. Nothing is cached or logged. Who may add, open or remove them is decided by
 * storage.rules and firestore.rules (the report's crew while it's a draft, members who may unlock reports).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, FileText, IdCard, Loader2, Trash2, X } from "lucide-react";
import { compressPhoto } from "../../field/fieldPhotos.js";
import { PCR_FILE_ACCEPT, PCR_FILE_KINDS, isPcrFileImage, pcrFileKindLabel, pcrFileProblem } from "../../lib/pcr/pcrFiles.js";
import { addPcrFile, listPcrFiles, readPcrFile, removePcrFile } from "../../lib/pcrFilesService.js";
import { formatWhen, friendlyError } from "./PcrReview.jsx";
import { DEMO_DEPARTMENT_ID } from "../../lib/tenantPaths.js";

/** Blob URLs for the files shown, made on demand and released on unmount. */
function useFileUrls() {
  const urls = useRef(new Map());
  const [, setVersion] = useState(0);
  useEffect(() => () => {
    for (const entry of urls.current.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    urls.current.clear();
  }, []);
  const load = useCallback(async (file) => {
    if (urls.current.has(file.id)) return urls.current.get(file.id).promise;
    const promise = readPcrFile(file).then((blob) => {
      const url = URL.createObjectURL(new Blob([blob], { type: file.contentType }));
      urls.current.set(file.id, { promise, url });
      setVersion((v) => v + 1);
      return url;
    }).catch((error) => {
      urls.current.set(file.id, { promise, url: "", error: true });
      setVersion((v) => v + 1);
      throw error;
    });
    urls.current.set(file.id, { promise, url: "" });
    return promise;
  }, []);
  const get = (id) => urls.current.get(id) || null;
  return { load, get };
}

export default function PcrBillingFiles({ departmentId, report, editable, online, actor, onMessage, onError }) {
  const [files, setFiles] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [kind, setKind] = useState("insurance");
  const [busy, setBusy] = useState("");
  const [viewing, setViewing] = useState(null);
  const inputRef = useRef(null);
  const urls = useFileUrls();
  const loadUrl = urls.load;

  useEffect(() => {
    let active = true;
    listPcrFiles(departmentId, report.id)
      .then((rows) => active && setFiles(rows))
      .catch((error) => active && (setFiles([]), setLoadError(friendlyError(error))));
    return () => {
      active = false;
    };
  }, [departmentId, report.id]);

  useEffect(() => {
    for (const file of files || []) if (isPcrFileImage(file.contentType)) loadUrl(file).catch(() => null);
  }, [files, loadUrl]);

  const choose = (nextKind) => {
    setKind(nextKind);
    inputRef.current?.click();
  };

  const upload = async (picked) => {
    if (!picked) return;
    const problem = pcrFileProblem(picked);
    if (problem) {
      onError?.(problem);
      return;
    }
    setBusy("upload");
    try {
      const file = isPcrFileImage(picked.type) ? await compressPhoto(picked) : picked;
      const record = await addPcrFile(departmentId, report, { file, kind }, actor);
      setFiles((current) => [record, ...(current || [])]);
      onMessage?.(`${pcrFileKindLabel(kind)} added`);
    } catch (error) {
      onError?.(friendlyError(error));
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (file) => {
    if (!window.confirm(`Remove this ${pcrFileKindLabel(file.kind).toLowerCase()} from the report? It can't be recovered.`)) return;
    setBusy(file.id);
    try {
      await removePcrFile(departmentId, report, file, actor);
      setFiles((current) => (current || []).filter((f) => f.id !== file.id));
      if (viewing?.id === file.id) setViewing(null);
      onMessage?.("Document removed");
    } catch (error) {
      onError?.(friendlyError(error));
    } finally {
      setBusy("");
    }
  };

  const openPdf = async (file) => {
    try {
      const url = await urls.load(file);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      onError?.(friendlyError(error));
    }
  };

  // The demo's login is shared and public: no photos of real IDs there.
  const demo = departmentId === DEMO_DEPARTMENT_ID;
  const canAdd = editable && online && !demo;

  return (
    <section className="nr-section pcr-section pcr-files" id="pcr-section-billing-files" aria-labelledby="pcr-files-title">
      <header>
        <div className="nr-section-title">
          <span className="nr-section-icon"><IdCard size={16} /></span>
          <div>
            <h3 id="pcr-files-title">Billing documents</h3>
            <p className="nr-muted">Photos of the patient's driver's license or ID, insurance cards and other papers for billing.</p>
          </div>
        </div>
      </header>

      {canAdd ? (
        <div className="pcr-files-add">
          {PCR_FILE_KINDS.map((k) => (
            <button key={k.id} type="button" className="nr-btn nr-btn-ghost nr-small" disabled={Boolean(busy)} onClick={() => choose(k.id)}>
              {busy === "upload" && kind === k.id ? <Loader2 size={15} className="nr-spin" /> : <Camera size={15} />} {k.label}
            </button>
          ))}
          <input
            ref={inputRef}
            type="file"
            accept={PCR_FILE_ACCEPT}
            hidden
            onChange={(event) => upload(event.target.files?.[0])}
          />
        </div>
      ) : editable && demo ? (
        <p className="nr-muted">Adding documents is turned off in the demo, because its login is shared.</p>
      ) : editable && !online ? (
        <p className="nr-muted">Documents can be added when you're back online.</p>
      ) : null}

      {files === null ? (
        <p className="nr-muted"><Loader2 size={14} className="nr-spin" /> Loading documents…</p>
      ) : loadError ? (
        <p className="nr-muted">Documents couldn't be loaded: {loadError}</p>
      ) : !files.length ? (
        <p className="nr-muted">No documents yet.</p>
      ) : (
        <ul className="pcr-files-list">
          {files.map((file) => {
            const entry = urls.get(file.id);
            const image = isPcrFileImage(file.contentType);
            return (
              <li key={file.id} className="pcr-file">
                <button
                  type="button"
                  className="pcr-file-thumb"
                  aria-label={`Open ${pcrFileKindLabel(file.kind)}`}
                  onClick={() => (image ? setViewing(file) : openPdf(file))}
                >
                  {image && entry?.url ? <img src={entry.url} alt="" /> : image && !entry?.error ? <Loader2 size={18} className="nr-spin" /> : <FileText size={22} />}
                </button>
                <div className="pcr-file-meta">
                  <strong>{pcrFileKindLabel(file.kind)}</strong>
                  <small>{formatWhen(file.createdAt)}{file.createdByName ? ` · ${file.createdByName}` : ""}</small>
                  {!image ? (
                    <button type="button" className="nr-link" onClick={() => openPdf(file)}><ExternalLink size={13} /> Open PDF</button>
                  ) : null}
                </div>
                {canAdd ? (
                  <button type="button" className="nr-btn nr-btn-ghost nr-small" aria-label={`Remove ${pcrFileKindLabel(file.kind)}`} disabled={Boolean(busy)} onClick={() => remove(file)}>
                    {busy === file.id ? <Loader2 size={15} className="nr-spin" /> : <Trash2 size={15} />}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {viewing ? (
        <div className="nr-dialog-backdrop" onClick={() => setViewing(null)}>
          <div className="nr-dialog pcr-file-viewer" role="dialog" aria-modal="true" aria-label={pcrFileKindLabel(viewing.kind)} onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{pcrFileKindLabel(viewing.kind)}</h2>
              <button type="button" className="nr-btn nr-btn-ghost nr-small" aria-label="Close" onClick={() => setViewing(null)}><X size={16} /></button>
            </header>
            {urls.get(viewing.id)?.url ? <img src={urls.get(viewing.id).url} alt={pcrFileKindLabel(viewing.kind)} /> : <p className="nr-muted">Loading…</p>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
