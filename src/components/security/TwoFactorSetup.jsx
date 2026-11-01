import { useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  confirmPassword,
  emailNowVerified,
  finishAuthenticatorSetup,
  startAuthenticatorSetup,
} from "../../lib/twoFactor.js";
import { sendVerificationEmail } from "../../lib/emailVerification.js";

function setupErrorMessage(error) {
  const code = error?.code || "";
  if (code === "auth/invalid-verification-code") return "That code didn't match. Check the app and try the newest code.";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "That password isn't right.";
  if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
    return "Two-factor login isn't switched on for FORGE Responder yet. Contact FORGE Public Safety.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "functions/resource-exhausted") return error.message || "A verification email was sent recently. Wait a minute and try again.";
  return error?.message || "Something went wrong. Try again.";
}

/**
 * Set up an authenticator app: (confirm password if asked) -> scan the QR code
 * or type the key -> enter a code -> sign in again so the session carries it.
 */
export default function TwoFactorSetup({ onCancel }) {
  const { user, signOut } = useAuth();
  const [step, setStep] = useState("intro");
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verifySent, setVerifySent] = useState(false);

  async function begin() {
    setBusy(true);
    setError("");
    if (!user?.emailVerified) {
      setStep("verify");
      setBusy(false);
      return;
    }
    try {
      const next = await startAuthenticatorSetup(user);
      setSetup(next);
      setQr(await QRCode.toDataURL(next.url, { margin: 1, width: 220 }));
      setStep("scan");
    } catch (beginError) {
      if (beginError?.code === "auth/requires-recent-login") setStep("password");
      else if (beginError?.code === "auth/unverified-email") setStep("verify");
      else setError(setupErrorMessage(beginError));
    } finally {
      setBusy(false);
    }
  }

  async function sendVerification() {
    setBusy(true);
    setError("");
    try {
      const result = await sendVerificationEmail();
      if (result.status === "already_verified") {
        setBusy(false);
        await checkVerified();
        return;
      }
      setVerifySent(true);
    } catch (sendError) {
      setError(setupErrorMessage(sendError));
    } finally {
      setBusy(false);
    }
  }

  async function checkVerified() {
    setBusy(true);
    setError("");
    try {
      if (await emailNowVerified(user)) {
        setBusy(false);
        await begin();
        return;
      }
      setError("Not verified yet. Click the link in the email, then press this again.");
    } catch (checkError) {
      setError(setupErrorMessage(checkError));
    }
    setBusy(false);
  }

  async function submitPassword(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await confirmPassword(user, password);
      setPassword("");
      await begin();
    } catch (passwordError) {
      setError(setupErrorMessage(passwordError));
      setBusy(false);
    }
  }

  async function submitCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finishAuthenticatorSetup(user, setup.secret, code);
      setStep("done");
    } catch (codeError) {
      setError(setupErrorMessage(codeError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="two-factor-setup">
      {step === "intro" && (
        <>
          <p>
            You'll need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.
            After this, signing in asks for your password and a 6-digit code from the app.
          </p>
          <div className="two-factor-actions">
            <button className="primary-button" type="button" onClick={begin} disabled={busy}>
              <ShieldCheck size={16} /> {busy ? "Starting…" : "Set up two-factor login"}
            </button>
            {onCancel && <button className="secondary-button" type="button" onClick={onCancel}>Later</button>}
          </div>
        </>
      )}

      {step === "verify" && (
        <>
          <p>
            First, confirm your email address ({user?.email}). We'll send a link; open it, then come back here.
          </p>
          <div className="two-factor-actions">
            <button className="primary-button" type="button" onClick={sendVerification} disabled={busy}>
              {verifySent ? "Send the email again" : "Send verification email"}
            </button>
            <button className="secondary-button" type="button" onClick={checkVerified} disabled={busy}>
              {"I've clicked the link"}
            </button>
          </div>
          {verifySent && <p className="auth-help">Sent. Check your inbox (and spam) for an email from FORGE Responder.</p>}
        </>
      )}

      {step === "password" && (
        <form onSubmit={submitPassword} className="auth-form">
          <p>For your security, confirm your password to continue.</p>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </form>
      )}

      {step === "scan" && setup && (
        <form onSubmit={submitCode} className="auth-form">
          <p>1. In your authenticator app, add an account and scan this code.</p>
          {qr && <img className="two-factor-qr" src={qr} alt="QR code for your authenticator app" width={220} height={220} />}
          <p className="auth-help">Can't scan? Enter this key instead: <code className="two-factor-key">{setup.key}</code></p>
          <label>
            <span>2. Enter the 6-digit code the app shows</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              autoFocus
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Turn on two-factor"}</button>
        </form>
      )}

      {step === "done" && (
        <>
          <p><strong>Two-factor login is on.</strong> Sign in again with your password and a code from the app to finish.</p>
          <button className="primary-button" type="button" onClick={signOut}>Sign in again</button>
        </>
      )}

      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}
