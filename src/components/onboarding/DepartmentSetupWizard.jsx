import { useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, Clock, MailPlus, MapPin, Users, X } from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "../../lib/firebaseClient.js";
import { buildDepartmentLogoPath } from "../../lib/storagePaths.js";
import { buildStationDetailsFromProfile, normalizeStationDetails, stationNamesFromDetails } from "../../lib/stationProfile.js";
import { normalizeShiftRotation } from "../../data/defaultShiftRotation.js";
import { resolvePersonnelIdPrefix } from "../../data/tenants/index.js";
import { ensureDefaultRoles } from "../../lib/roleService.js";
import { writeAuditLog } from "../../lib/auditService.js";
import { attachForgePersonIds, IdentityReviewRequiredError } from "../../lib/forgeHubIdentity.js";
import ObjectUploadField from "../ObjectUploadField.jsx";
import DepartmentStateSelect from "../DepartmentStateSelect.jsx";
import DepartmentStationsEditor from "../DepartmentStationsEditor.jsx";
import ShiftRotationPanel from "../ShiftRotationPanel.jsx";
import PersonnelImportModal from "../personnel/PersonnelImportModal.jsx";
import DepartmentInvitesPanel from "../DepartmentInvitesPanel.jsx";

const STEPS = [
  { id: "department", label: "Department", icon: Building2 },
  { id: "stations", label: "Stations", icon: MapPin },
  { id: "shifts", label: "Shifts", icon: Clock },
  { id: "personnel", label: "Personnel", icon: Users },
  { id: "team", label: "Invite team", icon: MailPlus },
  { id: "done", label: "Finish", icon: Check },
];

const DEFAULT_SHIFTS = ["A Shift", "B Shift", "C Shift"];

function parseShiftNames(text = "") {
  return [...new Set(String(text).split(",").map((s) => s.trim()).filter(Boolean))];
}

/**
 * Guided first-time setup for a new department: profile, stations, shifts and
 * rotation, personnel import, team invites. Progress is saved after every step
 * (settings.onboarding.step) so an admin can finish later.
 */
export default function DepartmentSetupWizard({
  departmentId,
  profile = {},
  settings = {},
  personnel = [],
  setPersonnel,
  refreshDepartment,
  user,
  onClose,
}) {
  const savedStep = STEPS.findIndex((s) => s.id === settings?.onboarding?.step);
  const [stepIndex, setStepIndex] = useState(savedStep > 0 ? savedStep : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [details, setDetails] = useState(() => ({
    name: profile.name || "",
    shortName: profile.shortName || "",
    address: profile.address || "",
    city: profile.city || "",
    stateId: profile.stateId || "",
    zip: profile.zip || "",
    contactPhone: profile.contactPhone || "",
    contactEmail: profile.contactEmail || user?.email || "",
    logoUrl: profile.logoUrl || "",
  }));
  const [stations, setStations] = useState(() => {
    const existing = buildStationDetailsFromProfile(profile);
    return existing.length ? existing : normalizeStationDetails([{ name: "Station 1" }]);
  });
  const [shiftText, setShiftText] = useState(() => (
    (Array.isArray(profile.shifts) && profile.shifts.length ? profile.shifts : DEFAULT_SHIFTS).join(", ")
  ));
  const shiftNames = useMemo(() => parseShiftNames(shiftText), [shiftText]);
  const [rotation, setRotation] = useState(() => normalizeShiftRotation(settings.shiftRotation || {}, shiftNames));
  const [showImport, setShowImport] = useState(false);
  const [roles, setRoles] = useState([]);

  const step = STEPS[stepIndex];
  const db = getFirestoreDb();

  useEffect(() => {
    if (step.id !== "team" || roles.length) return;
    ensureDefaultRoles(departmentId)
      .then((list) => setRoles(list.filter((role) => role.id !== "creator")))
      .catch(() => setRoles([]));
  }, [step.id, departmentId]);

  // Keep the rotation's shift names in step with the shift list.
  useEffect(() => {
    setRotation((current) => normalizeShiftRotation(current, shiftNames));
  }, [shiftText]);

  async function saveProfile(patch) {
    await setDoc(doc(db, "departments", departmentId, "profile", "main"), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
  }

  // Only the fields we change: never write back merged/display-only settings.
  async function saveSettings(patch) {
    await setDoc(doc(db, "departments", departmentId, "settings", "main"), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
  }

  function validate() {
    if (step.id === "department") {
      if (!details.name.trim()) return "Enter the department name.";
      if (details.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contactEmail.trim())) return "Enter a valid contact email.";
    }
    if (step.id === "stations" && !stationNamesFromDetails(normalizeStationDetails(stations)).length) {
      return "Add at least one station.";
    }
    if (step.id === "shifts" && !shiftNames.length) return "Enter at least one shift name.";
    return "";
  }

  async function saveCurrentStep() {
    if (step.id === "department") {
      await saveProfile({
        name: details.name.trim(),
        shortName: details.shortName.trim() || details.name.trim(),
        displayTitle: details.name.trim(),
        address: details.address.trim(),
        city: details.city.trim(),
        stateId: details.stateId,
        zip: details.zip.trim(),
        contactPhone: details.contactPhone.trim(),
        contactEmail: details.contactEmail.trim(),
        ...(details.logoUrl ? { logoUrl: details.logoUrl } : {}),
      });
    }
    if (step.id === "stations") {
      const normalized = normalizeStationDetails(stations);
      await saveProfile({ stationDetails: normalized, stations: stationNamesFromDetails(normalized) });
    }
    if (step.id === "shifts") {
      await saveProfile({ shifts: shiftNames });
      await saveSettings({ shiftRotation: normalizeShiftRotation(rotation, shiftNames) });
    }
  }

  async function goTo(nextIndex, { save = true } = {}) {
    setError("");
    setNotice("");
    if (save && nextIndex > stepIndex) {
      const problem = validate();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setSaving(true);
    try {
      if (save) await saveCurrentStep();
      const nextStep = STEPS[nextIndex].id;
      await saveSettings({ onboarding: { step: nextStep, updatedBy: user?.uid || "" } });
      await refreshDepartment?.();
      setStepIndex(nextIndex);
    } catch (saveError) {
      console.error("Setup wizard save failed", saveError);
      setError(saveError?.message || "Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    setError("");
    try {
      await saveSettings({
        onboardingCompletedAt: new Date().toISOString(),
        onboardingCompletedBy: user?.uid || "",
        onboarding: { step: "done", updatedBy: user?.uid || "" },
      });
      await writeAuditLog(departmentId, {
        action: "onboarding.completed",
        module: "System Admin",
        summary: "Completed the department setup wizard",
        actorUid: user?.uid || "",
        actorName: user?.displayName || user?.email || "",
      });
      await refreshDepartment?.();
      onClose?.({ completed: true });
    } catch (finishError) {
      setError(finishError?.message || "Could not finish setup.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(outcome = {}) {
    if (!outcome.records) return;
    try {
      const records = await attachForgePersonIds(departmentId, outcome.records);
      setPersonnel?.(records);
      setNotice(`Imported ${outcome.created} new and updated ${outcome.updated} personnel record(s).`);
      await writeAuditLog(departmentId, {
        action: "import",
        module: "Personnel",
        summary: `Setup wizard personnel import (${outcome.created} created, ${outcome.updated} updated)`,
      });
    } catch (importError) {
      setError(importError instanceof IdentityReviewRequiredError
        ? "Import paused: some people need an identity review before they can be added."
        : importError?.message || "Import failed.");
    }
  }

  const isLast = step.id === "done";
  const personnelCount = Array.isArray(personnel) ? personnel.length : 0;

  return (
    <div className="setup-wizard-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title">
      <section className="setup-wizard">
        <header className="setup-wizard-header">
          <div>
            <h2 id="setup-wizard-title">Set up {details.name || "your department"}</h2>
            <p className="auth-help">A few quick steps to get your department ready. Everything can be changed later in System Admin.</p>
          </div>
          <button type="button" className="text-button setup-wizard-later" onClick={() => onClose?.({ completed: false })} disabled={saving}>
            <X size={14} /> Finish later
          </button>
        </header>

        <ol className="setup-wizard-steps" aria-label="Setup steps">
          {STEPS.map((item, index) => {
            const Icon = item.icon;
            const state = index < stepIndex ? "done" : index === stepIndex ? "current" : "todo";
            return (
              <li key={item.id} className={`setup-wizard-step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
                <span className="setup-wizard-step-icon">{state === "done" ? <Check size={14} /> : <Icon size={14} />}</span>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="setup-wizard-body">
          {step.id === "department" && (
            <div className="workflow-form">
              <label className="wide-field"><span>Department name</span>
                <input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} placeholder="Camden Fire Department" required />
              </label>
              <label><span>Short name</span>
                <input value={details.shortName} onChange={(e) => setDetails({ ...details, shortName: e.target.value })} placeholder="Camden Fire" />
              </label>
              <label><span>Main phone</span>
                <input value={details.contactPhone} onChange={(e) => setDetails({ ...details, contactPhone: e.target.value })} placeholder="(555) 555-0100" inputMode="tel" />
              </label>
              <label className="wide-field"><span>Street address</span>
                <input value={details.address} onChange={(e) => setDetails({ ...details, address: e.target.value })} placeholder="123 Main St" />
              </label>
              <label><span>City</span>
                <input value={details.city} onChange={(e) => setDetails({ ...details, city: e.target.value })} />
              </label>
              <div className="setup-wizard-field"><span>State</span>
                <DepartmentStateSelect value={details.stateId} onChange={(value) => setDetails({ ...details, stateId: value })} />
              </div>
              <label><span>ZIP</span>
                <input value={details.zip} onChange={(e) => setDetails({ ...details, zip: e.target.value })} inputMode="numeric" />
              </label>
              <label><span>Contact email</span>
                <input type="email" value={details.contactEmail} onChange={(e) => setDetails({ ...details, contactEmail: e.target.value })} />
              </label>
              <div className="wide-field">
                <span className="auth-help">Logo (optional)</span>
                <ObjectUploadField
                  variant="logo"
                  previewUrl={details.logoUrl}
                  previewAlt="Department logo"
                  label="Department logo"
                  hint="PNG or JPG up to 12 MB"
                  buildPath={(file) => buildDepartmentLogoPath(departmentId, file.name)}
                  onUploaded={(uploaded) => setDetails((current) => ({ ...current, logoUrl: uploaded.downloadUrl }))}
                  accept="image/*"
                />
              </div>
            </div>
          )}

          {step.id === "stations" && (
            <>
              <p className="auth-help">List each station. Addresses help with maps and dispatch, but only the name is required.</p>
              <DepartmentStationsEditor value={stations} onChange={setStations} />
            </>
          )}

          {step.id === "shifts" && (
            <>
              <div className="workflow-form">
                <label className="wide-field"><span>Shift names (comma separated)</span>
                  <input value={shiftText} onChange={(e) => setShiftText(e.target.value)} placeholder="A Shift, B Shift, C Shift" />
                </label>
              </div>
              <ShiftRotationPanel rotation={rotation} profileShifts={shiftNames} onChange={setRotation} />
            </>
          )}

          {step.id === "personnel" && (
            <div className="setup-wizard-panel">
              <p>
                Import your roster from a spreadsheet (Excel or CSV). Only first and last name are required; rank, apparatus
                and station are optional. You can also add people one at a time later in Personnel.
              </p>
              <p className="auth-help">{personnelCount ? `${personnelCount} people on the roster so far.` : "No personnel yet."}</p>
              <button type="button" className="secondary-button" onClick={() => setShowImport(true)}>
                <Users size={14} /> Import personnel spreadsheet
              </button>
              <PersonnelImportModal
                open={showImport}
                onClose={() => setShowImport(false)}
                existingRecords={Array.isArray(personnel) ? personnel : []}
                onImport={handleImport}
                idPrefix={resolvePersonnelIdPrefix(departmentId)}
              />
            </div>
          )}

          {step.id === "team" && (
            <>
              <p className="auth-help">Invite officers and members. They get an email link and join with the roles you choose. You can skip this and invite people later from System Admin → Users.</p>
              <DepartmentInvitesPanel departmentId={departmentId} roles={roles} onMessage={setNotice} />
            </>
          )}

          {step.id === "done" && (
            <div className="setup-wizard-panel">
              <h3>You're all set</h3>
              <ul className="setup-wizard-summary">
                <li><strong>Department:</strong> {details.name}</li>
                <li><strong>Stations:</strong> {stationNamesFromDetails(normalizeStationDetails(stations)).join(", ") || "—"}</li>
                <li><strong>Shifts:</strong> {shiftNames.join(", ") || "—"}</li>
                <li><strong>Personnel:</strong> {personnelCount}</li>
              </ul>
              <p className="auth-help">Next: review modules and permissions in System Admin, and add apparatus under Fleet.</p>
            </div>
          )}

          {notice && <p className="auth-help setup-wizard-notice" role="status">{notice}</p>}
          {error && <div className="auth-error" role="alert">{error}</div>}
        </div>

        <footer className="setup-wizard-footer">
          <button type="button" className="secondary-button" onClick={() => goTo(stepIndex - 1, { save: false })} disabled={saving || stepIndex === 0}>
            <ChevronLeft size={14} /> Back
          </button>
          {["personnel", "team"].includes(step.id) && (
            <button type="button" className="text-button" onClick={() => goTo(stepIndex + 1, { save: false })} disabled={saving}>
              Skip
            </button>
          )}
          {isLast ? (
            <button type="button" className="primary-button" onClick={finish} disabled={saving}>
              <Check size={14} /> {saving ? "Finishing..." : "Finish setup"}
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={() => goTo(stepIndex + 1)} disabled={saving}>
              {saving ? "Saving..." : "Save and continue"} <ChevronRight size={14} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
