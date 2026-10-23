import { AlertTriangle } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { FORGE_PUBLIC_WEBSITE_HOST, FORGE_PUBLIC_WEBSITE_URL } from "../lib/platformUrls.js";
import { buildDepartmentGatewayUrl } from "../lib/gatewayRouting.js";
import { useTenant } from "../context/TenantContext.jsx";
import { INACTIVE_DEPARTMENT_TEXT, useDepartmentStatus } from "../hooks/useDepartmentStatus.js";

export default function GatewayNotFoundPage() {
  const { gatewayDepartmentId } = useTenant();
  const status = useDepartmentStatus(gatewayDepartmentId);
  const inactive = INACTIVE_DEPARTMENT_TEXT[status.reason];

  return (
    <div className="auth-screen">
      <div className="auth-theme-toggle-wrap">
        <ThemeToggle />
      </div>
      <section className="auth-card">
        <div className="auth-heading">
          <AlertTriangle size={22} />
          <div>
            <h1>{inactive ? inactive.title : "RMS portal not found"}</h1>
            {inactive ? (
              <p><strong>{status.name || gatewayDepartmentId}</strong> {inactive.body}</p>
            ) : (
              <p>
                No active FORGE RMS gateway exists for{" "}
                <code>{buildDepartmentGatewayUrl(gatewayDepartmentId)}</code>.
              </p>
            )}
          </div>
        </div>

        <p className="auth-help">
          {inactive
            ? "If you think this is a mistake, ask your department administrator to contact FORGE Public Safety."
            : "Check the link from your administrator, or visit the company website for support."}
        </p>

        <p className="auth-help auth-website-link">
          <a href={FORGE_PUBLIC_WEBSITE_URL} target="_blank" rel="noreferrer">
            {FORGE_PUBLIC_WEBSITE_HOST}
          </a>
        </p>
      </section>
    </div>
  );
}
