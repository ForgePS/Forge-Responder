/**
 * Signature capture for a NEMSIS signature row (eOther.SignatureGroup). Drawn with a finger or stylus on a white
 * pad, saved as a 600×200 PNG through setSignature (eOther.16–.19). Works offline; the image is part of the
 * encrypted report on the device.
 */
import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Trash2 } from "lucide-react";
import { clearSignature, setSignature, signatureImage } from "../../lib/nemsis/pcrModel.js";
import { Confirm, cx } from "../ui.jsx";

const OUT_WIDTH = 600;
const OUT_HEIGHT = 200;

export default function SignaturePad({ ctx, at }) {
  const { schema, pcr, setPcr, readOnly } = ctx;
  const [drawing, setDrawing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState("");
  const image = signatureImage(schema, pcr, at);

  const save = (dataUrl) => {
    try {
      setPcr((current) => setSignature(schema, current, at, { dataUrl }));
      setDrawing(false);
      setError("");
    } catch {
      setError("That signature couldn't be saved. Clear the pad and sign again.");
    }
  };

  return (
    <div className="fa-sig">
      <span className="fa-sig-label">Signature</span>
      {image ? (
        <img className="fa-sig-image" src={image} alt="Captured signature" />
      ) : (
        <p className="fa-hint">{readOnly ? "Not signed on this device." : "Not signed yet."}</p>
      )}
      {error ? <p className="fa-error-text" role="alert">{error}</p> : null}
      {!readOnly ? (
        <div className="fa-inline-actions">
          <button type="button" className="fa-btn fa-btn-secondary" onClick={() => setDrawing(true)}>
            <PenLine size={20} /> {image ? "Sign again" : "Sign"}
          </button>
          {image ? (
            <button type="button" className="fa-btn fa-btn-ghost" onClick={() => setConfirmClear(true)}>
              <Trash2 size={18} /> Remove
            </button>
          ) : null}
        </div>
      ) : null}
      {drawing ? <DrawDialog onCancel={() => setDrawing(false)} onSave={save} /> : null}
      <Confirm
        open={confirmClear}
        title="Remove this signature?"
        body="Who signed and the reason stay filled in. Set the signature status again if it wasn't signed."
        confirmLabel="Remove"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setPcr((current) => clearSignature(schema, current, at));
          setConfirmClear(false);
        }}
      />
    </div>
  );
}

function DrawDialog({ onCancel, onSave }) {
  const canvasRef = useRef(null);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const g = canvas.getContext("2d");
    g.scale(ratio, ratio);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = 2.5;
    g.strokeStyle = "#111";
    const onKey = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("fa-noscroll");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("fa-noscroll");
    };
  }, []); // set up once

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const down = (event) => {
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    last.current = point(event);
    const g = canvasRef.current.getContext("2d");
    g.beginPath();
    g.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    g.fillStyle = "#111";
    g.fill();
    setEmpty(false);
  };
  const move = (event) => {
    if (!last.current) return;
    event.preventDefault();
    const p = point(event);
    const g = canvasRef.current.getContext("2d");
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  };
  const up = () => {
    last.current = null;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
  };
  const save = () => {
    // Fixed output size on white, whatever the screen: small, and readable when printed.
    const out = document.createElement("canvas");
    out.width = OUT_WIDTH;
    out.height = OUT_HEIGHT;
    const g = out.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, OUT_WIDTH, OUT_HEIGHT);
    g.drawImage(canvasRef.current, 0, 0, OUT_WIDTH, OUT_HEIGHT);
    onSave(out.toDataURL("image/png"));
  };

  return (
    <div className="fa-sheet-backdrop is-center" role="dialog" aria-modal="true" aria-label="Sign">
      <div className="fa-dialog fa-sig-dialog">
        <h2>Sign below</h2>
        <canvas
          ref={canvasRef}
          className={cx("fa-sig-canvas", empty && "is-empty")}
          aria-label="Signature pad"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        <div className="fa-dialog-actions">
          <button type="button" className="fa-btn fa-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="fa-btn fa-btn-secondary" onClick={clear} disabled={empty}><Eraser size={18} /> Clear</button>
          <button type="button" className="fa-btn fa-btn-primary" onClick={save} disabled={empty}>Save signature</button>
        </div>
      </div>
    </div>
  );
}
