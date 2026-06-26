import { memo } from "react";
import { normalizeGatewayDepartmentId } from "../lib/gatewayRouting.js";
import { FORGE_RMS_APP_HOST, FORGE_RMS_APP_URL } from "../lib/rmsAppUrl.js";
import { isPlatformScope } from "../lib/tenantPaths.js";

function buildPortal(departmentId) {
  const normalized = normalizeGatewayDepartmentId(departmentId);
  return {
    href: `${FORGE_RMS_APP_URL}/${encodeURIComponent(normalized)}`,
    label: `${FORGE_RMS_APP_HOST}/${normalized}`
  };
}

function DepartmentPortalLink({ departmentId }) {
  if (!departmentId || isPlatformScope(departmentId)) {
    return (
      <div className="platform-brand-links platform-brand-links-stable creator-portal-link-slot" aria-hidden="true" />
    );
  }

  const { href, label } = buildPortal(departmentId);

  return (
    <div className="platform-brand-links platform-brand-links-stable creator-portal-link-slot">
      <span className="platform-brand-rms platform-brand-rms-static">
        Department portal:{" "}
        <button
          type="button"
          className="platform-brand-link-button"
          onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
        >
          {label}
        </button>
      </span>
    </div>
  );
}

export default memo(
  DepartmentPortalLink,
  (prev, next) => (
    normalizeGatewayDepartmentId(prev.departmentId || "")
    === normalizeGatewayDepartmentId(next.departmentId || "")
  )
);
