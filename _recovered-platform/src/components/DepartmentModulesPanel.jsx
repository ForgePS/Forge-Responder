import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { ADMIN_MODULE_OPTIONS } from "../data/adminRegistry.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { writeAuditLog } from "../lib/auditService.js";
import {
  listPlatformDepartments,
  loadDepartmentSettings,
  saveDepartmentModules
} from "../lib/platformService.js";

export default function DepartmentModulesPanel({ onMessage, onOpenDepartment }) {
  const { platformConfig } = useTenant();
  const { user, membership } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [enabledModules, setEnabledModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const availableModules = useMemo(() => {
    const keys = platformConfig?.availableModules?.length
      ? platformConfig.availableModules
      : ADMIN_MODULE_OPTIONS.map((module) => module.key);
    return ADMIN_MODULE_OPTIONS.filter((module) => keys.includes(module.key));
  }, [platformConfig?.availableModules]);

  const selectedDepartment = departments.find((item) => item.id === selectedDepartmentId);

  async function loadDepartments() {
    setLoading(true);
    try {
      const items = await listPlatformDepartments();
      setDepartments(items);
      if (!selectedDepartmentId && items.length) {
        setSelectedDepartmentId(items[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadModulesForDepartment(departmentId) {
    if (!departmentId) return;
    const settings = await loadDepartmentSettings(departmentId);
    const allowed = new Set(availableModules.map((module) => module.key));
    setEnabledModules((settings.enabledModules || []).filter((key) => allowed.has(key)));
  }

  useEffect(() => {
    loadDepartments();
  }, []);

  useEffect(() => {
    if (selectedDepartmentId) {
      loadModulesForDepartment(selectedDepartmentId);
    }
  }, [selectedDepartmentId, platformConfig?.availableModules]);

  function toggleModule(moduleKey) {
    setEnabledModules((current) => (
      current.includes(moduleKey)
        ? current.filter((item) => item !== moduleKey)
        : [...current, moduleKey]
    ));
  }

  function setAllModules(enabled) {
    setEnabledModules(enabled ? availableModules.map((module) => module.key) : []);
  }

  async function saveModules() {
    if (!selectedDepartmentId) return;
    setSaving(true);
    try {
      await saveDepartmentModules(selectedDepartmentId, enabledModules);
      await writeAuditLog(selectedDepartmentId, {
        action: "update",
        module: "FORGE Platform",
        summary: `Updated enabled modules (${enabledModules.length}) for ${selectedDepartment?.name || selectedDepartmentId}`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email
      });
      onMessage?.(`Saved modules for ${selectedDepartment?.name || selectedDepartmentId}`);
    } catch (error) {
      console.error("Failed to save department modules", error);
      onMessage?.("Failed to save department modules");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="auth-help">Loading departments...</p>;
  }

  return (
    <section className="department-modules-panel">
      <p className="auth-help">
        Turn modules on or off for each department. Only modules enabled at the platform level are shown here.
      </p>

      <div className="department-modules-toolbar">
        <label>
          <span>Department</span>
          <select value={selectedDepartmentId} onChange={(event) => setSelectedDepartmentId(event.target.value)}>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name || department.id}
              </option>
            ))}
          </select>
        </label>
        <div className="department-modules-actions">
          <button className="secondary-button" type="button" onClick={() => setAllModules(true)}>Enable all</button>
          <button className="secondary-button" type="button" onClick={() => setAllModules(false)}>Disable all</button>
          {onOpenDepartment && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => onOpenDepartment(selectedDepartmentId)}
            >
              Open department
            </button>
          )}
          <button className="primary-button" type="button" onClick={saveModules} disabled={saving || !selectedDepartmentId}>
            <Check size={14} /> {saving ? "Saving..." : "Save department modules"}
          </button>
        </div>
      </div>

      <div className="module-toggle-grid">
        <strong>Modules for {selectedDepartment?.name || selectedDepartmentId}</strong>
        {availableModules.map((module) => (
          <label key={module.key} className="permission-toggle permission-check">
            <input
              type="checkbox"
              checked={enabledModules.includes(module.key)}
              onChange={() => toggleModule(module.key)}
            />
            <span>{module.label}</span>
          </label>
        ))}
        {!availableModules.length && (
          <p className="auth-help">No modules are enabled at the platform level. Turn them on under Platform Settings.</p>
        )}
      </div>

      <div className="department-modules-summary">
        {departments.map((department) => (
          <DepartmentModuleSummary
            key={department.id}
            department={department}
            availableModules={availableModules}
            active={department.id === selectedDepartmentId}
            onSelect={() => setSelectedDepartmentId(department.id)}
          />
        ))}
      </div>
    </section>
  );
}

function DepartmentModuleSummary({ department, availableModules, active, onSelect }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadDepartmentSettings(department.id).then((settings) => {
      if (cancelled) return;
      const allowed = new Set(availableModules.map((module) => module.key));
      const enabled = (settings.enabledModules || []).filter((key) => allowed.has(key));
      setCount(enabled.length);
    });
    return () => { cancelled = true; };
  }, [department.id, availableModules]);

  return (
    <button type="button" className={`department-module-chip ${active ? "active" : ""}`} onClick={onSelect}>
      <strong>{department.shortName || department.name || department.id}</strong>
      <span>{count} / {availableModules.length} modules</span>
    </button>
  );
}
