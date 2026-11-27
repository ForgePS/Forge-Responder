import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, Sparkles, XCircle } from "lucide-react";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { buildPreFirePlanPath } from "../../lib/storagePaths.js";
import { registerPreplanFile } from "../../lib/inspections/index.js";
import { MAX_OBJECTS_PER_FLOOR, normalizeFloorPlan } from "../../lib/preplans/floorPlanModel.js";
import { getFloorPlan, saveFloorPlan } from "../../lib/preplans/floorPlanService.js";
import { listConversionsForFloor, markConversionReviewed, newConversionId, recordConversion } from "../../lib/preplans/conversionService.js";
import { MAX_IMPORT_BYTES, detectVectorFormat, parseVectorDrawing, shapesToProposals } from "../../lib/preplans/vectorImport.js";
import PlanPreview from "./PlanPreview.jsx";
import SmartPlanScanImport from "./SmartPlanScanImport.jsx";

const GROUPS = [
  { id: "walls", label: "Walls" },
  { id: "openings", label: "Doors & windows" },
  { id: "rooms", label: "Rooms & areas" },
  { id: "lines", label: "Other lines" },
  { id: "text", label: "Text" },
];
const GROUP_OF = {
  exterior_wall: "walls", interior_wall: "walls", door: "openings", window: "openings",
  room: "rooms", corridor: "rooms", stairwell: "rooms", elevator: "rooms", area: "rooms",
  text: "text",
};

const UNSUPPORTED_FORMATS = {
  dwg: "DWG files need a licensed converter that Forge doesn't include. Save the drawing as DXF or SVG from your CAD program and import that.",
  pdf: "PDF import isn't available yet. Export the page as SVG (vector) or PNG (scan), or use Trace over a drawing on the Floor plans tab.",
  raster: "That's a picture, not a vector drawing. Use \"Choose a scan or photo\" to find its lines.",
};

/**
 * SmartPlan: convert a vector drawing (SVG or DXF) into proposed floor plan
 * objects, preview them beside the source, then add them to the floor as
 * proposals that a person accepts or rejects. Nothing is published or
 * verified here.
 */
export default function SmartPlanPanel({
  departmentId, preplan, revision, buildingId, floorId, floors = [], canEditGeometry = false,
  canUpload = false, actor = {}, onPlanSaved, onOpenFloors, onMessage, onError,
}) {
  const [plan, setPlan] = useState(null);
  const [conversions, setConversions] = useState([]);
  const [source, setSource] = useState(null); // { file, format, text, previewUrl }
  const [parsed, setParsed] = useState(null);
  const [include, setInclude] = useState({ walls: true, openings: true, rooms: true, lines: true, text: true });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [vectorStarted, setVectorStarted] = useState(0);

  const floor = floors.find((row) => row.id === floorId);

  const load = useCallback(async () => {
    if (!revision?.id || !floorId) { setPlan(null); setConversions([]); return; }
    const [row, list] = await Promise.all([
      getFloorPlan(departmentId, revision.id, floorId),
      listConversionsForFloor(departmentId, revision.id, floorId).catch(() => []),
    ]);
    setPlan(normalizeFloorPlan({ ...row, preplanId: preplan.id, revisionId: revision.id, floorId, buildingId: floor?.buildingId || buildingId }));
    setConversions(list);
  }, [departmentId, revision?.id, floorId, preplan?.id, floor?.buildingId, buildingId]);

  useEffect(() => {
    load().catch((error) => onError?.(error?.message || "Couldn't load this floor."));
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (source?.previewUrl) URL.revokeObjectURL(source.previewUrl); }, [source]);

  const proposals = useMemo(() => {
    if (!parsed) return null;
    return shapesToProposals(parsed, {
      conversionId: "preview",
      include,
      existingCount: plan?.objects.length || 0,
      actorUid: actor.actorUid || "",
    });
  }, [parsed, include, plan?.objects.length, actor.actorUid]);

  const groupCounts = useMemo(() => {
    if (!parsed) return {};
    const all = shapesToProposals(parsed, { conversionId: "count" });
    const out = {};
    for (const [type, count] of Object.entries(all.counts)) {
      const group = GROUP_OF[type] || "lines";
      out[group] = (out[group] || 0) + count;
    }
    return out;
  }, [parsed]);

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setProblem("");
    setParsed(null);
    setSource(null);
    if (!file) return;
    setVectorStarted((n) => n + 1);
    const format = detectVectorFormat(file.name, file.type);
    if (UNSUPPORTED_FORMATS[format]) { setProblem(UNSUPPORTED_FORMATS[format]); return; }
    if (!format) { setProblem("Choose an SVG or DXF drawing."); return; }
    if (file.size > MAX_IMPORT_BYTES) { setProblem("This drawing is too large to import (15 MB limit)."); return; }
    try {
      const text = await file.text();
      const result = parseVectorDrawing(format, text);
      // Shown only through <img>, where an SVG's scripts never run.
      const previewUrl = format === "svg" ? URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })) : "";
      setSource({ file, format, text, previewUrl });
      setParsed(result);
      if (!result.shapes.length) setProblem("No lines, shapes or text were found in this drawing.");
    } catch (error) {
      setProblem(error?.message || "Couldn't read this drawing.");
    }
  }

  async function applyProposals() {
    if (!proposals?.objects.length || !plan || !source) return;
    setBusy(true);
    try {
      const conversionId = newConversionId();
      // Keep the source file with the preplan for traceability. Stored as plain
      // text so opening it directly never runs anything embedded in an SVG.
      const stored = new File([source.text], source.file.name, { type: "text/plain" });
      const uploaded = await uploadFirebaseFile(buildPreFirePlanPath(departmentId, preplan.id, source.file.name), stored);
      const fileRecord = await registerPreplanFile(departmentId, {
        preplanId: preplan.id,
        buildingId: plan.buildingId,
        floorId,
        category: "floor_plan",
        fileName: source.file.name,
        mimeType: "text/plain",
        fileSize: source.file.size,
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
        description: `SmartPlan source (${source.format.toUpperCase()})`,
      }, actor);
      const final = shapesToProposals(parsed, {
        conversionId, fileId: fileRecord.id, format: source.format, include,
        existingCount: plan.objects.length, actorUid: actor.actorUid || "",
      });
      const next = normalizeFloorPlan({
        ...plan,
        canvas: {
          ...plan.canvas,
          width: Math.max(plan.canvas.width, final.canvas.width),
          height: Math.max(plan.canvas.height, final.canvas.height),
        },
        objects: [...plan.objects, ...final.objects],
      });
      const saved = await saveFloorPlan(departmentId, next, { expectedVersion: plan.version, actorUid: actor.actorUid || "" });
      await recordConversion(departmentId, {
        id: conversionId,
        method: "vector_import",
        format: source.format,
        preplanId: preplan.id,
        revisionId: revision.id,
        buildingId: plan.buildingId,
        floorId,
        fileId: fileRecord.id,
        fileName: source.file.name,
        counts: final.counts,
        proposedCount: final.objects.length,
        skippedCount: final.skipped,
        unsupported: parsed.unsupported,
        warnings: [...parsed.warnings, ...final.warnings],
        scaleFactor: final.scaleFactor,
        fileUnits: parsed.units,
      }, actor);
      setPlan(saved);
      onPlanSaved?.(saved);
      setSource(null);
      setParsed(null);
      await load();
      onMessage?.(`Added ${final.objects.length} proposed objects. Review them below or on the Floor plans tab.`);
    } catch (error) {
      onError?.(error?.code === "floor-plan-conflict"
        ? "The floor plan changed while you were importing. Nothing was added; try again."
        : error?.message || "Couldn't add the drawing.");
    } finally {
      setBusy(false);
    }
  }

  async function decideRemaining(conversionId, decision) {
    if (!plan) return;
    setBusy(true);
    try {
      const stamp = new Date().toISOString();
      const next = normalizeFloorPlan({
        ...plan,
        objects: plan.objects.map((object) => (
          object.source?.jobId === conversionId && object.verificationStatus === "pending"
            ? { ...object, verificationStatus: decision === "accept" ? "unverified" : "rejected", updatedAt: stamp }
            : object
        )),
      });
      const saved = await saveFloorPlan(departmentId, next, { expectedVersion: plan.version, actorUid: actor.actorUid || "" });
      await markConversionReviewed(departmentId, conversionId, actor);
      setPlan(saved);
      onPlanSaved?.(saved);
      await load();
    } catch (error) {
      onError?.(error?.code === "floor-plan-conflict"
        ? "The floor plan changed elsewhere. Reload and try again."
        : error?.message || "Couldn't save the review.");
    } finally {
      setBusy(false);
    }
  }

  if (!floorId) return <p className="ipw-empty">{canEditGeometry ? "Add a building and a floor on the Floor plans tab first." : "No floors have been drawn for this preplan yet."}</p>;

  const statusOf = (conversionId) => {
    const rows = (plan?.objects || []).filter((object) => object.source?.jobId === conversionId);
    return {
      pending: rows.filter((row) => row.verificationStatus === "pending").length,
      accepted: rows.filter((row) => ["unverified", "verified"].includes(row.verificationStatus)).length,
      rejected: rows.filter((row) => row.verificationStatus === "rejected").length,
    };
  };
  const previewObjects = proposals?.objects || [];
  const full = (plan?.objects.length || 0) >= MAX_OBJECTS_PER_FLOOR;

  return (
    <div className="smp-root">
      <div className="smp-intro">
        <Sparkles size={16} aria-hidden="true" />
        <div>
          <strong>SmartPlan for {floor?.name || "this floor"}</strong>
          <p className="fpe-muted">
            Turns a CAD or vector drawing into editable walls, rooms, doors and text, or finds the straight lines in a
            scan or photo of a plan. Everything it adds is a proposal: it shows dashed until a person accepts or
            rejects it, and the plan can&apos;t be approved while any are left. Types come only from the file&apos;s own
            layer and object names, or from your choice for a scan&apos;s thick lines. It runs in your browser; nothing
            is sent to AI.
          </p>
        </div>
      </div>

      {canEditGeometry && canUpload ? (
        <label className={`secondary-button smp-pick${full ? " is-disabled" : ""}`}>
          <FileUp size={14} /> Choose an SVG or DXF drawing
          <input type="file" hidden disabled={full || busy} accept=".svg,.dxf,image/svg+xml,application/dxf" onChange={chooseFile} />
        </label>
      ) : (
        <p className="fpe-muted">{canEditGeometry ? "You need permission to upload preplan files to import a drawing." : "This revision is read-only."}</p>
      )}
      <SmartPlanScanImport
        departmentId={departmentId}
        preplan={preplan}
        revision={revision}
        floorId={floorId}
        floorName={floor?.name || "this floor"}
        plan={plan}
        canStart={canEditGeometry && canUpload && !full}
        resetKey={vectorStarted}
        actor={actor}
        onOpened={() => { setParsed(null); setSource(null); setProblem(""); }}
        onApplied={async (saved) => { setPlan(saved); onPlanSaved?.(saved); await load(); }}
        onMessage={onMessage}
        onError={onError}
      />
      {full ? <p className="fpe-warn">This floor already has the maximum of {MAX_OBJECTS_PER_FLOOR.toLocaleString()} objects.</p> : null}
      {problem ? <p className="fpe-warn" role="alert">{problem}</p> : null}

      {parsed && proposals ? (
        <section className="smp-review" aria-label="Preview">
          <div className="smp-sides">
            <figure>
              <figcaption>Source: {source.file.name}</figcaption>
              {source.previewUrl
                ? <img src={source.previewUrl} alt="The uploaded drawing" />
                : <p className="fpe-muted">DXF files have no picture to show; the right side is drawn from the file&apos;s own lines.</p>}
            </figure>
            <figure>
              <figcaption>Proposed objects ({previewObjects.length})</figcaption>
              {proposals.canvas
                ? <PlanPreview objects={previewObjects} width={proposals.canvas.width} height={proposals.canvas.height} label="Proposed floor plan" highlightPending />
                : null}
            </figure>
          </div>
          <fieldset className="smp-include">
            <legend>Include</legend>
            {GROUPS.map((group) => (
              <label key={group.id}>
                <input type="checkbox" checked={include[group.id]} disabled={!groupCounts[group.id]}
                  onChange={(event) => setInclude((current) => ({ ...current, [group.id]: event.target.checked }))} />
                {group.label} ({groupCounts[group.id] || 0})
              </label>
            ))}
          </fieldset>
          {parsed.units ? <p className="fpe-muted">The file says its units are {parsed.units}. Set the scale on the floor plan to measure; it isn&apos;t assumed.</p> : null}
          {[...parsed.warnings, ...proposals.warnings].map((warning) => <p key={warning} className="fpe-warn">{warning}</p>)}
          {proposals.skipped ? <p className="fpe-muted">{proposals.skipped} shape{proposals.skipped === 1 ? " was" : "s were"} too small or malformed to use.</p> : null}
          <div className="spm-row">
            <button type="button" className="secondary-button" onClick={() => { setParsed(null); setSource(null); }} disabled={busy}>Cancel</button>
            <button type="button" className="primary-button" onClick={applyProposals} disabled={busy || !previewObjects.length}>
              {busy ? "Adding…" : `Add ${previewObjects.length} proposals to ${floor?.name || "this floor"}`}
            </button>
          </div>
        </section>
      ) : null}

      <section className="smp-history" aria-label="Imports on this floor">
        <h4>Imports on this floor</h4>
        {conversions.length ? (
          <ul>
            {conversions.map((row) => {
              const status = statusOf(row.id);
              return (
                <li key={row.id}>
                  <div>
                    <strong>{row.fileName || "Drawing"}</strong> · {String(row.format || "").toUpperCase()} {row.method === "line_detection" ? "line detection" : "vector import"}
                    <small> · {row.createdAt ? new Date(row.createdAt).toLocaleString() : ""}{row.createdByName ? ` · ${row.createdByName}` : ""}</small>
                  </div>
                  <div className="fpe-muted">
                    {status.pending} waiting for review · {status.accepted} accepted · {status.rejected} rejected
                  </div>
                  {canEditGeometry && status.pending ? (
                    <div className="spm-row">
                      <button type="button" className="secondary-button" disabled={busy} onClick={onOpenFloors}>Review one by one</button>
                      <button type="button" className="secondary-button" disabled={busy}
                        onClick={() => window.confirm(`Accept all ${status.pending} remaining proposals from ${row.fileName}? They'll still need verifying where required.`) && decideRemaining(row.id, "accept")}>
                        <CheckCircle2 size={13} /> Accept remaining
                      </button>
                      <button type="button" className="secondary-button danger" disabled={busy}
                        onClick={() => window.confirm(`Reject all ${status.pending} remaining proposals from ${row.fileName}?`) && decideRemaining(row.id, "reject")}>
                        <XCircle size={13} /> Reject remaining
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="fpe-muted">No drawings imported on this floor yet.</p>}
      </section>

      <section className="smp-later" aria-label="Not available yet">
        <h4>Not available yet</h4>
        <ul className="fpe-muted">
          <li>Rooms, doors, text and diagonal or curved walls in scans and photos: trace them on the Floor plans tab.</li>
          <li>PDF and DWG: export SVG or DXF (or a PNG of the page) from the original program.</li>
          <li>AI conversion of images is not turned on. It would send drawings to Forge AI and needs department approval first.</li>
        </ul>
      </section>
    </div>
  );
}
