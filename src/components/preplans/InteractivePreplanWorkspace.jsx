import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, Copy, Image as ImageIcon, Layers, Map as MapIcon, Plus, Siren, Sparkles } from "lucide-react";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { buildPreFirePlanPath } from "../../lib/storagePaths.js";
import { listPreplanBuildings, listPreplanFiles, registerPreplanFile, savePreplanBuilding } from "../../lib/inspections/index.js";
import { FLOOR_KINDS, normalizeFloorPlan } from "../../lib/preplans/floorPlanModel.js";
import {
  EDITABLE_REVISION_STATUSES,
  duplicatePreplanFloor,
  getFloorPlan,
  listPreplanFloors,
  loadSymbolCatalog,
  saveFloorPlan,
  savePreplanFloor,
} from "../../lib/preplans/floorPlanService.js";
import FloorPlanEditor from "./FloorPlanEditor.jsx";
import PreplanAlertsPanel from "./PreplanAlertsPanel.jsx";
import PreplanResponseView from "./PreplanResponseView.jsx";
import SiteMapPanel from "./SiteMapPanel.jsx";
import SmartPlanPanel from "./SmartPlanPanel.jsx";
import "../../theme/preplan-editor.css";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/** Natural pixel size of an image URL (needed to lay the source drawing under the canvas 1:1). */
function imageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

/**
 * Buildings → floors → floor plan editor for one preplan revision, plus the
 * site map and SmartPlan import tabs.
 */
export default function InteractivePreplanWorkspace({
  departmentId,
  preplan,
  revision,
  canEdit = false,
  canApprove = false,
  canUpload = false,
  actor = {},
  onMessage,
  onError,
}) {
  // A notification can ask for a tab ("alerts" for a review task); read it once.
  const [tab, setTab] = useState(() => {
    try {
      const wanted = window.sessionStorage.getItem("forge-open-preplan-tab");
      window.sessionStorage.removeItem("forge-open-preplan-tab");
      return ["floors", "site", "smartplan", "alerts"].includes(wanted) ? wanted : "floors";
    } catch {
      return "floors";
    }
  });
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [files, setFiles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newBuilding, setNewBuilding] = useState("");
  const [floorForm, setFloorForm] = useState(null);
  const [backgroundPick, setBackgroundPick] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);
  const mediaInputRef = useRef(null);
  const mediaTargetRef = useRef("");

  const editableRevision = EDITABLE_REVISION_STATUSES.includes(revision?.status);
  const canEditGeometry = canEdit && editableRevision;

  const reload = useCallback(async () => {
    if (!departmentId || !preplan?.id) return;
    const [nextBuildings, nextFloors, nextFiles, nextCatalog] = await Promise.all([
      listPreplanBuildings(departmentId, preplan.id),
      listPreplanFloors(departmentId, preplan.id),
      listPreplanFiles(departmentId, preplan.id),
      loadSymbolCatalog(departmentId),
    ]);
    setBuildings(nextBuildings);
    setFloors(nextFloors);
    setFiles(nextFiles.filter((row) => !row.archived));
    setCatalog(nextCatalog);
    setBuildingId((current) => (nextBuildings.some((row) => row.id === current) ? current : nextBuildings[0]?.id || ""));
  }, [departmentId, preplan?.id]);

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((error) => onError?.(error?.message || "Couldn't load the floor plans."))
      .finally(() => setLoading(false));
  }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildingFloors = useMemo(() => floors.filter((row) => row.buildingId === buildingId), [floors, buildingId]);

  useEffect(() => {
    setFloorId((current) => (buildingFloors.some((row) => row.id === current) ? current : buildingFloors.find((row) => row.kind === "ground")?.id || buildingFloors[0]?.id || ""));
  }, [buildingFloors]);

  // Load the plan for the selected floor in this revision.
  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    if (!floorId || !revision?.id) return undefined;
    getFloorPlan(departmentId, revision.id, floorId)
      .then((row) => {
        if (cancelled) return;
        const floor = floors.find((item) => item.id === floorId);
        setPlan(normalizeFloorPlan({ ...row, preplanId: preplan.id, buildingId: floor?.buildingId || buildingId }));
      })
      .catch((error) => onError?.(error?.message || "Couldn't load this floor."));
    return () => { cancelled = true; };
  }, [departmentId, revision?.id, floorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileById = useMemo(() => new Map(files.map((row) => [row.id, row])), [files]);
  const backgroundUrl = plan?.background?.fileId ? fileById.get(plan.background.fileId)?.downloadUrl || "" : "";
  const mediaByObject = useMemo(() => {
    const map = {};
    for (const file of files) {
      if (!file.objectId) continue;
      (map[file.objectId] ||= []).push(file);
    }
    return map;
  }, [files]);

  const handleSave = useCallback(async (next) => {
    const stored = await saveFloorPlan(departmentId, next, { expectedVersion: next.version, actorUid: actor.actorUid });
    // Keep the whole saved plan, so the editor remounts with current content after a tab switch.
    setPlan((current) => (current && current.floorId === stored.floorId ? stored : current));
    return stored;
  }, [departmentId, actor.actorUid]);

  async function addBuilding() {
    const name = newBuilding.trim();
    if (!name) return;
    try {
      const row = await savePreplanBuilding(departmentId, { preplanId: preplan.id, name, sortOrder: buildings.length }, actor);
      setNewBuilding("");
      await reload();
      setBuildingId(row.id);
      onMessage?.(`Added building ${name}.`);
    } catch (error) {
      onError?.(error?.message || "Couldn't add the building.");
    }
  }

  async function saveFloor() {
    if (!floorForm?.name?.trim()) return;
    try {
      const row = await savePreplanFloor(departmentId, {
        ...floorForm,
        preplanId: preplan.id,
        buildingId,
        name: floorForm.name.trim(),
        level: Number(floorForm.level) || 0,
        sortOrder: buildingFloors.length,
      }, actor);
      setFloorForm(null);
      await reload();
      setFloorId(row.id);
    } catch (error) {
      onError?.(error?.message || "Couldn't save the floor.");
    }
  }

  async function duplicateFloor() {
    const floor = floors.find((row) => row.id === floorId);
    if (!floor) return;
    try {
      const copy = await duplicatePreplanFloor(departmentId, floor, editableRevision ? revision.id : "", actor);
      await reload();
      setFloorId(copy.id);
      onMessage?.(`Copied ${floor.name}.`);
    } catch (error) {
      onError?.(error?.message || "Couldn't copy the floor.");
    }
  }

  async function archiveFloor() {
    const floor = floors.find((row) => row.id === floorId);
    if (!floor) return;
    if (!window.confirm(`Remove ${floor.name} from this preplan? Published revisions keep their copy.`)) return;
    try {
      await savePreplanFloor(departmentId, { ...floor, archived: true, archivedFromRevisionId: editableRevision ? revision.id : "" }, actor);
      await reload();
    } catch (error) {
      onError?.(error?.message || "Couldn't remove the floor.");
    }
  }

  async function applyBackground(file) {
    if (!plan || !canEditGeometry) return;
    const size = await imageSize(file.downloadUrl);
    const next = normalizeFloorPlan({
      ...plan,
      background: { fileId: file.id, storagePath: file.storagePath, width: size.width, height: size.height, opacity: 0.5 },
      canvas: size.width ? { ...plan.canvas, width: size.width, height: size.height } : plan.canvas,
    });
    try {
      const stored = await handleSave(next);
      setPlan(normalizeFloorPlan({ ...next, version: stored.version }));
      setBackgroundPick(false);
      onMessage?.("Source drawing placed under the floor plan. Trace over it, or run SmartPlan to detect walls and rooms.");
    } catch (error) {
      onError?.(error?.message || "Couldn't set the source drawing.");
    }
  }

  async function uploadFloorDrawing(file) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      onError?.("Pick a PNG, JPEG, WebP or GIF image. PDF, TIFF, HEIC and CAD drawings aren't supported as a background yet.");
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      onError?.("That image is larger than 25 MB.");
      return;
    }
    try {
      const uploaded = await uploadFirebaseFile(buildPreFirePlanPath(departmentId, preplan.id, file.name), file);
      const record = await registerPreplanFile(departmentId, {
        preplanId: preplan.id,
        buildingId,
        floorId,
        category: "floor_plan",
        fileName: file.name,
        mimeType: uploaded.contentType || file.type,
        fileSize: file.size,
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
        description: "Source drawing",
      }, actor);
      setFiles((rows) => [record, ...rows]);
      await applyBackground(record);
    } catch (error) {
      onError?.(error?.message || "Upload failed.");
    }
  }

  function attachMedia(objectId) {
    mediaTargetRef.current = objectId;
    mediaInputRef.current?.click();
  }

  async function onMediaChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const objectId = mediaTargetRef.current;
    if (!file || !objectId) return;
    if (file.size > MAX_MEDIA_BYTES) {
      onError?.("That file is larger than 25 MB.");
      return;
    }
    try {
      const uploaded = await uploadFirebaseFile(buildPreFirePlanPath(departmentId, preplan.id, file.name), file);
      const record = await registerPreplanFile(departmentId, {
        preplanId: preplan.id,
        buildingId,
        floorId,
        objectId,
        category: file.type.startsWith("image/") ? "other" : "documents",
        fileName: file.name,
        mimeType: uploaded.contentType || file.type,
        fileSize: file.size,
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
      }, actor);
      setFiles((rows) => [record, ...rows]);
      onMessage?.(`Attached ${file.name}.`);
    } catch (error) {
      onError?.(error?.message || "Upload failed.");
    }
  }

  const imageFiles = files.filter((row) => IMAGE_TYPES.includes(row.mimeType) && !row.objectId);
  const currentFloor = floors.find((row) => row.id === floorId);

  return (
    <section className="ipw-root template-section-card" aria-label="Interactive preplan">
      <div className="ipw-bar">
        <strong><Layers size={15} /> Interactive preplan</strong>
        <div className="ipw-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "floors"} className={`ipw-tab${tab === "floors" ? " is-active" : ""}`} onClick={() => setTab("floors")}>
            <Building2 size={14} /> Floor plans
          </button>
          <button type="button" role="tab" aria-selected={tab === "site"} className={`ipw-tab${tab === "site" ? " is-active" : ""}`} onClick={() => setTab("site")}>
            <MapIcon size={14} /> Site map
          </button>
          <button type="button" role="tab" aria-selected={tab === "smartplan"} className={`ipw-tab${tab === "smartplan" ? " is-active" : ""}`} onClick={() => setTab("smartplan")}>
            <Sparkles size={14} /> SmartPlan
          </button>
          <button type="button" role="tab" aria-selected={tab === "alerts"} className={`ipw-tab${tab === "alerts" ? " is-active" : ""}`} onClick={() => setTab("alerts")}>
            <AlertTriangle size={14} /> Alerts &amp; reviews
          </button>
        </div>
        <button type="button" className="primary-button" style={{ marginLeft: "auto" }} onClick={() => setResponseOpen(true)}>
          <Siren size={14} /> Response view
        </button>
      </div>
      {responseOpen ? <PreplanResponseView departmentId={departmentId} preplan={preplan} onClose={() => setResponseOpen(false)} /> : null}

      {!editableRevision ? (
        <div className="ipw-banner">
          Revision {revision?.revisionNumber} is {revision?.status === "published" ? "published" : revision?.status}, so its floor plans are read-only.
          {canEdit ? " Start a new revision to make changes; responders keep seeing this one until the new one is published." : ""}
        </div>
      ) : null}

      {tab === "alerts" ? (
        <PreplanAlertsPanel
          departmentId={departmentId}
          preplan={preplan}
          canEdit={canEdit}
          canApprove={canApprove}
          actor={actor}
          onMessage={onMessage}
          onError={onError}
        />
      ) : null}
      {tab === "site" ? (
        <SiteMapPanel
          departmentId={departmentId}
          preplan={preplan}
          revision={revision}
          buildings={buildings}
          floors={floors}
          files={files}
          catalog={catalog}
          canEditGeometry={canEditGeometry}
          actor={actor}
          onError={onError}
          onOpenFloor={(id) => {
            const target = floors.find((row) => row.id === id);
            if (target) { setBuildingId(target.buildingId); setFloorId(id); setTab("floors"); }
          }}
        />
      ) : null}
      {tab === "smartplan" ? (
        <>
          {buildings.length ? (
            <div className="ipw-bar">
              <label className="ipw-inline">
                Floor
                <select value={floorId} onChange={(event) => {
                  const target = floors.find((row) => row.id === event.target.value);
                  if (target) { setBuildingId(target.buildingId); setFloorId(target.id); }
                }}>
                  {floors.map((row) => (
                    <option key={row.id} value={row.id}>
                      {buildings.find((b) => b.id === row.buildingId)?.name || "Building"} · {row.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <SmartPlanPanel
            departmentId={departmentId}
            preplan={preplan}
            revision={revision}
            buildingId={buildingId}
            floorId={floorId}
            floors={floors}
            canEditGeometry={canEditGeometry}
            canUpload={canUpload}
            actor={actor}
            onMessage={onMessage}
            onError={onError}
            onOpenFloors={() => setTab("floors")}
            onPlanSaved={(stored) => { reload(); setPlan((current) => (current && current.floorId === stored.floorId ? stored : current)); }}
          />
        </>
      ) : null}

      {tab === "floors" ? (
        <>
          <div className="ipw-bar">
            <label className="ipw-inline-form">
              <span className="ipw-note">Building</span>
              <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} disabled={!buildings.length} aria-label="Building">
                {buildings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            {canEdit ? (
              <span className="ipw-inline-form">
                <input value={newBuilding} onChange={(e) => setNewBuilding(e.target.value)} placeholder="New building name" aria-label="New building name" />
                <button type="button" className="secondary-button" onClick={addBuilding} disabled={!newBuilding.trim()}><Plus size={14} /> Building</button>
              </span>
            ) : null}
          </div>

          {buildingId ? (
            <div className="ipw-bar">
              <div className="ipw-floors" role="tablist" aria-label="Floors">
                {buildingFloors.map((floor) => (
                  <button
                    key={floor.id}
                    type="button"
                    role="tab"
                    aria-selected={floor.id === floorId}
                    className={`ipw-floor${floor.id === floorId ? " is-active" : ""}`}
                    onClick={() => setFloorId(floor.id)}
                  >
                    {floor.name}
                  </button>
                ))}
                {!buildingFloors.length ? <span className="ipw-note">No floors yet.</span> : null}
              </div>
              {canEdit ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => setFloorForm({ name: "", kind: "ground", level: buildingFloors.length })}><Plus size={14} /> Floor</button>
                  {currentFloor ? (
                    <>
                      <button type="button" className="secondary-button" onClick={() => setFloorForm({ ...currentFloor })}>Rename</button>
                      <button type="button" className="secondary-button" onClick={duplicateFloor}><Copy size={14} /> Copy floor</button>
                      <button type="button" className="secondary-button danger-button" onClick={archiveFloor}>Remove floor</button>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {floorForm ? (
            <div className="ipw-inline-form">
              <input value={floorForm.name} onChange={(e) => setFloorForm({ ...floorForm, name: e.target.value })} placeholder="Floor name (e.g. Level 2, Basement)" aria-label="Floor name" autoFocus />
              <select value={floorForm.kind} onChange={(e) => setFloorForm({ ...floorForm, kind: e.target.value })} aria-label="Floor type">
                {FLOOR_KINDS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
              <label className="ipw-inline-form">
                <span className="ipw-note">Level</span>
                <input type="number" value={floorForm.level} onChange={(e) => setFloorForm({ ...floorForm, level: e.target.value })} style={{ width: 70 }} aria-label="Level (negative for basements)" />
              </label>
              <button type="button" className="primary-button" onClick={saveFloor} disabled={!floorForm.name.trim()}>Save floor</button>
              <button type="button" className="secondary-button" onClick={() => setFloorForm(null)}>Cancel</button>
            </div>
          ) : null}

          {loading ? <p className="ipw-note">Loading floor plans…</p> : null}
          {!loading && !buildings.length ? (
            <div className="ipw-banner">
              Add a building to start drawing. Each building gets its own floors; a campus or strip center can have several buildings on one preplan.
            </div>
          ) : null}

          {plan && currentFloor ? (
            <>
              {canEditGeometry ? (
                <div className="ipw-bar">
                  <button type="button" className="secondary-button" onClick={() => setBackgroundPick((v) => !v)}>
                    <ImageIcon size={14} /> {plan.background ? "Change source drawing" : "Trace over a drawing"}
                  </button>
                  {plan.background ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={async () => {
                        try {
                          const stored = await handleSave(normalizeFloorPlan({ ...plan, background: null }));
                          setPlan(normalizeFloorPlan({ ...plan, background: null, version: stored.version }));
                        } catch (error) { onError?.(error?.message || "Couldn't remove the drawing."); }
                      }}
                    >
                      Remove source drawing
                    </button>
                  ) : null}
                </div>
              ) : null}
              {backgroundPick && canEditGeometry ? (
                <div className="ipw-banner">
                  <p style={{ margin: "0 0 6px" }}>Use an uploaded image as a see-through layer under the floor plan (interactive overlay). The original file is never changed.</p>
                  <div className="ipw-inline-form">
                    {imageFiles.map((file) => (
                      <button key={file.id} type="button" className="secondary-button" onClick={() => applyBackground(file)}>{file.fileName}</button>
                    ))}
                    {canUpload ? (
                      <label className="secondary-button" style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                        Upload image…
                        <input type="file" accept={IMAGE_TYPES.join(",")} hidden onChange={(e) => { uploadFloorDrawing(e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <FloorPlanEditor
                key={`${revision.id}-${floorId}`}
                plan={plan}
                catalog={catalog}
                readOnly={!canEditGeometry}
                actorUid={actor.actorUid}
                backgroundUrl={backgroundUrl}
                onSave={canEditGeometry ? handleSave : undefined}
                onAttachMedia={canUpload ? attachMedia : undefined}
                mediaByObject={mediaByObject}
              />
              <input ref={mediaInputRef} type="file" hidden accept="image/*,.pdf" onChange={onMediaChosen} />
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
