import { useEffect, useState } from "react";
import { Copy, MailPlus, X } from "lucide-react";
import {
  createInvite,
  inviteErrorMessage,
  listPendingInvites,
  revokeInvite,
} from "../lib/inviteService.js";

const EMAIL_STATUS_TEXT = {
  sent: "Email sent.",
  not_configured: "Email isn't set up for this platform yet — copy the link and send it yourself.",
  failed: "The email could not be sent — copy the link and send it yourself.",
  skipped: "Copy the link and send it yourself.",
};

function formatDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : "";
}

/**
 * Invite people to the department by email. The server creates their membership
 * when they open the link and sign in with that email.
 */
export default function DepartmentInvitesPanel({ departmentId, roles = [], onMessage, onInvitesChanged }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleIds, setRoleIds] = useState(["firefighter"]);
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [lastInvite, setLastInvite] = useState(null);
  const [pending, setPending] = useState([]);
  const [pendingError, setPendingError] = useState("");

  const assignableRoles = roles.filter((role) => role.id !== "creator");

  async function loadPending() {
    try {
      setPending(await listPendingInvites(departmentId));
      setPendingError("");
    } catch (loadError) {
      console.warn("Could not load pending invites", loadError);
      setPendingError("Pending invites are only visible to department administrators.");
    }
  }

  useEffect(() => {
    if (departmentId) loadPending();
  }, [departmentId]);

  useEffect(() => {
    // Default to a valid role if "firefighter" doesn't exist in this department.
    if (assignableRoles.length && !roleIds.some((id) => assignableRoles.some((role) => role.id === id))) {
      setRoleIds([assignableRoles[0].id]);
    }
  }, [roles]);

  function toggleRole(roleId) {
    setRoleIds((current) => (current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId]));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLastInvite(null);
    if (!roleIds.length) {
      setError("Pick at least one role.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createInvite({ departmentId, email: email.trim(), displayName: displayName.trim(), roleIds, sendEmail });
      setLastInvite({ ...result, email: email.trim().toLowerCase() });
      setEmail("");
      setDisplayName("");
      onMessage?.(`Invite created for ${email.trim()}`);
      await loadPending();
      onInvitesChanged?.();
    } catch (submitError) {
      setError(inviteErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(url) {
    try {
      await navigator.clipboard.writeText(url);
      onMessage?.("Invite link copied");
    } catch {
      window.prompt("Copy this invite link:", url);
    }
  }

  async function handleRevoke(invite) {
    if (!window.confirm(`Cancel the invite for ${invite.email}?`)) return;
    try {
      await revokeInvite(invite.id);
      onMessage?.(`Invite for ${invite.email} cancelled`);
      if (lastInvite?.inviteId === invite.id) setLastInvite(null);
      await loadPending();
    } catch (revokeError) {
      onMessage?.(inviteErrorMessage(revokeError));
    }
  }

  return (
    <article className="role-permissions-card department-invites-panel">
      <header className="role-permissions-header">
        <div>
          <strong><MailPlus size={16} /> Invite a user</strong>
          <span>
            They open the link, sign in or create an account with this email, and get access with the roles you pick.
          </span>
        </div>
      </header>

      <form className="department-invite-form" onSubmit={handleSubmit}>
        <div className="department-invite-fields">
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@department.org" required />
          </label>
          <label>
            <span>Name (optional)</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jordan Smith" />
          </label>
        </div>

        <fieldset className="department-invite-roles">
          <legend>Roles</legend>
          <div className="user-role-grid compact-role-grid">
            {assignableRoles.map((role) => (
              <label className="permission-toggle permission-check" key={role.id}>
                <input type="checkbox" checked={roleIds.includes(role.id)} onChange={() => toggleRole(role.id)} />
                <span>{role.name || role.id}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="permission-toggle permission-check">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          <span>Email the invite link</span>
        </label>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? "Creating invite..." : "Create invite"}
        </button>
      </form>

      {lastInvite && (
        <div className="department-invite-result" role="status">
          <p className="auth-help">
            Invite ready for <strong>{lastInvite.email}</strong>. {EMAIL_STATUS_TEXT[lastInvite.emailStatus] || ""}
            {" "}This link is shown only once and expires on {formatDate(lastInvite.expiresAt)}.
          </p>
          <div className="department-invite-link">
            <code>{lastInvite.inviteUrl}</code>
            <button className="secondary-button" type="button" onClick={() => handleCopy(lastInvite.inviteUrl)}>
              <Copy size={14} /> Copy link
            </button>
          </div>
        </div>
      )}

      <section className="department-invite-pending">
        <strong>Pending invites</strong>
        {pendingError && <p className="auth-help">{pendingError}</p>}
        {!pendingError && !pending.length && <p className="auth-help">No pending invites.</p>}
        {pending.length > 0 && (
          <ul>
            {pending.map((invite) => (
              <li key={invite.id}>
                <span>
                  <strong>{invite.displayName || invite.email}</strong>
                  {invite.displayName && <> · {invite.email}</>}
                  {" · "}{(invite.roleIds || []).join(", ")}
                  {" · expires "}{formatDate(invite.expiresAt)}
                </span>
                <button className="text-button" type="button" onClick={() => handleRevoke(invite)} aria-label={`Cancel invite for ${invite.email}`}>
                  <X size={14} /> Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
