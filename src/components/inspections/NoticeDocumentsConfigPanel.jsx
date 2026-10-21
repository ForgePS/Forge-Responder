import { useEffect, useState } from "react";
import { FileText, Save } from "lucide-react";
import {
  ensureDocumentTemplatesSeeded,
  getNoticeDocumentTypeOptions,
  saveDocumentTemplate,
} from "../../lib/inspections/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Document templates panel for Inspection Config Studio (Phase 6).
 */
export default function NoticeDocumentsConfigPanel({
  departmentId,
  actor = {},
  canManage = false,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);

  const types = getNoticeDocumentTypeOptions();

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    setError("");
    try {
      const next = await ensureDocumentTemplatesSeeded(departmentId, actor);
      setTemplates(next);
      setSelectedId((current) => current || next[0]?.id || "");
      setDraft(next[0] || null);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load document templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    const next = templates.find((row) => row.id === selectedId) || null;
    setDraft(next ? { ...next } : null);
  }, [selectedId, templates]);

  async function handleSave() {
    if (!canManage || !draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveDocumentTemplate(departmentId, draft, actor);
      setTemplates((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setSelectedId(saved.id);
      setMessage("Document template saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save template.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="occupancy-muted">Loading document templates…</p>;

  return (
    <div className="config-studio-body">
      {error ? <p className="occupancy-error">{error}</p> : null}
      {message ? <p className="occupancy-message">{message}</p> : null}

      <div className="config-split">
        <aside className="config-list-pane">
          <div className="occupancy-detail-actions">
            <strong><FileText size={14} /> Templates</strong>
          </div>
          <div className="config-list">
            {templates.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`config-list-item${row.id === selectedId ? " active" : ""}`}
                onClick={() => setSelectedId(row.id)}
              >
                <strong>{row.name}</strong>
                <span className="occupancy-muted">{row.documentTypeId}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="config-editor-pane">
          {draft ? (
            <>
              <div className="occupancy-form-grid">
                <Field label="Name">
                  <input
                    value={draft.name || ""}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
                  />
                </Field>
                <Field label="Document type">
                  <select
                    value={draft.documentTypeId || ""}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, documentTypeId: e.target.value }))}
                  >
                    {types.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Letterhead title">
                  <input
                    value={draft.letterheadTitle || ""}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, letterheadTitle: e.target.value }))}
                  />
                </Field>
                <Field label="Letterhead subtitle">
                  <input
                    value={draft.letterheadSubtitle || ""}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, letterheadSubtitle: e.target.value }))}
                  />
                </Field>
                <Field label="Intro" wide>
                  <textarea
                    rows={2}
                    value={draft.introText || ""}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, introText: e.target.value }))}
                  />
                </Field>
                <Field label="Closing" wide>
                  <textarea
                    rows={2}
                    value={draft.closingText || ""}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, closingText: e.target.value }))}
                  />
                </Field>
                <Field label="Footer" wide>
                  <input
                    value={draft.footerText || ""}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, footerText: e.target.value }))}
                  />
                </Field>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={draft.active !== false}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, active: e.target.checked }))}
                  />
                  Active
                </label>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.isCertificate)}
                    disabled={!canManage}
                    onChange={(e) => setDraft((current) => ({ ...current, isCertificate: e.target.checked }))}
                  />
                  Certificate template
                </label>
              </div>

              <p className="occupancy-muted">
                {(draft.bodySections || []).length} body section(s). Print merges occupancy, inspection, and violation snapshot fields.
              </p>
              {(draft.bodySections || []).map((section) => (
                <div key={section.id} className="template-section-card">
                  <strong>{section.title}</strong>
                  <p className="occupancy-muted">
                    {(section.includeFields || []).join(", ") || "—"}
                    {section.includeViolations ? " · includes violations table" : ""}
                  </p>
                </div>
              ))}

              {canManage ? (
                <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
                  <Save size={14} /> {saving ? "Saving…" : "Save template"}
                </button>
              ) : null}
            </>
          ) : (
            <p className="occupancy-muted">Select a template.</p>
          )}
        </div>
      </div>
    </div>
  );
}
