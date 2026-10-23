import { useEffect, useMemo, useState } from "react";
import { Award, CirclePlus, ClipboardCheck, Gauge } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  buildTestComplianceBoard,
  canEditFleetTests,
  canViewFleetTests,
  ensureFleetAssets,
  recordFleetTest,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetTestsPage({
  query = "",
  onNavigate,
  legacyApparatus = [],
  legacyHoseTests = [],
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetTests(permissions, isCreator);
  const canEdit = canEditFleetTests(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [programs, setPrograms] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    fleetAssetId: "",
    programId: "",
    section: "",
    result: "pass",
    tester: "",
    certificateNumber: "",
    certificateIssuer: "",
    notes: "",
  });

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
      const nextAssets = await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const board = await buildTestComplianceBoard(departmentId, legacyHoseTests, actor);
      setAssets(nextAssets);
      setRows(board.rows);
      setSummary(board.summary);
      setPrograms(board.programs);
      setSelectedId((current) => current || board.rows[0]?.id || "");
      setDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        programId: c.programId || board.programs[0]?.id || "",
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load fleet tests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId]
  );

  const visible = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => (
      [row.testNumber, row.fleetNumber, row.programName, row.section, row.result, row.status, row.certificateNumber]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ));
  }, [rows, query]);

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Fleet Tests"
        description="Testing programs, certificates, and compliance — including migrated hose tests."
        activeNavName="Fleet Tests"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
            <CirclePlus size={14} /> Record test
          </button>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading tests...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading ? (
          <section className="fleet-summary">
            {[
              ["Current", summary.current || 0, "success"],
              ["Due soon", summary.dueSoon || 0, "warning"],
              ["Overdue", summary.overdue || 0, "critical"],
              ["Failed", summary.failed || 0, "critical"],
              ["Certificates", summary.certificates || 0, "info"],
              ["Programs", summary.programs || 0, "info"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
        ) : null}

        {!loading && !rows.length ? (
          <FleetEmptyState
            title="No test records"
            description="Record a test or migrate classic Hose Testing records (auto-imports when empty)."
            icon={Gauge}
          />
        ) : null}

        {!loading && rows.length ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><ClipboardCheck size={15} /><strong>Compliance</strong></div>
                <span className="inspections-count">{visible.length}</span>
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {visible.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedId ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>
                        <strong>{item.fleetNumber || "No unit"}</strong>
                        <small>
                          {item.programName}
                          {item.section ? ` · ${item.section}` : ""}
                          {" · "}
                          {item.complianceLabel}
                        </small>
                      </span>
                      <FleetStatusBadge status={item.status} />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {selected ? (
              <section className="panel">
                <header>
                  <div><strong>{selected.testNumber}</strong></div>
                  <FleetStatusBadge status={selected.result} />
                </header>
                <div className="panel-body config-studio-body">
                  <div className="occupancy-form-grid">
                    <div><span className="occupancy-muted">Unit</span><strong>{selected.fleetNumber || "—"}</strong></div>
                    <div><span className="occupancy-muted">Program</span><strong>{selected.programName || "—"}</strong></div>
                    <div><span className="occupancy-muted">Standard</span><strong>{selected.standardReference || "—"}</strong></div>
                    <div><span className="occupancy-muted">Section</span><strong>{selected.section || "—"}</strong></div>
                    <div><span className="occupancy-muted">Test date</span><strong>{selected.testDate || "—"}</strong></div>
                    <div><span className="occupancy-muted">Next due</span><strong>{selected.nextDue || "—"}</strong></div>
                    <div><span className="occupancy-muted">Result</span><strong>{selected.result}</strong></div>
                    <div><span className="occupancy-muted">Compliance</span><strong>{selected.complianceLabel}</strong></div>
                  </div>

                  {(selected.certificateNumber || selected.certificateIssuer || selected.certificateExpiresAt) ? (
                    <section className="occupancy-section">
                      <header><div><Award size={15} /><strong>Certificate</strong></div></header>
                      <div className="occupancy-form-grid">
                        <div><span className="occupancy-muted">Number</span><strong>{selected.certificateNumber || "—"}</strong></div>
                        <div><span className="occupancy-muted">Issuer</span><strong>{selected.certificateIssuer || "—"}</strong></div>
                        <div><span className="occupancy-muted">Expires</span><strong>{selected.certificateExpiresAt || "—"}</strong></div>
                      </div>
                    </section>
                  ) : selected.certificateRequired ? (
                    <p className="occupancy-muted">Certificate required for this program — none on file.</p>
                  ) : null}

                  {selected.notes ? <p>{selected.notes}</p> : null}
                  {selected.defectId ? (
                    <p className="occupancy-muted">
                      Linked defect: {selected.defectId}{" "}
                      <button className="text-button" type="button" onClick={() => onNavigate?.("Fleet Defects")}>
                        Open defects
                      </button>
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {showCreate ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header>
                <strong>Record test</strong>
                <button type="button" onClick={() => setShowCreate(false)}>×</button>
              </header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select
                    value={draft.fleetAssetId}
                    onChange={(e) => setDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}
                  >
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>{asset.fleetNumber || asset.id}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Program">
                  <select
                    value={draft.programId}
                    onChange={(e) => setDraft((c) => ({ ...c, programId: e.target.value }))}
                  >
                    {programs.map((program) => (
                      <option key={program.id} value={program.id}>{program.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Section / component">
                  <input value={draft.section} onChange={(e) => setDraft((c) => ({ ...c, section: e.target.value }))} />
                </Field>
                <Field label="Result">
                  <select value={draft.result} onChange={(e) => setDraft((c) => ({ ...c, result: e.target.value }))}>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                    <option value="conditional">Conditional</option>
                    <option value="pending">Pending</option>
                  </select>
                </Field>
                <Field label="Tester">
                  <input value={draft.tester} onChange={(e) => setDraft((c) => ({ ...c, tester: e.target.value }))} />
                </Field>
                <Field label="Certificate #">
                  <input value={draft.certificateNumber} onChange={(e) => setDraft((c) => ({ ...c, certificateNumber: e.target.value }))} />
                </Field>
                <Field label="Certificate issuer">
                  <input value={draft.certificateIssuer} onChange={(e) => setDraft((c) => ({ ...c, certificateIssuer: e.target.value }))} />
                </Field>
                <Field label="Notes">
                  <textarea rows={2} value={draft.notes} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} />
                </Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !draft.fleetAssetId || !draft.programId}
                  onClick={async () => {
                    setSaving(true);
                    setError("");
                    try {
                      const created = await recordFleetTest(departmentId, {
                        ...draft,
                        tester: draft.tester || actor.actorName,
                      }, actor);
                      setRows((current) => [created, ...current.filter((row) => row.id !== created.id)]);
                      setSelectedId(created.id);
                      setShowCreate(false);
                      setMessage(`Test ${created.testNumber} recorded.`);
                      await reload();
                    } catch (createError) {
                      setError(createError?.message || "Unable to record test.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
