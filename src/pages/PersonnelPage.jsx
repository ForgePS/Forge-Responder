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
import { buildPersonnelPhotoPath } from "../lib/storagePaths.js";
import {
  IdentityReviewRequiredError,
  resolveForgePersonIdForPersonnel,
  attachForgePersonIds,
} from "../lib/forgeHubIdentity.js";
import PersonnelDetailView from "../components/personnel/PersonnelDetailView.jsx";
import PersonnelImportModal from "../components/personnel/PersonnelImportModal.jsx";
import PersonnelListView from "../components/personnel/PersonnelListView.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { limitCheck, limitMessage } from "../lib/moduleAccess.js";
import { usePersonnelPrivate } from "../hooks/usePersonnelPrivate.js";
import { savePersonnelPrivate } from "../lib/personnelPrivateService.js";
import { friendlyError } from "../lib/friendlyError.js";
import { usableEquipment } from "../lib/personnelProfile.js";
import {
  hasPrivateValue,
  mergePersonnelPrivate,
  privateFieldsPatch,
  stripPersonnelPrivateKeys,
} from "../lib/personnelPrivateFields.js";

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
  const { entitlements } = useTenant();
  const { isCreator, user } = useAuth();
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

  // Private details (SSN, birth date, demographics, license number) are kept
  // apart from the personnel list and loaded only for people allowed to see them.
  const privateInfo = usePersonnelPrivate(departmentId, view === "detail" ? selectedId : "", canViewPrivateInfo);
  const privateReady = privateInfo.status === "ready" && privateInfo.personnelId === selectedId;
  const privateStatus = !canViewPrivateInfo
    ? "off"
    : privateInfo.personnelId === selectedId ? privateInfo.status : "loading";

  /** The record as shown on the profile: list record plus private details when loaded. */
  function profileRecord(person) {
    const normalized = normalizePersonnelRecord(person);
    return privateReady && person?.id === selectedId
      ? mergePersonnelPrivate(normalized, privateInfo.fields)
      : normalized;
  }

  useEffect(() => {
    if (!initialPersonId) return;
    openPerson(initialPersonId);
    onInitialPersonConsumed?.();
  }, [initialPersonId]);

  useEffect(() => {
    if (view !== "detail" || editing) return;
    if (selected) setDraft(profileRecord(selected));
  }, [selectedId, editing, selected, view, privateReady, privateInfo.fields]);

  // Private details arriving while already editing: fill them in (their fields
  // stay locked until loaded, so nothing typed is overwritten).
  useEffect(() => {
    if (!privateReady || !editing) return;
    setDraft((current) => (current?.id === selectedId ? mergePersonnelPrivate(current, privateInfo.fields) : current));
  }, [privateReady, privateInfo.personnelId]);

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
    if (selected) setDraft(profileRecord(selected));
  }

  async function saveProfile() {
    if (!draft?.id || !setRecords) return;
    if (privateStatus === "loading") {
      setSavedMessage("Private details are still loading. Try saving again in a moment.");
      return;
    }

    try {
      let forgePersonId = String(selected?.forgePersonId || draft.forgePersonId || "").trim();
      let hubLinkError = "";

      // Never invent a local personId. Resolve via Hub when configured and missing.
      // A Hub outage must not block saving the profile: save without the ID and
      // say the link is pending. A duplicate-identity review still stops the save.
      if (!forgePersonId && departmentId) {
        try {
          const resolved = await resolveForgePersonIdForPersonnel(departmentId, draft);
          forgePersonId = resolved.forgePersonId || "";
        } catch (hubError) {
          if (hubError instanceof IdentityReviewRequiredError) throw hubError;
          console.warn("Forge ID lookup failed; saving without it", hubError);
          hubLinkError = hubError instanceof Error ? hubError.message : String(hubError);
        }
      }

      // Private details are saved to their own record first; the personnel
      // list never gets them. If that save fails, nothing is saved.
      let storedPrivate = privateInfo.fields;
      if (privateReady) {
        const privatePatch = privateFieldsPatch(draft, privateInfo.fields);
        if (Object.keys(privatePatch).length) {
          try {
            await savePersonnelPrivate(departmentId, draft.id, privatePatch, { userId: user?.uid });
          } catch (privateError) {
            console.error("Failed to save private personnel details", privateError);
            throw new Error("Private details (birth date, SSN, demographics, license number) couldn't be saved, so the profile wasn't saved. Try again.");
          }
          privateInfo.applySaved(privatePatch);
          storedPrivate = Object.fromEntries(
            Object.entries({ ...privateInfo.fields, ...privatePatch }).filter(([, value]) => hasPrivateValue(value))
          );
        }
      }

      const updatedPerson = normalizePersonnelRecord({
        // Without the private record loaded, leave whatever is on the list
        // record alone; the list store moves it once someone allowed saves.
        ...(privateReady ? stripPersonnelPrivateKeys(draft) : draft),
        forgePersonId,
        ...(Array.isArray(draft.issuedEquipment) ? { issuedEquipment: usableEquipment(draft.issuedEquipment) } : {}),
        activityLog: selected?.activityLog || [],
        updated_at: new Date().toISOString(),
      });

      setRecords((current) => {
        const exists = current.some((person) => person.id === updatedPerson.id);
        if (exists) {
          return current.map((person) => (
            person.id === updatedPerson.id
              ? {
                  ...updatedPerson,
                  // Preserve Hub personId if a concurrent write already set it
                  forgePersonId: person.forgePersonId || updatedPerson.forgePersonId,
                }
              : person
          ));
        }
        return [updatedPerson, ...current];
      });

      setDraft(privateReady ? mergePersonnelPrivate(updatedPerson, storedPrivate, { inlineFallback: false }) : updatedPerson);
      setSelectedId(updatedPerson.id);
      setEditing(false);
      setIsNewRecord(false);
      setSavedMessage(
        forgePersonId
          ? "Profile saved (Forge person ID linked)"
          : hubLinkError
            ? "Profile saved. The FORGE person ID will link automatically once the connection is available."
            : "Profile saved"
      );
    } catch (error) {
      console.error("Failed to save personnel profile", error);
      if (error instanceof IdentityReviewRequiredError) {
        setSavedMessage(
          `Identity review required before save. Review: ${error.review?.id || "pending"} (${error.review?.reason || "duplicate"}).`
        );
        return;
      }
      setSavedMessage(friendlyError(error, "Couldn't save the profile. Please try again."));
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
      const storagePath = buildPersonnelPhotoPath(departmentId, draft.id);
      const file = new File([blob], "profile.jpg", { type: "image/jpeg" });
      const uploaded = await uploadFirebaseFile(storagePath, file);
      if (!uploaded?.downloadUrl) throw new Error("Upload failed");

      // Only the photo changes on the list record (unsaved edits and private
      // details in the open form stay in the form).
      const photoUrl = uploaded.downloadUrl;
      const updatedAt = new Date().toISOString();
      setDraft((current) => ({ ...current, photoUrl, updated_at: updatedAt }));
      setRecords((current) => current.map((person) => (
        person.id === draft.id ? normalizePersonnelRecord({ ...person, photoUrl, updated_at: updatedAt }) : person
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

  /** Whether `adding` more people fit the plan; shows the message when not. */
  function personnelFit(adding) {
    if (isCreator) return true;
    // Count what's on screen (fresher than the server's tally), at least the server's.
    const used = Math.max(safeRecords.length, Number(entitlements?.usage?.personnel || 0));
    const check = limitCheck({ ...entitlements, usage: { personnel: used } }, "maxPersonnel", "personnel", adding);
    if (!check.allowed) setSavedMessage(limitMessage("personnel records", check));
    return check.allowed;
  }

  function addPersonnel() {
    if (!personnelFit(1)) return;
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
    setSavedMessage(`Updated ${outcome.updatedCount} personnel record${outcome.updatedCount === 1 ? "" : "s"}.`);
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
    if (Number(outcome.created || 0) > 0 && !personnelFit(Number(outcome.created))) return;
    try {
      let records = outcome.records;
      if (departmentId) {
        records = await attachForgePersonIds(departmentId, records);
      }
      setRecords(records);
      setSavedMessage(`Personnel import complete: ${outcome.created} added, ${outcome.updated} updated.`);
      if (departmentId) {
        await writeAuditLog(departmentId, {
          action: "import",
          module: "Personnel",
          summary: `Imported personnel spreadsheet (${outcome.created} created, ${outcome.updated} updated)`,
        });
      }
    } catch (error) {
      console.error("Personnel import identity resolve failed", error);
      if (error instanceof IdentityReviewRequiredError) {
        setSavedMessage(
          `Import blocked: Forge identity review required (${error.review?.id || "pending"}).`
        );
        return;
      }
      setSavedMessage(friendlyError(error, "Import failed. Check the file and try again."));
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
          idPrefix={resolvePersonnelIdPrefix(departmentId)}
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
          {savedMessage && <div className="success-banner" role="status">{savedMessage}</div>}
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
          idPrefix={resolvePersonnelIdPrefix(departmentId)}
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
          privateStatus={privateStatus}
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
          departmentId={departmentId}
        />
      ) : null}
    </div>
  );
}
