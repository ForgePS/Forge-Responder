import { useMemo } from "react";
import AlertDashboardView from "../components/digitalDashboard/AlertDashboardView.jsx";
import { defaultAlertDashboardConfig } from "../lib/alertDashboard.js";
import "../theme/alert-dashboard.css";

function readDisplayId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("display") || "";
}

export default function AlertDashboardPage({
  departmentId = "",
  profile = {},
  alerts = [],
  configItems = [],
  businessDirectory = [],
  displays = [],
}) {
  const displayId = useMemo(() => readDisplayId(), []);
  const config = useMemo(() => {
    const saved = configItems.find((item) => item.id === "config") || configItems[0];
    return defaultAlertDashboardConfig(saved || {});
  }, [configItems]);

  return (
    <div className="alert-dashboard-page">
      <AlertDashboardView
        departmentId={departmentId}
        profile={profile}
        alerts={alerts}
        config={config}
        businessDirectory={businessDirectory}
        displays={displays}
        displayId={displayId}
      />
    </div>
  );
}
