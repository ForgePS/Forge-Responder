import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { onSaveFailed } from "../lib/saveNotice.js";

/** Shows "Not saved" notices raised anywhere in the app (lib/saveNotice.js). */
export default function SaveFailedNotice() {
  const [notice, setNotice] = useState(null);

  useEffect(() => onSaveFailed((detail) => setNotice(detail)), []);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className="save-failed-notice" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>Not saved: {notice.what}</strong>
        <span>{notice.reason}</span>
      </div>
      <button className="icon-button" type="button" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button>
    </div>
  );
}
