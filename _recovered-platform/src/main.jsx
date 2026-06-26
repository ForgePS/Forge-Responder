import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import PublicAlertDashboardPage from "./pages/PublicAlertDashboardPage.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { DropdownProvider } from "./context/DropdownContext.jsx";
import { TenantProvider } from "./context/TenantContext.jsx";
import { isAlertDashboardPath } from "./lib/gatewayRouting.js";
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
import { ThemeProvider } from "./context/ThemeContext.jsx";

function Root() {
  if (typeof window !== "undefined" && isAlertDashboardPath(window.location.pathname)) {
    return (
      <ErrorBoundary>
        <ThemeProvider>
          <PublicAlertDashboardPage />
        </ThemeProvider>
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
