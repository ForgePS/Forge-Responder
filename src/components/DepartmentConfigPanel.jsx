import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { ADMIN_MODULE_OPTIONS } from "../data/adminRegistry.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { writeAuditLog } from "../lib/auditService.js";
import { getFirestoreDb } from "../lib/firebaseClient.js";
import { doc, setDoc } from "firebase/firestore";
import ShiftRotationPanel from "./ShiftRotationPanel.jsx";
import EmployeePortalRulesPanel from "./EmployeePortalRulesPanel.jsx";
import PayRulesPanel from "./PayRulesPanel.jsx";
import SchedulingApparatusPanel from "./SchedulingApparatusPanel.jsx";
import ApparatusCrewSlotsPanel from "./ApparatusCrewSlotsPanel.jsx";
import DepartmentStationsEditor from "./DepartmentStationsEditor.jsx";
import DepartmentSubscriptionEditor from "./DepartmentSubscriptionEditor.jsx";
import { normalizeShiftRotation } from "../data/defaultShiftRotation.js";
import { normalizePayPeriod } from "../lib/payPeriods.js";
import { normalizeEmployeePortalRules } from "../lib/employeePortalRules.js";
import { normalizePayRules } from "../lib/payRules.js";
import { normalizeSchedulingSettings } from "../lib/schedulingSettings.js";
import { resolveAvailableModules } from "../lib/platformInheritance.js";
import { canManageBranchSubscription, canViewBranchSubscription } from "../lib/permissions.js";
import {
  buildStationDetailsFromProfile,
  normalizeStationDetails,
  stationNamesFromDetails,
} from "../lib/stationProfile.js";

const emptyProfileForm = {
  displayTitle: "",
  name: "",
  shortName: "",
  themeName: "",
  branchLabel: "",
  logoUrl: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  timezone: "America/Chicago",
  shifts: "",
};

function toCommaField(value) {
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

function parseCommaList(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

const DEPARTMENT_CONFIG_SECTIONS = [
  { id: "branding", label: "Branding & Profile" },
  { id: "stations", label: "Stations" },
  { id: "academy", label: "Forge Academy" },
  { id: "shift-rotation", label: "Shift Rotation" },
  { id: "portal-rules", label: "Employee Portal" },
  { id: "pay-rules", label: "Pay & Overtime" },
  { id: "scheduling-apparatus", label: "Roster Apparatus" },
  { id: "crew-slots", label: "Crew Positions" },
  { id: "modules", label: "Enabled Modules" },
  { id: "summary", label: "Summary" },
  { id: "subscription", label: "Subscription" },
];

const emptyForgeAcademy = {
  hubEnabled: true,
  hubBaseUrl: "https://forge-integration-hub-peorxtprba-uc.a.run.app",
  hubBearerToken: "",
  hubSecret: "",
  forgeDepartmentId: "forge-platform",
};

export default function DepartmentConfigPanel({ onMessage, apparatus = [] }) {
  const { departmentId, profile, settings, platformConfig, refreshDepartment } = useTenant();
  const { user, membership, isCreator, permissions } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("branding");
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [enabledModules, setEnabledModules] = useState([]);
  const [shiftRotation, setShiftRotation] = useState(normalizeShiftRotation());
  const [payPeriod, setPayPeriod] = useState(normalizePayPeriod());
  const [portalRules, setPortalRules] = useState(normalizeEmployeePortalRules());
  const [payRules, setPayRules] = useState(normalizePayRules());
  const [schedulingSettings, setSchedulingSettings] = useState(normalizeSchedulingSettings());
  const [stationDetails, setStationDetails] = useState([]);
  const [forgeAcademy, setForgeAcademy] = useState(emptyForgeAcademy);
  const fleetUnits = useMemo(
    () => (Array.isArray(apparatus) ? apparatus : []).map((unit) => unit?.unit).filter(Boolean),
    [apparatus]
  );
  const profileShifts = parseCommaList(profileForm.shifts);

  useEffect(() => {
    const shiftList = Array.isArray(profile.shifts)
      ? profile.shifts
      : parseCommaList(profile.shifts);
    setProfileForm({
      displayTitle: profile.displayTitle || "",
      name: profile.name || "",
      shortName: profile.shortName || "",
      themeName: profile.themeName || "",
      branchLabel: profile.branchLabel || "",
      logoUrl: profile.logoUrl || "",
      contactEmail: profile.contactEmail || "",
      contactPhone: profile.contactPhone || "",
      address: profile.address || "",
      timezone: profile.timezone || "America/Chicago",
      shifts: toCommaField(profile.shifts),
    });
    setStationDetails(buildStationDetailsFromProfile(profile));
    setEnabledModules(settings.enabledModules || []);
    setShiftRotation(normalizeShiftRotation(settings.shiftRotation, shiftList));
    setPayPeriod(normalizePayPeriod(settings.payPeriod));
    setPortalRules(normalizeEmployeePortalRules(settings.employeePortalRules));
    setPayRules(normalizePayRules(settings.payRules));
    setSchedulingSettings(normalizeSchedulingSettings(settings.schedulingSettings, fleetUnits));
    setForgeAcademy({
      ...emptyForgeAcademy,
      ...(settings.forgeAcademy || {}),
    });
  }, [profile, settings, departmentId, fleetUnits]);

  const moduleOptions = ADMIN_MODULE_OPTIONS.filter((module) => {
    const available = resolveAvailableModules(platformConfig?.availableModules);
    return available.includes(module.key);
  });
  const canManageSubscription = canManageBranchSubscription(isCreator);
  const canViewSubscription = canViewBranchSubscription(permissions, isCreator);
  const canManageModules = canManageSubscription;

  const visibleSections = useMemo(
    () => DEPARTMENT_CONFIG_SECTIONS.filter((section) => (
      section.id !== "subscription" || canViewSubscription
    )),
    [canViewSubscription]
  );

  useEffect(() => {
    if (!visibleSections.some((section) => section.id === activeSection)) {
      setActiveSection(visibleSections[0]?.id || "branding");
    }
  }, [activeSection, visibleSections]);

  function toggleModule(moduleKey) {
    if (!canManageModules) return;
    setEnabledModules((current) => (
      current.includes(moduleKey)
        ? current.filter((item) => item !== moduleKey)
        : [...current, moduleKey]
    ));
  }

  async function saveConfig() {
    const db = getFirestoreDb();
    if (!db || !departmentId) return;

    setSaving(true);
    try {
      const normalizedStations = normalizeStationDetails(stationDetails);
      const profilePayload = {
        ...profile,
        displayTitle: profileForm.displayTitle.trim(),
        name: profileForm.name.trim(),
        shortName: profileForm.shortName.trim(),
        themeName: profileForm.themeName.trim(),
        branchLabel: profileForm.branchLabel.trim(),
        logoUrl: profileForm.logoUrl.trim(),
        contactEmail: profileForm.contactEmail.trim(),
        contactPhone: profileForm.contactPhone.trim(),
        address: profileForm.address.trim(),
        timezone: profileForm.timezone.trim(),
        stations: stationNamesFromDetails(normalizedStations),
        stationDetails: normalizedStations,
        shifts: parseCommaList(profileForm.shifts),
        updatedAt: new Date().toISOString()
      };

      const settingsPayload = {
        ...settings,
        departmentId,
        enabledModules: canManageModules
          ? enabledModules
          : (settings.enabledModules || []),
        shiftRotation: canManageModules
          ? normalizeShiftRotation(shiftRotation, profilePayload.shifts)
          : normalizeShiftRotation(settings.shiftRotation, profilePayload.shifts),
        payPeriod: normalizePayPeriod(payPeriod),
        employeePortalRules: normalizeEmployeePortalRules(portalRules),
        payRules: normalizePayRules(payRules),
        schedulingSettings: canManageModules
          ? normalizeSchedulingSettings(schedulingSettings, fleetUnits)
          : normalizeSchedulingSettings(settings.schedulingSettings, fleetUnits),
        forgeAcademy: {
          hubEnabled: forgeAcademy.hubEnabled !== false,
          hubBaseUrl: String(forgeAcademy.hubBaseUrl || "").trim().replace(/\/$/, ""),
          hubBearerToken: String(forgeAcademy.hubBearerToken || "").trim(),
          hubSecret: String(forgeAcademy.hubSecret || "").trim(),
          forgeDepartmentId: String(forgeAcademy.forgeDepartmentId || "").trim(),
        },
        updatedAt: new Date().toISOString()
      };

      await Promise.all([
        setDoc(doc(db, "departments", departmentId, "profile", "main"), profilePayload, { merge: true }),
        setDoc(doc(db, "departments", departmentId, "settings", "main"), settingsPayload, { merge: true })
      ]);

      await writeAuditLog(departmentId, {
        action: "update",
        module: "System Admin",
        summary: "Updated department profile, station information, portal rules, pay rules, and module settings",
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email
      });

      await refreshDepartment?.();
      onMessage?.("Department configuration saved");
    } catch (error) {
      console.error("Failed to save department config", error);
      onMessage?.("Save failed — check permissions and try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="department-config-panel">
      <div className="department-config-nav" role="tablist" aria-label="Department configuration sections">
        {visibleSections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={activeSection === section.id}
            aria-controls={`department-config-section-${section.id}`}
            id={`department-config-tab-${section.id}`}
            className={`admin-section-pill department-config-pill${activeSection === section.id ? " is-open" : ""}`}
            onClick={() => setActiveSection(section.id)}
          >
            <span>{section.label}</span>
          </button>
        ))}
      </div>

      <div
        className="department-config-section-body admin-section-body"
        id={`department-config-section-${activeSection}`}
        role="tabpanel"
        aria-labelledby={`department-config-tab-${activeSection}`}
      >
        {activeSection === "branding" ? (
          <div className="workflow-form">
            <label><span>Top Bar Title</span><input value={profileForm.displayTitle} onChange={(e) => setProfileForm({ ...profileForm, displayTitle: e.target.value })} placeholder="Horn Lake Fire/EMS" /></label>
            <label><span>Department Name</span><input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></label>
            <label><span>Short Name</span><input value={profileForm.shortName} onChange={(e) => setProfileForm({ ...profileForm, shortName: e.target.value })} /></label>
            <label><span>Theme Name</span><input value={profileForm.themeName} onChange={(e) => setProfileForm({ ...profileForm, themeName: e.target.value })} /></label>
            <label><span>Branch Label</span><input value={profileForm.branchLabel} onChange={(e) => setProfileForm({ ...profileForm, branchLabel: e.target.value })} /></label>
            <label className="wide-field"><span>Logo Path / URL</span><input value={profileForm.logoUrl} onChange={(e) => setProfileForm({ ...profileForm, logoUrl: e.target.value })} /></label>
            <label><span>Contact Email</span><input value={profileForm.contactEmail} onChange={(e) => setProfileForm({ ...profileForm, contactEmail: e.target.value })} /></label>
            <label><span>Contact Phone</span><input value={profileForm.contactPhone} onChange={(e) => setProfileForm({ ...profileForm, contactPhone: e.target.value })} /></label>
            <label className="wide-field"><span>Address</span><input value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} /></label>
            <label><span>Timezone</span><input value={profileForm.timezone} onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })} /></label>
            <label className="wide-field"><span>Shifts (comma-separated)</span><input value={profileForm.shifts} onChange={(e) => setProfileForm({ ...profileForm, shifts: e.target.value })} /></label>
          </div>
        ) : null}

        {activeSection === "stations" ? (
          <DepartmentStationsEditor
            value={stationDetails}
            onChange={setStationDetails}
          />
        ) : null}

        {activeSection === "academy" ? (
          <div className="workflow-form">
            <p className="hint-text" style={{ gridColumn: "1 / -1" }}>
              Forge Person Identity is owned by the Integration Hub. Configure Hub access here so
              personnel saves resolve a permanent <code>forgePersonId</code> (never Auth UID).
            </p>
            <label className="wide-field" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={forgeAcademy.hubEnabled !== false}
                onChange={(e) => setForgeAcademy({ ...forgeAcademy, hubEnabled: e.target.checked })}
              />
              <span>Route person identity through Integration Hub</span>
            </label>
            <label className="wide-field">
              <span>Hub base URL</span>
              <input
                value={forgeAcademy.hubBaseUrl}
                onChange={(e) => setForgeAcademy({ ...forgeAcademy, hubBaseUrl: e.target.value })}
                placeholder="https://forge-integration-hub-….run.app"
              />
            </label>
            <label>
              <span>Forge department ID</span>
              <input
                value={forgeAcademy.forgeDepartmentId}
                onChange={(e) => setForgeAcademy({ ...forgeAcademy, forgeDepartmentId: e.target.value })}
                placeholder="forge-platform"
              />
            </label>
            <label>
              <span>Hub Bearer token</span>
              <input
                type="password"
                value={forgeAcademy.hubBearerToken}
                onChange={(e) => setForgeAcademy({ ...forgeAcademy, hubBearerToken: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label>
              <span>Hub shared secret</span>
              <input
                type="password"
                value={forgeAcademy.hubSecret}
                onChange={(e) => setForgeAcademy({ ...forgeAcademy, hubSecret: e.target.value })}
                autoComplete="off"
              />
            </label>
          </div>
        ) : null}

        {activeSection === "shift-rotation" ? (
          <ShiftRotationPanel
            rotation={shiftRotation}
            profileShifts={profileShifts}
            onChange={setShiftRotation}
            readOnly={!canManageModules}
          />
        ) : null}

        {activeSection === "portal-rules" ? (
          <EmployeePortalRulesPanel
            payPeriod={payPeriod}
            onPayPeriodChange={setPayPeriod}
            portalRules={portalRules}
            onPortalRulesChange={setPortalRules}
          />
        ) : null}

        {activeSection === "pay-rules" ? (
          <PayRulesPanel
            value={payRules}
            onChange={setPayRules}
          />
        ) : null}

        {activeSection === "scheduling-apparatus" ? (
          <SchedulingApparatusPanel
            value={schedulingSettings}
            onChange={setSchedulingSettings}
            availableUnits={fleetUnits}
            readOnly={!canManageModules}
          />
        ) : null}

        {activeSection === "crew-slots" ? (
          <ApparatusCrewSlotsPanel
            value={schedulingSettings}
            onChange={setSchedulingSettings}
            availableUnits={fleetUnits}
            apparatus={apparatus}
            readOnly={!canManageModules}
          />
        ) : null}

        {activeSection === "modules" ? (
          <div className={`module-toggle-grid${canManageModules ? "" : " is-readonly"}`}>
            <strong>Enabled Modules</strong>
            <p className="auth-help">
              {canManageModules
                ? "Only modules enabled on the FORGE platform can be assigned here."
                : "Module access for this branch is managed by the FORGE platform creator. Contact your platform administrator to change enabled modules."}
            </p>
            {moduleOptions.map((module) => (
              <label key={module.key} className="permission-toggle permission-check">
                <input
                  type="checkbox"
                  checked={enabledModules.includes(module.key)}
                  disabled={!canManageModules}
                  onChange={() => toggleModule(module.key)}
                />
                <span>{module.label}</span>
              </label>
            ))}
          </div>
        ) : null}

        {activeSection === "summary" ? (
          <div className="cert-detail-grid">
            <div><span>Department ID</span><strong>{departmentId}</strong></div>
            <div><span>Enabled Modules</span><strong>{enabledModules.length}</strong></div>
          </div>
        ) : null}

        {activeSection === "subscription" && canViewSubscription ? (
          <div className="department-subscription-config-block">
            <DepartmentSubscriptionEditor
              departmentId={departmentId}
              departmentName={profileForm.shortName || profileForm.name}
              onMessage={onMessage}
              compact
              readOnly={!canManageSubscription}
            />
          </div>
        ) : null}
      </div>

      <div className="modal-actions">
        <button className="primary-button" type="button" onClick={saveConfig} disabled={saving}>
          <Check size={14} /> {saving ? "Saving..." : "Save Department Config"}
        </button>
      </div>
    </section>
  );
}
