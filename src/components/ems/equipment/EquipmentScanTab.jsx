import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine, Search } from "lucide-react";
import { Panel } from "../../shell/ui.jsx";
import { describeAssignment, findEquipment } from "../../../lib/ems/equipmentDisplay.js";

const WANTED_FORMATS = ["qr_code", "code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "upc_a", "upc_e", "data_matrix", "itf"];

/** The browser's own barcode reader, where it has one (Chrome on Android, Edge, Chrome on Mac). */
function hasBarcodeDetector() {
  return typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Find equipment by scanning its QR label or barcode with the camera, or by
 * typing (or using a handheld scanner, which types) its equipment ID, serial
 * number or barcode. A phone's own camera app also opens QR labels directly.
 */
export default function EquipmentScanTab({ equipment, onOpen }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const inputRef = useRef(null);
  const equipmentRef = useRef(equipment);
  equipmentRef.current = equipment;
  const supported = hasBarcodeDetector();

  function lookup(text) {
    const found = findEquipment(text, equipmentRef.current);
    setResult({ text, ...found });
    if (found.match) onOpen(found.match.id);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => stopCamera, []);

  useEffect(() => {
    if (!cameraOn) return undefined;
    let cancelled = false;
    let timer = 0;
    (async () => {
      try {
        const formats = (await Promise.resolve(window.BarcodeDetector.getSupportedFormats?.()).catch(() => [])) || [];
        const usable = WANTED_FORMATS.filter((f) => !formats.length || formats.includes(f));
        const detector = new window.BarcodeDetector({ formats: usable.length ? usable : ["qr_code"] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (cancelled) return;
          try {
            const codes = await detector.detect(video);
            const code = codes.find((c) => c.rawValue)?.rawValue;
            if (code) {
              stopCamera();
              setValue(code);
              lookup(code);
              return;
            }
          } catch { /* frame not ready yet */ }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch (error) {
        setCameraError(error?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera for this site, or type the code below."
          : "The camera couldn't start. Type the code below instead.");
        stopCamera();
      }
    })();
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  function submit(event) {
    event.preventDefault();
    if (value.trim()) lookup(value);
    inputRef.current?.select();
  }

  return (
    <Panel title="Scan equipment" icon={ScanLine}>
      <div className="ems-scan">
        {supported ? (
          <div className="ems-scan-camera">
            {cameraOn ? (
              <>
                <video ref={videoRef} className="ems-scan-video" muted playsInline aria-label="Camera view" />
                <button type="button" className="secondary-button" onClick={stopCamera}><CameraOff size={16} /> Stop camera</button>
              </>
            ) : (
              <button type="button" className="primary-button ems-scan-start" onClick={() => { setCameraError(""); setResult(null); setCameraOn(true); }}>
                <Camera size={18} /> Scan with camera
              </button>
            )}
            {cameraError ? <p className="checklist-missing-alert" role="alert">{cameraError}</p> : null}
          </div>
        ) : (
          <p className="occupancy-muted">
            This browser can't read codes with the camera here. On a phone, point the phone's own camera app at the QR label:
            it opens the record. Or type the code below.
          </p>
        )}
        <form className="ems-scan-form" onSubmit={submit}>
          <label className="config-field">
            <span>Equipment ID, serial number or barcode</span>
            <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} autoFocus={!supported}
              autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          </label>
          <button type="submit" className="primary-button"><Search size={16} /> Find</button>
        </form>
        <p className="occupancy-muted ems-hint">A handheld barcode scanner works here too: click the box and scan.</p>
        {result && !result.match ? (
          result.matches.length > 1 ? (
            <div className="ems-scan-results">
              <p>{result.matches.length} pieces of equipment match “{result.text}”. Choose one:</p>
              <ul>
                {result.matches.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="link-button" onClick={() => onOpen(e.id)}>
                      {e.name} · {e.assetNumber} · {describeAssignment(e.assignment)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="checklist-missing-alert" role="alert">No equipment in this department matches “{result.text}”.</p>
          )
        ) : null}
        {result?.match ? <p className="df-success" role="status">Opened {result.match.name} ({result.match.assetNumber}).</p> : null}
      </div>
    </Panel>
  );
}
