import { useCallback, useEffect, useMemo, useState } from "react";
import AlertDashboardView from "../components/digitalDashboard/AlertDashboardView.jsx";
import { defaultAlertDashboardConfig } from "../lib/alertDashboard.js";
import { loadPublicAlertDashboard } from "../lib/alertDashboardPublicService.js";
import { parseAlertDashboardGatewaySlug } from "../lib/gatewayRouting.js";
import "../theme/alert-dashboard.css";

function readDisplayId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("display") || "";
}

export default function PublicAlertDashboardPage() {
  const gatewaySlug = useMemo(
    () => parseAlertDashboardGatewaySlug(window.location.pathname),
    []
  );
  const displayId = useMemo(() => readDisplayId(), []);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!gatewaySlug) {
      setError("Invalid alert dashboard URL.");
      setLoading(false);
      return;
    }
    try {
      const data = await loadPublicAlertDashboard(gatewaySlug);
      setPayload(data);
      setError("");
    } catch (err) {
      const message = err?.message || err?.details || "Unable to load alert dashboard.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [gatewaySlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const config = useMemo(() => {
    const items = payload?.configItems || [];
    const saved = items.find((item) => item.id === "config") || items[0];
    return defaultAlertDashboardConfig(saved || {});
  }, [payload?.configItems]);

  useEffect(() => {
    if (!gatewaySlug || loading) return undefined;
    const intervalSec = Number(config.autoSyncIntervalSec) || 90;
    const timer = window.setInterval(refresh, intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [gatewaySlug, loading, config.autoSyncIntervalSec, refresh]);

  if (loading) {
    return (
      <div className="alert-dashboard-page alert-dashboard alert-dashboard-standby">
        <div className="alert-dashboard-standby-card">
          <h1>FORGE Alert Dashboard</h1>
          <p>Loading dispatch display…</p>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="alert-dashboard-page alert-dashboard alert-dashboard-standby">
        <div className="alert-dashboard-standby-card">
          <h1>FORGE Alert Dashboard</h1>
          <p className="alert-dashboard-error-inline">{error || "Alert dashboard is unavailable."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="alert-dashboard-page">
      <AlertDashboardView
        departmentId={payload.departmentId}
        gatewaySlug={gatewaySlug}
        profile={{
          ...payload.profile,
          name: payload.departmentName,
          logoUrl: payload.logoUrl,
        }}
        alerts={payload.alerts}
        config={config}
        businessDirectory={payload.businessDirectory}
        displays={payload.displays}
        displayId={displayId}
        mapsApiKey={payload.mapsJsApiKey}
        publicMode
      />
    </div>
  );
}
