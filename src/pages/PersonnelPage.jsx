import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { emergencyContactFieldKey, formatUsPhone, PERSONNEL_PHONE_FIELDS, copyEmployeeAddressToEmergency } from "../lib/personnelContact.js";
import { splitPersonnelCertifications } from "../lib/personnelEmsCredentials.js";
import { normalizePersonnelRecord } from "../lib/firestoreSanitize.js";
import { createEmptyPersonnelRecord, nextPersonnelRecordId } from "../lib/personnelSchema.js";
import { resolvePersonnelIdPrefix } from "../data/tenants/index.js";
import { applyPersonnelBulkEdit } from "../lib/personnelBulkEdit.js";
import { writeAuditLog } from "../lib/auditService.js";
import { uploadFirebaseFile } from "../lib/firebaseClient.js";
import PersonnelDetailView from "../components/personnel/PersonnelDetailView.jsx";
import PersonnelImportModal from "../components/personnel/PersonnelImportModal.jsx";
import PersonnelListView from "../components/personnel/PersonnelListView.jsx";

export default function PersonnelPage({
  query,
  records = [],
  setRecords,
  training = [],
  departmentId,
  canEditPhoto = false,
  canEditProfile = false,
  canViewPrivateInfo = false,
  initialPersonId = "",
  onInitialPersonConsumed,
  onOpenEmployeeProfile,
}) {
  const safeRecords = Array.isArray(records) ? records : [];
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState("");
  const [activeSection, setActiveSection] = useState("personalDetails");
  const [editing, setEditing] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const photoInputRef = useRef(null);

  const selected = safeRecords.find((person) => person.id === selectedId) || null;
  const [draft, setDraft] = useState(selected || {});

  useEffect(() => {
    if (!initialPersonId) return;
    openPerson(initialPersonId);
    onInitialPersonConsumed?.();
  }, [initialPersonId]);

  useEffect(() => {
    if (view !== "detail" || editing) return;
    if (selected) setDraft(normalizePersonnelRecord(selected));
  }, [selectedId, editing, selected, view]);

  function openPerson(id, options = {}) {
    const person = options.person || safeRecords.find((item) => item.id === id);
    if (!person) return;
    setSelectedId(id);
    setDraft(normalizePersonnelRecord(person));
    setActiveSection(options.section || "personalDetails");
    setEditing(Boolean(options.edit));
    setIsNewRecord(Boolean(options.isNew));
    setSavedMessage("");
    setView("detail");
  }

  function backToList() {
    if (isNewRecord && selectedId) {
      setRecords((current) => current.filter((person) => person.id !== selectedId));
    }
    setView("list");
    setSelectedId("");
    setEditing(false);
    setIsNewRecord(false);
    setSavedMessage("");
    setPendingPhotoFile(null);
  }

  function cancelEdit() {
    if (isNewRecord) {
      backToList();
      return;
    }
    setEditing(false);
    if (selected) setDraft(normalizePersonnelRecord(selected));
  }

  function saveProfile() {
    if (!draft?.id || !setRecords) return;

    try {
      const updatedPerson = normalizePersonnelRecord({
        ...draft,
        activityLog: selected?.activityLog || [],
        updated_at: new Date().toISOString(),
      });

      setRecords((current) => {
        const exists = current.some((person) => person.id === updatedPerson.id);
        if (exists) {
          return current.map((person) => (
            person.id === updatedPerson.id ? updatedPerson : person
          ));
        }
        return [updatedPerson, ...current];
      });

      setSelectedId(updatedPerson.id);
      setEditing(false);
      setIsNewRecord(false);
      setSavedMessage("Profile saved");
    } catch (error) {
      console.error("Failed to save personnel profile", error);
      setSavedMessage("Save failed — please try again");
    }
  }

  function deletePerson(id) {
    setRecords((current) => current.filter((person) => person.id !== id));
    if (selectedId === id) backToList();
  }

  function handlePhotoFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !departmentId || !draft?.id) return;

    if (!file.type.startsWith("image/")) {
      setSavedMessage("Please choose an image file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setSavedMessage("Photo must be 12 MB or smaller.");
      return;
    }

    setPendingPhotoFile(file);
  }

  async function uploadProfilePhotoBlob(blob) {
    if (!blob || !departmentId || !draft?.id) return;

    setPhotoUploading(true);
    setSavedMessage("");
    try {
      const storagePath = `departments/${departmentId}/personnel-photos/${draft.id}/${Date.now()}-profile.jpg`;
      const file = new File([blob], "profile.jpg", { type: "image/jpeg" });
      const uploaded = await uploadFirebaseFile(storagePath, file);
      if (!uploaded?.downloadUrl) throw new Error("Upload failed");

      const updatedPerson = normalizePersonnelRecord({
        ...draft,
        photoUrl: uploaded.downloadUrl,
        updated_at: new Date().toISOString(),
      });

      setDraft(updatedPerson);
      setRecords((current) => current.map((person) => (
        person.id === updatedPerson.id ? updatedPerson : person
      )));
      setSavedMessage("Profile photo updated");
      setPendingPhotoFile(null);
    } catch (error) {
      console.error("Failed to upload personnel photo", error);
      setSavedMessage("Photo upload failed — try again");
    } finally {
      setPhotoUploading(false);
    }
  }

  function updateDraftField(key, value) {
    setDraft((current) => {
      const formattedValue = PERSONNEL_PHONE_FIELDS.has(key) ? formatUsPhone(value) : value;
      const next = { ...current, [key]: formattedValue };
      if (key === "emsCredentials") {
        next.certifications = splitPersonnelCertifications(next.certifications || []).fireCertifications;
      }
      if (next.emergencySameAddress && ["address", "city", "state", "zip"].includes(key)) {
        Object.assign(next, copyEmployeeAddressToEmergency(next, "emergency"));
      }
      if (next.emergency2SameAddress && ["address", "city", "state", "zip"].includes(key)) {
        Object.assign(next, copyEmployeeAddressToEmergency(next, "emergency2"));
      }
      return next;
    });
  }

  function setEmergencySameAddress(checked, prefix = "emergency") {
    const sameAddressKey = emergencyContactFieldKey(prefix, "SameAddress");
    setDraft((current) => normalizePersonnelRecord({
      ...current,
      [sameAddressKey]: checked,
      ...(checked ? copyEmployeeAddressToEmergency(current, prefix) : {}),
    }));
  }

  function addPersonnel() {
    const now = new Date().toISOString();
    const newPerson = createEmptyPersonnelRecord({
      id: nextPersonnelRecordId(safeRecords, { prefix: resolvePersonnelIdPrefix(departmentId) }),
      firstName: "New",
      lastName: "Personnel",
      rank: "Firefighter",
      shift: "Unassigned",
      assignment: "Unassigned",
      unit: "Unassigned",
      driver: "Not Approved",
      status: "Active",
      employmentType: "Full Time",
      station: "Unassigned",
      created_at: now,
      updated_at: now,
    });

    setRecords((current) => [newPerson, ...current]);
    openPerson(newPerson.id, {
      person: newPerson,
      edit: true,
      section: "personalDetails",
      isNew: true,
    });
    setSavedMessage("New personnel record created");
  }

  async function handleBulkEdit(selectedIds, patch) {
    if (!setRecords || !selectedIds.length) return;
    const outcome = applyPersonnelBulkEdit(safeRecords, selectedIds, patch);
    if (!outcome.updatedCount) return;

    setRecords(outcome.records);
    setSavedMessage(`Updated ${outcome.updatedCount} personnel record(s).`);
    if (departmentId) {
      await writeAuditLog(departmentId, {
        action: "update",
        module: "Personnel",
        summary: `Bulk edited ${outcome.updatedCount} personnel (${outcome.changes.join("; ")})`,
      });
    }
  }

  async function handlePersonnelImport(outcome = {}) {
    if (!setRecords || !outcome.records) return;
    setRecords(outcome.records);
    setSavedMessage(`Imported ${outcome.created} new and updated ${outcome.updated} personnel record(s).`);
    if (departmentId) {
      await writeAuditLog(departmentId, {
        action: "import",
        module: "Personnel",
        summary: `Imported personnel spreadsheet (${outcome.created} created, ${outcome.updated} updated)`,
      });
    }
  }

  if (!safeRecords.length && view === "list") {
    return (
      <div className="module-page personnel-page">
        <section className="placeholder-page">
          <h1>Personnel</h1>
          <p>No personnel records found.</p>
          {canEditProfile && (
            <>
              <button type="button" className="primary-button" onClick={addPersonnel}>Add Personnel</button>
              <button type="button" className="secondary-button" style={{ marginLeft: 8 }} onClick={() => setShowImport(true)}>Import from Excel</button>
            </>
          )}
        </section>
        <PersonnelImportModal
          open={showImport}
          onClose={() => setShowImport(false)}
          existingRecords={safeRecords}
          onImport={handlePersonnelImport}
        />
      </div>
    );
  }

  return (
    <div className="module-page personnel-page personnel-firstdue-page">
      {view === "list" ? (
        <>
          <section className="module-heading personnel-list-heading">
            <div>
              <span className="module-icon"><Users size={22} /></span>
              <div>
                <h1>Personnel</h1>
                <p>Search, filter, and manage department personnel records.</p>
              </div>
            </div>
          </section>
          <PersonnelListView
            records={safeRecords}
            globalQuery={query}
            canEditProfile={canEditProfile}
            onOpenPerson={openPerson}
            onAddPerson={addPersonnel}
            onImportPersonnel={() => setShowImport(true)}
            onBulkEdit={handleBulkEdit}
            onDeletePerson={deletePerson}
          />
          <PersonnelImportModal
            open={showImport}
            onClose={() => setShowImport(false)}
            existingRecords={safeRecords}
            onImport={handlePersonnelImport}
          />
        </>
      ) : view === "detail" ? (
        <PersonnelDetailView
          selected={selected || draft}
          draft={draft}
          editing={editing}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onBack={backToList}
          onSave={saveProfile}
          onCancelEdit={cancelEdit}
          onStartEdit={() => setEditing(true)}
          canEditProfile={canEditProfile}
          canEditPhoto={canEditPhoto}
          canViewPrivateInfo={canViewPrivateInfo}
          updateDraftField={updateDraftField}
          setEmergencySameAddress={setEmergencySameAddress}
          savedMessage={savedMessage}
          photoUploading={photoUploading}
          photoInputRef={photoInputRef}
          onPhotoSelected={handlePhotoFileSelected}
          pendingPhotoFile={pendingPhotoFile}
          onPhotoCropCancel={() => setPendingPhotoFile(null)}
          onPhotoCropConfirm={uploadProfilePhotoBlob}
          training={training}
          isNewRecord={isNewRecord}
          onOpenEmployeeProfile={onOpenEmployeeProfile}
        />
      ) : null}
    </div>
  );
}
