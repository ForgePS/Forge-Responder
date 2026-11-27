import { useEffect, useMemo, useState } from "react";
import { ImageUp, ScanLine } from "lucide-react";
import { getBlob, ref } from "firebase/storage";
import { getFirebaseStorage, uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { buildPreFirePlanPath } from "../../lib/storagePaths.js";
import { registerPreplanFile } from "../../lib/inspections/index.js";
import { normalizeFloorPlan } from "../../lib/preplans/floorPlanModel.js";
import { saveFloorPlan } from "../../lib/preplans/floorPlanService.js";
import { newConversionId, recordConversion } from "../../lib/preplans/conversionService.js";
import {
  MAX_RASTER_BYTES, RASTER_TYPES, detectLines, segmentsToProposals, suggestWallThickness, workingSize,
} from "../../lib/preplans/rasterLines.js";
import PlanPreview from "./PlanPreview.jsx";

const MAX_PICTURE_SIDE = 20000;
const THICK_CHOICES = [
  { id: "line", label: "Plain lines (decide later)" },
  { id: "interior_wall", label: "Interior walls" },
  { id: "exterior_wall", label: "Exterior walls" },
];
const DEFAULT_SETTINGS = { contrast: 0.18, minLengthPct: 3, straighten: true, thickAs: "line", wallThickness: 0, useAsBackground: true };

/** Decode a picture, scaled to the detector's working size, as ImageData. */
async function readPicture(blob) {
  let source;
  if (typeof createImageBitmap === "function") {
    source = await createImageBitmap(blob);
  } else {
    const url = URL.createObjectURL(blob);
    try {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("This picture couldn't be opened."));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const natural = { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  if (!natural.width || !natural.height) throw new Error("This picture couldn't be opened.");
  if (Math.max(natural.width, natural.height) > MAX_PICTURE_SIDE) {
    throw new Error(`This picture is larger than ${MAX_PICTURE_SIDE.toLocaleString()} pixels on a side.`);
  }
  const size = workingSize(natural.width, natural.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(source, 0, 0, size.width, size.height);
  source.close?.();
  return { natural, image: ctx.getImageData(0, 0, size.width, size.height), backToOriginal: size.backToOriginal };
}

/**
 * SmartPlan for scans and photos: find the straight lines in a picture of a
 * floor plan, in the browser, and add them to the floor as proposals laid
 * exactly over the picture. Nothing is sent anywhere but the department's own
 * storage, and nothing is accepted on the person's behalf.
 */
export default function SmartPlanScanImport({
  departmentId, preplan, revision, floorId, floorName = "this floor", plan, canStart = false,
  resetKey = 0, actor = {}, onOpened, onApplied, onMessage, onError,
}) {
  // { blob, name, mime, fromBackground, previewUrl, natural, image, backToOriginal }
  const [scan, setScan] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [detection, setDetection] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  // Another import started (or the floor changed): drop this one.
  useEffect(() => { setScan(null); setDetection(null); setProblem(""); }, [resetKey, floorId]);
  useEffect(() => () => { if (scan?.previewUrl) URL.revokeObjectURL(scan.previewUrl); }, [scan]);

  // Run the detector when the picture or its settings change, a tick later so
  // "finding lines…" paints first.
  const { contrast, minLengthPct, straighten } = settings;
  useEffect(() => {
    if (!scan) { setDetection(null); return undefined; }
    let cancelled = false;
    setDetecting(true);
    const timer = setTimeout(() => {
      try {
        const longest = Math.max(scan.image.width, scan.image.height);
        const result = detectLines(scan.image, { contrast, minLength: Math.round((longest * minLengthPct) / 100), straighten });
        if (cancelled) return;
        setDetection(result);
        setSettings((current) => (current.wallThickness ? current : {
          ...current,
          wallThickness: Math.max(1, Math.round(suggestWallThickness(result.segments) * scan.backToOriginal)),
        }));
      } catch (error) {
        if (!cancelled) { setDetection(null); setProblem(error?.message || "Couldn't read this picture."); }
      } finally {
        if (!cancelled) setDetecting(false);
      }
    }, 30);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [scan, contrast, minLengthPct, straighten]);

  const proposals = useMemo(() => {
    if (!scan || !detection) return null;
    return segmentsToProposals(detection.segments, {
      conversionId: "preview",
      scale: scan.backToOriginal,
      thickAs: settings.thickAs,
      wallThickness: settings.wallThickness,
      existingCount: plan?.objects.length || 0,
      skewDegrees: detection.skewDegrees,
    });
  }, [scan, detection, settings.thickAs, settings.wallThickness, plan?.objects.length]);

  async function openPicture(blob, { name, fromBackground = false }) {
    setProblem("");
    setScan(null);
    setDetection(null);
    const mime = blob.type || "";
    if (!RASTER_TYPES.includes(mime)) {
      setProblem(/heic|heif|tiff?/i.test(`${mime} ${name}`)
        ? "HEIC and TIFF pictures can't be read in the browser. Save the picture as JPEG or PNG and choose that."
        : "Choose a PNG, JPEG, WebP or GIF picture.");
      return;
    }
    if (blob.size > MAX_RASTER_BYTES) { setProblem("This picture is larger than 25 MB."); return; }
    setBusy(true);
    try {
      const picture = await readPicture(blob);
      onOpened?.();
      setSettings((current) => ({ ...current, wallThickness: 0, useAsBackground: fromBackground || !plan?.background }));
      setScan({ blob, name, mime, fromBackground, previewUrl: URL.createObjectURL(blob), ...picture });
    } catch (error) {
      setProblem(error?.message || "This picture couldn't be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseScan(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await openPicture(file, { name: file.name });
  }

  async function useFloorDrawing() {
    if (!plan?.background?.storagePath) return;
    setProblem("");
    let blob;
    setBusy(true);
    try {
      const storage = getFirebaseStorage();
      if (!storage) throw new Error("files aren't available right now");
      blob = await getBlob(ref(storage, plan.background.storagePath));
    } catch (error) {
      setProblem(`Couldn't read this floor's source drawing${error?.message ? ` (${error.message})` : ""}. You can choose the picture as a scan instead.`);
      return;
    } finally {
      setBusy(false);
    }
    await openPicture(blob, { name: plan.background.storagePath.split("/").pop() || "Source drawing", fromBackground: true });
  }

  async function apply() {
    if (!scan || !detection || !proposals?.objects.length || !plan) return;
    setBusy(true);
    try {
      const conversionId = newConversionId();
      let fileId = scan.fromBackground ? plan.background.fileId : "";
      let storagePath = scan.fromBackground ? plan.background.storagePath : "";
      if (!scan.fromBackground) {
        // Pictures are kept as they are: they're only ever shown as images.
        const stored = scan.blob instanceof File ? scan.blob : new File([scan.blob], scan.name, { type: scan.mime });
        const uploaded = await uploadFirebaseFile(buildPreFirePlanPath(departmentId, preplan.id, scan.name), stored);
        const fileRecord = await registerPreplanFile(departmentId, {
          preplanId: preplan.id,
          buildingId: plan.buildingId,
          floorId,
          category: "floor_plan",
          fileName: scan.name,
          mimeType: uploaded.contentType || scan.mime,
          fileSize: scan.blob.size,
          storagePath: uploaded.storagePath,
          downloadUrl: uploaded.downloadUrl,
          description: "SmartPlan source (scan or photo)",
        }, actor);
        fileId = fileRecord.id;
        storagePath = uploaded.storagePath;
      }
      const final = segmentsToProposals(detection.segments, {
        conversionId,
        fileId,
        scale: scan.backToOriginal,
        thickAs: settings.thickAs,
        wallThickness: settings.wallThickness,
        existingCount: plan.objects.length,
        actorUid: actor.actorUid || "",
        skewDegrees: detection.skewDegrees,
      });
      const placeUnder = !scan.fromBackground && settings.useAsBackground;
      const next = normalizeFloorPlan({
        ...plan,
        background: placeUnder
          ? { fileId, storagePath, width: scan.natural.width, height: scan.natural.height, opacity: plan.background?.opacity ?? 0.5 }
          : plan.background,
        canvas: {
          ...plan.canvas,
          width: Math.max(plan.canvas.width, scan.natural.width),
          height: Math.max(plan.canvas.height, scan.natural.height),
        },
        objects: [...plan.objects, ...final.objects],
      });
      const saved = await saveFloorPlan(departmentId, next, { expectedVersion: plan.version, actorUid: actor.actorUid || "" });
      await recordConversion(departmentId, {
        id: conversionId,
        method: "line_detection",
        format: scan.mime.replace("image/", ""),
        preplanId: preplan.id,
        revisionId: revision.id,
        buildingId: plan.buildingId,
        floorId,
        fileId,
        fileName: scan.name,
        counts: final.counts,
        proposedCount: final.objects.length,
        skippedCount: final.skipped,
        warnings: [
          ...detection.warnings,
          ...detection.notes,
          ...final.warnings,
          `Settings: contrast ${Math.round(settings.contrast * 100)}%, shortest line ${settings.minLengthPct}% of the picture, `
            + `allow for a crooked picture ${settings.straighten ? "on" : "off"}, thick lines (${settings.wallThickness} px and up) as ${settings.thickAs}.`,
        ],
        scaleFactor: 1,
      }, actor);
      setScan(null);
      setDetection(null);
      await onApplied?.(saved);
      onMessage?.(`Added ${final.objects.length} proposed lines${placeUnder ? " and placed the picture under the floor plan" : ""}. Review them below or on the Floor plans tab.`);
    } catch (error) {
      onError?.(error?.code === "floor-plan-conflict"
        ? "The floor plan changed while you were importing. Nothing was added; try again."
        : error?.message || "Couldn't add the lines.");
    } finally {
      setBusy(false);
    }
  }

  const set = (patch) => setSettings((current) => ({ ...current, ...patch }));
  const warnings = [...(detection?.warnings || []), ...(proposals?.warnings || [])];
  // Lines already found in this same picture (and not rejected): adding again would double them.
  const alreadyFound = scan?.fromBackground && plan?.background
    ? plan.objects.filter((row) => row.source?.kind === "smartplan_lines" && row.source.uploadId === plan.background.fileId && row.verificationStatus !== "rejected").length
    : 0;

  return (
    <>
      {canStart ? (
        <div className="spm-row">
          <label className={`secondary-button smp-pick${busy ? " is-disabled" : ""}`}>
            <ImageUp size={14} /> Choose a scan or photo
            <input type="file" hidden disabled={busy} accept={RASTER_TYPES.join(",")} onChange={chooseScan} />
          </label>
          {plan?.background?.storagePath ? (
            <button type="button" className="secondary-button" disabled={busy} onClick={useFloorDrawing}>
              <ScanLine size={14} /> Find lines in this floor&apos;s source drawing
            </button>
          ) : null}
        </div>
      ) : null}
      {problem ? <p className="fpe-warn" role="alert">{problem}</p> : null}

      {scan ? (
        <section className="smp-review" aria-label="Lines found in the picture">
          <figure className="smp-overlay">
            <figcaption>
              {scan.fromBackground ? "This floor's source drawing" : scan.name} · {scan.natural.width} × {scan.natural.height} px
              {detecting ? " · finding lines…" : proposals ? ` · ${proposals.objects.length} lines found (dashed)` : ""}
            </figcaption>
            <PlanPreview
              objects={proposals?.objects || []}
              width={scan.natural.width}
              height={scan.natural.height}
              backgroundUrl={scan.previewUrl}
              background={{ width: scan.natural.width, height: scan.natural.height, opacity: 0.55 }}
              label="Lines found, drawn over the picture"
              highlightPending
            />
          </figure>
          <div className="smp-settings">
            <label>
              <span>Contrast needed: {Math.round(settings.contrast * 100)}%</span>
              <input type="range" min="0.05" max="0.4" step="0.01" value={settings.contrast} onChange={(event) => set({ contrast: Number(event.target.value) })} />
              <small>Raise it if smudges and shading come through; lower it for faint lines.</small>
            </label>
            <label>
              <span>Shortest line: {settings.minLengthPct}% of the picture</span>
              <input type="range" min="1" max="15" step="0.5" value={settings.minLengthPct} onChange={(event) => set({ minLengthPct: Number(event.target.value) })} />
              <small>Raise it to skip text, hatching and furniture.</small>
            </label>
            <label className="smp-check">
              <input type="checkbox" checked={settings.straighten} onChange={(event) => set({ straighten: event.target.checked })} />
              <span>Allow for a slightly crooked picture{detection?.skewDegrees ? ` (turned ${detection.skewDegrees}°)` : ""}</span>
            </label>
            <label>
              <span>Thick lines are</span>
              <select value={settings.thickAs} onChange={(event) => set({ thickAs: event.target.value })}>
                {THICK_CHOICES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </label>
            {settings.thickAs !== "line" ? (
              <label>
                <span>Thick means at least (pixels in the picture)</span>
                <input type="number" min="1" max="500" value={settings.wallThickness} onChange={(event) => set({ wallThickness: Math.max(1, Number(event.target.value) || 1) })} />
              </label>
            ) : null}
            {!scan.fromBackground && plan?.background ? (
              <label className="smp-check">
                <input type="checkbox" checked={settings.useAsBackground} onChange={(event) => set({ useAsBackground: event.target.checked })} />
                <span>Use this picture as the floor&apos;s source drawing (replaces the current one)</span>
              </label>
            ) : null}
          </div>
          {!scan.fromBackground && plan?.background && !settings.useAsBackground ? (
            <p className="fpe-warn">The lines are placed where they sit in this picture, so they won&apos;t line up with the floor&apos;s current source drawing.</p>
          ) : null}
          {!scan.fromBackground && !plan?.background ? (
            <p className="fpe-muted">The picture will be placed under the floor plan so each line can be checked against it.</p>
          ) : null}
          {alreadyFound ? (
            <p className="fpe-warn">This floor already has {alreadyFound} line{alreadyFound === 1 ? "" : "s"} found in this picture. Adding again puts a second copy on top; reject the old ones first if you&apos;re starting over.</p>
          ) : null}
          {warnings.map((warning) => <p key={warning} className="fpe-warn">{warning}</p>)}
          {(detection?.notes || []).map((note) => <p key={note} className="fpe-muted">{note}</p>)}
          <p className="fpe-muted">
            Finds straight horizontal and vertical lines only. Diagonal and curved walls, door swings, text, symbols and
            rooms aren&apos;t detected; trace those on the Floor plans tab. Set the scale there before measuring.
          </p>
          <div className="spm-row">
            <button type="button" className="secondary-button" onClick={() => { setScan(null); setDetection(null); }} disabled={busy}>Cancel</button>
            <button type="button" className="primary-button" onClick={apply} disabled={busy || detecting || !proposals?.objects.length}>
              {busy ? "Adding…" : `Add ${proposals?.objects.length || 0} proposed lines to ${floorName}`}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
