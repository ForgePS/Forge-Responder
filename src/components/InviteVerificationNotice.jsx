import { useState } from "react";
import { MailCheck, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { sendVerificationEmail } from "../lib/emailVerification.js";

/**
 * Shown when an invite was refused only because the signed-in account's email
 * address isn't verified yet. Lets the person send the verification email and
 * retry the invite once they've clicked the link.
 */
export default function InviteVerificationNotice() {
  const { user, inviteNeedsVerification, retryPendingInvite } = useAuth();
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [status, setStatus] = useState("");

  if (!user || !inviteNeedsVerification) return null;

  async function handleSend() {
    setSending(true);
    setStatus("");
    try {
      await sendVerificationEmail(user);
      setStatus(`Verification email sent to ${user.email}. Open the link in it, then come back and click "I've verified — try again".`);
    } catch (error) {
      console.warn("Could not send verification email", error);
      setStatus(
        error?.code === "functions/resource-exhausted" || error?.code === "auth/too-many-requests"
          ? "A verification email was sent recently. Check your inbox (and spam folder), or wait a few minutes and try again."
          : "We couldn't send the verification email. Please try again in a moment."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    setStatus("");
    try {
      const result = await retryPendingInvite?.();
      if (result && !result.verified) {
        setStatus("Your email address isn't verified yet. Open the link in the verification email, then try again.");
      }
    } catch (error) {
      console.warn("Retrying the invite failed", error);
      setStatus("Something went wrong. Please try again in a moment.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="auth-help" role="status">
      <p>
        To accept the invite, verify your email address (<strong>{user.email}</strong>) first.
      </p>
      <div className="platform-config-actions">
        <button className="secondary-button" type="button" onClick={handleSend} disabled={sending || retrying}>
          <MailCheck size={14} /> {sending ? "Sending..." : "Send verification email"}
        </button>
        <button className="primary-button" type="button" onClick={handleRetry} disabled={sending || retrying}>
          <RefreshCw size={14} /> {retrying ? "Checking..." : "I've verified — try again"}
        </button>
      </div>
      {status && <p>{status}</p>}
    </div>
  );
}
