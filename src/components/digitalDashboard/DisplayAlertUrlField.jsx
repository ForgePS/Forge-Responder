import { useState } from "react";
import { Check, Copy, ExternalLink, QrCode } from "lucide-react";

export default function DisplayAlertUrlField({
  url = "",
  label = "Alert display URL",
  compact = false,
}) {
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!url) {
    return (
      <p className="dd-display-url-empty">
        Save this device to generate its alert display URL for MVIX / signage sticks.
      </p>
    );
  }

  const qrSrc = `https://quickchart.io/qr?size=160&margin=1&text=${encodeURIComponent(url)}`;

  return (
    <div className={`dd-display-url-field ${compact ? "is-compact" : ""}`}>
      <p className="dd-display-url-label">{label}</p>
      <input
        className="dd-display-url-input"
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
      />
      <div className="dd-display-url-actions">
        <button type="button" className="dd-action-button" onClick={copyUrl}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy URL"}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="dd-action-button">
          <ExternalLink size={15} />
          Open display
        </a>
      </div>
      {!compact ? (
        <div className="dd-display-url-qr">
          <img src={qrSrc} alt="QR code for alert display URL" width={120} height={120} />
          <span><QrCode size={12} /> Scan to open on a stick</span>
        </div>
      ) : null}
    </div>
  );
}
