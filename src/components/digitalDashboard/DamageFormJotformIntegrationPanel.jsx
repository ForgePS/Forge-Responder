import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, ExternalLink, FileWarning, LoaderCircle, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  ensureDamageFormSettings,
  loadDamageFormSettings,
  saveDamageFormSettings,
  syncJotformDamageSubmissions,
} from "../../lib/damageFormService.js";
import "../../theme/digital-dashboard.css";

export default function DamageFormJotformIntegrationPanel({
  departmentId = "",
  canConfigure = false,
}) {
  const [settings, setSettings] = useState(null);
  const [formUrlDraft, setFormUrlDraft] = useState("");
  const [formTitleDraft, setFormTitleDraft] = useState("Damage Form");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const webhookUrl = settings?.webhookUrl || "";
  const status = useMemo(() => {
    if (!settings?.formUrl) return { tone: "critical", label: "Not connected" };
    if (settings?.lastSubmissionAt) return { tone: "success", label: "Receiving submissions" };
    return { tone: "warning", label: "Waiting for first submission" };
  }, [settings?.formUrl, settings?.lastSubmissionAt]);

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setNotice("Webhook link copied.");
    } catch {
      setError("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  async function handleRemoveApiKey() {
    if (!window.confirm("Remove the saved JotForm API key? Command staff won't be able to open the official PDF until a new key is saved.")) return;
    setBusy("remove-key");
    setError("");
    setNotice("");
    try {
      const saved = await saveDamageFormSettings(departmentId, { formUrl: formUrlDraft, formTitle: formTitleDraft, removeApiKey: true });
      setSettings(saved);
      setApiKeyConfigured(Boolean(saved?.apiKeyConfigured));
      setNotice("API key removed.");
    } catch (removeError) {
      setError(removeError?.message || "Couldn't remove the API key.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (!departmentId) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError("");

    Promise.resolve()
      .then(async () => {
        const config = canConfigure
          ? await ensureDamageFormSettings(departmentId)
          : await loadDamageFormSettings(departmentId);
        if (!active) return;
        setSettings(config);
        setFormUrlDraft(config?.formUrl || "");
        setFormTitleDraft(config?.formTitle || "Damage Form");
        setApiKeyConfigured(Boolean(config?.apiKeyConfigured || config?.apiKey));
        setApiKeyDraft("");
      })
      .catch(() => {
        if (active) setError("Could not load damage form settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [departmentId, canConfigure]);

  async function handleSave(event) {
    event.preventDefault();
    if (!canConfigure || !departmentId) return;

    setBusy("save");
    setError("");
    setNotice("");
    try {
      const saved = await saveDamageFormSettings(departmentId, {
        formUrl: formUrlDraft,
        formTitle: formTitleDraft,
        apiKey: apiKeyDraft,
      });
      setSettings(saved);
      setFormUrlDraft(saved?.formUrl || "");
      setFormTitleDraft(saved?.formTitle || "Damage Form");
      setApiKeyConfigured(Boolean(saved?.apiKeyConfigured));
      setApiKeyDraft("");
      setNotice(
        saved?.apiKeyConfigured
          ? "Connection saved. Your API key is stored securely — the field clears after save on purpose."
          : "Damage form connection saved. Submissions will appear on the Command Dashboard."
      );
    } catch (saveError) {
      setError(saveError?.message || "Could not save damage form settings.");
    } finally {
      setBusy("");
    }
  }

  async function handleSync() {
    if (!canConfigure || !departmentId) return;

    setBusy("sync");
    setError("");
    setNotice("");
    try {
      const result = await syncJotformDamageSubmissions(departmentId);
      setNotice(result.message || "JotForm submissions synced.");
    } catch (syncError) {
      setError(syncError?.message || "Could not sync JotForm submissions.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="dd-panel dd-damage-form-panel dd-damage-form-admin">
      <div className="dd-panel-head">
        <div>
          <h3><FileWarning size={16} /> Damage Form (JotForm)</h3>
          <p className="dd-panel-subtitle">
            Connect a JotForm damage report. New submissions appear on the Command Dashboard.
          </p>
        </div>
        <span className={`dd-status-pill dd-status-${status.tone}`}>{status.label}</span>
      </div>

      <div className="dd-panel-body">
        {loading ? (
          <p className="dd-empty-detail"><LoaderCircle size={16} className="dd-spin" /> Loading damage form settings…</p>
        ) : null}

        {error ? (
          <p className="dd-upload-error"><AlertTriangle size={14} /> {error}</p>
        ) : null}
        {notice ? <p className="dd-active911-help">{notice}</p> : null}

        {!loading && !canConfigure ? (
          <p className="dd-empty-detail">
            Only administrators with system settings access can configure the damage form connection.
          </p>
        ) : null}

        {!loading && canConfigure ? (
          <form className="dd-active911-connect" onSubmit={handleSave}>
            <label>
              <span>Form title</span>
              <input
                type="text"
                value={formTitleDraft}
                onChange={(event) => setFormTitleDraft(event.target.value)}
                placeholder="Damage Form"
              />
            </label>
            <label>
              <span>JotForm URL</span>
              <input
                type="url"
                value={formUrlDraft}
                onChange={(event) => setFormUrlDraft(event.target.value)}
                placeholder="https://form.jotform.com/..."
              />
            </label>
            <label>
              <span>JotForm API key (for PDF view/print)</span>
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={apiKeyConfigured ? "API key saved — enter a new key only to replace it" : "Paste API key from JotForm → Settings → API"}
                autoComplete="off"
              />
              {apiKeyConfigured ? (
                <span className="damage-form-api-key-status">
                  API key saved. Leave blank to keep it.
                  <button type="button" className="dd-action-button" onClick={handleRemoveApiKey} disabled={busy === "remove-key"}>
                    <Trash2 size={14} /> Remove key
                  </button>
                </span>
              ) : null}
            </label>

            {webhookUrl ? (
              <div className="damage-form-setup-details">
                <p className="damage-form-setup-copy">
                  Paste this webhook URL into JotForm under <strong>Settings → Integrations → Webhooks</strong>.
                  That sends each submission to the Command Dashboard.
                </p>
                <div className="damage-form-webhook-row">
                  <code>{webhookUrl}</code>
                  <button type="button" className="dd-action-button" onClick={copyWebhookUrl}>
                    <Copy size={14} /> Copy
                  </button>
                </div>
                <p className="damage-form-setup-copy">
                  You do not need the script, popup, or lightbox embed codes from JotForm. FORGE uses the
                  <strong> iFrame embed</strong> automatically in the Employee Portal once this form URL is saved.
                  Add your JotForm API key above so command staff can open and print the official PDF from the dashboard.
                </p>
              </div>
            ) : null}

            <div className="dd-active911-actions">
              <button type="submit" className="dd-action-button primary" disabled={busy === "save"}>
                {busy === "save" ? <LoaderCircle size={16} className="dd-spin" /> : <Save size={16} />}
                Save connection
              </button>
              {settings?.formUrl && apiKeyConfigured ? (
                <button
                  type="button"
                  className="dd-action-button"
                  disabled={busy === "sync"}
                  onClick={handleSync}
                >
                  {busy === "sync" ? <LoaderCircle size={16} className="dd-spin" /> : <RefreshCw size={16} />}
                  Sync submissions
                </button>
              ) : null}
              {settings?.formUrl ? (
                <button
                  type="button"
                  className="dd-action-button"
                  onClick={() => window.open(settings.formUrl, "_blank", "noopener,noreferrer")?.focus?.()}
                >
                  <ExternalLink size={16} />
                  Open form
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
