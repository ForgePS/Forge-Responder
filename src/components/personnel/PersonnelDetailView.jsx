import { Edit3, Save, Upload } from "lucide-react";
import { getPersonDisplayName } from "../../lib/personnelSchema.js";
import { resolvePersonEmsLevel } from "../../lib/personnelEmsCredentials.js";
import { PERSONNEL_SECTIONS } from "../../lib/personnelSections.js";
import PersonAvatar from "../PersonAvatar.jsx";
import PersonnelProfileForm from "../PersonnelProfileForm.jsx";
import ProfilePhotoCropModal from "../ProfilePhotoCropModal.jsx";

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export default function PersonnelDetailView({
  selected,
  draft,
  editing,
  activeSection,
  onSectionChange,
  onBack,
  onSave,
  onCancelEdit,
  onStartEdit,
  canEditProfile,
  canEditPhoto,
  canViewPrivateInfo,
  updateDraftField,
  setEmergencySameAddress,
  savedMessage,
  photoUploading,
  photoInputRef,
  onPhotoSelected,
  pendingPhotoFile,
  onPhotoCropCancel,
  onPhotoCropConfirm,
  training = [],
  isNewRecord = false,
  onOpenEmployeeProfile,
}) {
  const currentSection = PERSONNEL_SECTIONS.find((section) => section.id === activeSection) || PERSONNEL_SECTIONS[0];
  const hideSectionHeading = activeSection === "personalDetails";

  return (
    <div className="personnel-firstdue-detail">
      <nav className="personnel-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="personnel-breadcrumb-link" onClick={onBack}>Personnel</button>
        <span>/</span>
        <button type="button" className="personnel-breadcrumb-link" onClick={onBack}>Personnel List</button>
        <span>/</span>
        <strong>{getPersonDisplayName(selected)}</strong>
      </nav>

      <div className="personnel-detail-layout">
        <aside className="personnel-section-nav panel">
          <header className="personnel-section-nav-header">
            <strong>Personnel</strong>
          </header>
          <nav className="personnel-section-nav-list">
            {PERSONNEL_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={section.id === activeSection ? "personnel-section-button active" : "personnel-section-button"}
                  onClick={() => onSectionChange(section.id)}
                >
                  <Icon size={16} />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="personnel-detail-content">
          <header className="profile-header personnel-detail-header">
            <div className="profile-identity">
              <div className="profile-photo-panel">
                <PersonAvatar person={editing ? draft : selected} profile />
                {canEditPhoto && (
                  <>
                    <button
                      type="button"
                      className="secondary-button profile-photo-upload"
                      disabled={photoUploading}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <Upload size={14} /> {photoUploading ? "Uploading..." : "Upload Photo"}
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="profile-photo-input"
                      onChange={onPhotoSelected}
                    />
                  </>
                )}
              </div>
              <div>
                <h2>{getPersonDisplayName(selected)}</h2>
                <p>{selected.rank} · {selected.id}</p>
                <div><Badge tone="success">{selected.status}</Badge><Badge tone="info">{selected.shift}</Badge><Badge tone="neutral">{resolvePersonEmsLevel(selected) || "None"}</Badge></div>
              </div>
            </div>
            <div className="heading-actions">
              {onOpenEmployeeProfile ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onOpenEmployeeProfile(selected.id)}
                >
                  View employee portal profile
                </button>
              ) : null}
              {canEditProfile && (editing ? (
                <>
                  <button type="button" className="secondary-button" onClick={onCancelEdit}>Cancel</button>
                  <button type="button" className="primary-button" onClick={onSave}><Save size={14} /> Save</button>
                </>
              ) : (
                <button type="button" className="primary-button" onClick={onStartEdit}><Edit3 size={14} /> Edit</button>
              ))}
            </div>
          </header>

          <div className="personnel-section-heading">
            {!hideSectionHeading && <h3>{currentSection.label}</h3>}
          </div>

          {savedMessage && <div className="success-banner">{savedMessage}</div>}
          {pendingPhotoFile && (
            <ProfilePhotoCropModal
              file={pendingPhotoFile}
              onCancel={onPhotoCropCancel}
              onConfirm={onPhotoCropConfirm}
            />
          )}

          <PersonnelProfileForm
            activeSection={activeSection}
            draft={draft}
            selected={selected}
            editing={editing}
            canEditProfile={canEditProfile}
            canViewPrivateInfo={canViewPrivateInfo}
            updateDraftField={updateDraftField}
            setEmergencySameAddress={setEmergencySameAddress}
            training={training}
            onSave={onSave}
            onCancel={onCancelEdit}
            isNewRecord={isNewRecord}
          />
        </section>
      </div>
    </div>
  );
}
