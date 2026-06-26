import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { copyEmployeeAddressToEmergency, formatUsPhone } from "../lib/personnelContact.js";
import { normalizePersonnelRecord } from "../lib/firestoreSanitize.js";
import { createEmptyPersonnelRecord } from "../lib/personnelSchema.js";
import { uploadFirebaseFile } from "../lib/firebaseClient.js";
import PersonnelDetailView from "../components/personnel/PersonnelDetailView.jsx";
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
}) {
  const safeRecords = Array.isArray(records) ? records : [];
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState("");
  const [activeSection, setActiveSection] = useState("personalDetails");
  const [editing, setEditing] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const photoInputRef = useRef(null);

  const selected = safeRecords.find((person) => person.id === selectedId) || null;
  const [draft, setDraft] = useState(selected || {});

  useEffect(() => {
    if (view !== "detail" || editing) return;
    if (selected) setDraft(normalizePersonnelRecord(selected));
  }, [selectedId, editing, selected, view]);

  function openPerson(id, options = {}) {
    const person = safeRecords.find((item) => item.id === id);
    if (!person) return;
    setSelectedId(id);
    setDraft(normalizePersonnelRecord(person));
    setActiveSection(options.section || "personalDetails");
    setEditing(Boolean(options.edit));
    setSavedMessage("");
    setView("detail");
  }

  function backToList() {
    setView("list");
    setEditing(false);
    setSavedMessage("");
    setPendingPhotoFile(null);
  }

  function saveProfile() {
    if (!draft?.id || !setRecords) return;

    try {
      const updatedPerson = normalizePersonnelRecord({
        ...draft,
        updated_at: new Date().toISOString(),
      });

      setRecords((current) => current.map((person) => (
        person.id === updatedPerson.id ? updatedPerson : person
      )));

      setSelectedId(updatedPerson.id);
      setEditing(false);
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
      const formattedValue = key === "phone" || key === "emergencyPhone" ? formatUsPhone(value) : value;
      const next = { ...current, [key]: formattedValue };
      if (next.emergencySameAddress && ["address", "city", "state", "zip"].includes(key)) {
        Object.assign(next, copyEmployeeAddressToEmergency(next));
      }
      return normalizePersonnelRecord(next);
    });
  }

  function setEmergencySameAddress(checked) {
    setDraft((current) => normalizePersonnelRecord({
      ...current,
      emergencySameAddress: checked,
      ...(checked ? copyEmployeeAddressToEmergency(current) : {}),
    }));
  }

  function addPersonnel() {
    const now = new Date().toISOString();
    const nextNumber = safeRecords.length + 1;
    const newPerson = createEmptyPersonnelRecord({
      id: `HL-${String(100 + nextNumber).padStart(3, "0")}`,
      firstName: "New",
      lastName: "Personnel",
      rank: "Firefighter",
      shift: "Unassigned",
      assignment: "Unassigned",
      unit: "Unassigned",
      ems: "EMT",
      driver: "Not Approved",
      status: "Active",
      employmentType: "Full Time",
      station: "Unassigned",
      created_at: now,
      updated_at: now,
    });

    setRecords((current) => [newPerson, ...current]);
    openPerson(newPerson.id, { edit: true, section: "personalDetails" });
    setSavedMessage("New personnel record created");
  }

  if (!safeRecords.length && view === "list") {
    return (
      <div className="module-page personnel-page">
        <section className="placeholder-page">
          <h1>Personnel</h1>
          <p>No personnel records found.</p>
          {canEditProfile && <button type="button" className="primary-button" onClick={addPersonnel}>Add Personnel</button>}
        </section>
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
            onDeletePerson={deletePerson}
          />
        </>
      ) : selected ? (
        <PersonnelDetailView
          selected={selected}
          draft={draft}
          editing={editing}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onBack={backToList}
          onSave={saveProfile}
          onCancelEdit={() => { setEditing(false); setDraft(normalizePersonnelRecord(selected)); }}
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
        />
      ) : null}
    </div>
  );
}
