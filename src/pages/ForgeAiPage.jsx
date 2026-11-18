import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Info, MessageSquarePlus, Pencil, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import {
  archiveForgeAiConversation,
  askForgeAi,
  getForgeAiConversation,
  listForgeAiConversations,
  loadForgeAiBootstrap,
  renameForgeAiConversation,
  sendForgeAiFeedback,
} from "../lib/forgeAi/forgeAiClient.js";
import { FORGE_AI_OPEN_EVENT, rememberRecordToOpen, takePendingForgeAiRequest } from "../lib/forgeAi/launch.js";
import ForgeAiMessage from "../components/forgeAi/ForgeAiMessage.jsx";
import ForgeAiAdminPanel from "../components/forgeAi/ForgeAiAdminPanel.jsx";
import "../styles/forge-ai.css";

function Heading({ children }) {
  return (
    <section className="module-heading">
      <div>
        <span className="module-icon"><Sparkles size={22} /></span>
        <div>
          <h1>Forge AI</h1>
          <p>Public Safety Operations Intelligence</p>
        </div>
      </div>
      {children ? <div className="heading-actions">{children}</div> : null}
    </section>
  );
}

export default function ForgeAiPage({ onNavigate }) {
  const { departmentId } = useTenant();
  const [boot, setBoot] = useState(null);
  const [bootError, setBootError] = useState("");
  const [tab, setTab] = useState("assistant");
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [input, setInput] = useState("");
  const [capability, setCapability] = useState("");
  const [context, setContext] = useState({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const listRef = useRef(null);
  const pendingRef = useRef(null);

  const capabilities = useMemo(() => boot?.capabilities || [], [boot]);
  const allowed = capabilities.filter((c) => c.allowed);
  const labelOf = useCallback((id) => capabilities.find((c) => c.id === id)?.label || "", [capabilities]);
  const ready = Boolean(boot?.enabled && boot?.canUse);

  const loadBoot = useCallback(async () => {
    setBootError("");
    try {
      const data = await loadForgeAiBootstrap(departmentId);
      setBoot(data);
      if (data.canUse) {
        const list = await listForgeAiConversations(departmentId).catch(() => ({ conversations: [] }));
        setConversations(list.conversations || []);
      }
      if (!data.canUse && (data.admin?.manage || data.admin?.usage)) setTab("admin");
    } catch (error) {
      setBootError(error.message);
    }
  }, [departmentId]);

  useEffect(() => {
    if (departmentId) loadBoot();
  }, [departmentId, loadBoot]);

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = useCallback(async (text, opts = {}) => {
    const message = String(text || "").trim();
    if (!message || sending) return;
    const cap = opts.capability ?? capability;
    const ctx = opts.context ?? context;
    setSending(true);
    setSendError(null);
    const optimistic = { id: `pending-${Date.now()}`, role: "user", text: message, pending: true };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    try {
      const result = await askForgeAi(departmentId, { message, capability: cap, conversationId: activeId, context: ctx });
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), result.userMessage, result.message]);
      if (!activeId) {
        setActiveId(result.conversation.id);
        setConversations((list) => [{ id: result.conversation.id, title: result.conversation.title, capability: result.message.capability, updatedAt: result.message.createdAt }, ...list]);
      } else {
        setConversations((list) => list.map((c) => (c.id === activeId ? { ...c, updatedAt: result.message.createdAt } : c)));
      }
      setContext({});
    } catch (error) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(message);
      setSendError({ message: error.message, retryable: error.retryable !== false, payload: { message, capability: cap, context: ctx } });
    } finally {
      setSending(false);
    }
  }, [activeId, capability, context, departmentId, sending]);

  // A request from another page (Heat Zone, NERIS editor, Dashboard...).
  const applyPending = useCallback((request) => {
    if (!request) return;
    if (request.view === "admin") {
      setTab("admin");
      return;
    }
    setTab("assistant");
    setActiveId("");
    setMessages([]);
    setCapability(request.capability || "");
    setContext(request.context || {});
    if (request.autoSend && request.prompt) pendingRef.current = request;
    else setInput(request.prompt || "");
  }, []);

  useEffect(() => {
    applyPending(takePendingForgeAiRequest());
    const onOpen = () => applyPending(takePendingForgeAiRequest());
    window.addEventListener(FORGE_AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FORGE_AI_OPEN_EVENT, onOpen);
  }, [applyPending]);

  useEffect(() => {
    const request = pendingRef.current;
    if (!request || !ready || sending || activeId) return;
    pendingRef.current = null;
    send(request.prompt, { capability: request.capability, context: request.context || {} });
  }, [ready, sending, activeId, send, messages]);

  const openConversation = async (id) => {
    setTab("assistant");
    setActiveId(id);
    setMessages([]);
    setSendError(null);
    setLoadingConversation(true);
    try {
      const data = await getForgeAiConversation(departmentId, id);
      setMessages(data.messages || []);
      setCapability("");
    } catch (error) {
      setSendError({ message: error.message, retryable: false });
    } finally {
      setLoadingConversation(false);
    }
  };

  const newConversation = () => {
    setTab("assistant");
    setActiveId("");
    setMessages([]);
    setSendError(null);
    setContext({});
    setInput("");
  };

  const rename = async (event) => {
    event.preventDefault();
    if (!renaming?.title.trim()) return;
    try {
      const result = await renameForgeAiConversation(departmentId, renaming.id, renaming.title.trim());
      setConversations((list) => list.map((c) => (c.id === renaming.id ? { ...c, title: result.title } : c)));
      setRenaming(null);
    } catch (error) {
      setSendError({ message: error.message, retryable: false });
    }
  };

  const archive = async (id) => {
    if (!window.confirm("Remove this conversation from your history?")) return;
    try {
      await archiveForgeAiConversation(departmentId, id);
      setConversations((list) => list.filter((c) => c.id !== id));
      if (id === activeId) newConversation();
    } catch (error) {
      setSendError({ message: error.message, retryable: false });
    }
  };

  const feedback = async (message, rating) => {
    try {
      await sendForgeAiFeedback(departmentId, message.id, rating);
      setMessages((list) => list.map((m) => (m.id === message.id ? { ...m, feedback: rating } : m)));
    } catch (error) {
      setSendError({ message: error.message, retryable: false });
    }
  };

  const openSource = (source) => {
    if (!source?.link?.page || !onNavigate) return;
    rememberRecordToOpen(source.link.page, source.link.reportId);
    onNavigate(source.link.page);
  };

  if (bootError) {
    return (
      <div className="module-page forge-ai-page">
        <Heading />
        <section className="panel"><div className="panel-body">
          <div className="banner error" role="alert">{bootError}</div>
          <button type="button" className="secondary-button" onClick={loadBoot}><RefreshCw size={14} /> Try again</button>
        </div></section>
      </div>
    );
  }
  if (!boot) {
    return <div className="module-page forge-ai-page"><Heading /><section className="panel"><div className="panel-body fa-muted">Loading Forge AI…</div></section></div>;
  }

  const showAdmin = boot.admin?.manage || boot.admin?.usage;

  return (
    <div className="module-page forge-ai-page">
      <Heading>
        {ready ? <button type="button" className="primary-button" onClick={newConversation}><MessageSquarePlus size={15} /> New conversation</button> : null}
      </Heading>

      {showAdmin ? (
        <section className="cert-toolbar fa-tabs" role="tablist" aria-label="Forge AI">
          <button type="button" role="tab" aria-selected={tab === "assistant"} className={tab === "assistant" ? "active" : ""} onClick={() => setTab("assistant")}>Assistant</button>
          <button type="button" role="tab" aria-selected={tab === "admin"} className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>Admin</button>
        </section>
      ) : null}

      {tab === "admin" && showAdmin ? (
        <ForgeAiAdminPanel departmentId={departmentId} canManage={boot.admin.manage} canViewUsage={boot.admin.usage} onSaved={loadBoot} />
      ) : !boot.canUse ? (
        <section className="panel"><div className="panel-body">You don't have access to the Forge AI assistant. An administrator can grant it under Roles &amp; permissions.</div></section>
      ) : !boot.enabled ? (
        <section className="panel fa-off">
          <div className="panel-body">
            <strong>Forge AI is turned off for {boot.department?.name || "your department"}.</strong>
            <p className="fa-muted">{boot.admin?.manage ? "Turn it on in the Admin tab." : "Ask an administrator to turn it on."} The rest of FORGE works the same either way.</p>
          </div>
        </section>
      ) : (
        <div className="fa-layout">
          <aside className="fa-history panel" aria-label="Conversation history">
            <header><div><strong>History</strong></div></header>
            <div className="panel-body">
              {conversations.length ? (
                <ul>
                  {conversations.map((c) => (
                    <li key={c.id} className={c.id === activeId ? "is-active" : ""}>
                      {renaming?.id === c.id ? (
                        <form onSubmit={rename} className="fa-rename">
                          <input aria-label="Conversation title" value={renaming.title} maxLength={80} autoFocus onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} />
                          <button type="submit" className="icon-button" aria-label="Save title"><Pencil size={13} /></button>
                          <button type="button" className="icon-button" aria-label="Cancel" onClick={() => setRenaming(null)}><X size={13} /></button>
                        </form>
                      ) : (
                        <>
                          <button type="button" className="fa-history-item" onClick={() => openConversation(c.id)} title={c.title}>
                            <span>{c.title || "Untitled"}</span>
                            <small>{labelOf(c.capability)}</small>
                          </button>
                          <span className="fa-history-actions">
                            <button type="button" className="icon-button" aria-label="Rename conversation" onClick={() => setRenaming({ id: c.id, title: c.title || "" })}><Pencil size={13} /></button>
                            <button type="button" className="icon-button danger" aria-label="Remove conversation" onClick={() => archive(c.id)}><Archive size={13} /></button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="fa-muted">Your questions are saved here. Only you can see your history.</p>}
            </div>
          </aside>

          <section className="fa-chat panel" aria-label="Forge AI conversation">
            {!boot.modelConfigured ? (
              <div className="fa-notice" role="status"><Info size={14} aria-hidden /> The AI model isn't connected here, so answers list what your records show without AI writing. Everything else works the same.</div>
            ) : null}
            <div className="fa-messages" ref={listRef} aria-live="polite">
              {loadingConversation ? <p className="fa-muted">Loading conversation…</p> : null}
              {!messages.length && !loadingConversation ? (
                <div className="fa-empty">
                  <Sparkles size={26} aria-hidden />
                  <strong>Ask about your department's records</strong>
                  <p className="fa-muted">Forge AI answers from the data you can already see, shows its sources, and never changes a record.</p>
                  <div className="fa-suggestions">
                    {(boot.suggestions || []).map((s) => (
                      <button key={s.text} type="button" className="fa-chip" onClick={() => send(s.text, { capability: s.capability })}>
                        <small>{labelOf(s.capability)}</small>{s.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {messages.map((m) => (
                <ForgeAiMessage
                  key={m.id}
                  message={m}
                  capabilityLabel={labelOf(m.capability)}
                  onFeedback={feedback}
                  onFollowUp={(q, cap) => send(q, { capability: cap })}
                  onOpenSource={openSource}
                />
              ))}
              {sending ? <div className="fa-thinking" role="status"><span className="fa-dot" /><span className="fa-dot" /><span className="fa-dot" /> Working on it…</div> : null}
            </div>

            {sendError ? (
              <div className="banner error fa-error" role="alert">
                <span>{sendError.message}</span>
                {sendError.retryable && sendError.payload ? (
                  <button type="button" className="secondary-button" onClick={() => send(sendError.payload.message, sendError.payload)}><RefreshCw size={14} /> Retry</button>
                ) : null}
                <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setSendError(null)}><X size={14} /></button>
              </div>
            ) : null}

            <form className="fa-composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <div className="fa-caps" role="radiogroup" aria-label="What should Forge AI use?">
                <button type="button" role="radio" aria-checked={!capability} className={`fa-chip${!capability ? " is-on" : ""}`} onClick={() => setCapability("")}>Auto</button>
                {allowed.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={capability === c.id} title={c.description} className={`fa-chip${capability === c.id ? " is-on" : ""}`} onClick={() => setCapability(c.id)}>{c.label}</button>
                ))}
              </div>
              {context.reportId ? (
                <div className="fa-context">About one report <button type="button" className="icon-button" aria-label="Clear report" onClick={() => setContext({})}><X size={12} /></button></div>
              ) : null}
              <div className="fa-input-row">
                <textarea
                  aria-label="Ask Forge AI"
                  placeholder="Ask about calls, incidents, districts, units, NERIS quality or how FORGE works…"
                  value={input}
                  maxLength={2000}
                  rows={2}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                />
                <button type="submit" className="primary-button" disabled={sending || !input.trim()} aria-label="Send"><Send size={15} /></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
