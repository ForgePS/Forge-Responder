import { memo, useMemo } from "react";
import DepartmentPortalLink from "./DepartmentPortalLink.jsx";
import PlatformBrandHero from "./PlatformBrandHero.jsx";
import { defaultDepartmentProfile } from "../data/defaultDepartment.js";
import { mapDemoDepartmentProfile } from "../data/demoDepartment.js";
import { DEMO_DEPARTMENT_ID, PLATFORM_SCOPE_ID, isDemoDepartment, isPlatformScope } from "../lib/tenantPaths.js";

function CreatorWorkspaceHero({
  workspaceId,
  departments = [],
  platformConfig,
  profile = defaultDepartmentProfile
}) {
  const registryEntry = useMemo(
    () => departments.find((item) => item.id === workspaceId) || null,
    [departments, workspaceId]
  );

  const departmentProfile = useMemo(() => {
    if (isPlatformScope(workspaceId)) return null;

    const profileMatchesWorkspace = profile?.id === workspaceId;
    const baseProfile = isDemoDepartment(workspaceId)
      ? mapDemoDepartmentProfile(profileMatchesWorkspace ? profile : undefined)
      : { ...defaultDepartmentProfile, ...(profileMatchesWorkspace ? profile : {}) };

    return {
      ...baseProfile,
      id: workspaceId,
      name: registryEntry?.name || baseProfile.name || workspaceId,
      shortName: registryEntry?.shortName || baseProfile.shortName || workspaceId,
      displayTitle: registryEntry?.name || baseProfile.displayTitle || baseProfile.shortName || workspaceId,
      branchLabel: registryEntry?.branchLabel || baseProfile.branchLabel || "Department Branch",
      logoUrl: profileMatchesWorkspace ? profile.logoUrl : baseProfile.logoUrl,
      address: profileMatchesWorkspace ? profile.address : baseProfile.address,
      contactEmail: profileMatchesWorkspace ? profile.contactEmail : baseProfile.contactEmail,
      contactPhone: profileMatchesWorkspace ? profile.contactPhone : baseProfile.contactPhone
    };
  }, [workspaceId, registryEntry, profile]);

  if (isPlatformScope(workspaceId)) {
    return <PlatformBrandHero config={platformConfig} showPortalLink={false} />;
  }

  return (
    <div className="creator-workspace-hero">
      <PlatformBrandHero profile={departmentProfile} showPortalLink={false} />
      <DepartmentPortalLink departmentId={workspaceId} />
    </div>
  );
}

export default memo(
  CreatorWorkspaceHero,
  (prev, next) => (
    prev.workspaceId === next.workspaceId
    && prev.departments === next.departments
    && prev.platformConfig === next.platformConfig
    && prev.profile?.id === next.profile?.id
    && prev.profile?.logoUrl === next.profile?.logoUrl
    && prev.profile?.address === next.profile?.address
    && prev.profile?.contactEmail === next.profile?.contactEmail
    && prev.profile?.contactPhone === next.profile?.contactPhone
  )
);

export { PLATFORM_SCOPE_ID, DEMO_DEPARTMENT_ID };
