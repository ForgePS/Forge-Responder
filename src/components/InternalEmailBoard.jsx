import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Inbox,
  Lock,
  Mail,
  MailOpen,
  Megaphone,
  PenSquare,
  Reply,
  Search,
  Send,
  Siren,
  Trash2,
  Users,
  X,
} from "lucide-react";
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

const EMPTY_FORM = { subject: "", body: "", recipients: ["g:all"], category: "message", priority: "normal" };

const CATEGORIES = [
  { id: "message", label: "Message", icon: Mail },
  { id: "announcement", label: "Announcement", icon: Megaphone },
  { id: "alert", label: "Alert", icon: Siren },
];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "high", label: "High priority" },
];

const AVATAR_TONES = 6;

function initials(name = "") {
  const parts = String(name).replace(/<.*?>/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function avatarTone(name = "") {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % AVATAR_TONES;
}

function Avatar({ name, size = "md" }) {
  return (
    <span className={`msg-avatar msg-avatar-${size} msg-tone-${avatarTone(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function toDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** Short time for the list: "9:42 AM" today, "Tue" this week, "Nov 3" this year, else "Nov 3, 2025". */
export function formatListTime(value, now = new Date()) {
  const date = toDate(value);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= startOfToday) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = (startOfToday - date) / 86400000;
  if (days < 1) return "Yesterday";
  if (days < 6) return date.toLocaleDateString([], { weekday: "short" });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatFullTime(value) {
  return toDate(value).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function preview(body = "") {
  const text = String(body).replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

function CategoryBadge({ category }) {
  if (!category || category === "message") return null;
  const meta = CATEGORIES.find((item) => item.id === category);
  const Icon = meta?.icon || Mail;
  return (
    <span className={`msg-badge msg-badge-${category}`}>
      <Icon size={12} /> {meta?.label || category}
    </span>
  );
}

function PriorityBadge({ priority }) {
  if (priority !== "high") return null;
  return <span className="msg-badge msg-badge-high">High priority</span>;
}

function Modal({ title, icon: Icon, onClose, className = "", children, footer }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className={`workflow-modal msg-modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <strong>{Icon ? <Icon size={15} /> : null} {title}</strong>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="modal-content">{children}</div>
        {footer ? <footer className="msg-modal-footer">{footer}</footer> : null}
      </section>
    </div>
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
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [reading, setReading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingGroups, setSavingGroups] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);

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
      setReading(false);
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
      const items = await listInternalEmails(scopeId, { uid: user?.uid, canManage });
      setMessages(items);
    } catch (error) {
      console.error("Failed to load internal emails", error);
      onMessage?.("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [scopeId, departmentScoped, user?.uid, canManage]);

  const inboxMessages = useMemo(
    () => messages.filter((message) => messageVisibleToUser(message, user, membership, personnel, customGroups)),
    [messages, user, membership, personnel, customGroups]
  );
  const sentMessages = useMemo(
    () => messages.filter((message) => message.fromUid === user?.uid),
    [messages, user?.uid]
  );
  const unreadCount = inboxMessages.filter((item) => isMessageUnread(item, user?.uid)).length;

  const visibleMessages = useMemo(() => {
    const base = folder === "sent" ? sentMessages : inboxMessages;
    const needle = query.trim().toLowerCase();
    return base.filter((message) => {
      if (filter === "unread" && !isMessageUnread(message, user?.uid)) return false;
      if (filter === "high" && message.priority !== "high") return false;
      if (!needle) return true;
      return [message.subject, message.body, message.fromName, message.recipientLabel]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [folder, sentMessages, inboxMessages, filter, query, user?.uid]);

  const selected = visibleMessages.find((item) => item.id === selectedId) || visibleMessages[0] || null;

  function changeFolder(next) {
    setFolder(next);
    setFilter("all");
    setSelectedId("");
    setReading(false);
  }

  async function openMessage(message) {
    if (!message) return;
    setSelectedId(message.id);
    setReading(true);
    if (isMessageUnread(message, user?.uid)) {
      setMessages((current) =>
        current.map((item) => (
          item.id === message.id
            ? { ...item, readBy: { ...(item.readBy || {}), [user.uid]: new Date().toISOString() } }
            : item
        ))
      );
      try {
        await markInternalEmailRead(scopeId, message.id, user.uid);
      } catch (error) {
        console.error("Failed to mark message read", error);
      }
    }
  }

  function startCompose(next = EMPTY_FORM) {
    setForm(next);
    setComposeOpen(true);
  }

  function startReply(message) {
    const subject = /^re:/i.test(message.subject || "") ? message.subject : `Re: ${message.subject || ""}`;
    const quoted = String(message.body || "").split("\n").map((line) => `> ${line}`).join("\n");
    startCompose({
      ...EMPTY_FORM,
      recipients: recipientOptionsByToken[`user:${message.fromUid}`] ? [`user:${message.fromUid}`] : [],
      subject,
      body: `\n\nOn ${formatFullTime(message.createdAt)}, ${message.fromName || "the sender"} wrote:\n${quoted}`,
    });
  }

  useEffect(() => {
    if (!composeOpen) return;
    const target = form.subject ? bodyRef.current : subjectRef.current;
    target?.focus();
    if (target === bodyRef.current) target.setSelectionRange(0, 0);
    // Focus once when the window opens.
  }, [composeOpen]);

  async function handleSaveGroups(nextGroups = customGroups) {
    if (!canManage || !scopeId) return;
    setSavingGroups(true);
    try {
      await saveInternalEmailGroups(scopeId, settings, nextGroups);
      await refreshDepartment?.();
      onMessage?.("Distribution groups saved");
      setGroupsOpen(false);
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
      setForm(EMPTY_FORM);
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

  const composeDirty = form.subject.trim() || form.body.trim();
  function closeCompose() {
    if (saving) return;
    if (composeDirty && !window.confirm("Discard this message?")) return;
    setComposeOpen(false);
  }

  function closeGroups() {
    if (savingGroups) return;
    setCustomGroups(settings?.internalEmailGroups || []);
    setGroupsOpen(false);
  }

  const emptyText = query.trim()
    ? "No messages match your search."
    : filter === "unread"
      ? "You're all caught up. No unread messages."
      : filter === "high"
        ? "No high-priority messages."
        : folder === "sent"
          ? "Messages you send will show up here."
          : "Your inbox is empty.";

  return (
    <section className={`msg-board ${compact ? "msg-board-compact" : ""} ${reading ? "is-reading" : ""}`}>
      <aside className="msg-rail">
        {canSend && (
          <button className="primary-button msg-compose-button" type="button" onClick={() => startCompose()}>
            <PenSquare size={15} /> <span>Compose</span>
          </button>
        )}
        <nav className="msg-folders" aria-label="Folders">
          <button type="button" className={folder === "inbox" ? "active" : ""} onClick={() => changeFolder("inbox")}>
            <Inbox size={16} /> <span>Inbox</span>
            {unreadCount ? <em className="msg-count">{unreadCount}</em> : null}
          </button>
          <button type="button" className={folder === "sent" ? "active" : ""} onClick={() => changeFolder("sent")}>
            <Send size={16} /> <span>Sent</span>
          </button>
          {canManage && (
            <button type="button" onClick={() => setGroupsOpen(true)}>
              <Users size={16} /> <span>Groups</span>
              {customGroups.length ? <em className="msg-count msg-count-muted">{customGroups.length}</em> : null}
            </button>
          )}
        </nav>
        <p className="msg-rail-note"><Lock size={13} /> Only {scopeLabel} personnel can see these messages.</p>
      </aside>

      <div className="msg-list-pane">
        <div className="msg-list-head">
          <label className="msg-search">
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={folder === "sent" ? "Search sent messages" : "Search messages"}
              aria-label="Search messages"
            />
          </label>
          <div className="msg-filters" role="tablist" aria-label="Filter">
            {FILTERS.filter((item) => folder === "inbox" || item.id !== "unread").map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={filter === item.id ? "active" : ""}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="msg-list">
          {loading ? (
            <div className="msg-skeletons" aria-label="Loading messages">
              {[0, 1, 2, 3].map((key) => <div key={key} className="msg-skeleton" />)}
            </div>
          ) : !visibleMessages.length ? (
            <div className="msg-empty">
              <MailOpen size={30} />
              <p>{emptyText}</p>
            </div>
          ) : visibleMessages.map((message) => {
            const unread = folder === "inbox" && isMessageUnread(message, user?.uid);
            const who = folder === "sent"
              ? `To: ${message.recipientLabel || "All personnel"}`
              : message.fromName || "Unknown sender";
            return (
              <button
                key={message.id}
                type="button"
                className={`msg-item ${selected?.id === message.id ? "active" : ""} ${unread ? "unread" : ""} ${message.priority === "high" ? "high" : ""}`}
                onClick={() => openMessage(message)}
              >
                <Avatar name={folder === "sent" ? message.recipientLabel : message.fromName} />
                <div className="msg-item-main">
                  <div className="msg-item-top">
                    <span className="msg-item-from">{who}</span>
                    <time dateTime={toDate(message.createdAt).toISOString()}>{formatListTime(message.createdAt)}</time>
                  </div>
                  <div className="msg-item-subject">
                    {unread ? <i className="msg-unread-dot" aria-label="Unread" /> : null}
                    <strong>{message.subject || "(No subject)"}</strong>
                  </div>
                  <p className="msg-item-preview">{preview(message.body)}</p>
                  {(message.priority === "high" || (message.category && message.category !== "message")) && (
                    <div className="msg-item-badges">
                      <PriorityBadge priority={message.priority} />
                      <CategoryBadge category={message.category} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="msg-reader">
        {selected ? (
          <article className="msg-detail">
            <div className="msg-detail-bar">
              <button type="button" className="secondary-button msg-back" onClick={() => setReading(false)}>
                <ArrowLeft size={14} /> Back
              </button>
              <div className="msg-detail-actions">
                {canSend && selected.fromUid && selected.fromUid !== user?.uid && (
                  <button type="button" className="secondary-button" onClick={() => startReply(selected)}>
                    <Reply size={14} /> Reply
                  </button>
                )}
                {canDeleteMessage(selected) && (
                  <button
                    type="button"
                    className="secondary-button msg-delete"
                    onClick={() => handleDelete(selected)}
                    disabled={deleting}
                  >
                    <Trash2 size={14} /> {deleting ? "Deleting..." : "Delete"}
                  </button>
                )}
              </div>
            </div>

            <header className="msg-detail-head">
              {(selected.priority === "high" || (selected.category && selected.category !== "message")) && (
                <div className="msg-item-badges">
                  <PriorityBadge priority={selected.priority} />
                  <CategoryBadge category={selected.category} />
                </div>
              )}
              <h2>{selected.subject || "(No subject)"}</h2>
              <div className="msg-sender">
                <Avatar name={selected.fromName} size="lg" />
                <div>
                  <strong>{selected.fromName || "Unknown sender"}</strong>
                  {selected.fromEmail ? <span>{selected.fromEmail}</span> : null}
                </div>
                <time dateTime={toDate(selected.createdAt).toISOString()}>{formatFullTime(selected.createdAt)}</time>
              </div>
              <p className="msg-to">
                <span>To</span>
                {selected.recipientLabel || buildRecipientLabel(selected.recipients, recipientOptionsByToken, customGroups)}
              </p>
            </header>

            <div className="msg-detail-body">{selected.body}</div>
          </article>
        ) : (
          <div className="msg-empty msg-empty-reader">
            <Mail size={34} />
            <p>{loading ? "Loading messages..." : "Select a message to read it."}</p>
          </div>
        )}
      </div>

      {composeOpen && (
        <Modal
          title="New message"
          icon={PenSquare}
          className="msg-compose"
          onClose={closeCompose}
          footer={(
            <>
              <span className="msg-hint">Ctrl + Enter to send</span>
              <button className="secondary-button" type="button" onClick={closeCompose} disabled={saving}>Cancel</button>
              <button className="primary-button" type="button" onClick={handleSend} disabled={saving}>
                <Send size={14} /> {saving ? "Sending..." : "Send"}
              </button>
            </>
          )}
        >
          <div
            className="msg-compose-form"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                handleSend();
              }
            }}
          >
            <EmailRecipientPicker
              value={form.recipients}
              options={recipientOptions}
              onChange={(recipients) => setForm((current) => ({ ...current, recipients }))}
            />
            <div className="msg-compose-options">
              <div className="msg-option">
                <span>Type</span>
                <div className="msg-segmented">
                  {CATEGORIES.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={form.category === id ? `active msg-seg-${id}` : ""}
                      onClick={() => setForm((current) => ({ ...current, category: id }))}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="msg-priority-toggle">
                <input
                  type="checkbox"
                  checked={form.priority === "high"}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.checked ? "high" : "normal" }))}
                />
                <span>High priority</span>
              </label>
            </div>
            <label className="msg-field">
              <span>Subject</span>
              <input
                ref={subjectRef}
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                placeholder="What is this about?"
              />
            </label>
            <label className="msg-field">
              <span>Message</span>
              <textarea
                ref={bodyRef}
                rows={9}
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                placeholder="Write your message..."
              />
            </label>
          </div>
        </Modal>
      )}

      {groupsOpen && canManage && (
        <Modal
          title="Distribution groups"
          icon={Users}
          className="msg-groups"
          onClose={closeGroups}
          footer={(
            <>
              <button className="secondary-button" type="button" onClick={closeGroups} disabled={savingGroups}>Cancel</button>
              <button className="primary-button" type="button" onClick={() => handleSaveGroups(customGroups)} disabled={savingGroups}>
                {savingGroups ? "Saving..." : "Save groups"}
              </button>
            </>
          )}
        >
          <InternalEmailGroupEditor
            groups={customGroups}
            memberOptions={recipientOptions}
            onChange={setCustomGroups}
          />
        </Modal>
      )}
    </section>
  );
}
