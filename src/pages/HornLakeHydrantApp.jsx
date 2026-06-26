import { AuthProvider, useAuth } from "../context/AuthContext.jsx";
import { TenantProvider, useTenant } from "../context/TenantContext.jsx";
import { ThemeProvider } from "../context/ThemeContext.jsx";
import HydrantTestingPage from "./HydrantTestingPage.jsx";
import LoginPage from "./LoginPage.jsx";
import AccessDeniedPage from "./AccessDeniedPage.jsx";
import { resolveInitialHydrantTab, isHornLakeHydrantHost, hornLakeDepartmentId } from "../lib/hydrantAppRouting.js";

function LoadingScreen() {
  return (
    <div className="auth-screen">
      <section className="auth-card auth-loading"><p>Loading Horn Lake hydrant tools...</p></section>
    </div>
  );
}

function HornLakeHydrantShell() {
  const { authRequired, authLoading, membershipLoading, user, membership, isCreator } = useAuth();
  const { ready, profile } = useTenant();
  const initialTab = resolveInitialHydrantTab({ preferDashboard: true });

  if (authRequired && (authLoading || membershipLoading || !ready)) {
    return <LoadingScreen />;
  }
  if (authRequired && !user) {
    return <LoginPage />;
  }
  if (authRequired && !membership && !isCreator) {
    return <AccessDeniedPage userId={user?.uid} />;
  }

  return (
    <HydrantTestingPage
      embedded={false}
      initialTab={initialTab === "app" ? "dashboard" : initialTab}
      departmentId={hornLakeDepartmentId()}
      profile={profile}
    />
  );
}

export default function HornLakeHydrantApp() {
  return (
    <AuthProvider>
      <TenantProvider>
        <ThemeProvider>
          <HornLakeHydrantShell />
        </ThemeProvider>
      </TenantProvider>
    </AuthProvider>
  );
}

export { isHornLakeHydrantHost };
