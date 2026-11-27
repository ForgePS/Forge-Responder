/**
 * Billing photos on a field patient care report: the patient's driver's license or ID, insurance cards and other
 * papers. Shown under Billing.
 *
 * PHI: photos are encrypted on the phone with the report and sent with it (fieldPcrFiles.js). Once sent, the copy on
 * the phone is deleted; they're viewed and removed in the RMS after that.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, CircleDashed, Loader2, X } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { attachmentBlob, scopeKey } from "../fieldRecords.js";
import { compressPhoto } from "../fieldPhotos.js";
import { PCR_FILE_KINDS, pcrFileKindLabel, pcrFileProblem } from "../../lib/pcr/pcrFiles.js";
import { Section } from "../ui.jsx";
import { DEMO_DEPARTMENT_ID } from "../../lib/tenantPaths.js";

function usePhotoUrl(attachment, where) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (attachment.uploaded?.recorded) return undefined;
    let active = true;
    let objectUrl = "";
    attachmentBlob(attachment, where)
      .then((blob) => {
        if (!active || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => null);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.uploaded?.recorded, where.scope, where.localId]);
  return url;
}

function PhotoTile({ attachment, where, onRemove, onOpen }) {
  const url = usePhotoUrl(attachment, where);
  const sent = Boolean(attachment.uploaded?.recorded);
  // Once sending has started (a file id is given) the photo may already be on the server: the next send finishes it,
  // and it's removed in the RMS after that. Removing it here would leave the uploaded file behind.
  const sending = !sent && Boolean(attachment.fileId);
  return (
    <li className="fa-pcr-doc">
      <button type="button" className="fa-thumb" disabled={!url} onClick={() => onOpen(url, attachment)} aria-label={`View ${pcrFileKindLabel(attachment.kind)}`}>
        {url ? <img src={url} alt="" /> : sent ? <CheckCircle2 size={22} /> : <CircleDashed size={22} />}
      </button>
      {onRemove && !sent && !sending ? (
        <button type="button" className="fa-thumb-x" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${pcrFileKindLabel(attachment.kind)}`}><X size={16} /></button>
      ) : null}
      <span className="fa-pcr-doc-label">{pcrFileKindLabel(attachment.kind)}</span>
      <small className="fa-hint">{sent ? "Sent" : sending ? "Sending" : "On this phone"}</small>
    </li>
  );
}

export default function PcrBillingPhotos({ localId, attachments, addPhoto, removePhoto, readOnly }) {
  const { snapshot, toast } = useField();
  const where = { scope: scopeKey(snapshot.departmentId, snapshot.uid), localId };
  const inputRef = useRef(null);
  const kindRef = useRef("insurance");
  const [busy, setBusy] = useState("");
  const [viewing, setViewing] = useState(null);
  // The demo's login is shared and public: no photos of real IDs there.
  const demo = snapshot.departmentId === DEMO_DEPARTMENT_ID;

  const take = (kind) => {
    kindRef.current = kind;
    inputRef.current?.click();
  };

  const onPicked = async (file) => {
    if (!file) return;
    const kind = kindRef.current;
    setBusy(kind);
    try {
      const photo = await compressPhoto(file);
      const problem = pcrFileProblem(photo);
      if (problem) {
        toast(problem, "warn");
        return;
      }
      await addPhoto(photo, { kind });
    } finally {
      setBusy("");
    }
  };

  return (
    <Section title="Billing documents">
      <p className="fa-hint">Photos of the patient's driver's license or ID, insurance cards and other papers. Kept encrypted on this phone and sent with the report.</p>
      {attachments.length ? (
        <ul className="fa-pcr-docs">
          {attachments.map((attachment) => (
            <PhotoTile
              key={attachment.id}
              attachment={attachment}
              where={where}
              onRemove={readOnly ? null : removePhoto}
              onOpen={(url, a) => setViewing({ url, label: pcrFileKindLabel(a.kind) })}
            />
          ))}
        </ul>
      ) : null}
      {!readOnly && demo ? <p className="fa-hint">Adding photos is turned off in the demo, because its login is shared.</p> : null}
      {!readOnly && !demo ? (
        <div className="fa-pcr-doc-actions">
          {PCR_FILE_KINDS.map((k) => (
            <button key={k.id} type="button" className="fa-btn fa-btn-secondary fa-btn-block" disabled={Boolean(busy)} onClick={() => take(k.id)}>
              {busy === k.id ? <Loader2 size={18} className="fa-spin" /> : <Camera size={18} />} {k.label}
            </button>
          ))}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              onPicked(file);
            }}
          />
        </div>
      ) : null}
      {viewing ? (
        <div className="fa-sheet-backdrop is-center" onClick={() => setViewing(null)}>
          <div className="fa-pcr-doc-view" role="dialog" aria-modal="true" aria-label={viewing.label} onClick={(e) => e.stopPropagation()}>
            <img src={viewing.url} alt={viewing.label} />
            <button type="button" className="fa-btn fa-btn-secondary fa-btn-block" onClick={() => setViewing(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}
