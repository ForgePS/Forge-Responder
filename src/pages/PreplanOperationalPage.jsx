import { useEffect, useMemo, useState } from "react";
import { MapPin, Radio, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import {
  canViewPreplans,
  getDepartmentPreplanFeatures,
  getPreplanOfflineFlushPlan,
  isPreplanFeatureEnabled,
  labelForPreplanStatus,
  listPreplans,
} from "../lib/inspections/index.js";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionsModuleLayout from "../components/inspections/InspectionsModuleLayout.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";

/**
 * Operational preplan lists — Target Hazards / Offline.
 * "nearby" and "qr" are not built yet (no location/map, nothing scans a QR
 * code); their menu items are hidden and, if reached directly, the page says
 * so plainly instead of showing a placeholder.
 */
const NOT_BUILT_VARIANTS = new Set(["nearby", "qr"]);
export default function PreplanOperationalPage({
  onNavigate,
  variant = "operational",
  title = "Operational Preplans",
  description = "Field-facing preplan summary for response.",
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator } = useAuth();
  const notBuilt = NOT_BUILT_VARIANTS.has(variant);
  const allowed = canViewPreplans(permissions, isCreator);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
  const [features, setFeatures] = useState(null);
  const [flushPlan, setFlushPlan] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!departmentId || !allowed || notBuilt) {
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
  }, [departmentId, allowed, notBuilt]);

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
                    Changes waiting to sync: {flushPlan?.queued || 0} · Drafts saved on this device: {flushPlan?.drafts || 0}
                  </p>
                </>
              )}
            </div>
          </section>
        ) : null}

        {notBuilt ? (
          <InspectionEmptyState
            title="Not available yet"
            description="This preplan view is not built yet. Use All Preplans or Target Hazards to find a preplan."
          />
        ) : null}

        {!loading && !notBuilt ? (
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
                      <span>{labelForPreplanStatus(row.status)}</span>
                      <span>{row.riskLevel || "—"}</span>
                      <span>{row.stationId || row.responsibleStation || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
