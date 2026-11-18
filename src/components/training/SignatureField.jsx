import { useEffect, useRef, useState } from "react";

/**
 * Finger/mouse signature captured as a PNG data URL, with the signer's typed
 * name and the time. onChange(null) when cleared.
 */
export default function SignatureField({ label = "Signature", signerName = "", value, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [name, setName] = useState(value?.name || signerName);
  const [hasInk, setHasInk] = useState(Boolean(value?.image));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    if (value?.image) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value.image;
    }
    // Draw only once on mount; later updates come from the pad itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvasRef.current.width, ((e.clientY - r.top) / r.height) * canvasRef.current.height];
  };
  const down = (e) => { drawing.current = true; canvasRef.current.setPointerCapture?.(e.pointerId); const [x, y] = pos(e); const ctx = canvasRef.current.getContext("2d"); ctx.beginPath(); ctx.moveTo(x, y); };
  const moveTo = (e) => { if (!drawing.current) return; const [x, y] = pos(e); const ctx = canvasRef.current.getContext("2d"); ctx.lineTo(x, y); ctx.stroke(); setHasInk(true); };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange({ image: canvasRef.current.toDataURL("image/png"), name, signedAt: new Date().toISOString() });
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange(null);
  };
  return (
    <div className="trn-signature">
      <span>{label}</span>
      <canvas ref={canvasRef} width={600} height={160} onPointerDown={down} onPointerMove={moveTo} onPointerUp={up} onPointerLeave={up} aria-label={`${label} pad`} role="img" />
      <div className="trn-inline">
        <input value={name} onChange={(e) => { setName(e.target.value); if (value) onChange({ ...value, name: e.target.value }); }} placeholder="Printed name" aria-label={`${label} printed name`} />
        <button type="button" className="text-button" onClick={clear} disabled={!hasInk}>Clear</button>
      </div>
    </div>
  );
}
