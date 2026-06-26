import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { isDemoModeActive } from "../lib/demoMode.js";
import { writeStoredWorkspaceId } from "../lib/creatorConsoleWorkspace.js";
import { listPlatformDepartments } from "../lib/platformService.js";
import { PLATFORM_SCOPE_ID } from "../lib/tenantPaths.js";
import { useTenant } from "../context/TenantContext.jsx";

export default function DepartmentSwitcher({ isCreator, onScopeChange }) {
  const { departmentId, setDepartmentId, profile, platformConfig } = useTenant();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isCreator) return undefined;
    let cancelled = false;

    function loadDepartments() {
      setLoading(true);
      listPlatformDepartments()
        .then((items) => {
          if (!cancelled) setDepartments(items);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    loadDepartments();
    window.addEventListener("rms-departments-changed", loadDepartments);
    return () => {
      cancelled = true;
      window.removeEventListener("rms-departments-changed", loadDepartments);
    };
  }, [isCreator]);

  if (!isCreator || isDemoModeActive()) return null;

  function handleChange(nextId) {
    writeStoredWorkspaceId(nextId);
    setDepartmentId(nextId);
    onScopeChange?.(nextId);
  }

  const platformTitle = platformConfig?.platformTitle || "FORGE RMS";

  return (
    <label className="department-switcher">
      <Building2 size={14} />
      <span>Workspace</span>
      <select
        value={departmentId}
        disabled={loading}
        onChange={(event) => handleChange(event.target.value)}
        title={departmentId === PLATFORM_SCOPE_ID ? platformTitle : profile.name}
      >
        <option value={PLATFORM_SCOPE_ID}>{platformTitle} (Platform)</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name || department.id}
          </option>
        ))}
      </select>
    </label>
  );
}
