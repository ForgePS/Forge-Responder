import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Store } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  applyVendorPortalAction,
  buildVendorPortalBoard,
  canEditFleetVendorPortal,
  canViewFleetVendorPortal,
  getVendorPortalActions,
  saveVendorPortalProfile,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetVendorPortalPage({ onNavigate }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetVendorPortal(permissions, isCreator);
  const canEdit = canEditFleetVendorPortal(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState(null);
  const [vendorId, setVendorId] = useState("");
  const [selectedWoId, setSelectedWoId] = useState("");
  const [estimate, setEstimate] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const actions = getVendorPortalActions();

  async function reload(nextVendorId = vendorId) {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await buildVendorPortalBoard(departmentId, nextVendorId);
      setBoard(next);
      const resolvedVendorId = next.vendor?.id || "";
      setVendorId(resolvedVendorId);
      setSelectedWoId((c) => c || next.workOrders[0]?.id || "");
    } catch (loadError) {
      setError(loadError?.message || "Unable to load vendor portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const selectedWo = useMemo(
    () => (board?.workOrders || []).find((row) => row.id === selectedWoId) || null,
    [board, selectedWoId]
  );

  return (
    <FleetPermissionGate allowed={allowed} title="Vendor Portal">
      <FleetModuleLayout
        title="Vendor Portal"
        description="Assigned vendor work: accept/reject, estimates, status, diagnosis, and invoice notes. Scopes are controlled per vendor."
        activeNavName="Vendor Portal"
        onNavigate={onNavigate}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading vendor portal...</p></div> : null}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        {message ? <div className="banner success" role="status">{message}</div> : null}

        {!loading && board ? (
          <>
            <section className="inspections-kpi-grid" style={{ marginBottom: "12px" }}>
              {[
                ["Vendors", board.summary.vendors, ""],
                ["Open work", board.summary.openWork, ""],
                ["Awaiting vendor", board.summary.awaitingVendor, board.summary.awaitingVendor ? "warn" : ""],
                ["Ready for QC", board.summary.readyForQc, ""],
              ].map(([label, value, tone]) => (
                <article className={`inspections-kpi${tone ? ` ${tone}` : ""}`} key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </section>

            <div className="inspections-header-actions" style={{ marginBottom: "12px" }}>
              <Field label="Vendor context">
                <select
                  value={vendorId}
                  onChange={async (e) => {
                    const nextId = e.target.value;
                    setVendorId(nextId);
                    await reload(nextId);
                  }}
                >
                  {(board.vendors || []).map((row) => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
              </Field>
              {canEdit && board.vendor ? (
                <label className="config-field" style={{ flexDirection: "row", gap: "8px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={board.vendor.portalEnabled !== false}
                    onChange={async (e) => {
                      setSaving(true);
                      try {
                        await saveVendorPortalProfile(departmentId, {
                          ...board.vendor,
                          portalEnabled: e.target.checked,
                        }, actor);
                        setMessage("Portal access updated.");
                        await reload(vendorId);
                      } catch (err) {
                        setError(err?.message || "Unable to update vendor.");
                      } finally {
                        setSaving(false);
                      }
                    }}
                  />
                  <span>Portal enabled</span>
                </label>
              ) : null}
            </div>
          </>
        ) : null}

        {!loading && board?.vendor ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><strong>Assigned work · {board.vendor.name}</strong></div>
                <span className="inspections-count">{board.workOrders.length}</span>
              </header>
              <div className="panel-body">
                {(board.workOrders || []).length ? (
                  <div className="list-select">
                    {board.workOrders.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={selectedWoId === item.id ? "active" : ""}
                        onClick={() => {
                          setSelectedWoId(item.id);
                          setEstimate(String(item.estimatedCost || ""));
                          setDiagnosis(item.diagnosis || "");
                          setInvoiceNote("");
                        }}
                      >
                        <strong>{item.workOrderNumber || item.id}</strong>
                        <span>{item.fleetNumber} · {item.complaint || item.category || "Work order"}</span>
                        <FleetStatusBadge status={item.status} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <FleetEmptyState title="No assigned work" description="Assign a vendor on a work order to make it appear here." icon={Store} />
                )}
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Portal actions</strong></div></header>
              <div className="panel-body">
                {selectedWo ? (
                  <>
                    <p><strong>{selectedWo.workOrderNumber}</strong> — {selectedWo.fleetNumber}</p>
                    <p className="muted">{selectedWo.complaint || "No complaint text."}</p>
                    <dl className="detail-grid">
                      <div><dt>Priority</dt><dd>{selectedWo.priority}</dd></div>
                      <div><dt>Status</dt><dd><FleetStatusBadge status={selectedWo.status} /></dd></div>
                      <div><dt>Estimate</dt><dd>{selectedWo.estimatedCost || 0}</dd></div>
                    </dl>
                    {canEdit ? (
                      <div className="config-grid" style={{ marginTop: "12px" }}>
                        <Field label="Estimate">
                          <input value={estimate} onChange={(e) => setEstimate(e.target.value)} />
                        </Field>
                        <Field label="Diagnosis / notes">
                          <textarea rows={3} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                        </Field>
                        <Field label="Invoice note">
                          <input value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)} />
                        </Field>
                        <div className="inspections-header-actions" style={{ gridColumn: "1 / -1", flexWrap: "wrap" }}>
                          {actions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              disabled={saving}
                              className={action.id === "ready" ? "primary-button" : undefined}
                              onClick={async () => {
                                setSaving(true);
                                setError("");
                                try {
                                  await applyVendorPortalAction(departmentId, vendorId, selectedWo.id, action.id, {
                                    estimatedCost: estimate,
                                    diagnosis,
                                    invoiceNote,
                                  }, actor);
                                  setMessage(`${action.label} applied.`);
                                  await reload(vendorId);
                                } catch (err) {
                                  setError(err?.message || "Portal action failed.");
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              {action.id === "estimate" ? <CirclePlus size={14} /> : null} {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="muted">Select a work order.</p>
                )}
              </div>
            </section>
          </section>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
