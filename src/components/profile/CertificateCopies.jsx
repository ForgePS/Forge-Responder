/**
 * Copies of certificates and licenses on a person's profile: view the file,
 * or upload / replace it. Used on My Profile and the Personnel page.
 */
import { useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { buildCertificationDocPath, buildPersonnelDocumentPath } from "../../lib/storagePaths.js";
import { formatPersonnelDateForDisplay } from "../../lib/personnelDates.js";
import { ExpiryBadge } from "./ProfileParts.jsx";

const ACCEPT = "application/pdf,image/*";
const MAX_BYTES = 10 * 1024 * 1024;

/** Upload one certificate file; resolves to { name, url, storagePath, uploadedAt }. */
export async function uploadCertificateFile(departmentId, { certId = "", personId = "" }, file) {
  if (!file) throw new Error("Choose a file.");
  if (file.size > MAX_BYTES) throw new Error("That file is over 10 MB. Scan or save it smaller and try again.");
  const path = certId ? buildCertificationDocPath(departmentId, certId, file.name) : buildPersonnelDocumentPath(departmentId, personId, file.name);
  const uploaded = await uploadFirebaseFile(path, file);
  if (!uploaded?.downloadUrl) throw new Error("Upload failed.");
  return { name: file.name, url: uploaded.downloadUrl, storagePath: uploaded.storagePath || path, uploadedAt: new Date().toISOString() };
}

/** "View" link plus an Upload / Replace button. onUpload(file) returns a promise. */
export function CertificateCopy({ name = "", url = "", canUpload = false, onUpload, label = "certificate" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="profile-copy">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title={name || "Open the file"}><FileText size={14} /> View</a>
      ) : name ? (
        <span className="profile-muted" title="The file name is on record but the file wasn't uploaded here">{name}</span>
      ) : (
        <span className="profile-empty">No copy</span>
      )}
      {canUpload ? (
        <>
          <button type="button" className="profile-icon-btn" disabled={busy} onClick={() => inputRef.current?.click()} aria-label={`${url ? "Replace" : "Upload"} ${label} copy`}>
            {busy ? <Loader2 size={14} className="profile-spin" /> : <Upload size={14} />} {url ? "Replace" : "Upload"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                await onUpload(file);
              } catch (uploadError) {
                setError(uploadError?.message?.includes("10 MB") ? uploadError.message : "Couldn't upload. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : null}
      {error ? <span className="profile-error">{error}</span> : null}
    </span>
  );
}

/** The person's department certification records, each with its certificate copy. */
export function CertificationCopiesTable({ certs = [], canUpload = () => false, onUpload, empty = "No certifications on file." }) {
  if (!certs.length) return <p className="profile-empty">{empty}</p>;
  return (
    <div className="profile-table-wrap">
      <table className="profile-table">
        <thead>
          <tr><th>Certification</th><th>Category</th><th>Issued</th><th>Expires</th><th>Status</th><th>Certificate</th></tr>
        </thead>
        <tbody>
          {certs.map((cert) => (
            <tr key={cert.id}>
              <td><strong>{cert.type || "—"}</strong>{cert.id ? <div className="profile-muted">{cert.id}</div> : null}</td>
              <td>{cert.category || "—"}</td>
              <td>{cert.issue ? formatPersonnelDateForDisplay(cert.issue) : "—"}</td>
              <td>{cert.expires ? <>{formatPersonnelDateForDisplay(cert.expires)} <ExpiryBadge date={cert.expires} /></> : "—"}</td>
              <td>{cert.status || "—"}</td>
              <td>
                <CertificateCopy
                  name={cert.document}
                  url={cert.documentUrl}
                  canUpload={canUpload(cert)}
                  label={cert.type || "certificate"}
                  onUpload={(file) => onUpload(cert, file)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Keys a certificate upload changes on a certification record. */
export function certificationCopyPatch(copy) {
  return { document: copy.name, documentUrl: copy.url, documentStoragePath: copy.storagePath, documentUploadedAt: copy.uploadedAt };
}
