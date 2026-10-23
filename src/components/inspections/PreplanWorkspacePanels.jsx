import { useEffect, useMemo, useState } from "react";
import { Building2, FileUp, QrCode, ShieldAlert } from "lucide-react";
import ObjectUploadField from "../ObjectUploadField.jsx";
import { buildPreFirePlanPath } from "../../lib/storagePaths.js";
import { loadDepartmentHydrants } from "../../lib/hydrantTenantService.js";
import {
  calculatePreplanRiskScore,
  createPreplanQrToken,
  listFireProtectionSystems,
  listPreplanBuildings,
  listPreplanFiles,
  listPreplanQrTokens,
  PREPLAN_RISK_LEVELS,
  registerPreplanFile,
  revokePreplanQrToken,
  savePreplanBuilding,
} from "../../lib/inspections/index.js";

const PHOTO_CATEGORIES = [
  { id: "exterior", label: "Exterior" },
  { id: "access", label: "Access / approach" },
  { id: "fdc", label: "FDC / water" },
  { id: "utilities", label: "Utilities" },
  { id: "hazmat", label: "HazMat" },
  { id: "floor_plan", label: "Floor plan" },
  { id: "site_plan", label: "Site plan" },
  { id: "other", label: "Other" },
];

/**
 * Phase 3–5 panels: linked assets, buildings, files, risk override, QR tokens.
 */
export default function PreplanWorkspacePanels({
  departmentId,
  preplan,
  actor = {},
  canEdit = false,
  canUpload = false,
  canViewSensitive = false,
  saving = false,
  onUpdateLinks,
  onMessage,
  onError,
}) {
  const [tab, setTab] = useState("assets");
  const [hydrants, setHydrants] = useState([]);
  const [systems, setSystems] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [files, setFiles] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [selectedHydrantIds, setSelectedHydrantIds] = useState(preplan.hydrantIds || []);
  const [selectedSystemIds, setSelectedSystemIds] = useState(preplan.systemIds || []);
  const [buildingName, setBuildingName] = useState("");
  const [fileCategory, setFileCategory] = useState("exterior");
  const [riskOverride, setRiskOverride] = useState(preplan.riskOverrideLevel || "");
  const [riskReason, setRiskReason] = useState(preplan.riskOverrideReason || "");
  const [freshToken, setFreshToken] = useState("");
  const [busy, setBusy] = useState(false);

  const risk = useMemo(() => calculatePreplanRiskScore(preplan, {
    manualOverrideLevel: riskOverride || undefined,
    overrideReason: riskReason,
    hazmat: Boolean(preplan.sectionAnswers?.hazmat || riskOverride),
    noSprinkler: /none/i.test(String(preplan.sectionAnswers?.sprinkler || "")),
  }), [preplan, riskOverride, riskReason]);

  async function reloadExtras() {
    if (!departmentId || !preplan?.id) return;
    const [nextBuildings, nextFiles, nextTokens, nextHydrants, nextSystems] = await Promise.all([
      listPreplanBuildings(departmentId, preplan.id),
      listPreplanFiles(departmentId, preplan.id),
      listPreplanQrTokens(departmentId, preplan.id),
      loadDepartmentHydrants(departmentId).catch(() => []),
      listFireProtectionSystems(departmentId, {
        occupancyId: preplan.occupancyId || undefined,
      }).catch(() => []),
    ]);
    setBuildings(nextBuildings);
    setFiles(nextFiles);
    setTokens(nextTokens);
    setHydrants(Array.isArray(nextHydrants) ? nextHydrants.slice(0, 200) : []);
    setSystems(nextSystems);
  }

  useEffect(() => {
    setSelectedHydrantIds(preplan.hydrantIds || []);
    setSelectedSystemIds(preplan.systemIds || []);
    setRiskOverride(preplan.riskOverrideLevel || "");
    setRiskReason(preplan.riskOverrideReason || "");
  }, [preplan.id, preplan.updatedAt]);

  useEffect(() => {
    reloadExtras().catch((err) => onError?.(err?.message || "Unable to load preplan extras."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, preplan.id]);

  function toggleId(list, id, setter) {
    setter(list.includes(id) ? list.filter((row) => row !== id) : [...list, id]);
  }

  async function handleSaveAssets() {
    if (!canEdit || !onUpdateLinks) return;
    setBusy(true);
    try {
      await onUpdateLinks({
        hydrantIds: selectedHydrantIds,
        systemIds: selectedSystemIds,
        riskLevel: riskOverride || risk.level,
        riskScore: risk.score,
        riskOverrideLevel: riskOverride,
        riskOverrideReason: riskReason,
      });
      onMessage?.("Linked assets and risk saved.");
    } catch (error) {
      onError?.(error?.message || "Unable to save links.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddBuilding() {
    if (!canEdit || !buildingName.trim()) return;
    setBusy(true);
    try {
      await savePreplanBuilding(departmentId, {
        preplanId: preplan.id,
        name: buildingName.trim(),
        sortOrder: buildings.length,
      }, actor);
      setBuildingName("");
      await reloadExtras();
      onMessage?.("Building added.");
    } catch (error) {
      onError?.(error?.message || "Unable to add building.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploaded(result) {
    if (!canUpload && !canEdit) return;
    setBusy(true);
    try {
      await registerPreplanFile(departmentId, {
        preplanId: preplan.id,
        category: fileCategory,
        fileName: result.name,
        mimeType: result.contentType,
        fileSize: result.size,
        storagePath: result.storagePath,
        downloadUrl: result.downloadUrl,
        sensitive: fileCategory === "hazmat" || fileCategory === "utilities",
      }, actor);
      await reloadExtras();
      onMessage?.("File registered.");
    } catch (error) {
      onError?.(error?.message || "Unable to register file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateQr() {
    if (!canEdit) return;
    setBusy(true);
    setFreshToken("");
    try {
      const created = await createPreplanQrToken(departmentId, preplan.id, actor, {
        label: `${preplan.preplanNumber || preplan.id} operational`,
      });
      setFreshToken(created.token);
      await reloadExtras();
      onMessage?.("QR token created — copy it now; it will not be shown again.");
    } catch (error) {
      onError?.(error?.message || "Unable to create QR token.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(tokenId) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await revokePreplanQrToken(departmentId, tokenId, actor);
      await reloadExtras();
      onMessage?.("QR token revoked.");
    } catch (error) {
      onError?.(error?.message || "Unable to revoke token.");
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { id: "assets", label: "Hydrants & FPS" },
    { id: "buildings", label: "Buildings" },
    { id: "files", label: "Files & plans" },
    { id: "risk", label: "Risk" },
    { id: "qr", label: "QR" },
  ];

  return (
    <section className="panel" style={{ marginTop: "1rem" }}>
      <header>
        <div><Building2 size={15} /><strong>Preplan operations</strong></div>
      </header>
      <div className="panel-body">
        <div className="occupancy-detail-actions" style={{ marginBottom: "0.75rem" }}>
          {tabs.map((row) => (
            <button
              key={row.id}
              type="button"
              className={tab === row.id ? "primary-button" : "secondary-button"}
              onClick={() => setTab(row.id)}
            >
              {row.label}
            </button>
          ))}
        </div>

        {tab === "assets" ? (
          <div className="config-split">
            <div>
              <strong>Hydrants</strong>
              <p className="occupancy-muted">Select nearby hydrants to pin on this preplan.</p>
              <div className="config-list" style={{ maxHeight: 220, overflow: "auto" }}>
                {hydrants.map((row) => {
                  const id = row.id || `${row.location_id}-${row.hydrant_id}`;
                  const label = row.official_hydrant_id || row.hydrant_id || id;
                  return (
                    <label key={id} className="occupancy-primary-toggle">
                      <input
                        type="checkbox"
                        checked={selectedHydrantIds.includes(id)}
                        disabled={!canEdit || busy || saving}
                        onChange={() => toggleId(selectedHydrantIds, id, setSelectedHydrantIds)}
                      />
                      {label} — {row.address || row.location || "No address"}
                    </label>
                  );
                })}
                {!hydrants.length ? <p className="occupancy-muted">No hydrants loaded.</p> : null}
              </div>
            </div>
            <div>
              <strong>Fire protection systems</strong>
              <p className="occupancy-muted">
                {preplan.occupancyId ? "Filtered to this occupancy when available." : "Department systems."}
              </p>
              <div className="config-list" style={{ maxHeight: 220, overflow: "auto" }}>
                {systems.map((row) => (
                  <label key={row.id} className="occupancy-primary-toggle">
                    <input
                      type="checkbox"
                      checked={selectedSystemIds.includes(row.id)}
                      disabled={!canEdit || busy || saving}
                      onChange={() => toggleId(selectedSystemIds, row.id, setSelectedSystemIds)}
                    />
                    {row.name || row.systemNumber} ({row.systemTypeId || "system"})
                  </label>
                ))}
                {!systems.length ? <p className="occupancy-muted">No FPS records found.</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "buildings" ? (
          <div>
            <p className="occupancy-muted">Multi-building campuses can attach named buildings to one preplan document.</p>
            <ul className="occupancy-muted">
              {buildings.map((row) => (
                <li key={row.id}><strong>{row.name}</strong></li>
              ))}
              {!buildings.length ? <li>No buildings yet.</li> : null}
            </ul>
            {canEdit ? (
              <div className="occupancy-detail-actions">
                <input
                  placeholder="Building name"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                />
                <button type="button" className="secondary-button" disabled={busy} onClick={handleAddBuilding}>
                  Add building
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "files" ? (
          <div>
            <label className="config-field">
              <span>Category</span>
              <select value={fileCategory} disabled={!canEdit} onChange={(e) => setFileCategory(e.target.value)}>
                {PHOTO_CATEGORIES.map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </select>
            </label>
            {(canUpload || canEdit) ? (
              <ObjectUploadField
                label="Upload photo or plan"
                hint="Stored under pre-fire-plans path; metadata registered on the preplan."
                disabled={busy || saving}
                buildPath={(file) => buildPreFirePlanPath(departmentId, preplan.id, file.name)}
                onUploaded={handleUploaded}
              />
            ) : null}
            <div className="cert-table" style={{ marginTop: "0.75rem" }}>
              <div className="cert-row cert-head">
                <span>File</span>
                <span>Category</span>
                <span>Uploaded</span>
              </div>
              {files.filter((row) => canViewSensitive || !row.sensitive).map((row) => (
                <div key={row.id} className="cert-row">
                  <strong>
                    {row.downloadUrl ? (
                      <a href={row.downloadUrl} target="_blank" rel="noreferrer">{row.fileName || "File"}</a>
                    ) : (row.fileName || "File")}
                  </strong>
                  <span>{row.category}</span>
                  <span>{row.uploadedAt ? new Date(row.uploadedAt).toLocaleString() : "—"}</span>
                </div>
              ))}
              {!files.length ? <p className="occupancy-muted">No files yet.</p> : null}
            </div>
          </div>
        ) : null}

        {tab === "risk" ? (
          <div>
            <p>
              <ShieldAlert size={14} /> Calculated score <strong>{risk.score}</strong> → <strong>{risk.level}</strong>
              {risk.overridden ? " (override active)" : ""}
            </p>
            <div className="occupancy-form-grid">
              <label className="config-field">
                <span>Manual override level</span>
                <select
                  value={riskOverride}
                  disabled={!canEdit}
                  onChange={(e) => setRiskOverride(e.target.value)}
                >
                  <option value="">Use calculated</option>
                  {PREPLAN_RISK_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>
              <label className="config-field wide">
                <span>Override reason</span>
                <input
                  value={riskReason}
                  disabled={!canEdit || !riskOverride}
                  onChange={(e) => setRiskReason(e.target.value)}
                  placeholder="Required when overriding risk"
                />
              </label>
            </div>
          </div>
        ) : null}

        {tab === "qr" ? (
          <div>
            <p className="occupancy-muted">
              <QrCode size={14} /> Authenticated tokens are hashed at rest. Raw preplan IDs are never used as scan credentials.
            </p>
            {freshToken ? (
              <p className="occupancy-message">Show-once token: <code>{freshToken}</code></p>
            ) : null}
            {canEdit ? (
              <button type="button" className="secondary-button" disabled={busy} onClick={handleCreateQr}>
                <FileUp size={14} /> Create QR token
              </button>
            ) : null}
            <ul className="occupancy-muted">
              {tokens.map((row) => (
                <li key={row.id}>
                  {row.label} · scans {row.scanCount || 0}
                  {row.revoked ? " · revoked" : ""}
                  {canEdit && !row.revoked ? (
                    <>
                      {" "}
                      <button type="button" className="secondary-button" onClick={() => handleRevoke(row.id)}>
                        Revoke
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
              {!tokens.length ? <li>No tokens yet.</li> : null}
            </ul>
          </div>
        ) : null}

        {canEdit && (tab === "assets" || tab === "risk") ? (
          <button
            type="button"
            className="primary-button"
            style={{ marginTop: "0.75rem" }}
            disabled={busy || saving || (Boolean(riskOverride) && !riskReason.trim())}
            onClick={handleSaveAssets}
          >
            Save assets & risk
          </button>
        ) : null}
      </div>
    </section>
  );
}
