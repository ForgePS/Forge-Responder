import { useMemo, useState } from "react";
import { Plus, UploadCloud } from "lucide-react";
import { Modal } from "../shell/ui.jsx";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { buildCertificationDocPath } from "../../lib/storagePaths.js";
import {
  buildCertificationRecord,
  certificationCategoryOptions,
  certificationPersonOptions,
  certificationTypeOptions,
  newCertificationId,
  validateCertificationDraft,
} from "../../lib/certificationRecords.js";
import "../../styles/certs-signage.css";

const EMPTY_DRAFT = { person: "", type: "", category: "", issue: "", expires: "", file: null };

/** "Add certification": who, what, dates, and an optional card/certificate file. */
export default function AddCertificationModal({ records = [], personnel = [], departmentId = "", onSave, onClose }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => certificationPersonOptions(personnel, records), [personnel, records]);
  const types = useMemo(() => certificationTypeOptions(records), [records]);
  const categories = useMemo(() => certificationCategoryOptions(records), [records]);

  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  async function save() {
    const found = validateCertificationDraft(draft);
    if (draft.file && !departmentId) found.push("Files can't be uploaded right now — save without the file, then add it from the record.");
    setProblems(found);
    if (found.length) return;
    setBusy(true);
    try {
      const id = newCertificationId(records);
      let document = null;
      if (draft.file) {
        const uploaded = await uploadFirebaseFile(buildCertificationDocPath(departmentId, id, draft.file.name), draft.file);
        if (!uploaded?.downloadUrl) throw new Error("Upload failed");
        document = { name: draft.file.name, downloadUrl: uploaded.downloadUrl, storagePath: uploaded.storagePath };
      }
      const match = (Array.isArray(personnel) ? personnel : []).find((person) => person?.name === draft.person.trim());
      onSave(buildCertificationRecord(draft, { id, personnelId: match?.id || "", document }));
    } catch (error) {
      console.error("Add certification failed", error);
      setProblems(["The file didn't upload, so the certification wasn't saved. Try again, or save it without the file."]);
      setBusy(false);
    }
  }

  return (
    <Modal title="Add certification" onClose={() => !busy && onClose()}>
      <div className="upload-form">
        <label className="rms-field">
          <span>Person</span>
          <input list="add-cert-people" value={draft.person} disabled={busy} onChange={set("person")} placeholder="Choose or type a name" />
          <datalist id="add-cert-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
        </label>
        <label className="rms-field">
          <span>Certification</span>
          <input list="add-cert-types" value={draft.type} disabled={busy} onChange={set("type")} placeholder="e.g. Paramedic, Firefighter II" />
          <datalist id="add-cert-types">{types.map((type) => <option key={type} value={type} />)}</datalist>
        </label>
        <label className="rms-field">
          <span>Category</span>
          <select value={draft.category} disabled={busy} onChange={set("category")}>
            <option value="">Choose…</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="rms-field">
          <span>Issue date</span>
          <input type="date" value={draft.issue} disabled={busy} onChange={set("issue")} />
        </label>
        <label className="rms-field">
          <span>Expiration date</span>
          <input type="date" value={draft.expires} disabled={busy} onChange={set("expires")} />
        </label>
      </div>
      <div className="upload-zone cert-add-form-zone">
        <UploadCloud size={28} />
        <strong>Card or certificate (optional)</strong>
        <span>{draft.file ? `Selected: ${draft.file.name}` : "A PDF or photo of the card. You can also add it later."}</span>
        <input
          type="file"
          accept="image/*,.pdf,.png,.jpg,.jpeg,.webp"
          disabled={busy}
          onChange={(event) => setDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))}
        />
      </div>
      {problems.length ? (
        <ul className="form-errors" role="alert">
          {problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      ) : null}
      <div className="modal-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={busy} onClick={save}>
          <Plus size={14} /> {busy ? "Saving…" : "Add certification"}
        </button>
      </div>
    </Modal>
  );
}
