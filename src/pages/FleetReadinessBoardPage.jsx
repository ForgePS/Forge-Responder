import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import FleetCheckConductPanel from "../components/fleet/FleetCheckConductPanel.jsx";
import {
  buildReadinessBoard,
  canViewFleetReadiness,
  ensureFleetAssets,
} from "../lib/fleet/index.js";

export default function FleetReadinessBoardPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetReadiness(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState({ cards: [], summary: {}, stations: [] });
  const [stationFilter, setStationFilter] = useState("");
  const [activeCard, setActiveCard] = useState(null);

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
      await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const next = await buildReadinessBoard(departmentId, {
        station: stationFilter || undefined,
      });
      setBoard(next);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load readiness board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, stationFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const card of board.cards || []) {
      const key = card.station || "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(card);
    }
    return [...map.entries()];
  }, [board.cards]);

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Readiness Board"
        description="Station-ready view of unit status, last check, meters, and open readiness checks."
        activeNavName="Readiness Board"
        onNavigate={onNavigate}
        actions={(
          <button className="secondary-button" type="button" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        )}
      >
        {loading ? (
          <div className="inspections-loading-state" role="status"><p>Loading readiness board...</p></div>
        ) : null}
        {!loading && error ? (
          <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div>
        ) : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && !error ? (
          <>
            <div className="inspections-kpi-grid">
              {[
                ["Total", board.summary.total || 0],
                ["Available", board.summary.available || 0],
                ["Restricted", board.summary.restricted || 0],
                ["Out of service", board.summary.outOfService || 0],
                ["PM due", board.summary.maintenanceDue || 0],
                ["Checks open", board.summary.checksInProgress || 0],
              ].map(([label, value]) => (
                <article key={label} className="inspections-kpi-card">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>

            <div className="occupancy-detail-actions" style={{ marginBottom: "12px" }}>
              <label className="config-field">
                <span>Station filter</span>
                <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
                  <option value="">All stations</option>
                  {(board.stations || []).map((station) => (
                    <option key={station} value={station}>{station}</option>
                  ))}
                </select>
              </label>
            </div>

            {!board.cards?.length ? (
              <FleetEmptyState
                title="No fleet assets on the board"
                description="Import apparatus into All Fleet Assets, then return here to run readiness checks."
                icon={ClipboardCheck}
              />
            ) : (
              grouped.map(([station, cards]) => (
                <section key={station} className="panel" style={{ marginBottom: "12px" }}>
                  <header>
                    <div><strong>{station}</strong></div>
                    <span className="inspections-count">{cards.length}</span>
                  </header>
                  <div className="panel-body readiness-card-grid">
                    {cards.map((card) => (
                      <article key={card.assetId} className="readiness-unit-card">
                        <header>
                          <strong>{card.fleetNumber || card.unitDesignation}</strong>
                          <FleetStatusBadge status={card.readinessState} />
                        </header>
                        <p className="occupancy-muted">{card.type}</p>
                        <div className="readiness-unit-metrics">
                          <span>Score <strong>{card.readinessScore}</strong></span>
                          <span>Miles <strong>{card.mileage || "—"}</strong></span>
                          <span>Fuel <strong>{card.fuel || "—"}</strong></span>
                          <span>Defects <strong>{card.openDefectCount || 0}</strong></span>
                        </div>
                        {card.criticalDefectCount ? (
                          <p className="occupancy-muted">Critical/high defects: {card.criticalDefectCount}</p>
                        ) : null}
                        {card.activeRestriction ? (
                          <p className="occupancy-muted">Restriction: {card.activeRestriction}</p>
                        ) : null}
                        <p className="occupancy-muted">
                          Last check: {card.lastCheckAt
                            ? new Date(card.lastCheckAt).toLocaleString()
                            : "None"}
                          {card.lastCheckResult ? ` · ${card.lastCheckResult}` : ""}
                        </p>
                        <div className="occupancy-detail-actions">
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => setActiveCard(card)}
                          >
                            <ClipboardCheck size={14} />
                            {card.openCheckId ? "Resume check" : "Open check"}
                          </button>
                          {(card.openDefectCount > 0 || card.readinessState === "out_of_service" || card.readinessState === "available_restricted") ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => onNavigate?.("Fleet Defects")}
                            >
                              View defects
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}

            {activeCard ? (
              <FleetCheckConductPanel
                departmentId={departmentId}
                asset={activeCard}
                actor={actor}
                permissions={permissions}
                isCreator={isCreator}
                onClose={() => setActiveCard(null)}
                onCompleted={() => {
                  setActiveCard(null);
                  reload();
                }}
                onMessage={setMessage}
                onError={setError}
              />
            ) : null}
          </>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
