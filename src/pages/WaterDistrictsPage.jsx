import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Save } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import HydrantDamageModuleLayout, {
  HydrantDamagePermissionGate,
  HydrantDamageStatusBadge,
} from "../components/hydrants/HydrantDamageModuleLayout.jsx";
import {
  canManageWaterDistricts,
  canViewWaterDistricts,
  listOwnershipReviews,
  listWaterCompanies,
  listWaterDistricts,
  previewHydrantsInDistrict,
  resolveOwnershipReview,
  saveWaterDistrict,
  updateHydrantDamageReport,
} from "../lib/hydrantDamage/index.js";
import { loadTenantHydrantRecords, loadStaticHydrants } from "../lib/hydrantTenantService.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const EMPTY_DISTRICT = {
  name: "",
  code: "",
  jurisdiction: "",
  waterCompanyId: "",
  priority: 100,
  effectiveFrom: "",
  effectiveTo: "",
  active: true,
  published: true,
  notes: "",
  geometryJson: "",
  acknowledgmentSlaMinutes: 0,
};

export default function WaterDistrictsPage({ onNavigate }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewWaterDistricts(permissions, isCreator);
  const canManage = canManageWaterDistricts(permissions, isCreator);
  const [hydrants, setHydrants] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState("districts");
  const [companies, setCompanies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [resolveDraft, setResolveDraft] = useState({
    waterCompanyId: "",
    waterDistrictId: "",
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
      const [nextCompanies, nextDistricts, nextReviews, tenantHydrants, staticHydrants] = await Promise.all([
        listWaterCompanies(departmentId),
        listWaterDistricts(departmentId),
        listOwnershipReviews(departmentId),
        loadTenantHydrantRecords(departmentId),
        loadStaticHydrants(departmentId),
      ]);
      setCompanies(nextCompanies);
      setDistricts(nextDistricts);
      setReviews(nextReviews);
      const merged = [...tenantHydrants];
      const seen = new Set(merged.map((row) => row.location_id || row.id));
      for (const row of staticHydrants) {
        const key = row.location_id || row.id;
        if (!seen.has(key)) merged.push(row);
      }
      setHydrants(merged);
      setSelectedId((current) => current || nextDistricts[0]?.id || "");
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load water districts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  useEffect(() => {
    const selected = districts.find((row) => row.id === selectedId) || null;
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft({
      ...selected,
      geometryJson: selected.geometry ? JSON.stringify(selected.geometry, null, 2) : "",
    });
  }, [districts, selectedId]);

  const openReviews = useMemo(
    () => reviews.filter((row) => row.status === "open"),
    [reviews]
  );

  const previewCount = useMemo(() => {
    if (!draft) return 0;
    try {
      const parsed = draft.geometryJson ? JSON.parse(draft.geometryJson) : draft.geometry;
      const geometry = parsed?.type === "Feature"
        ? parsed.geometry
        : parsed?.type === "FeatureCollection"
          ? parsed.features?.[0]?.geometry
          : parsed?.geometry || parsed;
      if (!geometry) return 0;
      return previewHydrantsInDistrict({ geometry }, hydrants).length;
    } catch {
      return 0;
    }
  }, [draft, hydrants]);

  async function handleCreate() {
    if (!canManage) return;
    setDraft({ ...EMPTY_DISTRICT });
    setSelectedId("");
    setMessage("Enter district details and paste GeoJSON, then save.");
  }

  async function handleSave() {
    if (!canManage || !draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveWaterDistrict(departmentId, draft, actor);
      setDistricts((current) => {
        const rest = current.filter((row) => row.id !== saved.id);
        return [saved, ...rest].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
      });
      setSelectedId(saved.id);
      setMessage(`District saved (v${saved.version}).`);
    } catch (saveError) {
      setError(saveError?.message || "Unable to save district.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve(review) {
    if (!canManage || !resolveDraft.waterCompanyId) {
      setError("Select a water company to resolve ownership.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const resolved = await resolveOwnershipReview(departmentId, review.id, resolveDraft, actor);
      if (review.reportId) {
        const company = companies.find((row) => row.id === resolveDraft.waterCompanyId);
        await updateHydrantDamageReport(departmentId, review.reportId, {
          waterCompanyId: resolveDraft.waterCompanyId,
          waterCompanyName: company?.legalName || "",
          waterDistrictId: resolveDraft.waterDistrictId || "",
          waterDistrictName: districts.find((row) => row.id === resolveDraft.waterDistrictId)?.name || "",
          assignmentSource: "manual_override",
          assignmentConfidence: 1,
          ownershipReason: "",
          status: "draft",
          recipientSnapshot: company?.damageReportEmail
            ? [{
                email: company.damageReportEmail,
                name: company.legalName,
                role: "damage_report",
                required: true,
              }]
            : [],
          _reason: "ownership_resolved",
        }, actor);
      }
      setReviews((current) => [resolved, ...current.filter((row) => row.id !== resolved.id)]);
      setMessage("Ownership review resolved.");
      setResolveDraft({ waterCompanyId: "", waterDistrictId: "", notes: "" });
    } catch (resolveError) {
      setError(resolveError?.message || "Unable to resolve ownership.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <HydrantDamagePermissionGate
      allowed={allowed}
      title="Access denied"
      description="You do not have permission to view water districts."
    >
      <HydrantDamageModuleLayout
        title="Water Districts"
        description="Map service areas to water companies. Overlapping polygons require confirmation; unmatched hydrants go to the ownership queue."
        activeNavName="Water Districts"
        onNavigate={onNavigate}
        actions={(
          <div className="occupancy-detail-actions">
            <button className={`secondary-button${view === "districts" ? " active" : ""}`} type="button" onClick={() => setView("districts")}>
              Districts
            </button>
            <button className={`secondary-button${view === "ownership" ? " active" : ""}`} type="button" onClick={() => setView("ownership")}>
              Ownership queue ({openReviews.length})
            </button>
            {canManage && view === "districts" ? (
              <button className="primary-button" type="button" onClick={handleCreate}>
                <CirclePlus size={14} /> New district
              </button>
            ) : null}
          </div>
        )}
      >
        {loading ? <p className="occupancy-muted">Loading…</p> : null}
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && view === "districts" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><strong>Districts</strong></header>
              <div className="panel-body">
                <div className="personnel-list">
                  {districts.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedId ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.code || "No code"} · priority {item.priority} · v{item.version}
                        </small>
                      </span>
                      <HydrantDamageStatusBadge
                        status={item.active && item.published ? "verified" : "draft"}
                        label={item.active && item.published ? "Active" : "Inactive"}
                      />
                    </button>
                  ))}
                  {!districts.length ? <p className="occupancy-muted">No districts yet. Import a GeoJSON polygon to start.</p> : null}
                </div>
              </div>
            </section>

            {draft ? (
              <section className="panel">
                <header>
                  <strong>{draft.id ? draft.name || "Edit district" : "New district"}</strong>
                </header>
                <div className="panel-body">
                  <div className="occupancy-form-grid">
                    <Field label="Name">
                      <input
                        value={draft.name || ""}
                        disabled={!canManage}
                        onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
                      />
                    </Field>
                    <Field label="Code / water-system ID">
                      <input
                        value={draft.code || ""}
                        disabled={!canManage}
                        onChange={(e) => setDraft((c) => ({ ...c, code: e.target.value }))}
                      />
                    </Field>
                    <Field label="Water company">
                      <select
                        value={draft.waterCompanyId || ""}
                        disabled={!canManage}
                        onChange={(e) => setDraft((c) => ({ ...c, waterCompanyId: e.target.value }))}
                      >
                        <option value="">Select…</option>
                        {companies.map((row) => (
                          <option key={row.id} value={row.id}>{row.legalName}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Priority (lower wins display order)">
                      <input
                        type="number"
                        value={draft.priority ?? 100}
                        disabled={!canManage}
                        onChange={(e) => setDraft((c) => ({ ...c, priority: Number(e.target.value) || 100 }))}
                      />
                    </Field>
                    <Field label="Jurisdiction">
                      <input
                        value={draft.jurisdiction || ""}
                        disabled={!canManage}
                        onChange={(e) => setDraft((c) => ({ ...c, jurisdiction: e.target.value }))}
                      />
                    </Field>
                    <Field label="Effective from">
                      <input
                        type="date"
                        value={(draft.effectiveFrom || "").slice(0, 10)}
                        disabled={!canManage}
                        onChange={(e) => setDraft((c) => ({ ...c, effectiveFrom: e.target.value }))}
                      />
                    </Field>
                    <Field label="Effective to">
                      <input
                        type="date"
                        value={(draft.effectiveTo || "").slice(0, 10)}
                        disabled={!canManage}
                        onChange={(e) => setDraft((c) => ({ ...c, effectiveTo: e.target.value }))}
                      />
                    </Field>
                    <div className="config-field">
                      <span>Flags</span>
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={draft.active !== false}
                          disabled={!canManage}
                          onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))}
                        />
                        <span>Active</span>
                      </label>
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={draft.published !== false}
                          disabled={!canManage}
                          onChange={(e) => setDraft((c) => ({ ...c, published: e.target.checked }))}
                        />
                        <span>Published</span>
                      </label>
                    </div>
                    <Field label="GeoJSON (Polygon / MultiPolygon / Feature)" wide>
                      <textarea
                        rows={10}
                        value={draft.geometryJson || ""}
                        disabled={!canManage}
                        placeholder='{"type":"Polygon","coordinates":[[[-90.1,34.9],[-90.0,34.9],[-90.0,35.0],[-90.1,35.0],[-90.1,34.9]]]}'
                        onChange={(e) => setDraft((c) => ({ ...c, geometryJson: e.target.value }))}
                      />
                    </Field>
                    <Field label="Notes" wide>
                      <textarea
                        rows={2}
                        value={draft.notes || ""}
                        disabled={!canManage}
                        onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))}
                      />
                    </Field>
                  </div>
                  <p className="occupancy-muted">
                    Preview: ~{previewCount} hydrant{previewCount === 1 ? "" : "s"} currently fall inside this geometry
                    {draft.version ? ` · version ${draft.version}` : ""}.
                  </p>
                  {canManage ? (
                    <div className="occupancy-detail-actions">
                      <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
                        <Save size={14} /> Save district
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="panel">
                <div className="panel-body">
                  <p className="occupancy-muted">Select a district or create one.</p>
                </div>
              </section>
            )}
          </section>
        ) : null}

        {!loading && view === "ownership" ? (
          <section className="panel">
            <header><strong>Ownership review queue</strong></header>
            <div className="panel-body">
              {!openReviews.length ? (
                <p className="occupancy-muted">No open ownership reviews.</p>
              ) : (
                <div className="personnel-list">
                  {openReviews.map((review) => (
                    <div key={review.id} className="person-row" style={{ display: "grid", gap: 8 }}>
                      <div>
                        <strong>{review.hydrantLabel || review.hydrantId || "Unknown hydrant"}</strong>
                        <small style={{ display: "block" }}>
                          {review.hydrantAddress || "No address"} · {review.reason || "unknown"}
                          {review.reportId ? ` · report ${review.reportId}` : ""}
                        </small>
                        {(review.candidates || []).length ? (
                          <small style={{ display: "block" }}>
                            Candidates: {review.candidates.map((c) => c.waterCompanyName || c.waterDistrictName || c.waterCompanyId).join(", ")}
                          </small>
                        ) : null}
                      </div>
                      {canManage ? (
                        <div className="occupancy-form-grid">
                          <Field label="Company">
                            <select
                              value={resolveDraft.waterCompanyId}
                              onChange={(e) => setResolveDraft((c) => ({ ...c, waterCompanyId: e.target.value }))}
                            >
                              <option value="">Select…</option>
                              {companies.map((row) => (
                                <option key={row.id} value={row.id}>{row.legalName}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="District (optional)">
                            <select
                              value={resolveDraft.waterDistrictId}
                              onChange={(e) => setResolveDraft((c) => ({ ...c, waterDistrictId: e.target.value }))}
                            >
                              <option value="">None</option>
                              {districts.map((row) => (
                                <option key={row.id} value={row.id}>{row.name}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Notes" wide>
                            <input
                              value={resolveDraft.notes}
                              onChange={(e) => setResolveDraft((c) => ({ ...c, notes: e.target.value }))}
                            />
                          </Field>
                          <div className="occupancy-detail-actions">
                            <button className="primary-button" type="button" disabled={saving} onClick={() => handleResolve(review)}>
                              Resolve
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}
      </HydrantDamageModuleLayout>
    </HydrantDamagePermissionGate>
  );
}
