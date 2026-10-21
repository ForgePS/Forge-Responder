import { useEffect, useMemo, useState } from "react";
import { MapPin, QrCode, Radio, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import {
  canViewPreplans,
  getDepartmentPreplanFeatures,
  getPreplanOfflineFlushPlan,
  isPreplanFeatureEnabled,
  listPreplans,
} from "../lib/inspections/index.js";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionsModuleLayout from "../components/inspections/InspectionsModuleLayout.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";

/**
 * Phase 6/7 operational surfaces — Nearby / District / Target Hazards / Offline / QR.
 * Full maps + offline flush land in later hardening; this is the gated shell.
 */
export default function PreplanOperationalPage({
  onNavigate,
  variant = "operational",
  title = "Operational Preplans",
  description = "Field-facing preplan summary for response.",
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user } = useAuth();
  const allowed = canViewPreplans(permissions, isCreator);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
  const [features, setFeatures] = useState(null);
  const [flushPlan, setFlushPlan] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!departmentId || !allowed) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [rows, nextFeatures] = await Promise.all([
          listPreplans(departmentId, { openOnly: false }),
          getDepartmentPreplanFeatures(departmentId),
        ]);
        if (cancelled) return;
        setRecords(rows);
        setFeatures(nextFeatures);
        setFlushPlan(getPreplanOfflineFlushPlan(departmentId));
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "Unable to load operational preplans.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [departmentId, allowed]);

  const filtered = useMemo(() => {
    if (variant === "targetHazards") {
      return records.filter((row) => (
        row.priority === "target_hazard"
        || /critical|target/i.test(String(row.riskLevel || ""))
      ));
    }
    if (variant === "approved") {
      return records.filter((row) => ["approved", "published", "operational"].includes(row.status));
    }
    if (variant === "offline") {
      return records.filter((row) => ["published", "operational"].includes(row.status));
    }
    return records.filter((row) => ["published", "operational", "approved"].includes(row.status));
  }, [records, variant]);

  const offlineEnabled = isPreplanFeatureEnabled(features || {}, "offlineAccess");
  const qrEnabled = isPreplanFeatureEnabled(features || {}, "qrCodes");
  const mapEnabled = isPreplanFeatureEnabled(features || {}, "mapIntegration");

  return (
    <InspectionPermissionGate allowed={allowed} title={title}>
      <InspectionsModuleLayout
        title={title}
        description={description}
        activeNavName={title}
        onNavigate={onNavigate}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {loading ? <p className="occupancy-muted">Loading…</p> : null}

        {!loading && variant === "offline" ? (
          <section className="panel">
            <header>
              <div><Radio size={15} /><strong>Offline sync</strong></div>
            </header>
            <div className="panel-body">
              {!offlineEnabled ? (
                <p className="occupancy-muted">Offline access is disabled for this department.</p>
              ) : (
                <>
                  <p className="occupancy-muted">
                    Queued mutations: {flushPlan?.queued || 0} · Local drafts: {flushPlan?.drafts || 0}
                  </p>
                  <p className="occupancy-muted">{flushPlan?.note}</p>
                </>
              )}
            </div>
          </section>
        ) : null}

        {!loading && variant === "qr" ? (
          <section className="panel">
            <header>
              <div><QrCode size={15} /><strong>QR access</strong></div>
            </header>
            <div className="panel-body">
              {!qrEnabled ? (
                <p className="occupancy-muted">QR codes are disabled for this department.</p>
              ) : (
                <p className="occupancy-muted">
                  Authenticated QR tokens are managed from the preplan detail workspace (Phase 5).
                  Tokens are hashed at rest; raw IDs are never used as scan credentials.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {!loading && variant === "nearby" && !mapEnabled ? (
          <p className="occupancy-muted">Map integration is disabled. Showing operational list without map overlay.</p>
        ) : null}

        {!loading ? (
          <section className="panel">
            <header>
              <div>
                {variant === "targetHazards" ? <ShieldAlert size={15} /> : <MapPin size={15} />}
                <strong>{filtered.length} preplan(s)</strong>
              </div>
            </header>
            <div className="panel-body">
              {!filtered.length ? (
                <InspectionEmptyState
                  title="No operational preplans"
                  description="Publish or approve preplans to surface them here. Use the work queue to manage drafts."
                />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Number</span>
                    <span>Facility</span>
                    <span>Status</span>
                    <span>Risk</span>
                    <span>Station</span>
                  </div>
                  {filtered.map((row) => (
                    <div key={row.id} className="cert-row">
                      <strong>{row.preplanNumber}</strong>
                      <span>{row.facilityName || row.occupancyName || row.address || "—"}</span>
                      <span>{row.status}</span>
                      <span>{row.riskLevel}</span>
                      <span>{row.stationId || row.responsibleStation || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && user?.uid ? (
          <p className="occupancy-muted">Signed in as operational viewer · department {departmentId}</p>
        ) : null}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
