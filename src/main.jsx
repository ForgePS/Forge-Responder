import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import PublicAlertDashboardPage from "./pages/PublicAlertDashboardPage.jsx";
import UtilityAckPortalPage from "./pages/UtilityAckPortalPage.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { DropdownProvider } from "./context/DropdownContext.jsx";
import { TenantProvider } from "./context/TenantContext.jsx";
import { isAlertDashboardPath } from "./lib/gatewayRouting.js";
import { isUtilityAckPath } from "./lib/hydrantDamage/utilityAckPortal.js";
import "./theme/tokens.css";
import "./styles.css";
import "./modern-theme.css";
import "./theme/light-polish.css";
import "./theme/personnel-firstdue.css";
import "./theme/employee-portal.css";
import "./theme/schedule-calendar.css";
import "./theme/week-roster-board.css";
import "./theme/leave-requests.css";
import "./theme/time-card.css";
import "./theme/corona.css";
import "./styles/neris-incident.css";
import { ThemeProvider } from "./context/ThemeContext.jsx";

function Root() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const onAlertDashboard = typeof window !== "undefined" && (
    window.__FORGE_ALERT_DASHBOARD__ === true
    || isAlertDashboardPath(pathname)
  );
  if (onAlertDashboard) {
    return (
      <ErrorBoundary>
        <PublicAlertDashboardPage />
      </ErrorBoundary>
    );
  }

  if (isUtilityAckPath(pathname)) {
    return (
      <ErrorBoundary>
        <UtilityAckPortalPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <TenantProvider>
          <ThemeProvider>
            <DropdownProvider>
              <App />
            </DropdownProvider>
          </ThemeProvider>
        </TenantProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
