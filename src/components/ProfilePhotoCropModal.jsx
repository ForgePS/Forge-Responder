import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

export const PROFILE_PHOTO_SIZE = 200;
const PREVIEW_SIZE = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function drawCroppedPhoto(canvas, image, zoom, panX, panY, outputSize) {
  const ctx = canvas.getContext("2d");
  canvas.width = outputSize;
  canvas.height = outputSize;
  ctx.clearRect(0, 0, outputSize, outputSize);

  const coverScale = Math.max(outputSize / image.naturalWidth, outputSize / image.naturalHeight);
  const scale = coverScale * zoom;
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const scaleFactor = outputSize / PREVIEW_SIZE;
  const x = (outputSize - drawnWidth) / 2 + panX * scaleFactor;
  const y = (outputSize - drawnHeight) / 2 + panY * scaleFactor;

  ctx.drawImage(image, x, y, drawnWidth, drawnHeight);
}

export default function ProfilePhotoCropModal({ file, onCancel, onConfirm }) {
  const imageRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageUrl, setImageUrl] = useState("");
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setImageReady(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const renderPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageReady) return;
    drawCroppedPhoto(canvas, image, zoom, pan.x, pan.y, PREVIEW_SIZE);
  }, [imageReady, pan.x, pan.y, zoom]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  function handlePointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + delta).toFixed(2)))));
  }

  function handleConfirm() {
    const image = imageRef.current;
    if (!image || !imageReady) return;

    const exportCanvas = document.createElement("canvas");
    drawCroppedPhoto(exportCanvas, image, zoom, pan.x, pan.y, PROFILE_PHOTO_SIZE);
    exportCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        onConfirm(blob);
      },
      "image/jpeg",
      0.92
    );
  }

  if (!file) return null;

  return (
    <div className="modal-backdrop profile-photo-crop-backdrop" onClick={onCancel}>
      <div
        className="workflow-modal profile-photo-crop-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-photo-crop-title"
      >
        <header className="profile-photo-crop-header">
          <div>
            <h3 id="profile-photo-crop-title">Adjust Profile Photo</h3>
            <p>Drag to reposition and zoom in before saving. Output size is {PROFILE_PHOTO_SIZE}×{PROFILE_PHOTO_SIZE}px.</p>
          </div>
        </header>

        <div className="profile-photo-crop-body">
          <div
            className="profile-photo-crop-stage"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            <canvas ref={previewCanvasRef} className="profile-photo-crop-canvas" width={PREVIEW_SIZE} height={PREVIEW_SIZE} />
            <img
              ref={imageRef}
              src={imageUrl}
              alt=""
              className="profile-photo-crop-source"
              onLoad={() => setImageReady(true)}
            />
          </div>

          <label className="profile-photo-crop-zoom" htmlFor="profile-photo-zoom">
            <ZoomOut size={16} />
            <input
              id="profile-photo-zoom"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <ZoomIn size={16} />
            <span>{Math.round(zoom * 100)}%</span>
          </label>
        </div>

        <footer className="profile-photo-crop-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button" disabled={!imageReady} onClick={handleConfirm}>
            Save Photo
          </button>
        </footer>
      </div>
    </div>
  );
}
