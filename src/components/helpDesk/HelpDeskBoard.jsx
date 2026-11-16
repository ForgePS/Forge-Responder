import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileText,
  Inbox,
  LifeBuoy,
  Lock,
  MailCheck,
  Paperclip,
  PenSquare,
  RotateCcw,
  Search,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTenant } from "../../context/TenantContext.jsx";
import {
  ACTIVE_STATUSES,
  ATTACHMENT_LIMITS,
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  categoryLabel,
  priorityLabel,
  statusLabel,
} from "../../lib/helpDesk/constants.js";
import {
  addMessage,
  captureContext,
  createTicket,
  helpDeskError,
  listAssignees,
  openAttachment,
  subscribeMessages,
  subscribeNotifications,
  subscribeTickets,
  updateTicket,
  validateFiles,
} from "../../lib/helpDesk/helpDeskService.js";

const AVATAR_TONES = 6;

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function avatarTone(name = "") {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % AVATAR_TONES;
}

function Avatar({ name, size = "md" }) {
  return <span className={`msg-avatar msg-avatar-${size} msg-tone-${avatarTone(name)}`} aria-hidden="true">{initials(name)}</span>;
}

function toDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatListTime(value, now = new Date()) {
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
  return toDate(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatBytes(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function preview(text = "") {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
}

export function StatusBadge({ status, requester = false }) {
  return <span className={`msg-badge hd-status hd-status-${status}`}>{statusLabel(status, { requester })}</span>;
}

function PriorityBadge({ priority, always = false }) {
  if (!always && !["high", "urgent"].includes(priority)) return null;
  return <span className={`msg-badge hd-priority hd-priority-${priority}`}>{priorityLabel(priority)}</span>;
}

function Modal({ title, icon: Icon, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="workflow-modal msg-modal hd-modal" role="dialog" aria-modal="true" aria-label={title}>
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

function FilePicker({ files, onChange, onError, id }) {
  const inputRef = useRef(null);
  function add(list) {
    const next = [...files, ...Array.from(list || [])];
    const problem = validateFiles(next);
    if (problem) {
      onError?.(problem);
      return;
    }
    onError?.("");
    onChange(next);
  }
  return (
    <div className="hd-files">
      <input
        ref={inputRef}
        id={id}
        type="file"
        multiple
        accept={ATTACHMENT_LIMITS.accept}
        hidden
        onChange={(event) => { add(event.target.files); event.target.value = ""; }}
      />
      <button type="button" className="secondary-button hd-attach" onClick={() => inputRef.current?.click()} disabled={files.length >= ATTACHMENT_LIMITS.count}>
        <Paperclip size={15} /> Attach files
      </button>
      {files.map((file, index) => (
        <span key={`${file.name}-${index}`} className="hd-file-chip">
          <FileText size={13} /> <span>{file.name}</span> <small>{formatBytes(file.size)}</small>
          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))}><X size={13} /></button>
        </span>
      ))}
    </div>
  );
}

function AttachmentList({ attachments = [], onError }) {
  const [opening, setOpening] = useState("");
  if (!attachments.length) return null;
  async function open(file) {
    setOpening(file.path);
    try {
      await openAttachment(file);
    } catch (error) {
      onError?.(helpDeskError(error, "That file couldn't be opened."));
    } finally {
      setOpening("");
    }
  }
  return (
    <ul className="hd-attachments">
      {attachments.map((file) => (
        <li key={file.path}>
          <button type="button" onClick={() => open(file)} disabled={opening === file.path}>
            <Paperclip size={13} /> <span>{file.name}</span> <small>{opening === file.path ? "Opening…" : formatBytes(file.size)}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

const EMPTY_REQUEST = { subject: "", category: "bug", priority: "normal", description: "" };

function NewRequestModal({ departmentId, departmentName, contextPage, onClose, onCreated }) {
  const { user } = useAuth();
  const { platformConfig } = useTenant();
  const releaseVersion = platformConfig?.version || "";
  const [form, setForm] = useState(EMPTY_REQUEST);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const context = useMemo(() => captureContext(contextPage, { releaseVersion }), [contextPage, releaseVersion]);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event?.preventDefault();
    if (form.subject.trim().length < 3) return setError("Add a short subject.");
    if (!form.description.trim()) return setError("Describe what you need help with.");
    setSaving(true);
    setError("");
    try {
      const result = await createTicket({ ...form, departmentId, uid: user.uid, files, page: contextPage, releaseVersion });
      onCreated?.(result);
    } catch (err) {
      setError(helpDeskError(err, "Your request couldn't be sent. Please try again."));
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New help request"
      icon={LifeBuoy}
      onClose={saving ? undefined : onClose}
      footer={(
        <>
          <span className="msg-hint">Goes to FORGE support{departmentName ? ` and ${departmentName}'s admins` : ""}.</span>
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="hd-new-request" className="primary-button" disabled={saving}>
            <Send size={15} /> {saving ? "Sending…" : "Send request"}
          </button>
        </>
      )}
    >
      <form id="hd-new-request" className="msg-compose-form hd-form" onSubmit={submit}>
        {error ? <p className="banner error" role="alert">{error}</p> : null}
        <label className="msg-field">
          <span>Subject</span>
          <input value={form.subject} onChange={set("subject")} maxLength={160} placeholder="e.g. Time card won't save" autoFocus />
        </label>
        <div className="hd-form-row">
          <label className="msg-field">
            <span>Category</span>
            <select value={form.category} onChange={set("category")}>
              {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <small className="hd-field-hint">{CATEGORIES.find((item) => item.id === form.category)?.hint}</small>
          </label>
          <label className="msg-field">
            <span>Priority</span>
            <select value={form.priority} onChange={set("priority")}>
              {PRIORITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <small className="hd-field-hint">{PRIORITIES.find((item) => item.id === form.priority)?.hint}</small>
          </label>
        </div>
        <label className="msg-field">
          <span>Description</span>
          <textarea
            value={form.description}
            onChange={set("description")}
            maxLength={8000}
            placeholder={"What happened, what you expected, and the steps to see it.\nInclude record numbers or names if it's about specific data."}
          />
        </label>
        <div className="msg-field">
          <span>Screenshots or files <small className="hd-optional">optional · up to 5, 10 MB each</small></span>
          <FilePicker id="hd-new-files" files={files} onChange={setFiles} onError={setError} />
        </div>
        <details className="hd-context">
          <summary>Sent with your request</summary>
          <dl>
            <div><dt>Page</dt><dd>{context.page || "—"}</dd></div>
            <div><dt>Browser</dt><dd>{context.browser || "—"}</dd></div>
            <div><dt>App version</dt><dd>{context.appVersion || "—"}</dd></div>
            <div><dt>Screen</dt><dd>{context.viewport || "—"}</dd></div>
          </dl>
          <p>Plus your name, email and department, so we can reply.</p>
        </details>
      </form>
    </Modal>
  );
}

function eventText(message, requester) {
  if (message.kind === "status" && message.statusChange) {
    return `changed the status to ${statusLabel(message.statusChange.to, { requester })}`;
  }
  if (message.kind === "assignment") {
    return message.assignment?.toUid ? `assigned this to ${message.assignment.toName || "someone"}` : "removed the assignee";
  }
  if (message.kind === "update" && message.change) {
    const label = message.change.field === "priority" ? priorityLabel : categoryLabel;
    return `changed ${message.change.field} to ${label(message.change.to)}`;
  }
  return "updated this request";
}

function Thread({ messages, requester, onError }) {
  if (!messages.length) return <p className="hd-thread-empty">No replies yet.</p>;
  return (
    <ol className="hd-thread">
      {messages.map((message) => {
        if (!["reply", "note"].includes(message.kind)) {
          return (
            <li key={message.id} className="hd-event">
              <CircleDot size={12} /> <strong>{message.authorName}</strong> {eventText(message, requester)}
              <time>{formatFullTime(message.createdAt)}</time>
            </li>
          );
        }
        const note = message.kind === "note";
        return (
          <li key={message.id} className={`hd-message ${note ? "is-note" : ""} ${message.authorRole === "staff" ? "is-staff" : "is-requester"}`}>
            <div className="hd-message-head">
              <Avatar name={message.authorName} />
              <div>
                <strong>{message.authorName}</strong>
                <span>
                  {note ? <><Lock size={11} /> Internal note</> : message.authorRole === "staff" ? (message.staffScope === "platform" ? "FORGE support" : "Department admin") : "Requester"}
                </span>
              </div>
              <time>{formatFullTime(message.createdAt)}</time>
            </div>
            <div className="hd-message-body">{message.body}</div>
            {message.statusChange ? <p className="hd-message-status">Status → {statusLabel(message.statusChange.to, { requester })}</p> : null}
            <AttachmentList attachments={message.attachments} onError={onError} />
          </li>
        );
      })}
    </ol>
  );
}

const NOTIFICATION_KINDS = {
  new_ticket: "New request → help desk list",
  requester_reply: "Reply → requester",
  requester_status: "Status change → requester",
  staff_reply: "Requester replied → staff",
  assigned: "Assignment → assignee",
};
const DELIVERY_LABELS = {
  sent: "Sent",
  logged: "Logged (not sent)",
  demo_not_sent: "Demo: not sent",
  no_recipient: "No one to send to",
  not_configured: "Email not set up",
  failed: "Failed",
  sending: "Sending…",
};

function NotificationLog({ ticketId }) {
  const [items, setItems] = useState([]);
  useEffect(() => subscribeNotifications(ticketId, setItems, () => setItems([])), [ticketId]);
  if (!items.length) return null;
  return (
    <details className="hd-notifications">
      <summary><MailCheck size={14} /> Email notifications ({items.length})</summary>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <div className="hd-notification-head">
              <strong>{NOTIFICATION_KINDS[item.kind] || item.kind}</strong>
              <span className={`msg-badge hd-delivery hd-delivery-${item.status}`}>{DELIVERY_LABELS[item.status] || item.status}</span>
              <time>{formatFullTime(item.createdAt)}</time>
            </div>
            <p className="hd-notification-to">To: {(item.to || []).join(", ") || "—"}</p>
            <details>
              <summary>{item.subject}</summary>
              <pre>{item.text}</pre>
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}

function StaffControls({ ticket, mode, onError }) {
  const [assignees, setAssignees] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setAssignees(null);
    listAssignees(ticket.id)
      .then((result) => { if (active) setAssignees(result.assignees || []); })
      .catch(() => { if (active) setAssignees([]); });
    return () => { active = false; };
  }, [ticket.id]);

  async function change(changes) {
    setBusy(true);
    onError("");
    try {
      await updateTicket(ticket.id, changes);
    } catch (error) {
      onError(helpDeskError(error));
    } finally {
      setBusy(false);
    }
  }

  const options = assignees || [];
  const hasCurrent = !ticket.assigneeUid || options.some((item) => item.uid === ticket.assigneeUid);
  return (
    <div className="hd-staff-controls">
      <label className="msg-field">
        <span>Status</span>
        <select value={ticket.status} disabled={busy} onChange={(event) => change({ status: event.target.value })}>
          {STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="msg-field">
        <span>Assignee</span>
        <select value={ticket.assigneeUid || ""} disabled={busy || assignees == null} onChange={(event) => change({ assigneeUid: event.target.value })}>
          <option value="">Unassigned</option>
          {!hasCurrent ? <option value={ticket.assigneeUid}>{ticket.assigneeName}</option> : null}
          {options.map((item) => (
            <option key={item.uid} value={item.uid}>{item.name}{item.detail && item.detail !== item.name ? ` · ${item.detail}` : ""}{mode === "platform" && item.scope === "department" ? " (dept admin)" : ""}</option>
          ))}
        </select>
      </label>
      <label className="msg-field">
        <span>Priority</span>
        <select value={ticket.priority} disabled={busy} onChange={(event) => change({ priority: event.target.value })}>
          {PRIORITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="msg-field">
        <span>Category</span>
        <select value={ticket.category} disabled={busy} onChange={(event) => change({ category: event.target.value })}>
          {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </div>
  );
}

function Composer({ ticket, staff, onError }) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [status, setStatus] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setBody("");
    setInternal(false);
    setStatus("");
    setFiles([]);
  }, [ticket.id]);

  if (!staff && ticket.status === "closed") {
    return <p className="hd-closed-note">This request is closed. Reopen it to reply, or open a new request.</p>;
  }

  async function send(event) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    onError("");
    try {
      await addMessage({ ticketId: ticket.id, uid: user.uid, body, internal, status: internal ? "" : status, files });
      setBody("");
      setFiles([]);
      setStatus("");
    } catch (error) {
      onError(helpDeskError(error, "Your message couldn't be sent."));
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={`hd-composer ${internal ? "is-note" : ""}`} onSubmit={send}>
      {staff ? (
        <div className="msg-segmented" role="tablist" aria-label="Message type">
          <button type="button" className={!internal ? "active" : ""} onClick={() => setInternal(false)}><Send size={13} /> Reply to requester</button>
          <button type="button" className={internal ? "active" : ""} onClick={() => setInternal(true)}><Lock size={13} /> Internal note</button>
        </div>
      ) : null}
      <label className="msg-field">
        <span className="sr-only">{internal ? "Internal note" : "Reply"}</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={8000}
          placeholder={internal ? "Only help desk staff see internal notes." : staff ? "Write a reply. The requester gets an email." : "Add details or reply to the help desk."}
        />
      </label>
      <FilePicker id={`hd-reply-files-${ticket.id}`} files={files} onChange={setFiles} onError={onError} />
      <div className="hd-composer-actions">
        {staff && !internal ? (
          <label className="hd-inline-select">
            <span>Then set status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Keep {statusLabel(ticket.status)}</option>
              {STATUSES.filter((item) => item.id !== ticket.status).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        ) : null}
        <button type="submit" className="primary-button" disabled={sending || !body.trim()}>
          {internal ? <Lock size={15} /> : <Send size={15} />} {sending ? "Sending…" : internal ? "Add note" : "Send reply"}
        </button>
      </div>
    </form>
  );
}

function TicketDetail({ ticket, mode, onBack }) {
  const { user } = useAuth();
  const staff = mode !== "mine";
  const requester = !staff;
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError("");
    return subscribeMessages(ticket.id, { staff }, setMessages, (err) => setError(helpDeskError(err, "Replies couldn't load.")));
  }, [ticket.id, staff]);

  async function setStatus(status) {
    setBusy(true);
    setError("");
    try {
      await updateTicket(ticket.id, { status });
    } catch (err) {
      setError(helpDeskError(err));
    } finally {
      setBusy(false);
    }
  }

  const context = ticket.context || {};
  const isMine = ticket.requesterUid === user?.uid;
  return (
    <article className="msg-detail hd-detail">
      <div className="msg-detail-bar">
        <button type="button" className="secondary-button msg-back" onClick={onBack}><ArrowLeft size={15} /> Requests</button>
        <div className="msg-detail-actions">
          {isMine && ticket.status !== "closed" ? (
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setStatus("closed")}><CheckCircle2 size={15} /> Close request</button>
          ) : null}
          {isMine && ["resolved", "closed"].includes(ticket.status) ? (
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setStatus("open")}><RotateCcw size={15} /> Reopen</button>
          ) : null}
        </div>
      </div>
      <header className="msg-detail-head">
        <div className="hd-detail-title">
          <span className="hd-number">{ticket.numberLabel}</span>
          <StatusBadge status={ticket.status} requester={requester} />
          <PriorityBadge priority={ticket.priority} always />
          <span className="msg-badge hd-category">{categoryLabel(ticket.category)}</span>
          {ticket.isDemo && mode === "platform" ? <span className="msg-badge hd-demo">Demo</span> : null}
        </div>
        <h2>{ticket.subject}</h2>
        <div className="msg-sender">
          <Avatar name={ticket.requesterName} size="lg" />
          <div>
            <strong>{ticket.requesterName}</strong>
            <span>{staff && ticket.requesterEmail ? `${ticket.requesterEmail} · ` : ""}{ticket.departmentName || ticket.departmentId}</span>
          </div>
          <time>{formatFullTime(ticket.createdAt)}</time>
        </div>
      </header>
      {error ? <p className="banner error" role="alert">{error}</p> : null}
      {staff ? <StaffControls ticket={ticket} mode={mode} onError={setError} /> : null}
      <div className="msg-detail-body hd-description">{ticket.description}</div>
      <AttachmentList attachments={ticket.attachments} onError={setError} />
      <dl className="hd-meta">
        <div><dt>Assigned to</dt><dd>{ticket.assigneeName || (requester ? "Not yet assigned" : "Unassigned")}</dd></div>
        <div><dt>Page</dt><dd>{context.page || "—"}{staff && context.path ? <small> {context.path}</small> : null}</dd></div>
        <div><dt>Browser</dt><dd title={staff ? context.userAgent : undefined}>{context.browser || "—"}</dd></div>
        <div><dt>App version</dt><dd>{context.appVersion || "—"}</dd></div>
        {staff ? <div><dt>Screen</dt><dd>{[context.viewport, context.theme, context.timezone].filter(Boolean).join(" · ") || "—"}</dd></div> : null}
        <div><dt>Updated</dt><dd>{formatFullTime(ticket.updatedAt)}</dd></div>
      </dl>
      {staff ? <NotificationLog ticketId={ticket.id} /> : null}
      <section className="hd-conversation" aria-label="Conversation">
        <h3>Conversation</h3>
        <Thread messages={messages} requester={requester} onError={setError} />
        <Composer ticket={ticket} staff={staff} onError={setError} />
      </section>
    </article>
  );
}

function foldersFor(mode, uid) {
  const staff = mode !== "mine";
  return [
    { id: "active", label: "Active", icon: Inbox, test: (t) => ACTIVE_STATUSES.includes(t.status) },
    ...(staff ? [
      { id: "mine", label: "Assigned to me", icon: UserRound, test: (t) => t.assigneeUid === uid && ACTIVE_STATUSES.includes(t.status) },
      { id: "unassigned", label: "Unassigned", icon: CircleDot, test: (t) => !t.assigneeUid && ACTIVE_STATUSES.includes(t.status) },
    ] : []),
    { id: "waiting", label: staff ? "Waiting on user" : "Waiting on you", icon: Clock3, test: (t) => t.status === "waiting_on_user" },
    { id: "resolved", label: "Resolved", icon: CheckCircle2, test: (t) => t.status === "resolved" },
    { id: "closed", label: "Closed", icon: Lock, test: (t) => t.status === "closed" },
    { id: "all", label: "All", icon: LifeBuoy, test: () => true },
  ];
}

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

/**
 * mode "mine": the signed-in user's own requests.
 * mode "department": a department's queue (its admins, or creators in that workspace).
 * mode "platform": every department (Creator Console).
 */
export default function HelpDeskBoard({ mode = "mine", departmentId = "", departmentName = "", contextPage = "", initialTicketId = "", canCreate = true, compact = false, composeSignal = 0 }) {
  const { user } = useAuth();
  const staff = mode !== "mine";
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [folder, setFolder] = useState(initialTicketId ? "all" : "active");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [department, setDepartment] = useState("");
  const [sort, setSort] = useState("updated");
  const [selectedId, setSelectedId] = useState(initialTicketId);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!user?.uid || (mode !== "platform" && !departmentId)) return undefined;
    setLoading(true);
    setLoadError("");
    return subscribeTickets({ mode, uid: user.uid, departmentId }, (list) => {
      setTickets(list);
      setLoading(false);
    }, (error) => {
      setLoadError(helpDeskError(error, "Requests couldn't load."));
      setLoading(false);
    });
  }, [mode, user?.uid, departmentId]);

  useEffect(() => {
    if (initialTicketId) setSelectedId(initialTicketId);
  }, [initialTicketId]);

  // Bumped by the page (e.g. "Ask the help desk" on Help articles) to open the form.
  useEffect(() => {
    if (composeSignal && canCreate) setComposing(true);
  }, [composeSignal, canCreate]);

  const folders = useMemo(() => foldersFor(mode, user?.uid), [mode, user?.uid]);
  const counts = useMemo(() => Object.fromEntries(folders.map((item) => [item.id, tickets.filter(item.test).length])), [folders, tickets]);
  const departments = useMemo(() => {
    if (mode !== "platform") return [];
    const byId = new Map(tickets.map((t) => [t.departmentId, t.departmentName || t.departmentId]));
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [mode, tickets]);

  const visible = useMemo(() => {
    const test = folders.find((item) => item.id === folder)?.test || (() => true);
    const needle = search.trim().toLowerCase();
    const list = tickets.filter((t) => test(t)
      && (!category || t.category === category)
      && (!priority || t.priority === priority)
      && (!department || t.departmentId === department)
      && (!needle || [t.numberLabel, t.subject, t.description, t.requesterName, t.requesterEmail, t.departmentName, t.assigneeName]
        .some((value) => String(value || "").toLowerCase().includes(needle))));
    if (sort === "priority") {
      return [...list].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
        || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }
    if (sort === "oldest") return [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return list;
  }, [tickets, folders, folder, search, category, priority, department, sort]);

  const selected = tickets.find((t) => t.id === selectedId) || null;
  const emptyLabel = tickets.length
    ? "No requests match."
    : staff ? "No help requests yet." : "You haven't asked for help yet.";

  function created({ ticketId, numberLabel }) {
    setComposing(false);
    setFolder("active");
    setSelectedId(ticketId);
    setNotice(`Request ${numberLabel} sent. We'll email you when there's a reply.`);
  }

  return (
    <div className={`msg-board hd-board ${compact ? "msg-board-compact" : ""} ${selected ? "is-reading" : ""}`.trim()}>
      <aside className="msg-rail">
        {canCreate ? (
          <button type="button" className="primary-button msg-compose-button" onClick={() => { setNotice(""); setComposing(true); }}>
            <PenSquare size={16} /> New request
          </button>
        ) : null}
        <nav className="msg-folders" aria-label="Request folders">
          {folders.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={folder === id ? "active" : ""} onClick={() => setFolder(id)}>
              <Icon size={16} /> <span>{label}</span>
              {counts[id] ? <em className={`msg-count ${["active", "mine", "unassigned", "waiting"].includes(id) ? "" : "msg-count-muted"}`}>{counts[id]}</em> : null}
            </button>
          ))}
        </nav>
        <p className="msg-rail-note">
          <Lock size={13} />
          {staff ? "Internal notes and the email log are only shown to help desk staff." : "Only you and the help desk can see your requests."}
        </p>
      </aside>

      <section className="msg-list-pane" aria-label="Requests">
        <div className="msg-list-head">
          <label className="msg-search">
            <Search size={15} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={staff ? "Search number, subject, person…" : "Search your requests"} aria-label="Search requests" />
          </label>
          <div className="hd-filters">
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Priority">
              <option value="">Any priority</option>
              {PRIORITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            {mode === "platform" ? (
              <select value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Department">
                <option value="">All departments</option>
                {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            ) : null}
            {staff ? (
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort">
                <option value="updated">Recently updated</option>
                <option value="priority">Priority</option>
                <option value="oldest">Oldest first</option>
              </select>
            ) : null}
          </div>
        </div>
        {notice ? <p className="banner success hd-notice" role="status">{notice}</p> : null}
        {loadError ? <p className="banner error hd-notice" role="alert">{loadError}</p> : null}
        <div className="msg-list" role="list">
          {loading ? [0, 1, 2].map((key) => <div key={key} className="msg-skeleton" />) : null}
          {!loading && !visible.length ? (
            <div className="msg-empty">
              <LifeBuoy size={28} />
              <p>{emptyLabel}</p>
              {!tickets.length && canCreate ? <button type="button" className="secondary-button" onClick={() => setComposing(true)}><PenSquare size={15} /> New request</button> : null}
            </div>
          ) : null}
          {!loading && visible.map((t) => (
            <button
              key={t.id}
              type="button"
              role="listitem"
              className={`msg-item ${t.id === selectedId ? "active" : ""} ${["high", "urgent"].includes(t.priority) ? "high" : ""} ${!staff && t.status === "waiting_on_user" ? "unread" : ""}`}
              onClick={() => setSelectedId(t.id)}
            >
              <div className="msg-item-main">
                <div className="msg-item-top">
                  <span className="msg-item-from">{t.numberLabel} · {staff ? `${t.requesterName}${mode === "platform" ? ` · ${t.departmentName || t.departmentId}` : ""}` : categoryLabel(t.category)}</span>
                  <time>{formatListTime(t.updatedAt || t.createdAt)}</time>
                </div>
                <div className="msg-item-subject"><strong>{t.subject}</strong></div>
                <p className="msg-item-preview">{preview(t.description)}</p>
                <div className="msg-item-badges">
                  <StatusBadge status={t.status} requester={!staff} />
                  <PriorityBadge priority={t.priority} />
                  {staff ? <span className="msg-badge hd-category">{categoryLabel(t.category)}</span> : null}
                  {staff && t.assigneeName ? <span className="msg-badge hd-assignee"><UserRound size={11} /> {t.assigneeName}</span> : null}
                  {t.isDemo && mode === "platform" ? <span className="msg-badge hd-demo">Demo</span> : null}
                  {t.attachments?.length ? <span className="msg-badge hd-category"><Paperclip size={11} /> {t.attachments.length}</span> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="msg-reader" aria-label="Request">
        {selected ? (
          <TicketDetail key={selected.id} ticket={selected} mode={mode} onBack={() => setSelectedId("")} />
        ) : (
          <div className="msg-empty">
            <LifeBuoy size={34} />
            <p>{tickets.length ? "Choose a request to read it." : staff ? "New requests show up here." : "Need a hand? Open a request and the help desk will get back to you."}</p>
          </div>
        )}
      </section>

      {composing ? (
        <NewRequestModal
          departmentId={departmentId}
          departmentName={departmentName}
          contextPage={contextPage}
          onClose={() => setComposing(false)}
          onCreated={created}
        />
      ) : null}
    </div>
  );
}
