/**
 * Department form settings for patient care reports (settings/emsForm, src/lib/pcr/pcrForm.js): rename fields,
 * add help, choose and order the drop-down choices, add drop-downs to text fields, set defaults, require fields,
 * hide fields and sections, and switch the AI narrator on. Applied in the RMS editor and in FORGE FIELD.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Eye, EyeOff, Loader2, Search, ShieldCheck, Sparkles, Star } from "lucide-react";
import { PCR_SECTIONS } from "../../lib/nemsis/pcrModel.js";
import { formFieldIndex, mustShow, normalizePcrForm, sectionCanHide, setFieldSetting } from "../../lib/pcr/pcrForm.js";

export default function PcrFormSettings({ schema, initial, onSave, onClose }) {
  const [form, setForm] = useState(() => normalizePcrForm(initial));
  const [sectionId, setSectionId] = useState("dispatch");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const index = useMemo(() => formFieldIndex(schema), [schema]);

  const change = (next) => {
    setForm(next);
    setDirty(true);
  };
  const setField = (el, patch) => change(setFieldSetting(form, el, patch));

  const term = query.trim().toLowerCase();
  const entries = useMemo(() => [...index.values()].filter((entry) => (term
    ? `${entry.field.label} ${entry.field.el} ${form.fields[entry.field.el]?.label || ""}`.toLowerCase().includes(term)
    : entry.sectionId === sectionId)), [index, term, sectionId, form.fields]);
  const customizedCount = (id) => [...index.values()].filter((e) => e.sectionId === id && form.fields[e.field.el]).length;
  const sectionHidden = Boolean(form.sections[sectionId]?.hidden);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      setDirty(false);
    } catch (err) {
      setError(err?.code?.includes?.("permission") ? "Only administrators can change the form." : "The form settings couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nr-editor pcr-settings">
      <header className="nr-editor-head">
        <button type="button" className="nr-btn nr-btn-ghost" onClick={onClose}><ArrowLeft size={16} /> All reports</button>
        <div className="nr-editor-title">
          <h1>Patient care report form</h1>
          <p><span>Your department's wording, drop-downs, defaults and required fields. Used here and in FORGE FIELD.</span></p>
        </div>
        <div className="nr-editor-status">
          {dirty ? <span className="nr-saved">Unsaved changes</span> : null}
          <button type="button" className="nr-btn nr-btn-primary" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 size={15} className="nr-spin" /> : <Check size={15} />} Save form
          </button>
        </div>
      </header>
      {error ? <p className="nr-error" role="alert">{error}</p> : null}

      <section className="nr-section pcr-ai-setting">
        <header>
          <div className="nr-section-title">
            <span className="nr-section-icon"><Sparkles size={16} /></span>
            <div>
              <h3>AI narrator</h3>
              <p>
                Lets crews draft the narrative with AI. Only de-identified clinical details are sent to the AI service: coded
                findings, vital signs, medications, procedures, clock times, age and sex. Never names, dates of birth,
                addresses, phone numbers, record numbers or dates. Crew notes are scrubbed of names after words like
                "patient", phone numbers and dates of birth. Check with your privacy officer before switching it on.
              </p>
            </div>
          </div>
          <label className="pcr-switch">
            <input type="checkbox" checked={form.aiNarrative} onChange={(e) => change({ ...form, aiNarrative: e.target.checked })} />
            <span>{form.aiNarrative ? "On" : "Off"}</span>
          </label>
        </header>
      </section>

      <div className="pcr-settings-body">
        <nav className="pcr-settings-nav" aria-label="Sections">
          <label className="nr-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a field…" aria-label="Find a field" />
          </label>
          {PCR_SECTIONS.map((section) => {
            const hidden = form.sections[section.id]?.hidden;
            const n = customizedCount(section.id);
            return (
              <button key={section.id} type="button" className={`pcr-settings-section${section.id === sectionId && !term ? " active" : ""}${hidden ? " is-hidden" : ""}`} onClick={() => { setSectionId(section.id); setQuery(""); }}>
                <span>{section.label}</span>
                {hidden ? <EyeOff size={14} aria-label="Hidden" /> : n ? <span className="nr-count-badge">{n}</span> : null}
              </button>
            );
          })}
        </nav>

        <section className="nr-section pcr-settings-fields">
          <header>
            <div className="nr-section-title">
              <div>
                <h3>{term ? `Fields matching "${query}"` : PCR_SECTIONS.find((s) => s.id === sectionId)?.label}</h3>
                <p>{entries.length} field{entries.length === 1 ? "" : "s"}. NEMSIS Mandatory and Required fields can't be hidden.</p>
              </div>
            </div>
            {!term ? (
              <button
                type="button"
                className="nr-btn nr-btn-ghost"
                disabled={!sectionCanHide(schema, sectionId)}
                title={sectionCanHide(schema, sectionId) ? "" : "This section has NEMSIS required fields"}
                onClick={() => change(normalizePcrForm({ ...form, sections: { ...form.sections, [sectionId]: { hidden: !sectionHidden } } }))}
              >
                {sectionHidden ? <><Eye size={15} /> Show this section</> : <><EyeOff size={15} /> Hide this section</>}
              </button>
            ) : null}
          </header>
          <ul className="pcr-settings-list">
            {entries.map((entry) => (
              <FieldSettings
                key={entry.field.el}
                entry={entry}
                cfg={form.fields[entry.field.el] || {}}
                open={open === entry.field.el}
                onToggle={() => setOpen(open === entry.field.el ? "" : entry.field.el)}
                onChange={(patch) => setField(entry.field.el, patch)}
                showSection={Boolean(term)}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function FieldSettings({ entry, cfg, open, onToggle, onChange, showSection }) {
  const { field, inRepeat, groups } = entry;
  const required = mustShow(field);
  const textKind = (field.kind === "text" || field.kind === "textarea") && !field.repeating;
  const summary = [
    cfg.label && "renamed",
    cfg.hidden && "hidden",
    cfg.required && "required",
    cfg.defaultValue && "default",
    cfg.options?.length && `${cfg.options.length} of ${field.options?.length} choices`,
    cfg.pinned?.length && `${cfg.pinned.length} pinned`,
    cfg.choices?.length && `${cfg.choices.length} drop-down choices`,
  ].filter(Boolean);
  return (
    <li className={`pcr-setting${cfg.hidden ? " is-hidden" : ""}`}>
      <button type="button" className="pcr-setting-head" onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="pcr-setting-name">
          <strong>{cfg.label || field.label}</strong>
          <small>
            {field.el}{cfg.label ? ` · NEMSIS: ${field.label}` : ""}{groups.length ? ` · in ${groups.join(" › ")}` : ""}
            {showSection ? ` · ${PCR_SECTIONS.find((s) => s.id === entry.sectionId)?.label}` : ""}
          </small>
        </span>
        <span className={`nr-pill${required ? " nr-pill-ok" : ""}`}>{required ? <><ShieldCheck size={11} /> NEMSIS {field.usage}</> : field.usage}</span>
        {summary.length ? <span className="nr-pill nr-pill-warn">{summary.join(" · ")}</span> : null}
      </button>
      {open ? (
        <div className="pcr-setting-body nr-grid">
          <div className="nr-field">
            <span className="nr-label">Label on the form</span>
            <input className="nr-input" value={cfg.label || ""} placeholder={field.label} maxLength={80} onChange={(e) => onChange({ label: e.target.value })} />
          </div>
          <div className="nr-field">
            <span className="nr-label">Help text</span>
            <input className="nr-input" value={cfg.help || ""} placeholder="Shown under the field" maxLength={300} onChange={(e) => onChange({ help: e.target.value })} />
          </div>
          <div className="nr-field">
            <span className="nr-label">Default on new reports</span>
            {field.options && !field.repeating ? (
              <select className="nr-input" value={cfg.defaultValue || ""} disabled={inRepeat} onChange={(e) => onChange({ defaultValue: e.target.value })}>
                <option value="">No default</option>
                {field.options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            ) : (
              <input className="nr-input" value={cfg.defaultValue || ""} disabled={inRepeat || field.kind === "datetime" || field.kind === "file"} placeholder={inRepeat ? "Not for repeating rows" : "No default"} onChange={(e) => onChange({ defaultValue: e.target.value })} />
            )}
          </div>
          <div className="nr-field pcr-setting-toggles">
            <span className="nr-label">On the form</span>
            <label className="pcr-check">
              <input type="checkbox" checked={Boolean(cfg.required)} disabled={required || inRepeat} onChange={(e) => onChange({ required: e.target.checked })} />
              <span>Required by the department{required ? " (NEMSIS already requires it)" : inRepeat ? " (not for repeating rows)" : ""}</span>
            </label>
            <label className="pcr-check">
              <input type="checkbox" checked={Boolean(cfg.hidden)} disabled={required} onChange={(e) => onChange({ hidden: e.target.checked })} />
              <span>Hide this field{required ? " (NEMSIS requires it)" : ""}</span>
            </label>
          </div>
          {field.options ? <OptionsEditor field={field} cfg={cfg} onChange={onChange} /> : null}
          {textKind ? (
            <div className="nr-field nr-wide">
              <span className="nr-label">Drop-down choices</span>
              <textarea
                className="nr-input nr-textarea"
                rows={4}
                value={(cfg.choices || []).join("\n")}
                placeholder={"One per line, e.g.\nRiverside Regional Medical Center\nSt. Mary's Hospital"}
                onChange={(e) => onChange({ choices: e.target.value.split("\n") })}
              />
              <small className="nr-help">Crews pick from these or type something else.</small>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function OptionsEditor({ field, cfg, onChange }) {
  const [filter, setFilter] = useState("");
  const allowed = cfg.options?.length ? new Set(cfg.options) : null;
  const pinned = new Set(cfg.pinned || []);
  const all = field.options;
  const term = filter.trim().toLowerCase();
  const shown = term ? all.filter((o) => `${o.label} ${o.code}`.toLowerCase().includes(term)) : all;
  const toggle = (code) => {
    const current = allowed ? [...allowed] : all.map((o) => o.code);
    const next = current.includes(code) ? current.filter((c) => c !== code) : all.map((o) => o.code).filter((c) => c === code || current.includes(c));
    onChange({ options: next.length === all.length ? [] : next, pinned: (cfg.pinned || []).filter((c) => next.includes(c)) });
  };
  const togglePin = (code) => onChange({ pinned: pinned.has(code) ? [...pinned].filter((c) => c !== code) : [...pinned, code] });
  return (
    <div className="nr-field nr-wide">
      <span className="nr-label">Drop-down choices ({allowed ? allowed.size : all.length} of {all.length} offered)</span>
      <div className="pcr-options-tools">
        <label className="nr-search">
          <Search size={14} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a choice…" aria-label="Find a choice" />
        </label>
        <button type="button" className="nr-btn nr-btn-ghost nr-small" onClick={() => onChange({ options: [] })} disabled={!allowed}>Offer all</button>
        <button type="button" className="nr-btn nr-btn-ghost nr-small" onClick={() => onChange({ options: (cfg.pinned || []).length ? [...cfg.pinned] : [all[0].code] })}>Offer only pinned</button>
      </div>
      <ul className="pcr-options">
        {shown.slice(0, 400).map((o) => {
          const on = !allowed || allowed.has(o.code);
          return (
            <li key={o.code} className={on ? "" : "is-off"}>
              <label className="pcr-check">
                <input type="checkbox" checked={on} onChange={() => toggle(o.code)} />
                <span>{o.label} <small>{o.code}</small></span>
              </label>
              <button type="button" className={`nr-icon-btn pcr-pin${pinned.has(o.code) ? " on" : ""}`} disabled={!on} aria-pressed={pinned.has(o.code)} title={pinned.has(o.code) ? "Unpin" : "Pin to the top"} onClick={() => togglePin(o.code)}>
                <Star size={14} />
              </button>
            </li>
          );
        })}
        {shown.length > 400 ? <li className="nr-muted">{shown.length - 400} more: search to find them.</li> : null}
      </ul>
      <small className="nr-help">Unticked choices aren't offered on new charts. Pinned choices are listed first, under "Common".</small>
    </div>
  );
}
