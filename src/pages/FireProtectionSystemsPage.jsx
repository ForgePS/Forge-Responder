import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CirclePlus,
  ClipboardCheck,
  Flame,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout from "../components/inspections/InspectionsModuleLayout.jsx";
import {
  canEditFireProtectionSystems,
  canViewFireProtectionSystems,
  convertFpsDeficiencyToViolation,
  createFpsDeficiency,
  createFpsImpairment,
  createFpsTestReport,
  ensureOccupancyRecords,
  getFpsSystemTypeOptions,
  labelForFpsContractorStatus,
  labelForFpsDeficiencyStatus,
  labelForFpsImpairmentStatus,
  labelForFpsSystemStatus,
  labelForFpsTestResult,
  loadFpsBoard,
  restoreFpsImpairment,
  reviewFpsTestReport,
  saveFireProtectionSystem,
  saveFpsContractor,
} from "../lib/inspections/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

const TABS = [
  { id: "systems", label: "Systems" },
  { id: "tests", label: "Test reports" },
  { id: "impairments", label: "Impairments" },
  { id: "deficiencies", label: "Deficiencies" },
  { id: "contractors", label: "Contractors" },
];

const OCCUPANCY_SESSION_KEY = "forge-fps-filter-occupancy";

function readOccupancyFilter(initialOccupancyId = "") {
  if (initialOccupancyId) return initialOccupancyId;
  if (typeof sessionStorage === "undefined") return "";
  try {
    const value = sessionStorage.getItem(OCCUPANCY_SESSION_KEY) || "";
    sessionStorage.removeItem(OCCUPANCY_SESSION_KEY);
    return value;
  } catch {
    return "";
  }
}

export default function FireProtectionSystemsPage({
  onNavigate,
  query = "",
  initialOccupancyId = "",
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFireProtectionSystems(permissions, isCreator);
  const canEdit = canEditFireProtectionSystems(permissions, isCreator);

  const [occupancyFilter, setOccupancyFilter] = useState(() => readOccupancyFilter(initialOccupancyId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("systems");
  const [board, setBoard] = useState(null);
  const [occupancies, setOccupancies] = useState([]);
  const [selectedSystemId, setSelectedSystemId] = useState("");
  const [modal, setModal] = useState("");

  const [systemDraft, setSystemDraft] = useState({
    name: "",
    systemTypeId: "sprinkler",
    occupancyId: occupancyFilter || "",
    manufacturer: "",
    model: "",
    status: "active",
  });
  const [testDraft, setTestDraft] = useState({
    systemId: "",
    result: "pass",
    testedAt: "",
    summary: "",
  });
  const [impairmentDraft, setImpairmentDraft] = useState({
    systemId: "",
    reason: "",
    fireWatchRequired: true,
    expectedRestoreAt: "",
  });
  const [deficiencyDraft, setDeficiencyDraft] = useState({
    systemId: "",
    description: "",
    correctiveAction: "",
    severity: "moderate",
    dueAt: "",
  });
  const [contractorDraft, setContractorDraft] = useState({
    name: "",
    licenseNumber: "",
    contactName: "",
    phone: "",
    email: "",
    status: "pending_verification",
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };
  const systemTypes = getFpsSystemTypeOptions();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextBoard, nextOccupancies] = await Promise.all([
        loadFpsBoard(departmentId),
        ensureOccupancyRecords(departmentId, [], actor),
      ]);
      setBoard(nextBoard);
      setOccupancies(nextOccupancies);
      setSelectedSystemId((current) => current || nextBoard.systems[0]?.id || "");
      setSystemDraft((current) => ({
        ...current,
        occupancyId: current.occupancyId || occupancyFilter || nextOccupancies[0]?.id || "",
      }));
      setTestDraft((current) => ({
        ...current,
        systemId: current.systemId || nextBoard.systems[0]?.id || "",
      }));
      setImpairmentDraft((current) => ({
        ...current,
        systemId: current.systemId || nextBoard.systems[0]?.id || "",
      }));
      setDeficiencyDraft((current) => ({
        ...current,
        systemId: current.systemId || nextBoard.systems[0]?.id || "",
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load fire protection systems.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialOccupancyId) setOccupancyFilter(initialOccupancyId);
  }, [initialOccupancyId]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, occupancyFilter]);

  const metrics = board?.metrics || {};
  const needle = String(query || "").trim().toLowerCase();
  const occupancyName = useMemo(
    () => occupancies.find((row) => row.id === occupancyFilter)?.name || occupancyFilter,
    [occupancies, occupancyFilter]
  );
  const systems = useMemo(() => {
    let rows = board?.systems || [];
    if (occupancyFilter) rows = rows.filter((row) => row.occupancyId === occupancyFilter);
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle));
  }, [board, needle, occupancyFilter]);

  const selectedSystem = useMemo(
    () => (board?.systems || []).find((row) => row.id === selectedSystemId) || null,
    [board, selectedSystemId]
  );

  async function run(fn, success) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setModal("");
      await reload();
    } catch (actionError) {
      setError(actionError?.message || "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={allowed} title="Fire Protection Systems">
      <InspectionsModuleLayout
        title="Fire Protection Systems"
        description="System inventory, contractor test reports, impairments, and deficiency conversion."
        activeNavName="Fire Protection Systems"
        onNavigate={onNavigate}
        tabs={[
          { id: "fps", label: "Fire Protection Systems", navName: "Fire Protection Systems" },
          { id: "occupancies", label: "Occupancies", navName: "Occupancies" },
          { id: "enforcement", label: "Enforcement Cases", navName: "Enforcement Cases" },
        ]}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button className="primary-button" type="button" onClick={() => setModal("system")}>
              <CirclePlus size={14} /> Add system
            </button>
            <button className="secondary-button" type="button" onClick={() => setModal("test")}>
              <ClipboardCheck size={14} /> Log test
            </button>
          </div>
        ) : null}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}
        {occupancyFilter ? (
          <p className="occupancy-message">
            Filtered to occupancy: <strong>{occupancyName || occupancyFilter}</strong>{" "}
            <button className="link-button" type="button" onClick={() => setOccupancyFilter("")}>
              Clear filter
            </button>
          </p>
        ) : null}
        {loading ? <p className="occupancy-muted">Loading systems…</p> : null}

        {!loading ? (
          <div className="inspections-kpi-grid">
            {[
              ["Systems", metrics.systems || 0],
              ["Impaired", metrics.impaired || 0],
              ["Active impairments", metrics.activeImpairments || 0],
              ["Open deficiencies", metrics.openDeficiencies || 0],
              ["Reports pending", metrics.reportsPending || 0],
              ["Active contractors", metrics.contractorsActive || 0],
            ].map(([label, value]) => (
              <div key={label} className="inspections-kpi-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="FPS sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inspections-subnav-item${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}

        {modal === "system" && canEdit ? (
          <section className="panel">
            <header><div><Flame size={15} /><strong>Add fire protection system</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name">
                <input value={systemDraft.name} onChange={(e) => setSystemDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Type">
                <select value={systemDraft.systemTypeId} onChange={(e) => setSystemDraft((c) => ({ ...c, systemTypeId: e.target.value }))}>
                  {systemTypes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Occupancy" wide>
                <select value={systemDraft.occupancyId} onChange={(e) => setSystemDraft((c) => ({ ...c, occupancyId: e.target.value }))}>
                  {occupancies.map((row) => (
                    <option key={row.id} value={row.id}>{row.name} — {row.address || "No address"}</option>
                  ))}
                </select>
              </Field>
              <Field label="Manufacturer">
                <input value={systemDraft.manufacturer} onChange={(e) => setSystemDraft((c) => ({ ...c, manufacturer: e.target.value }))} />
              </Field>
              <Field label="Model">
                <input value={systemDraft.model} onChange={(e) => setSystemDraft((c) => ({ ...c, model: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !systemDraft.name}
                  onClick={() => run(async () => {
                    const occupancy = occupancies.find((row) => row.id === systemDraft.occupancyId);
                    await saveFireProtectionSystem(departmentId, {
                      ...systemDraft,
                      occupancyName: occupancy?.name || "",
                      address: occupancy?.address || "",
                    }, actor);
                  }, "System created.")}
                >
                  Save system
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "test" && canEdit ? (
          <section className="panel">
            <header><div><ClipboardCheck size={15} /><strong>Log test report</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="System" wide>
                <select value={testDraft.systemId} onChange={(e) => setTestDraft((c) => ({ ...c, systemId: e.target.value }))}>
                  {(board?.systems || []).map((row) => (
                    <option key={row.id} value={row.id}>{row.systemNumber} — {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tested date">
                <input type="date" value={testDraft.testedAt} onChange={(e) => setTestDraft((c) => ({ ...c, testedAt: e.target.value }))} />
              </Field>
              <Field label="Result">
                <select value={testDraft.result} onChange={(e) => setTestDraft((c) => ({ ...c, result: e.target.value }))}>
                  {["pass", "pass_with_deficiencies", "fail", "incomplete"].map((id) => (
                    <option key={id} value={id}>{labelForFpsTestResult(id)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Summary" wide>
                <textarea rows={2} value={testDraft.summary} onChange={(e) => setTestDraft((c) => ({ ...c, summary: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !testDraft.systemId}
                  onClick={() => run(
                    () => createFpsTestReport(departmentId, testDraft, actor),
                    "Test report logged."
                  )}
                >
                  Save report
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "impairment" && canEdit ? (
          <section className="panel">
            <header><div><ShieldAlert size={15} /><strong>Record impairment</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="System" wide>
                <select value={impairmentDraft.systemId} onChange={(e) => setImpairmentDraft((c) => ({ ...c, systemId: e.target.value }))}>
                  {(board?.systems || []).map((row) => (
                    <option key={row.id} value={row.id}>{row.systemNumber} — {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Expected restore">
                <input type="date" value={impairmentDraft.expectedRestoreAt} onChange={(e) => setImpairmentDraft((c) => ({ ...c, expectedRestoreAt: e.target.value }))} />
              </Field>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={impairmentDraft.fireWatchRequired}
                  onChange={(e) => setImpairmentDraft((c) => ({ ...c, fireWatchRequired: e.target.checked }))}
                />
                Fire watch required
              </label>
              <Field label="Reason" wide>
                <textarea rows={2} value={impairmentDraft.reason} onChange={(e) => setImpairmentDraft((c) => ({ ...c, reason: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !impairmentDraft.systemId}
                  onClick={() => run(
                    () => createFpsImpairment(departmentId, impairmentDraft, actor),
                    "Impairment recorded."
                  )}
                >
                  Record impairment
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "deficiency" && canEdit ? (
          <section className="panel">
            <header><div><AlertTriangle size={15} /><strong>Add deficiency</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="System" wide>
                <select value={deficiencyDraft.systemId} onChange={(e) => setDeficiencyDraft((c) => ({ ...c, systemId: e.target.value }))}>
                  {(board?.systems || []).map((row) => (
                    <option key={row.id} value={row.id}>{row.systemNumber} — {row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Severity">
                <select value={deficiencyDraft.severity} onChange={(e) => setDeficiencyDraft((c) => ({ ...c, severity: e.target.value }))}>
                  {["low", "moderate", "high", "immediate"].map((level) => <option key={level}>{level}</option>)}
                </select>
              </Field>
              <Field label="Due date">
                <input type="date" value={deficiencyDraft.dueAt} onChange={(e) => setDeficiencyDraft((c) => ({ ...c, dueAt: e.target.value }))} />
              </Field>
              <Field label="Description" wide>
                <textarea rows={2} value={deficiencyDraft.description} onChange={(e) => setDeficiencyDraft((c) => ({ ...c, description: e.target.value }))} />
              </Field>
              <Field label="Corrective action" wide>
                <textarea rows={2} value={deficiencyDraft.correctiveAction} onChange={(e) => setDeficiencyDraft((c) => ({ ...c, correctiveAction: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !deficiencyDraft.systemId || !deficiencyDraft.description}
                  onClick={() => run(
                    () => createFpsDeficiency(departmentId, deficiencyDraft, actor),
                    "Deficiency created."
                  )}
                >
                  Save deficiency
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "contractor" && canEdit ? (
          <section className="panel">
            <header><div><Users size={15} /><strong>Register contractor</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Company name">
                <input value={contractorDraft.name} onChange={(e) => setContractorDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="License #">
                <input value={contractorDraft.licenseNumber} onChange={(e) => setContractorDraft((c) => ({ ...c, licenseNumber: e.target.value }))} />
              </Field>
              <Field label="Contact">
                <input value={contractorDraft.contactName} onChange={(e) => setContractorDraft((c) => ({ ...c, contactName: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <input value={contractorDraft.phone} onChange={(e) => setContractorDraft((c) => ({ ...c, phone: e.target.value }))} />
              </Field>
              <Field label="Email" wide>
                <input value={contractorDraft.email} onChange={(e) => setContractorDraft((c) => ({ ...c, email: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !contractorDraft.name}
                  onClick={() => run(
                    () => saveFpsContractor(departmentId, contractorDraft, actor),
                    "Contractor registered."
                  )}
                >
                  Save contractor
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "systems" ? (
          <div className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><Flame size={15} /><strong>System inventory</strong></div></header>
              <div className="panel-body">
                {!systems.length ? (
                  <InspectionEmptyState
                    title="No systems yet"
                    description="Add sprinkler, alarm, pump, and other fire protection systems linked to occupancies."
                    action={canEdit ? (
                      <button className="primary-button" type="button" onClick={() => setModal("system")}>Add system</button>
                    ) : null}
                  />
                ) : (
                  <div className="personnel-list">
                    {systems.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className={row.id === selectedSystem?.id ? "person-row selected" : "person-row"}
                        onClick={() => setSelectedSystemId(row.id)}
                      >
                        <span>
                          <strong>{row.systemNumber}</strong>
                          <small className="occupancy-muted"> {row.name}</small>
                        </span>
                        <InspectionStatusBadge status={labelForFpsSystemStatus(row.status)} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {selectedSystem ? (
              <section className="panel occupancy-detail-panel">
                <header>
                  <div>
                    <Flame size={15} />
                    <strong>{selectedSystem.name}</strong>
                    <small className="occupancy-muted"> {selectedSystem.systemNumber}</small>
                  </div>
                  <InspectionStatusBadge status={labelForFpsSystemStatus(selectedSystem.status)} />
                </header>
                <div className="panel-body occupancy-detail-body">
                  <div className="occupancy-form-grid">
                    <div><span className="occupancy-muted">Type</span><strong>{systemTypes.find((t) => t.id === selectedSystem.systemTypeId)?.label || selectedSystem.systemTypeId}</strong></div>
                    <div><span className="occupancy-muted">Occupancy</span><strong>{selectedSystem.occupancyName || "—"}</strong></div>
                    <div><span className="occupancy-muted">Manufacturer</span><strong>{selectedSystem.manufacturer || "—"}</strong></div>
                    <div><span className="occupancy-muted">Model</span><strong>{selectedSystem.model || "—"}</strong></div>
                    <div><span className="occupancy-muted">Last test</span><strong>{formatDate(selectedSystem.lastTestAt)}</strong></div>
                    <div><span className="occupancy-muted">Next test</span><strong>{formatDate(selectedSystem.nextTestAt)}</strong></div>
                  </div>
                  {canEdit ? (
                    <div className="occupancy-detail-actions">
                      <button className="secondary-button" type="button" onClick={() => {
                        setTestDraft((c) => ({ ...c, systemId: selectedSystem.id }));
                        setModal("test");
                      }}>Log test</button>
                      <button className="secondary-button" type="button" onClick={() => {
                        setImpairmentDraft((c) => ({ ...c, systemId: selectedSystem.id }));
                        setModal("impairment");
                      }}>Record impairment</button>
                      <button className="secondary-button" type="button" onClick={() => {
                        setDeficiencyDraft((c) => ({ ...c, systemId: selectedSystem.id }));
                        setModal("deficiency");
                      }}>Add deficiency</button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {!loading && tab === "tests" ? (
          <section className="panel">
            <header>
              <div><ClipboardCheck size={15} /><strong>Test reports</strong></div>
              {canEdit ? <button className="secondary-button" type="button" onClick={() => setModal("test")}>Log test</button> : null}
            </header>
            <div className="panel-body">
              <p className="occupancy-muted">Staff-mediated contractor submissions. Public contractor portal deferred.</p>
              {!(board?.testReports || []).length ? (
                <InspectionEmptyState title="No test reports" description="Log annual / periodic system tests here." />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Report</span>
                    <span>System</span>
                    <span>Result</span>
                    <span>Tested</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {(board.testReports || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.reportNumber}</strong>
                      <span>{row.systemName || row.systemNumber}</span>
                      <span>{labelForFpsTestResult(row.result)}</span>
                      <span>{formatDate(row.testedAt)}</span>
                      <span>{row.status}</span>
                      <span className="occupancy-detail-actions">
                        {canEdit && ["submitted", "under_review"].includes(row.status) ? (
                          <>
                            <button className="text-button" type="button" disabled={saving} onClick={() => run(
                              () => reviewFpsTestReport(departmentId, row.id, { status: "accepted" }, actor),
                              "Report accepted."
                            )}>Accept</button>
                            <button className="text-button" type="button" disabled={saving} onClick={() => run(
                              () => reviewFpsTestReport(departmentId, row.id, { status: "rejected", reviewNotes: "Changes requested." }, actor),
                              "Report rejected."
                            )}>Reject</button>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "impairments" ? (
          <section className="panel">
            <header>
              <div><ShieldAlert size={15} /><strong>Impairments</strong></div>
              {canEdit ? <button className="secondary-button" type="button" onClick={() => setModal("impairment")}>Record impairment</button> : null}
            </header>
            <div className="panel-body">
              {!(board?.impairments || []).length ? (
                <InspectionEmptyState title="No impairments" description="Record temporary impairments and fire-watch requirements." />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Number</span>
                    <span>System</span>
                    <span>Status</span>
                    <span>Started</span>
                    <span>Fire watch</span>
                    <span>Actions</span>
                  </div>
                  {(board.impairments || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.impairmentNumber}</strong>
                      <span>{row.systemName}</span>
                      <span><InspectionStatusBadge status={labelForFpsImpairmentStatus(row.status)} /></span>
                      <span>{formatDate(row.startedAt)}</span>
                      <span>{row.fireWatchRequired ? "Yes" : "No"}</span>
                      <span>
                        {canEdit && ["active", "extended"].includes(row.status) ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => run(
                            () => restoreFpsImpairment(departmentId, row.id, "Restored", actor),
                            "Impairment restored."
                          )}>Restore</button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "deficiencies" ? (
          <section className="panel">
            <header>
              <div><AlertTriangle size={15} /><strong>Deficiencies</strong></div>
              {canEdit ? <button className="secondary-button" type="button" onClick={() => setModal("deficiency")}>Add deficiency</button> : null}
            </header>
            <div className="panel-body">
              {!(board?.deficiencies || []).length ? (
                <InspectionEmptyState title="No deficiencies" description="Track system deficiencies and convert them to code violations when needed." />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Number</span>
                    <span>System</span>
                    <span>Severity</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {(board.deficiencies || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.deficiencyNumber}</strong>
                      <span>{row.systemName}</span>
                      <span>{row.severity}</span>
                      <span><InspectionStatusBadge status={labelForFpsDeficiencyStatus(row.status)} /></span>
                      <span>
                        {canEdit && ["open", "under_repair"].includes(row.status) ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => run(
                            () => convertFpsDeficiencyToViolation(departmentId, row.id, {}, actor),
                            "Converted to violation."
                          )}>Convert to violation</button>
                        ) : row.violationId ? (
                          <span className="occupancy-muted">{row.violationId}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "contractors" ? (
          <section className="panel">
            <header>
              <div><Users size={15} /><strong>Contractors</strong></div>
              {canEdit ? <button className="secondary-button" type="button" onClick={() => setModal("contractor")}>Register</button> : null}
            </header>
            <div className="panel-body">
              <p className="occupancy-muted">Staff-mediated contractor registry. External self-registration portal deferred.</p>
              {!(board?.contractors || []).length ? (
                <InspectionEmptyState title="No contractors" description="Register service contractors for alarm, sprinkler, and suppression work." />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Name</span>
                    <span>License</span>
                    <span>Contact</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {(board.contractors || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.name}</strong>
                      <span>{row.licenseNumber || "—"}</span>
                      <span>{row.contactName || row.phone || "—"}</span>
                      <span><InspectionStatusBadge status={labelForFpsContractorStatus(row.status)} /></span>
                      <span>
                        {canEdit && row.status !== "active" ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => run(
                            () => saveFpsContractor(departmentId, { ...row, status: "active" }, actor),
                            "Contractor activated."
                          )}>Activate</button>
                        ) : null}
                        {canEdit && row.status === "active" ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => run(
                            () => saveFpsContractor(departmentId, { ...row, status: "suspended" }, actor),
                            "Contractor suspended."
                          )}>Suspend</button>
                        ) : null}
                      </span>
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
