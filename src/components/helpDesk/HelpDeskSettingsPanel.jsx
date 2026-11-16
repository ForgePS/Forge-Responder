import { useEffect, useState } from "react";
import { MailCheck, Plus, Save, Trash2 } from "lucide-react";
import { getHelpDeskSettings, helpDeskError, saveHelpDeskSettings } from "../../lib/helpDesk/helpDeskService.js";

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * Who gets emailed when a new help request comes in.
 * scope "platform": FORGE support's list (every department's requests).
 * scope <departmentId>: that department's own list (its requests only), added to the platform list.
 */
export default function HelpDeskSettingsPanel({ scope }) {
  const [emails, setEmails] = useState([]);
  const [draft, setDraft] = useState("");
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ tone: "", text: "" });
  const platform = scope === "platform";

  useEffect(() => {
    let active = true;
    setLoading(true);
    getHelpDeskSettings(scope)
      .then((result) => {
        if (!active) return;
        setEmails(result.notifyEmails || []);
        setMeta(result);
      })
      .catch((error) => { if (active) setMessage({ tone: "error", text: helpDeskError(error, "The list couldn't load.") }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope]);

  function add(event) {
    event?.preventDefault();
    const entries = draft.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    const invalid = entries.filter((item) => !EMAIL_PATTERN.test(item));
    if (invalid.length) {
      setMessage({ tone: "error", text: `Not a valid email address: ${invalid.join(", ")}` });
      return;
    }
    setEmails((current) => [...new Set([...current, ...entries])]);
    setDraft("");
    setMessage({ tone: "", text: "" });
  }

  async function save() {
    setSaving(true);
    setMessage({ tone: "", text: "" });
    try {
      const result = await saveHelpDeskSettings(scope, emails);
      setEmails(result.notifyEmails || []);
      setMeta(result);
      setMessage({ tone: "success", text: "Saved." });
    } catch (error) {
      setMessage({ tone: "error", text: helpDeskError(error, "The list couldn't be saved.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hd-settings">
      <p className="hd-settings-intro">
        <MailCheck size={16} />
        <span>
          {platform
            ? "Every new help request from any department is emailed to these addresses. Departments can add their own list for their requests."
            : "New help requests from this department are emailed to these addresses, as well as to FORGE support. Your admins also see them under Department queue."}
        </span>
      </p>
      {message.text ? <p className={`banner ${message.tone || "error"}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p> : null}
      {loading ? <p className="muted">Loading…</p> : (
        <>
          <ul className="hd-email-list">
            {emails.length ? emails.map((email) => (
              <li key={email}>
                <span>{email}</span>
                <button type="button" className="icon-button danger" aria-label={`Remove ${email}`} onClick={() => setEmails((current) => current.filter((item) => item !== email))}>
                  <Trash2 size={15} />
                </button>
              </li>
            )) : <li className="hd-email-empty">{platform ? "No addresses yet: new requests reach no one by email." : "No department addresses. Requests still go to FORGE support."}</li>}
          </ul>
          <form className="hd-email-add" onSubmit={add}>
            <label className="rms-field">
              <span>Add email addresses</span>
              <input type="text" inputMode="email" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="support@example.gov" />
            </label>
            <button type="submit" className="secondary-button" disabled={!draft.trim()}><Plus size={15} /> Add</button>
          </form>
          <div className="hd-settings-actions">
            {meta.updatedAt ? <span className="muted">Last saved {new Date(meta.updatedAt).toLocaleString()}{meta.updatedByName ? ` by ${meta.updatedByName}` : ""}</span> : <span />}
            <button type="button" className="primary-button" onClick={save} disabled={saving}><Save size={15} /> {saving ? "Saving…" : "Save list"}</button>
          </div>
        </>
      )}
    </div>
  );
}
