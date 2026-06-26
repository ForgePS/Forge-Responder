import { FileText, Upload } from "lucide-react";
import { getPersonDisplayName } from "../lib/personnelSchema.js";
import {
  EmergencyContactSection,
  MiniTable,
  ProfileField,
  ProfilePhoneField,
  ProfileQualifiersField,
  ProfileToggleField,
} from "./personnel/PersonnelFieldControls.jsx";

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

      <div className="personnel-form-flow">
        <FormRow columns={3}>
          <ProfileField flow label="First Name" value={draft.firstName || ""} editing={canEdit} required onChange={(value) => updateDraftField("firstName", value)} />
          <ProfileField flow label="Middle Name" value={draft.middleName || ""} editing={canEdit} onChange={(value) => updateDraftField("middleName", value)} />
          <ProfileField flow label="Last Name" value={draft.lastName || ""} editing={canEdit} onChange={(value) => updateDraftField("lastName", value)} />
        </FormRow>

        <FormRow columns="email">
          <ProfileField flow label="Email" value={draft.email || ""} editing={canEdit} required type="email" onChange={(value) => updateDraftField("email", value)} />
          <ProfileField flow label="EMS Provider Level" value={draft.ems || ""} editing={canEdit} dropdownId="emsLevels" onChange={(value) => updateDraftField("ems", value)} />
        </FormRow>

        <FormRow columns="address">
          <ProfileField flow label="Address" value={draft.address || ""} editing={canEdit} onChange={(value) => updateDraftField("address", value)} />
          <ProfileField flow label="Unit/Suite" value={draft.unitSuite || ""} editing={canEdit} onChange={(value) => updateDraftField("unitSuite", value)} />
          <ProfileField flow label="State" value={draft.state || ""} editing={canEdit} dropdownId="usStates" onChange={(value) => updateDraftField("state", value)} />
          <ProfileField flow label="City" value={draft.city || ""} editing={canEdit} onChange={(value) => updateDraftField("city", value)} />
        </FormRow>

        <FormRow columns={5}>
          <ProfileField flow label="Zip code" value={draft.zip || ""} editing={canEdit} onChange={(value) => updateDraftField("zip", value)} />
          <ProfilePhoneField flow label="Phone" value={draft.phone || ""} editing={canEdit} onChange={(value) => updateDraftField("phone", value)} />
          <ProfileField flow label="IAFF Local number" value={draft.iaffLocalNumber || ""} editing={canEdit} onChange={(value) => updateDraftField("iaffLocalNumber", value)} />
          <ProfileField flow label="Birth Date" value={draft.birthDate || ""} editing={canEditPrivate} onChange={(value) => updateDraftField("birthDate", value)} />
          <ProfileField flow label="Citizenship" value={draft.citizenship || ""} editing={canEditPrivate} dropdownId="citizenshipOptions" onChange={(value) => updateDraftField("citizenship", value)} />
        </FormRow>

        <FormRow columns={4}>
          <ProfileField flow label="Driver's Lic. Number" value={draft.driversLicenseNumber || ""} editing={canEdit} onChange={(value) => updateDraftField("driversLicenseNumber", value)} />
          <ProfileField flow label="Driver's Lic. State" value={draft.driversLicenseState || ""} editing={canEdit} dropdownId="usStates" onChange={(value) => updateDraftField("driversLicenseState", value)} />
          <ProfileField flow label="Driver's Lic. Class" value={draft.driversLicenseClass || ""} editing={canEdit} dropdownId="driversLicenseClasses" onChange={(value) => updateDraftField("driversLicenseClass", value)} />
          <ProfileField flow label="Driver's Lic. Expiration Date" value={draft.driversLicenseExpiration || ""} editing={canEdit} onChange={(value) => updateDraftField("driversLicenseExpiration", value)} />
        </FormRow>

        <FormRow columns={4}>
          <ProfileField flow label="Start Date" value={draft.hireDate || ""} editing={canEditPrivate} onChange={(value) => updateDraftField("hireDate", value)} />
          <ProfileField flow label="Secondary Start Date" value={draft.secondaryStartDate || ""} editing={canEditPrivate} onChange={(value) => updateDraftField("secondaryStartDate", value)} />
          <ProfileField flow label="Start Date Ranking" value={draft.startDateRanking || ""} editing={canEditPrivate} onChange={(value) => updateDraftField("startDateRanking", value)} />
          <ProfileField flow label="End of Service Date" value={draft.endOfServiceDate || ""} editing={canEditPrivate} onChange={(value) => updateDraftField("endOfServiceDate", value)} />
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
        </FormRow>

        <FormRow columns={5}>
          <ProfileField flow label="Payroll ID" value={draft.payrollId || ""} editing={canEdit} onChange={(value) => updateDraftField("payrollId", value)} />
          <ProfileField flow label="Unit" value={draft.unit || ""} editing={canEdit} dropdownId="apparatusUnits" onChange={(value) => updateDraftField("unit", value)} />
          <ProfileField flow label="Division" value={draft.division || ""} editing={canEdit} dropdownId="divisions" onChange={(value) => updateDraftField("division", value)} />
          <ProfileField flow label="District" value={draft.district || ""} editing={canEdit} dropdownId="personnelDistricts" onChange={(value) => updateDraftField("district", value)} />
          <ProfileField flow label="Station" value={draft.station || ""} editing={canEdit} dropdownId="stations" onChange={(value) => updateDraftField("station", value)} />
        </FormRow>

        <FormRow columns={5}>
          <ProfileField flow label="Shift" value={draft.shift || ""} editing={canEdit} dropdownId="shifts" onChange={(value) => updateDraftField("shift", value)} />
          <ProfileField flow label="Position" value={draft.position || ""} editing={canEdit} dropdownId="personnelPositions" onChange={(value) => updateDraftField("position", value)} />
          <ProfileField flow label="Rank" value={draft.rank || ""} editing={canEdit} dropdownId="ranks" onChange={(value) => updateDraftField("rank", value)} />
          <ProfileQualifiersField flow value={draft.qualifiers || []} editing={canEdit} onChange={(value) => updateDraftField("qualifiers", value)} />
          <ProfileField flow label="Group" value={draft.group || ""} editing={canEdit} dropdownId="personnelGroups" onChange={(value) => updateDraftField("group", value)} />
        </FormRow>

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

function EmploymentHistorySection({ draft }) {
  const rows = Array.isArray(draft.employmentHistory) ? draft.employmentHistory : [];
  const tableRows = rows.length
    ? rows.map((entry) => [entry.startDate || "—", entry.endDate || "Present", entry.rank || "—", entry.unit || "—", entry.station || "—"])
    : [[draft.hireDate || "—", draft.endOfServiceDate || "Present", draft.rank || "—", draft.unit || "—", draft.station || "—"]];

  return (
    <div className="personnel-section-card">
      <MiniTable columns={["Start Date", "End Date", "Rank", "Unit", "Station"]} rows={tableRows} emptyMessage="No employment history recorded." />
    </div>
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
}) {
  const canEdit = editing && canEditProfile;

  switch (activeSection) {
    case "personalDetails":
      return (
        <PersonalDetailsSection
          draft={draft}
          canEdit={canEdit}
          canViewPrivateInfo={canViewPrivateInfo}
          updateDraftField={updateDraftField}
          showFormActions={canEdit}
          onSave={onSave}
          onCancel={onCancel}
          isNewRecord={isNewRecord}
        />
      );
    case "emergencyContact":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Emergency Contact</strong></header>
          <EmergencyContactSection
            draft={draft}
            editing={canEdit}
            onFieldChange={updateDraftField}
            onSameAddressChange={setEmergencySameAddress}
            flow
          />
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
          <div className="personnel-section-card">
            <MiniTable columns={["Certification", "Expires", "Status"]} rows={selected.certifications || []} />
          </div>
        </div>
      );
    case "trainingEvents":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Training & Events</strong></header>
          <TrainingEventsSection person={selected} training={training} />
        </div>
      );
    case "accruals":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Accruals</strong></header>
          <div className="personnel-section-card">
            <MiniTable columns={["Accrual Type", "Balance", "Used", "Remaining"]} rows={(draft.accruals || []).map((row) => [row.type, row.balance, row.used, row.remaining])} emptyMessage="No accrual balances recorded for this member." />
          </div>
        </div>
      );
    case "payRates":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Pay Rates</strong></header>
          <div className="personnel-form-flow">
            <FormRow columns={2}>
              <ProfileField flow label="Hourly Pay Rate" value={draft.hourlyPayRate || ""} editing={canEdit} onChange={(value) => updateDraftField("hourlyPayRate", value)} />
              <ProfileField flow label="Effective Date" value={draft.payRateEffectiveDate || ""} editing={canEdit} onChange={(value) => updateDraftField("payRateEffectiveDate", value)} />
            </FormRow>
          </div>
          <div className="personnel-section-card">
            <MiniTable columns={["Rate", "Effective Date", "Type", "Notes"]} rows={(draft.payRates || []).map((row) => [row.rate, row.effectiveDate, row.type, row.notes])} emptyMessage="No pay rate history recorded." />
          </div>
        </div>
      );
    case "attachments":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Attachments</strong></header>
          <div className="personnel-section-card">
            <div className="document-list">
              {(selected.documents || []).length ? (selected.documents || []).map((document) => (
                <button key={document} type="button"><FileText size={14} /><span>{document}</span><small>Open</small></button>
              )) : <div className="personnel-empty-section">No attachments uploaded.</div>}
            </div>
            {canEdit && <button type="button" className="secondary-button personnel-upload-button"><Upload size={14} /> Upload Attachment</button>}
          </div>
        </div>
      );
    case "immunization":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Immunization</strong></header>
          <div className="personnel-section-card">
            <MiniTable columns={["Vaccine", "Date", "Expiration", "Status"]} rows={(draft.immunizations || []).map((row) => [row.vaccine, row.date, row.expiration, row.status])} emptyMessage="No immunization records on file." />
          </div>
        </div>
      );
    case "employmentHistory":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Employment History</strong></header>
          <EmploymentHistorySection draft={draft} />
        </div>
      );
    case "consultation":
      return (
        <div className="personnel-form-card">
          <header className="personnel-form-card-header"><strong>Consultation</strong></header>
          <div className="personnel-section-card">
            <MiniTable columns={["Date", "Type", "Provider", "Notes"]} rows={(draft.consultations || []).map((row) => [row.date, row.type, row.provider, row.notes])} emptyMessage="No consultation records on file." />
          </div>
        </div>
      );
    default:
      return null;
  }
}
