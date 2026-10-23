import { AlertTriangle } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { FORGE_PUBLIC_WEBSITE_HOST, FORGE_PUBLIC_WEBSITE_URL } from "../lib/platformUrls.js";
import { buildDepartmentGatewayUrl } from "../lib/gatewayRouting.js";
import { useTenant } from "../context/TenantContext.jsx";

export default function GatewayNotFoundPage() {
  const { gatewayDepartmentId } = useTenant();

  return (
    <div className="auth-screen">
      <div className="auth-theme-toggle-wrap">
        <ThemeToggle />
      </div>
      <section className="auth-card">
        <div className="auth-heading">
          <AlertTriangle size={22} />
          <div>
            <h1>RMS portal not found</h1>
            <p>
              No active FORGE RMS gateway exists for{" "}
              <code>{buildDepartmentGatewayUrl(gatewayDepartmentId)}</code>.
            </p>
          </div>
        </div>

        <p className="auth-help">
          Check the link from your administrator, or visit the company website for support.
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
