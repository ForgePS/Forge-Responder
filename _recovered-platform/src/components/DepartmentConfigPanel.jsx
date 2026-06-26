import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ADMIN_MODULE_OPTIONS } from "../data/adminRegistry.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { writeAuditLog } from "../lib/auditService.js";
import { getFirestoreDb } from "../lib/firebaseClient.js";
import { doc, setDoc } from "firebase/firestore";

export default function DepartmentConfigPanel({ onMessage }) {
  const { departmentId, profile, settings, refreshDepartment } = useTenant();
  const { user, membership } = useAuth();
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [enabledModules, setEnabledModules] = useState([]);
  const [platformForm, setPlatformForm] = useState({ name: "", tagline: "" });

  useEffect(() => {
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
      stations: (profile.stations || []).join(", "),
      shifts: (profile.shifts || []).join(", ")
    });
    setEnabledModules(settings.enabledModules || []);
    setPlatformForm({
      name: settings.platform?.name || "",
      tagline: settings.platform?.tagline || ""
    });
  }, [profile, settings, departmentId]);

  function toggleModule(moduleKey) {
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
        stations: profileForm.stations.split(",").map((item) => item.trim()).filter(Boolean),
        shifts: profileForm.shifts.split(",").map((item) => item.trim()).filter(Boolean),
        updatedAt: new Date().toISOString()
      };

      const settingsPayload = {
        ...settings,
        departmentId,
        enabledModules,
        platform: {
          ...settings.platform,
          name: platformForm.name.trim(),
          tagline: platformForm.tagline.trim()
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
        summary: "Updated department profile and module settings",
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
        <label className="wide-field"><span>Stations (comma-separated)</span><input value={profileForm.stations} onChange={(e) => setProfileForm({ ...profileForm, stations: e.target.value })} /></label>
        <label className="wide-field"><span>Shifts (comma-separated)</span><input value={profileForm.shifts} onChange={(e) => setProfileForm({ ...profileForm, shifts: e.target.value })} /></label>
        <label><span>Platform Name</span><input value={platformForm.name} onChange={(e) => setPlatformForm({ ...platformForm, name: e.target.value })} /></label>
        <label><span>Platform Tagline</span><input value={platformForm.tagline} onChange={(e) => setPlatformForm({ ...platformForm, tagline: e.target.value })} /></label>
      </div>

      <div className="module-toggle-grid">
        <strong>Enabled Modules</strong>
        {ADMIN_MODULE_OPTIONS.map((module) => (
          <label key={module.key} className="permission-toggle">
            <input
              type="checkbox"
              checked={enabledModules.includes(module.key)}
              onChange={() => toggleModule(module.key)}
            />
            <span>{module.label}</span>
          </label>
        ))}
      </div>

      <div className="cert-detail-grid" style={{ marginTop: 12 }}>
        <div><span>Department ID</span><strong>{departmentId}</strong></div>
        <div><span>Enabled Modules</span><strong>{enabledModules.length}</strong></div>
      </div>

      <div className="modal-actions">
        <button className="primary-button" type="button" onClick={saveConfig} disabled={saving}>
          <Check size={14} /> {saving ? "Saving..." : "Save Department Config"}
        </button>
      </div>
    </section>
  );
}
