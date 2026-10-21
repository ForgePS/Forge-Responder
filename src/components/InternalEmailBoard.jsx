import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Inbox, Mail, Send, Trash2 } from "lucide-react";
import EmailRecipientPicker from "./EmailRecipientPicker.jsx";
import InternalEmailGroupEditor from "./InternalEmailGroupEditor.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { writeAuditLog } from "../lib/auditService.js";
import { listRecords } from "../lib/firestoreService.js";
import { listDepartmentPersonnel } from "../lib/personnelService.js";
import {
  buildRecipientLabel,
  buildRecipientOptions,
  buildRecipientOptionsMap,
} from "../lib/internalEmailRecipients.js";
import {
  deleteInternalEmail,
  isDepartmentEmailScope,
  isMessageUnread,
  listInternalEmails,
  markInternalEmailRead,
  messageVisibleToUser,
  resolveEmailBoardScopeId,
  saveInternalEmailGroups,
  seedInternalEmailsForScope,
  sendInternalEmail
} from "../lib/internalEmailService.js";
import { hasPermission } from "../lib/permissions.js";

function Panel({ title, icon: Icon, action, children }) {
  return (
    <section className="panel">
      <header><div><Icon size={15} /><strong>{title}</strong></div>{action}</header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export default function InternalEmailBoard({ compact = false, onMessage, personnelRecords = null }) {
  const { user, membership, permissions, isCreator } = useAuth();
  const { departmentId, profile, settings, refreshDepartment } = useTenant();
  const departmentScoped = isDepartmentEmailScope(departmentId);
  const scopeId = resolveEmailBoardScopeId(departmentId);
  const scopeLabel = profile?.shortName || profile?.name || scopeId || "Department";

  const [messages, setMessages] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [users, setUsers] = useState([]);
  const [customGroups, setCustomGroups] = useState(settings?.internalEmailGroups || []);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [folder, setFolder] = useState("inbox");
  const [composeOpen, setComposeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingGroups, setSavingGroups] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    body: "",
    recipients: ["g:all"],
    category: "message",
    priority: "normal"
  });

  const canSend = hasPermission(permissions, "sendInternalEmail") || isCreator;
  const canManage = hasPermission(permissions, "manageInternalEmail") || isCreator;

  function canDeleteMessage(message) {
    if (!message) return false;
    if (canManage) return true;
    return Boolean(canSend && user?.uid && message.fromUid === user.uid);
  }

  async function handleDelete(message) {
    if (!message || !scopeId || !canDeleteMessage(message)) return;
    const prompt = canManage && message.fromUid !== user?.uid
      ? `Delete "${message.subject}"? This removes the message for all recipients.`
      : `Delete "${message.subject}"?`;
    if (!window.confirm(prompt)) return;

    setDeleting(true);
    try {
      await deleteInternalEmail(scopeId, message.id);
      await writeAuditLog(scopeId, {
        action: "delete",
        module: "Messages",
        summary: `Deleted message: ${message.subject}`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email,
      });
      setMessages((current) => current.filter((item) => item.id !== message.id));
      setSelectedId((current) => (current === message.id ? "" : current));
      onMessage?.("Message deleted");
    } catch (error) {
      console.error("Failed to delete message", error);
      onMessage?.("Failed to delete message");
    } finally {
      setDeleting(false);
    }
  }

  const recipientOptions = useMemo(
    () => buildRecipientOptions({
      profile,
      personnel,
      users,
      customGroups,
    }),
    [profile, personnel, users, customGroups]
  );
  const recipientOptionsByToken = useMemo(
    () => buildRecipientOptionsMap(recipientOptions),
    [recipientOptions]
  );

  useEffect(() => {
    setCustomGroups(settings?.internalEmailGroups || []);
  }, [settings?.internalEmailGroups]);

  async function loadDirectory() {
    if (!departmentScoped || !scopeId) {
      setPersonnel([]);
      setUsers([]);
      return;
    }

    try {
      const [personnelItems, userItems] = await Promise.all([
        Array.isArray(personnelRecords)
          ? Promise.resolve(personnelRecords)
          : listDepartmentPersonnel(scopeId),
        listRecords(scopeId, "users"),
      ]);
      setPersonnel(personnelItems);
      setUsers(userItems);
    } catch (error) {
      console.error("Failed to load internal email directory", error);
    }
  }

  useEffect(() => {
    if (!departmentScoped || !scopeId) return;
    loadDirectory();
  }, [scopeId, departmentScoped, personnelRecords]);

  async function reload() {
    if (!departmentScoped || !scopeId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await seedInternalEmailsForScope(scopeId, user);
      const items = await listInternalEmails(scopeId);
      setMessages(items);
      if (!selectedId && items.length) {
        setSelectedId(items[0].id);
      }
    } catch (error) {
      console.error("Failed to load internal emails", error);
      onMessage?.("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [scopeId, departmentScoped]);

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      if (folder === "sent") return message.fromUid === user?.uid;
      return messageVisibleToUser(message, user, membership, personnel, customGroups);
    });
  }, [messages, folder, user, membership, personnel, customGroups]);

  const selected = visibleMessages.find((item) => item.id === selectedId) || visibleMessages[0] || null;
  const unreadCount = visibleMessages.filter((item) => isMessageUnread(item, user?.uid)).length;

  async function openMessage(message) {
    if (!message) return;
    setSelectedId(message.id);
    if (isMessageUnread(message, user?.uid)) {
      await markInternalEmailRead(scopeId, message.id, user.uid);
      setMessages((current) =>
        current.map((item) => (
          item.id === message.id
            ? { ...item, readBy: { ...(item.readBy || {}), [user.uid]: new Date().toISOString() } }
            : item
        ))
      );
    }
  }

  async function handleSaveGroups(nextGroups = customGroups) {
    if (!canManage || !scopeId) return;
    setSavingGroups(true);
    try {
      await saveInternalEmailGroups(scopeId, settings, nextGroups);
      await refreshDepartment?.();
      onMessage?.("Distribution groups saved");
    } catch (error) {
      console.error("Failed to save internal email groups", error);
      onMessage?.("Could not save distribution groups");
    } finally {
      setSavingGroups(false);
    }
  }

  async function handleSend() {
    if (!departmentScoped || !scopeId) {
      onMessage?.("Messages are only available inside a department platform.");
      return;
    }
    if (!canSend) {
      onMessage?.("You do not have permission to send messages.");
      return;
    }
    if (!form.recipients.length) {
      onMessage?.("Choose at least one recipient.");
      return;
    }
    if (!form.subject.trim() || !form.body.trim()) {
      onMessage?.("Subject and message body are required.");
      return;
    }

    setSaving(true);
    try {
      const recipientLabel = buildRecipientLabel(form.recipients, recipientOptionsByToken, customGroups);
      await sendInternalEmail(scopeId, {
        subject: form.subject.trim(),
        body: form.body.trim(),
        recipients: form.recipients,
        recipientLabel,
        recipientOptionsByToken,
        customGroups,
        category: form.category,
        priority: form.priority,
        fromUid: user?.uid,
        fromName: membership?.displayName || user?.displayName || user?.email || "User",
        fromEmail: membership?.email || user?.email || "",
        scopeLabel
      });
      await writeAuditLog(scopeId, {
        action: "create",
        module: "Messages",
        summary: `Sent message: ${form.subject.trim()}`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email
      });
      setComposeOpen(false);
      setForm({ subject: "", body: "", recipients: ["g:all"], category: "message", priority: "normal" });
      onMessage?.("Message sent");
      await reload();
    } catch (error) {
      console.error("Failed to send internal email", error);
      onMessage?.("Failed to send message");
    } finally {
      setSaving(false);
    }
  }

  if (!departmentScoped) {
    return (
      <section className="internal-email-board internal-email-board-unavailable">
        <p className="auth-help">
          Messages live inside each department platform. Open a department workspace or visit a department portal
          (for example <strong>/your-department-id</strong>) to use the agency inbox.
        </p>
        <p className="auth-help">
          Enable the module per branch under Creator Console → <strong>Department Modules</strong>.
        </p>
      </section>
    );
  }

  if (loading) {
    return <p className="auth-help">Loading messages...</p>;
  }

  return (
    <section className={`internal-email-board ${compact ? "internal-email-board-compact" : ""}`}>
      <div className="internal-email-toolbar">
        <div className="internal-email-scope">
          <Mail size={16} />
          <div>
            <strong>{scopeLabel}</strong>
            <span>Department messages — visible only to this agency</span>
          </div>
        </div>
        <div className="segmented-control">
          <button type="button" className={folder === "inbox" ? "active" : ""} onClick={() => setFolder("inbox")}>
            Inbox{unreadCount ? ` (${unreadCount})` : ""}
          </button>
          <button type="button" className={folder === "sent" ? "active" : ""} onClick={() => setFolder("sent")}>Sent</button>
        </div>
        {canSend && (
          <button className="primary-button" type="button" onClick={() => setComposeOpen((open) => !open)}>
            <CirclePlus size={14} /> Compose
          </button>
        )}
      </div>

      {composeOpen && (
        <Panel title="Compose Message" icon={Send}>
          <div className="workflow-form">
            <EmailRecipientPicker
              value={form.recipients}
              options={recipientOptions}
              onChange={(recipients) => setForm({ ...form, recipients })}
            />
            <label><span>Category</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="message">Message</option>
                <option value="announcement">Announcement</option>
                <option value="alert">Alert</option>
              </select>
            </label>
            <label><span>Priority</span>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="wide-field"><span>Subject</span>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject line" />
            </label>
            <label className="wide-field"><span>Message</span>
              <textarea
                rows={5}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write your internal message..."
              />
            </label>
          </div>
          <div className="platform-config-actions">
            <button className="secondary-button" type="button" onClick={() => setComposeOpen(false)}>Cancel</button>
            <button className="primary-button" type="button" onClick={handleSend} disabled={saving}>
              <Send size={14} /> {saving ? "Sending..." : "Send message"}
            </button>
          </div>
        </Panel>
      )}

      {canManage && (
        <Panel title="Distribution Groups" icon={Mail}>
          <InternalEmailGroupEditor
            groups={customGroups}
            memberOptions={recipientOptions}
            onChange={setCustomGroups}
          />
          <div className="platform-config-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => handleSaveGroups(customGroups)}
              disabled={savingGroups}
            >
              {savingGroups ? "Saving..." : "Save groups"}
            </button>
          </div>
        </Panel>
      )}

      <section className="internal-email-workspace">
        <Panel title={folder === "sent" ? "Sent Messages" : "Inbox"} icon={Inbox}>
          <div className="internal-email-list">
            {!visibleMessages.length && (
              <p className="empty-table">No messages in this folder yet.</p>
            )}
            {visibleMessages.map((message) => (
              <button
                key={message.id}
                type="button"
                className={`internal-email-item ${selected?.id === message.id ? "active" : ""} ${isMessageUnread(message, user?.uid) ? "unread" : ""}`}
                onClick={() => openMessage(message)}
              >
                <div className="internal-email-item-head">
                  <strong>{message.subject}</strong>
                  {message.priority === "high" && <span className="badge badge-critical">High</span>}
                </div>
                <span>{message.fromName || "Unknown sender"} · {message.recipientLabel || "All personnel"}</span>
                <small>{new Date(message.createdAt || Date.now()).toLocaleString()}</small>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Message" icon={Mail} action={selected && canDeleteMessage(selected) ? (
          <button
            type="button"
            className="row-action danger internal-email-delete"
            onClick={() => handleDelete(selected)}
            disabled={deleting}
          >
            <Trash2 size={14} /> {deleting ? "Deleting..." : "Delete"}
          </button>
        ) : null}>
          {selected ? (
            <article className="internal-email-detail">
              <header>
                <h2>{selected.subject}</h2>
                <p>
                  <strong>From:</strong> {selected.fromName} {selected.fromEmail ? `<${selected.fromEmail}>` : ""}
                </p>
                <p><strong>To:</strong> {selected.recipientLabel || buildRecipientLabel(selected.recipients, recipientOptionsByToken, customGroups)}</p>
                <p><strong>Sent:</strong> {new Date(selected.createdAt || Date.now()).toLocaleString()}</p>
                {selected.category && <p><strong>Type:</strong> {selected.category}</p>}
              </header>
              <div className="internal-email-body">{selected.body}</div>
            </article>
          ) : (
            <p className="auth-help">Select a message to read it.</p>
          )}
        </Panel>
      </section>
    </section>
  );
}
