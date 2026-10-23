import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import TwoFactorSetup from "./TwoFactorSetup.jsx";

const HIDE_KEY = "rms-two-factor-reminder-hidden";

/** Department admins before the deadline: a small notice with a countdown. */
export default function TwoFactorReminder({ daysLeft, enrolled }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try { return window.sessionStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
  });

  if (hidden && !open) return null;

  function hide() {
    try { window.sessionStorage.setItem(HIDE_KEY, "1"); } catch { /* per-tab only */ }
    setHidden(true);
  }

  return (
    <>
      <div className="two-factor-reminder" role="status">
        <ShieldCheck size={18} />
        <span>
          {enrolled
            ? "Two-factor is set up. Sign in again with a code to use it."
            : `Admins must use two-factor login in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}
        </span>
        {enrolled
          ? <button className="primary-button" type="button" onClick={signOut}>Sign in again</button>
          : <button className="primary-button" type="button" onClick={() => setOpen(true)}>Set up now</button>}
        <button className="icon-button" type="button" aria-label="Hide for now" onClick={hide}><X size={16} /></button>
      </div>
      {open && (
        <div className="modal-backdrop">
          <section className="workflow-modal two-factor-modal" role="dialog" aria-label="Two-factor login">
            <header><strong>Two-factor login</strong><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button></header>
            <div className="modal-content">
              <TwoFactorSetup onCancel={() => setOpen(false)} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
