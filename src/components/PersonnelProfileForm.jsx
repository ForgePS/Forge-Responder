import { FileText } from "lucide-react";
import { useState } from "react";
import { getPersonDisplayName } from "../lib/personnelSchema.js";
import {
  EmergencyContactSection,
  MiniTable,
  ProfileField,
  ProfilePhoneField,
  ProfileQualifiersField,
  ProfileToggleField,
} from "./personnel/PersonnelFieldControls.jsx";
import PersonnelPromotionsEditor from "./personnel/PersonnelPromotionsEditor.jsx";
import PersonnelEmsCredentialsEditor from "./personnel/PersonnelEmsCredentialsEditor.jsx";
import PersonnelInlineTableEditor from "./personnel/PersonnelInlineTableEditor.jsx";
import { resolvePersonEmsLevel } from "../lib/personnelEmsCredentials.js";
import PersonnelAccrualsEditor from "./personnel/PersonnelAccrualsEditor.jsx";
import PersonnelActivityLogView from "./personnel/PersonnelActivityLogView.jsx";
import PersonnelSectionActions from "./personnel/PersonnelSectionActions.jsx";
import PersonnelAcademyPanel from "./personnel/PersonnelAcademyPanel.jsx";
import ObjectUploadField from "./ObjectUploadField.jsx";
import ObjectLifecycleActions from "./ObjectLifecycleActions.jsx";
import { deleteFirebaseFile } from "../lib/firebaseClient.js";
import {
  buildPersonnelDocumentPath,
  documentDisplayName,
  documentDownloadUrl,
} from "../lib/storagePaths.js";
import {
  archiveObject,
  isObjectArchived,
  isObjectDeleted,
  isObjectVisibleInActiveList,
  isObjectVisibleInArchivedList,
  restoreObject,
  softDeleteObject,
  withActiveLifecycle,
} from "../lib/objectLifecycle.js";

function FormRow({ columns, children }) {
  return (
    <div className={`personnel-form-row personnel-form-row-${columns}`}>
      {children}
    </div>
  );
}

function PersonalDetailsSection({
  draft,
  canEdit,
  canViewPrivateInfo,
  updateDraftField,
  setEmergencySameAddress,
  showFormActions = false,
  onSave,
  onCancel,
  isNewRecord = false,
}) {
  const canEditPrivate = canEdit && canViewPrivateInfo;

  return (
    <div className="personnel-form-card">
      <header className="personnel-form-card-header">
        <strong>Personnel</strong>
      </header>

      <div className={`personnel-form-flow ${canEdit ? "is-editing" : "is-viewing"}`}>
        <FormRow columns={3}>
          <ProfileField flow label="First Name" value={draft.firstName || ""} editing={canEdit} required onChange={(value) => updateDraftField("firstName", value)} />
          <ProfileField flow label="Middle Name" value={draft.middleName || ""} editing={canEdit} onChange={(value) => updateDraftField("middleName", value)} />
          <ProfileField flow label="Last Name" value={draft.lastName || ""} editing={canEdit} onChange={(value) => updateDraftField("lastName", value)} />
        </FormRow>

        <FormRow columns="email">
          <ProfileField flow label="Email" value={draft.email || ""} editing={canEdit} required type="email" onChange={(value) => updateDraftField("email", value)} />
          <ProfileField flow label="EMS Provider Level" value={resolvePersonEmsLevel(draft) || "None"} editing={false} onChange={() => {}} />
        </FormRow>

        <FormRow columns="address-main">
          <ProfileField flow label="Address" value={draft.address || ""} editing={canEdit} onChange={(value) => updateDraftField("address", value)} />
        </FormRow>

        <FormRow columns="address-compact">
          <ProfileField flow label="Unit/Suite" value={draft.unitSuite || ""} editing={canEdit} onChange={(value) => updateDraftField("unitSuite", value)} />
          <ProfileField flow label="State" value={draft.state || ""} editing={canEdit} dropdownId="usStates" onChange={(value) => updateDraftField("state", value)} />
          <ProfileField flow label="City" value={draft.city || ""} editing={canEdit} onChange={(value) => updateDraftField("city", value)} />
          <ProfileField flow label="Zip code" value={draft.zip || ""} editing={canEdit} onChange={(value) => updateDraftField("zip", value)} />
        </FormRow>

        <FormRow columns={3}>
          <ProfilePhoneField flow label="Phone" value={draft.phone || ""} editing={canEdit} onChange={(value) => updateDraftField("phone", value)} />
          <ProfileField flow label="IAFF Local number" value={draft.iaffLocalNumber || ""} editing={canEdit} onChange={(value) => updateDraftField("iaffLocalNumber", value)} />
          <ProfileField flow label="Birth Date" value={draft.birthDate || ""} editing={canEditPrivate} type="date" onChange={(value) => updateDraftField("birthDate", value)} />
        </FormRow>

        <FormRow columns="citizenship-only">
          <ProfileField flow label="Citizenship" value={draft.citizenship || ""} editing={canEditPrivate} dropdownId="citizenshipOptions" onChange={(value) => updateDraftField("citizenship", value)} />
        </FormRow>

        <EmergencyContactSection
          draft={draft}
          editing={canEdit}
          onFieldChange={updateDraftField}
          onSameAddressChange={setEmergencySameAddress}
          flow
          flowMode={canEdit ? "editing" : "viewing"}
          showHeading
        />

        <FormRow columns={4}>
          <ProfileField flow label="Driver's Lic. Number" value={draft.driversLicenseNumber || ""} editing={canEdit} onChange={(value) => updateDraftField("driversLicenseNumber", value)} />
          <ProfileField flow label="Driver's Lic. State" value={draft.driversLicenseState || ""} editing={canEdit} dropdownId="usStates" onChange={(value) => updateDraftField("driversLicenseState", value)} />
          <ProfileField flow label="Driver's Lic. Class" value={draft.driversLicenseClass || ""} editing={canEdit} dropdownId="driversLicenseClasses" onChange={(value) => updateDraftField("driversLicenseClass", value)} />
          <ProfileField flow label="Driver's Lic. Expiration Date" value={draft.driversLicenseExpiration || ""} editing={canEdit} type="date" onChange={(value) => updateDraftField("driversLicenseExpiration", value)} />
        </FormRow>

        <FormRow columns={4}>
          <ProfileField flow label="Start Date" value={draft.hireDate || ""} editing={canEditPrivate} type="date" onChange={(value) => updateDraftField("hireDate", value)} />
          <ProfileField flow label="Secondary Start Date" value={draft.secondaryStartDate || ""} editing={canEditPrivate} type="date" onChange={(value) => updateDraftField("secondaryStartDate", value)} />
          <ProfileField flow label="Start Date Ranking" value={draft.startDateRanking || ""} editing={canEditPrivate} type="date" onChange={(value) => updateDraftField("startDateRanking", value)} />
          <ProfileField flow label="End of Service Date" value={draft.endOfServiceDate || ""} editing={canEditPrivate} type="date" onChange={(value) => updateDraftField("endOfServiceDate", value)} />
        </FormRow>

        <FormRow columns={5}>
          <ProfileField flow label="Race" value={draft.race || ""} editing={canEditPrivate} dropdownId="raceOptions" onChange={(value) => updateDraftField("race", value)} />
          <ProfileField flow label="Ethnicity" value={draft.ethnicity || ""} editing={canEditPrivate} dropdownId="ethnicityOptions" onChange={(value) => updateDraftField("ethnicity", value)} />
          <ProfileField flow label="Gender" value={draft.gender || ""} editing={canEditPrivate} dropdownId="genderOptions" onChange={(value) => updateDraftField("gender", value)} />
          <ProfileField flow label="Marital Status" value={draft.maritalStatus || ""} editing={canEditPrivate} dropdownId="maritalStatusOptions" onChange={(value) => updateDraftField("maritalStatus", value)} />
          <ProfileField flow label="Social Security Number" value={draft.socialSecurityNumber || ""} editing={canEditPrivate} onChange={(value) => updateDraftField("socialSecurityNumber", value)} />
        </FormRow>

        <FormRow columns={5}>
          <ProfileField flow label="Badge Number" value={draft.badgeNumber || ""} editing={canEdit} onChange={(value) => updateDraftField("badgeNumber", value)} />
          <ProfileField flow label="Agency Personnel ID" value={draft.agencyPersonnelId || ""} editing={canEdit} onChange={(value) => updateDraftField("agencyPersonnelId", value)} />
          <ProfileField flow label="API ID" value={draft.apiId || ""} editing={canEdit} onChange={(value) => updateDraftField("apiId", value)} />
          <ProfileField flow label="Firefighter ID" value={draft.firefighterId || ""} editing={canEdit} onChange={(value) => updateDraftField("firefighterId", value)} />
          <ProfileField flow label="FEMA ID" value={draft.femaId || ""} editing={canEdit} onChange={(value) => updateDraftField("femaId", value)} />
          <ProfileField
            flow
            label="Forge person ID"
            value={draft.forgePersonId || "—"}
            editing={false}
            onChange={() => {}}
          />
        </FormRow>

        <h3 className="personnel-form-section-title">Assignment</h3>
        <div className="personnel-form-flow-nested">
          <FormRow columns={4}>
            <ProfileField flow label="Unit" value={draft.unit || ""} editing={canEdit} dropdownId="apparatusUnits" onChange={(value) => updateDraftField("unit", value)} />
            <ProfileField flow label="Division" value={draft.division || ""} editing={canEdit} dropdownId="divisions" onChange={(value) => updateDraftField("division", value)} />
            <ProfileField flow label="District" value={draft.district || ""} editing={canEdit} dropdownId="personnelDistricts" onChange={(value) => updateDraftField("district", value)} />
            <ProfileField flow label="Station" value={draft.station || ""} editing={canEdit} dropdownId="stations" onChange={(value) => updateDraftField("station", value)} />
          </FormRow>

          <FormRow columns={4}>
            <ProfileField flow label="Shift" value={draft.shift || ""} editing={canEdit} dropdownId="shifts" onChange={(value) => updateDraftField("shift", value)} />
            <ProfileField flow label="Position" value={draft.position || ""} editing={canEdit} dropdownId="personnelPositions" onChange={(value) => updateDraftField("position", value)} />
            <ProfileField flow label="Rank" value={draft.rank || ""} editing={canEdit} dropdownId="ranks" onChange={(value) => updateDraftField("rank", value)} />
            <ProfileField flow label="Group" value={draft.group || ""} editing={canEdit} dropdownId="personnelGroups" onChange={(value) => updateDraftField("group", value)} />
          </FormRow>

          <FormRow columns={1}>
            <ProfileField flow label="Supervisor" value={draft.supervisor || ""} editing={canEdit} onChange={(value) => updateDraftField("supervisor", value)} />
          </FormRow>

          <FormRow columns={1}>
            <ProfileQualifiersField flow value={draft.qualifiers || []} editing={canEdit} onChange={(value) => updateDraftField("qualifiers", value)} />
          </FormRow>
        </div>

        <FormRow columns="status">
          <ProfileField flow label="Employment Status" value={draft.employmentType || ""} editing={canEdit} dropdownId="employmentTypes" onChange={(value) => updateDraftField("employmentType", value)} />
          <ProfileField flow label="Status" value={draft.status || ""} editing={canEdit} dropdownId="employmentStatus" onChange={(value) => updateDraftField("status", value)} />
          <ProfileField flow label="Driver Status" value={draft.driver || ""} editing={canEdit} dropdownId="driverStatus" onChange={(value) => updateDraftField("driver", value)} />
          <ProfileToggleField flow label="Is training instructor" value={draft.isTrainingInstructor} editing={canEdit} onChange={(value) => updateDraftField("isTrainingInstructor", value)} />
        </FormRow>
      </div>

      {showFormActions && canEdit && (
        <footer className="personnel-form-actions">
          <button type="button" className="primary-button" onClick={onSave}>{isNewRecord ? "Create" : "Save"}</button>
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
        </footer>
      )}
    </div>
  );
}

function EmploymentHistorySection({ draft, canEdit, updateDraftField }) {
  const rows = Array.isArray(draft.employmentHistory) && draft.employmentHistory.length
    ? draft.employmentHistory.map((entry) => [
      entry.startDate || "",
      entry.endDate || "",
      entry.rank || "",
      entry.unit || "",
      entry.station || "",
    ])
    : [[draft.hireDate || "", draft.endOfServiceDate || "", draft.rank || "", draft.unit || "", draft.station || ""]];

  return (
    <PersonnelInlineTableEditor
      columns={["Start Date", "End Date", "Rank", "Unit", "Station"]}
      value={rows}
      editing={canEdit}
      emptyMessage="No employment history recorded."
      onChange={(nextRows) => updateDraftField(
        "employmentHistory",
        nextRows
          .filter((row) => row.some(Boolean))
          .map(([startDate, endDate, rank, unit, station]) => ({
            startDate,
            endDate,
            rank,
            unit,
            station,
          }))
      )}
    />
  );
}

function TrainingEventsSection({ person, training = [] }) {
  const name = getPersonDisplayName(person);
  const rows = training
    .filter((record) => String(record.members || "").toLowerCase().includes(name.split(" ")[0]?.toLowerCase()) || String(record.instructor || "") === name)
    .map((record) => [record.course, record.date, record.hours, record.status]);

  return (
    <div className="personnel-section-card">
      <MiniTable columns={["Course", "Date", "Hours", "Status"]} rows={rows} emptyMessage="No training events linked to this member." />
    </div>
  );
}

export default function PersonnelProfileForm({
  activeSection = "personalDetails",
  draft,
  selected,
  editing,
  canEditProfile,
  canViewPrivateInfo,
  updateDraftField,
  setEmergencySameAddress,
  training = [],
  onSave,
  onCancel,
  isNewRecord = false,
  departmentId = "",
}) {
  const canEdit = editing && canEditProfile;
  const [uploadError, setUploadError] = useState("");
  const [attachmentView, setAttachmentView] = useState("active");
  const [attachmentBusyId, setAttachmentBusyId] = useState("");

  function asAttachmentRecord(document, index) {
    if (document && typeof document === "object") return document;
    return {
      id: `LEGACY-${index}`,
      name: String(document || "Document"),
      lifecycleStatus: "active",
    };
  }

  async function runAttachmentLifecycle(index, action) {
    const docs = [...(draft.documents || [])];
    const raw = docs[index];
    const record = asAttachmentRecord(raw, index);
    setAttachmentBusyId(record.id || String(index));
    try {
      let next;
      if (action === "archive") next = archiveObject(record);
      else if (action === "restore") next = restoreObject(record);
      else {
        if (record.storagePath) await deleteFirebaseFile(record.storagePath);
        next = softDeleteObject(record);
      }
      docs[index] = next;
      updateDraftField("documents", docs);
      if (action === "restore") setAttachmentView("active");
    } finally {
      setAttachmentBusyId("");
    }
  }

  switch (activeSection) {
    case "personalDetails":
      return (
        <PersonalDetailsSection
          draft={draft}
          canEdit={canEdit}
          canViewPrivateInfo={canViewPrivateInfo}
          updateDraftField={updateDraftField}
          setEmergencySameAddress={setEmergencySameAddress}
          showFormActions={canEdit}
          onSave={onSave}
          onCancel={onCancel}
          isNewRecord={isNewRecord}
        />
      );
    case "emergencyContact":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Emergency Contacts</strong></header>
          <div className={`personnel-form-flow ${canEdit ? "is-editing" : "is-viewing"}`}>
            <EmergencyContactSection
              draft={draft}
              editing={canEdit}
              onFieldChange={updateDraftField}
              onSameAddressChange={setEmergencySameAddress}
              flow
              flowMode={canEdit ? "editing" : "viewing"}
            />
          </div>
          {canEdit && (
            <footer className="personnel-form-actions">
              <button type="button" className="primary-button" onClick={onSave}>Save</button>
              <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
            </footer>
          )}
        </div>
      );
    case "certifications":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Certifications</strong></header>

          <h3 className="personnel-form-section-title">EMS Credentials</h3>
          <p className="auth-help personnel-ems-credentials-note">
            EMS provider level on the profile and scheduling roster is derived from active credentials below.
          </p>
          <div className="personnel-section-card">
            <PersonnelEmsCredentialsEditor
              value={draft.emsCredentials || selected.emsCredentials || []}
              editing={canEdit}
              onChange={(rows) => updateDraftField("emsCredentials", rows)}
            />
          </div>

          <h3 className="personnel-form-section-title">Fire &amp; Other Certifications</h3>
          <div className="personnel-section-card">
            <PersonnelInlineTableEditor
              columns={["Certification", "Expires", "Status"]}
              value={draft.certifications || selected.certifications || []}
              editing={canEdit}
              emptyMessage="No fire or other certifications recorded for this member."
              onChange={(rows) => updateDraftField("certifications", rows.filter((row) => row.some(Boolean)))}
            />
          </div>
          <PersonnelSectionActions canEdit={canEdit} onSave={onSave} onCancel={onCancel} />
        </div>
      );
    case "trainingEvents":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Training & Events</strong></header>
          <TrainingEventsSection person={selected} training={training} />
        </div>
      );
    case "academy":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Academy</strong></header>
          <PersonnelAcademyPanel person={selected || draft} />
        </div>
      );
    case "accruals":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Accruals</strong></header>
          <div className="personnel-section-card">
            <PersonnelAccrualsEditor
              value={draft.accruals || []}
              person={draft}
              editing={canEdit}
              onChange={(rows) => updateDraftField("accruals", rows)}
            />
          </div>
          <PersonnelSectionActions canEdit={canEdit} onSave={onSave} onCancel={onCancel} />
        </div>
      );
    case "payRates":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Pay Rates</strong></header>
          <div className="personnel-form-flow">
            <FormRow columns={3}>
              <ProfileField flow label="Payroll ID" value={draft.payrollId || ""} editing={canEdit} onChange={(value) => updateDraftField("payrollId", value)} />
              <ProfileField flow label="Hourly Pay Rate" value={draft.hourlyPayRate || ""} editing={canEdit} onChange={(value) => updateDraftField("hourlyPayRate", value)} />
              <ProfileField flow label="Effective Date" value={draft.payRateEffectiveDate || ""} editing={canEdit} type="date" onChange={(value) => updateDraftField("payRateEffectiveDate", value)} />
            </FormRow>
          </div>
          <div className="personnel-section-card">
            <PersonnelInlineTableEditor
              columns={["Rate", "Effective Date", "Type", "Notes"]}
              value={(draft.payRates || []).map((row) => [row.rate, row.effectiveDate, row.type, row.notes])}
              editing={canEdit}
              emptyMessage="No pay rate history recorded."
              onChange={(rows) => updateDraftField(
                "payRates",
                rows
                  .filter((row) => row.some(Boolean))
                  .map(([rate, effectiveDate, type, notes]) => ({ rate, effectiveDate, type, notes }))
              )}
            />
          </div>
          <PersonnelSectionActions canEdit={canEdit} onSave={onSave} onCancel={onCancel} />
        </div>
      );
    case "promotions":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Promotions</strong></header>
          <div className="personnel-section-card">
            <PersonnelPromotionsEditor
              value={draft.promotions || []}
              editing={canEdit}
              onChange={(value) => updateDraftField("promotions", value)}
            />
          </div>
          <PersonnelSectionActions canEdit={canEdit} onSave={onSave} onCancel={onCancel} />
        </div>
      );
    case "attachments": {
      const normalizedDocs = (draft.documents || []).map((document, index) => asAttachmentRecord(document, index));
      const visibleDocs = normalizedDocs
        .map((document, index) => ({ document, index }))
        .filter(({ document }) => !isObjectDeleted(document))
        .filter(({ document }) => (
          attachmentView === "archived"
            ? isObjectVisibleInArchivedList(document)
            : isObjectVisibleInActiveList(document)
        ));
      const archivedCount = normalizedDocs.filter((document) => isObjectArchived(document)).length;

      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Attachments</strong></header>
          <div className="personnel-section-card">
            <div className="segmented-control" style={{ marginBottom: 12 }}>
              <button type="button" className={attachmentView === "active" ? "active" : ""} onClick={() => setAttachmentView("active")}>Active</button>
              <button type="button" className={attachmentView === "archived" ? "active" : ""} onClick={() => setAttachmentView("archived")}>
                Archived{archivedCount ? ` (${archivedCount})` : ""}
              </button>
            </div>
            <div className="document-list">
              {visibleDocs.length ? visibleDocs.map(({ document, index }) => {
                const name = documentDisplayName(document);
                const url = documentDownloadUrl(document);
                const key = document.id || `${name}-${index}`;
                return (
                  <div key={key} className="personnel-attachment-row" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="secondary-button" style={{ flex: 1, justifyContent: "flex-start" }}>
                        <FileText size={14} /><span>{name}</span><small>Open</small>
                      </a>
                    ) : (
                      <button type="button" className="secondary-button" style={{ flex: 1, justifyContent: "flex-start" }} disabled>
                        <FileText size={14} /><span>{name}</span><small>{isObjectArchived(document) ? "Archived" : "No file"}</small>
                      </button>
                    )}
                    {canEdit ? (
                      <ObjectLifecycleActions
                        record={document}
                        canEdit={canEdit}
                        busy={attachmentBusyId === (document.id || String(index))}
                        compact
                        onArchive={() => runAttachmentLifecycle(index, "archive")}
                        onRestore={() => runAttachmentLifecycle(index, "restore")}
                        onDelete={() => runAttachmentLifecycle(index, "delete")}
                      />
                    ) : null}
                  </div>
                );
              }) : <div className="personnel-empty-section">No attachments in this view.</div>}
            </div>
            {canEdit && attachmentView === "active" ? (
              <div style={{ marginTop: 12 }}>
                <ObjectUploadField
                  label="Upload personnel attachment"
                  hint="PDF, Word, or image — saved to Firebase Storage"
                  buttonLabel="Choose file"
                  disabled={!departmentId || !draft?.id}
                  buildPath={(file) => buildPersonnelDocumentPath(departmentId, draft.id, file.name)}
                  onUploaded={(uploaded) => {
                    setUploadError("");
                    updateDraftField("documents", [
                      ...(draft.documents || []),
                      withActiveLifecycle({
                        id: `DOC-${Date.now()}`,
                        name: uploaded.name,
                        downloadUrl: uploaded.downloadUrl,
                        storagePath: uploaded.storagePath,
                        contentType: uploaded.contentType,
                        uploadedAt: new Date().toISOString(),
                      }),
                    ]);
                  }}
                />
                {!departmentId || !draft?.id ? (
                  <p className="hint-text">Save the personnel record before uploading attachments.</p>
                ) : null}
                {uploadError ? <p className="object-upload-error hint-text">{uploadError}</p> : null}
              </div>
            ) : null}
          </div>
          <PersonnelSectionActions canEdit={canEdit} onSave={onSave} onCancel={onCancel} />
        </div>
      );
    }
    case "immunization":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Immunization</strong></header>
          <div className="personnel-section-card">
            <PersonnelInlineTableEditor
              columns={["Vaccine", "Date", "Expiration", "Status"]}
              value={(draft.immunizations || []).map((row) => [row.vaccine, row.date, row.expiration, row.status])}
              editing={canEdit}
              emptyMessage="No immunization records on file."
              onChange={(rows) => updateDraftField(
                "immunizations",
                rows
                  .filter((row) => row.some(Boolean))
                  .map(([vaccine, date, expiration, status]) => ({ vaccine, date, expiration, status }))
              )}
            />
          </div>
          <PersonnelSectionActions canEdit={canEdit} onSave={onSave} onCancel={onCancel} />
        </div>
      );
    case "employmentHistory":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Employment History</strong></header>
          <div className="personnel-section-card">
            <EmploymentHistorySection draft={draft} canEdit={canEdit} updateDraftField={updateDraftField} />
          </div>
          <PersonnelSectionActions canEdit={canEdit} onSave={onSave} onCancel={onCancel} />
        </div>
      );
    case "consultation":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Consultation</strong></header>
          <div className="personnel-section-card">
            <PersonnelInlineTableEditor
              columns={["Date", "Type", "Provider", "Notes"]}
              value={(draft.consultations || []).map((row) => [row.date, row.type, row.provider, row.notes])}
              editing={canEdit}
              emptyMessage="No consultation records on file."
              onChange={(rows) => updateDraftField(
                "consultations",
                rows
                  .filter((row) => row.some(Boolean))
                  .map(([date, type, provider, notes]) => ({ date, type, provider, notes }))
              )}
            />
          </div>
          <PersonnelSectionActions canEdit={canEdit} onSave={onSave} onCancel={onCancel} />
        </div>
      );
    case "activityLog":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Leave & Shift History</strong></header>
          <p className="personnel-activity-log-note">
            Approved vacation, sick, military leave, and shift trades are recorded automatically and cannot be edited here.
          </p>
          <PersonnelActivityLogView entries={selected.activityLog || []} />
        </div>
      );
    default:
      return null;
  }
}
