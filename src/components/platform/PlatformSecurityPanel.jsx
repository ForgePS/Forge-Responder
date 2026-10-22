import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "../../lib/firebaseClient.js";

/** Creators: reset someone's two-factor login (lost or replaced phone). */
export default function PlatformSecurityPanel() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reset(event) {
    event.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    if (!window.confirm(`Reset two-factor login for ${target}? Only do this after confirming who is asking. They will set it up again at their next sign-in.`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const call = httpsCallable(getFirebaseFunctions(), "resetTwoFactor");
      await call({ email: target });
      setMessage(`Two-factor login was reset for ${target}. They sign in with their password and set it up again.`);
      setEmail("");
    } catch (resetError) {
      setError(resetError?.message || "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="platform-security-panel">
      <p className="auth-help">
        Platform creators must always use two-factor login; department admins must after the deadline set with
        <code> scripts/two-factor.mjs --start-admin-grace</code>. If someone loses or replaces their phone, reset their
        two-factor here after confirming who they are. For your own account, use <code>scripts/two-factor.mjs --reset</code>.
      </p>
      <form className="auth-form" onSubmit={reset} style={{ maxWidth: 420 }}>
        <label>
          <span>Account email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="chief@department.gov" required />
        </label>
        <button className="secondary-button" type="submit" disabled={busy}>{busy ? "Resetting…" : "Reset two-factor login"}</button>
      </form>
      {message && <div className="success-banner" role="status">{message}</div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}
