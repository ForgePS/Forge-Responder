import { useEffect, useMemo, useState } from "react";
import { Download, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  buildFleetDashboardMetrics,
  canViewFleetDashboard,
  downloadClassicFleetExport,
  ensureFleetAssets,
  loadFleetSettings,
} from "../lib/fleet/index.js";

export default function FleetDashboardPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetDashboard(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(null);
  const [exporting, setExporting] = useState(false);

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextSettings, assets] = await Promise.all([
        loadFleetSettings(departmentId),
        ensureFleetAssets(departmentId, legacyApparatus, actor),
      ]);
      setSettings(nextSettings);
      setRecords(assets);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load fleet dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const metrics = useMemo(() => buildFleetDashboardMetrics(records), [records]);

  async function handleExport() {
    setExporting(true);
    setMessage("");
    setError("");
    try {
      await downloadClassicFleetExport(departmentId);
      setMessage("Classic fleet lists exported.");
    } catch (exportError) {
      setError(exportError?.message || "Unable to export fleet lists.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title={settings?.moduleName ? `${settings.moduleName} Dashboard` : "Fleet Dashboard"}
        description="Operational readiness overview for response and support vehicles."
        activeNavName="Fleet Dashboard"
        onNavigate={onNavigate}
        actions={(
          <button className="secondary-button" type="button" disabled={exporting} onClick={handleExport}>
            <Download size={14} /> Export classic lists
          </button>
        )}
      >
        {loading ? (
          <div className="inspections-loading-state" role="status"><p>Loading fleet dashboard...</p></div>
        ) : null}
        {!loading && error ? (
          <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div>
        ) : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && !error ? (
          <>
            <div className="inspections-kpi-grid">
              {[
                ["Total assets", metrics.total],
                ["In service", metrics.inService],
                ["Out of service", metrics.outOfService],
                ["Reserve", metrics.reserve],
                ["Restricted", metrics.restricted],
                ["PM due", metrics.pmDue],
              ].map(([label, value]) => (
                <article key={label} className="inspections-kpi-card">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>

            {metrics.total === 0 ? (
              <FleetEmptyState
                title="No fleet assets yet"
                description="Open All Fleet Assets to import from the classic Apparatus list, or add assets manually."
                icon={Truck}
              />
            ) : (
              <section className="panel inspections-panel">
                <header>
                  <div><strong>Fleet snapshot</strong></div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => onNavigate?.("All Fleet Assets")}
                  >
                    View all assets
                  </button>
                </header>
                <div className="panel-body">
                  <p className="occupancy-muted">
                    Showing {metrics.total} asset{metrics.total === 1 ? "" : "s"} in the Fleet master collection.
                    The classic Apparatus, Maintenance and Assets pages stay available until your department switches over to Fleet.
                  </p>
                </div>
              </section>
            )}
          </>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
