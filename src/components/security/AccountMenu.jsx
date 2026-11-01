import { useEffect, useRef, useState } from "react";
import { ChevronDown, KeyRound, LogOut, ShieldCheck, X } from "lucide-react";
import { accountErrorMessage, changePassword } from "../../lib/accountService.js";
import TwoFactorSetup from "./TwoFactorSetup.jsx";
import { SECOND_FACTOR_ENFORCED } from "../../lib/twoFactor.js";

/** Header profile button: change password, two-factor login, sign out. */
export default function AccountMenu({ initials, displayName, roleLabel, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function openDialog(name) {
    setOpen(false);
    setDialog(name);
  }

  return (
    <div className="account-menu" ref={ref}>
      <button className="profile-button" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Account">
        <span>{initials}</span>
        <div><strong>{displayName}</strong><small>{roleLabel}</small></div>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="account-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => openDialog("password")}><KeyRound size={15} /> Change password</button>
          {SECOND_FACTOR_ENFORCED ? (
            <button type="button" role="menuitem" onClick={() => openDialog("twofactor")}><ShieldCheck size={15} /> Two-factor login</button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}><LogOut size={15} /> Sign out</button>
        </div>
      )}
      {dialog && (
        <div className="modal-backdrop">
          <section className="workflow-modal account-modal" role="dialog" aria-label={dialog === "password" ? "Change password" : "Two-factor login"}>
            <header>
              <strong>{dialog === "password" ? "Change password" : "Two-factor login"}</strong>
              <button type="button" aria-label="Close" onClick={() => setDialog("")}><X size={16} /></button>
            </header>
            <div className="modal-content">
              {dialog === "password" ? <ChangePasswordForm onDone={() => setDialog("")} /> : <TwoFactorSetup onCancel={() => setDialog("")} />}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ChangePasswordForm({ onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (next.length < 6) { setError("Choose a password of at least 6 characters."); return; }
    if (next !== confirm) { setError("The new passwords don't match."); return; }
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (changeError) {
      setError(accountErrorMessage(changeError));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-form">
        <div className="success-banner" role="status">Your password was changed.</div>
        <button className="primary-button" type="button" onClick={onDone}>Done</button>
      </div>
    );
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label><span>Current password</span><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required autoFocus /></label>
      <label><span>New password</span><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required /></label>
      <label><span>Confirm new password</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}
