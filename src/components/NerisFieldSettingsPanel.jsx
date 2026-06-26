import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Flame, Plus, Save, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { writeAuditLog } from "../lib/auditService.js";
import {
  NERIS_FORM_MODULES,
  getFillableFields,
  humanizeFieldName,
} from "../lib/nerisSchema.js";
import {
  NERIS_INPUT_MODES,
  buildFieldConfigKey,
  getSchemaDefaultInputMode,
  isFieldInputModeConfigurable,
  normalizeCustomOptions,
  normalizeNerisFieldConfig,
  slugifyOptionValue,
} from "../lib/neris/fieldConfig.js";
import { saveNerisFieldConfig } from "../lib/nerisFieldConfigService.js";

const ADMIN_MODE_OPTIONS = [
  { value: "default", label: "Schema default" },
  { value: NERIS_INPUT_MODES.DROPDOWN, label: "Dropdown" },
  { value: NERIS_INPUT_MODES.FREETEXT, label: "Free text" },
];

function resolveAdminMode(fieldConfig, fieldKey) {
  const entry = fieldConfig[fieldKey];
  if (!entry?.inputMode) return "default";
  return entry.inputMode;
}

function fieldShowsDropdownEditor(adminMode, schemaDefault) {
  return adminMode === NERIS_INPUT_MODES.DROPDOWN
    || (adminMode === "default" && schemaDefault === NERIS_INPUT_MODES.DROPDOWN);
}

/**
 * @param {{
 *   options: Array<{ value: string, label: string }>,
 *   schemaOptionCount: number,
 *   appendToSchema: boolean,
 *   disabled?: boolean,
 *   onChange: (options: Array<{ value: string, label: string }>) => void,
 *   onAppendToSchemaChange: (append: boolean) => void,
 * }} props
 */
function DropdownOptionsEditor({
  options,
  schemaOptionCount,
  appendToSchema,
  disabled = false,
  onChange,
  onAppendToSchemaChange,
}) {
  const [newLabel, setNewLabel] = useState("");

  function addOption() {
    const label = newLabel.trim();
    if (!label) return;
    const value = slugifyOptionValue(label);
    if (!value) return;
    if (options.some((opt) => opt.value === value)) return;
    onChange([...options, { value, label }]);
    setNewLabel("");
  }

  function removeOption(index) {
    onChange(options.filter((_, i) => i !== index));
  }

  function moveOption(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= options.length) return;
    const next = [...options];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  }

  return (
    <div className="neris-dropdown-options-editor">
      <div className="neris-dropdown-options-header">
        <strong>Dropdown options</strong>
        {schemaOptionCount > 0 ? (
          <label className="permission-toggle permission-check neris-append-schema-toggle">
            <input
              type="checkbox"
              checked={appendToSchema}
              disabled={disabled}
              onChange={(event) => onAppendToSchemaChange(event.target.checked)}
            />
            <span>
              Include NERIS schema options
              <small>{schemaOptionCount} from value set</small>
            </span>
          </label>
        ) : (
          <span className="auth-help">No NERIS value set — custom options only.</span>
        )}
      </div>

      {options.length ? (
        <ul className="neris-dropdown-options-list">
          {options.map((opt, index) => (
            <li key={`${opt.value}-${index}`}>
              <span className="neris-dropdown-option-label">{opt.label}</span>
              <code className="neris-dropdown-option-value">{opt.value}</code>
              <div className="neris-dropdown-option-actions">
                <button
                  type="button"
                  className="ghost-button icon-button"
                  disabled={disabled || index === 0}
                  onClick={() => moveOption(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  className="ghost-button icon-button"
                  disabled={disabled || index === options.length - 1}
                  onClick={() => moveOption(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className="ghost-button icon-button danger"
                  disabled={disabled}
                  onClick={() => removeOption(index)}
                  aria-label="Remove option"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="auth-help">No custom options yet. Add labels below.</p>
      )}

      <div className="neris-dropdown-options-add">
        <input
          type="text"
          value={newLabel}
          disabled={disabled}
          placeholder="New option label…"
          onChange={(event) => setNewLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addOption();
            }
          }}
        />
        <button
          type="button"
          className="ghost-button"
          disabled={disabled || !newLabel.trim()}
          onClick={addOption}
        >
          <Plus size={14} />
          Add option
        </button>
      </div>
    </div>
  );
}

export default function NerisFieldSettingsPanel({ onMessage, canConfigure = false }) {
  const { departmentId, settings, refreshDepartment } = useTenant();
  const { user, membership } = useAuth();
  const [fieldConfig, setFieldConfig] = useState({});
  const [activeModuleId, setActiveModuleId] = useState(NERIS_FORM_MODULES[0]?.id || "");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFieldConfig(normalizeNerisFieldConfig(settings?.nerisFieldConfig));
  }, [settings?.nerisFieldConfig, departmentId]);

  const moduleFields = useMemo(() => {
    const fields = getFillableFields(activeModuleId).map((field) => ({
      ...field,
      moduleId: activeModuleId,
    }));
    const term = search.trim().toLowerCase();
    if (!term) return fields;
    return fields.filter((field) => (
      field.name.toLowerCase().includes(term)
      || field.label.toLowerCase().includes(term)
      || String(field.group || "").toLowerCase().includes(term)
    ));
  }, [activeModuleId, search]);

  const configurableFields = useMemo(
    () => moduleFields.filter((field) => isFieldInputModeConfigurable(field)),
    [moduleFields],
  );

  function setFieldAdminMode(fieldKey, mode) {
    setFieldConfig((current) => {
      const next = { ...current };
      if (mode === "default") {
        delete next[fieldKey];
        return next;
      }
      next[fieldKey] = {
        ...next[fieldKey],
        inputMode: mode,
      };
      return next;
    });
  }

  function setFieldAllowToggle(fieldKey, allowToggle) {
    setFieldConfig((current) => {
      const next = { ...current };
      const existing = next[fieldKey];
      if (!existing?.inputMode) return current;
      next[fieldKey] = {
        ...existing,
        allowToggle,
      };
      return next;
    });
  }

  function setFieldCustomOptions(fieldKey, schemaDefault, customOptions) {
    setFieldConfig((current) => {
      const next = { ...current };
      const normalized = normalizeCustomOptions(customOptions);
      let entry = next[fieldKey];

      if (!entry?.inputMode) {
        if (!normalized.length) return current;
        next[fieldKey] = { inputMode: NERIS_INPUT_MODES.DROPDOWN };
        entry = next[fieldKey];
      }

      const updated = { ...entry };
      if (normalized.length) {
        updated.customOptions = normalized;
      } else {
        delete updated.customOptions;
      }
      if (!updated.customOptions && !updated.allowToggle) {
        if (updated.inputMode === schemaDefault) {
          delete next[fieldKey];
          return next;
        }
      }
      next[fieldKey] = updated;
      return next;
    });
  }

  function setFieldAppendToSchema(fieldKey, schemaDefault, appendToSchema) {
    setFieldConfig((current) => {
      const next = { ...current };
      let entry = next[fieldKey];
      if (!entry?.inputMode) {
        next[fieldKey] = { inputMode: NERIS_INPUT_MODES.DROPDOWN };
        entry = next[fieldKey];
      }
      const updated = { ...entry };
      if (appendToSchema) {
        delete updated.appendToSchema;
      } else {
        updated.appendToSchema = false;
      }
      next[fieldKey] = updated;
      return next;
    });
  }

  async function handleSave() {
    if (!canConfigure || !departmentId) return;

    setSaving(true);
    try {
      await saveNerisFieldConfig(departmentId, fieldConfig, settings || {});
      await writeAuditLog(departmentId, {
        action: "update",
        module: "System Admin",
        summary: "Updated NERIS field input mode settings",
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email,
      });
      await refreshDepartment?.();
      onMessage?.("NERIS field settings saved");
    } catch (error) {
      console.error("Failed to save NERIS field settings", error);
      onMessage?.("Save failed — check permissions and try again");
    } finally {
      setSaving(false);
    }
  }

  const activeModule = NERIS_FORM_MODULES.find((module) => module.id === activeModuleId);

  return (
    <section className="neris-field-settings-panel">
      <div className="neris-field-settings-intro">
        <Flame size={16} aria-hidden="true" />
        <div>
          <strong>NERIS Field Settings</strong>
          <p className="auth-help">
            Choose whether each NERIS module field uses a searchable dropdown or free text.
            For dropdown fields, add custom options that merge with the NERIS value set.
            Schema defaults apply when no override is set. Existing report values are unchanged.
          </p>
        </div>
      </div>

      <div className="neris-field-settings-toolbar">
        <div className="segmented-control admin-filter-control" role="tablist" aria-label="NERIS modules">
          {NERIS_FORM_MODULES.map((module) => (
            <button
              key={module.id}
              type="button"
              role="tab"
              aria-selected={activeModuleId === module.id}
              className={activeModuleId === module.id ? "active" : ""}
              onClick={() => setActiveModuleId(module.id)}
            >
              {module.label}
            </button>
          ))}
        </div>
        <label className="neris-field-settings-search">
          <span className="sr-only">Search fields</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search fields…"
            disabled={!canConfigure}
          />
        </label>
      </div>

      {activeModule ? (
        <p className="auth-help">{activeModule.description}</p>
      ) : null}

      <div className="neris-field-settings-table" role="table" aria-label="NERIS field input modes">
        <div className="neris-field-settings-row neris-field-settings-head" role="row">
          <span role="columnheader">Field</span>
          <span role="columnheader">Group</span>
          <span role="columnheader">Schema default</span>
          <span role="columnheader">Input mode</span>
          <span role="columnheader">Officer toggle</span>
        </div>
        {configurableFields.map((field) => {
          const fieldKey = buildFieldConfigKey(activeModuleId, field.name);
          const schemaDefault = getSchemaDefaultInputMode(field);
          const adminMode = resolveAdminMode(fieldConfig, fieldKey);
          const hasOverride = adminMode !== "default";
          const showOptionsEditor = fieldShowsDropdownEditor(adminMode, schemaDefault);
          const customOptions = fieldConfig[fieldKey]?.customOptions || [];
          const appendToSchema = fieldConfig[fieldKey]?.appendToSchema !== false;

          return (
            <div className="neris-field-settings-field-block" key={fieldKey}>
              <div className="neris-field-settings-row" role="row">
                <span role="cell">
                  <strong>{field.label}</strong>
                  <small>{field.name}</small>
                </span>
                <span role="cell">{humanizeFieldName(field.group || "general")}</span>
                <span role="cell">
                  <span className={`neris-mode-pill neris-mode-pill-${schemaDefault}`}>
                    {schemaDefault === NERIS_INPUT_MODES.DROPDOWN ? "Dropdown" : "Free text"}
                  </span>
                </span>
                <span role="cell">
                  <div className="segmented-control neris-field-mode-control">
                    {ADMIN_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={adminMode === option.value ? "active" : ""}
                        disabled={!canConfigure}
                        onClick={() => setFieldAdminMode(fieldKey, option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </span>
                <span role="cell">
                  <label className="permission-toggle permission-check">
                    <input
                      type="checkbox"
                      checked={Boolean(fieldConfig[fieldKey]?.allowToggle)}
                      disabled={!canConfigure || !hasOverride}
                      onChange={(event) => setFieldAllowToggle(fieldKey, event.target.checked)}
                    />
                    <span>Allow in-report switch</span>
                  </label>
                </span>
              </div>
              {showOptionsEditor ? (
                <DropdownOptionsEditor
                  options={customOptions}
                  schemaOptionCount={field.options?.length || 0}
                  appendToSchema={appendToSchema}
                  disabled={!canConfigure}
                  onChange={(options) => setFieldCustomOptions(fieldKey, schemaDefault, options)}
                  onAppendToSchemaChange={(append) => setFieldAppendToSchema(fieldKey, schemaDefault, append)}
                />
              ) : null}
            </div>
          );
        })}
        {!configurableFields.length ? (
          <p className="empty-table">No configurable fields match this filter.</p>
        ) : null}
      </div>

      <div className="modal-actions">
        <button
          type="button"
          className="primary-button"
          onClick={handleSave}
          disabled={!canConfigure || saving}
        >
          {saving ? <Save size={14} /> : <Check size={14} />}
          {saving ? "Saving…" : "Save NERIS Field Settings"}
        </button>
      </div>
    </section>
  );
}
