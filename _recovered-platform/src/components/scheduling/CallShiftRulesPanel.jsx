import { useMemo, useState } from "react";
import { CirclePlus, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useDropdowns } from "../../context/DropdownContext.jsx";
import { useTenant } from "../../context/TenantContext.jsx";
import { writeAuditLog } from "../../lib/auditService.js";
import {
  CALL_SHIFT_TIE_BREAKERS,
  createDefaultCallShiftRule,
  formatCallShiftRuleUpdatedAt,
  normalizeCallShiftRules,
  removeCallShiftRule,
  upsertCallShiftRule,
} from "../../lib/callShiftRules.js";
import { saveCallShiftRules } from "../../lib/platformService.js";
import "../../theme/call-shift-rules.css";

function emptyDraft() {
  return createDefaultCallShiftRule({
    id: "",
    isDefault: false,
    name: "",
    qualifiers: [],
  });
}

function QualifierMultiSelect({ options = [], value = [], onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? value : [];
  const allSelected = options.length > 0 && options.every((option) => selected.includes(option));

  function toggleOption(option) {
    if (disabled) return;
    onChange?.(
      selected.includes(option)
        ? selected.filter((entry) => entry !== option)
        : [...selected, option]
    );
  }

  function toggleAll() {
    if (disabled) return;
    onChange?.(allSelected ? [] : [...options]);
  }

  return (
    <div className={`call-shift-qualifier-select${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="call-shift-qualifier-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {selected.length ? `${selected.length} item${selected.length === 1 ? "" : "s"}` : "Select qualifiers"}
      </button>
      {open ? (
        <div className="call-shift-qualifier-menu" role="listbox" aria-multiselectable="true">
          <label className="call-shift-qualifier-option">
            <input type="checkbox" checked={allSelected} disabled={disabled} onChange={toggleAll} />
            <span>Select All</span>
          </label>
          {options.map((option) => (
            <label key={option} className="call-shift-qualifier-option">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                disabled={disabled}
                onChange={() => toggleOption(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CallShiftRuleModal({ draft, setDraft, qualifierOptions, onClose, onSave, saving, readOnly }) {
  const canSave = String(draft.name || "").trim().length > 0 && !readOnly;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="workflow-modal call-shift-rule-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{draft.id ? "Edit Rule" : "Add Rule"}</strong>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="modal-content call-shift-rule-modal-body">
          <div className="workflow-form">
            <label className="wide-field">
              <span>Name (required)</span>
              <input
                value={draft.name}
                disabled={readOnly}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Default Rule"
              />
            </label>

            <div className="call-shift-rule-toggles">
              <label className="permission-toggle permission-check">
                <input
                  type="checkbox"
                  checked={Boolean(draft.isDefault)}
                  disabled={readOnly}
                  onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.target.checked }))}
                />
                <span>Default</span>
              </label>
              <label className="permission-toggle permission-check">
                <input
                  type="checkbox"
                  checked={Boolean(draft.useGlobalRanking)}
                  disabled={readOnly}
                  onChange={(event) => setDraft((current) => ({ ...current, useGlobalRanking: event.target.checked }))}
                />
                <span>Use global ranking</span>
              </label>
            </div>

            <label className="wide-field">
              <span>Associated with Qualifiers</span>
              <QualifierMultiSelect
                options={qualifierOptions}
                value={draft.qualifiers}
                disabled={readOnly || draft.isDefault}
                onChange={(qualifiers) => setDraft((current) => ({ ...current, qualifiers }))}
              />
              {draft.isDefault ? (
                <small className="auth-help">The default rule applies when no qualifier-specific rule matches.</small>
              ) : null}
            </label>

            <label className="wide-field">
              <span>Tie breakers</span>
              <select
                value={draft.tieBreaker}
                disabled={readOnly}
                onChange={(event) => setDraft((current) => ({ ...current, tieBreaker: event.target.value }))}
              >
                {CALL_SHIFT_TIE_BREAKERS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <footer className="call-shift-rule-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" disabled={!canSave || saving} onClick={onSave}>
            {saving ? "Saving..." : "Save"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function CallShiftRulesPanel({
  rules = [],
  onRulesChange,
  canManage = false,
  onMessage,
  compact = false,
}) {
  const { departmentId } = useTenant();
  const { user, membership } = useAuth();
  const { getOptions } = useDropdowns();
  const [localRules, setLocalRules] = useState(() => normalizeCallShiftRules(rules));
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  const normalizedRules = useMemo(() => normalizeCallShiftRules(localRules), [localRules]);
  const qualifierOptions = useMemo(
    () => getOptions("personnelQualifiers").filter(Boolean),
    [getOptions]
  );

  function openCreate() {
    setDraft(emptyDraft());
    setEditorOpen(true);
  }

  function openEdit(rule) {
    setDraft({ ...rule });
    setEditorOpen(true);
  }

  async function persistRules(nextRules) {
    const normalized = normalizeCallShiftRules(nextRules);
    setLocalRules(normalized);
    onRulesChange?.(normalized);

    if (!departmentId) return normalized;

    setSaving(true);
    try {
      await saveCallShiftRules(departmentId, normalized);
      await writeAuditLog(departmentId, {
        action: "update",
        module: "Scheduling",
        summary: "Updated call shift rules",
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email,
      });
      onMessage?.("Call shift rules saved.");
      return normalized;
    } catch (error) {
      console.error("Failed to save call shift rules", error);
      onMessage?.("Could not save call shift rules.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRule() {
    if (!canManage) return;
    try {
      await persistRules(upsertCallShiftRule(normalizedRules, draft));
      setEditorOpen(false);
    } catch {
      // message handled in persistRules
    }
  }

  async function handleDeleteRule(ruleId) {
    if (!canManage) return;
    const rule = normalizedRules.find((entry) => entry.id === ruleId);
    if (!rule || rule.isDefault) return;
    try {
      await persistRules(removeCallShiftRule(normalizedRules, ruleId));
    } catch {
      // message handled in persistRules
    }
  }

  return (
    <section className={`call-shift-rules-panel${compact ? " is-compact" : ""}`}>
      <header className="call-shift-rules-toolbar">
        <div>
          <strong>Call Shift Rules</strong>
          {!compact ? (
            <p className="auth-help">
              Configure sorting, qualifier matching, global ranking, and tie breakers for automated call shifts.
            </p>
          ) : null}
        </div>
        {canManage ? (
          <button type="button" className="primary-button" onClick={openCreate}>
            <CirclePlus size={14} /> Add Rule
          </button>
        ) : null}
      </header>

      <section className="panel call-shift-rules-table-panel">
        <div className="panel-body">
          <table className="call-shift-rules-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Qualifiers</th>
                <th>Tie breaker</th>
                <th>Last edit</th>
                {canManage ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {normalizedRules.map((rule) => {
                const tieLabel = CALL_SHIFT_TIE_BREAKERS.find((option) => option.value === rule.tieBreaker)?.label || rule.tieBreaker;
                return (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.name}</strong>
                      <div className="call-shift-rule-flags">
                        {rule.isDefault ? <span className="call-shift-rule-flag">Default</span> : null}
                        {rule.useGlobalRanking ? <span className="call-shift-rule-flag">Global ranking</span> : null}
                      </div>
                    </td>
                    <td>{rule.isDefault ? "All qualifiers" : `${rule.qualifiers.length || 0} selected`}</td>
                    <td>{tieLabel}</td>
                    <td>{formatCallShiftRuleUpdatedAt(rule.updatedAt)}</td>
                    {canManage ? (
                      <td>
                        <div className="call-shift-rule-actions">
                          <button type="button" className="text-button" onClick={() => openEdit(rule)}>
                            <Pencil size={13} /> Edit
                          </button>
                          {!rule.isDefault ? (
                            <button type="button" className="text-button" onClick={() => handleDeleteRule(rule.id)}>
                              <Trash2 size={13} /> Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editorOpen ? (
        <CallShiftRuleModal
          draft={draft}
          setDraft={setDraft}
          qualifierOptions={qualifierOptions}
          onClose={() => setEditorOpen(false)}
          onSave={handleSaveRule}
          saving={saving}
          readOnly={!canManage}
        />
      ) : null}
    </section>
  );
}
